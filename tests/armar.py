"""Arma tests/index.html: la web completa (src/) + un simulador de Google Sheets + datos de ejemplo.
Uso:  python3 tests/armar.py   (desde la raíz del repo)  ->  abrir tests/index.html en un navegador
También arma tests/vista_previa.html: la misma web lista para publicar como vista previa (Artifact de Claude),
sin las etiquetas <html>/<head>/<body> y con un aviso de que son datos de ejemplo.
"""
import json, re, pathlib
RAIZ = pathlib.Path(__file__).resolve().parent.parent
SRC, T = RAIZ / 'src', RAIZ / 'tests'
datos = json.loads((T / 'datos_ejemplo.json').read_text())
mock = (T / 'mock.js').read_text()
gs = '\n'.join((SRC / f).read_text() for f in ['Code.gs', 'Db.gs', 'Api.gs'])
html = (SRC / 'Index.html').read_text()
html = re.sub(r"<\?!= include\('(\w+)'\); \?>", lambda m: (SRC / f'{m.group(1)}.html').read_text(), html)
html = html.replace('<?= version ?>', (RAIZ / 'VERSION').read_text().strip())
pre = '<script>var __DATA=' + json.dumps(datos, ensure_ascii=False) + ';\n' + mock + '\n' + gs + '\n</script>'
html = html.replace('<div id="modal-root"></div>', '<div id="modal-root"></div>' + pre)
(T / 'index.html').write_text(html)
print('tests/index.html listo')

# Vista previa: el visor pone su propio <html>/<head>/<body>, así que se sacan.
AVISO = ('<div style="position:fixed;right:16px;bottom:16px;z-index:90;background:#a15c00;color:#fff;'
         'padding:8px 14px;border-radius:99px;font:600 12px/1.3 Inter,system-ui,sans-serif;'
         'box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:calc(100% - 32px)">'
         'Vista previa \u00b7 datos de ejemplo \u00b7 los cambios no se guardan</div>')
prev = re.sub(r'<!DOCTYPE html>\s*<html[^>]*>\s*<head>|</head>\s*<body>|</body>\s*</html>\s*$', '', html)
prev = prev.replace('<base target="_top">', '', 1)
prev = prev.replace('<title>Kraken Vóley</title>', '<title>Kraken Vóley (vista previa)</title>', 1)
prev = prev.replace('<div id="modal-root"></div>', AVISO + '<div id="modal-root"></div>', 1)
(T / 'vista_previa.html').write_text(prev)
print('tests/vista_previa.html listo')
