# bratLRC

<p align="center">
  <img src="static/bratlrc-logo.png" alt="bratLRC — acid-green lettering with rough oval rings on black" width="720">
</p>

MP3 + synced LRC → a minimal, word-build lyric video inspired by the supplied reference. Black text, white background, generous spacing, and a fresh phrase on every lyric line. Exports an H.264/AAC MP4 at 30 FPS. Square 1080×1080, portrait 1080×1920, and landscape 1920×1080.

## Use entirely on GitHub (no installation)

1. Open `media` in the repository and choose **Add file → Upload files**.
2. Upload both files together, named **track.mp3** and **lyrics.lrc**, and commit. The GitHub web uploader has a per-file size limit; larger MP3s can be pushed with Git (`git add -f media/track.mp3`).
3. Open **Actions → Render lyric video**. A render starts automatically when files in `media/` change.
4. Open the successful run and download **lyric-video** under **Artifacts**. Unzip it to get `lyrics.mp4`.

To choose portrait/landscape, different filenames, or a timing shift, open **Actions → Render lyric video → Run workflow**. Audio and lyrics must already be committed in the repository. Artifacts are kept for seven days. GitHub Actions usage counts toward your account's runner allowance. A missing source file fails the run with an error; upload both before rendering. Add `[skip render]` to a media commit message to skip the automatic render.

This is a repository app with an Actions renderer and an optional local upload interface. It does not deploy a public website or register a GitHub OAuth App. GitHub Pages cannot run the Python/FFmpeg backend.

## Local upload interface

Install Python 3.11+ and FFmpeg (both `ffmpeg` and `ffprobe` must be on PATH).

```bash
python -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell instead:
# .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open **http://localhost:8000**, choose your MP3 and LRC, adjust the style, then generate and download. Install FFmpeg using your OS package manager, e.g. `brew install ffmpeg` or `sudo apt install ffmpeg fonts-dejavu-core`. Windows users can install an FFmpeg build and add its `bin` folder to PATH.

The local interface listens only on loopback and is for one user. It is not a production hosting server. Maximum upload: 100 MB; maximum audio duration: 20 minutes. Temporary audio is deleted after rendering, generated files on normal shutdown, and only the five newest jobs are retained per session. Download before stopping the server. Force-killing Python can leave its temporary directory behind.

## Timing

Standard LRC (each line clears the previous phrase):

```text
[00:01.50]let the words
[00:04.20]come to life
[00:07.00]
```

Words are distributed through 85% of the line interval; this is estimated timing, not vocal recognition. Blank timed lines clear the canvas. The final line lasts until the audio ends; add a final blank timestamp to end it sooner. Multiple line timestamps and `[offset:100]` (milliseconds) are supported. Positive offsets and timing shifts delay lyrics.

Enhanced LRC provides exact word entrances:

```text
[00:01.50]<00:01.50>let <00:02.00>the <00:02.60>words
[00:04.20]<00:04.20>come <00:04.80>to <00:05.40>life
[00:07.00]
```

Save LRC as UTF-8. Word timestamps must be chronological and inside their line interval. Video timing is quantized to 30 FPS. The style preview uses sample words, while the exported file uses your lyrics. The reference's watermark and exact custom edits are not reproduced. Font coverage depends on your system; set `LYRIC_FONT` to a TTF/OTF file for additional scripts.

## Command line

```bash
python render.py --audio media/track.mp3 --lyrics media/lyrics.lrc --format square
python -m unittest discover -s tests -v
```

Output: `output/lyrics.mp4`. The test suite covers timestamps, offsets, invalid input, and a real FFmpeg render with audio and dimension checks.

Implementation: Python, Pillow, and FFmpeg. [FFmpeg concat documentation](https://ffmpeg.org/ffmpeg-formats.html#concat) describes the timed-image input used by the renderer. [Python HTTP server documentation](https://docs.python.org/3/library/http.server.html) explains the local server's hosting limitations.
