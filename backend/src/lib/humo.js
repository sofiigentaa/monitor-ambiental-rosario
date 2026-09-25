/**
 * Alerta de humo por quemas en las islas del Delta frente a Rosario.
 *
 * IMPORTANTE - que es esto y que NO es:
 * Esto NO es un modelo de dispersion atmosferica oficial (esos existen, son
 * mucho mas complejos - HYSPLIT, por ejemplo - y usan variables que aca no
 * tenemos: humedad, capa de mezcla, topografia fina, etc). Es una estimacion
 * propia y simplificada: combina focos de calor satelitales (NASA FIRMS) con
 * el pronostico de viento (Open-Meteo) para calcular, para cada hora, si el
 * humo de algun foco activo tiene chances de viajar hacia Rosario segun hacia
 * donde sopla el viento. Sirve como señal de alerta temprana, no como
 * prediccion certera.
 *
 * Como se calcula:
 * 1. Se buscan focos de calor recientes dentro de un cuadrante que cubre las
 *    islas del delta frente a la ciudad (lado entrerriano).
 * 2. Por cada hora del pronostico de viento, se calcula hacia donde sopla el
 *    viento (direccion de TRANSPORTE = direccion desde donde viene + 180°,
 *    porque el dato meteorologico estandar indica de donde viene el viento,
 *    no hacia donde va).
 * 3. Para cada foco se calcula el rumbo (foco -> Rosario). Si ese rumbo cae
 *    dentro de un cono de tolerancia alrededor de la direccion de transporte,
 *    se considera que ese foco esta "alineado" con el viento de esa hora.
 * 4. Se pondera cada foco alineado por que tan cerca esta del centro del cono,
 *    la distancia (mas cerca = mas peso) y la intensidad del fuego (FRP). El
 *    viento tambien pesa: muy debil no alcanza a transportar humo lejos, muy
 *    fuerte lo dispersa/diluye - el efecto es mayor en un rango intermedio.
 * 5. Esa suma se traduce en un nivel: sin_riesgo / bajo / moderado / alto.
 */

const { obtenerCalidadAire } = require("./aire");

const BOUNDING_BOX_DELTA = {
  // Islas del delta frente a Rosario (lado entrerriano), donde se concentran
  // historicamente los focos de quema. Ajustable si hace falta cubrir mas
  // area (por ejemplo, hacia el norte para incendios mas alejados).
  oeste: -60.85,
  sur: -33.35,
  este: -60.25,
  norte: -32.45
};

// Punto de referencia de la ciudad para calcular rumbos y distancias (mismo
// centro que usa el mapa principal del frontend).
const REFERENCIA_CIUDAD = { lat: -32.925, lng: -60.68 };

const FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const FUENTES_FIRMS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"];
const DIAS_FIRMS = 2; // ultimos 1-2 dias, focos mas viejos ya no son relevantes

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const TOLERANCIA_GRADOS = 30; // cono de tolerancia alrededor de la direccion de transporte
const RADIO_MAX_KM = 120; // mas alla de esto, en este modelo simplificado, no se considera relevante
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutos

let cache = null; // { timestamp, data }

function toRad(grados) {
  return (grados * Math.PI) / 180;
}

