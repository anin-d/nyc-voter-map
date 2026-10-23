"""One-file preview of the site for the claude.ai artifact viewer: CSS and JS inlined, Leaflet and topojson from CDNs,
data files published next to it. Non-ASCII characters in the inlined JavaScript are written as \\u escapes."""
import os, re, shutil
ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); W = f'{ROOT}/site'; P = f'{ROOT}/out/preview'
def js_ascii(s):
    out = []
    for ch in s:
        o = ord(ch)
        if o < 128: out.append(ch)
        elif o < 0x10000: out.append('\\u%04x' % o)
        else: o -= 0x10000; out.append('\\u%04x\\u%04x' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return ''.join(out)
html = open(f'{W}/index.html', encoding='utf-8').read()
body = html[html.index('<body>') + 6:html.index('</body>')]
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
css = open(f'{W}/vendor/leaflet.css').read() + '\n' + open(f'{W}/styles.css').read()
core, app = (js_ascii(open(f'{W}/{f}', encoding='utf-8').read()) for f in ('core.js', 'app.js'))
for s in (core, app): assert '</script' not in s
out = f'''<title>Open NYC</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{css}
</style>
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
<script>
{core}
</script>
<script>
{app}
</script>
'''
os.makedirs(P, exist_ok=True)
open(f'{P}/index.html', 'w', encoding='utf-8').write(out)
if os.path.exists(f'{P}/data'): shutil.rmtree(f'{P}/data')
shutil.copytree(f'{W}/data', f'{P}/data', ignore=shutil.ignore_patterns('2025-primary-rcv.json', '*.csv'))
print('preview', os.path.getsize(f'{P}/index.html'), 'bytes;', sum(len(fs) for _, _, fs in os.walk(f'{P}/data')), 'data files')
