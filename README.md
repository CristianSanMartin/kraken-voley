# Kraken Vóley · Web de gestión del taller

Web en Google Apps Script que usa la hoja **Kraken_BD** (Google Sheets) como base de datos:
alumnas, mensualidades, asistencia, caja, torneos e inscripciones.

Este repositorio contiene **solo el código**. Los datos viven en la hoja de Google (acceso restringido).

## Actualizar la web
Doble clic en **`Kraken - Actualizar.bat`** (se descarga una sola vez).
Baja la última versión de este repositorio y la publica. La primera vez además instala lo necesario
(Node.js, clasp) y pide el ID del script de Kraken_BD (*Extensiones → Apps Script → Configuración del proyecto*).

## Estructura
- `src/` — código de la web (`Code.gs`, `Db.gs`, `Api.gs`, `Index.html`, `Styles.html`, `App.html`)
- `actualizar.ps1` — lo que ejecuta el actualizador
- `VERSION` — versión publicada
