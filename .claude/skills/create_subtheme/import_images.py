#!/usr/bin/env python3
"""Copy a claude.ai/design export's images into the theme's shared variant image library.

Usage: import_images.py <export_dir> <theme_dir>
Every file under <export_dir>/Imagenes/ is written to <theme_dir>/variants/_img/<same path>, as WebP
(SVG copied as is), resized by folder, and recorded in variants/_img/manifest.json with its size, so
templates can print width/height. Catalog photos also get a 240 px "-thumb". Existing files are kept,
so running it for lp3, lp4... only adds what is new. Needs Pillow (with WebP).
The file itself is taken from the master library (MASTER, same path) when it is there: claude.ai/design
strips an SVG's <style> block (the logos came out black) and may recompress photos.
"""
import json
import os
import shutil
import sys

from PIL import Image, ImageOps

MAX_W = {'Reviews': 720, 'ReviewsWeb': 720, 'CreadoresPortadas': 600, 'LimpiezasPortadas': 800,
         'Pagos': 240, 'Logo': 0}
DEFAULT_W = 1200
MASTER = os.environ.get('SAP_IMAGES', '/Volumes/MacPro/SaveAPlaya2026/LandingPagesMachine/Imagenes')
THUMB_W = {'Catalog': 240}
QUALITY = 80


def convert(src, dst, max_w):
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
    if max_w and img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img.save(dst, 'WEBP', quality=QUALITY, method=6)
    return img.width, img.height


def main(export_dir, theme_dir):
    src_root = os.path.join(export_dir, 'Imagenes')
    out_root = os.path.join(theme_dir, 'variants', '_img')
    man_path = os.path.join(out_root, 'manifest.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    added = 0
    for dirpath, _, files in os.walk(src_root):
        for name in sorted(files):
            if name.startswith('.') or name.startswith('._'):
                continue
            src = os.path.join(dirpath, name)
            rel = os.path.relpath(src, src_root)          # e.g. Catalog/1.jpg
            folder = rel.split(os.sep)[0]
            if rel in manifest and os.path.exists(os.path.join(out_root, manifest[rel]['src'])):
                continue
            if os.path.isfile(os.path.join(MASTER, rel)):
                src = os.path.join(MASTER, rel)
            stem, ext = os.path.splitext(rel)
            if ext.lower() == '.svg':
                dst_rel = rel
                os.makedirs(os.path.dirname(os.path.join(out_root, dst_rel)), exist_ok=True)
                shutil.copyfile(src, os.path.join(out_root, dst_rel))
                text = open(src, encoding='utf-8', errors='replace').read()
                if 'class="' in text and '<style' not in text:
                    print('WARNING: %s uses classes but has no <style>: its colors are lost (black)' % rel)
                entry = {'src': dst_rel}
            else:
                dst_rel = stem + '.webp'
                w, h = convert(src, os.path.join(out_root, dst_rel), MAX_W.get(folder, DEFAULT_W))
                entry = {'src': dst_rel, 'w': w, 'h': h}
                if folder in THUMB_W:
                    t_rel = stem + '-thumb.webp'
                    tw, th = convert(src, os.path.join(out_root, t_rel), THUMB_W[folder])
                    entry['thumb'] = {'src': t_rel, 'w': tw, 'h': th}
            manifest[rel] = entry
            added += 1
    with open(man_path, 'w') as f:
        json.dump(dict(sorted(manifest.items())), f, indent=0, ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out_root) for f in fs)
    print('added %d, library %d images, %.1f MB' % (added, len(manifest), total / 1e6))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
