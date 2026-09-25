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
- Muestra la calidad de aire pronosticada (PM2.5/PM10, modelo CAMS) y la suma al
  cálculo de riesgo respiratorio.
- Muestra la altura del río Paraná y un semáforo de balnearios.
- Genera un expediente colectivo a partir de reportes ciudadanos confirmados, listo
  para copiar/imprimir.
- Manda alertas por Telegram (humo, calidad de aire, puntos de agua, reportes,
  balnearios) a quien se suscriba con una zona.
- Ayuda a reciclar bien (dónde y qué) y a entender el impacto ambiental de no hacerlo.

Es una app **solo software**: no depende de ningún sensor ni dispositivo propio, todo
sale de fuentes oficiales gratuitas, reportes ciudadanos o pronósticos de modelos
atmosféricos ya existentes.

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
- **Datos de calidad de aire**: en vivo, vía Open-Meteo Air Quality (modelo CAMS,
  PM2.5/PM10), ver [Calidad de aire pronosticada](#calidad-de-aire-pronosticada) más
  abajo.

```
monitor-ambiental-rosario/
├── backend/
│   ├── .env.example         # variables de entorno (FIRMS_MAP_KEY, TELEGRAM_*)
│   ├── src/
│   │   ├── data/                 # datasets semilla de agua y balnearios (JSON)
│   │   ├── lib/
│   │   │   ├── ica.js             # nivel de alerta de agua
│   │   │   ├── reportes.js        # reportes ciudadanos + alerta temprana
│   │   │   ├── humo.js            # alerta de humo (FIRMS + viento)
│   │   │   ├── aire.js            # calidad de aire pronosticada (PM2.5/PM10, CAMS)
│   │   │   ├── rio.js             # altura del río Paraná (scraping Prefectura Naval)
│   │   │   ├── balnearios.js      # semáforo de balnearios (dataset a mano)
│   │   │   ├── exportar.js        # datos abiertos (CSV/JSON)
│   │   │   ├── expediente.js      # expediente colectivo a partir de reportes
│   │   │   ├── suscripciones.js   # zonas guardadas por chat de Telegram
│   │   │   ├── notificaciones.js  # lógica pura de qué avisar ante un cambio
│   │   │   ├── telegram.js        # llamadas HTTP crudas a la API de Telegram
│   │   │   └── bot.js             # orquestación del bot (polling + chequeo periódico)
│   │   ├── routes/
│   │   │   ├── api.js             # endpoints de puntos de agua
│   │   │   ├── reportes.js        # endpoints de reportes ciudadanos
│   │   │   ├── humo.js            # endpoint de alerta de humo
│   │   │   ├── aire.js            # endpoint de calidad de aire pronosticada
│   │   │   ├── rio.js             # endpoint de altura del río
│   │   │   ├── balnearios.js      # endpoint de semáforo de balnearios
│   │   │   ├── exportar.js        # endpoints de datos abiertos
│   │   │   ├── expediente.js      # endpoint de expediente colectivo
│   │   │   └── telegram.js        # endpoint de info del bot (para el botón web)
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

Todas las funcionalidades funcionan sin ninguna configuración extra, **excepto** la
alerta de humo (necesita una clave gratuita) y las alertas por Telegram (necesitan un
bot propio, también gratuito). La calidad de aire pronosticada (`/api/aire`) no
necesita ninguna variable de entorno: Open-Meteo Air Quality es gratis y sin API key.

### Variables de entorno (`backend/.env.example`)

| Variable | Obligatoria | Para qué sirve | Cómo conseguirla |
|---|---|---|---|
| `FIRMS_MAP_KEY` | No (sin ella, `/api/humo` responde `datos_no_disponibles`) | Focos de calor satelitales (NASA FIRMS), para la alerta de humo | Gratis, con un email, en [firms.modaps.eosdis.nasa.gov/api/map_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) |
| `TELEGRAM_BOT_TOKEN` | No (sin ella, el bot de Telegram directamente no arranca) | Autenticación del bot ante la API de Telegram | Gratis, hablándole a [@BotFather](https://t.me/BotFather) (`/newbot`) |
| `TELEGRAM_BOT_USERNAME` | No (solo afecta el link del botón "Recibí alertas") | Arma el link `https://t.me/<usuario>` del botón en la web | El `@usuario` que le pusiste al bot en BotFather |
| `PORT` | No (default `3001`) | Puerto donde escucha el backend | — |

Pasos para configurar humo y/o Telegram:

1. Copiá `backend/.env.example` a `backend/.env`.
2. Pegá las claves que consigas (podés cargar solo una de las dos, son independientes):
   ```
   FIRMS_MAP_KEY=tu_clave_aca
   TELEGRAM_BOT_TOKEN=tu_token_aca
   TELEGRAM_BOT_USERNAME=tu_bot_de_telegram
   ```
3. Reiniciá el backend (`npm start`).

**En Render (o cualquier PaaS):** las variables de entorno se cargan desde el panel del
servicio, no desde `backend/.env` (ese archivo es solo para desarrollo local y está en
`.gitignore`) — no hace falta ningún paso extra además de pegarlas ahí y hacer
deploy/restart.

Sin `FIRMS_MAP_KEY`, `/api/humo` responde `{"estado": "datos_no_disponibles", ...}` con
un mensaje explicativo, en vez de romper o mostrar un error. Sin `TELEGRAM_BOT_TOKEN`,
el bot simplemente no arranca (se loguea un aviso en la consola del servidor) y el
botón "📲 Recibí alertas en Telegram" de la web queda oculto.

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
| GET    | `/api/aire`             | Calidad de aire pronosticada (PM2.5/PM10, modelo CAMS): pronóstico horario, nivel actual (buena/moderada/mala) |
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
  cercanos (síntomas + bruma, últimas 24hs, 800m), el pronóstico de humo y la calidad
  de aire pronosticada (ver [más abajo](#calidad-de-aire-pronosticada)) en un puntaje
  0-100, ponderado por perfil de salud (general/asma/EPOC/niño deportista). El texto
  del resultado aclara qué parte del puntaje viene de reportes hiperlocales a ese punto
  y cuál de los pronósticos de ciudad entera (humo, aire). No es un diagnóstico médico
  ni reemplaza indicación profesional.

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

**Limitación conocida en Render (plan free):** Open-Meteo rate-limita por IP, y Render
comparte IPs de salida entre muchas apps de distintos usuarios — el cupo diario gratuito
se puede agotar por tráfico ajeno, no solo por esta app (visto en producción:
`"Daily API request limit exceeded"`, HTTP 429). Cuando pasa esto, `/api/humo` responde
`datos_no_disponibles` con el detalle del error — es el comportamiento esperado, no un
bug. Se resuelve solo (el cupo resetea diariamente) o de forma definitiva con un plan de
Render con IP dedicada.

## Calidad de aire pronosticada

Pestaña "🫁 Riesgo respiratorio", debajo del resultado personal. Muestra el pronóstico
de **PM2.5 y PM10** (`backend/src/lib/aire.js`) vía
[Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (modelo CAMS —
Copernicus Atmosphere Monitoring Service — de la Unión Europea, resolución de grilla de
~10km), gratis y sin API key.

**Importante — qué es y qué NO es:** esto es un **pronóstico de modelo atmosférico**
para Rosario en general, no una medición local ni de sensores propios. No hay ningún
sensor físico conectado a este proyecto (la app es solo software, como el resto de sus
funcionalidades).

Los valores de PM2.5/PM10 (µg/m³) se traducen a una escala simple de 3 niveles, con
umbrales basados en las categorías del **AQI de la EPA (EE.UU.)** — una referencia
internacional de uso común, aclarado que **no es una normativa argentina**:

- 🟢 **Buena** — PM2.5 ≤ 12 µg/m³ y PM10 ≤ 54 µg/m³.
- 🟡 **Moderada** — PM2.5 ≤ 35.4 µg/m³ y PM10 ≤ 154 µg/m³.
- 🔴 **Mala** — por encima de esos valores (el peor de los dos parámetros manda).

Este mismo módulo lo reutiliza `humo.js` como complemento opcional del pronóstico de
humo (evita pegarle dos veces a la misma API externa — ver la limitación de rate limit
más abajo) y `bot.js` para avisar por Telegram cuando el nivel pasa a "mala" en la
próxima hora. Se cachea 45 minutos en memoria, mismo criterio que `humo.js`/`rio.js`.

**Limitación conocida:** Open-Meteo rate-limita por IP (ver la limitación ya documentada
en la sección de [Alerta de humo](#alerta-de-humo-por-quemas-en-las-islas) — aplica
igual acá, es la misma familia de APIs). Cuando pasa, `/api/aire` responde
`datos_no_disponibles` con el detalle del error.

## Río y playas

Pestaña "🌊 Río y playas", con dos fuentes de naturaleza muy distinta:

- **Altura del río Paraná** (`backend/src/lib/rio.js`): dato oficial y en vivo de
  **Prefectura Naval Argentina**, que publica cada ~12hs la altura hidrométrica de
  varios puertos. Prefectura no tiene una API JSON pública, así que esto scrapea la
  tabla HTML de su sitio — se verificó el formato a mano antes de escribir el parser,
  pero por ser scraping es inherentemente frágil: si cambian el HTML de esa página,
  el endpoint va a empezar a responder `datos_no_disponibles` en vez de romperse o
  devolver un dato incorrecto. También puede fallar por caídas del propio sitio de
  Prefectura (confirmado en la práctica: `.gob.ar` a veces tiene cortes de conexión
  intermitentes; el error queda registrado como `datos_no_disponibles` con el código
  de bajo nivel, ej. `UND_ERR_CONNECT_TIMEOUT`, para poder diferenciarlo). Se muestra
  la tendencia (creciendo/bajando/estable) y
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
que sube a moderado/alto, calidad de aire pronosticada que pasa a "mala" (ver
[Calidad de aire pronosticada](#calidad-de-aire-pronosticada)), cambio de nivel del
punto de agua más cercano (hasta 3km), aparición de reportes ciudadanos confirmados
cerca (reutiliza `hayAlertaTemprana` de `reportes.js`), o cambio de estado de cualquier
balneario. La primera vez que se revisa una zona nueva no dispara avisos — solo
establece la base para comparar después. El humo y el aire son datos de ciudad entera
(no por zona), así que todos los suscriptos reciben el mismo aviso de humo/aire cuando
corresponde; el punto de agua más cercano y los reportes sí son específicos de cada
zona guardada.

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
- ✅ Fase 5 — calidad de aire pronosticada (PM2.5/PM10, Open-Meteo/CAMS)
  integrada a la pestaña de riesgo respiratorio (score + explicación de a qué
  fuente corresponde cada parte) y a las alertas del bot de Telegram.
- 🟡 Persistencia real (hoy en memoria) para reportes ciudadanos y
  suscripciones de Telegram.

## Limitaciones conocidas

Resumen de las limitaciones ya documentadas en detalle en cada sección de arriba:

- **Persistencia en memoria**: reportes ciudadanos y suscripciones de Telegram se
  pierden si el proceso del backend se reinicia (deploy nuevo, caída, restart manual).
  No hay base de datos.
- **Rate limit de Open-Meteo**: `/api/humo` (viento) y `/api/aire` (PM2.5/PM10)
  dependen de la misma familia de APIs gratuitas de Open-Meteo, que limitan por IP. En
  hostings con IP de salida compartida (como el plan free de Render) el cupo diario se
  puede agotar por tráfico de otras apps, no solo la propia — se resuelve solo al otro
  día. Cuando pasa, esos endpoints responden `datos_no_disponibles`, no rompen.
- **Scraping de Prefectura Naval**: `/api/rio` no tiene una API JSON oficial, así que
  scrapea HTML — frágil ante cambios de esa página, y sujeto a las caídas
  intermitentes del propio sitio `.gob.ar`.
- **Balnearios sin fuente automática**: no existe un dataset público de aptitud para
  baño en formato consumible, así que `balnearios.json` se carga y actualiza a mano.
- **Calidad de aire es pronóstico de modelo, no medición local**: PM2.5/PM10 vienen del
  modelo CAMS (grilla ~10km) para Rosario en general, no de un sensor en la zona
  puntual que se está consultando.
- **Datos de agua desactualizados**: el dataset semilla es de mayo 2024 y no se
  actualiza solo (ver Fase 4 del monitor de agua, más abajo).
- **Coordenadas aproximadas** para los puntos del Ludueña (ver "Nota importante").

## Pendiente o que requiere trabajo manual

Para quien retome este proyecto, en orden aproximado de impacto:

1. **Conectar `scripts/actualizar-datos.js` a una fuente en vivo** para los datos de
   agua (Fase 4 del monitor de agua): hoy es un punto de extensión sin implementar,
   falta confirmar el `resource_id` del portal DKAN de Rosario o definir un proceso
   para cargar PDFs nuevos a mano.
2. **Migrar a una base de datos real** (reportes ciudadanos y suscripciones de
   Telegram): hoy todo vive en memoria del proceso backend y se pierde en cada
   reinicio/deploy. Es el cambio de mayor impacto para producción real.
3. **Cargar datos estructurados del arroyo Saladillo y el resto del Paraná** (hoy
   `sin_datos_estructurados`) y mejorar la precisión de las coordenadas del dataset de
   agua (ver `nota_coordenadas`), idealmente geo-referenciando con Infomapa Rosario.
4. **Conseguir una fuente automatizable de aptitud de baño** para balnearios (hoy
   dataset a mano, sin API pública conocida) — requiere gestión con la Municipalidad,
   no es un problema técnico.
5. **Plan de Render con IP dedicada** (o mover a otro hosting) si el rate limit de
   Open-Meteo por IP compartida se vuelve un problema frecuente en producción.
6. **Revisar el scraper de Prefectura Naval periódicamente**: si la Municipalidad o
   Prefectura publican en algún momento una API JSON oficial de altura del río, migrar
   a esa fuente sería más robusto que el scraping HTML actual.
7. **Configurar las variables de entorno en Render** (`FIRMS_MAP_KEY`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`) si todavía no están cargadas ahí —
   sin esto, humo y Telegram quedan deshabilitados en producción aunque funcionen en
   local.

## Nota importante

Las coordenadas de los puntos del Ludueña son **aproximadas**, estimadas a partir
de las direcciones/intersecciones que describe el informe oficial (no vienen con
lat/lng en el PDF). Antes de usar esto en producción o para decisiones reales,
conviene geo-referenciar los puntos con precisión usando Infomapa Rosario.

Este es un proyecto no oficial, de código abierto, hecho a partir de datos
públicos de la Municipalidad de Rosario.
