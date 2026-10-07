#!/usr/bin/env python3
"""Start a block theme for /reblock_site from the skill's scaffold/ folder.

Usage: scaffold.py <theme_dir> --slug=<slug> --name="<Site name>" [--prefix=<php_prefix>]
                   [--source=<export zip name>] [--site=<dev url>]
<theme_dir> must not exist or be empty (the run's git repo, e.g. ~/Sites/projects/<slug>-theme).
The slug is the theme folder and text domain (lowercase, digits, dashes; '<brand>-blocks' by habit);
the PHP prefix defaults to the slug without '-blocks', dashes as underscores.
"""
import datetime
import os
import re
import shutil
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict((a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
if len(args) != 1 or not opts.get('slug') or not opts.get('name'):
    sys.exit(__doc__)
dest = os.path.abspath(os.path.expanduser(args[0]))
slug = opts['slug']
if not re.fullmatch(r'[a-z][a-z0-9-]*[a-z0-9]', slug):
    sys.exit('slug must be lowercase letters, digits and dashes: ' + slug)
prefix = opts.get('prefix') or re.sub(r'-blocks$', '', slug).replace('-', '_')
if not re.fullmatch(r'[a-z_][a-z0-9_]*', prefix):
    sys.exit('prefix must be a PHP identifier: ' + prefix)
if os.path.exists(dest) and [f for f in os.listdir(dest) if f != '.reblock']:
    sys.exit('not empty, refusing to overwrite: ' + dest)

tokens = {
    '__NAME__': opts['name'].replace("'", '’'),
    '__SLUG__': slug,
    '__PREFIXUC__': prefix.upper(),
    '__PREFIX__': prefix,
    '__SOURCE__': opts.get('source') or 'a site export',
    '__SITE__': opts.get('site') or 'its dev site',
    '__DATE__': datetime.date.today().isoformat(),
}
src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scaffold')
count = 0
for dirpath, _, files in os.walk(src):
    for name in files:
        if name == '.DS_Store':
            continue
        rel = os.path.relpath(os.path.join(dirpath, name), src)
        out = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.splitext(name)[1] in ('.php', '.html', '.json', '.css', '.js', '.md', '') or name in ('.gitignore', '.gitattributes'):
            text = open(os.path.join(dirpath, name), encoding='utf-8').read()
            for k, v in tokens.items():
                text = text.replace(k, v)
            open(out, 'w', encoding='utf-8').write(text)
        else:
            shutil.copyfile(os.path.join(dirpath, name), out)
        count += 1
print('scaffolded %d files in %s (slug %s, prefix %s_)' % (count, dest, slug, prefix))
print('next: git -C %s init && git -C %s add -A && git -C %s commit -m "Scaffold"' % (dest, dest, dest))
