/**
 * Portal.gs — Planilla de Google por familia ("portal de apoderados").
 *
 * Cada correo de apoderado (Alumnas.Email_Apoderado, de alumnas Activas) recibe una planilla propia,
 * compartida SOLO con ese Gmail (como lector), con todas sus hijas juntas: Resumen, Pagos, Asistencia,
 * Partidos y Ficha. Google se encarga del ingreso: el apoderado la abre con su cuenta.
 * Las planillas viven en Drive > "Kraken - Portal apoderados" y se rehacen cada noche (activador diario)
 * o con el botón "Actualizar planillas". El registro de cada familia queda en la hoja Portal_Apoderados.
 * Nunca se muestran notas internas (Nota de mensualidad, Observaciones) ni datos de otras alumnas.
 */

var HOJA_PORTAL = 'Portal_Apoderados';
var COLS_PORTAL = ['Email', 'Apoderado', 'Alumnas', 'ID_Archivo', 'URL', 'Estado', 'Ultima_Actualizacion', 'Error'];
var FN_PORTAL_DIARIO = 'portalDiario';
var MAX_MS_PORTAL = 270000; // 4,5 min: Apps Script corta a los 6

/** Correos de un campo de ficha (puede traer varios separados por coma, espacio o punto y coma). */
function correos_(txt) {
  return (String(txt || '').toLowerCase().match(/[^\s,;<>]+@[^\s,;<>]+\.[a-z]{2,}/g) || []).filter(function (c, i, a) { return a.indexOf(c) === i; });
}

/** Familias = correos de apoderado de las alumnas Activas, cada una con sus hijas. */
function familias_(alumnas) {
  var fam = {};
  alumnas.filter(function (a) { return a.Estado === 'Activa'; }).forEach(function (a) {
    correos_(a.Email_Apoderado).forEach(function (c) {
      fam[c] = fam[c] || { email: c, alumnas: [] };
      fam[c].alumnas.push(a);
    });
  });
  return fam;
}

function hojaPortal_() {
  var sh = ss_().getSheetByName(HOJA_PORTAL);
  if (!sh) { sh = ss_().insertSheet(HOJA_PORTAL); sh.getRange(1, 1, 1, COLS_PORTAL.length).setValues([COLS_PORTAL]); }
  asegurarColumnas_(HOJA_PORTAL, COLS_PORTAL);
  return leer_(HOJA_PORTAL);
}

/** Carpeta del Drive donde quedan las planillas de las familias (su ID queda en Config.Carpeta_Portal). */
function carpetaPortal_() {
  var id = config_().Carpeta_Portal;
  if (id) { try { return DriveApp.getFolderById(String(id)); } catch (e) { /* la borraron: se crea otra */ } }
  var it = DriveApp.getFoldersByName('Kraken - Portal apoderados');
  var f = it.hasNext() ? it.next() : DriveApp.createFolder('Kraken - Portal apoderados');
  var t = leer_('Config'), row = t.rows.filter(function (r) { return r.Clave === 'Carpeta_Portal'; })[0];
  if (row) actualizar_('Config', row._row, { Valor: f.getId() }, t.h);
  else agregar_('Config', [{ Clave: 'Carpeta_Portal', Valor: f.getId(), Descripcion: 'Carpeta del Drive con las planillas de los apoderados (se llena sola)' }]);
  return f;
}

function mesLargo_(mes) { return mes ? MESES_ES[Number(String(mes).slice(5, 7)) - 1] + ' ' + String(mes).slice(0, 4) : ''; }
function fechaCl_(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : (f || ''); }

