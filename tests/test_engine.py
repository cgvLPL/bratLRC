import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from engine import parse_lrc, render

class LyricsTests(unittest.TestCase):
    def test_fraction_repeat_and_offset(self):
        events = parse_lrc('[offset:100]\n[00:01.5][00:03.050]hello world', 5)
        self.assertIn((1.6, ['hello']), events)
        self.assertIn((3.15, ['hello']), events)

    def test_common_line_synced_formats(self):
        events = parse_lrc('[00:15.24] first line\n[00:21,38] second line\n[00:27:85] third line\n[00:35.30] ', 40)
        self.assertIn((15.24, ['first']), events)
        self.assertIn((21.38, ['second']), events)
        self.assertIn((27.85, ['third']), events)
        self.assertEqual(events[-1], (35.3, []))

    def test_enhanced(self):
        events = parse_lrc('[00:01]<00:01>hello <00:02.5>world\n[00:04]', 5)
        self.assertIn((2.5, ['hello','world']), events)
        self.assertEqual(events[-1], (4, []))

    def test_invalid(self):
        for text in ['untimed words','[00:99]bad','[20:00]late']:
            with self.assertRaises(ValueError): parse_lrc(text, 3)

    def test_negative_shift(self):
        events = parse_lrc('[00:00]one two\n[00:02]three', 4, -1)
        self.assertEqual(events[0][0], 0)
        self.assertIn((1, ['three']), events)

    def test_render_contains_audio_and_exact_dimensions(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp); audio=folder/'tone.mp3'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-y',str(audio)],check=True)
            output=render(audio,'[00:00]hello world\n[00:01]words in motion',{},folder)
            result=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)],capture_output=True,text=True,check=True)
            info=json.loads(result.stdout)
            video=next(s for s in info['streams'] if s['codec_type']=='video')
            self.assertEqual((video['width'],video['height']),(1080,1080))
            self.assertEqual(video['codec_name'],'h264')
            self.assertTrue(any(s['codec_type']=='audio' for s in info['streams']))
            self.assertAlmostEqual(float(info['format']['duration']),2,delta=.15)

if __name__ == '__main__': unittest.main()
