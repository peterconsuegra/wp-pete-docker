#!/usr/bin/env python3
"""List the design elements whose size changes under lp.css's border-box.

The export renders without a CSS reset, so its divs, links, spans and text inputs are
content-box (a padded or bordered box grows by its padding and border); lp.css makes everything
inside .sap-lp border-box. An element with a width, min-width or flex-basis plus side padding or
borders, or a height or min-height plus top/bottom padding or borders, therefore comes out
smaller in the port: give it box-sizing:content-box inline (lp4: the cart summary was 20 px
narrow, the stepper and coupon field 2 px short, the step cards wrapped differently at 1024).
Skipped: buttons, selects, checkboxes and radios (border-box in the browser already), elements
the design marks box-sizing:border-box, and percentage widths (width:100% plus padding overflows
in the design; the port's border-box is the fix there).
Usage: boxcheck.py <export_dir>
"""
import glob
import os
import re
import sys


def tokens(value):
    """Split a CSS value on spaces outside parentheses: '0 clamp(20px, 3vw, 40px)' -> 2 tokens."""
    out, depth, cur = [], 0, ''
    for ch in value.strip():
        depth += (ch == '(') - (ch == ')')
        if ch == ' ' and depth == 0:
            if cur:
                out.append(cur)
            cur = ''
        else:
            cur += ch
    return out + ([cur] if cur else [])


def nonzero(tok):
    return not re.fullmatch(r'0(?:\.0+)?(?:px|em|rem|%)?', tok)


def sides(decls):
    """(vertical, horizontal): does padding or border add to the height / the width?"""
    v = h = False
    for prop, val in decls:
        if prop == 'padding':
            t = tokens(val) or ['0']
            if len(t) == 1:
                t = t * 4
            elif len(t) == 2:
                t = t * 2
            elif len(t) == 3:
                t = [t[0], t[1], t[2], t[1]]
            v |= nonzero(t[0]) or nonzero(t[2])
            h |= nonzero(t[1]) or nonzero(t[3])
        elif prop in ('padding-top', 'padding-bottom'):
            v |= nonzero(val.strip())
        elif prop in ('padding-left', 'padding-right'):
            h |= nonzero(val.strip())
        elif prop.startswith('border') and not re.search(r'radius|color|style|collapse|spacing|image', prop):
            if re.search(r'(?<![\d.])(?:0?\.\d+|[1-9][\d.]*)px', val) and 'none' not in val:
                if prop in ('border', 'border-width'):
                    v = h = True
                elif prop in ('border-top', 'border-bottom'):
                    v = True
                elif prop in ('border-left', 'border-right'):
                    h = True
    return v, h


src = sys.argv[1] if len(sys.argv) > 1 else '.'
found = 0
for f in sorted(glob.glob(os.path.join(src, '*.dc.html'))):
    if os.path.basename(f).startswith('Flujo'):
        continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'<([a-z0-9-]+)\b[^>]*?style="([^"]*)"[^>]*>', s):
        tag, st = m.group(1), m.group(2)
        if 'box-sizing:border-box' in st.replace(' ', '') or tag in ('button', 'select'):
            continue
        if tag == 'input' and re.search(r'type="(button|submit|reset|checkbox|radio|image)"', m.group(0)):
            continue
        decls = [(p.strip().lower(), v.strip()) for p, v in re.findall(r'([a-zA-Z-]+)\s*:\s*([^;]+)', st)]
        width = [f'{p}:{v}' for p, v in decls if (p in ('width', 'min-width') and '%' not in v and nonzero(v) and v not in ('auto', 'fit-content', 'max-content', 'min-content'))
                 or (p == 'flex' and re.fullmatch(r'[\d.]+ [\d.]+ [\d.]+px', v)) or (p == 'flex-basis' and v.endswith('px'))]
        height = [f'{p}:{v}' for p, v in decls if p in ('height', 'min-height') and '%' not in v and 'vh' not in v and nonzero(v) and v != 'auto']
        v, h = sides(decls)
        hits = (width if h else []) + (height if v else [])
        if hits:
            found += 1
            line = s.count('\n', 0, m.start()) + 1
            text = ' '.join(re.sub(r'<[^>]+>', ' ', s[m.end():m.end() + 300]).split())[:44]
            print('%s:%d  <%s> %s | %s' % (os.path.basename(f), line, tag, ', '.join(hits)[:48], text))
print('%d element(s) to give box-sizing:content-box in the port' % found if found else 'no box-sizing differences')
