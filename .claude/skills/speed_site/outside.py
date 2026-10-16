#!/usr/bin/env python3
"""Pixels that differ between before/after shots, outside the photos the site plugin now serves from
copies: the speed work's pixel rule (inside a copy, resampling is expected; anywhere else, nothing).

  python3 outside.py <shots> <rects.json> <PLUGIN_SLUG> [name ...] [--bands]

name: a shot name as compare.py prints it (home-390, home-390-top…); default: every pair in <shots>.
Counts pixels that differ by more than 24 levels, as compare.py does, over the shared height.
rects.json comes from photorects.mjs (same pages file, same widths). --bands lists where the outside
pixels are (row bands) and the images near each band. Needs a Python with Pillow.
"""
import glob, json, os, re, sys
from PIL import Image, ImageChops, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith('--')]
bands_wanted = '--bands' in sys.argv
if len(args) < 3:
    sys.exit(__doc__)
shots, rects, slug, names = args[0], json.load(open(args[1])), args[2], args[3:]


def load(name, tag):
    path = f'{shots}/{name}-{tag}.png'
    if os.path.exists(path):
        return Image.open(path).convert('RGB')
    tiles = sorted(glob.glob(f'{shots}/{name}-{tag}-t*.png'), key=lambda p: int(re.search(r'-t(\d+)\.png$', p).group(1)))
    if not tiles:
        return None
    ims = [Image.open(t).convert('RGB') for t in tiles]
    out = Image.new('RGB', (ims[0].width, sum(i.height for i in ims)))
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height
    return out


if not names:
    names = sorted({re.sub(r'-before(-t\d+)?\.png$', '', os.path.basename(p)) for p in glob.glob(f'{shots}/*-before*.png')})
bad = 0
for name in names:
    a, b = load(name, 'before'), load(name, 'after')
    if a is None or b is None:
        continue
    h = min(a.height, b.height)
    a, b = a.crop((0, 0, a.width, h)), b.crop((0, 0, b.width, h))
    diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
    total = diff.histogram()[255]
    if not total:
        continue
    boxes = rects.get(name.replace('-top', ''), [])
    mask = Image.new('L', diff.size, 0)
    draw = ImageDraw.Draw(mask)
    for r in boxes:
        if f'/plugins/{slug}/' in r['src']:
            draw.rectangle([int(r['x']) - 1, int(r['y']) - 1, int(r['x'] + r['w']) + 1, int(r['y'] + r['h']) + 1], fill=255)
    out = ImageChops.subtract(diff, mask)
    outside = out.histogram()[255]
    bad += outside > 0
    print(f'{name:56s} differ {total:7d}  outside copies {outside:6d}' + (f'  box {out.getbbox()}' if outside else ''))
    if bands_wanted and outside:
        px, (W, H), bands, cur = out.load(), out.size, [], None
        for y in range(H):
            xs = [x for x in range(W) if px[x, y]]
            if not xs:
                continue
            if cur and y - cur[1] <= 6:
                cur[1], cur[2], cur[3], cur[4] = y, min(cur[2], xs[0]), max(cur[3], xs[-1]), cur[4] + len(xs)
            else:
                if cur:
                    bands.append(cur)
                cur = [y, y, xs[0], xs[-1], len(xs)]
        if cur:
            bands.append(cur)
        for y0, y1, x0, x1, n in bands[:15]:
            near = [r for r in boxes if r['y'] - 40 < y1 and r['y'] + r['h'] + 40 > y0 and r['x'] < x1 and r['x'] + r['w'] > x0]
            print(f'    y {y0}-{y1} x {x0}-{x1} {n} px   near: ' + '; '.join(f"{r['src'].rsplit('/', 1)[-1]} y{int(r['y'])}-{int(r['y'] + r['h'])}" for r in near[:3]))
print(f'{bad} shot(s) with differences outside the photo copies' if bad else 'no differences outside the photo copies')
sys.exit(1 if bad else 0)
