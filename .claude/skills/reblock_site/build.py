#!/usr/bin/env python3
"""Inline-styled exports (claude.ai/design): build the theme's patterns and assets/css/pages.css.

Usage: build.py <theme_dir> [--prefix=<css prefix>]

A claude.ai/design export styles every element inline, and a static block cannot keep a style
attribute (the editor rejects it). So the port's sources keep the export's style="…" verbatim and
this build moves each one into a class rule:

  .reblock/src/patterns/<name>.php  ->  patterns/<name>.php (style attributes removed)
  .reblock/src/css/head.css + the rules + .reblock/src/css/tail.css  ->  assets/css/pages.css

- The rule goes on the element's first class that starts with "<prefix>-" (a name chosen in the
  source: class="ozp-hero__title"). Without one it gets "<prefix>-<6 hex>", a hash of its style, so
  the same style anywhere shares one rule and a rebuild keeps the name.
- style-hover="…" (the export's hover styles) becomes a :hover rule for the same class.
- A styled link's rule also covers :hover: in the export its inline colour beat every a:hover rule.
- Block wrappers get the export's own defaults first in their rule: content-box (core groups and
  button rows are border-box), and a button row that neither wraps nor centres (core flex layout).
- Errors, and nothing is written: a named class used with two different styles (one name, one
  style: put a variant's own class first), PHP or {{ }} inside a style (unroll the loop or move the
  value to tail.css), and a rule class starting "<prefix>-page-" or "<prefix>-is-" (those stems are
  for body classes: a body class equal to a section's class boxes the whole page).
- PHP in the sources is left alone (masked while tags are read).
- head.css: page-level rules (the export's <style> blocks, through body classes) and the design
  system's components the export drew in script. tail.css: states and breakpoints its script decided.
Rule order: the names in .reblock/src/order.txt first (one pattern per line), then alphabetical.
The prefix is kept in .reblock/src/build.json ({"prefix": "ozp"}); --prefix sets it the first time.
"""
import hashlib
import json
import os
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict((a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
if len(args) != 1:
    sys.exit(__doc__)
theme = os.path.abspath(os.path.expanduser(args[0]))
src = os.path.join(theme, '.reblock', 'src')
if not os.path.isdir(os.path.join(src, 'patterns')):
    sys.exit('no %s: write the pattern sources there first' % os.path.join(src, 'patterns'))
conf_file = os.path.join(src, 'build.json')
conf = json.load(open(conf_file)) if os.path.exists(conf_file) else {}
if opts.get('prefix'):
    conf['prefix'] = opts['prefix']
    with open(conf_file, 'w') as f:
        json.dump(conf, f, indent=1)
        f.write('\n')
if not re.fullmatch(r'[a-z][a-z0-9]*', conf.get('prefix', '')):
    sys.exit('choose a short CSS prefix for the classes: build.py %s --prefix=<letters> (kept in %s)' % (args[0], conf_file))
P = conf['prefix'] + '-'

PHP = re.compile(r'<\?(?:php|=).*?\?>', re.S)
TAG = re.compile(r'<([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)(/?)>')


def attr(name):
    return re.compile(r'\s' + re.escape(name) + r'="([^"]*)"')


def norm(style):
    """Declarations as the export wrote them, without stray spaces or a trailing semicolon."""
    style = re.sub(r'\s*;\s*', ';', style.strip()).strip(';')
    return re.sub(r'\s*\n\s*', ' ', style)


rules = {}       # class -> [style, hover, first file, is a link]
order = []       # classes in the order first seen
errors = []


def process(name, text):
    masks = []

    def mask(m):
        masks.append(m.group(0))
        return '\x00%d\x00' % (len(masks) - 1)
    body = PHP.sub(mask, text)

    def tag(m):
        tagname, attrs, selfclose = m.group(1), m.group(2), m.group(3)
        sm = attr('style').search(attrs)
        if not sm:
            if attr('style-hover').search(attrs):
                errors.append('%s: <%s> has style-hover without style' % (name, tagname))
            return m.group(0)
        style = norm(sm.group(1))
        cm = attr('class').search(attrs)
        classes = cm.group(1).split() if cm else []
        if 'wp-block-group' in classes or 'wp-block-buttons' in classes:
            pre = 'box-sizing:content-box'
            if 'wp-block-buttons' in classes:
                pre += ';flex-wrap:nowrap;align-items:normal;gap:0'
            style = pre + ';' + style
        hm = attr('style-hover').search(attrs)
        hover = norm(hm.group(1)) if hm else ''
        if '\x00' in style or '{{' in style or '\x00' in hover:
            shown = re.sub(r'\x00\d+\x00', '<?php … ?>', style)
            errors.append('%s: <%s> style holds PHP or {{ }} (unroll the loop, or a state rule in tail.css): %s' % (name, tagname, shown[:80]))
        attrs = attr('style').sub('', attrs, count=1)
        attrs = attr('style-hover').sub('', attrs, count=1)
        target = next((c for c in classes if c.startswith(P)), None)
        if not target:
            target = P + hashlib.sha1((style + '|' + hover).encode()).hexdigest()[:6]
            classes.insert(0, target)
            if cm:
                attrs = attr('class').sub(' class="%s"' % ' '.join(classes), attrs, count=1)
            else:
                attrs = ' class="%s"' % target + attrs
        if target.startswith((P + 'page-', P + 'is-')):
            errors.append('%s: .%s: the stems %spage- and %sis- are for body classes' % (name, target, P, P))
        link = tagname.lower() == 'a'
        if target in rules:
            if rules[target][:2] != [style, hover]:
                errors.append('%s: .%s already has another style (first in %s):\n    was: %s\n    now: %s'
                              % (name, target, rules[target][2], rules[target][0][:140], style[:140]))
            elif link:
                rules[target][3] = True
        else:
            rules[target] = [style, hover, name, link]
            order.append(target)
        return '<%s%s%s>' % (tagname, attrs, selfclose)

    body = TAG.sub(tag, body)
    return re.sub(r'\x00(\d+)\x00', lambda m: masks[int(m.group(1))], body)


names = sorted(f[:-4] for f in os.listdir(os.path.join(src, 'patterns')) if f.endswith('.php'))
first = []
order_file = os.path.join(src, 'order.txt')
if os.path.exists(order_file):
    first = [l.strip() for l in open(order_file) if l.strip() and not l.startswith('#')]
names = [n for n in first if n in names] + [n for n in names if n not in first]

out, by_file = {}, {}
for n in names:
    before = len(order)
    out[n] = process(n, open(os.path.join(src, 'patterns', n + '.php'), encoding='utf-8').read())
    by_file[n] = order[before:]

if errors:
    for e in errors:
        print('ERROR ' + e)
    sys.exit('%d error(s): nothing written' % len(errors))

os.makedirs(os.path.join(theme, 'patterns'), exist_ok=True)
for n, text in out.items():
    with open(os.path.join(theme, 'patterns', n + '.php'), 'w', encoding='utf-8') as f:
        f.write(text)

parts = []
head = os.path.join(src, 'css', 'head.css')
tail = os.path.join(src, 'css', 'tail.css')
parts.append(open(head, encoding='utf-8').read().rstrip() + '\n' if os.path.exists(head) else '')
parts.append('\n/* ==== The design\'s inline styles, as classes (written by build.py from .reblock/src) ==== */\n')
for n in names:
    if not by_file[n]:
        continue
    parts.append('\n/* %s */\n' % n)
    for c in by_file[n]:
        style, hover, _, link = rules[c]
        parts.append(('.%s,.%s:hover{%s}\n' % (c, c, style)) if link else ('.%s{%s}\n' % (c, style)))
        if hover:
            parts.append('.%s:hover{%s}\n' % (c, hover))
if os.path.exists(tail):
    parts.append('\n' + open(tail, encoding='utf-8').read().rstrip() + '\n')
with open(os.path.join(theme, 'assets', 'css', 'pages.css'), 'w', encoding='utf-8') as f:
    f.write(''.join(parts))
print('built %d patterns, %d rules (%d hover) -> patterns/, assets/css/pages.css'
      % (len(out), len(order), sum(1 for c in order if rules[c][1])))
