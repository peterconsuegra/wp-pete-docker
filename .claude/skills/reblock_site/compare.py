#!/usr/bin/env python3
"""Design and port side by side, from the PNGs shots.mjs and measure.mjs --shots write.

Usage: compare.py <shots_dir> [name_prefix ...] [--diff] [--max-width=2000]
Pairs every <name>-design.png with <name>-site.png (tiles -design-t1.png … are stitched first) and
writes <name>-cmp.png: design left, site right, a label with both heights. --diff adds a third column,
the pixel difference brightened (only meaningful down to the first height change). Prints the
heights table. Needs Pillow.
"""
import glob
import os
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageOps

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
if not args:
    sys.exit(__doc__)
shots = args[0]
prefixes = args[1:]
max_w = int(opts.get('max-width', 2000))
GAP, LABEL = 24, 30


def load(path_png):
    """One image, or its -t1, -t2 … tiles stitched top to bottom."""
    if os.path.exists(path_png):
        return Image.open(path_png).convert('RGB')
    tiles = sorted(glob.glob(path_png[:-4] + '-t*.png'), key=lambda f: int(re.search(r'-t(\d+)\.png$', f).group(1)))
    if not tiles:
        return None
    parts = [Image.open(t).convert('RGB') for t in tiles]
    out = Image.new('RGB', (max(p.width for p in parts), sum(p.height for p in parts)), 'white')
    y = 0
    for p in parts:
        out.paste(p, (0, y))
        y += p.height
    return out


names = set()
for f in os.listdir(shots):
    m = re.match(r'(.+)-design(?:-t\d+)?\.png$', f)
    if m and (not prefixes or any(m.group(1).startswith(p) for p in prefixes)):
        names.add(m.group(1))

rows = []
for name in sorted(names):
    d = load(os.path.join(shots, name + '-design.png'))
    s = load(os.path.join(shots, name + '-site.png'))
    if s is None:
        rows.append((name, d.height, None))
        continue
    cols = [d, s]
    if 'diff' in opts:
        w, h = min(d.width, s.width), min(d.height, s.height)
        diff = ImageChops.difference(d.crop((0, 0, w, h)), s.crop((0, 0, w, h)))
        cols.append(ImageOps.invert(diff.point(lambda v: min(255, v * 4))))
    width = sum(c.width for c in cols) + GAP * (len(cols) - 1)
    height = max(c.height for c in cols) + LABEL
    out = Image.new('RGB', (width, height), (235, 235, 235))
    x = 0
    draw = ImageDraw.Draw(out)
    labels = ['design %d px' % d.height, 'site %d px  (%+d)' % (s.height, s.height - d.height), 'difference']
    for c, label in zip(cols, labels):
        out.paste(c, (x, LABEL))
        draw.text((x + 6, 8), '%s · %s' % (name, label), fill=(200, 0, 0) if 'site' in label and s.height != d.height else (0, 0, 0))
        x += c.width + GAP
    if out.width > max_w:
        out = out.resize((max_w, round(out.height * max_w / out.width)), Image.LANCZOS)
    out.save(os.path.join(shots, name + '-cmp.png'))
    rows.append((name, d.height, s.height))

print('%-40s %8s %8s %6s' % ('name', 'design', 'site', 'Δ'))
for name, dh, sh in rows:
    print('%-40s %8d %8s %6s' % (name, dh, sh if sh is not None else '-', ('%+d' % (sh - dh)) if sh is not None else 'no site shot'))
print('wrote %d *-cmp.png in %s' % (sum(1 for r in rows if r[2] is not None), shots))
