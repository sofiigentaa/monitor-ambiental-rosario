# Monitor Ambiental Rosario

App web para el desarrollo sostenible y el cuidado del ambiente: muestra qué zonas de
Rosario (arroyos Ludueña y Saladillo, río Paraná) tienen agua contaminada, a partir de
datos oficiales de monitoreo de la Municipalidad de Rosario, para evitar que la gente
se intoxique por contacto con el agua.

## Arquitectura

- **Frontend hardcodeado** (`/frontend`): HTML/CSS/JS plano, sin build. Mapa con
  [Leaflet](https://leafletjs.com/) + OpenStreetMap (gratis, sin API key), panel
  lateral con buscador por barrio y vista de detalle por punto.
- **Backend/API** (`/backend`): Node.js + Express. Expone un API REST propio que
  sirve los puntos de monitoreo con su nivel de alerta ya calculado.
- **Datos**: dataset semilla (`backend/src/data/*.json`) construido a partir del
  informe oficial *"Monitoreo Cuerpos Superficiales de Agua - Arroyo Ludueña - Mayo
  2024"* de la Dirección de Fiscalización Ambiental (Municipalidad de Rosario, en
  convenio con la FCEIA-UNR). No es tiempo real: son muestreos mensuales.

```
monitor-ambiental-rosario/
├── backend/
│   ├── src/
│   │   ├── data/            # datasets semilla (JSON)
│   │   ├── lib/ica.js       # cálculo de índice de calidad / nivel de alerta
│   │   ├── routes/api.js    # endpoints REST
│   │   └── server.js
│   ├── scripts/actualizar-datos.js   # punto de extensión para datos en vivo
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

## Endpoints del API

| Método | Ruta                  | Descripción                                              |
|--------|-----------------------|------------------------------------------------------------|
| GET    | `/api/puntos`          | Todos los puntos de monitoreo con nivel de alerta calculado |
| GET    | `/api/puntos/:id`      | Detalle de un punto                                        |
| GET    | `/api/alertas`         | Solo puntos en alerta amarilla o roja                       |
| GET    | `/api/zonas/:barrio`   | Puntos filtrados por barrio (substring, case-insensitive)   |
| GET    | `/api/resumen`         | Conteo de puntos por nivel de alerta                         |

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

## Fuentes de datos

- [Rosario Datos — Calidad Ambiental / Agua](https://datos.rosario.gob.ar/territorio/ambiente/calidad-ambiental/agua)
- [Informe Arroyo Ludueña, Mayo 2024 (PDF, fuente de los datos semilla)](https://datos.rosario.gob.ar/sites/default/files/2024-09/Monitoreo%20Cuerpos%20Superficiales%20de%20Agua%20Arroyo%20Ludue%C3%B1a%20Mayo%202024.pdf)
- [Datos Abiertos Rosario (portal DKAN)](https://datosabiertos.rosario.gob.ar/)
- [CIAM / SInIA — Centro de Información Ambiental (Nación)](https://www.argentina.gob.ar/ambiente/ciam/agua)
- [Infomapa Rosario](https://infomapa.rosario.gov.ar/) — capas georreferenciadas municipales

## Estado y próximos pasos

- ✅ Fase 0 — estructura del repo
- ✅ Fase 1 — dataset semilla con datos reales del Ludueña (12 puntos)
- ✅ Fase 2 — backend/API con cálculo de nivel de alerta
- ✅ Fase 3 — frontend hardcodeado (mapa + panel + detalle)
- 🟡 Fase 4 — capa de actualización: `scripts/actualizar-datos.js` está armado
  como punto de extensión pero **todavía no conecta a una fuente en vivo**
  (ver el comentario en ese archivo — falta confirmar el `resource_id` del
  DKAN o parsear PDFs nuevos a mano).
- 🟡 Fase 5 — pulido: falta cargar datos estructurados del arroyo Saladillo y
  el río Paraná (hoy figuran como `sin_datos_estructurados`), mejorar la
  precisión de las coordenadas (hoy son aproximadas, ver
  `nota_coordenadas` en el dataset) y accesibilidad/mobile del frontend.

## Nota importante

Las coordenadas de los puntos del Ludueña son **aproximadas**, estimadas a partir
de las direcciones/intersecciones que describe el informe oficial (no vienen con
lat/lng en el PDF). Antes de usar esto en producción o para decisiones reales,
conviene geo-referenciar los puntos con precisión usando Infomapa Rosario.

Este es un proyecto no oficial, de código abierto, hecho a partir de datos
públicos de la Municipalidad de Rosario.
