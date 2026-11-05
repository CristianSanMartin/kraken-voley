/**
 * Kraken Vóley — Gestión del taller
 * Web App en Google Apps Script con Google Sheets como base de datos.
 *
 * Code.gs: punto de entrada de la web y utilidades de plantillas.
 */

var APP_VERSION = '1.5.0';

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.version = APP_VERSION;
  return t.evaluate()
    .setTitle('Kraken Vóley')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Para dar los permisos de Google de una vez (Drive, planillas y activadores):
 * en Kraken_BD > Extensiones > Apps Script, elegir "autorizar" arriba y apretar Ejecutar.
 * Google muestra la pantalla de permisos: hay que marcar TODAS las casillas (o "Seleccionar todo"). No cambia ningún dato.
 */
function autorizar() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  SpreadsheetApp.getActiveSpreadsheet();
  DriveApp.getRootFolder();
  ScriptApp.getProjectTriggers();
  Logger.log('Permisos listos: ya puedes volver a la web.');
  return 'Permisos listos';
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
