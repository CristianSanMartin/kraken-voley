/**
 * Portal.gs — Datos para la página de apoderados ("Kraken Apoderados", carpeta portal/ del repo).
 *
 * Cada familia (hermanas juntas: mismo teléfono de apoderado, o mismo correo) tiene un ENLACE PERSONAL
 * con una clave larga al azar (?f=...). La página de apoderados es OTRO proyecto de Apps Script, abierto
 * a cualquiera con el enlace, que NO lee Kraken_BD: solo lee la planilla "Kraken - Portal datos (no borrar)",
 * donde esta web deja un resumen ya filtrado de cada familia (sin notas internas ni datos de otras alumnas).
 * El resumen se rehace cada noche (activador portalDiario) o con el botón "Actualizar ahora".
 * Registro privado de familias y claves: hoja Portal_Familias de Kraken_BD.
 */

var HOJA_FAMILIAS = 'Portal_Familias';
var COLS_FAMILIAS = ['Clave_Familia', 'Apoderado', 'Alumnas', 'Token', 'Estado', 'Ultima_Actualizacion'];
var NOMBRE_DATOS_PORTAL = 'Kraken - Portal datos (no borrar)';
var COLS_DATOS_PORTAL = ['Token', 'Familia', 'Datos', 'Actualizado'];
var FN_PORTAL_DIARIO = 'portalDiario';

/** Dirección de la página de apoderados: la escribe el actualizador en PortalUrl.gs; si no, Config.Portal_URL. */
function portalUrl_(cfg) {
  if (typeof PORTAL_URL !== 'undefined' && PORTAL_URL) return PORTAL_URL;
  return String((cfg || config_()).Portal_URL || '');
}

function correos_(txt) {
  return (String(txt || '').toLowerCase().match(/[^\s,;<>]+@[^\s,;<>]+\.[a-z]{2,}/g) || []).filter(function (c, i, a) { return a.indexOf(c) === i; });
}

/** Clave de familia: el teléfono del apoderado (9 dígitos), o su correo, o la alumna sola. */
function claveFamilia_(a) {
  var d = String(a.Telefono_Apoderado || '').replace(/\D/g, '');
  if (d.length >= 8) return 'TEL-' + d.slice(-8);
  var c = correos_(a.Email_Apoderado)[0];
  return c ? 'MAIL-' + c : 'ALU-' + a.ID_Alumna;
}

/**
 * Familias de alumnas Activas: quedan juntas las que comparten teléfono de apoderado, correo de apoderado
 * o están marcadas como hermanas en la ficha (columna Hermanos, con IDs de alumna). La clave de la familia
 * es la menor de las claves de sus integrantes, para que no cambie si se agrega otra hermana.
 */
function familias_(alumnas) {
  var activas = alumnas.filter(function (a) { return a.Estado === 'Activa'; }), padre = {}, porId = {};
  function raiz(x) { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; }
  function unir(x, y) { x = raiz(x); y = raiz(y); if (x !== y) padre[x < y ? y : x] = x < y ? x : y; }
  activas.forEach(function (a) { porId[a.ID_Alumna] = a; padre[a.ID_Alumna] = a.ID_Alumna; });
  var vistos = {};
  activas.forEach(function (a) {
    var llaves = [];
    var d = String(a.Telefono_Apoderado || '').replace(/\D/g, '');
    if (d.length >= 8) llaves.push('TEL-' + d.slice(-8));
    correos_(a.Email_Apoderado).forEach(function (c) { llaves.push('MAIL-' + c); });
    llaves.forEach(function (k) { if (vistos[k]) unir(vistos[k], a.ID_Alumna); else vistos[k] = a.ID_Alumna; });
    String(a.Hermanos || '').split(/[\s,;]+/).forEach(function (h) { if (porId[h]) unir(h, a.ID_Alumna); });
  });
  var grupos = {};
  activas.forEach(function (a) { var r = raiz(a.ID_Alumna); (grupos[r] = grupos[r] || []).push(a); });
  var fam = {};
  Object.keys(grupos).forEach(function (r) {
    var k = grupos[r].map(claveFamilia_).sort()[0];
    fam[k] = { clave: k, alumnas: grupos[r] };
  });
  return fam;
}

