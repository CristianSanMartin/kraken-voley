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
  var token = String((e && e.parameter && e.parameter.f) || '').trim(), res;
  if (!token) res = { ok: false, motivo: 'inicio' };
  else if (!/^[A-Za-z0-9]{24,64}$/.test(token)) res = { ok: false, motivo: 'enlace' };
  else {
    try {
      var fam = buscarFamilia_(token);
      res = fam ? { ok: true, familia: fam } : { ok: false, motivo: 'enlace' };
    } catch (err) { res = { ok: false, motivo: 'error' }; }
  }
  var t = HtmlService.createTemplateFromFile('Pagina');
  t.datos = JSON.stringify(res).replace(/</g, '\\u003c').replace(/ | /g, ' ');
  t.logo = HtmlService.createHtmlOutputFromFile('Logo').getContent();
  return t.evaluate()
    .setTitle('Kraken Vóley · Apoderados')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Busca la familia por su clave. Lee la planilla de datos (se guarda su ID después de encontrarla la primera vez). */
function buscarFamilia_(token) {
  var cache = CacheService.getScriptCache(), k = 'f_' + token, c = cache.get(k);
  if (c) return c === '-' ? null : JSON.parse(c);
  var v = hojaDatos_().getDataRange().getValues(), fam = null;
  for (var i = 1; i < v.length; i++) { if (String(v[i][0]) === token) { fam = JSON.parse(String(v[i][2])); break; } }
  try { cache.put(k, fam ? JSON.stringify(fam) : '-', 300); } catch (e) { /* muy grande para el caché: no importa */ }
  return fam;
}

/** La planilla de datos debe ser del mismo dueño que este script (nadie puede "colar" otra con el mismo nombre). */
function hojaDatos_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('DATOS_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) { props.deleteProperty('DATOS_ID'); } }
  var yo = String(Session.getEffectiveUser().getEmail()).toLowerCase(), it = DriveApp.getFilesByName(NOMBRE_DATOS);
  while (it.hasNext()) {
    var f = it.next(), dueno = f.getOwner();
    if (dueno && String(dueno.getEmail()).toLowerCase() === yo) {
      props.setProperty('DATOS_ID', f.getId());
      return SpreadsheetApp.openById(f.getId()).getSheets()[0];
    }
  }
  throw new Error('No encontré la planilla de datos');
}
