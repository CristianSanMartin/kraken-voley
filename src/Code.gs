/**
 * Kraken Vóley — Gestión del taller
 * Web App en Google Apps Script con Google Sheets como base de datos.
 *
 * Code.gs: punto de entrada de la web y utilidades de plantillas.
 */

var APP_VERSION = '1.2.0';

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.version = APP_VERSION;
  return t.evaluate()
    .setTitle('Kraken Vóley')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Inserta el contenido de otro archivo HTML (Styles, App...). */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Menú dentro de la hoja de cálculo: acceso rápido a la web. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🐙 Kraken')
      .addItem('Abrir la web', 'abrirWeb_')
      .addToUi();
  } catch (err) { /* sin UI (ejecución desde la web) */ }
}

function abrirWeb_() {
  var url = ScriptApp.getService().getUrl();
  var html = HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif">Abre la web aquí: <a target="_blank" href="' + url + '">' + url + '</a></p>'
  ).setWidth(420).setHeight(90);
  SpreadsheetApp.getUi().showModalDialog(html, 'Kraken Vóley');
}