function hojaFamilias_() {
  var sh = ss_().getSheetByName(HOJA_FAMILIAS);
  if (!sh) { sh = ss_().insertSheet(HOJA_FAMILIAS); sh.getRange(1, 1, 1, COLS_FAMILIAS.length).setValues([COLS_FAMILIAS]); }
  asegurarColumnas_(HOJA_FAMILIAS, COLS_FAMILIAS);
  return leer_(HOJA_FAMILIAS);
}

function guardarClaveConfig_(clave, valor, desc) {
  var t = leer_('Config'), row = t.rows.filter(function (r) { return r.Clave === clave; })[0];
  if (row) actualizar_('Config', row._row, { Valor: valor }, t.h);
  else agregar_('Config', [{ Clave: clave, Valor: valor, Descripcion: desc }]);
}

/** Planilla de datos que lee la página de apoderados (se crea sola en el Drive; su ID queda en Config.Portal_Datos_ID). */
function planillaDatosPortal_() {
  var id = config_().Portal_Datos_ID;
  if (id) { try { return SpreadsheetApp.openById(String(id)); } catch (e) { /* la borraron: se crea otra */ } }
  var ss = SpreadsheetApp.create(NOMBRE_DATOS_PORTAL);
  guardarClaveConfig_('Portal_Datos_ID', ss.getId(), 'Planilla que lee la página de apoderados (se llena sola, no borrar)');
  return ss;
}

function mesLargo_(mes) { return mes ? MESES_ES[Number(String(mes).slice(5, 7)) - 1] + ' ' + String(mes).slice(0, 4) : ''; }
function fechaCl_(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : (f || ''); }

