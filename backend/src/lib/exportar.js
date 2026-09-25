/**
 * Datos abiertos: aplana los puntos de agua (ya evaluados) a un formato CSV
 * simple, una fila por punto con su ultima medicion. Pensado para
 * periodistas, investigadores u ONGs que quieran usar los datos fuera de
 * esta app, sin tener que lidiar con el JSON anidado del API normal.
 */

const COLUMNAS = [
  "id",
  "nombre",
  "cuerpo_agua",
  "barrio_aprox",
  "distrito",
  "lat",
  "lng",
  "nivel_alerta",
  "ica",
  "uso_permitido",
  "fecha_medicion",
  "ph",
  "oxigeno_disuelto_mgl",
  "dbo_mgl",
  "dqo_mgl",
  "turbidez_ntu",
  "conductividad_uscm",
  "coliformes_fecales_100ml",
  "temperatura_c"
];

function escaparCsv(valor) {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (texto.includes(",") || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function ultimaDelHistorial(punto) {
  const historial = punto.historial_mediciones;
  if (Array.isArray(historial) && historial.length > 0) {
    return historial[historial.length - 1];
  }
  return punto.ultima_medicion || null;
}

function filaDesdePunto(punto) {
  const m = ultimaDelHistorial(punto);
  return {
    id: punto.id,
    nombre: punto.nombre,
    cuerpo_agua: punto.cuerpo_agua || null,
    barrio_aprox: punto.barrio_aprox || null,
    distrito: punto.distrito || null,
    lat: punto.lat,
    lng: punto.lng,
    nivel_alerta: punto.nivel_alerta,
    ica: punto.ica,
    uso_permitido: punto.uso_permitido,
    fecha_medicion: m ? m.fecha : null,
    ph: m ? m.ph : null,
    oxigeno_disuelto_mgl: m ? m.oxigeno_disuelto_mgl : null,
    dbo_mgl: m ? m.dbo_mgl : null,
    dqo_mgl: m ? m.dqo_mgl : null,
    turbidez_ntu: m ? m.turbidez_ntu : null,
    conductividad_uscm: m ? m.conductividad_uscm : null,
    coliformes_fecales_100ml: m ? m.coliformes_fecales_100ml : null,
    temperatura_c: m ? m.temperatura_c : null
  };
}

function generarCsvPuntos(puntos) {
  const filas = puntos.map(filaDesdePunto);
  const encabezado = COLUMNAS.join(",");
  const lineas = filas.map((fila) => COLUMNAS.map((col) => escaparCsv(fila[col])).join(","));
  return [encabezado, ...lineas].join("\n") + "\n";
}

module.exports = { generarCsvPuntos, filaDesdePunto, COLUMNAS };
