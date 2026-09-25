/**
 * Reportes ciudadanos: sintomas respiratorios y estimacion visual de bruma
 * a partir de una foto, cargados por vecinos en tiempo real.
 *
 * Esto NO reemplaza una medicion oficial de calidad de aire (no hay ninguna
 * fuente de ese tipo conectada a este proyecto). Es una señal comunitaria
 * para detectar posibles focos entre los monitoreos oficiales, que son
 * mensuales y solo de agua.
 *
 * Almacenamiento en memoria: se pierde si se reinicia el proceso. Alcanza
 * para el MVP; una version real necesitaria persistencia (DB).
 */

let reportes = [];
let nextId = 1;

const VENTANA_ALERTA_MS = 24 * 60 * 60 * 1000; // 24hs
const RADIO_ALERTA_KM = 0.8;
const UMBRAL_REPORTES_ALERTA = 3;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function crearReporte({ tipo, lat, lng, descripcion, sintomas, bruma_estimada, fecha }) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("lat/lng son requeridos y deben ser numeros");
  }
  if (tipo !== "sintoma" && tipo !== "bruma") {
    throw new Error("tipo debe ser 'sintoma' o 'bruma'");
  }

  const reporte = {
    id: nextId++,
    tipo,
    lat,
    lng,
    descripcion: descripcion || null,
    sintomas: Array.isArray(sintomas) ? sintomas : [],
    bruma_estimada: typeof bruma_estimada === "number" ? bruma_estimada : null,
    fecha: fecha || new Date().toISOString()
  };
  reportes.push(reporte);
  return reporte;
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
  return sintomasCercanos.length >= UMBRAL_REPORTES_ALERTA;
}

function _reset() {
  reportes = [];
  nextId = 1;
}

module.exports = {
  crearReporte,
  listarReportes,
  reportesCercanos,
  hayAlertaTemprana,
  haversineKm,
  RADIO_ALERTA_KM,
  VENTANA_ALERTA_MS,
  UMBRAL_REPORTES_ALERTA,
  _reset
};
