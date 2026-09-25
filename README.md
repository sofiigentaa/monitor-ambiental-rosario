# Monitor Ambiental Rosario

App web para el desarrollo sostenible y el cuidado del ambiente en Rosario:

- Muestra qué zonas (arroyos Ludueña y Saladillo, río Paraná) tienen agua contaminada,
  a partir de datos oficiales de monitoreo de la Municipalidad, para evitar que la
  gente se intoxique por contacto con el agua.
- Suma reportes ciudadanos en tiempo real (síntomas respiratorios, bruma estimada por
  foto) y un indicador de riesgo respiratorio personal, para cubrir el vacío entre
  monitoreos oficiales (que son mensuales).
- Alerta de forma anticipada si el humo de quemas en las islas del Delta tiene
  chances de llegar a la ciudad, combinando focos de calor satelitales con el
  pronóstico de viento.
- Ayuda a reciclar bien (dónde y qué) y a entender el impacto ambiental de no hacerlo.

## Arquitectura

- **Frontend hardcodeado** (`/frontend`): HTML/CSS/JS plano, sin build. Mapa con
  [Leaflet](https://leafletjs.com/) + OpenStreetMap (gratis, sin API key), organizado
  en pestañas (Agua, Reportes ciudadanos, Riesgo respiratorio, Alerta de humo,
  Reciclaje, Glosario).
- **Backend/API** (`/backend`): Node.js + Express. Expone un API REST propio que
  sirve los puntos de monitoreo de agua, los reportes ciudadanos y la alerta de humo,
  todos ya con su nivel de alerta calculado.
- **Datos de agua**: dataset semilla (`backend/src/data/*.json`) construido a partir
  del informe oficial *"Monitoreo Cuerpos Superficiales de Agua - Arroyo Ludueña -
  Mayo 2024"* de la Dirección de Fiscalización Ambiental (Municipalidad de Rosario,
  en convenio con la FCEIA-UNR). No es tiempo real: son muestreos mensuales.
