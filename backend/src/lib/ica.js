/**
 * Cálculo simplificado de Índice de Calidad de Agua (ICA) y nivel de alerta.
 *
 * IMPORTANTE - de dónde sale esto:
 * No existe en Argentina/Santa Fe un índice único oficial de calidad de agua
 * para cuerpos superficiales (el propio informe municipal de mayo 2024 lo aclara:
 * "la provincia de Santa Fe carece de normativa que establezca niveles guías de
 * calidad para los cuerpos superficiales de agua"). Lo que sí existe es la
 * Resolución 283/2019 (cuenca Matanza-Riachuelo, usada como referencia comparativa
 * por la propia Municipalidad de Rosario) con límites por parámetro para 3 usos:
 *   I   -> apta para protección de biota y uso recreativo CON contacto directo
 *   II  -> apta para actividades recreativas SIN contacto directo
 *   III -> apta solo para actividades recreativas pasivas (sin contacto)
 *
 * Este módulo NO inventa un índice mágico: evalúa cada parámetro disponible
 * contra esos límites y determina el uso más restrictivo que el agua todavía
 * cumple. Eso se traduce a un semáforo:
 *   verde   -> cumple Uso I  (contacto directo tolerable según estos parámetros)
 *   amarillo-> cumple como máximo Uso II/III (evitar contacto directo)
 *   rojo    -> no cumple ninguno de los usos, o hay coliformes fecales muy altos
 *              (riesgo sanitario directo de intoxicación)
 *
 * Además calcula un puntaje 0-100 (ICA simplificado) solo a fines de
 * ordenar/visualizar, promediando sub-índices por parámetro. NO debe leerse
 * como un estándar reconocido, es una simplificación para esta app.
 */

// Límites de referencia (Resolución 283/2019, valores usados en el informe municipal)
const LIMITES = {
  ph: { usoI: [6.5, 9], usoII: [6.5, 9], usoIII: [6, 9] },
  oxigeno_disuelto_mgl: { usoI_min: 5, usoII_min: 4, usoIII_min: 2 },
  dbo_mgl: { usoI_max: 5, usoII_max: 15, usoIII_max: 15 },
  temperatura_c: { max: 35 },
  coliformes_fecales_100ml: { usoI_max: 150, usoII_max: 1000 } // UFC/100ml
};

