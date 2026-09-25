/**
 * Suscripciones a alertas por Telegram: cada chat de Telegram puede guardar
 * una o mas "zonas" (nombre + coordenadas), para recibir avisos cuando pase
 * algo relevante cerca de esa zona (ver backend/src/lib/notificaciones.js).
 *
 * Persistencia en memoria, mismo criterio que backend/src/lib/reportes.js:
 * se pierde si se reinicia el proceso. Una version real necesitaria una DB.
 */

const { todosLosPuntosEvaluados } = require("./puntos");

// chatId -> [{ nombre, lat, lng, barrio, creado, estadoNotificado }]
let zonasPorChat = {};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Resuelve un nombre de barrio a una coordenada aproximada: el promedio de
// los puntos de agua conocidos cuyo "barrio_aprox" incluye ese texto. No es
// una geocodificacion real, pero reutiliza datos que ya tenemos en vez de
// sumar una dependencia nueva solo para esto.
function coordenadasPorBarrio(barrio) {
  const buscado = barrio.trim().toLowerCase();
  if (!buscado) return null;

  const puntos = todosLosPuntosEvaluados().filter((p) =>
    (p.barrio_aprox || "").toLowerCase().includes(buscado)
  );
  if (puntos.length === 0) return null;

  const lat = puntos.reduce((acc, p) => acc + p.lat, 0) / puntos.length;
  const lng = puntos.reduce((acc, p) => acc + p.lng, 0) / puntos.length;
  return { lat, lng };
}

function listarZonas(chatId) {
  return zonasPorChat[chatId] || [];
}

function agregarZona(chatId, nombre, lat, lng, barrio = null) {
  if (!nombre || typeof nombre !== "string") {
    throw new Error("El nombre de la zona es requerido");
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("lat/lng son requeridos y deben ser numeros");
  }

  if (!zonasPorChat[chatId]) zonasPorChat[chatId] = [];

  const existente = zonasPorChat[chatId].find((z) => z.nombre.toLowerCase() === nombre.toLowerCase());
  if (existente) {
    throw new Error(`Ya tenés una zona llamada "${nombre}". Borrala primero si querés reemplazarla.`);
  }

  const zona = { nombre, lat, lng, barrio, creado: new Date().toISOString(), estadoNotificado: {} };
  zonasPorChat[chatId].push(zona);
  return zona;
}

function borrarZona(chatId, nombre) {
  const zonas = zonasPorChat[chatId] || [];
  const idx = zonas.findIndex((z) => z.nombre.toLowerCase() === nombre.toLowerCase());
  if (idx === -1) return false;
  zonas.splice(idx, 1);
  return true;
}

function darDeBaja(chatId) {
  const habiaZonas = (zonasPorChat[chatId] || []).length > 0;
  delete zonasPorChat[chatId];
  return habiaZonas;
}

function todasLasSuscripciones() {
  return Object.entries(zonasPorChat).map(([chatId, zonas]) => ({ chatId, zonas }));
}

function _reset() {
  zonasPorChat = {};
}

module.exports = {
  agregarZona,
  borrarZona,
  darDeBaja,
  listarZonas,
  todasLasSuscripciones,
  coordenadasPorBarrio,
  haversineKm,
  _reset
};
