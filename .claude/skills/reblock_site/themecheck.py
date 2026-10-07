#!/usr/bin/env python3
"""Lint a /reblock_site theme before it is synced (sync.sh runs it and stops on errors).

Usage: themecheck.py <theme_dir>
Errors (exit 1):
- block comments that do not open and close in order, attributes that are not JSON;
- HTML between sibling blocks or outside every block (the editor turns it into a Classic block);
- a static block whose first tag lacks its tag (group tagName, heading level, list ordered), its
  base class (wp-block-group, wp-block-heading …), its className classes or its anchor id;
- wp:pattern slugs with no pattern file, wp:template-part slugs with no part file;
- <prefix>_asset_url( '…' ) / <prefix>_the_asset( '…' ) paths missing from assets/manifest.json;
- relative URLs in templates, parts and patterns (src="assets/…", href="about.html"): under
  WordPress permalinks they resolve against /about/ and break. Links to *.html pages of the export;
- url() targets in assets/css/*.css that do not exist; scaffold tokens left unreplaced.
Warnings: blocks outside core/, HTML comments between blocks, patterns without "Inserter: no".
"""
import glob
import json
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
theme = os.path.abspath(sys.argv[1])
errors, warnings = [], []
rel = lambda f: os.path.relpath(f, theme)

BLOCK = re.compile(r'<!--\s+(/)?wp:([a-z][a-z0-9_-]*/)?([a-z][a-z0-9_-]*)\s+(\{.*?\}\s+)?(/)?-->', re.S)
PHP = re.compile(r'<\?php.*?(\?>|\Z)', re.S)
STATIC = {
    'core/group': lambda a: (a.get('tagName', 'div'), ['wp-block-group']),
    'core/heading': lambda a: ('h%d' % a.get('level', 2), ['wp-block-heading']),
    'core/paragraph': lambda a: ('p', []),
    'core/list': lambda a: ('ol' if a.get('ordered') else 'ul', ['wp-block-list']),
    'core/list-item': lambda a: ('li', []),
    'core/buttons': lambda a: ('div', ['wp-block-buttons']),
    'core/button': lambda a: ('div', ['wp-block-button']),
    'core/image': lambda a: ('figure', ['wp-block-image']),
    'core/video': lambda a: ('figure', ['wp-block-video']),
    'core/details': lambda a: ('details', ['wp-block-details']),
    'core/quote': lambda a: ('blockquote', ['wp-block-quote']),
    'core/columns': lambda a: ('div', ['wp-block-columns']),
    'core/column': lambda a: ('div', ['wp-block-column']),
    'core/cover': lambda a: ('div', ['wp-block-cover']),
    'core/separator': lambda a: ('hr', ['wp-block-separator']),
    'core/spacer': lambda a: ('div', ['wp-block-spacer']),
    'core/table': lambda a: ('figure', ['wp-block-table']),
    'core/query': lambda a: (a.get('tagName', 'div'), ['wp-block-query']),
}
TOKENS = re.compile(r'__(NAME|SLUG|PREFIX|PREFIXUC|SOURCE|SITE|DATE)__')

# ---------- theme basics ----------
style = os.path.join(theme, 'style.css')
domain = ''
if not os.path.isfile(style):
    errors.append('style.css missing')
else:
    m = re.search(r'Text Domain:\s*(\S+)', open(style, encoding='utf-8').read())
    domain = m.group(1) if m else ''
    if not domain:
        errors.append('style.css: no Text Domain')
try:
    json.load(open(os.path.join(theme, 'theme.json'), encoding='utf-8'))
except Exception as e:  # noqa: BLE001
    errors.append('theme.json: %s' % e)
if not os.path.isfile(os.path.join(theme, 'templates', 'index.html')):
    errors.append('templates/index.html missing (WordPress needs it for a block theme)')
manifest_file = os.path.join(theme, 'assets', 'manifest.json')
manifest = json.load(open(manifest_file, encoding='utf-8')) if os.path.isfile(manifest_file) else {}

# ---------- pattern registry ----------
patterns, used_patterns = {}, set()
for f in sorted(glob.glob(os.path.join(theme, 'patterns', '*.php'))):
    head = open(f, encoding='utf-8').read(3000)
    slug = re.search(r'^\s*\*\s*Slug:\s*(\S+)', head, re.M)
    title = re.search(r'^\s*\*\s*Title:\s*(.+)$', head, re.M)
    if not slug or not title:
        errors.append('%s: header needs Title: and Slug:' % rel(f))
        continue
    if slug.group(1) in patterns:
        errors.append('%s: slug %s also used by %s' % (rel(f), slug.group(1), patterns[slug.group(1)]))
    patterns[slug.group(1)] = rel(f)
    if domain and not slug.group(1).startswith(domain + '/'):
        errors.append('%s: slug %s should start with %s/' % (rel(f), slug.group(1), domain))
    if not re.search(r'^\s*\*\s*Inserter:\s*(no|false)', head, re.M):
        warnings.append('%s: no "Inserter: no" (it shows in the block inserter)' % rel(f))
