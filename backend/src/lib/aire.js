/**
 * Calidad de aire pronosticada (PM2.5 y PM10), via Open-Meteo Air Quality API
 * (modelo CAMS - Copernicus Atmosphere Monitoring Service). NO hay ningun
 * sensor fisico conectado a este proyecto: esto es un PRONOSTICO DE MODELO
 * atmosferico (resolucion de grilla ~10km), no una medicion en el lugar.
 *
 * Mismo criterio que humo.js/rio.js: cache en memoria, y si la API externa
 * falla no rompe nada, responde "datos_no_disponibles" con el detalle.
 *
 * humo.js reutiliza este mismo modulo (en vez de pegarle a Open-Meteo por su
 * cuenta) para no duplicar consultas contra una API que ya vimos que
 * rate-limita por IP compartida en hostings como Render.
 */

const OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const REFERENCIA_CIUDAD = { lat: -32.925, lng: -60.68 };
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutos

// Umbrales simplificados (en base a las categorias del AQI de EPA-EEUU, una
// referencia internacional de uso comun - no es una normativa Argentina) para
// pasar de concentracion en µg/m3 a una escala de 3 niveles facil de leer.
const UMBRALES_PM25 = { buena: 12, moderada: 35.4 };
const UMBRALES_PM10 = { buena: 54, moderada: 154 };

let cache = null; // { timestamp, data }

function nivelDesdeConcentracion(valor, umbrales) {
  if (typeof valor !== "number") return null;
  if (valor <= umbrales.buena) return "buena";
  if (valor <= umbrales.moderada) return "moderada";
  return "mala";
}

const ORDEN_NIVEL = { buena: 0, moderada: 1, mala: 2 };

// El peor de los dos parametros (PM2.5, PM10) determina el nivel general.
function peorNivel(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return ORDEN_NIVEL[a] >= ORDEN_NIVEL[b] ? a : b;
}

async function obtenerPronosticoAire() {
  const url =
    `${OPEN_METEO_AIR_QUALITY_URL}?latitude=${REFERENCIA_CIUDAD.lat}&longitude=${REFERENCIA_CIUDAD.lng}` +
    `&hourly=pm2_5,pm10&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Open-Meteo Air Quality respondio ${res.status}: ${cuerpo.slice(0, 200)}`);
  }
  const data = await res.json();

  return data.hourly.time.map((hora, i) => {
    const pm2_5 = data.hourly.pm2_5[i];
    const pm10 = data.hourly.pm10[i];
    const nivel_pm25 = nivelDesdeConcentracion(pm2_5, UMBRALES_PM25);
    const nivel_pm10 = nivelDesdeConcentracion(pm10, UMBRALES_PM10);
    return {
      hora,
      pm2_5: typeof pm2_5 === "number" ? pm2_5 : null,
      pm10: typeof pm10 === "number" ? pm10 : null,
      nivel_pm25,
      nivel_pm10,
      nivel: peorNivel(nivel_pm25, nivel_pm10)
    };
  });
}

async function obtenerCalidadAire({ forzarActualizacion = false } = {}) {
  if (!forzarActualizacion && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const pronostico = await obtenerPronosticoAire();
    const nivelActual = pronostico.length ? pronostico[0].nivel : null;
    const data = {
      estado: "ok",
      pronostico,
      nivel_actual: nivelActual,
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  } catch (err) {
    const detalle = err.cause?.code ? ` (${err.cause.code})` : "";
    const data = {
      estado: "datos_no_disponibles",
      mensaje: `No se pudo obtener la calidad de aire pronosticada: ${err.message}${detalle}`,
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  }
}

function _resetCache() {
  cache = null;
}

module.exports = {
  obtenerCalidadAire,
  obtenerPronosticoAire,
  nivelDesdeConcentracion,
  peorNivel,
  UMBRALES_PM25,
  UMBRALES_PM10,
  REFERENCIA_CIUDAD,
  CACHE_TTL_MS,
  _resetCache
};
