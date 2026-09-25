/**
 * Semaforo de balnearios: no hay una fuente publica automatizada de aptitud
 * para baño de los balnearios de Rosario (se investigo antes de armar esto,
 * ver la "nota" del propio dataset). Por eso los datos viven en un JSON
 * cargado a mano (backend/src/data/balnearios.json), con fecha de ultima
 * actualizacion visible para que quede claro que no es en vivo.
 */

const balneariosData = require("../data/balnearios.json");

function listarBalnearios() {
  return balneariosData;
}

const MENSAJE_APTITUD = {
  apta: "Apta para contacto directo según la última revisión.",
  evitar_contacto: "Evitar el contacto directo (nadar, bañarse) según la última revisión.",
  no_apta: "No apta para ningún tipo de contacto según la última revisión.",
  sin_datos: "Todavía no se cargó un estado de aptitud para este balneario."
};

function mensajeAptitud(aptitud) {
  return MENSAJE_APTITUD[aptitud] || MENSAJE_APTITUD.sin_datos;
}

module.exports = { listarBalnearios, mensajeAptitud };
