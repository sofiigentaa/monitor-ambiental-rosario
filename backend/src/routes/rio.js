const express = require("express");
const router = express.Router();

const { obtenerAlturaRio } = require("../lib/rio");

// GET /api/rio -> altura del río Paraná en Rosario, con tendencia y niveles
// de alerta/evacuacion (fuente: Prefectura Naval Argentina).
router.get("/", async (req, res) => {
  const data = await obtenerAlturaRio();
  res.json(data);
});

module.exports = router;
