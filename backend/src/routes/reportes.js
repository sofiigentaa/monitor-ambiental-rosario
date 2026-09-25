const express = require("express");
const router = express.Router();

const {
  crearReporte,
  listarReportes,
  reportesCercanos,
  hayAlertaTemprana
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
