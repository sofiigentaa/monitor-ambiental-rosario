const express = require("express");
const router = express.Router();

const {
  crearReporte,
  confirmarReporte,
  reportesCercanos,
  hayAlertaTemprana,
  listarReportes
} = require("../lib/reportes");

// GET /api/reportes -> todos los reportes ciudadanos (sintomas + bruma)
router.get("/", (req, res) => {
  const reportes = listarReportes();
  res.json({ total: reportes.length, reportes });
});

// POST /api/reportes -> crea un reporte ciudadano nuevo
router.post("/", (req, res) => {
  try {
    const reporte = crearReporte(req.body || {});
    res.status(201).json(reporte);
  } catch (err) {
    const esLimiteDeEnvios = err.message.includes("limite");
    res.status(esLimiteDeEnvios ? 429 : 400).json({ error: err.message });
  }
});

// POST /api/reportes/:id/confirmar -> otro vecino confirma un reporte existente
router.post("/:id/confirmar", (req, res) => {
  const id = Number(req.params.id);
  const { dispositivo_id } = req.body || {};

  try {
    const reporte = confirmarReporte(id, dispositivo_id);
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }
    res.json(reporte);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/reportes/alerta?lat=..&lng=.. -> alerta temprana comunitaria cerca de un punto
router.get("/alerta", (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat y lng son requeridos como query params" });
  }
  const cercanos = reportesCercanos(lat, lng);
  res.json({
    alerta_temprana: hayAlertaTemprana(lat, lng),
    total_cercanos: cercanos.length,
    reportes: cercanos
  });
});

module.exports = router;
