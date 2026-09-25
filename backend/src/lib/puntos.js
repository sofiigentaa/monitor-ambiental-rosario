/**
 * Puntos de monitoreo de agua ya evaluados (nivel de alerta calculado).
 * Extraido de routes/api.js para poder reutilizarlo tambien desde
 * routes/exportar.js sin duplicar la logica.
 */

const luduenaData = require("../data/puntos-luduena.json");
const otrosData = require("../data/puntos-otros-cuerpos.json");
const { evaluarPunto } = require("./ica");

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

module.exports = { todosLosPuntosEvaluados, luduenaData, otrosData };
