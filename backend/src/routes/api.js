const express = require("express");
const router = express.Router();

const luduenaData = require("../data/puntos-luduena.json");
const otrosData = require("../data/puntos-otros-cuerpos.json");
const { evaluarPunto } = require("../lib/ica");

function todosLosPuntosEvaluados() {
  const luduenaEvaluados = luduenaData.puntos.map(evaluarPunto);
  const otrosEvaluados = otrosData.puntos.map((p) => ({
    ...p,
    ica: null,
    uso_permitido: null,
    nivel_alerta: "sin_datos",
    mensaje_alerta: "Todavía no se cargó una serie de mediciones oficiales para este punto."
  }));
  return [...luduenaEvaluados, ...otrosEvaluados];
}

// GET /api/puntos -> todos los puntos de monitoreo con su nivel de alerta calculado
router.get("/puntos", (req, res) => {
  const puntos = todosLosPuntosEvaluados();
  res.json({
    fuente: luduenaData.fuente,
    informe: luduenaData.informe,
    informe_url: luduenaData.informe_url,
    nota_coordenadas: luduenaData.nota_coordenadas,
    total: puntos.length,
    puntos
  });
});

// GET /api/puntos/:id -> detalle de un punto
router.get("/puntos/:id", (req, res) => {
  const puntos = todosLosPuntosEvaluados();
  const punto = puntos.find((p) => p.id === req.params.id);
  if (!punto) {
    return res.status(404).json({ error: "Punto no encontrado" });
  }
  res.json(punto);
});

// GET /api/alertas -> solo los puntos en alerta amarilla o roja
router.get("/alertas", (req, res) => {
  const puntos = todosLosPuntosEvaluados().filter(
    (p) => p.nivel_alerta === "amarillo" || p.nivel_alerta === "rojo"
  );
  res.json({ total: puntos.length, puntos });
});

// GET /api/zonas/:barrio -> puntos filtrados por barrio aproximado (case-insensitive, substring)
router.get("/zonas/:barrio", (req, res) => {
  const buscado = req.params.barrio.toLowerCase();
  const puntos = todosLosPuntosEvaluados().filter((p) =>
    (p.barrio_aprox || "").toLowerCase().includes(buscado)
  );
  res.json({ total: puntos.length, puntos });
});

// GET /api/resumen -> conteo por nivel de alerta, para tarjetas del dashboard
router.get("/resumen", (req, res) => {
  const puntos = todosLosPuntosEvaluados();
  const resumen = puntos.reduce(
    (acc, p) => {
      acc[p.nivel_alerta] = (acc[p.nivel_alerta] || 0) + 1;
      return acc;
    },
    { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 }
  );
  res.json({ total: puntos.length, resumen, actualizado: new Date().toISOString() });
});

module.exports = router;
