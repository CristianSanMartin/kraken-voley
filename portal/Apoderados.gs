/**
 * Kraken Apoderados — página que ven los apoderados (proyecto de Apps Script aparte de la web de gestión).
 *
 * Se abre con el enlace personal de cada familia: .../exec?f=<clave>. Está abierta a cualquiera con el enlace,
 * por eso NO toca Kraken_BD: solo lee la planilla "Kraken - Portal datos (no borrar)", donde la web de gestión
 * deja cada noche el resumen ya filtrado de cada familia. Todas las funciones auxiliares terminan en "_" para
 * que nadie pueda llamarlas desde el navegador.
 */

var NOMBRE_DATOS = 'Kraken - Portal datos (no borrar)';

function doGet(e) {
  var prm = (e && e.parameter) || {}, token = String(prm.f || '').trim(), datosId = String(prm.d || '').trim(), res;
  if (!token) res = { ok: false, motivo: 'inicio' };
  else if (!/^[A-Za-z0-9]{24,64}$/.test(token) || !/^[A-Za-z0-9_-]{25,80}$/.test(datosId)) res = { ok: false, motivo: 'enlace' };
  else {
    try {
      var fam = buscarFamilia_(datosId, token);
      res = fam ? { ok: true, familia: fam } : { ok: false, motivo: 'enlace' };
    } catch (err) { console.error(err); res = { ok: false, motivo: 'error', detalle: String(err && err.message || err).slice(0, 200) }; }
  }
  var t = HtmlService.createTemplateFromFile('Pagina');
  t.datos = JSON.stringify(res).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ' ');
  t.logo = HtmlService.createHtmlOutputFromFile('Logo').getContent();
  return t.evaluate()
    .setTitle('Kraken Vóley · Apoderados')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Busca la familia por su clave en la planilla de datos. Solo acepta la planilla que se llama exactamente
 * "Kraken - Portal datos (no borrar)": este script corre como Cristian, así que no abre ninguna otra aunque
 * alguien cambie la dirección del enlace.
 */
function buscarFamilia_(datosId, token) {
  var cache = CacheService.getScriptCache(), k = 'f_' + token, c = cache.get(k);
  if (c) return c === '-' ? null : JSON.parse(c);
  var ss;
  try { ss = SpreadsheetApp.openById(datosId); } catch (e) { return null; }
  if (ss.getName() !== NOMBRE_DATOS) return null;
  var v = ss.getSheets()[0].getDataRange().getValues(), fam = null;
  for (var i = 1; i < v.length; i++) { if (String(v[i][0]) === token) { fam = JSON.parse(String(v[i][2])); break; } }
  try { cache.put(k, fam ? JSON.stringify(fam) : '-', 300); } catch (e) { /* muy grande para el caché: no importa */ }
  return fam;
}