/** Resumen de una familia para la página de apoderados. Solo datos de sus hijas; nunca notas internas. */
function datosFamilia_(fam, D) {
  var hoy = D.hoy, mesHoy = hoy.slice(0, 7), maxInj = num_(D.cfg.Max_Inasistencias_Injustificadas_Mes) || 3;
  var torNom = {}, enCurso = {};
  D.tor.forEach(function (t) { torNom[t.ID_Torneo] = t.Nombre; if (t.Estado !== 'Finalizado') enCurso[t.ID_Torneo] = true; });
  var apoderado = fam.alumnas.map(function (a) { return a.Apoderado; }).filter(String)[0] || '';

  var alumnas = fam.alumnas.map(function (a) {
    var id = a.ID_Alumna;
    // Pagos: últimos 24 meses, sin "Sin registro" (meses del Excel sin detalle)
    var mens = D.mens.filter(function (m) { return m.ID_Alumna === id && m.Estado !== 'Sin registro'; })
      .sort(function (x, y) { return x.Mes < y.Mes ? 1 : -1; });
    var deuda = 0, mes = null;
    var pagos = mens.map(function (m) {
      var monto = num_(m.Monto_Esperado) || num_(m.Monto_Pagado) || (ESTADOS_DEUDA.indexOf(m.Estado) >= 0 ? num_(a.Tarifa) : 0);
      var estado = estaAtrasada_(m, D.cfg, hoy) ? 'Atrasada' : m.Estado;
      if (ESTADOS_DEUDA.indexOf(m.Estado) >= 0) deuda += monto;
      var p = { mes: m.Mes, mesLabel: mesLargo_(m.Mes), monto: monto, pagado: num_(m.Monto_Pagado), estado: estado,
        fecha: fechaCl_(m.Fecha_Pago), medio: m.Medio_Pago || '', comprobante: !!m.Comprobante };
      if (m.Mes === mesHoy) mes = p;
      return p;
    }).slice(0, 24);

    // Asistencia (desde Config.Asistencia_Desde)
    var asis = D.asis.filter(function (r) { return r.ID_Alumna === id; }).sort(function (x, y) { return x.Fecha < y.Fecha ? 1 : -1; });
    var delMes = { presentes: 0, justificadas: 0, injustificadas: 0 };
    asis.forEach(function (r) {
      if (String(r.Fecha).slice(0, 7) !== mesHoy) return;
      if (r.Estado === 'Presente') delMes.presentes++;
      else if (r.Estado === 'Justificada') delMes.justificadas++;
      else if (r.Estado === 'Injustificada' || r.Estado === 'Ausente') delMes.injustificadas++;
    });

    // Torneos en curso donde juega
    var misTor = {};
    D.pla.forEach(function (p) { if (p.ID_Alumna === id && enCurso[p.ID_Torneo]) misTor[p.ID_Torneo] = true; });
    var partidos = D.par.filter(function (p) { return misTor[p.ID_Torneo]; })
      .sort(function (x, y) { return String(x.Fecha) < String(y.Fecha) ? -1 : 1; })
      .map(function (p) {
        return { fecha: fechaCl_(p.Fecha), proximo: !!p.Fecha && String(p.Fecha) >= hoy, torneo: torNom[p.ID_Torneo] || '', serie: p.Serie || '',
          etapa: p.Etapa || '', rival: p.Rival || '', resultado: p.Resultado || '',
          sets: p.Sets_Kraken != null && p.Sets_Rival != null ? p.Sets_Kraken + '-' + p.Sets_Rival : '' };
      });
    var cuotas = D.cuo.filter(function (c) { return c.ID_Alumna === id && misTor[c.ID_Torneo] && num_(c.Monto) > 0; })
      .map(function (c) { return { torneo: torNom[c.ID_Torneo] || '', concepto: c.Concepto || '', monto: num_(c.Monto) }; });

    var CAMPOS = [['Nombre_Completo', 'Nombre completo'], ['RUT', 'RUT'], ['Fecha_Nacimiento', 'Fecha de nacimiento'], ['Grupo_Actual', 'Grupo'],
      ['Dorsal', 'Dorsal'], ['Posicion', 'Posición'], ['Talla', 'Talla'], ['Colegio', 'Colegio'], ['Curso', 'Curso'], ['Jornada', 'Jornada'],
      ['Direccion', 'Dirección'], ['Apoderado', 'Apoderado'], ['Telefono_Apoderado', 'Teléfono apoderado'], ['Email_Apoderado', 'Correo apoderado'],
      ['Condicion_Medica', 'Condición médica'], ['Autoriza_Emergencia', 'Autoriza atención de emergencia'], ['Autoriza_Imagen', 'Autoriza uso de imagen']];
    var ficha = CAMPOS.map(function (c) { var v = a[c[0]]; if (c[0] === 'Fecha_Nacimiento') v = fechaCl_(v); return [c[1], v == null || v === '' ? '' : String(v)]; });

    return { nombre: a.Nombre, grupo: a.Grupo_Actual || '', dorsal: a.Dorsal || '', posicion: a.Posicion || '', tarifa: num_(a.Tarifa),
      mes: mes, mesLabel: mesLargo_(mesHoy), deuda: deuda, pagos: pagos,
      asistencia: { mesLabel: mesLargo_(mesHoy), delMes: delMes, alerta: delMes.injustificadas > maxInj,
        lista: asis.slice(0, 40).map(function (r) { return { fecha: fechaCl_(r.Fecha), estado: r.Estado === 'Ausente' ? 'Injustificada' : r.Estado, motivo: r.Motivo || '' }; }) },
      partidos: partidos, cuotas: cuotas, ficha: ficha };
  }).sort(function (x, y) { return String(x.nombre).localeCompare(String(y.nombre)); });

  return {
    apoderado: apoderado, actualizado: fechaCl_(hoy) + ' ' + Utilities.formatDate(new Date(), TZ, 'HH:mm'),
    diaLimite: diaLimite_(D.cfg), maxInj: maxInj,
    transferencia: String(D.cfg.Plantilla_Datos_Transferencia || '').replace(/\{(Transferencia_[A-Za-z]+)\}/g, function (m, k) { return D.cfg[k] || ''; }),
    contacto: String(D.cfg.Telefono_Contacto || ''),
    alumnas: alumnas
  };
}

