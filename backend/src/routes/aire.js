const express = require("express");
const router = express.Router();

const { obtenerCalidadAire } = require("../lib/aire");

// GET /api/aire -> pronostico de calidad de aire (PM2.5/PM10, modelo CAMS),
// nivel actual y por hora. No es una medicion local, es un pronostico de
// modelo atmosferico (ver backend/src/lib/aire.js).
router.get("/", async (req, res) => {
  const data = await obtenerCalidadAire();
  res.json(data);
});

module.exports = router;