function parseColiforme(valor) {
  // valores tipo "1.1e5" o "11e5" -> número
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return valor;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function evaluarUso(medicion) {
  if (!medicion) return { uso: null, motivos: ["sin_datos"] };

  const motivosNoI = [];
  const motivosNoII = [];
  let cumpleI = true;
  let cumpleII = true;

  // pH
  if (typeof medicion.ph === "number") {
    const [minI, maxI] = LIMITES.ph.usoI;
    if (medicion.ph < minI || medicion.ph > maxI) {
      cumpleI = false;
      motivosNoI.push(`pH ${medicion.ph} fuera de rango ${minI}-${maxI}`);
    }
    const [minII, maxII] = LIMITES.ph.usoII;
    if (medicion.ph < minII || medicion.ph > maxII) {
      cumpleII = false;
      motivosNoII.push(`pH ${medicion.ph} fuera de rango`);
    }
  }

  // Oxígeno disuelto (más alto = mejor)
  if (typeof medicion.oxigeno_disuelto_mgl === "number") {
    if (medicion.oxigeno_disuelto_mgl < LIMITES.oxigeno_disuelto_mgl.usoI_min) {
      cumpleI = false;
      motivosNoI.push(`OD ${medicion.oxigeno_disuelto_mgl} mg/l < ${LIMITES.oxigeno_disuelto_mgl.usoI_min}`);
    }
    if (medicion.oxigeno_disuelto_mgl < LIMITES.oxigeno_disuelto_mgl.usoII_min) {
      cumpleII = false;
      motivosNoII.push(`OD ${medicion.oxigeno_disuelto_mgl} mg/l muy bajo`);
    }
  }

  // DBO (más bajo = mejor)
  if (typeof medicion.dbo_mgl === "number") {
    if (medicion.dbo_mgl > LIMITES.dbo_mgl.usoI_max) {
      cumpleI = false;
      motivosNoI.push(`DBO ${medicion.dbo_mgl} mg/l > ${LIMITES.dbo_mgl.usoI_max}`);
    }
    if (medicion.dbo_mgl > LIMITES.dbo_mgl.usoII_max) {
      cumpleII = false;
      motivosNoII.push(`DBO ${medicion.dbo_mgl} mg/l muy alta`);
    }
  }

  // Coliformes fecales: el parámetro más directamente ligado a riesgo de
  // intoxicación por contacto (indicador de contaminación cloacal).
  const cf = parseColiforme(medicion.coliformes_fecales_100ml);
  if (cf !== null) {
    if (cf > LIMITES.coliformes_fecales_100ml.usoI_max) {
      cumpleI = false;
      motivosNoI.push(`Coliformes fecales ${cf}/100ml > ${LIMITES.coliformes_fecales_100ml.usoI_max}`);
    }
    if (cf > LIMITES.coliformes_fecales_100ml.usoII_max) {
      cumpleII = false;
      motivosNoII.push(`Coliformes fecales ${cf}/100ml muy por encima del límite sanitario`);
    }
  }

  let uso, motivos;
  if (cumpleI) {
    uso = "I";
    motivos = [];
  } else if (cumpleII) {
    uso = "II";
    motivos = motivosNoI;
  } else {
    uso = "III";
    motivos = motivosNoII.length ? motivosNoII : motivosNoI;
  }

  return { uso, motivos };
}

function nivelAlertaDesdeUso(uso, medicion) {
  // Coliformes fecales muy altos = alerta roja automática (riesgo sanitario directo),
  // sin importar el resto de los parámetros.
  const cf = medicion ? parseColiforme(medicion.coliformes_fecales_100ml) : null;
  if (cf !== null && cf > LIMITES.coliformes_fecales_100ml.usoII_max) {
    return "rojo";
  }
  if (uso === "I") return "verde";
  if (uso === "II") return "amarillo";
  return "rojo";
}

function mensajeAlerta(nivel) {
  switch (nivel) {
    case "verde":
      return "Parámetros dentro de rango para uso recreativo con contacto directo. Igual se recomienda prudencia: esto es un monitoreo periódico, no en tiempo real.";
    case "amarillo":
      return "Evitar el contacto directo con el agua (nadar, bañarse). Uso recreativo sin contacto o pasivo únicamente.";
    case "rojo":
      return "No usar para ningún tipo de contacto. Riesgo de intoxicación / infección. Evitar también el uso del agua para riego de huertas.";
    default:
      return "Sin datos suficientes para evaluar este punto.";
  }
}

/**
 * Sub-índice simple 0-100 por parámetro, solo para ordenar/visualizar.
 */
function subIndicePh(ph) {
  if (typeof ph !== "number") return null;
  const ideal = 7.5;
  const distancia = Math.abs(ph - ideal);
  return Math.max(0, 100 - distancia * 40);
}

function subIndiceOD(od) {
  if (typeof od !== "number") return null;
  return Math.min(100, (od / 8) * 100);
}

function subIndiceDBO(dbo) {
  if (typeof dbo !== "number") return null;
  return Math.max(0, 100 - dbo * 2.5);
}

function calcularICA(medicion) {
  if (!medicion) return null;
  const subs = [
    subIndicePh(medicion.ph),
    subIndiceOD(medicion.oxigeno_disuelto_mgl),
    subIndiceDBO(medicion.dbo_mgl)
  ].filter((v) => v !== null);

  if (subs.length === 0) return null;
  const promedio = subs.reduce((a, b) => a + b, 0) / subs.length;
  return Math.round(promedio);
}

/**
 * Evalúa un punto de monitoreo completo y devuelve el enriquecido con
 * ica, uso_permitido, nivel_alerta y mensaje.
 */
function evaluarPunto(punto) {
  const medicion = punto.ultima_medicion || null;

  if (!medicion) {
    return {
      ...punto,
      ica: null,
      uso_permitido: null,
      nivel_alerta: "sin_datos",
      mensaje_alerta: mensajeAlerta(null)
    };
  }

  const { uso, motivos } = evaluarUso(medicion);
  const nivel = nivelAlertaDesdeUso(uso, medicion);
  const ica = calcularICA(medicion);

  return {
    ...punto,
    ica,
    uso_permitido: uso,
    motivos_restriccion: motivos,
    nivel_alerta: nivel,
    mensaje_alerta: mensajeAlerta(nivel)
  };
}

module.exports = { evaluarPunto, evaluarUso, nivelAlertaDesdeUso, calcularICA, mensajeAlerta };