- **Datos de humo**: en vivo, vía NASA FIRMS (focos de calor) y Open-Meteo (viento),
  ver [Alerta de humo](#alerta-de-humo-por-quemas-en-las-islas) más abajo.

```
monitor-ambiental-rosario/
├── backend/
│   ├── .env.example         # variables de entorno (FIRMS_MAP_KEY)
│   ├── src/
│   │   ├── data/                 # datasets semilla de agua (JSON)
│   │   ├── lib/
│   │   │   ├── ica.js             # nivel de alerta de agua
│   │   │   ├── reportes.js        # reportes ciudadanos + alerta temprana
│   │   │   └── humo.js            # alerta de humo (FIRMS + viento)
│   │   ├── routes/
│   │   │   ├── api.js             # endpoints de puntos de agua
│   │   │   ├── reportes.js        # endpoints de reportes ciudadanos
│   │   │   └── humo.js            # endpoint de alerta de humo
│   │   └── server.js
│   ├── scripts/actualizar-datos.js   # punto de extensión para datos de agua en vivo
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
└── README.md
```

## Cómo correrlo

```bash
cd backend
npm install
npm start
```

El backend levanta en `http://localhost:3001` y sirve también el frontend
estático (`http://localhost:3001`), así que con ese solo comando ya podés
abrir la app en el navegador. El API queda disponible en
`http://localhost:3001/api/...`.

Si preferís servir el frontend aparte (por ejemplo con `npx serve frontend`),
`frontend/js/app.js` ya detecta si no está en `localhost` y apunta a `/api`
relativo — ajustá `API_BASE` en ese archivo según cómo lo despliegues.

Todas las funcionalidades excepto la alerta de humo funcionan sin ninguna
configuración extra. Para la alerta de humo hace falta una variable de entorno
gratuita, ver la sección de abajo.

### Configurar la alerta de humo (`FIRMS_MAP_KEY`)

1. Pedí una clave gratuita (toma un minuto, solo con un email) en
   [firms.modaps.eosdis.nasa.gov/api/map_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/).
2. Copiá `backend/.env.example` a `backend/.env` y pegá la clave:
   ```
   FIRMS_MAP_KEY=tu_clave_aca
   ```
3. Reiniciá el backend (`npm start`).

Sin esta variable, el resto de la app funciona igual — `/api/humo` responde
`{"estado": "datos_no_disponibles", ...}` con un mensaje explicativo, en vez de
romper o mostrar un error.

## Endpoints del API

| Método | Ruta                    | Descripción                                                  |
|--------|-------------------------|---------------------------------------------------------------|
| GET    | `/api/puntos`           | Todos los puntos de monitoreo de agua con nivel de alerta calculado |
| GET    | `/api/puntos/:id`       | Detalle de un punto de agua                                    |
| GET    | `/api/alertas`          | Solo puntos de agua en alerta amarilla o roja                   |
| GET    | `/api/zonas/:barrio`    | Puntos de agua filtrados por barrio (substring, case-insensitive) |
| GET    | `/api/resumen`          | Conteo de puntos de agua por nivel de alerta                    |
| GET    | `/api/reportes`         | Todos los reportes ciudadanos (síntomas + bruma por foto)       |
| POST   | `/api/reportes`         | Crea un reporte ciudadano nuevo (requiere `dispositivo_id`, rate limit por dispositivo) |
| POST   | `/api/reportes/:id/confirmar` | Otro vecino confirma un reporte existente ("yo también lo noto") |
| GET    | `/api/reportes/alerta`  | Alerta temprana comunitaria cerca de un punto (`?lat=&lng=`)    |
| GET    | `/api/humo`             | Focos de calor, pronóstico horario de riesgo de humo, nivel actual y próxima ventana de riesgo |
| GET    | `/api/exportar/json`    | Datos abiertos: puntos de agua evaluados, en JSON               |
| GET    | `/api/exportar/csv`     | Datos abiertos: puntos de agua evaluados, en CSV (una fila por punto) |
| GET    | `/api/rio`              | Altura del río Paraná en Rosario, tendencia y niveles de alerta/evacuación |
| GET    | `/api/balnearios`       | Semáforo de balnearios (cargado a mano, ver más abajo)          |
| GET    | `/api/telegram/info`    | Si el bot de Telegram está configurado, y su `@usuario` (para el botón de la web) |
| GET    | `/api/expediente`       | Resumen de reportes ciudadanos cerca de un punto (`?lat=&lng=`), para un reclamo formal o pedido de informes |

## Cómo se calcula el nivel de alerta

Santa Fe no tiene una normativa propia con niveles guía de calidad de agua para
cuerpos superficiales (lo aclara el propio informe municipal). Por eso el cálculo
(`backend/src/lib/ica.js`) usa como referencia la **Resolución 283/2019** (misma
referencia comparativa que usa la Municipalidad en sus informes), evaluando pH,
oxígeno disuelto, DBO y coliformes fecales contra los 3 usos que define esa norma:

- 🟢 **Verde** — cumple Uso I: apta para protección de biota y contacto directo.
- 🟡 **Amarillo** — cumple como máximo Uso II/III: evitar el contacto directo.
- 🔴 **Rojo** — no cumple ningún uso, o los coliformes fecales superan largamente
  el límite sanitario (riesgo directo de intoxicación/infección).
- ⚪ **Sin datos** — todavía no hay una medición oficial cargada para ese punto.

Esto es una simplificación propia para esta app, no un índice reconocido
oficialmente — está documentado en detalle en los comentarios de `ica.js`.

### Historial y tendencia por punto

Cada punto guarda un `historial_mediciones` (array, no un solo objeto) pensado para
acumular mediciones en el tiempo. Hoy, salvo que se cargue una medición nueva, cada
punto tiene una sola entrada — **no se inventaron mediciones viejas para "rellenar"
el gráfico**. La vista de detalle de cada punto muestra un gráfico de línea (Chart.js
por CDN) con pH, DBO y oxígeno disuelto, y un indicador de si mejora o empeora
comparando las dos últimas mediciones; con una sola medición cargada, en cambio,
muestra un aviso de que hace falta una segunda para poder graficar tendencia. Esto se
resuelve solo cuando se complete la Fase 4 de agua (conectar `actualizar-datos.js` a
una fuente en vivo) o se cargue a mano una medición nueva en
`backend/src/data/puntos-luduena.json`.

## Datos abiertos

Para periodistas, investigadores u ONGs que quieran usar los datos de agua fuera de
esta app, sin depender del frontend:

- `GET /api/exportar/json` — los mismos puntos evaluados que `/api/puntos`, pensado
  como endpoint estable para integraciones.
- `GET /api/exportar/csv` — una fila por punto con su última medición (`backend/src/lib/exportar.js`),
  para abrir directo en una planilla de cálculo.

Ambos incluyen el nivel de alerta ya calculado. Como el resto del proyecto, son datos
de agua (mensuales, no en tiempo real) — para reportes ciudadanos o alerta de humo en
vivo, usá `/api/reportes` y `/api/humo`.

## Reportes ciudadanos y riesgo respiratorio

No hay ninguna fuente de calidad de **aire** conectada a este proyecto (los datos
oficiales son solo de agua, y encima mensuales). Estas dos pestañas cubren ese vacío
con una señal comunitaria explícitamente no-oficial:

- **Reportes ciudadanos** (pestaña "📢 Reportes ciudadanos"): cualquiera puede reportar
  síntomas (tos, ardor de ojos, dificultad para respirar, olor fuerte) o subir una foto
  del aire/cielo. La foto se procesa en el navegador con una heurística simple de
  saturación/contraste (`estimarBrumaDesdeFoto` en `app.js`) para estimar un puntaje de
  "bruma" 0-100 — **no es una medición de calidad de aire real**, es una aproximación
  visual. Los reportes se guardan en memoria en el backend (`backend/src/lib/reportes.js`);
  se pierden si el proceso se reinicia, para persistencia real haría falta una base de
  datos. Cada reporte y cada punto de agua tienen un botón para generar un reclamo
  formal (texto listo para copiar) con links a las categorías reales de
  [reclamos de rosario.gob.ar](https://www.rosario.gob.ar/inicio/consultas-y-reclamos).
- **Confiabilidad de los reportes**: no hay login, así que un `dispositivo_id`
  generado en el navegador (guardado en `localStorage`) es lo único que identifica
  quién reporta. Con eso el backend limita cuántos reportes puede mandar un mismo
  dispositivo por hora (rate limit, `backend/src/lib/reportes.js`), y cualquier otro
  vecino puede "confirmar" un reporte ya existente ("👍 Yo también lo noto", tocando
  el marcador en el mapa). Un reporte aislado sin confirmar pesa la mitad en los
  cálculos de alerta temprana y de riesgo respiratorio que uno confirmado por al
  menos un vecino — así un reporte erróneo o mal intencionado aislado no dispara
  una alerta por sí solo.
- **Riesgo respiratorio** (pestaña "🫁 Riesgo respiratorio"): combina los reportes
  cercanos (síntomas + bruma, últimas 24hs, 800m) y el pronóstico de humo (ver abajo)
  en un puntaje 0-100, ponderado por perfil de salud (general/asma/EPOC/niño
  deportista). No es un diagnóstico médico ni reemplaza indicación profesional.

## Alerta de humo por quemas en las islas

Estimación propia y simplificada (`backend/src/lib/humo.js`) de si el humo de las
quemas en las islas del Delta frente a Rosario tiene chances de llegar a la ciudad,
combinando dos fuentes gratuitas:

- **Focos de calor**: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (VIIRS_SNPP_NRT,
  VIIRS_NOAA20_NRT y MODIS_NRT), dentro de un cuadrante configurable sobre las islas
  del lado entrerriano frente a la ciudad.
- **Viento**: [Open-Meteo](https://open-meteo.com/) (pronóstico horario de dirección y
  velocidad, 48hs), y opcionalmente PM2.5 pronosticado (modelo CAMS) como complemento.

Por cada hora del pronóstico, calcula hacia dónde sopla el viento (la dirección de
transporte del humo es la opuesta a "de dónde viene" el viento) y si algún foco activo
queda alineado con esa dirección dentro de un cono de tolerancia. El resultado es un
nivel por hora (`sin_riesgo` / `bajo` / `moderado` / `alto`), una zona aproximada de la
ciudad más expuesta, y la próxima ventana de tiempo con riesgo moderado/alto.

**Esto NO es un modelo de dispersión atmosférica oficial** (esos existen — HYSPLIT, por
ejemplo — y usan variables que acá no tenemos: humedad, capa de mezcla, topografía
fina). Es una señal de alerta temprana propia, documentada en detalle en los
comentarios de `humo.js`, pensada para complementar — no reemplazar — las fuentes
oficiales (por ejemplo, los avisos de Defensa Civil o del municipio ante eventos de
humo). Los datos se cachean 45 minutos en memoria para no saturar las APIs gratuitas.

## Río y playas

Pestaña "🌊 Río y playas", con dos fuentes de naturaleza muy distinta:

- **Altura del río Paraná** (`backend/src/lib/rio.js`): dato oficial y en vivo de
  **Prefectura Naval Argentina**, que publica cada ~12hs la altura hidrométrica de
  varios puertos. Prefectura no tiene una API JSON pública, así que esto scrapea la
  tabla HTML de su sitio — se verificó el formato a mano antes de escribir el parser,
  pero por ser scraping es inherentemente frágil: si cambian el HTML de esa página,
  el endpoint va a empezar a responder `datos_no_disponibles` en vez de romperse o
  devolver un dato incorrecto. Se muestra la tendencia (creciendo/bajando/estable) y
  los umbrales de alerta/evacuación que usa la propia Prefectura para Rosario, con
  una aclaración de que en bajante la contaminación tiende a concentrarse más (menos
  agua diluyendo los mismos vertidos).
- **Semáforo de balnearios** (`backend/src/lib/balnearios.js` +
  `backend/src/data/balnearios.json`): se investigó si la Municipalidad publica un
  indicador de aptitud para baño en un formato automatizable — la página oficial de
  La Florida / Rambla Catalunya es informativa (servicios, horarios), sin resultados
  bacteriológicos en un formato consumible. Por eso este dato se carga **a mano**, con
  `fecha_actualizacion` visible en la respuesta del API y en la UI. Hoy todos los
  balnearios figuran como `sin_datos` — no se inventó un estado de aptitud sin una
  fuente real que lo respalde.

## Alertas por Telegram

Botón "📲 Recibí alertas en Telegram" al pie de la web (se esconde solo si el bot no
está configurado). El bot (`backend/src/lib/bot.js`) habla directo con la API de
Telegram por HTTP (sin librería externa, mismo criterio que `humo.js`/`rio.js`), por
long-polling — no hace falta un dominio público ni webhook, así que funciona igual en
local o en Render sin configuración extra de red.

**Configuración** (ver `backend/.env.example`): `TELEGRAM_BOT_TOKEN` se consigue
gratis hablándole a [@BotFather](https://t.me/BotFather) en Telegram (`/newbot`).
`TELEGRAM_BOT_USERNAME` es el nombre de usuario que le pusiste, solo se usa para armar
el link del botón. Sin `TELEGRAM_BOT_TOKEN`, el bot simplemente no arranca.

**Comandos:**

| Comando | Qué hace |
|---|---|
| Mandar tu ubicación (📎 → Ubicación) | El bot pregunta un nombre y guarda esa zona |
| `/agregar <nombre> <barrio>` | Guarda una zona por nombre de barrio, ej. `/agregar casa Fisherton` (el barrio se resuelve al promedio de los puntos de agua conocidos con ese `barrio_aprox` — no es geocodificación real) |
| `/zonas` | Lista tus zonas guardadas |
| `/borrar <nombre>` | Borra una zona |
| `/baja` | Se da de baja (borra todas las zonas del chat) |
| `/ayuda` | Muestra los comandos |

**Avisos:** cada zona guarda un "último estado notificado" y solo avisa ante un
*cambio* (no en cada chequeo periódico, que corre cada 15 minutos) — riesgo de humo
que sube a moderado/alto, cambio de nivel del punto de agua más cercano (hasta 3km),
aparición de reportes ciudadanos confirmados cerca (reutiliza `hayAlertaTemprana` de
`reportes.js`), o cambio de estado de cualquier balneario. La primera vez que se
revisa una zona nueva no dispara avisos — solo establece la base para comparar después.

Persistencia en memoria, igual que los reportes ciudadanos (se pierde si el proceso
se reinicia).

## Expediente colectivo

Pestaña "📢 Reportes ciudadanos" → sección "Expediente colectivo". Cuando el peso
acumulado de reportes de síntomas cerca de un punto (`backend/src/lib/expediente.js`,
misma lógica de ponderación por confirmaciones que `reportes.js`) supera un umbral
propio (5 — más alto que el umbral de 3 que dispara la alerta temprana, porque un
expediente es un paso más serio), se arma un resumen con:

- Cantidad de vecinos involucrados (dispositivos distintos: quien reportó + quienes confirmaron).
- Reportes totales y confirmados, período (desde/hasta).
- Síntomas agrupados y reportes de bruma por foto (con su puntaje visual promedio).
- Puntos de agua cercanos (hasta 3km) en alerta amarilla o roja.
- Condición de humo por quemas en las islas en el momento.

Se puede copiar como texto (mismo patrón que los reclamos de puntos/reportes) o abrir
como documento HTML con estilos de impresión (`@media print`) en una pestaña nueva,
para imprimir o guardar como PDF desde el diálogo de impresión del navegador — sin
backend ni build, generado 100% en el cliente con un Blob. Mantiene los mismos enlaces
a los canales oficiales de reclamos ya usados en el resto de la app, y aclara que
también sirve de base para un pedido de informes ante el Concejo Municipal (sin
inventar un link directo a ese trámite, que en la práctica lo inicia un concejal).

**Importante:** es un resumen de reportes ciudadanos autogestionados, sin verificación
de campo. No reemplaza una inspección o medición oficial.

## Fuentes de datos

- [Rosario Datos — Calidad Ambiental / Agua](https://datos.rosario.gob.ar/territorio/ambiente/calidad-ambiental/agua)
- [Informe Arroyo Ludueña, Mayo 2024 (PDF, fuente de los datos semilla)](https://datos.rosario.gob.ar/sites/default/files/2024-09/Monitoreo%20Cuerpos%20Superficiales%20de%20Agua%20Arroyo%20Ludue%C3%B1a%20Mayo%202024.pdf)
- [Datos Abiertos Rosario (portal DKAN)](https://datosabiertos.rosario.gob.ar/)
- [CIAM / SInIA — Centro de Información Ambiental (Nación)](https://www.argentina.gob.ar/ambiente/ciam/agua)
- [Infomapa Rosario](https://infomapa.rosario.gov.ar/) — capas georreferenciadas municipales
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — focos de calor satelitales (VIIRS/MODIS), usados en la alerta de humo
- [Open-Meteo](https://open-meteo.com/) — pronóstico de viento y calidad de aire (gratis, sin API key)
- [Reclamos y consultas — rosario.gob.ar](https://www.rosario.gob.ar/inicio/consultas-y-reclamos) — canal oficial de reclamos ambientales
- [Residuos — rosario.gob.ar](https://www.rosario.gob.ar/inicio/residuos) — centros de recepción y mapa oficial de reciclables
- [Prefectura Naval Argentina — Altura de los ríos](https://contenidosweb.prefecturanaval.gob.ar/alturas/) — altura hidrométrica del Paraná (scrapeada, ver `rio.js`)
- [Balneario La Florida y Rambla Catalunya — rosario.gob.ar](https://www.rosario.gob.ar/inicio/balneario-la-florida-y-rambla-catalunya) — página oficial de los balnearios
- [Telegram Bot API](https://core.telegram.org/bots/api) — usada directo por HTTP para las alertas por suscripción

## Estado y próximos pasos

**Fases originales del monitor de agua:**

- ✅ Fase 0 — estructura del repo
- ✅ Fase 1 — dataset semilla con datos reales del Ludueña (12 puntos)
- ✅ Fase 2 — backend/API con cálculo de nivel de alerta
- ✅ Fase 3 — frontend hardcodeado (mapa + panel + detalle)
- 🟡 Fase 4 — capa de actualización de **agua**: `scripts/actualizar-datos.js`
  está armado como punto de extensión pero **todavía no conecta a una fuente
  en vivo** (ver el comentario en ese archivo — falta confirmar el
  `resource_id` del DKAN o parsear PDFs nuevos a mano).
- 🟡 Fase 5 — pulido: falta cargar datos estructurados del arroyo Saladillo y
  el río Paraná (hoy figuran como `sin_datos_estructurados`), mejorar la
  precisión de las coordenadas (hoy son aproximadas, ver
  `nota_coordenadas` en el dataset) y accesibilidad/mobile del frontend.

**Ampliación de funcionalidades (2026):**

- ✅ Reportes ciudadanos, riesgo respiratorio, reciclaje y alerta de humo por
  quemas en las islas (agua sigue siendo mensual/oficial; estas capas son
  comunitarias/estimaciones propias, documentadas como tales).
- ✅ Fase 1 — confiabilidad de reportes (confirmaciones, rate limit, peso),
  historial y tendencia por punto de agua, datos abiertos (CSV/JSON).
- ✅ Fase 2 — altura del río Paraná (Prefectura Naval) y semáforo de
  balnearios (cargado a mano, sin fuente automática disponible).
- ✅ Fase 3 — alertas por suscripción (bot de Telegram, long-polling, sin
  librería externa).
- ✅ Fase 4 — expediente colectivo a partir de reportes confirmados agrupados,
  documento imprimible generado en el cliente.
- 🟡 Fase 5 — calidad de aire pronosticada (PM2.5/PM10, Open-Meteo) integrada
  a la pestaña de riesgo respiratorio.
- 🟡 Persistencia real (hoy en memoria) para reportes ciudadanos y
  suscripciones de Telegram.

## Nota importante

Las coordenadas de los puntos del Ludueña son **aproximadas**, estimadas a partir
de las direcciones/intersecciones que describe el informe oficial (no vienen con
lat/lng en el PDF). Antes de usar esto en producción o para decisiones reales,
conviene geo-referenciar los puntos con precisión usando Infomapa Rosario.

Este es un proyecto no oficial, de código abierto, hecho a partir de datos
públicos de la Municipalidad de Rosario.
