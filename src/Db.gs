/**
 * Db.gs — Acceso a la base de datos (Google Sheets).
 * Todas las hojas se leen y escriben por NOMBRE DE ENCABEZADO (fila 1),
 * así que el orden de las columnas puede cambiar sin romper la web.
 */

// La web usa la hoja a la que está vinculado el script (Kraken_BD: Extensiones > Apps Script).
// Si algún día el script se separa de la hoja, guarda el ID en Propiedades del script con la clave SS_ID.
var TZ = 'America/Santiago';

// Columnas que siempre se guardan como TEXTO (para que Sheets no las convierta en fecha/número)
var COLS_TEXTO = ['Mes', 'Ola', 'RUT', 'Telefono_Apoderado', 'Dorsal', 'Curso', 'Talla', 'Numero', 'Mes_Ingreso', 'Ultimo_Mes', 'Hermanos'];

var _ssCache = null;
function ss_() {
  if (_ssCache) return _ssCache;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
    if (!id) throw new Error('El script no está vinculado a Kraken_BD. Créalo desde la hoja (Extensiones > Apps Script) o define la propiedad SS_ID.');
    ss = SpreadsheetApp.openById(id);
  }
  _ssCache = ss;
  return ss;
}

function hoja_(nombre) {
  var sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error('No existe la hoja "' + nombre + '" en Kraken_BD');
  return sh;
}

function fmtFecha_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function fmtMes_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function hoyStr_() { return fmtFecha_(new Date()); }
function mesActual_() { return fmtMes_(new Date()); }

/** Convierte un valor de celda a algo serializable para la web. */
function normVal_(v, col) {
  if (v instanceof Date) {
    if (col === 'Mes' || col === 'Ola' || col === 'Mes_Ingreso' || col === 'Ultimo_Mes') return fmtMes_(v);
    if (col === 'Fecha' && v.getHours && (v.getHours() || v.getMinutes())) {
      return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
    }
    return fmtFecha_(v);
  }
  if (v === '') return null;
  return v;
}

/**
 * Lee una hoja completa.
 * @return {{sh:Sheet, h:string[], rows:Object[]}} cada fila trae _row (número de fila en la hoja).
 */
function leer_(nombre) {
  var sh = hoja_(nombre);
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 1) return { sh: sh, h: [], rows: [] };
  var v = sh.getRange(1, 1, lr, lc).getValues();
  var h = v[0].map(function (x) { return String(x).trim(); });
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], vacia = true;
    for (var j = 0; j < r.length; j++) { if (r[j] !== '' && r[j] !== null) { vacia = false; break; } }
    if (vacia) continue;
    var o = { _row: i + 1 };
    for (var k = 0; k < h.length; k++) { if (h[k]) o[h[k]] = normVal_(r[k], h[k]); }
    rows.push(o);
  }
  return { sh: sh, h: h, rows: rows };
}

/** Prepara un valor para escribirlo en la celda según la columna. */
function celda_(col, v) {
  if (v === undefined || v === null) return '';
  if (COLS_TEXTO.indexOf(col) >= 0 && v !== '') return "'" + String(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && /Fecha/.test(col)) {
    var p = v.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  return v;
}

function filaDesdeObj_(h, obj) {
  return h.map(function (col) { return celda_(col, obj[col]); });
}

/** Agrega varias filas al final de una hoja (en un solo llamado). */
function agregar_(nombre, objs) {
  if (!objs.length) return;
  var sh = hoja_(nombre);
  var lc = sh.getLastColumn();
  var h = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); });
  var data = objs.map(function (o) { return filaDesdeObj_(h, o); });
  sh.getRange(sh.getLastRow() + 1, 1, data.length, h.length).setValues(data);
}

/** Actualiza columnas puntuales de una fila (por número de fila). */
function actualizar_(nombre, fila, cambios, hCache) {
  var sh = hoja_(nombre);
  var h = hCache || sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  Object.keys(cambios).forEach(function (col) {
    var c = h.indexOf(col);
    if (c < 0) throw new Error('La hoja ' + nombre + ' no tiene la columna ' + col);
    sh.getRange(fila, c + 1).setValue(celda_(col, cambios[col]));
  });
}

/** Busca una fila por el valor de su columna ID. */
function buscarPorId_(nombre, colId, id) {
  var t = leer_(nombre);
  for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i][colId]) === String(id)) return { t: t, row: t.rows[i] };
  throw new Error('No encontré ' + id + ' en ' + nombre);
}

/** Siguiente ID correlativo: PREFIJO-000. */
function siguienteId_(rows, colId, prefijo, largo) {
  var max = 0;
  rows.forEach(function (r) {
    var m = String(r[colId] || '').match(/(\d+)$/);
    if (m && String(r[colId]).indexOf(prefijo) === 0) max = Math.max(max, Number(m[1]));
  });
  return function () { max++; return prefijo + '-' + ('0000000' + max).slice(-largo); };
}

function conLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function log_(accion, hojaNombre, id, detalle) {
  try {
    var usuario = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'web';
    agregar_('Log', [{ Fecha: new Date(), Usuario: usuario, Accion: accion, Hoja: hojaNombre, ID: id == null ? '' : "'" + id, Detalle: detalle == null ? '' : "'" + detalle }]);
  } catch (e) { /* el log nunca debe botar una operación */ }
}

/** Config como objeto clave → valor */
function config_() {
  var o = {};
  leer_('Config').rows.forEach(function (r) { if (r.Clave) o[r.Clave] = r.Valor; });
  return o;
}
