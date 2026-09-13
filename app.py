"""Local, single-user lyric video application. Run: python app.py"""
import argparse
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import shutil
import tempfile
import threading
from urllib.parse import urlparse
from engine import render

ROOT = Path(__file__).resolve().parent
JOBS = {}
LOCK = threading.Lock()
TOKEN = secrets.token_urlsafe(32)
WORK = Path(tempfile.mkdtemp(prefix='lyric-studio-'))


def worker(job, audio, lyrics, options, folder):
    try:
        render(audio, lyrics, options, folder, lambda p: JOBS[job].update(progress=p))
        JOBS[job].update(status='done')
    except Exception as exc:
        JOBS[job].update(status='error', error=str(exc))
    finally:
        audio.unlink(missing_ok=True)
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, data, content_type='application/json'):
        body = json.dumps(data).encode() if content_type == 'application/json' else data
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        return self.headers.get('Host') in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}

    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'Local access only.'})
        path = urlparse(self.path).path
        if path == '/':
            return self.reply(200, (ROOT/'static/index.html').read_bytes().replace(b'__TOKEN__', TOKEN.encode()), 'text/html; charset=utf-8')
        if path in ['/app.js','/style.css']:
            return self.reply(200, (ROOT/'static'/path[1:]).read_bytes(), 'text/javascript' if path.endswith('.js') else 'text/css')
        match = re.fullmatch(r'/api/jobs/([a-f0-9]{24})(/download)?', path)
        if match and match[1] in JOBS:
            job = JOBS[match[1]]
            if match[2] and job['status'] == 'done':
                file = WORK/match[1]/'lyrics.mp4'
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Disposition', 'attachment; filename="lyrics.mp4"')
                self.send_header('Content-Length', str(file.stat().st_size))
                self.end_headers()
                with file.open('rb') as stream: shutil.copyfileobj(stream, self.wfile)
                return
            if not match[2]: return self.reply(200, job)
        self.reply(404, {'error':'Not found.'})

    def do_POST(self):
        if not self.allowed_host() or self.headers.get('X-Local-Token') != TOKEN:
            return self.reply(403, {'error':'Reload the app and try again.'})
        if self.path != '/api/render': return self.reply(404, {'error':'Not found.'})
        if not LOCK.acquire(blocking=False): return self.reply(409, {'error':'A video is already rendering.'})
        folder = None
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 100*1024*1024: raise ValueError('Upload limit is 100 MB.')
            kind = self.headers.get('Content-Type','')
            if not kind.startswith('multipart/form-data;'): raise ValueError('Expected file uploads.')
            self.connection.settimeout(120)
            message = BytesParser(policy=default).parsebytes(('Content-Type: '+kind+'\r\n\r\n').encode()+self.rfile.read(length))
            fields = {part.get_param('name', header='content-disposition'): part.get_payload(decode=True) for part in message.iter_parts()}
            if not fields.get('audio') or not fields.get('lyrics'): raise ValueError('Select both an MP3 and an LRC file.')
            if len(fields['lyrics']) > 512000: raise ValueError('LRC files must be smaller than 500 KB.')
            lyrics = fields['lyrics'].decode('utf-8-sig')
            options = json.loads(fields.get('options', b'{}'))
            if options.get('format') not in ['square','portrait','landscape']: raise ValueError('Invalid aspect ratio.')
            for key in ['foreground','background']:
                if not re.fullmatch(r'#[a-fA-F0-9]{6}', options.get(key,'')): raise ValueError('Invalid color.')
            options['font_size'] = int(options.get('font_size',88))
            options['shift'] = float(options.get('shift',0))
            if not 36 <= options['font_size'] <= 160 or not -30 <= options['shift'] <= 30: raise ValueError('Invalid font size or timing shift.')
            # Retain at most five previous jobs during this session.
            while len(JOBS) >= 5:
                old = next(iter(JOBS)); JOBS.pop(old); shutil.rmtree(WORK/old, ignore_errors=True)
            job = secrets.token_hex(12)
            folder = WORK/job; folder.mkdir()
            audio = folder/'audio.mp3'; audio.write_bytes(fields['audio'])
            JOBS[job] = {'status':'rendering', 'progress':0}
            threading.Thread(target=worker, args=(job,audio,lyrics,options,folder), daemon=True).start()
        except Exception as exc:
            if folder: shutil.rmtree(folder, ignore_errors=True)
            LOCK.release()
            return self.reply(400, {'error':str(exc)})
        self.reply(202, {'id':job})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise SystemExit('Install FFmpeg (including ffprobe) and add it to PATH first.')
    print(f'Open http://localhost:{args.port} — press Ctrl+C to stop.', flush=True)
    try: ThreadingHTTPServer(('127.0.0.1',args.port), Handler).serve_forever()
    except KeyboardInterrupt: pass
    finally: shutil.rmtree(WORK, ignore_errors=True)
