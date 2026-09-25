/**
 * Reportes ciudadanos: sintomas respiratorios y estimacion visual de bruma
 * a partir de una foto, cargados por vecinos en tiempo real.
 *
 * Esto NO reemplaza una medicion oficial de calidad de aire (no hay ninguna
 * fuente de ese tipo conectada a este proyecto). Es una señal comunitaria
 * para detectar posibles focos entre los monitoreos oficiales, que son
 * mensuales y solo de agua.
 *
 * Confiabilidad: no hay login, asi que "dispositivo_id" (generado por el
 * frontend y guardado en localStorage) es lo unico que identifica a quien
 * reporta. Con eso:
 *  - se limita cuantos reportes puede mandar un mismo dispositivo por hora
 *    (rate limit), para frenar spam o error en cadena.
 *  - otros vecinos pueden "confirmar" un reporte ya existente (no el mismo
 *    dispositivo que lo creo). Un reporte aislado, sin confirmar, pesa menos
 *    en los calculos de alerta/riesgo que uno confirmado por varios vecinos.
 *
 * Almacenamiento en memoria: se pierde si se reinicia el proceso. Alcanza
 * para el MVP; una version real necesitaria persistencia (DB).
 */

let reportes = [];
let nextId = 1;
let enviosPorDispositivo = {}; // dispositivo_id -> [timestamps de envios]

const VENTANA_ALERTA_MS = 24 * 60 * 60 * 1000; // 24hs
const RADIO_ALERTA_KM = 0.8;
const UMBRAL_REPORTES_ALERTA = 3; // umbral de PESO acumulado, no de cantidad cruda

const RATE_LIMIT_VENTANA_MS = 60 * 60 * 1000; // 1 hora
const RATE_LIMIT_MAX_REPORTES = 5; // por dispositivo, por hora

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function superaLimiteReportes(dispositivoId) {
  const ahora = Date.now();
  const historial = (enviosPorDispositivo[dispositivoId] || []).filter(
    (t) => ahora - t < RATE_LIMIT_VENTANA_MS
  );
  enviosPorDispositivo[dispositivoId] = historial;
  return historial.length >= RATE_LIMIT_MAX_REPORTES;
}

function registrarEnvio(dispositivoId) {
  if (!enviosPorDispositivo[dispositivoId]) enviosPorDispositivo[dispositivoId] = [];
  enviosPorDispositivo[dispositivoId].push(Date.now());
}

function crearReporte({ tipo, lat, lng, descripcion, sintomas, bruma_estimada, fecha, dispositivo_id }) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("lat/lng son requeridos y deben ser numeros");
  }
  if (tipo !== "sintoma" && tipo !== "bruma") {
    throw new Error("tipo debe ser 'sintoma' o 'bruma'");
  }
  if (!dispositivo_id || typeof dispositivo_id !== "string") {
    throw new Error("dispositivo_id es requerido");
  }
  if (superaLimiteReportes(dispositivo_id)) {
    throw new Error(
      `Superaste el limite de ${RATE_LIMIT_MAX_REPORTES} reportes por hora desde este dispositivo`
    );
  }

  const reporte = {
    id: nextId++,
    tipo,
    lat,
    lng,
    descripcion: descripcion || null,
    sintomas: Array.isArray(sintomas) ? sintomas : [],
    bruma_estimada: typeof bruma_estimada === "number" ? bruma_estimada : null,
    fecha: fecha || new Date().toISOString(),
    dispositivo_id,
    confirmaciones: []
  };
  reportes.push(reporte);
  registrarEnvio(dispositivo_id);
  return reporte;
}

// Confirma un reporte ya existente ("yo tambien lo siento/veo"). Devuelve
// null si el reporte no existe; tira error si la confirmacion no es valida
// (el mismo dispositivo que lo creo, o que ya confirmo antes).
function confirmarReporte(id, dispositivoId) {
  const reporte = reportes.find((r) => r.id === id);
  if (!reporte) return null;

  if (!dispositivoId || typeof dispositivoId !== "string") {
    throw new Error("dispositivo_id es requerido");
  }
  if (reporte.dispositivo_id === dispositivoId) {
    throw new Error("No podés confirmar tu propio reporte");
  }
  if (reporte.confirmaciones.includes(dispositivoId)) {
    throw new Error("Ya confirmaste este reporte");
  }

  reporte.confirmaciones.push(dispositivoId);
  return reporte;
}

// Peso de un reporte para los calculos de alerta/riesgo: aislado (sin que
// nadie mas lo haya confirmado) pesa la mitad que uno confirmado por al
// menos un vecino, y sigue subiendo (con techo) cuantas mas confirmaciones
// tenga. Asi un reporte erroneo o mal intencionado aislado no dispara una
// alerta el solo.
function pesoReporte(reporte) {
  const confirmaciones = reporte.confirmaciones ? reporte.confirmaciones.length : 0;
  if (confirmaciones === 0) return 0.5;
  return Math.min(2, 1 + confirmaciones * 0.25);
}

function listarReportes() {
  return reportes;
}

function reportesCercanos(lat, lng, radioKm = RADIO_ALERTA_KM, ventanaMs = VENTANA_ALERTA_MS) {
  const ahora = Date.now();
  return reportes.filter((r) => {
    const distancia = haversineKm(lat, lng, r.lat, r.lng);
    const antiguedad = ahora - new Date(r.fecha).getTime();
    return distancia <= radioKm && antiguedad <= ventanaMs;
  });
}

function hayAlertaTemprana(lat, lng) {
  const sintomasCercanos = reportesCercanos(lat, lng).filter((r) => r.tipo === "sintoma");
  const pesoTotal = sintomasCercanos.reduce((acc, r) => acc + pesoReporte(r), 0);
  return pesoTotal >= UMBRAL_REPORTES_ALERTA;
}

function _reset() {
  reportes = [];
  nextId = 1;
  enviosPorDispositivo = {};
}

module.exports = {
  crearReporte,
  confirmarReporte,
  pesoReporte,
  listarReportes,
  reportesCercanos,
  hayAlertaTemprana,
  superaLimiteReportes,
  haversineKm,
  RADIO_ALERTA_KM,
  VENTANA_ALERTA_MS,
  UMBRAL_REPORTES_ALERTA,
  RATE_LIMIT_VENTANA_MS,
  RATE_LIMIT_MAX_REPORTES,
  _reset
};
