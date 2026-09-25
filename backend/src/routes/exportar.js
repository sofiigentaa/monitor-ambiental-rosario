const express = require("express");
const router = express.Router();

const { todosLosPuntosEvaluados } = require("../lib/puntos");
const { generarCsvPuntos } = require("../lib/exportar");

// GET /api/exportar/json -> mismos puntos que /api/puntos, pensado como
// endpoint estable de datos abiertos (documentado en el README).
router.get("/json", (req, res) => {
  const puntos = todosLosPuntosEvaluados();
  res.json({ total: puntos.length, puntos, generado: new Date().toISOString() });
});

// GET /api/exportar/csv -> una fila por punto con su ultima medicion.
router.get("/csv", (req, res) => {
  const puntos = todosLosPuntosEvaluados();
  const csv = generarCsvPuntos(puntos);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=monitor-ambiental-rosario-agua.csv");
  res.send(csv);
});

module.exports = router;
