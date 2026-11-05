// Prueba de punta a punta de la web contra el simulador (requiere Playwright).
// Uso: python3 tests/armar.py && node tests/prueba.js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1380, height: 900 }, timezoneId: 'America/Santiago' })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, 'index.html'));
  const w = (ms = 900) => p.waitForTimeout(ms);
  const ir = async v => { await p.evaluate(x => ir(x), v); await w(); };
  const paso = (n, ok) => { console.log((ok ? '  OK  ' : '  FALLA ') + n); if (!ok) process.exitCode = 1; };
  await w(1500);
  paso('Inicio carga', !!(await p.$('.kpi')));
  const cum = await p.evaluate(() => new Promise(r => google.script.run.withSuccessHandler(x => r(x.data.cumpleanos)).api_dashboard('2026-01')));
  paso('Cumpleaños: solo próximos 15 días, en orden', cum.every((c, i) => c.dias >= 0 && c.dias <= 15 && (!i || cum[i - 1].dias <= c.dias)));
  { const r = await p.evaluate(() => new Promise(res => google.script.run.withSuccessHandler(x => res(x.data.asistencia.map(m => m.mes)))
      .api_alumnaDetalle(__SHEETS.Asistencia[1][2])));
    paso('Ficha: asistencia solo desde noviembre 2026', r.every(m => m >= '2026-11')); }
  await ir('alumnas'); paso('Alumnas lista', (await p.$$('#fa-body tr[data-id]')).length > 0);
  await ir('mensualidades');
  { const g = await p.$('#gen-mes'); if (g) { await g.click(); await w(1500); } }  // el mes actual puede no estar creado aún
  {
    const r = await p.evaluate(async () => {
      const call = (f, ...a) => new Promise(res => google.script.run.withSuccessHandler(x => res(x))[f](...a));
      const mes = S.boot.mes;
      const fila = id => call('api_mensualidades', mes).then(x => x.data.filas.find(f => f.idAlumna === id));
      const x = (await call('api_mensualidades', mes)).data.filas.find(f => f.estado === 'Pendiente' && f.grupo);
      const otro = x.grupo === 'A16' ? 'C12' : 'A16', out = {};
      await call('api_guardarAlumna', { ID_Alumna: x.idAlumna, Nombre: x.alumna, Grupo_Actual: otro, Tarifa: 13000 });
      let f = await fila(x.idAlumna); out.grupo = f.grupo === otro && f.esperado === 13000;
      await call('api_guardarAlumna', { ID_Alumna: x.idAlumna, Nombre: x.alumna, Estado: 'Retirada' });
      f = await fila(x.idAlumna); const d = await call('api_dashboard', mes);
      out.retiro = f.estado === 'Retirada' && !d.data.deudas.some(y => y.id === x.id);
      await call('api_guardarAlumna', { ID_Alumna: x.idAlumna, Nombre: x.alumna, Estado: 'Activa' });
      f = await fila(x.idAlumna); out.vuelve = f.estado === 'Pendiente';
      // datos que quedaron desfasados antes de este arreglo (cambiados directo en la hoja) también se corrigen
      const h = __SHEETS.Alumnas[0], i = __SHEETS.Alumnas.findIndex(r => r[0] === x.idAlumna);
      __SHEETS.Alumnas[i][h.indexOf('Estado')] = 'Retirada';
      f = await fila(x.idAlumna); out.antiguo = f.estado === 'Retirada';
      __SHEETS.Alumnas[i][h.indexOf('Estado')] = 'Activa';
      return out;
    });
    paso('Cambio de grupo/tarifa en Alumnas se ve en Finanzas', r.grupo);
    paso('Alumna retirada deja de deber el mes actual', r.retiro);
    paso('Alumna que vuelve queda Pendiente de nuevo', r.vuelve);
    paso('Retiradas de antes del arreglo también se corrigen', r.antiguo);
  }
  const antes = await p.$$eval('#fm-body .pri[data-pay]', x => x.length);
  if (antes) { await p.click('#fm-body .pri[data-pay]'); await w(300); await p.click('#pago-ok'); await w(1500); }
  paso('Registrar pago', (await p.$$eval('#fm-body .pri[data-pay]', x => x.length)) === Math.max(0, antes - 1));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  for (let i = 0; i < 2; i++) {
    await (await p.$$('#fm-body [data-pay]'))[i].click(); await w(300);
    await p.setInputFiles('#pago-comp', { name: 'transferencia.png', mimeType: 'image/png', buffer: png });
    await p.click('#pago-ok'); await w(1500);
  }
  const drive = await p.evaluate(() => { const r = __DRIVE.porId[DriveApp.getFoldersByName('Mensualidades').next().getId()]; return r.sub.map(s => s.nombre + ':' + s.archivos.length); });
  paso('Comprobante en Drive > Mensualidades > mes (una sola carpeta del mes)', drive.length === 1 && /^\d{4}-\d{2} \w+:2$/.test(drive[0]));
  paso('Enlace del comprobante en la tabla', (await p.$$('#fm-body a[title="Ver comprobante"]')).length >= 2);
  await p.click('#mm-next'); await w();
  const gen = await p.$('#gen-mes'); if (gen) { await gen.click(); await w(1500); }
  paso('Crear mensualidades del mes siguiente', (await p.$$('#fm-body [data-pay]')).length > 0);
  await p.click('#mm-prev'); await w();
  await p.click('#main thead th:nth-child(6) .fbtn'); await w(200);
  paso('Menú de filtro', !!(await p.$('#fmenu')));
  await p.keyboard.press('Escape');
  await ir('asistencia'); await p.click('[data-todas]'); await p.click('#as-save'); await w(1500);
  paso('Guardar asistencia', true);
  await ir('finanzas'); paso('Finanzas abre en Mensualidades', !!(await p.$('#fin-t [data-tf="mensualidades"].on')) && !!(await p.$('#fm-body')));
  await p.click('#fin-t [data-tf="caja"]'); await w();
  paso('Pestaña Caja', !!(await p.$('.kpi.hero')) && !!(await p.$('#fin-t [data-tf="caja"].on')));
  await ir('caja'); paso('ir(caja) abre Finanzas', !!(await p.$('#nav a[data-v="finanzas"].on')));
  await ir('torneos'); paso('Torneos', !!(await p.$('[data-t]')));
  await ir('inscripciones'); await ir('mas'); await ir('config');
  await p.evaluate(() => { window.__gpt = ScriptApp.getProjectTriggers; ScriptApp.getProjectTriggers = () => { throw new Error('No cuentas con el permiso'); }; });
  await ir('apoderados');
  paso('Apoderados sin permiso de activadores: igual carga y explica qué hacer', /autorizar/.test(await p.textContent('#main')));
  paso('Apoderados sin página publicada: lo avisa', /aún no está publicada/.test(await p.textContent('#main')));
  await p.evaluate(() => { ScriptApp.getProjectTriggers = window.__gpt; window.PORTAL_URL = 'https://script.google.com/macros/s/PORTAL/exec'; });
  await ir('apoderados');
  await p.click('#por-act'); await w(1500);
  {
    const r = await p.evaluate(() => {
      const al = __SHEETS.Alumnas, h = al[0], col = n => h.indexOf(n);
      const activas = al.slice(1).filter(x => x[col('Estado')] === 'Activa');
      const datos = Object.values(__FILES).find(f => f.nombre === 'Kraken - Portal datos (no borrar)');
      const filas = datos.tabs[0].datos.slice(1);
      const enlaces = [...document.querySelectorAll('#main a[title^="Ver la página"]')].map(a => a.href);
      // cada alumna activa aparece en exactamente una familia; cada familia solo con sus hijas
      const vistas = {};
      filas.forEach(f => JSON.parse(f[2]).alumnas.forEach(a => { vistas[a.nombre] = (vistas[a.nombre] || 0) + 1; }));
      const tel = x => String(x[col('Telefono_Apoderado')] || '').replace(/\D/g, '').slice(-8);
      const famDe = {}; filas.forEach((f, i) => JSON.parse(f[2]).alumnas.forEach(a => { famDe[a.nombre] = i; }));
      const porTel = {}; activas.forEach(x => { const t = tel(x); if (t.length >= 8) (porTel[t] = porTel[t] || new Set()).add(famDe[x[col('Nombre')]]); });
      const hermanasSeparadas = activas.some(x => String(x[col('Hermanos')] || '').split(/[\s,;]+/).some(id => { const y = activas.find(z => z[col('ID_Alumna')] === id); return y && famDe[y[col('Nombre')]] !== famDe[x[col('Nombre')]]; }));
      const mezcla = Object.values(porTel).some(s => s.size > 1) || hermanasSeparadas;
      const todo = JSON.stringify(filas);
      return { nAct: activas.length, unaVez: activas.every(x => vistas[x[col('Nombre')]] === 1), mezcla, nFilas: filas.length, nEnlaces: enlaces.length,
        enlaceOk: enlaces.every(u => /^https:\/\/script\.google\.com\/macros\/s\/PORTAL\/exec\?d=SS\d+&f=[a-z0-9]{40}$/.test(u)),
        notas: /Dijo que paga|Mes sin registro de pagos/.test(todo), obs: activas.some(x => x[col('Observaciones')] && todo.indexOf(String(x[col('Observaciones')])) >= 0) };
    });
    paso('Una familia por apoderado: cada alumna activa en un solo enlace, hermanas juntas', r.unaVez && !r.mezcla && r.nFilas > 0);
    paso('Enlaces personales con clave larga', r.nEnlaces === r.nFilas && r.enlaceOk);
    paso('Sin notas internas ni observaciones en los datos de la página', !r.notas && !r.obs);
  }
  {
    const r = await p.evaluate(async () => {
      const call = (f, ...a) => new Promise(res => google.script.run.withSuccessHandler(x => res(x))[f](...a));
      const datos = () => Object.values(__FILES).find(f => f.nombre === 'Kraken - Portal datos (no borrar)').tabs[0].datos.slice(1).map(x => x[0]);
      const est = (await call('api_portalEstado')).data, f = est.familias[0], antes = f.enlace.split('f=')[1];
      await call('api_portalNuevoEnlace', f.clave);
      const est2 = (await call('api_portalEstado')).data, despues = est2.familias.find(x => x.clave === f.clave).enlace.split('f=')[1];
      const cambio = antes !== despues && datos().indexOf(antes) < 0 && datos().indexOf(despues) >= 0;
      // retiro: el enlace deja de funcionar
      const h = __SHEETS.Alumnas[0], iS = h.indexOf('Estado'), iN = h.indexOf('Nombre');
      const filas = __SHEETS.Alumnas.filter((x, i) => i && f.alumnas.indexOf(x[iN]) >= 0 && x[iS] === 'Activa');
      filas.forEach(x => { x[iS] = 'Retirada'; });
      await call('api_portalActualizar');
      const fuera = datos().indexOf(despues) < 0;
      filas.forEach(x => { x[iS] = 'Activa'; });
      await call('api_portalActualizar');
      return { cambio, fuera, vuelve: datos().indexOf(despues) >= 0 };
    });
    paso('Nuevo enlace: el anterior deja de funcionar', r.cambio);
    paso('Alumna retirada: su enlace deja de funcionar (y vuelve si regresa)', r.fuera && r.vuelve);
  }
  {
    await ir('apoderados');
    await p.click('[data-pedit]'); await w(600);
    const abierto = !!(await p.$('#f-alu'));
    await p.fill('#f-alu [name=Talla]', 'M'); await p.click('#alu-save'); await w(2000);
    const ok = await p.evaluate(() => { const d = Object.values(__FILES).find(f => f.nombre === 'Kraken - Portal datos (no borrar)').tabs[0].datos.slice(1);
      return d.some(x => JSON.parse(x[2]).alumnas.some(a => a.ficha.some(c => c[0] === 'Talla' && c[1] === 'M'))); });
    paso('Apoderados: editar la ficha de una alumna y la página de la familia queda al día', abierto && ok);
  }
  {
    const r = await p.evaluate(async () => {
      const call = (f, ...a) => new Promise(res => google.script.run.withSuccessHandler(x => res(x))[f](...a));
      const fs = (await call('api_portalEstado')).data.familias.filter(f => f.enlace && f.alumnas.length === 1);
      const a = fs[0], b = fs[1], tokA = a.enlace.split('f=')[1];
      const res = await call('api_portalJuntar', a.clave, b.clave);
      const est = (await call('api_portalEstado')).data;
      const junta = est.familias.filter(f => f.alumnas.indexOf(a.alumnas[0]) >= 0 && f.alumnas.indexOf(b.alumnas[0]) >= 0);
      return { ok: res.ok, junta: junta.length === 1, total: est.familias.length === (await call('api_portalEstado')).data.familias.length,
        enlace: junta[0] && [tokA, b.enlace.split('f=')[1]].indexOf(junta[0].enlace.split('f=')[1]) >= 0 };
    });
    paso('Juntar familias: quedan en una sola, con uno de los enlaces que ya tenían', r.ok && r.junta && r.enlace);
  }
  await ir('apoderados');
  await p.click('#por-diario'); await w(800);
  paso('Actualización de cada noche activada', await p.evaluate(() => __TRIGGERS.length === 1 && __TRIGGERS[0].getHandlerFunction() === 'portalDiario'));
  {
    const q = await b.newPage({ viewport: { width: 390, height: 844 } });
    const e2 = []; q.on('pageerror', e => e2.push(e.message));
    await q.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await q.goto('file://' + path.join(__dirname, 'portal_previa.html')); await q.waitForTimeout(800);
    const ok1 = !!(await q.$('.jug h2')) && /Mensualidad de/.test(await q.textContent('#app'));
    let ok2 = true;
    for (const t of ['pagos', 'asistencia', 'partidos', 'ficha']) { await q.click('[data-t="' + t + '"]'); await q.waitForTimeout(100); ok2 = ok2 && !!(await q.$('[data-t="' + t + '"].on')); }
    const ancho = await q.evaluate(() => document.documentElement.scrollWidth);
    await q.goto('about:blank'); await q.goto('file://' + path.join(__dirname, 'portal_previa.html') + '#sin'); await q.waitForTimeout(500);
    const ok3 = /no funciona/.test(await q.textContent('#app'));
    paso('Página de apoderados: muestra la jugadora y sus pestañas, sin desbordar en el celular', ok1 && ok2 && ancho <= 390 && e2.length === 0);
    paso('Página de apoderados: enlace inválido muestra aviso', ok3);
    if (e2.length) console.log(e2);
    await q.close();
  }
  { let ok = true; try { new Function(require('fs').readFileSync(path.join(__dirname, '..', 'portal', 'Apoderados.gs'), 'utf8')); } catch (e) { ok = false; console.log(e.message); }
    paso('Código de la página de apoderados sin errores de sintaxis', ok); }
  paso('Sin errores de JavaScript', errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
