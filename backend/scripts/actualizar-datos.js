/**
 * Fase 4 - Capa de actualización.
 *
 * Este script es el punto de extensión para reemplazar el dataset estático
 * (backend/src/data/*.json) por datos frescos de fuentes oficiales, sin
 * tocar el backend ni el frontend.
 *
 * Estado actual: NO hace requests automáticos todavía, porque:
 *  1. El portal https://datosabiertos.rosario.gob.ar es un DKAN (catálogo en
 *     JS) - hay que entrar a un dataset de calidad de agua específico y
 *     copiar el endpoint que figura en su botón "API" (varía por dataset/recurso).
 *  2. Los informes de calidad de agua de Rosario Datos se publican como PDF
 *     (no CSV/JSON), así que actualizarlos hoy es semi-manual: bajar el PDF
 *     nuevo, extraer el "Cuadro 2" (tabla de resultados por punto) y
 *     actualizar `puntos-luduena.json` a mano o con un parser de PDF.
 *
 * Cuando se resuelva el endpoint real del DKAN o aparezca una fuente
 * estructurada (CSV/JSON) para el Saladillo, completar `fetchDesdeDKAN`
 * de abajo y correr: `node scripts/actualizar-datos.js`.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "src", "data");

async function fetchDesdeDKAN() {
  // TODO: reemplazar por el endpoint real una vez confirmado desde la
  // página del recurso en datosabiertos.rosario.gob.ar (botón "API").
  // Ejemplo de patrón típico de DKAN 2:
  //   GET https://datosabiertos.rosario.gob.ar/api/1/datastore/query/<resource_id>/0
  throw new Error(
    "fetchDesdeDKAN() todavía no está implementado: falta confirmar el resource_id " +
      "del dataset de calidad de agua en datosabiertos.rosario.gob.ar"
  );
}

async function main() {
  console.log("Actualización automática todavía no implementada.");
  console.log(`Los datos semilla viven en: ${DATA_DIR}`);
  console.log(
    "Para actualizar a mano: descargar el último informe PDF de " +
      "https://datos.rosario.gob.ar/territorio/ambiente/calidad-ambiental/agua " +
      "y actualizar puntos-luduena.json con los nuevos valores del Cuadro 2."
  );
}

main();