function datosBase_() {
  var cfg = config_();
  return { cfg: cfg, hoy: hoyStr_(), mens: leer_('Mensualidades').rows, asis: asistencia_(cfg), tor: leer_('Torneos').rows,
    pla: leer_('Torneo_Plantel').rows, par: leer_('Partidos').rows, cuo: leer_('Torneo_Cuotas').rows };
}

function tokenNuevo_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

/**
 * Rehace todos los resúmenes: da enlace (token) a las familias nuevas y deja en la planilla de datos
 * solo las familias con alumnas activas (las que se retiraron pierden el acceso: su enlace deja de abrir).
 * nuevoEnlaceDe: Clave_Familia a la que se le cambia el enlace (el anterior deja de funcionar).
 */
function portalActualizar_(nuevoEnlaceDe) {
  var D = datosBase_(), fam = familias_(leer_('Alumnas').rows), ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var filasDatos = [COLS_DATOS_PORTAL], res = { familias: 0, nuevas: 0, sinAcceso: 0 };
  conLock_(function () {
    var reg = hojaFamilias_(), porClave = {};
    reg.rows.forEach(function (r) { porClave[r.Clave_Familia] = r; });
    Object.keys(fam).sort().forEach(function (k) {
      var r = porClave[k], f = fam[k];
      if (!r) {
        // familia recién juntada: hereda la fila (y el enlace) de una integrante que ya tenía uno
        r = f.alumnas.map(claveFamilia_).map(function (c) { return porClave[c]; }).filter(function (x) { return x && x.Token && x.Estado !== 'Sin acceso'; })[0] || null;
        if (r) { delete porClave[r.Clave_Familia]; porClave[k] = r; }
      }
      var token = r && r.Token && k !== nuevoEnlaceDe ? String(r.Token) : tokenNuevo_();
      var d = datosFamilia_(f, D), datos = { Clave_Familia: k, Apoderado: d.apoderado, Alumnas: f.alumnas.map(function (a) { return a.Nombre; }).join(', '),
        Token: token, Estado: 'Activo', Ultima_Actualizacion: ahora };
      if (r) actualizar_(HOJA_FAMILIAS, r._row, datos, reg.h); else { agregar_(HOJA_FAMILIAS, [datos]); res.nuevas++; }
      filasDatos.push([token, d.apoderado || datos.Alumnas, JSON.stringify(d), ahora]);
      res.familias++;
    });
    var usadas = {};
    Object.keys(porClave).forEach(function (k) { usadas[porClave[k]._row] = true; });
    reg.rows.forEach(function (r) {
      if (!usadas[r._row] && !fam[r.Clave_Familia] && r.Estado !== 'Sin acceso') { actualizar_(HOJA_FAMILIAS, r._row, { Estado: 'Sin acceso', Ultima_Actualizacion: ahora }, reg.h); res.sinAcceso++; }
    });
  });
  var sh = planillaDatosPortal_().getSheets()[0];
  sh.clear();
  sh.getRange(1, 1, filasDatos.length, COLS_DATOS_PORTAL.length).setValues(filasDatos);
  log_('Portal apoderados', HOJA_FAMILIAS, nuevoEnlaceDe || '', res.familias + ' familias, ' + res.nuevas + ' nuevas, ' + res.sinAcceso + ' sin acceso');
  return res;
}

/** Lo ejecuta el activador diario (de madrugada). */
function portalDiario() { portalActualizar_(); }

/** true/false según el activador diario; null si Google aún no da el permiso de activadores (falta correr "autorizar"). */
function portalDiarioActivo_() {
  try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === FN_PORTAL_DIARIO; }); }
  catch (e) { return null; }
}