/** Arma el contenido de la planilla de una familia (sin tocar Drive): { pestaña: { titulo, filas } }. */
function contenidoFamilia_(fam, D) {
  var hoy = D.hoy, mesHoy = hoy.slice(0, 7), ids = {};
  fam.alumnas.forEach(function (a) { ids[a.ID_Alumna] = a; });
  var nombre = function (id) { return (ids[id] || {}).Nombre || ''; };
  var apoderado = fam.alumnas.map(function (a) { return a.Apoderado; }).filter(String)[0] || '';

  // Pagos (sin "Sin registro", que son meses del Excel sin detalle)
  var mens = D.mens.filter(function (m) { return ids[m.ID_Alumna] && m.Estado !== 'Sin registro'; })
    .sort(function (a, b) { return a.Mes < b.Mes ? 1 : a.Mes > b.Mes ? -1 : nombre(a.ID_Alumna).localeCompare(nombre(b.ID_Alumna)); });
  var deuda = {}, estadoMes = {};
  var pagos = mens.map(function (m) {
    var a = ids[m.ID_Alumna], esperado = num_(m.Monto_Esperado) || (ESTADOS_DEUDA.indexOf(m.Estado) >= 0 ? num_(a.Tarifa) : 0);
    var atrasada = estaAtrasada_(m, D.cfg, hoy), estado = atrasada ? 'Atrasada' : m.Estado;
    if (ESTADOS_DEUDA.indexOf(m.Estado) >= 0) deuda[m.ID_Alumna] = (deuda[m.ID_Alumna] || 0) + esperado;
    if (m.Mes === mesHoy) estadoMes[m.ID_Alumna] = estado;
    return [mesLargo_(m.Mes), a.Nombre, esperado || num_(m.Monto_Pagado) || '', num_(m.Monto_Pagado) || '', estado, fechaCl_(m.Fecha_Pago), m.Medio_Pago || '', m.Comprobante || ''];
  });

  // Asistencia (desde Config.Asistencia_Desde)
  var injMes = {};
  var asis = D.asis.filter(function (r) { return ids[r.ID_Alumna]; })
    .sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : a.Fecha > b.Fecha ? -1 : 0; })
    .map(function (r) {
      if (String(r.Fecha).slice(0, 7) === mesHoy && r.Estado === 'Injustificada') injMes[r.ID_Alumna] = (injMes[r.ID_Alumna] || 0) + 1;
      return [fechaCl_(r.Fecha), nombre(r.ID_Alumna), r.Estado || '', r.Motivo || ''];
    });

  // Torneos en curso donde juega alguna hija: partidos (próximos y jugados) y cuotas
  var torNom = {}, enCurso = {};
  D.tor.forEach(function (t) { torNom[t.ID_Torneo] = t.Nombre; if (t.Estado !== 'Finalizado') enCurso[t.ID_Torneo] = true; });
  var misTor = {};
  D.pla.forEach(function (p) { if (ids[p.ID_Alumna] && enCurso[p.ID_Torneo]) misTor[p.ID_Torneo] = true; });
  var partidos = D.par.filter(function (p) { return misTor[p.ID_Torneo]; })
    .sort(function (a, b) { return String(a.Fecha) < String(b.Fecha) ? -1 : 1; })
    .map(function (p) {
      var res = p.Resultado ? p.Resultado + (p.Sets_Kraken != null && p.Sets_Rival != null ? ' ' + p.Sets_Kraken + '-' + p.Sets_Rival : '') : (String(p.Fecha) >= hoy ? 'Próximo' : '');
      return [fechaCl_(p.Fecha), torNom[p.ID_Torneo] || '', p.Serie || '', p.Etapa || '', p.Rival || 'Por confirmar', res];
    });
  var cuotas = D.cuo.filter(function (c) { return ids[c.ID_Alumna] && misTor[c.ID_Torneo] && num_(c.Monto) > 0; })
    .map(function (c) { return [torNom[c.ID_Torneo] || '', nombre(c.ID_Alumna), c.Concepto || '', num_(c.Monto)]; });

  // Ficha (solo lo útil para que el apoderado revise; sin observaciones internas)
  var CAMPOS = [['Nombre', 'Nombre'], ['Nombre_Completo', 'Nombre completo'], ['RUT', 'RUT'], ['Fecha_Nacimiento', 'Fecha de nacimiento'],
    ['Grupo_Actual', 'Grupo'], ['Dorsal', 'Dorsal'], ['Posicion', 'Posición'], ['Talla', 'Talla'], ['Colegio', 'Colegio'], ['Curso', 'Curso'],
    ['Jornada', 'Jornada'], ['Direccion', 'Dirección'], ['Apoderado', 'Apoderado'], ['Telefono_Apoderado', 'Teléfono apoderado'],
    ['Email_Apoderado', 'Correo apoderado'], ['Condicion_Medica', 'Condición médica'], ['Autoriza_Emergencia', 'Autoriza atención de emergencia'],
    ['Autoriza_Imagen', 'Autoriza uso de imagen'], ['Tarifa', 'Mensualidad']];
  var ficha = [];
  fam.alumnas.forEach(function (a, i) {
    if (i) ficha.push(['', '']);
    ficha.push([a.Nombre, '']);
    CAMPOS.forEach(function (c) {
      var v = a[c[0]];
      if (c[0] === 'Fecha_Nacimiento') v = fechaCl_(v);
      ficha.push([c[1], v == null || v === '' ? '—' : v]);
    });
  });

  var trans = String(D.cfg.Plantilla_Datos_Transferencia || '').replace(/\{(Transferencia_[A-Za-z]+)\}/g, function (m, k) { return D.cfg[k] || ''; });
  var resumen = fam.alumnas.map(function (a) {
    return [a.Nombre, a.Grupo_Actual || '', estadoMes[a.ID_Alumna] || 'Sin registro aún', deuda[a.ID_Alumna] || 0, injMes[a.ID_Alumna] || 0];
  });
  var total = resumen.reduce(function (s, r) { return s + r[3]; }, 0);
  var maxInj = num_(D.cfg.Max_Inasistencias_Injustificadas_Mes) || 3;
  var avisos = resumen.filter(function (r) { return r[4] > maxInj; }).map(function (r) { return [r[0] + ' tiene ' + r[4] + ' inasistencias injustificadas este mes (máximo ' + maxInj + ', Estatutos 5.2).']; });

  return {
    apoderado: apoderado,
    tabs: [
      { nombre: 'Resumen', titulo: 'Kraken Vóley · ' + (apoderado ? 'Familia de ' + apoderado : fam.email),
        sub: 'Actualizado el ' + fechaCl_(hoy) + '. Se actualiza sola cada noche. Solo tú puedes ver esta planilla.',
        enc: ['Alumna', 'Grupo', 'Mensualidad ' + mesLargo_(mesHoy), 'Total por pagar', 'Injustificadas este mes'], filas: resumen,
        pie: [[''], ['Total por pagar: $' + String(Math.round(total)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')]].concat(avisos.length ? [['']].concat(avisos) : [])
          .concat([[''], ['Datos para transferir'], [trans || 'Pídeselos a Cristian.'], [''], ['¿Ves algún dato incorrecto? Avísale a Cristian por WhatsApp.']]),
        anchos: [220, 110, 190, 140, 170], dinero: [4] },
      { nombre: 'Pagos', titulo: 'Mensualidades', sub: 'Pago dentro de los primeros ' + diaLimite_(D.cfg) + ' días de cada mes. Después, una mensualidad pendiente aparece como Atrasada.',
        enc: ['Mes', 'Alumna', 'Monto', 'Pagado', 'Estado', 'Fecha de pago', 'Medio', 'Comprobante'], filas: pagos,
        anchos: [140, 180, 90, 90, 120, 110, 120, 260], dinero: [3, 4] },
      { nombre: 'Asistencia', titulo: 'Asistencia a los entrenamientos', sub: 'Presente, Justificada o Injustificada. Más de ' + maxInj + ' injustificadas en un mes se revisa con el apoderado.',
        enc: ['Fecha', 'Alumna', 'Asistencia', 'Motivo'], filas: asis, anchos: [110, 180, 130, 300] },
      { nombre: 'Partidos', titulo: 'Torneos en curso', sub: 'Partidos del equipo en los torneos donde juega tu hija. Las fechas y rivales pueden cambiar: confírmalos con Cristian.',
        enc: ['Fecha', 'Torneo', 'Serie', 'Etapa', 'Rival', 'Resultado'], filas: partidos,
        pie: cuotas.length ? [[''], ['Cuotas de torneo']].concat([['Torneo', 'Alumna', 'Concepto', 'Monto']]).concat(cuotas) : [],
        anchos: [110, 200, 90, 120, 180, 120] },
      { nombre: 'Ficha', titulo: 'Datos de la ficha', sub: 'Revisa que estén correctos. Si algo está mal o falta, avísale a Cristian.',
        enc: ['Dato', 'Valor'], filas: ficha, anchos: [230, 360] }
    ]
  };
}

/** Escribe una pestaña completa: título, subtítulo, encabezado y filas. */
function escribirPestana_(ss, tab, i) {
  var sh = ss.getSheetByName(tab.nombre) || ss.insertSheet(tab.nombre, i);
  sh.clear();
  var n = tab.enc.length;
  var pad = function (r) { r = r.slice(0, Math.max(n, r.length)); while (r.length < n) r.push(''); return r.slice(0, n); };
  var filas = tab.filas.length ? tab.filas : [['Sin registros por ahora']];
  var datos = [pad([tab.titulo]), pad([tab.sub]), pad([''])].concat([tab.enc]).concat(filas.map(pad)).concat((tab.pie || []).map(pad));
  sh.getRange(1, 1, datos.length, n).setValues(datos);
  sh.getRange(1, 1).setFontSize(15).setFontWeight('bold').setFontColor('#3f3a8f');
  sh.getRange(2, 1).setFontColor('#7b7990');
  sh.getRange(4, 1, 1, n).setFontWeight('bold').setBackground('#3f3a8f').setFontColor('#ffffff');
  (tab.dinero || []).forEach(function (c) { sh.getRange(5, c, filas.length, 1).setNumberFormat('$#,##0'); });
  sh.setFrozenRows(4);
  (tab.anchos || []).forEach(function (w, c) { sh.setColumnWidth(c + 1, w); });
}

/** Crea o actualiza la planilla de una familia y deja el acceso solo para su correo. */
function planillaFamilia_(fam, reg, D, carpeta) {
  var cont = contenidoFamilia_(fam, D), ss, nueva = false;
  if (reg && reg.ID_Archivo) { try { ss = SpreadsheetApp.openById(String(reg.ID_Archivo)); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Kraken Vóley - ' + (cont.apoderado || fam.email));
    DriveApp.getFileById(ss.getId()).moveTo(carpeta);
    nueva = true;
  }
  cont.tabs.forEach(function (t, i) { escribirPestana_(ss, t, i); });
  if (nueva) ss.getSheets().forEach(function (sh) { if (cont.tabs.every(function (t) { return t.nombre !== sh.getName(); })) ss.deleteSheet(sh); });
  var file = DriveApp.getFileById(ss.getId());
  var lectores = file.getViewers().map(function (u) { return String(u.getEmail()).toLowerCase(); });
  lectores.forEach(function (c) { if (c && c !== fam.email) file.removeViewer(c); });
  if (lectores.indexOf(fam.email) < 0) file.addViewer(fam.email);
  return { id: ss.getId(), url: ss.getUrl(), apoderado: cont.apoderado };
}

/**
 * Actualiza las planillas (todas, o solo la de un correo). Empieza por las más antiguas y se detiene antes
 * del límite de tiempo de Google: si quedan pendientes, se completan en la siguiente vuelta.
 */
function portalActualizar_(soloEmail) {
  var t0 = Date.now(), cfg = config_();
  var D = { cfg: cfg, hoy: hoyStr_(), mens: leer_('Mensualidades').rows, asis: asistencia_(cfg), tor: leer_('Torneos').rows,
    pla: leer_('Torneo_Plantel').rows, par: leer_('Partidos').rows, cuo: leer_('Torneo_Cuotas').rows };
  var alumnas = leer_('Alumnas').rows, fam = familias_(alumnas), reg = hojaPortal_(), porEmail = {};
  reg.rows.forEach(function (r) { porEmail[String(r.Email).toLowerCase()] = r; });
  var carpeta = carpetaPortal_(), ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var res = { actualizadas: 0, creadas: 0, errores: [], pendientes: 0, sinAcceso: 0 };

  var lista = Object.keys(fam).filter(function (c) { return !soloEmail || c === String(soloEmail).toLowerCase(); })
    .sort(function (a, b) { return String((porEmail[a] || {}).Ultima_Actualizacion || '') < String((porEmail[b] || {}).Ultima_Actualizacion || '') ? -1 : 1; });
  lista.forEach(function (c) {
    if (Date.now() - t0 > MAX_MS_PORTAL) { res.pendientes++; return; }
    var r = porEmail[c], datos = { Email: c, Alumnas: fam[c].alumnas.map(function (a) { return a.Nombre; }).join(', ') };
    try {
      var p = planillaFamilia_(fam[c], r, D, carpeta);
      if (!r || !r.ID_Archivo) res.creadas++; else res.actualizadas++;
      datos.Apoderado = p.apoderado; datos.ID_Archivo = p.id; datos.URL = p.url; datos.Estado = 'Al día'; datos.Ultima_Actualizacion = ahora; datos.Error = null;
    } catch (e) {
      datos.Estado = 'Con error'; datos.Error = String(e && e.message || e).slice(0, 300);
      res.errores.push(c + ': ' + datos.Error);
    }
    conLock_(function () {
      if (r) actualizar_(HOJA_PORTAL, r._row, datos, reg.h);
      else { agregar_(HOJA_PORTAL, [datos]); reg = leer_(HOJA_PORTAL); reg.rows.forEach(function (x) { porEmail[String(x.Email).toLowerCase()] = x; }); }
    });
  });

  // Correos que ya no corresponden (alumna retirada o correo cambiado): se les quita el acceso. La planilla queda en Drive.
  if (!soloEmail) reg.rows.forEach(function (r) {
    var c = String(r.Email).toLowerCase();
    if (fam[c] || r.Estado === 'Sin acceso' || !r.ID_Archivo) return;
    try { DriveApp.getFileById(String(r.ID_Archivo)).removeViewer(c); } catch (e) { /* ya no estaba */ }
    conLock_(function () { actualizar_(HOJA_PORTAL, r._row, { Estado: 'Sin acceso', Ultima_Actualizacion: ahora, Error: 'Ninguna alumna activa tiene este correo' }, reg.h); });
    res.sinAcceso++;
  });
  log_('Portal apoderados', HOJA_PORTAL, soloEmail || '', res.creadas + ' nuevas, ' + res.actualizadas + ' actualizadas, ' + res.errores.length + ' con error, ' + res.pendientes + ' pendientes');
  return res;
}

/** Lo ejecuta el activador diario (de madrugada). Si quedan pendientes, sigue en la siguiente vuelta. */
function portalDiario() { portalActualizar_(); }

/** true/false según el activador diario; null si Google aún no da el permiso de activadores (falta correr "autorizar"). */
function portalDiarioActivo_() {
  try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === FN_PORTAL_DIARIO; }); }
  catch (e) { return null; }
}

