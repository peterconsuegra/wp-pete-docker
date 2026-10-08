#!/usr/bin/env python3
"""Start a site's own page speed plugin from /speed_site's template (plugin/ in this folder).

  python3 scaffold_plugin.py <plugin_repo> --name="Play Method Page Speed" --site="The Play Method" \\
      --theme=playmethod-blocks --prefix=pmps [--hints=a.json,b.json] [--photos=a.json,b.json] \\
      [--keep-poster=<class>] [--delay=<handle prefix>,...] [--theme-dir=<theme repo>] [--force]

The folder name is the plugin's slug and must end in -page-speed (<brand>-page-speed). The prefix
names the PHP functions and data- attributes: a few lowercase letters ending in "ps" (pmps).
--hints: lcpprobe.mjs drafts (every-page fonts, each page's first-screen items and fonts).
--photos: imgwidths.mjs results (copy widths per photo, sizes per page). Several files of each are
merged in order (the pages file, then the posts file). They become includes/site.php and the WIDTHS of
bin/variants.py; every other file is the template with the names filled in.
--keep-poster: the class of the video whose poster shows at once ('' = each page's first video).
--delay: script handle prefixes to hold back until the first interaction (only on the owner's yes).
Then: python3 <repo>/bin/variants.py, check includes/site.php against Lighthouse, git init, commit.
"""
import argparse, datetime, json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
TEMPLATE = HERE / 'plugin'

ap = argparse.ArgumentParser()
ap.add_argument('repo')
ap.add_argument('--name', required=True)
ap.add_argument('--site', required=True)
ap.add_argument('--theme', required=True)
ap.add_argument('--prefix', required=True)
ap.add_argument('--hints', default='')
ap.add_argument('--photos', default='')
ap.add_argument('--keep-poster', default='')
ap.add_argument('--delay', default='')
ap.add_argument('--theme-dir', default='')
ap.add_argument('--force', action='store_true')
a = ap.parse_args()

repo = pathlib.Path(a.repo).expanduser().resolve()
slug = repo.name
if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*-page-speed', slug):
    sys.exit(f'the folder name is the slug and must end in -page-speed: {slug}')
if not re.fullmatch(r'[a-z][a-z0-9]{1,8}', a.prefix):
    sys.exit(f'prefix: 2-9 lowercase letters or digits, starting with a letter: {a.prefix}')
if not re.fullmatch(r'[a-z0-9-]+', a.theme):
    sys.exit(f'theme: the theme folder name: {a.theme}')
if repo.exists() and any(repo.iterdir()) and not a.force:
    sys.exit(f'{repo} exists and is not empty (--force writes the template files over it)')


def load(paths):
    return [json.loads(pathlib.Path(p).expanduser().read_text()) for p in paths.split(',') if p.strip()]


def php(v, depth=2):
    """A PHP literal in WordPress style (array( … ), tabs)."""
    pad = '\t' * depth
    if isinstance(v, dict):
        if not v:
            return 'array()'
        return 'array(\n' + ''.join(f"{pad}\t{php(k)} => {php(x, depth + 1)},\n" for k, x in v.items()) + f'{pad})'
    if isinstance(v, list):
        if not v:
            return 'array()'
        return 'array(\n' + ''.join(f'{pad}\t{php(x, depth + 1)},\n' for x in v) + f'{pad})'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace('\\', '\\\\').replace("'", "\\'") + "'"


# The site's data, from the probes.
# A draft's every-page fonts hold for the pages it probed: the fonts all drafts share stay every-page,
# the rest go to that draft's own pages (a posts-only probe must not preload its fonts on every page).
hints = load(a.hints)
fonts = [f for f in (hints[0].get('fonts', []) if hints else []) if all(f in h.get('fonts', []) for h in hints)]
pages, sizes, widths = {}, {}, {}
for h in hints:
    extra = [f for f in h.get('fonts', []) if f not in fonts]
    for key, page in (h.get('pages') or {}).items():
        entry = pages.setdefault(key, {})
        entry.update({k: v for k, v in page.items() if k != 'fonts'})
        own = list(dict.fromkeys(extra + entry.get('fonts', []) + page.get('fonts', [])))
        if own:
            entry['fonts'] = own
for ph in load(a.photos):
    for rel, photo in (ph.get('photos') or {}).items():
        if not photo.get('copies'):
            continue
        widths[rel] = photo['copies']
        for key, place in photo['places'].items():
            if place.get('sizes'):
                sizes.setdefault(key, {})[rel.rsplit('/', 1)[-1]] = place['sizes']
site = {
    'theme': a.theme,
    'fonts': fonts,
    'pages': pages,
    'sizes': sizes,
    'keep_poster': a.keep_poster,
    'delay': [d.strip() for d in a.delay.split(',') if d.strip()],
}

names = {
    '__THEME_DIR__': a.theme_dir or f'~/Sites/projects/{a.theme}-theme',
    '__WIDTHS__': json.dumps(widths, indent=4),
    '__NAME__': a.name,
    '__SITE__': a.site,
    '__SLUG__': slug,
    '__PREFIX__': a.prefix,
    '__CONST__': slug.upper().replace('-', '_'),
    '__OPTION__': slug.replace('-', '_'),
    '__THEME__': a.theme,
    '__DATE__': datetime.date.today().isoformat(),
}
written = []
for src in sorted(TEMPLATE.rglob('*')):
    if src.is_dir() or src.name in ('.DS_Store',):
        continue
    rel = str(src.relative_to(TEMPLATE)).replace('__SLUG__', slug)
    text = src.read_text(encoding='utf-8')
    if rel == 'includes/site.php':
        head = text[: text.index('\treturn array(')]
        text = head + '\treturn ' + php(site, 1) + ';\n}\n'
    for k, v in names.items():
        text = text.replace(k, v)
    dst = repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding='utf-8')
    written.append(rel)
left = sorted({m for f in written for m in re.findall(r'__[A-Z_]+?__', (repo / f).read_text(encoding='utf-8')) if m != '__DIR__' and m != '__FILE__'})
print(f'{repo}: {len(written)} files ({slug}, prefix {a.prefix}, theme {a.theme})')
print(f'  site.php: {len(fonts)} every-page font(s), first-screen hints for {", ".join(pages) or "no page"}, '
      f'sizes on {", ".join(sizes) or "no page"}, keep_poster "{a.keep_poster}", delay {site["delay"] or "none"}')
print(f'  photo copies: {", ".join(f"{k.rsplit(chr(47), 1)[-1]} {v}" for k, v in widths.items()) or "none"}')
if left:
    sys.exit(f'placeholders left: {left}')
print(f'next: python3 {repo}/bin/variants.py, then check includes/site.php against Lighthouse; git init; commit')
