"""Command-line entry point, also used by GitHub Actions."""
import argparse
from pathlib import Path
from engine import render

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', required=True)
    parser.add_argument('--lyrics', required=True)
    parser.add_argument('--output', default='output')
    parser.add_argument('--format', choices=['square','portrait','landscape'], default='square')
    parser.add_argument('--shift', type=float, default=0)
    args = parser.parse_args()
    folder = Path(args.output).resolve(); folder.mkdir(parents=True, exist_ok=True)
    result = render(Path(args.audio).resolve(), Path(args.lyrics).read_text(encoding='utf-8-sig'),
                    {'format':args.format,'shift':args.shift}, folder)
    print(result)
