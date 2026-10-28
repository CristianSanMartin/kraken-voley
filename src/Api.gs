/**
 * Api.gs — Funciones que llama la web (google.script.run).
 * Cada función pública termina en "api_" al inicio para distinguirlas.
 * Todas devuelven objetos simples (sin fechas Date) para viajar al navegador.
 */

var ESTADOS_DEUDA = ['Pendiente', 'Promete pagar'];
var CAT_REMANENTE = 'Pago Cristian (remanente)';
var HOJAS_LECTURA = ['Camisetas', 'Camisetas_Pagos', 'Compras_Detalle', 'Club', 'Personal', 'Revision', 'Planificacion', 'Log'];

function ok_(data) { return JSON.parse(JSON.stringify({ ok: true, data: data })); }
function run_(fn) {
  try { return ok_(fn()); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function mesAnterior_(mes, k) {
  var p = mes.split('-'); var d = new Date(Number(p[0]), Number(p[1]) - 1 - (k == null ? 1 : k), 1);
  return fmtMes_(d);
}
function diaLimite_(cfg) { return num_(cfg.Dia_Limite_Pago) || 10; }
function estaAtrasada_(m, cfg, hoy) {
  if (ESTADOS_DEUDA.indexOf(m.Estado) < 0) return false;
  var lim = m.Mes + '-' + ('0' + diaLimite_(cfg)).slice(-2);
  return hoy > lim;
}
function gruposCfg_(cfg) {
  return String(cfg.Grupos || 'A14,A16,A14-16,C12,D').split(',').map(function (s) { return s.trim(); }).filter(String);
}

/* ------------------------------------------------------------------ */
/* Arranque                                                             */
/* ------------------------------------------------------------------ */
function api_bootstrap() {
  return run_(function () {
    asegurarConfig_();
    var cfg = config_();
    return {
      hoy: hoyStr_(), mes: mesActual_(), config: cfg, grupos: gruposCfg_(cfg),
      usuario: (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '',
      version: APP_VERSION
    };
  });
}

function asegurarConfig_() {
  var t = leer_('Config');
  var claves = t.rows.map(function (r) { return r.Clave; });
  var faltan = [];
  if (claves.indexOf('Grupos') < 0) faltan.push({ Clave: 'Grupos', Valor: 'A14,A16,A14-16,C12,D', Descripcion: 'Grupos vigentes separados por coma (los A14/A16/A14-16 son el equipo competitivo)' });
  if (claves.indexOf('Grupos_Competitivos') < 0) faltan.push({ Clave: 'Grupos_Competitivos', Valor: 'A14,A16,A14-16', Descripcion: 'Grupos que forman el equipo que compite' });
  if (faltan.length) agregar_('Config', faltan);
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */
function api_dashboard(mes) {
  return run_(function () {
    mes = mes || mesActual_();
    var cfg = config_(), hoy = hoyStr_();
    var alumnas = leer_('Alumnas').rows;
    var activas = alumnas.filter(function (a) { return a.Estado === 'Activa'; });
    var mens = leer_('Mensualidades').rows;
    var delMes = mens.filter(function (m) { return m.Mes === mes; });
    var porAlumna = {};
    alumnas.forEach(function (a) { porAlumna[a.ID_Alumna] = a; });

    var esperado = 0, cobrado = 0, nPag = 0;
    delMes.forEach(function (m) {
      esperado += num_(m.Monto_Esperado) || (ESTADOS_DEUDA.indexOf(m.Estado) >= 0 || m.Estado === 'Pagado' ? num_((porAlumna[m.ID_Alumna] || {}).Tarifa) : 0);
      cobrado += num_(m.Monto_Pagado);
      if (m.Estado === 'Pagado') nPag++;
    });
    var tope = mesActual_() > mes ? mesActual_() : mes;  // no mostrar como deuda meses futuros
    var deudas = mens.filter(function (m) { return ESTADOS_DEUDA.indexOf(m.Estado) >= 0 && m.Mes <= tope; }).map(function (m) {
      var a = porAlumna[m.ID_Alumna] || {};
      return { id: m.ID_Mensualidad, alumna: a.Nombre || m.Nombre_ref, idAlumna: m.ID_Alumna, mes: m.Mes, estado: m.Estado,
        monto: num_(m.Monto_Esperado) || num_(a.Tarifa), nota: m.Nota, atrasada: estaAtrasada_(m, cfg, hoy) };
    }).sort(function (a, b) { return (b.atrasada - a.atrasada) || (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : String(a.alumna).localeCompare(String(b.alumna))); });

    var caja = cajaMes_(mes, mens);

    // Asistencia del mes: inasistencias injustificadas
    var asis = leer_('Asistencia').rows.filter(function (r) { return String(r.Fecha).slice(0, 7) === mes; });
    var maxInj = num_(cfg.Max_Inasistencias_Injustificadas_Mes) || 3;
    var inj = {};
    asis.forEach(function (r) { if (r.Estado === 'Injustificada') inj[r.ID_Alumna] = (inj[r.ID_Alumna] || 0) + 1; });
    var alertasAsis = Object.keys(inj).filter(function (k) { return inj[k] > maxInj; }).map(function (k) {
      return { idAlumna: k, alumna: (porAlumna[k] || {}).Nombre, n: inj[k] };
    });
    var fechas = {};
    asis.forEach(function (r) { fechas[r.Fecha] = fechas[r.Fecha] || { p: 0, t: 0 }; fechas[r.Fecha].t++; if (r.Estado === 'Presente') fechas[r.Fecha].p++; });
    var sesiones = Object.keys(fechas).sort().map(function (f) { return { fecha: f, presentes: fechas[f].p, total: fechas[f].t }; });

    var mm = mes.slice(5, 7);
    var cumple = activas.filter(function (a) { return a.Fecha_Nacimiento && String(a.Fecha_Nacimiento).slice(5, 7) === mm; })
      .map(function (a) { return { alumna: a.Nombre, fecha: a.Fecha_Nacimiento, edad: Number(mes.slice(0, 4)) - Number(String(a.Fecha_Nacimiento).slice(0, 4)) }; })
      .sort(function (a, b) { return a.fecha.slice(8) < b.fecha.slice(8) ? -1 : 1; });

    var partidos = leer_('Partidos').rows.filter(function (p) { return p.Fecha && p.Fecha >= hoy; })
      .sort(function (a, b) { return a.Fecha < b.Fecha ? -1 : 1; }).slice(0, 5);

    var grupos = {};
    activas.forEach(function (a) { var g = a.Grupo_Actual || 'Sin grupo'; grupos[g] = (grupos[g] || 0) + 1; });

    // Serie 12 meses de cobros
    var serie = [];
    for (var i = 11; i >= 0; i--) {
      var mk = mesAnterior_(mes, i);
      var c = cajaMes_(mk, mens);
      serie.push({ mes: mk, ingresos: c.ingresos, egresos: c.egresos });
    }

    return {
      mes: mes, activas: activas.length, grupos: grupos,
      generado: delMes.length > 0,
      cobros: { esperado: esperado, cobrado: cobrado, pagadas: nPag, filas: delMes.length },
      deudas: deudas, totalDeuda: deudas.reduce(function (s, d) { return s + d.monto; }, 0),
      caja: caja, alertasAsistencia: alertasAsis, sesiones: sesiones, cumpleanos: cumple, partidos: partidos,
      sinRut: activas.filter(function (a) { return !a.RUT; }).map(function (a) { return a.Nombre; }),
      serie: serie
    };
  });
}

/* ------------------------------------------------------------------ */
/* Alumnas                                                              */
/* ------------------------------------------------------------------ */
function api_alumnas() {
  return run_(function () {
    var rows = leer_('Alumnas').rows;
    rows.forEach(function (r) { delete r._row; });
    return rows;
  });
}

function api_alumnaDetalle(id) {
  return run_(function () {
    var cfg = config_(), hoy = hoyStr_();
    var a = buscarPorId_('Alumnas', 'ID_Alumna', id).row; delete a._row;
    var mens = leer_('Mensualidades').rows.filter(function (m) { return m.ID_Alumna === id; })
      .sort(function (x, y) { return x.Mes < y.Mes ? 1 : -1; });
    mens.forEach(function (m) { m.atrasada = estaAtrasada_(m, cfg, hoy); delete m._row; });
    var asis = leer_('Asistencia').rows.filter(function (r) { return r.ID_Alumna === id; });
    var porMes = {};
    asis.forEach(function (r) {
      var k = String(r.Fecha).slice(0, 7); porMes[k] = porMes[k] || { p: 0, t: 0, inj: 0 };
      porMes[k].t++; if (r.Estado === 'Presente') porMes[k].p++; if (r.Estado === 'Injustificada') porMes[k].inj++;
    });
    var asisMeses = Object.keys(porMes).sort().reverse().map(function (k) { return { mes: k, presentes: porMes[k].p, sesiones: porMes[k].t, injustificadas: porMes[k].inj }; });
    var torneos = leer_('Torneo_Plantel').rows.filter(function (p) { return p.ID_Alumna === id; }).map(function (p) { return p.ID_Torneo; });
    var hermanos = String(a.Hermanos || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    var todas = leer_('Alumnas').rows;
    var nombresHermanos = hermanos.map(function (h) { var x = todas.filter(function (t) { return t.ID_Alumna === h; })[0]; return x ? { id: h, nombre: x.Nombre } : { id: h, nombre: h }; });
    return { alumna: a, mensualidades: mens, asistencia: asisMeses, torneos: torneos, hermanos: nombresHermanos };
  });
}

var CAMPOS_ALUMNA = ['Nombre', 'Nombre_Completo', 'RUT', 'Fecha_Nacimiento', 'Sexo', 'Apoderado', 'Telefono_Apoderado', 'Email_Apoderado',
  'Direccion', 'Colegio', 'Curso', 'Jornada', 'Condicion_Medica', 'Autoriza_Emergencia', 'Autoriza_Imagen', 'Grupo_Actual',
  'Equipo_Competitivo', 'Posicion', 'Dorsal', 'Talla', 'Tarifa', 'Motivo_Tarifa', 'Hermanos', 'Estado', 'Observaciones'];

function api_guardarAlumna(obj) {
  return run_(function () {
    if (!obj || !String(obj.Nombre || '').trim()) throw new Error('El nombre es obligatorio');
    return conLock_(function () {
      var cfg = config_();
      var comp = String(cfg.Grupos_Competitivos || 'A14,A16,A14-16').split(',').map(function (s) { return s.trim(); });
      var t = leer_('Alumnas');
      var limpio = {};
      CAMPOS_ALUMNA.forEach(function (c) { if (obj[c] !== undefined) limpio[c] = obj[c] === '' ? null : obj[c]; });
      if (limpio.Tarifa !== undefined && limpio.Tarifa !== null) limpio.Tarifa = num_(limpio.Tarifa);
      if (limpio.Grupo_Actual !== undefined) limpio.Equipo_Competitivo = comp.indexOf(limpio.Grupo_Actual) >= 0 ? 'Sí' : 'No';
      if (obj.ID_Alumna) {
        var row = t.rows.filter(function (r) { return r.ID_Alumna === obj.ID_Alumna; })[0];
        if (!row) throw new Error('No existe ' + obj.ID_Alumna);
        if (limpio.Estado === 'Retirada' && row.Estado !== 'Retirada') limpio.Ultimo_Mes = mesActual_();
        actualizar_('Alumnas', row._row, limpio, t.h);
        log_('Editar alumna', 'Alumnas', obj.ID_Alumna, Object.keys(limpio).join(', '));
        return { id: obj.ID_Alumna };
      }
      var dup = t.rows.filter(function (r) { return String(r.Nombre).toLowerCase().trim() === String(limpio.Nombre).toLowerCase().trim(); })[0];
      if (dup && !obj.forzar) throw new Error('Ya existe una alumna llamada ' + dup.Nombre + ' (' + dup.ID_Alumna + ', ' + dup.Estado + '). Si es ella, edítala o cambia su estado a Activa.');
      var id = siguienteId_(t.rows, 'ID_Alumna', 'ALU', 3)();
      limpio.ID_Alumna = id;
      limpio.Estado = limpio.Estado || 'Activa';
      limpio.Tarifa = limpio.Tarifa || num_(cfg.Tarifa_Estandar) || 16000;
      limpio.Motivo_Tarifa = limpio.Motivo_Tarifa || 'Estándar';
      limpio.Mes_Ingreso = mesActual_();
      agregar_('Alumnas', [limpio]);
      log_('Nueva alumna', 'Alumnas', id, limpio.Nombre);
      return { id: id };
    });
  });
}

/** Nómina para inscribir en torneos (nombre, RUT, nacimiento, grupo, dorsal). */
function api_nomina(filtro) {
  return run_(function () {
    var rows = leer_('Alumnas').rows.filter(function (a) { return a.Estado === 'Activa'; });
    if (filtro && filtro.grupos && filtro.grupos.length) rows = rows.filter(function (a) { return filtro.grupos.indexOf(a.Grupo_Actual) >= 0; });
    return rows.map(function (a) {
      return { Nombre: a.Nombre_Completo || a.Nombre, RUT: a.RUT, Fecha_Nacimiento: a.Fecha_Nacimiento, Grupo: a.Grupo_Actual, Dorsal: a.Dorsal, Posicion: a.Posicion };
    }).sort(function (x, y) { return String(x.Grupo).localeCompare(String(y.Grupo)) || String(x.Nombre).localeCompare(String(y.Nombre)); });
  });
}

/* ------------------------------------------------------------------ */
/* Mensualidades                                                        */
/* ------------------------------------------------------------------ */
function api_mensualidades(mes) {
  return run_(function () {
    var cfg = config_(), hoy = hoyStr_();
    var alumnas = leer_('Alumnas').rows, por = {};
    alumnas.forEach(function (a) { por[a.ID_Alumna] = a; });
    var mens = leer_('Mensualidades').rows.filter(function (m) { return m.Mes === mes; });
    var conFila = {};
    var filas = mens.map(function (m) {
      conFila[m.ID_Alumna] = true;
      var a = por[m.ID_Alumna] || {};
      return { id: m.ID_Mensualidad, idAlumna: m.ID_Alumna, alumna: a.Nombre || m.Nombre_ref, grupo: m.Grupo || a.Grupo_Actual,
        esperado: num_(m.Monto_Esperado) || (ESTADOS_DEUDA.indexOf(m.Estado) >= 0 ? num_(a.Tarifa) : null), pagado: m.Monto_Pagado,
        fecha: m.Fecha_Pago, medio: m.Medio_Pago, estado: m.Estado, nota: m.Nota, obs: m.Obs_Original,
        apoderado: a.Apoderado, telefono: a.Telefono_Apoderado, tarifa: a.Tarifa, atrasada: estaAtrasada_(m, cfg, hoy),
        hermanos: a.Hermanos };
    }).sort(function (x, y) { return String(x.alumna).localeCompare(String(y.alumna)); });
    var faltantes = alumnas.filter(function (a) { return a.Estado === 'Activa' && !conFila[a.ID_Alumna]; })
      .map(function (a) { return { idAlumna: a.ID_Alumna, alumna: a.Nombre, grupo: a.Grupo_Actual, tarifa: a.Tarifa }; });
    return { mes: mes, filas: filas, faltantes: faltantes, diaLimite: diaLimite_(cfg) };
  });
}

/** Crea las filas del mes (Pendiente) para todas las activas que aún no la tienen. */
function api_generarMes(mes) {
  return run_(function () {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes inválido');
    return conLock_(function () {
      var alumnas = leer_('Alumnas').rows.filter(function (a) { return a.Estado === 'Activa'; });
      var t = leer_('Mensualidades');
      var ya = {};
      t.rows.forEach(function (m) { if (m.Mes === mes) ya[m.ID_Alumna] = true; });
      var gen = siguienteId_(t.rows, 'ID_Mensualidad', 'MEN', 5);
      var nuevas = alumnas.filter(function (a) { return !ya[a.ID_Alumna]; }).map(function (a) {
        return { ID_Mensualidad: gen(), ID_Alumna: a.ID_Alumna, Nombre_ref: a.Nombre, Mes: mes, Grupo: a.Grupo_Actual,
          Monto_Esperado: num_(a.Tarifa) || null, Estado: num_(a.Tarifa) ? 'Pendiente' : 'Sin cobro' };
      });
      agregar_('Mensualidades', nuevas);
      log_('Generar mes', 'Mensualidades', mes, nuevas.length + ' filas');
      return { creadas: nuevas.length };
    });
  });
}

/** Registra un pago: {monto, fecha, medio, nota} */
function api_registrarPago(idMen, p) {
  return run_(function () {
    return conLock_(function () {
      var r = buscarPorId_('Mensualidades', 'ID_Mensualidad', idMen);
      var monto = num_(p.monto);
      if (monto <= 0) throw new Error('El monto debe ser mayor a 0');
      var cambios = { Monto_Pagado: monto, Fecha_Pago: p.fecha || hoyStr_(), Medio_Pago: p.medio || 'Transferencia', Estado: 'Pagado' };
      if (p.nota !== undefined) cambios.Nota = p.nota || null;
      if (!r.row.Monto_Esperado) {
        var a = buscarPorId_('Alumnas', 'ID_Alumna', r.row.ID_Alumna).row;
        if (a.Tarifa) cambios.Monto_Esperado = num_(a.Tarifa);
      }
      actualizar_('Mensualidades', r.row._row, cambios, r.t.h);
      log_('Registrar pago', 'Mensualidades', idMen, '$' + monto + ' ' + cambios.Medio_Pago);
      return { id: idMen };
    });
  });
}

/** Cambia el estado (Pendiente, Promete pagar, Becada, Sin cobro, Retirada...). Si deja de estar Pagado, limpia el pago. */
function api_estadoMensualidad(idMen, estado, nota) {
  return run_(function () {
    return conLock_(function () {
      var r = buscarPorId_('Mensualidades', 'ID_Mensualidad', idMen);
      var cambios = { Estado: estado };
      if (nota !== undefined) cambios.Nota = nota || null;
      if (estado !== 'Pagado') { cambios.Monto_Pagado = null; cambios.Fecha_Pago = null; cambios.Medio_Pago = null; }
      actualizar_('Mensualidades', r.row._row, cambios, r.t.h);
      log_('Estado mensualidad', 'Mensualidades', idMen, estado + (nota ? ' — ' + nota : ''));
      return { id: idMen };
    });
  });
}

/** Crea una fila de mensualidad para una alumna puntual (ej. alumna nueva a mitad de mes). */
function api_agregarMensualidad(idAlumna, mes) {
  return run_(function () {
    return conLock_(function () {
      var a = buscarPorId_('Alumnas', 'ID_Alumna', idAlumna).row;
      var t = leer_('Mensualidades');
      if (t.rows.some(function (m) { return m.Mes === mes && m.ID_Alumna === idAlumna; })) throw new Error(a.Nombre + ' ya tiene mensualidad en ' + mes);
      var id = siguienteId_(t.rows, 'ID_Mensualidad', 'MEN', 5)();
      agregar_('Mensualidades', [{ ID_Mensualidad: id, ID_Alumna: idAlumna, Nombre_ref: a.Nombre, Mes: mes, Grupo: a.Grupo_Actual,
        Monto_Esperado: num_(a.Tarifa) || null, Estado: 'Pendiente' }]);
      log_('Agregar mensualidad', 'Mensualidades', id, a.Nombre + ' ' + mes);
      return { id: id };
    });
  });
}

/* ------------------------------------------------------------------ */
/* Asistencia                                                           */
/* ------------------------------------------------------------------ */
function api_asistencia(fecha) {
  return run_(function () {
    var alumnas = leer_('Alumnas').rows.filter(function (a) { return a.Estado === 'Activa'; });
    var asis = leer_('Asistencia').rows;
    var delDia = {};
    asis.forEach(function (r) { if (r.Fecha === fecha) delDia[r.ID_Alumna] = r; });
    var mes = fecha.slice(0, 7);
    var injMes = {};
    asis.forEach(function (r) { if (String(r.Fecha).slice(0, 7) === mes && r.Estado === 'Injustificada') injMes[r.ID_Alumna] = (injMes[r.ID_Alumna] || 0) + 1; });
    // también se listan las que tienen registro ese día aunque ya no estén activas
    var ids = {};
    var lista = alumnas.map(function (a) { ids[a.ID_Alumna] = 1; return a; });
    Object.keys(delDia).forEach(function (id) { if (!ids[id]) lista.push({ ID_Alumna: id, Nombre: delDia[id].Nombre_ref, Grupo_Actual: '(no activa)' }); });
    var fechas = {};
    asis.forEach(function (r) { fechas[r.Fecha] = 1; });
    return {
      fecha: fecha,
      registrada: Object.keys(delDia).length > 0,
      ultimasFechas: Object.keys(fechas).sort().reverse().slice(0, 8),
      filas: lista.map(function (a) {
        var r = delDia[a.ID_Alumna];
        return { idAlumna: a.ID_Alumna, alumna: a.Nombre, grupo: a.Grupo_Actual, estado: r ? r.Estado : null, motivo: r ? r.Motivo : null, injMes: injMes[a.ID_Alumna] || 0 };
      }).sort(function (x, y) { return String(x.grupo).localeCompare(String(y.grupo)) || String(x.alumna).localeCompare(String(y.alumna)); })
    };
  });
}

/** items: [{idAlumna, estado, motivo}] — crea o actualiza la asistencia de ese día. */
function api_guardarAsistencia(fecha, items) {
  return run_(function () {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida');
    return conLock_(function () {
      var t = leer_('Asistencia');
      var alumnas = leer_('Alumnas').rows, nom = {};
      alumnas.forEach(function (a) { nom[a.ID_Alumna] = a.Nombre; });
      var existentes = {};
      t.rows.forEach(function (r) { if (r.Fecha === fecha) existentes[r.ID_Alumna] = r; });
      var gen = siguienteId_(t.rows, 'ID_Asistencia', 'ASI', 5);
      var nuevas = [], editadas = 0;
      items.forEach(function (it) {
        if (!it.estado) return;
        var ex = existentes[it.idAlumna];
        if (ex) {
          if (ex.Estado !== it.estado || (ex.Motivo || '') !== (it.motivo || '')) {
            actualizar_('Asistencia', ex._row, { Estado: it.estado, Motivo: it.motivo || null }, t.h); editadas++;
          }
        } else {
          nuevas.push({ ID_Asistencia: gen(), Fecha: fecha, ID_Alumna: it.idAlumna, Nombre_ref: nom[it.idAlumna], Estado: it.estado, Motivo: it.motivo || null });
        }
      });
      agregar_('Asistencia', nuevas);
      log_('Guardar asistencia', 'Asistencia', fecha, nuevas.length + ' nuevas, ' + editadas + ' editadas');
      return { nuevas: nuevas.length, editadas: editadas };
    });
  });
}

/* ------------------------------------------------------------------ */
/* Caja                                                                 */
/* ------------------------------------------------------------------ */
function cajaMes_(mes, mensRows, movRows) {
  mensRows = mensRows || leer_('Mensualidades').rows;
  movRows = movRows || (cajaMes_._mov || (cajaMes_._mov = leer_('Movimientos').rows));
  var mensualidades = 0;
  mensRows.forEach(function (m) { if (m.Mes === mes) mensualidades += num_(m.Monto_Pagado); });
  var movs = movRows.filter(function (m) { return m.Mes === mes || String(m.Fecha).slice(0, 7) === mes; });
  var ingMov = 0, egresos = 0, pagoCristian = 0, porCat = {};
  movs.forEach(function (m) {
    var v = num_(m.Monto);
    if (m.Tipo === 'Ingreso') ingMov += v;
    else { egresos += v; if (m.Categoria === CAT_REMANENTE) pagoCristian += v; }
    var k = m.Tipo + '|' + m.Categoria; porCat[k] = (porCat[k] || 0) + v;
  });
  var ingresos = mensualidades + ingMov;
  var egresosSinCristian = egresos - pagoCristian;
  return {
    mes: mes, mensualidades: mensualidades, otrosIngresos: ingMov, ingresos: ingresos, egresos: egresos,
    egresosSinCristian: egresosSinCristian, remanente: ingresos - egresosSinCristian, pagoCristian: pagoCristian,
    saldo: ingresos - egresos, porCategoria: porCat,
    movimientos: movs.map(function (m) { var o = {}; Object.keys(m).forEach(function (k) { if (k !== '_row') o[k] = m[k]; }); return o; })
      .sort(function (a, b) { return a.Fecha < b.Fecha ? -1 : 1; })
  };
}

function api_caja(mes) {
  return run_(function () {
    cajaMes_._mov = null;
    var mens = leer_('Mensualidades').rows, mov = leer_('Movimientos').rows;
    var c = cajaMes_(mes, mens, mov);
    var serie = [];
    for (var i = 11; i >= 0; i--) {
      var mk = mesAnterior_(mes, i), x = cajaMes_(mk, mens, mov);
      serie.push({ mes: mk, ingresos: x.ingresos, egresos: x.egresos, remanente: x.remanente });
    }
    var anio = mes.slice(0, 4), acum = { ingresos: 0, egresos: 0, pagoCristian: 0 };
    for (var k = 1; k <= 12; k++) {
      var mm = anio + '-' + ('0' + k).slice(-2);
      if (mm > mes) break;
      var y = cajaMes_(mm, mens, mov); acum.ingresos += y.ingresos; acum.egresos += y.egresos; acum.pagoCristian += y.pagoCristian;
    }
    var cats = {};
    mov.forEach(function (m) { cats[m.Tipo + '|' + m.Categoria] = 1; });
    var personal = leer_('Personal').rows.filter(function (p) { return p.Estado === 'Activo'; }).map(function (p) { return { nombre: p.Nombre, rol: p.Rol }; });
    c.serie = serie; c.anio = acum; c.categorias = Object.keys(cats).sort(); c.personal = personal;
    return c;
  });
}

/** Guarda un movimiento: {Fecha, Tipo, Categoria, Detalle, Monto, Medio, Referencia} */
function api_guardarMovimiento(m) {
  return run_(function () {
    if (!m || ['Ingreso', 'Egreso'].indexOf(m.Tipo) < 0) throw new Error('Tipo debe ser Ingreso o Egreso');
    if (num_(m.Monto) <= 0) throw new Error('Monto inválido');
    if (!m.Categoria) throw new Error('Falta la categoría');
    return conLock_(function () {
      var t = leer_('Movimientos');
      var fecha = m.Fecha || hoyStr_();
      if (m.ID_Movimiento) {
        var row = t.rows.filter(function (r) { return r.ID_Movimiento === m.ID_Movimiento; })[0];
        if (!row) throw new Error('No existe ' + m.ID_Movimiento);
        actualizar_('Movimientos', row._row, { Fecha: fecha, Mes: fecha.slice(0, 7), Tipo: m.Tipo, Categoria: m.Categoria, Detalle: m.Detalle || null,
          Monto: num_(m.Monto), Medio: m.Medio || null, Referencia: m.Referencia || null }, t.h);
        log_('Editar movimiento', 'Movimientos', m.ID_Movimiento, m.Categoria + ' $' + m.Monto);
        return { id: m.ID_Movimiento };
      }
      var id = siguienteId_(t.rows, 'ID_Movimiento', 'MOV', 4)();
      agregar_('Movimientos', [{ ID_Movimiento: id, Fecha: fecha, Mes: fecha.slice(0, 7), Tipo: m.Tipo, Categoria: m.Categoria,
        Detalle: m.Detalle || null, Monto: num_(m.Monto), Medio: m.Medio || null, Referencia: m.Referencia || null }]);
      log_('Nuevo movimiento', 'Movimientos', id, m.Tipo + ' ' + m.Categoria + ' $' + m.Monto);
      return { id: id };
    });
  });
}

/** Anula un movimiento (no se borra: queda con monto 0 y la referencia ANULADO). */
function api_anularMovimiento(id) {
  return run_(function () {
    return conLock_(function () {
      var r = buscarPorId_('Movimientos', 'ID_Movimiento', id);
      actualizar_('Movimientos', r.row._row, { Referencia: 'ANULADO ($' + r.row.Monto + ')', Monto: 0 }, r.t.h);
      log_('Anular movimiento', 'Movimientos', id, '$' + r.row.Monto);
      return { id: id };
    });
  });
}

/* ------------------------------------------------------------------ */
/* Torneos                                                              */
/* ------------------------------------------------------------------ */
function api_torneos() {
  return run_(function () {
    var tor = leer_('Torneos').rows, pla = leer_('Torneo_Plantel').rows, par = leer_('Partidos').rows, cuo = leer_('Torneo_Cuotas').rows;
    var alumnas = leer_('Alumnas').rows, nom = {};
    alumnas.forEach(function (a) { nom[a.ID_Alumna] = a.Nombre; });
    return tor.map(function (t) {
      var partidos = par.filter(function (p) { return p.ID_Torneo === t.ID_Torneo; })
        .sort(function (a, b) { return String(a.Fecha) < String(b.Fecha) ? -1 : 1; });
      var plantel = pla.filter(function (p) { return p.ID_Torneo === t.ID_Torneo; }).map(function (p) {
        var cs = cuo.filter(function (c) { return c.ID_Torneo === t.ID_Torneo && c.ID_Alumna === p.ID_Alumna; });
        return { idAlumna: p.ID_Alumna, alumna: nom[p.ID_Alumna] || p.Nombre_ref, serie: p.Serie, dorsal: p.Dorsal, posicion: p.Posicion,
          cuotas: cs.reduce(function (s, c) { return s + num_(c.Monto); }, 0), nCuotas: cs.length };
      }).sort(function (a, b) { return Number(a.dorsal || 999) - Number(b.dorsal || 999); });
      var g = 0, pe = 0;
      partidos.forEach(function (p) { if (p.Resultado === 'Ganado') g++; if (p.Resultado === 'Perdido') pe++; });
      partidos.forEach(function (p) { delete p._row; });
      return { id: t.ID_Torneo, nombre: t.Nombre, anio: t.Anio, estado: t.Estado, nota: t.Nota, partidos: partidos, plantel: plantel, ganados: g, perdidos: pe };
    }).reverse();
  });
}

function api_guardarPartido(p) {
  return run_(function () {
    return conLock_(function () {
      var t = leer_('Partidos');
      var campos = { ID_Torneo: p.ID_Torneo, Fecha: p.Fecha || null, Serie: p.Serie || null, Etapa: p.Etapa || 'Fase regular', Rival: p.Rival || null,
        Sets_Kraken: p.Sets_Kraken === '' || p.Sets_Kraken == null ? null : num_(p.Sets_Kraken),
        Sets_Rival: p.Sets_Rival === '' || p.Sets_Rival == null ? null : num_(p.Sets_Rival),
        Puntos_por_set: p.Puntos_por_set || null, Nota: p.Nota || null };
      if (campos.Sets_Kraken != null && campos.Sets_Rival != null) campos.Resultado = campos.Sets_Kraken > campos.Sets_Rival ? 'Ganado' : 'Perdido';
      if (p.ID_Partido) {
        var row = t.rows.filter(function (r) { return r.ID_Partido === p.ID_Partido; })[0];
        if (!row) throw new Error('No existe ' + p.ID_Partido);
        actualizar_('Partidos', row._row, campos, t.h);
        log_('Editar partido', 'Partidos', p.ID_Partido, (campos.Rival || '') + ' ' + (campos.Resultado || ''));
        return { id: p.ID_Partido };
      }
      var id = siguienteId_(t.rows, 'ID_Partido', 'PAR', 3)();
      campos.ID_Partido = id;
      agregar_('Partidos', [campos]);
      log_('Nuevo partido', 'Partidos', id, campos.Rival || '');
      return { id: id };
    });
  });
}

function api_guardarTorneo(t) {
  return run_(function () {
    return conLock_(function () {
      var tb = leer_('Torneos');
      if (t.ID_Torneo) {
        var row = tb.rows.filter(function (r) { return r.ID_Torneo === t.ID_Torneo; })[0];
        actualizar_('Torneos', row._row, { Nombre: t.Nombre, Anio: num_(t.Anio) || null, Estado: t.Estado, Nota: t.Nota || null }, tb.h);
        return { id: t.ID_Torneo };
      }
      var id = siguienteId_(tb.rows, 'ID_Torneo', 'TOR', 2)();
      agregar_('Torneos', [{ ID_Torneo: id, Nombre: t.Nombre, Anio: num_(t.Anio) || null, Estado: t.Estado || 'En curso', Nota: t.Nota || null }]);
      log_('Nuevo torneo', 'Torneos', id, t.Nombre);
      return { id: id };
    });
  });
}

/* ------------------------------------------------------------------ */
/* Otras hojas, Config e Inscripciones                                  */
/* ------------------------------------------------------------------ */
function api_tabla(nombre) {
  return run_(function () {
    if (HOJAS_LECTURA.indexOf(nombre) < 0) throw new Error('Hoja no disponible: ' + nombre);
    var t = leer_(nombre);
    var rows = t.rows.map(function (r) { delete r._row; return r; });
    if (nombre === 'Log') rows = rows.reverse().slice(0, 300);
    return { columnas: t.h.filter(String), filas: rows };
  });
}

function api_guardarConfig(clave, valor) {
  return run_(function () {
    return conLock_(function () {
      var t = leer_('Config');
      var row = t.rows.filter(function (r) { return r.Clave === clave; })[0];
      if (!row) throw new Error('No existe la clave ' + clave);
      actualizar_('Config', row._row, { Valor: valor }, t.h);
      log_('Editar config', 'Config', clave, String(valor).slice(0, 80));
      return { clave: clave };
    });
  });
}

/**
 * Relaciona cada pregunta del Formulario con un campo de la ficha.
 * Se reconoce por palabras clave, así que el título de la pregunta puede variar un poco.
 */
var REGLAS_FORM = [
  [/correo|email|mail/, 'Email_Apoderado'],
  [/telefono|celular|whatsapp/, 'Telefono_Apoderado'],
  [/imagen|foto/, 'Autoriza_Imagen'],
  [/talla/, 'Talla'],
  [/apoderado/, 'Apoderado'],
  [/nombre completo/, 'Nombre_Completo'],
  [/\brut\b/, 'RUT'],
  [/nacimiento/, 'Fecha_Nacimiento'],
  [/direcci|domicilio/, 'Direccion'],
  [/colegio/, 'Colegio'],
  [/curso/, 'Curso'],
  [/jornada/, 'Jornada'],
  [/emergencia/, 'Autoriza_Emergencia'],
  [/condici|medic|salud/, 'Condicion_Medica']
];
function campoForm_(titulo) {
  var t = String(titulo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (var i = 0; i < REGLAS_FORM.length; i++) if (REGLAS_FORM[i][0].test(t)) return REGLAS_FORM[i][1];
  return null;
}

/** Hoja donde caen las respuestas del Formulario: Config "Hoja_Formulario", o la que empiece con "Respuestas". */
function hojaForm_() {
  var cfg = config_();
  if (cfg.Hoja_Formulario && ss_().getSheetByName(cfg.Hoja_Formulario)) return cfg.Hoja_Formulario;
  var hs = ss_().getSheets().map(function (s) { return s.getName(); });
  var r = hs.filter(function (n) { return /^(respuestas|form responses)/i.test(n); })[0];
  return r || 'Inscripciones';
}

function asegurarColumnas_(nombre, cols) {
  var sh = hoja_(nombre);
  var h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function (x) { return String(x).trim(); });
  cols.forEach(function (c) {
    if (h.indexOf(c) < 0) { sh.getRange(1, h.length + 1).setValue(c); h.push(c); }
  });
}

function formAObj_(r) {
  var o = {};
  Object.keys(r).forEach(function (k) {
    if (k === '_row' || k === 'Estado_Proceso' || k === 'ID_Alumna_Creada') return;
    var c = campoForm_(k);
    if (c && o[c] == null) o[c] = r[k];
  });
  return o;
}

function api_inscripciones() {
  return run_(function () {
    var nombre = hojaForm_();
    var t = leer_(nombre);
    var alumnas = leer_('Alumnas').rows;
    return t.rows.filter(function (r) { return !r.Estado_Proceso; }).map(function (r) {
      var o = formAObj_(r);
      o.fila = r._row; o.marca = r['Marca temporal'] || r['Timestamp'];
      var rut = String(o.RUT || '').replace(/[^0-9kK]/g, '').toUpperCase();
      o.posibleDuplicado = alumnas.filter(function (a) {
        return (rut && String(a.RUT || '').replace(/[^0-9kK]/g, '').toUpperCase() === rut) ||
          (o.Nombre_Completo && String(a.Nombre_Completo || '').toLowerCase() === String(o.Nombre_Completo).toLowerCase());
      }).map(function (a) { return a.ID_Alumna + ' ' + a.Nombre + ' (' + a.Estado + ')'; });
      return o;
    });
  });
}

/** Crea la ficha desde una respuesta del formulario. extra: {Nombre, Grupo_Actual, Tarifa, ID_Alumna_existente} */
function api_procesarInscripcion(fila, extra) {
  return run_(function () {
    var nombreHoja = hojaForm_();
    asegurarColumnas_(nombreHoja, ['Estado_Proceso', 'ID_Alumna_Creada']);
    var t = leer_(nombreHoja);
    var r = t.rows.filter(function (x) { return x._row === fila; })[0];
    if (!r) throw new Error('No encontré la inscripción');
    var obj = formAObj_(r);
    Object.keys(obj).forEach(function (k) { if (obj[k] === null || obj[k] === undefined) delete obj[k]; });
    Object.keys(extra || {}).forEach(function (k) { if (extra[k] !== '' && extra[k] != null) obj[k] = extra[k]; });
    var id;
    if (extra && extra.ID_Alumna_existente) {
      obj.ID_Alumna = extra.ID_Alumna_existente; obj.Estado = 'Activa'; delete obj.ID_Alumna_existente;
      var res = api_guardarAlumna(obj); if (!res.ok) throw new Error(res.error); id = obj.ID_Alumna;
    } else {
      if (!obj.Nombre) {
        var partes = String(obj.Nombre_Completo || '').trim().split(/\s+/);
        obj.Nombre = partes.length > 2 ? partes[0] + ' ' + partes[partes.length - 2] : partes.join(' ');
      }
      var res2 = api_guardarAlumna(obj); if (!res2.ok) throw new Error(res2.error); id = res2.data.id;
    }
    actualizar_(nombreHoja, fila, { Estado_Proceso: 'Procesada ' + hoyStr_(), ID_Alumna_Creada: id });
    return { id: id };
  });
}

function api_descartarInscripcion(fila) {
  return run_(function () {
    var nombreHoja = hojaForm_();
    asegurarColumnas_(nombreHoja, ['Estado_Proceso', 'ID_Alumna_Creada']);
    actualizar_(nombreHoja, fila, { Estado_Proceso: 'Descartada ' + hoyStr_() });
    return { fila: fila };
  });
}
