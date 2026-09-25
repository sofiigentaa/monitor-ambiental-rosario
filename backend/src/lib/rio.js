/**
 * Altura del río Paraná en Rosario.
 *
 * Fuente: Prefectura Naval Argentina, que publica un registro diario/cada
 * 12hs de la altura hidrometrica en varios puertos del Paraná
 * (https://contenidosweb.prefecturanaval.gob.ar/alturas/). No tienen una API
 * JSON publica, asi que esto scrapea la tabla HTML de esa pagina (verificado
 * a mano con curl antes de escribir el parser). Es fragil por naturaleza -
 * si cambian el HTML de esa pagina, esto va a dejar de funcionar - por eso
 * cualquier fallo de parseo devuelve "datos_no_disponibles" en vez de tirar
 * un dato incorrecto o romper la app.
 *
 * Los umbrales de "Alerta" y "Evacuación" tambien vienen de esa misma fuente
 * (son los que usa Prefectura para el puerto de Rosario), no son inventados
 * por esta app.
 *
 * Nota de contexto (no es un calculo, es una aclaracion para el usuario):
 * en bajante del río, los mismos vertidos de efluentes se diluyen en menos
 * agua, asi que la contaminacion tiende a concentrarse mas que con el río
 * en niveles normales o crecida.
 */

const URL_ALTURAS_PREFECTURA = "https://contenidosweb.prefecturanaval.gob.ar/alturas/";
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutos, este dato se actualiza cada ~12hs

const ESTADOS = {
  BAJA: { texto: "Bajando", icono: "📉" },
  CRECE: { texto: "Creciendo", icono: "📈" },
  "ESTAC.": { texto: "Estable", icono: "➡️" },
  ESTAC: { texto: "Estable", icono: "➡️" }
};

let cache = null; // { timestamp, data }

function extraerFilaRosario(html) {
  const partes = html.split(/<tr\b[^>]*>/i);
  for (let i = 1; i < partes.length; i++) {
    const filaHtml = partes[i].split(/<\/tr>/i)[0];
    if (filaHtml.includes(">ROSARIO<") && filaHtml.includes(">PARANA<")) {
      return filaHtml;
    }
  }
  return null;
}

function extraerCampo(fila, etiqueta) {
  const escapada = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`data-label="${escapada}"[^>]*>\\s*(?:<b>)?\\s*([^<]+?)\\s*(?:</b>)?\\s*</td>`, "i");
  const match = fila.match(regex);
  return match ? match[1].trim() : null;
}

// Parsea el HTML de Prefectura y devuelve los datos de Rosario, o null si no
// se pudo encontrar/interpretar la fila (pagina caida, cambio de formato, etc).
function parsearAlturaRio(html) {
  const fila = extraerFilaRosario(html);
  if (!fila) return null;

  const nivel = Number(extraerCampo(fila, "Ultimo Registro:"));
  const variacion = Number(extraerCampo(fila, "Variacion"));
  const alerta = Number(extraerCampo(fila, "Alerta:"));
  const evacuacion = Number(extraerCampo(fila, "Evacuación:"));

  if (!Number.isFinite(nivel)) return null;

  const estadoCodigo = extraerCampo(fila, "Estado:");
  const estadoInfo = ESTADOS[estadoCodigo] || { texto: estadoCodigo || "Sin dato", icono: "❔" };

  let nivelRiesgo = "normal";
  if (Number.isFinite(evacuacion) && nivel >= evacuacion) nivelRiesgo = "evacuacion";
  else if (Number.isFinite(alerta) && nivel >= alerta) nivelRiesgo = "alerta";

  return {
    nivel_m: nivel,
    variacion_m: Number.isFinite(variacion) ? variacion : null,
    fecha_hora: extraerCampo(fila, "Fecha Hora:"),
    // "estado_rio" (BAJA/CRECE/ESTAC.) es un dato de Prefectura, distinto de
    // "estado" (ok/datos_no_disponibles) que usa obtenerAlturaRio a nivel API.
    estado_rio: estadoCodigo,
    estado_texto: estadoInfo.texto,
    estado_icono: estadoInfo.icono,
    registro_anterior_m: Number(extraerCampo(fila, "Registro Anterior:")) || null,
    alerta_m: Number.isFinite(alerta) ? alerta : null,
    evacuacion_m: Number.isFinite(evacuacion) ? evacuacion : null,
    nivel_riesgo: nivelRiesgo
  };
}

async function obtenerAlturaRio({ forzarActualizacion = false } = {}) {
  if (!forzarActualizacion && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetch(URL_ALTURAS_PREFECTURA);
    if (!res.ok) throw new Error(`Prefectura respondio ${res.status}`);
    const html = await res.text();
    const datos = parsearAlturaRio(html);

    if (!datos) {
      throw new Error("No se pudo interpretar la tabla de alturas de Prefectura");
    }

    const data = {
      estado: "ok",
      fuente: "Prefectura Naval Argentina",
      fuente_url: URL_ALTURAS_PREFECTURA,
      ...datos,
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  } catch (err) {
    // err.cause suele traer el codigo real de bajo nivel (ECONNRESET,
    // ENOTFOUND, etc.) cuando fetch falla a nivel de conexion/TLS, util para
    // diferenciar "el sitio de Prefectura esta caido" de otros problemas.
    const detalle = err.cause?.code ? ` (${err.cause.code})` : "";
    const data = {
      estado: "datos_no_disponibles",
      mensaje: `No se pudo obtener la altura del río: ${err.message}${detalle}`,
      actualizado: new Date().toISOString()
    };
    cache = { timestamp: Date.now(), data };
    return data;
  }
}

function _resetCache() {
  cache = null;
}

module.exports = { obtenerAlturaRio, parsearAlturaRio, extraerFilaRosario, extraerCampo, _resetCache };
