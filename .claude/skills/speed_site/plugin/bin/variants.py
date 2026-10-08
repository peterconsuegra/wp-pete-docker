#!/usr/bin/env python3
"""Smaller copies of the theme's big photos, for srcset and later video posters (__NAME__).

  python3 bin/variants.py [theme_dir]      (default __THEME_DIR__)

Writes assets/img/<name>-<width>.webp (WebP quality 82, method 6: the theme's own settings) and
assets/img/variants.json, which the plugin reads. The theme's file stays the largest candidate.
WIDTHS came from /speed_site's imgwidths.mjs on __DATE__: copy widths below each photo's own width, up
to twice its widest place on the site. Run it again when one of these photos changes in the theme.
It needs a Python with Pillow.
"""
import json, pathlib, sys
from PIL import Image

PLUGIN = pathlib.Path(__file__).resolve().parent.parent
THEME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '__THEME_DIR__').expanduser()
WIDTHS = __WIDTHS__

out = {}
(PLUGIN / 'assets/img').mkdir(parents=True, exist_ok=True)
for rel, widths in WIDTHS.items():
    src = THEME / rel
    with Image.open(src) as im:
        im.load()
        entry = {'w': im.width, 'h': im.height, 'variants': []}
        for w in widths:
            if w >= im.width:
                continue
            h = round(im.height * w / im.width)
            name = f'{src.stem}-{w}.webp'
            im.resize((w, h), Image.LANCZOS).save(PLUGIN / 'assets/img' / name, 'WEBP', quality=82, method=6)
            entry['variants'].append([name, w, h])
            print(f'{name:40s} {w}x{h}  {(PLUGIN / "assets/img" / name).stat().st_size // 1024} KB   (original {im.width}x{im.height} {src.stat().st_size // 1024} KB)')
    out[rel] = entry
(PLUGIN / 'assets/img/variants.json').write_text(json.dumps(out, indent=1) + '\n')
print(f'wrote assets/img/variants.json ({len(out)} photos)')
