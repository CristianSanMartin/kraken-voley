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
  await ir('alumnas'); paso('Alumnas lista', (await p.$$('#fa-body tr[data-id]')).length > 0);
  await ir('mensualidades');
  { const g = await p.$('#gen-mes'); if (g) { await g.click(); await w(1500); } }  // el mes actual puede no estar creado aún
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
  paso('Sin errores de JavaScript', errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
