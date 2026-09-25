/**
 * Expediente colectivo: cuando se acumulan reportes ciudadanos confirmados
 * en una zona, arma un resumen (vecinos involucrados, sintomas, fotos de
 * bruma, puntos de agua cercanos en alerta y condicion de humo del periodo)
 * pensado como base para un reclamo formal ante la Municipalidad o para un
 * pedido de informes ante el Concejo - NO reemplaza una inspeccion oficial,
 * es un resumen de reportes autogestionados por vecinos.
 *
 * Reutiliza la logica ya existente de reportes.js (peso por confirmacion),
 * puntos.js (agua) y humo.js (quemas), en vez de duplicar calculos.
 */

const { reportesCercanos, pesoReporte, RADIO_ALERTA_KM, VENTANA_ALERTA_MS } = require("./reportes");
const { todosLosPuntosEvaluados } = require("./puntos");
const { obtenerAlertaHumo } = require("./humo");

// Umbral de peso acumulado para que un conjunto de reportes sea "elegible"
// para armar un expediente. Mas alto que UMBRAL_REPORTES_ALERTA (3) de
// reportes.js: un expediente es un paso mas serio (documento para presentar
// ante la Municipalidad/Concejo) que el aviso de alerta temprana.
const UMBRAL_EXPEDIENTE_PESO = 5;
const RADIO_AGUA_CERCANA_KM = 3;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Cuenta dispositivos distintos involucrados: el que creo cada reporte +
// quienes lo confirmaron. Es la mejor aproximacion a "cantidad de vecinos"
// que se puede hacer sin login.
function contarVecinos(reportes) {
  const dispositivos = new Set();
  reportes.forEach((r) => {
    if (r.dispositivo_id) dispositivos.add(r.dispositivo_id);
    (r.confirmaciones || []).forEach((c) => dispositivos.add(c));
  });
  return dispositivos.size;
}

function agruparSintomas(reportes) {
  const conteo = {};
  reportes
    .filter((r) => r.tipo === "sintoma")
    .forEach((r) => {
      (r.sintomas || []).forEach((s) => {
        conteo[s] = (conteo[s] || 0) + 1;
      });
    });
  return conteo;
}

function resumenBruma(reportes) {
  const brumas = reportes.filter((r) => r.tipo === "bruma" && typeof r.bruma_estimada === "number");
  if (brumas.length === 0) return null;
  const promedio = brumas.reduce((acc, r) => acc + r.bruma_estimada, 0) / brumas.length;
  return { cantidad: brumas.length, promedio_estimado: Math.round(promedio) };
}

function puntosAguaEnAlertaCerca(lat, lng, radioKm = RADIO_AGUA_CERCANA_KM) {
  return todosLosPuntosEvaluados()
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
    .filter((p) => p.nivel_alerta === "amarillo" || p.nivel_alerta === "rojo")
    .filter((p) => haversineKm(lat, lng, p.lat, p.lng) <= radioKm)
    .map((p) => {
      const historial = p.historial_mediciones;
      const ultima = Array.isArray(historial) && historial.length ? historial[historial.length - 1] : null;
      return {
        id: p.id,
        nombre: p.nombre,
        nivel_alerta: p.nivel_alerta,
        fecha_medicion: ultima ? ultima.fecha : null
      };
    });
}

async function generarExpediente(lat, lng, { radioKm = RADIO_ALERTA_KM, ventanaMs = VENTANA_ALERTA_MS } = {}) {
  const reportes = reportesCercanos(lat, lng, radioKm, ventanaMs);
  const pesoTotal = reportes
    .filter((r) => r.tipo === "sintoma")
    .reduce((acc, r) => acc + pesoReporte(r), 0);
  const confirmados = reportes.filter((r) => (r.confirmaciones || []).length > 0);

  const fechasMs = reportes.map((r) => new Date(r.fecha).getTime()).filter(Number.isFinite);
  const desde = fechasMs.length ? new Date(Math.min(...fechasMs)).toISOString() : null;
  const hasta = fechasMs.length ? new Date(Math.max(...fechasMs)).toISOString() : null;

  const datosHumo = await obtenerAlertaHumo();
  const humo =
    datosHumo.estado === "ok"
      ? { estado: "ok", nivel_actual: datosHumo.nivel_actual, proxima_ventana_riesgo: datosHumo.proxima_ventana_riesgo }
      : { estado: "datos_no_disponibles" };

  return {
    elegible: pesoTotal >= UMBRAL_EXPEDIENTE_PESO,
    umbral: UMBRAL_EXPEDIENTE_PESO,
    peso_total: Math.round(pesoTotal * 100) / 100,
    vecinos_involucrados: contarVecinos(reportes),
    total_reportes: reportes.length,
    reportes_confirmados: confirmados.length,
    periodo: { desde, hasta },
    sintomas: agruparSintomas(reportes),
    bruma: resumenBruma(reportes),
    puntos_agua_en_alerta: puntosAguaEnAlertaCerca(lat, lng),
    humo,
    generado: new Date().toISOString()
  };
}

module.exports = {
  generarExpediente,
  contarVecinos,
  agruparSintomas,
  resumenBruma,
  puntosAguaEnAlertaCerca,
  UMBRAL_EXPEDIENTE_PESO,
  RADIO_AGUA_CERCANA_KM
};