/* ---------- Llamadas desde la web ---------- */

function api_portalEstado() {
  return run_(function () {
    var cfg = config_(), url = portalUrl_(cfg), fam = familias_(leer_('Alumnas').rows), reg = hojaFamilias_(), porClave = {};
    reg.rows.forEach(function (r) { porClave[r.Clave_Familia] = r; });
    var filas = Object.keys(fam).map(function (k) {
      var r = porClave[k] || {}, as = fam[k].alumnas;
      return { clave: k, apoderado: as.map(function (a) { return a.Apoderado; }).filter(String)[0] || '',
        alumnas: as.map(function (a) { return a.Nombre; }), ids: as.map(function (a) { return a.ID_Alumna; }), telefono: as.map(function (a) { return a.Telefono_Apoderado; }).filter(String)[0] || '',
        enlace: r.Token && url ? url + '?f=' + r.Token : '', tieneToken: !!r.Token, actualizada: r.Ultima_Actualizacion || '' };
    }).sort(function (x, y) { return String(x.apoderado || x.alumnas[0]).localeCompare(String(y.apoderado || y.alumnas[0])); });
    return { familias: filas, portalUrl: url, diario: portalDiarioActivo_(),
      sinTelefono: filas.filter(function (f) { return !f.telefono; }).length };
  });
}

function api_portalActualizar() {
  return run_(function () { return portalActualizar_(); });
}

/** Junta dos familias (ej. hermanas con distinto teléfono en la ficha): las marca como hermanas en la columna Hermanos. */
function api_portalJuntar(claveA, claveB) {
  return run_(function () {
    var t = leer_('Alumnas'), fam = familias_(t.rows);
    if (!fam[claveA] || !fam[claveB] || claveA === claveB) throw new Error('Elige dos familias distintas');
    var todas = fam[claveA].alumnas.concat(fam[claveB].alumnas), ids = todas.map(function (a) { return a.ID_Alumna; });
    conLock_(function () {
      todas.forEach(function (a) {
        var otros = String(a.Hermanos || '').split(/[\s,;]+/).filter(String);
        ids.forEach(function (id) { if (id !== a.ID_Alumna && otros.indexOf(id) < 0) otros.push(id); });
        actualizar_('Alumnas', a._row, { Hermanos: otros.join(', ') }, t.h);
      });
      log_('Juntar familias', 'Alumnas', ids.join(', '), 'Marcadas como hermanas para la página de apoderados');
    });
    return portalActualizar_();
  });
}

/** Cambia el enlace de una familia (por si lo reenviaron): el anterior deja de funcionar. */
function api_portalNuevoEnlace(clave) {
  return run_(function () {
    if (!clave) throw new Error('Falta la familia');
    return portalActualizar_(String(clave));
  });
}

/** Activa o desactiva la actualización automática de cada noche (entre 3 y 4 AM). */
function api_portalDiario(activar) {
  return run_(function () {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === FN_PORTAL_DIARIO) ScriptApp.deleteTrigger(t); });
    if (activar) ScriptApp.newTrigger(FN_PORTAL_DIARIO).timeBased().everyDays(1).atHour(3).create();
    log_('Portal apoderados', HOJA_FAMILIAS, '', activar ? 'Actualización diaria activada' : 'Actualización diaria desactivada');
    return { diario: !!activar };
  });
}

/** Solo para la vista previa (tests/armar.py): el resumen de la familia con más datos, como lo vería el apoderado. */
function portalVistaPrevia_() {
  var D = datosBase_(), fam = familias_(leer_('Alumnas').rows), mejor = null, puntos = -1;
  Object.keys(fam).forEach(function (k) {
    var d = datosFamilia_(fam[k], D), p = d.alumnas.length * 100 + d.alumnas.reduce(function (s, a) { return s + a.partidos.length + a.asistencia.lista.length + (a.deuda ? 5 : 0); }, 0);
    if (p > puntos) { puntos = p; mejor = d; }
  });
  return mejor;
}
