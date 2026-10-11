#!/usr/bin/env python3
"""Remove the imported files no page uses, from assets/ and assets/manifest.json.

Usage: prune.py <theme_dir> [--dry-run]

import_assets.py brings in every media file of the export; a claude.ai/design project also carries
its explorations' images (mockups, earlier versions, book covers). A file counts as used when its
export path ('uploads/web_dk_3.webp'), its theme path or its theme file name appears in a pattern,
template, part, inc/ file, functions.php, stylesheet or script, or when a pattern builds its path:
a quoted prefix ('uploads/web_') and the rest of the name ('dk_3') both appear as quoted strings.
Run it after the port and again after a re-import. --dry-run lists without removing.
"""
import glob
import json
import os
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if len(args) != 1:
    sys.exit(__doc__)
dry = '--dry-run' in sys.argv
os.chdir(os.path.abspath(os.path.expanduser(args[0])))
manifest = json.load(open('assets/manifest.json'))
files = glob.glob('patterns/*.php') + glob.glob('templates/*.html') + glob.glob('parts/*.html') + glob.glob('inc/*.php') \
    + glob.glob('functions.php') + glob.glob('assets/css/*.css') + glob.glob('assets/js/*.js')
texts = '\n'.join(open(f, encoding='utf-8').read() for f in files)
quoted = set(re.findall(r"'([^'\n]{2,200})'", texts)) | set(re.findall(r'"([^"\n]{2,200})"', texts))


def used(key, entry):
    if key in texts or entry['src'] in texts or os.path.basename(entry['src']) in texts:
        return True
    stem = os.path.splitext(key)[0]
    for q in quoted:
        if len(q) >= 4 and stem.startswith(q) and stem[len(q):] in quoted:
            return True
    return False


unused = sorted(k for k, v in manifest.items() if not used(k, v))
kb = sum(manifest[k].get('kb', 0) for k in unused)
for k in unused:
    print('%s %s (%d KB)' % ('unused:' if dry else 'removed', manifest[k]['src'], manifest[k].get('kb', 0)))
    if not dry:
        if os.path.exists(manifest[k]['src']):
            os.remove(manifest[k]['src'])
        del manifest[k]
if not dry and unused:
    for d in sorted(glob.glob('assets/**/', recursive=True), key=len, reverse=True):
        if os.path.isdir(d) and not os.listdir(d):
            os.rmdir(d)
    with open('assets/manifest.json', 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(manifest.items())), f, indent=1, ensure_ascii=False)
        f.write('\n')
print('%d unused file(s), %d KB%s' % (len(unused), kb, '' if dry else ', removed'))
