const express = require("express");
const router = express.Router();

const { obtenerAlertaHumo } = require("../lib/humo");

// GET /api/humo -> focos activos, pronostico horario de riesgo de humo,
// nivel actual y proxima ventana de riesgo. Ver backend/src/lib/humo.js
// para el detalle de como se calcula (estimacion propia, no oficial).
router.get("/", async (req, res) => {
  const data = await obtenerAlertaHumo();
  res.json(data);
});

module.exports = router;
