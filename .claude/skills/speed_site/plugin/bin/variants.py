#!/usr/bin/env python3
"""Smaller copies of the theme's big photos, for srcset and later video posters (__NAME__).

  python3 bin/variants.py [theme_dir]      (default __THEME_DIR__)

Writes assets/img/<name>-<width>.webp (WebP quality 82, method 6: the theme's own settings) and
assets/img/variants.json, which the plugin reads. The theme's file stays the largest candidate.
WIDTHS came from /speed_site's imgwidths.mjs on __DATE__: copy widths below each photo's own width, up
to twice its widest place on the site. Run it again when one of these photos changes in the theme.
It needs a Python with Pillow.
"""
import json, pathlib, re, sys, urllib.parse
from PIL import Image

PLUGIN = pathlib.Path(__file__).resolve().parent.parent
THEME = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '__THEME_DIR__').expanduser()
WIDTHS = __WIDTHS__


def exact_width(W, H, target):
    """The width within 3% of target whose height (H * w / W) is closest to a whole number: the copy
    keeps the photo's aspect ratio as closely as whole pixels allow (the plugin's ratio rule does the
    rest), so the photo looks the same whichever copy loads."""
    best = None
    for d in range(0, int(target * 0.03) + 1):
        for w in (target - d, target + d):
            if 0 < w < W:
                err = abs(H * w / W - round(H * w / W))
                if best is None or err < best[0] - 1e-9:
                    best = (err, w)
    return best[1] if best else target


out = {}
(PLUGIN / 'assets/img').mkdir(parents=True, exist_ok=True)
for old_copy in (PLUGIN / 'assets/img').glob('*.webp'):
    old_copy.unlink()
for rel, widths in WIDTHS.items():
    # The probes record a photo as its URL path ("Cover%20Slide.webp"): the file has the decoded
    # name, and its copies get a name without spaces, so their URLs need no encoding.
    rel = urllib.parse.unquote(rel)
    src = THEME / rel
    stem = re.sub(r'[^A-Za-z0-9_.-]+', '-', src.stem)
    with Image.open(src) as im:
        im.load()
        entry = {'w': im.width, 'h': im.height, 'variants': []}
        for w in widths:
            if w >= im.width:
                continue
            w = exact_width(im.width, im.height, w)
            h = round(im.height * w / im.width)
            name = f'{stem}-{w}.webp'
            im.resize((w, h), Image.LANCZOS).save(PLUGIN / 'assets/img' / name, 'WEBP', quality=82, method=6)
            entry['variants'].append([name, w, h])
            print(f'{name:40s} {w}x{h}  {(PLUGIN / "assets/img" / name).stat().st_size // 1024} KB   (original {im.width}x{im.height} {src.stat().st_size // 1024} KB)')
    out[rel] = entry
(PLUGIN / 'assets/img/variants.json').write_text(json.dumps(out, indent=1) + '\n')
print(f'wrote assets/img/variants.json ({len(out)} photos)')
