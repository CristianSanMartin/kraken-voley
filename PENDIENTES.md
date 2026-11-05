# Pendientes — Kraken Vóley

## Respuestas que faltan de Cristian (datos de Kraken_BD, hoja Revision)
- [ ] Nombres de los **grupos actuales** fuera del equipo competitivo (en oct-2026 aún aparecen D y C12).
- [ ] ¿Carla Garcés (2024) = Carla Burgos? ¿Sofia Gomez (2024) = Sofia Gomezsanchez?
- [ ] Nombre real de "Hermanaconi Jara" (nov-2024).
- [ ] Nombre de cada torneo (TOR-01 ago–dic 2025, TOR-02 mar–ago 2026, TOR-03 ago–oct 2026) y qué significa $0 en las cuotas.
- [ ] ¿Giulianna Passalacqua y Leo Vergara son hermanos?
- [ ] 22 alumnas activas sin RUT/ficha (se piden por el formulario).

## Por construir (decide Cristian el orden)
- [ ] **Mejorar la parte financiera** (prioridad). Paso 1 hecho: Mensualidades y Caja juntas en Finanzas.
- [ ] Estadísticas por jugadora y partido (hoja Estadisticas ya creada, vacía).
- [ ] Vincular el Formulario de Google a Kraken_BD y agregarle: teléfono, correo, autorización de imagen, talla.

## Hecho
- v1.0: migración del Excel (nov-2023 → oct-2026) a Kraken_BD con IDs; web con Inicio, Alumnas, Mensualidades, Asistencia, Caja, Torneos, Inscripciones, Más registros, Configuración.
- v1.1: orden y filtro tipo Excel en todas las tablas; actualizador único desde GitHub.
- v1.2: Mensualidades y Caja pasan a ser pestañas de una sola sección **Finanzas**.
- v1.2.1: Inicio muestra los cumpleaños de los próximos 15 días.
- v1.3: botón para adjuntar el comprobante de pago (foto) al registrar un pago; se guarda en Drive > Mensualidades > "2026-11 Noviembre" y queda enlazado (📎) en la mensualidad.
- v1.3.1: Alumnas y Finanzas conectadas: cambio de grupo/tarifa, retiro y reingreso se reflejan en las mensualidades desde el mes actual (los meses pasados no se tocan).
- v1.3.2: la asistencia solo cuenta desde noviembre 2026 (`Config.Asistencia_Desde`, por defecto 2026-11); los registros antiguos quedan en la hoja.
- v1.4: portal de apoderados = planilla de Google por familia (pagos, asistencia, partidos, ficha), compartida solo con su Gmail y actualizada cada noche.
- v1.5: la página de apoderados pasa a ser una web propia (Kraken Apoderados) con enlace personal por familia; reemplaza las planillas por familia de v1.4.
- v1.5.2: en Apoderados, editar la ficha de cada alumna (la página de la familia queda al día) y juntar familias; hermanas se agrupan también por correo o por el campo Hermanos.
