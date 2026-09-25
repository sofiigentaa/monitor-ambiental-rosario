const express = require("express");
const router = express.Router();

const { listarBalnearios, mensajeAptitud } = require("../lib/balnearios");

// GET /api/balnearios -> semaforo de balnearios (cargado a mano, ver README)
router.get("/", (req, res) => {
  const data = listarBalnearios();
  const balnearios = data.balnearios.map((b) => ({ ...b, mensaje_aptitud: mensajeAptitud(b.aptitud) }));
  res.json({ ...data, balnearios });
});

module.exports = router;
