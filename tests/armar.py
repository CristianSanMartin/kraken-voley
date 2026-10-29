"""Arma tests/index.html: la web completa (src/) + un simulador de Google Sheets + datos de ejemplo.
Uso:  python3 tests/armar.py   (desde la raíz del repo)  ->  abrir tests/index.html en un navegador
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
