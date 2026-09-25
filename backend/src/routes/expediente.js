const express = require("express");
const router = express.Router();

const { generarExpediente } = require("../lib/expediente");

// GET /api/expediente?lat=&lng= -> resumen de reportes ciudadanos cerca de
// un punto, para usar como base de un reclamo formal o pedido de informes.
router.get("/", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat y lng son requeridos como query params" });
  }
  const expediente = await generarExpediente(lat, lng);
  res.json(expediente);
});

module.exports = router;
