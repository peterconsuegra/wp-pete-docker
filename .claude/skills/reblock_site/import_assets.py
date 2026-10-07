#!/usr/bin/env python3
"""Bring a site export's assets into the block theme, so patterns can keep the export's own paths.

Usage: import_assets.py <pages.json> <theme_dir> [--max-width=2400] [--quality=82]
                        [--subsets=latin,latin-ext] [--master=<dir>]
- Images -> assets/img/ as WebP (SVG, GIF, ICO copied; a WebP larger than its source keeps the source),
  wider than --max-width scaled down. Videos -> assets/video/ (made fast-start with ffmpeg when the
  moov atom is at the end). Font files -> assets/fonts/.
- assets/manifest.json maps each export path ('assets/photos/hero.jpg') to its theme file plus
  width/height: patterns print URLs with <prefix>_asset_url( 'assets/photos/hero.jpg' ).
- Google Fonts the pages load -> assets/fonts/google/*.woff2 + assets/css/fonts.css (only --subsets).
- The pages' local stylesheets, in load order, @imports inlined and url()s pointed at the imported
  files -> assets/css/site.css. Local scripts (not the claude.ai/design runtime) -> assets/js/site.js.
- Inline <style>/<script> blocks of each page -> <work_dir>/inline/<key>.css|js for the porter.
--master: a library to take files from when it has the same path (claude.ai/design strips SVG <style>).
Re-running replaces site.css, fonts.css and site.js, adds new files and re-imports changed ones
(the manifest keeps each source file's sha1); unchanged files are kept.
Needs Pillow; ffmpeg for fast-start fixes.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from html.parser import HTMLParser

from PIL import Image, ImageOps

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict((a[2:].split('=', 1) + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
if len(args) != 2:
    sys.exit(__doc__)
pages_file, theme = os.path.abspath(args[0]), os.path.abspath(args[1])
cfg = json.load(open(pages_file, encoding='utf-8'))
root = cfg['export']
work = os.path.dirname(pages_file)
MAX_W = int(opts.get('max-width', 2400))
QUALITY = int(opts.get('quality', 82))
SUBSETS = opts.get('subsets', 'latin,latin-ext').split(',')
MASTER = opts.get('master')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
RUNTIME = re.compile(r'(^|/)(support\.js|_ds_bundle\.js)$|unpkg\.com|react|babel', re.I)
GENERIC = {'assets', 'asset', 'img', 'imgs', 'image', 'images', 'imagenes', 'static', 'media', 'public',
           'video', 'videos', 'fonts', 'font'}
if not os.path.isfile(os.path.join(theme, 'style.css')):
    sys.exit('not a theme folder (no style.css): ' + theme + '  (run scaffold.py first)')

warnings = []
manifest_path = os.path.join(theme, 'assets', 'manifest.json')
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}


def kind(rel):
    ext = os.path.splitext(rel)[1].lower()
    if ext in ('.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.ico', '.svg'):
        return 'img'
    if ext in ('.mp4', '.webm', '.mov', '.m4v'):
        return 'video'
    if ext in ('.woff2', '.woff', '.ttf', '.otf', '.eot'):
        return 'fonts'
    return None


def target(rel, k):
    """Theme path: drop _ds/<name>/ and generic leading folders (assets/, img/, video/, …)."""
    parts = rel.split('/')
    if parts[0] == '_ds' and len(parts) > 2:
        parts = parts[2:]
    while len(parts) > 1 and parts[0].lower() in GENERIC:
        parts = parts[1:]
    return 'assets/%s/%s' % (k, '/'.join(parts))


def faststart(path):
    """True when the moov atom comes before mdat (the browser can start before the end arrives)."""
    with open(path, 'rb') as f:
        order, pos, size = [], 0, os.path.getsize(path)
        while pos < size and len(order) < 20:
            f.seek(pos)
            head = f.read(16)
            if len(head) < 8:
                break
            n, box = int.from_bytes(head[:4], 'big'), head[4:8].decode('latin-1')
            if n == 1:
                n = int.from_bytes(head[8:16], 'big')
            elif n == 0:
                n = size - pos
            order.append(box)
            if n < 8:
                break
            pos += n
    return 'moov' in order and ('mdat' not in order or order.index('moov') < order.index('mdat'))


# ---------- media files ----------
added = kept = 0
used = {v['src']: k for k, v in manifest.items()}
for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__MACOSX']
    for name in sorted(files):
        if name.startswith('.'):
            continue
        rel = os.path.relpath(os.path.join(dirpath, name), root).replace(os.sep, '/')
        k = kind(rel)
        if not k:
            continue
        src = os.path.join(root, rel)
        if MASTER and os.path.isfile(os.path.join(MASTER, rel)):
            src = os.path.join(MASTER, rel)
        dst_rel = target(rel, k)
        stem, ext = os.path.splitext(dst_rel)
        ext = ext.lower()
        raster = k == 'img' and ext in ('.jpg', '.jpeg', '.png', '.webp')
        if raster:
            dst_rel = stem + '.webp'
        if used.get(dst_rel, rel) != rel:
            dst_rel = stem + '-' + hashlib.sha1(rel.encode()).hexdigest()[:6] + os.path.splitext(dst_rel)[1]
            warnings.append('%s: name taken, written as %s' % (rel, dst_rel))
        dst = os.path.join(theme, dst_rel)
        sha1 = hashlib.sha1(open(src, 'rb').read()).hexdigest()
        if rel in manifest and manifest[rel].get('sha1') == sha1 and os.path.exists(os.path.join(theme, manifest[rel]['src'])):
            kept += 1
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        entry = {'src': dst_rel}
        if raster:
            img = ImageOps.exif_transpose(Image.open(src))
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA' if ('A' in img.getbands() or 'transparency' in img.info) else 'RGB')
            if img.width > MAX_W:
                img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
            small_png = ext == '.png' and os.path.getsize(src) < 30000
            img.save(dst, 'WEBP', quality=QUALITY, method=6, lossless=small_png)
            if os.path.getsize(dst) > os.path.getsize(src) and img.size == Image.open(src).size:
                os.remove(dst)
                dst_rel = stem + ext
                dst = os.path.join(theme, dst_rel)
                shutil.copyfile(src, dst)
                entry['src'] = dst_rel
            entry.update(w=img.width, h=img.height)
        else:
            shutil.copyfile(src, dst)
            if ext == '.svg':
                text = open(src, encoding='utf-8', errors='replace').read()
                if 'class="' in text and '<style' not in text:
                    warnings.append('%s: classes but no <style>: its colours are lost (renders black); use --master or fix the file' % rel)
                m = re.search(r'viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"', text)
                if m:
                    entry.update(w=round(float(m.group(1))), h=round(float(m.group(2))))
            if k == 'video':
                if not faststart(dst):
                    if shutil.which('ffmpeg'):
                        tmp = dst + '.tmp' + ext
                        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', tmp], check=True)
                        os.replace(tmp, dst)
                        warnings.append('%s: was not fast-start, rewritten with -movflags +faststart' % rel)
                    else:
                        warnings.append('%s: not fast-start (moov at the end) and no ffmpeg' % rel)
                if os.path.getsize(dst) > 6e6:
                    warnings.append('%s: %.1f MB video' % (rel, os.path.getsize(dst) / 1e6))
        entry['kb'] = round(os.path.getsize(os.path.join(theme, entry['src'])) / 1024)
        entry['sha1'] = sha1
        manifest[rel] = entry
        used[entry['src']] = rel
        added += 1


# ---------- pages: stylesheets, scripts, inline blocks ----------
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.css, self.js, self.styles, self.scripts, self._in = [], [], [], [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and 'stylesheet' in (a.get('rel') or '').lower() and a.get('href'):
            self.css.append(a['href'])
        elif tag == 'script':
            if a.get('src'):
                self.js.append((a['src'], a.get('type') or '', 'defer' in a, 'async' in a))
            elif (a.get('type') or 'text/javascript') in ('text/javascript', 'module', 'application/javascript', 'text/babel'):
                self._in = 'script'
                self.scripts.append('')
        elif tag == 'style':
            self._in = 'style'
            self.styles.append('')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self._in = None

    def handle_data(self, data):
        if self._in == 'style':
            self.styles[-1] += data
        elif self._in == 'script':
            self.scripts[-1] += data


css_order, js_order, google, js_pages = [], [], [], {}
os.makedirs(os.path.join(work, 'inline'), exist_ok=True)
for p in cfg['pages']:
    if p.get('of'):
        continue
    page_file = os.path.join(root, p['design'].split('?')[0])
    page_dir = os.path.dirname(p['design'].split('?')[0])
    parser = Page()
    parser.feed(open(page_file, encoding='utf-8', errors='replace').read())
    for href in parser.css:
        if 'fonts.googleapis.com' in href:
            google.append(href if href.startswith('http') else 'https:' + href)
        elif re.match(r'^(https?:)?//', href):
            warnings.append('%s: external stylesheet %s is not imported (self-host it or drop it)' % (p['key'], href))
        else:
            rel = os.path.normpath(os.path.join(page_dir, href.split('?')[0])).replace(os.sep, '/')
            if rel not in css_order:
                css_order.append(rel)
    for src, typ, defer, asy in parser.js:
        if RUNTIME.search(src):
            continue
        if re.match(r'^(https?:)?//', src):
            warnings.append('%s: external script %s is not imported' % (p['key'], src))
            continue
        rel = os.path.normpath(os.path.join(page_dir, src.split('?')[0])).replace(os.sep, '/')
        if typ == 'module':
            warnings.append('%s: %s is an ES module: copy it on its own, not into site.js' % (p['key'], rel))
            continue
        if rel not in js_order:
            js_order.append(rel)
        js_pages.setdefault(rel, []).append(p['key'])
    for ext, blocks in (('css', parser.styles), ('js', parser.scripts)):
        blocks = [b.strip() for b in blocks if b.strip()]
        if blocks:
            with open(os.path.join(work, 'inline', '%s.%s' % (p['key'], ext)), 'w', encoding='utf-8') as f:
                f.write('\n\n'.join(blocks) + '\n')
            warnings.append('%s: %d inline <%s> block(s) -> %s' % (p['key'], len(blocks), 'style' if ext == 'css' else 'script', os.path.join(work, 'inline', '%s.%s' % (p['key'], ext))))

# ---------- Google Fonts, self-hosted ----------
fonts_css = []
seen_urls = {}
for url in dict.fromkeys(google):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    text = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
    for subset, block in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})', text):
        if subset not in SUBSETS:
            continue
        family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        style = re.search(r'font-style:\s*(\w+)', block).group(1)
        furl = re.search(r'url\((https://[^)]+)\)', block).group(1)
        if furl not in seen_urls:
            name = '%s-%s-%s.woff2' % (re.sub(r'[^a-z0-9]+', '-', family.lower()).strip('-'), style, subset)
            if name in seen_urls.values():
                name = name.replace('.woff2', '-%s.woff2' % hashlib.sha1(furl.encode()).hexdigest()[:6])
            dst = os.path.join(theme, 'assets', 'fonts', 'google', name)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with urllib.request.urlopen(urllib.request.Request(furl, headers={'User-Agent': UA}), timeout=30) as r, open(dst, 'wb') as f:
                f.write(r.read())
            seen_urls[furl] = name
        fonts_css.append('/* %s */\n%s' % (subset, block.replace(furl, '../fonts/google/' + seen_urls[furl])))
with open(os.path.join(theme, 'assets', 'css', 'fonts.css'), 'w', encoding='utf-8') as f:
    f.write('/* Google Fonts the design loads, self-hosted by import_assets.py (subsets: %s).\n   Sources: %s */\n\n' % (', '.join(SUBSETS), ' '.join(dict.fromkeys(google)) or 'none') + '\n'.join(fonts_css) + '\n')


# ---------- stylesheets ----------
def rewrite_urls(css, css_rel):
    base = os.path.dirname(css_rel)

    def repl(m):
        raw = m.group(2).strip()
        if re.match(r'^(data:|https?:|//|#|/)', raw):
            return m.group(0)
        path, _, frag = raw.partition('#')
        path = path.split('?')[0]
        rel = os.path.normpath(os.path.join(base, path)).replace(os.sep, '/')
        if rel in manifest:
            new = os.path.relpath(os.path.join(theme, manifest[rel]['src']), os.path.join(theme, 'assets', 'css')).replace(os.sep, '/')
            return 'url("%s%s")' % (new, '#' + frag if frag else '')
        warnings.append('%s: url(%s) points to a file the export does not have' % (css_rel, raw))
        return m.group(0)
    return re.sub(r'url\(\s*(["\']?)([^"\')]+)\1\s*\)', repl, css)


def load_css(rel, depth=0):
    text = open(os.path.join(root, rel), encoding='utf-8', errors='replace').read()
    out, tops = [], []

    def imp(m):
        href = m.group(1) or m.group(2)
        if 'fonts.googleapis.com' in href:
            google_late.append(href)
            return ''
        if re.match(r'^(https?:)?//', href):
            tops.append(m.group(0))
            return ''
        child = os.path.normpath(os.path.join(os.path.dirname(rel), href)).replace(os.sep, '/')
        return load_css(child, depth + 1) if depth < 8 else ''
    text = re.sub(r'@import\s+(?:url\(\s*["\']?([^"\')]+)["\']?\s*\)|["\']([^"\']+)["\'])[^;]*;', imp, text)
    out.append(rewrite_urls(text, rel))
    return '\n'.join(tops + out)


google_late = []
css_parts = []
for rel in css_order:
    if not os.path.isfile(os.path.join(root, rel)):
        warnings.append('stylesheet %s is linked but missing from the export' % rel)
        continue
    css_parts.append('/* ==== %s ==== */\n%s' % (rel, load_css(rel)))
if google_late:
    warnings.append('@import of Google Fonts inside CSS (%s): add the URL to a page <link> list or self-host it by hand' % ', '.join(google_late))
with open(os.path.join(theme, 'assets', 'css', 'site.css'), 'w', encoding='utf-8') as f:
    f.write('/* The design\'s own CSS, verbatim except url()s, written by import_assets.py.\n'
            '   Do not edit: a new export re-runs the import. Port rules go in port.css. */\n\n' + '\n\n'.join(css_parts) + '\n')

# ---------- scripts ----------
js_parts = []
all_pages = [p['key'] for p in cfg['pages'] if not p.get('of')]
for rel in js_order:
    if not os.path.isfile(os.path.join(root, rel)):
        warnings.append('script %s is referenced but missing from the export' % rel)
        continue
    js_parts.append('/* ==== %s ==== */\n%s' % (rel, open(os.path.join(root, rel), encoding='utf-8', errors='replace').read()))
    if sorted(js_pages[rel]) != sorted(all_pages):
        warnings.append('%s loads only on %s: in site.js it runs on every page (make sure it tolerates missing elements)' % (rel, ', '.join(js_pages[rel])))
with open(os.path.join(theme, 'assets', 'js', 'site.js'), 'w', encoding='utf-8') as f:
    f.write('/* The design\'s own scripts, verbatim, written by import_assets.py. Port code goes in port.js. */\n\n' + '\n;\n'.join(js_parts) + '\n')

with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(manifest.items())), f, indent=1, ensure_ascii=False)
    f.write('\n')

# ---------- report ----------
by_kind = {}
for k, v in manifest.items():
    by_kind.setdefault(v['src'].split('/')[1], []).append(v.get('kb', 0))
print('media: %d added, %d already there · %s' % (added, kept, ' · '.join('%s %d (%.1f MB)' % (k, len(v), sum(v) / 1024) for k, v in sorted(by_kind.items()))))
print('fonts.css: %d @font-face, %d woff2 (%s)' % (len(fonts_css), len(seen_urls), ', '.join(sorted(seen_urls.values()))))
print('site.css: %s' % (', '.join(css_order) or 'no local stylesheet'))
print('site.js: %s' % (', '.join(js_order) or 'no local script'))
print('manifest: %s (%d entries)' % (manifest_path, len(manifest)))
for w in warnings:
    print('WARNING ' + w)