function toDeg(radianes) {
  return (radianes * 180) / Math.PI;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Rumbo inicial (bearing) desde (lat1,lng1) hacia (lat2,lng2), en grados 0-360.
function rumboInicial(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Diferencia angular minima entre dos direcciones (0-180).
function diferenciaAngular(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// El dato meteorologico estandar (wind_direction_10m) indica DE DONDE viene
// el viento; el humo viaja hacia el lado opuesto.
function direccionTransporte(vientoDesdeGrados) {
  return (vientoDesdeGrados + 180) % 360;
}

// Confianza minima para no descartar un foco: VIIRS usa letras (l/n/h,
// descartamos "l" de "low"), MODIS usa porcentaje 0-100 (descartamos <50).
function pasaConfianzaMinima(valorConfianza) {
  const numero = Number(valorConfianza);
  if (Number.isFinite(numero)) return numero >= 50;
  const letra = String(valorConfianza).trim().toLowerCase();
  return letra === "n" || letra === "h";
}

// Parsea el CSV de FIRMS. Devuelve null si el texto no tiene pinta de CSV
// valido (por ejemplo, "Invalid MAP_KEY." en texto plano ante una key mala).
function parseCsvFirms(texto, fuente) {
  if (!texto || typeof texto !== "string") return null;
  const lineas = texto.trim().split("\n");
  if (lineas.length === 0) return null;

  const encabezado = lineas[0].split(",").map((c) => c.trim());
  if (!encabezado.includes("latitude") || !encabezado.includes("longitude")) {
    return null; // no es CSV: probablemente un mensaje de error de la API
  }

  const idx = {
    latitude: encabezado.indexOf("latitude"),
    longitude: encabezado.indexOf("longitude"),
    confidence: encabezado.indexOf("confidence"),
    frp: encabezado.indexOf("frp"),
    acq_date: encabezado.indexOf("acq_date"),
    acq_time: encabezado.indexOf("acq_time")
  };

  const focos = [];
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const campos = lineas[i].split(",");
    if (campos.length < encabezado.length) continue;

    const lat = Number(campos[idx.latitude]);
    const lng = Number(campos[idx.longitude]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const confianza = campos[idx.confidence];
    if (!pasaConfianzaMinima(confianza)) continue;

    const frp = Number(campos[idx.frp]) || 0;
    const acqDate = campos[idx.acq_date];
    const acqTime = String(campos[idx.acq_time] || "0").padStart(4, "0");
    const fecha = `${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}:00Z`;

    focos.push({ lat, lng, fecha, confianza, frp, fuente });
  }
  return focos;
}

async function obtenerFocosCalor() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    throw new Error("FIRMS_MAP_KEY no configurada");
  }

  const bbox = `${BOUNDING_BOX_DELTA.oeste},${BOUNDING_BOX_DELTA.sur},${BOUNDING_BOX_DELTA.este},${BOUNDING_BOX_DELTA.norte}`;

  let algunaFuenteRespondioOk = false;
  const focos = [];

  for (const fuente of FUENTES_FIRMS) {
    const url = `${FIRMS_BASE_URL}/${key}/${fuente}/${bbox}/${DIAS_FIRMS}`;
    try {
      const res = await fetch(url);
      const texto = await res.text();
      const parseados = parseCsvFirms(texto, fuente);
      if (parseados === null) {
        // Probablemente key invalida o fuente no disponible: se sigue
        // probando con las demas fuentes en vez de cortar todo.
        continue;
      }
      algunaFuenteRespondioOk = true;
      focos.push(...parseados);
    } catch {
      continue;
    }
  }

  if (!algunaFuenteRespondioOk) {
    throw new Error("FIRMS no respondio con datos validos (revisar FIRMS_MAP_KEY)");
  }

  return focos;
}

async function obtenerPronosticoViento() {
  const url =
    `${OPEN_METEO_FORECAST_URL}?latitude=${REFERENCIA_CIUDAD.lat}&longitude=${REFERENCIA_CIUDAD.lng}` +
    `&hourly=wind_speed_10m,wind_direction_10m&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `No se pudo obtener el pronostico de viento (Open-Meteo respondio ${res.status}: ${cuerpo.slice(0, 200)})`
    );
  }
  const data = await res.json();
  const horas = data.hourly.time;
  return horas.map((hora, i) => ({
    hora,
    velocidad_kmh: data.hourly.wind_speed_10m[i],
    viento_desde_grados: data.hourly.wind_direction_10m[i]
  }));
}

// Complemento opcional (PM2.5 pronosticado, modelo CAMS). Reutiliza
// backend/src/lib/aire.js (que ya tiene su propia cache) en vez de pegarle a
// Open-Meteo Air Quality por su cuenta - esa API rate-limita por IP, y
// duplicar la consulta acá arriesgaba agotar el cupo el doble de rapido.
// Si aire.js no pudo conseguir el dato, devuelve null y el pronostico de
// humo sigue funcionando igual, sin ese complemento.
async function obtenerPm25Pronostico() {
  const airData = await obtenerCalidadAire();
  if (airData.estado !== "ok") return null;
  const mapa = {};
  airData.pronostico.forEach((h) => {
    mapa[h.hora] = h.pm2_5;
  });
  return mapa;
}

// Peso de un foco alineado para una hora dada: mas peso cuanto mas centrado
// esta en el cono de tolerancia, cuanto mas cerca esta y cuanto mas intenso
// (FRP, Fire Radiative Power en MW) es el foco.
function pesoFoco(diffAngular, distKm, frp) {
  const factorAlineacion = 1 - (diffAngular / TOLERANCIA_GRADOS) * 0.5; // 0.5 a 1
  const factorDistancia = Math.max(0.2, 1 - distKm / RADIO_MAX_KM);
  const factorIntensidad = Math.min(1, frp / 50);
  return 10 * factorAlineacion * factorDistancia * (0.5 + factorIntensidad);
}

// Viento muy debil no alcanza a transportar el humo lejos (queda cerca del
// foco); viento muy fuerte lo dispersa y diluye rapido. El efecto es mayor
// en un rango intermedio.
function factorViento(velocidadKmh) {
  if (velocidadKmh < 8) return 0.4;
  if (velocidadKmh <= 30) return 1;
  return 0.6;
}

function nivelDesdeScore(score) {
  if (score >= 60) return "alto";
  if (score >= 30) return "moderado";
  if (score >= 10) return "bajo";
  return "sin_riesgo";
}

// Estimacion MUY aproximada de que zona de la ciudad quedaria mas expuesta,
// a partir de la latitud promedio de los focos alineados (la mayoria de las
// islas del delta quedan al norte/noreste de la ciudad). Es una
// simplificacion propia, no un modelo de dispersion por barrio.
function zonaExpuesta(focosAlineados) {
  if (!focosAlineados.length) return null;
  const latProm = focosAlineados.reduce((acc, f) => acc + f.foco.lat, 0) / focosAlineados.length;
  if (latProm > REFERENCIA_CIUDAD.lat + 0.05) return "zona norte (La Florida, Fisherton)";
  if (latProm < REFERENCIA_CIUDAD.lat - 0.05) return "zona sur";
  return "costanera y zona centro";
}

function calcularPronosticoHumo(focos, pronosticoViento, pm25Mapa) {
  return pronosticoViento.map((horaViento) => {
    const direccionHaciaCiudad = direccionTransporte(horaViento.viento_desde_grados);

    const focosEvaluados = focos.map((foco) => {
      const rumbo = rumboInicial(foco.lat, foco.lng, REFERENCIA_CIUDAD.lat, REFERENCIA_CIUDAD.lng);
      const dist = distanciaKm(foco.lat, foco.lng, REFERENCIA_CIUDAD.lat, REFERENCIA_CIUDAD.lng);
      const diff = diferenciaAngular(rumbo, direccionHaciaCiudad);
      return { foco, rumbo, dist, diff };
    });

    const alineados = focosEvaluados.filter((f) => f.dist <= RADIO_MAX_KM && f.diff <= TOLERANCIA_GRADOS);
    const sumaPesos = alineados.reduce((acc, f) => acc + pesoFoco(f.diff, f.dist, f.foco.frp), 0);
    const score = Math.min(100, Math.round(sumaPesos * factorViento(horaViento.velocidad_kmh)));
    const nivel = nivelDesdeScore(score);

    return {
      hora: horaViento.hora,
      nivel,
      score,
      focos_alineados: alineados.length,
      viento_velocidad_kmh: horaViento.velocidad_kmh,
      viento_desde_grados: horaViento.viento_desde_grados,
      zona_expuesta: nivel === "sin_riesgo" ? null : zonaExpuesta(alineados),
      pm2_5: pm25Mapa ? pm25Mapa[horaViento.hora] ?? null : null
    };
  });
}

// Encuentra el primer tramo contiguo de horas con nivel moderado o alto.
function proximaVentanaRiesgo(pronostico) {
  const relevantes = ["moderado", "alto"];
  const inicio = pronostico.findIndex((h) => relevantes.includes(h.nivel));
  if (inicio === -1) return null;

  let fin = inicio;
  while (fin + 1 < pronostico.length && relevantes.includes(pronostico[fin + 1].nivel)) {
    fin++;
  }

  const tramo = pronostico.slice(inicio, fin + 1);
  return {
    desde: pronostico[inicio].hora,
    hasta: pronostico[fin].hora,
    nivel_max: tramo.some((h) => h.nivel === "alto") ? "alto" : "moderado",
    zona_expuesta: tramo.find((h) => h.zona_expuesta)?.zona_expuesta || null
  };
}

async function obtenerAlertaHumo({ forzarActualizacion = false } = {}) {
  if (!forzarActualizacion && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  if (!process.env.FIRMS_MAP_KEY) {
    const data = {
      estado: "datos_no_disponibles",
      mensaje:
        "Falta configurar FIRMS_MAP_KEY en el servidor (ver backend/.env.example) para poder consultar los focos de calor satelitales.",
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  }

  try {
    const [focos, pronosticoViento, pm25Mapa] = await Promise.all([
      obtenerFocosCalor(),
      obtenerPronosticoViento(),
      obtenerPm25Pronostico()
    ]);

    const pronostico = calcularPronosticoHumo(focos, pronosticoViento, pm25Mapa);
    const nivelActual = pronostico.length ? pronostico[0].nivel : "sin_riesgo";

    const data = {
      estado: "ok",
      focos: focos.map((f) => ({
        lat: f.lat,
        lng: f.lng,
        fecha: f.fecha,
        confianza: f.confianza,
        frp: f.frp,
        fuente: f.fuente
      })),
      pronostico,
      nivel_actual: nivelActual,
      proxima_ventana_riesgo: proximaVentanaRiesgo(pronostico),
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  } catch (err) {
    // err.cause suele traer el codigo real de bajo nivel (ECONNRESET,
    // ENOTFOUND, etc.) cuando fetch falla a nivel de conexion/TLS.
    const detalle = err.cause?.code ? ` (${err.cause.code})` : "";
    const data = {
      estado: "datos_no_disponibles",
      mensaje: `No se pudo calcular la alerta de humo: ${err.message}${detalle}`,
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
  obtenerAlertaHumo,
  obtenerFocosCalor,
  obtenerPronosticoViento,
  obtenerPm25Pronostico,
  calcularPronosticoHumo,
  proximaVentanaRiesgo,
  parseCsvFirms,
  pasaConfianzaMinima,
  rumboInicial,
  diferenciaAngular,
  direccionTransporte,
  distanciaKm,
  pesoFoco,
  factorViento,
  nivelDesdeScore,
  zonaExpuesta,
  BOUNDING_BOX_DELTA,
  REFERENCIA_CIUDAD,
  TOLERANCIA_GRADOS,
  RADIO_MAX_KM,
  _resetCache
};