/* ---------- Llamadas desde la web ---------- */

function api_portalEstado() {
  return run_(function () {
    var alumnas = leer_('Alumnas').rows, fam = familias_(alumnas), reg = hojaPortal_(), porEmail = {};
    reg.rows.forEach(function (r) { porEmail[String(r.Email).toLowerCase()] = r; });
    var filas = Object.keys(fam).sort().map(function (c) {
      var r = porEmail[c] || {}, as = fam[c].alumnas;
      return { email: c, apoderado: r.Apoderado || as.map(function (a) { return a.Apoderado; }).filter(String)[0] || '',
        alumnas: as.map(function (a) { return a.Nombre; }), telefono: as.map(function (a) { return a.Telefono_Apoderado; }).filter(String)[0] || '',
        url: r.URL || '', estado: r.Estado || 'Sin crear', actualizada: r.Ultima_Actualizacion || '', error: r.Error || '' };
    });
    var sinAcceso = reg.rows.filter(function (r) { return !fam[String(r.Email).toLowerCase()] && r.Estado === 'Sin acceso'; })
      .map(function (r) { return { email: r.Email, alumnas: r.Alumnas }; });
    var sinCorreo = alumnas.filter(function (a) { return a.Estado === 'Activa' && !correos_(a.Email_Apoderado).length; })
      .map(function (a) { return { id: a.ID_Alumna, alumna: a.Nombre, apoderado: a.Apoderado || '', grupo: a.Grupo_Actual || '' }; })
      .sort(function (x, y) { return String(x.alumna).localeCompare(String(y.alumna)); });
    return { familias: filas, sinCorreo: sinCorreo, sinAcceso: sinAcceso, diario: portalDiarioActivo_() };
  });
}

function api_portalActualizar(email) {
  return run_(function () { return portalActualizar_(email || null); });
}

/** Activa o desactiva la actualización automática de cada noche (entre 3 y 4 AM). */
function api_portalDiario(activar) {
  return run_(function () {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === FN_PORTAL_DIARIO) ScriptApp.deleteTrigger(t); });
    if (activar) ScriptApp.newTrigger(FN_PORTAL_DIARIO).timeBased().everyDays(1).atHour(3).create();
    log_('Portal apoderados', HOJA_PORTAL, '', activar ? 'Actualización diaria activada' : 'Actualización diaria desactivada');
    return { diario: !!activar };
  });
}
