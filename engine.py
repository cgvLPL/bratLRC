"""LRC parsing and deterministic word-build video rendering."""
import bisect
import json
import math
import os
from pathlib import Path
import re
import subprocess
from PIL import Image, ImageDraw, ImageFont

STAMP = r'(\d+):([0-5]\d)(?:\.(\d{1,3}))?'
LINE = re.compile(r'\[' + STAMP + r'\]')
WORD = re.compile(r'<' + STAMP + r'>')
SIZES = {'square': (1080, 1080), 'portrait': (1080, 1920), 'landscape': (1920, 1080)}


def seconds(match):
    return int(match[1])*60 + int(match[2]) + float('0.' + (match[3] or '0'))


def parse_lrc(text, duration, shift=0):
    offset = re.search(r'\[offset:([+-]?\d+)\]', text, re.I)
    shift += int(offset[1])/1000 if offset else 0
    rows = []
    for raw in text.lstrip('\ufeff').splitlines():
        stamps = list(LINE.finditer(raw))
        if not stamps:
            continue
        content = raw[stamps[-1].end():].strip()
        for stamp in stamps:
            rows.append((seconds(stamp) + shift, content))
    rows.sort(key=lambda row: row[0])
    if not rows or not any(content for _, content in rows):
        raise ValueError('No timed lyrics found. Use [00:01.50]Your lyric here.')
    if len(rows) > 3000:
        raise ValueError('Maximum 3,000 lyric lines.')
    events = {0.0: []}
    for i, (start, content) in enumerate(rows):
        end = rows[i+1][0] if i+1 < len(rows) else duration
        if start >= duration or end <= 0 or end <= start:
            continue
        events[max(0, start)] = []
        markers = list(WORD.finditer(content))
        timed = []
        if markers:
            prefix = content[:markers[0].start()].strip()
            if prefix:
                timed.append((start, prefix))
            for j, marker in enumerate(markers):
                token = content[marker.end():markers[j+1].start() if j+1 < len(markers) else len(content)].strip()
                if token:
                    when = seconds(marker) + shift
                    if when < start or when >= end:
                        raise ValueError('Word timestamps must fall inside their lyric line.')
                    timed.append((when, token))
            if timed != sorted(timed, key=lambda x:x[0]):
                raise ValueError('Word timestamps must be in increasing order.')
        else:
            words = content.split()
            # Leave a short hold at the end of a line; this is an estimate, not alignment.
            interval = min(end-start, max(.1, (end-start)*.85))/max(1, len(words))
            timed = [(start+j*interval, word) for j, word in enumerate(words)]
        visible = []
        for when, token in timed:
            visible.extend(token.split())
            if when < duration:
                events[max(0, when)] = visible.copy()
    if not any(events.values()):
        raise ValueError('No lyrics overlap the audio. Check timestamps and timing shift.')
    if sum(len(v) for v in events.values()) > 150000:
        raise ValueError('Lyrics are too large; split the track into shorter sections.')
    return sorted(events.items())


def get_font(size):
    candidates = [os.environ.get('LYRIC_FONT'), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                  '/System/Library/Fonts/Helvetica.ttc', 'C:/Windows/Fonts/arial.ttf']
    for path in candidates:
        if path and Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def draw_frame(words, size, font_size=88, foreground='#111111', background='#ffffff'):
    w, h = size
    image = Image.new('RGB', size, background)
    draw = ImageDraw.Draw(image)
    # Reference placement: upper-middle, left aligned, with generous margins.
    max_width, max_height = w*.60, h*.56
    fs = round(font_size * w/1080)
    while True:
        font = get_font(fs)
        gap = fs*.75
        rows, row, x = [], [], 0
        for word in words:
            # Break unusually long tokens so they cannot escape the canvas.
            chunks, chunk = [], ''
            for char in word:
                if chunk and draw.textlength(chunk+char, font=font) > max_width:
                    chunks.append(chunk); chunk = ''
                chunk += char
            if chunk: chunks.append(chunk)
            for chunk in chunks:
                width = draw.textlength(chunk, font=font)
                if row and x+width > max_width:
                    rows.append(row); row, x = [], 0
                row.append((x, chunk)); x += width+gap
        if row: rows.append(row)
        if len(rows)*fs*1.35 <= max_height or fs <= 14:
            break
        fs -= 2
    for j, row in enumerate(rows):
        for x, word in row:
            draw.text((w*.20+x, h*.30+j*fs*1.35), word, font=font, fill=foreground, anchor='lt')
    return image


def probe(audio):
    result = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type',
                             '-of','json',str(audio)], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('The audio file could not be decoded.')
    info = json.loads(result.stdout)
    duration = float(info.get('format', {}).get('duration', 0))
    if not math.isfinite(duration) or not 0 < duration <= 1200 or not any(s['codec_type']=='audio' for s in info.get('streams', [])):
        raise ValueError('Upload an audio track between 0 and 20 minutes.')
    return duration


def render(audio, text, options, folder, progress=lambda value: None):
    duration = probe(audio)
    events = parse_lrc(text, duration, options.get('shift', 0))
    folder = Path(folder)
    size = SIZES[options.get('format', 'square')]
    listing = ['ffconcat version 1.0']
    for i, (start, words) in enumerate(events):
        name = f'frame-{i:05d}.png'
        draw_frame(words, size, options.get('font_size', 88), options.get('foreground', '#111111'),
                   options.get('background', '#ffffff')).save(folder/name)
        end = events[i+1][0] if i+1 < len(events) else duration
        listing.extend([f"file '{name}'", 'option framerate 30', f'duration {end-start:.8f}'])
        progress(round(40*(i+1)/len(events)))
    listing.extend([f"file 'frame-{len(events)-1:05d}.png'", 'option framerate 30'])
    (folder/'frames.txt').write_text('\n'.join(listing)+'\n')
    output = folder/'lyrics.mp4'
    command = ['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(folder/'frames.txt'),
               '-i',str(audio),'-map','0:v:0','-map','1:a:0','-t',str(duration),'-vf','fps=30',
               '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac',
               '-b:a','192k','-movflags','+faststart','-progress','pipe:1',str(output)]
    with open(folder/'ffmpeg.log', 'w') as error:
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=error, text=True) as proc:
            for line in proc.stdout:
                if line.startswith('out_time_us='):
                    try: progress(min(99, 40+int(int(line.split('=')[1])/1e6/duration*59)))
                    except ValueError: pass
            if proc.wait():
                raise ValueError('Video encoding failed. See the local ffmpeg.log for details.')
    for frame in folder.glob('frame-*.png'): frame.unlink()
    progress(100)
    return output
