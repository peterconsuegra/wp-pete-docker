#!/usr/bin/env python3
"""Check that every design image path in the variants' PHP files is in variants/_img/manifest.json.

sap_lp_img() prints nothing for a path missing from the manifest, so a skipped import_images.py
run leaves blank spots without any error (lp4, 2026-09-28). Checks every literal 'Folder/file.ext'
(calls, data arrays); skips names without a folder (concatenated, $rv . 'IMG_3147.jpg') and
uploads paths ('2021/10/pic1.jpeg', drawn by sap_lp_upload_img()).
Usage: imgcheck.py <theme_checkout>   (exit 1 and a list when something is missing)
"""
import glob
import json
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'
manifest_file = os.path.join(root, 'variants', '_img', 'manifest.json')
if not os.path.isfile(manifest_file):
    sys.exit('no manifest: ' + manifest_file)
manifest = json.load(open(manifest_file, encoding='utf-8'))

pattern = re.compile(r"""['"]([^'"\n<>]+?\.(?:jpe?g|png|webp|svg|gif|avif))['"]""", re.I)
missing = []
for f in sorted(glob.glob(os.path.join(root, 'variants', '**', '*.php'), recursive=True)):
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        for path in pattern.findall(line):
            key = re.sub(r'^Imagenes/', '', path)
            if '://' in key or key.startswith(('/', '.')) or '/' not in key or key.split('/')[0].isdigit():
                continue
            if key not in manifest:
                missing.append('%s:%d  %s' % (os.path.relpath(f, root), n, path))

if missing:
    print('images missing from variants/_img/manifest.json (run import_images.py):')
    print('\n'.join('  ' + m for m in missing))
    sys.exit(1)
print('images ok')
