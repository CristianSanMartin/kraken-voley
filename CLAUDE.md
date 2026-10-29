# Kraken Vóley — web de gestión del taller

Web en **Google Apps Script** con **Google Sheets (Kraken_BD)** como base de datos. La usa Cristian (dueño y profesor del
taller de vóley Kraken, en Maipú) para alumnas, mensualidades, asistencia, caja, torneos e inscripciones.
Cristian no es técnico: háblale en español simple, sin jerga, y explícale lo que tiene que hacer él paso a paso.

## Cómo se publica (no cambiar sin avisar)
- El código vive en `src/`. Cristian publica con **`Kraken - Actualizar.bat`** (lo tiene en su PC): descarga
  `actualizar.ps1` desde `main`, baja `main` como zip, hace `clasp push` y `clasp deploy -i <id>` (misma URL siempre).
- **Para entregar un cambio: commit + push a `main` y subir `VERSION`.** Luego decirle que haga doble clic en el actualizador.
- `actualizar.ps1` se ejecuta en Windows PowerShell 5.1: solo ASCII (sin tildes) y saltos de línea CRLF.
- El script está vinculado a la hoja (Extensiones → Apps Script), por eso `ss_()` usa `getActiveSpreadsheet()`.
  No poner el ID de la hoja en el código.

## Privacidad (repo PÚBLICO)
- Nunca subir datos reales: ni la hoja, ni Excel, ni nombres/RUT de alumnas o apoderados, ni montos de sueldos.
- `tests/datos_ejemplo.json` es ficticio (nombres y RUT inventados, sueldos alterados). Mantenerlo así.
- En la web, el listado de alumnas NO muestra el detalle de la condición médica (solo un ícono); el detalle va en la ficha.

## Base de datos (Kraken_BD)
- Se lee y escribe **por nombre de encabezado** (`leer_`, `agregar_`, `actualizar_` en `Db.gs`). No depender del orden de columnas.
- IDs estables: `ALU-001`, `MEN-00001`, `ASI-00001`, `MOV-0001`, `TOR-01`, `PAR-001`, `CUO-0001`. Nunca reutilizar ni borrar filas;
  las alumnas que se van quedan `Estado = Retirada`; los movimientos se **anulan** (monto 0 + referencia "ANULADO").
- Columnas tipo texto (`Mes` = "2026-10", RUT, Dorsal…) se escriben con apóstrofo para que Sheets no las convierta (ver `COLS_TEXTO`).
- Hojas: Alumnas, Mensualidades (1 fila = alumna×mes), Asistencia (1 fila = alumna×sábado), Movimientos (caja sin mensualidades),
  Personal, Torneos, Torneo_Plantel, Partidos, Torneo_Cuotas, Estadisticas, Camisetas, Camisetas_Pagos, Compras_Detalle, Club,
  Planificacion, Inscripciones / "Respuestas de formulario N" (Google Forms), Config (clave/valor), Revision, Log.

## Reglas del taller
- Mensualidad estándar $16.000; $13.000 = tarifa anterior o hermanas (ej. hermanas Garbo). La tarifa vive en la ficha.
- Pago dentro de los primeros 10 días (`Config.Dia_Limite_Pago`); después, una Pendiente se muestra **Atrasada**.
- Estados de mensualidad: Pagado, Pendiente, Promete pagar, Becada, Sin cobro, Clase de prueba, Sin registro, Retirada.
- Asistencia: Presente / Justificada / Injustificada (registros antiguos: Ausente). Más de 3 injustificadas en el mes = alerta (Estatutos 5.2).
- Caja: ingresos = mensualidades pagadas del mes + movimientos de ingreso. **El pago de Cristian es el remanente**
  (ingresos − gastos), categoría `Pago Cristian (remanente)`.
- Grupos en `Config.Grupos`; equipo competitivo = `Config.Grupos_Competitivos` (A14, A16, A14-16). Hoy el taller es solo de niñas de 9 a 16.
- Una alumna se identifica como "él" y usa el nombre Dominik: respetar el nombre de uso de la ficha.

## Web (src/)
- `Api.gs`: funciones `api_*` llamadas con `google.script.run`; siempre devuelven `{ok, data}` / `{ok:false, error}` y objetos sin `Date`.
- `App.html`: JS sin framework. Vistas en `R.<vista>`. Toda tabla con `<thead>` recibe sola orden + filtro tipo Excel
  (`mejorarTablas`); para que una celda ordene/filtre por un valor limpio, ponle `data-v`.
- Estilo: colores del logo (morado `--kr-*`), fuentes Outfit + Inter. Responsive (menú lateral se oculta bajo 820px).

## Probar antes de subir
```
python3 tests/armar.py && node tests/prueba.js
```
`tests/mock.js` simula SpreadsheetApp/Utilities/Session/LockService y `google.script.run` en el navegador.
Si agregas una función de Apps Script nueva (p. ej. `UrlFetchApp`), agrégala al mock.

## Pendientes
Ver `PENDIENTES.md`.