parts = {os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(theme, 'parts', '*.html'))}


def first_tag(html):
    m = re.match(r'\s*<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>', html)
    if not m:
        return None, '', {}
    attrs = dict((k.lower(), v) for k, v in re.findall(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"', m.group(2)))
    return m.group(1).lower(), m.group(0), attrs


def lint_markup(path, text):
    """Block structure of one template, part or pattern (PHP already replaced by PHPX)."""
    stack, top = [], []
    nodes = []
    pos = 0
    for m in BLOCK.finditer(text):
        closer, ns, name, attrs_raw, void = m.groups()
        full = (ns or 'core/') + name
        line = text.count('\n', 0, m.start()) + 1
        parent_children = stack[-1]['children'] if stack else top
        if closer:
            if not stack or stack[-1]['name'] != full:
                errors.append('%s:%d: <!-- /wp:%s --> closes %s' % (path, line, name, ('wp:' + stack[-1]['name']) if stack else 'nothing'))
                return
            node = stack.pop()
            node['end'] = m.start()
            continue
        attrs = {}
        if attrs_raw:
            try:
                attrs = json.loads(attrs_raw.strip())
            except ValueError as e:
                errors.append('%s:%d: wp:%s attributes are not JSON (%s)' % (path, line, name, e))
        node = {'name': full, 'attrs': attrs, 'start': m.start(), 'open_end': m.end(), 'end': m.end(), 'children': [], 'line': line, 'void': bool(void)}
        parent_children.append(node)
        nodes.append(node)
        if not full.startswith('core/'):
            warnings.append('%s:%d: wp:%s is not a core block' % (path, line, full))
        if not void:
            stack.append(node)
    for node in stack:
        errors.append('%s:%d: wp:%s is never closed' % (path, node['line'], node['name']))
        node['end'] = len(text)
        node['unclosed'] = True

    def gaps(children, lo, hi, where, edges):
        """Text between blocks: edges=True also checks before the first and after the last."""
        cuts = [(c['start'], c['end'] if c['void'] or c.get('unclosed') else text.find('-->', c['end']) + 3) for c in children]
        segs = []
        if edges:
            segs.append((lo, cuts[0][0] if cuts else hi))
        for a, b in zip(cuts, cuts[1:]):
            segs.append((a[1], b[0]))
        if edges and cuts:
            segs.append((cuts[-1][1], hi))
        for a, b in segs:
            seg = text[a:b]
            # PHP between blocks (setup code, a foreach around blocks) is not markup.
            stray = re.sub(r'<!--.*?-->|PHPX', '', seg, flags=re.S).strip()
            if stray:
                errors.append('%s:%d: HTML outside a block%s: %s' % (path, text.count('\n', 0, a) + 1, where, re.sub(r'\s+', ' ', stray)[:90]))
            elif re.sub(r'PHPX', '', seg).strip():
                warnings.append('%s:%d: HTML comment between blocks%s (the editor shows it as a Classic block)' % (path, text.count('\n', 0, a) + 1, where))

    gaps(top, 0, len(text), '', True)
    for n in nodes:
        if n['children']:
            gaps(n['children'], n['open_end'], n['end'], ' (between children of wp:%s)' % n['name'], False)
        if n['name'] not in STATIC or n['void']:
            continue
        tag, want_classes = STATIC[n['name']](n['attrs'])
        got, raw, attrs = first_tag(text[n['open_end']:])
        here = '%s:%d: wp:%s' % (path, n['line'], n['name'][5:])
        if got != tag:
            errors.append('%s should start with <%s>, found %s' % (here, tag, raw.strip()[:60] or 'no tag'))
            continue
        classes = attrs.get('class', '').split()
        want = want_classes + str(n['attrs'].get('className', '')).split()
        if n['attrs'].get('align'):
            want.append('align' + n['attrs']['align'])
        missing = [c for c in want if c not in classes]
        if missing:
            errors.append('%s: class attribute lacks %s' % (here, ' '.join(missing)))
        if n['attrs'].get('anchor') and attrs.get('id') != n['attrs']['anchor']:
            errors.append('%s: anchor %s but id="%s"' % (here, n['attrs']['anchor'], attrs.get('id', '')))
        if n['name'] == 'core/button':
            link = re.search(r'<(a|button)\b[^>]*class="([^"]*)"', text[n['open_end']:n['end']])
            if not link or not {'wp-block-button__link', 'wp-element-button'} <= set(link.group(2).split()):
                errors.append('%s: its link needs class="wp-block-button__link wp-element-button"' % here)
    for n in nodes:
        if n['name'] == 'core/pattern':
            s = n['attrs'].get('slug', '')
            used_patterns.add(s)
            if s not in patterns:
                errors.append('%s:%d: wp:pattern %s has no file in patterns/' % (path, n['line'], s))
        if n['name'] == 'core/template-part' and n['attrs'].get('slug') not in parts:
            errors.append('%s:%d: wp:template-part %s has no parts/%s.html' % (path, n['line'], n['attrs'].get('slug'), n['attrs'].get('slug')))


URL_ATTR = re.compile(r'\b(src|href|poster|action|data-src|srcset)\s*=\s*"([^"]*)"', re.I)
OK_URL = re.compile(r'^(?:https?:|//|/|#|mailto:|tel:|data:|javascript:|PHPX|\{\{)|^$', re.I)
for f in sorted(glob.glob(os.path.join(theme, 'templates', '*.html')) + glob.glob(os.path.join(theme, 'parts', '*.html')) + glob.glob(os.path.join(theme, 'patterns', '*.php'))):
    raw = open(f, encoding='utf-8').read()
    for m in re.finditer(r"\b\w+_(?:asset_url|the_asset)\(\s*'([^']+)'\s*[,)]", raw):
        if m.group(1) not in manifest:
            errors.append('%s:%d: %s is not in assets/manifest.json (run import_assets.py, or fix the path)' % (rel(f), raw.count('\n', 0, m.start()) + 1, m.group(1)))
    for m in re.finditer(r"get_theme_file_uri\(\s*'([^']+)'", raw):
        if not os.path.exists(os.path.join(theme, m.group(1))):
            errors.append('%s: get_theme_file_uri( %s ): no such file' % (rel(f), m.group(1)))
    text = raw
    if f.endswith('.php'):
        text = re.sub(r'\A\s*<\?php\s*/\*\*.*?\*/\s*\?>', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)
        text = PHP.sub(lambda m: 'PHPX' + '\n' * m.group(0).count('\n'), text)
    for m in URL_ATTR.finditer(text):
        values = [v.strip().split(' ')[0] for v in m.group(2).split(',')] if m.group(1).lower() == 'srcset' else [m.group(2).strip()]
        for v in values:
            line = text.count('\n', 0, m.start()) + 1
            if not OK_URL.match(v):
                errors.append('%s:%d: relative URL %s="%s" (use <prefix>_the_asset() / <prefix>_the_link())' % (rel(f), line, m.group(1), v))
            elif re.search(r'\.html?(#|$|\?)', v) and not v.startswith(('http', '//')):
                errors.append('%s:%d: link to an export page %s (use <prefix>_the_link())' % (rel(f), line, v))
    for m in re.finditer(r'url\(\s*["\']?(?!data:|https?:|//|/|#|PHPX)([^"\')]+)', text):
        errors.append('%s:%d: relative url(%s) in markup' % (rel(f), text.count('\n', 0, m.start()) + 1, m.group(1)))
    lint_markup(rel(f), text)

for s in sorted(set(patterns) - used_patterns):
    warnings.append('%s (%s) is not used by any template, part or pattern' % (patterns[s], s))

# ---------- CSS url() targets, leftover tokens ----------
for f in glob.glob(os.path.join(theme, 'assets', 'css', '*.css')):
    css = open(f, encoding='utf-8').read()
    for m in re.finditer(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', css):
        u = m.group(1).split('#')[0].split('?')[0]
        if not u or re.match(r'^(data:|https?:|//|/)', u):
            continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), u))):
            errors.append('%s: url(%s) does not exist' % (rel(f), m.group(1)))
for f in glob.glob(os.path.join(theme, '**', '*'), recursive=True):
    if os.path.isfile(f) and os.path.splitext(f)[1] in ('.php', '.html', '.json', '.css', '.js', '.md'):
        m = TOKENS.search(open(f, encoding='utf-8', errors='replace').read())
        if m:
            errors.append('%s: scaffold token %s left in the file' % (rel(f), m.group(0)))

for w in warnings:
    print('warning: ' + w)
for e in errors:
    print('ERROR: ' + e)
print('%d error(s), %d warning(s): %s' % (len(errors), len(warnings), 'fix the errors before syncing' if errors else 'theme ok'))
sys.exit(1 if errors else 0)
