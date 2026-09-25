/**
 * Bot de Telegram para alertas por suscripcion. Sin TELEGRAM_BOT_TOKEN
 * configurado, simplemente no arranca (no rompe el resto de la app).
 *
 * "procesarMensaje" es logica pura de comandos, testeable sin red. El resto
 * (polling de Telegram, chequeo periodico de todas las zonas) es
 * orquestacion con efectos secundarios, en la misma linea que
 * obtenerAlertaHumo en humo.js.
 */

const { enviarMensaje, obtenerActualizaciones } = require("./telegram");
const {
  agregarZona,
  borrarZona,
  darDeBaja,
  listarZonas,
  todasLasSuscripciones,
  coordenadasPorBarrio
} = require("./suscripciones");
const { calcularEstadoActual, calcularNotificaciones } = require("./notificaciones");

const TEXTO_AYUDA = `🌎 *Monitor Ambiental Rosario* - Alertas por Telegram

Comandos:
/agregar <nombre> <barrio> - Guarda una zona (ej: "/agregar casa Fisherton"). También podés mandar tu ubicación (📎 → Ubicación) y te pregunto el nombre después.
/zonas - Ver tus zonas guardadas
/borrar <nombre> - Borrar una zona
/baja - Darte de baja (borra todas tus zonas)
/ayuda - Ver este mensaje

Te aviso cuando: haya riesgo de humo previsto en tu zona, la calidad de aire pronosticada pase a mala, cambie el nivel de un punto de agua cercano, se acumulen reportes ciudadanos confirmados cerca, o cambie el estado de un balneario. No mando avisos repetidos por lo mismo: solo cuando algo cambia.`;

// chatId -> { lat, lng } de una ubicacion recibida, esperando que el proximo
// mensaje de texto le ponga nombre.
let pendientes = {};

function procesarMensaje(mensaje) {
  const chatId = mensaje.chat.id;

  if (mensaje.location) {
    pendientes[chatId] = { lat: mensaje.location.latitude, lng: mensaje.location.longitude };
    return { respuesta: "📍 Ubicación recibida. Respondeme con un nombre para esta zona (ej: casa, trabajo, escuela)." };
  }

  const texto = (mensaje.text || "").trim();

  if (pendientes[chatId] && texto && !texto.startsWith("/")) {
    const { lat, lng } = pendientes[chatId];
    delete pendientes[chatId];
    try {
      agregarZona(chatId, texto, lat, lng);
      return { respuesta: `✅ Zona "${texto}" guardada.` };
    } catch (err) {
      return { respuesta: `❌ ${err.message}` };
    }
  }

  if (texto === "/start" || texto === "/ayuda") {
    return { respuesta: TEXTO_AYUDA };
  }

  if (texto.startsWith("/agregar")) {
    const partes = texto.split(/\s+/).slice(1);
    if (partes.length < 2) {
      return {
        respuesta:
          'Uso: /agregar <nombre> <barrio>\nEj: "/agregar casa Fisherton"\n\nO mandame tu ubicación (📎 → Ubicación) y te pregunto el nombre.'
      };
    }
    const nombre = partes[0];
    const barrio = partes.slice(1).join(" ");
    const coords = coordenadasPorBarrio(barrio);
    if (!coords) {
      return {
        respuesta: `No encontré el barrio "${barrio}" en los datos que tenemos cargados. Probá con otro nombre (ej: Fisherton, Ludueña) o compartí tu ubicación real (📎 → Ubicación).`
      };
    }
    try {
      agregarZona(chatId, nombre, coords.lat, coords.lng, barrio);
      return { respuesta: `✅ Zona "${nombre}" guardada, ubicada por el barrio "${barrio}".` };
    } catch (err) {
      return { respuesta: `❌ ${err.message}` };
    }
  }

  if (texto === "/zonas") {
    const zonas = listarZonas(chatId);
    if (zonas.length === 0) {
      return { respuesta: "Todavía no tenés ninguna zona guardada. Usá /agregar para crear una." };
    }
    return {
      respuesta: "Tus zonas:\n" + zonas.map((z) => `- ${z.nombre}${z.barrio ? ` (${z.barrio})` : ""}`).join("\n")
    };
  }

  if (texto.startsWith("/borrar")) {
    const nombre = texto.split(/\s+/).slice(1).join(" ");
    if (!nombre) return { respuesta: "Uso: /borrar <nombre>" };
    const borrado = borrarZona(chatId, nombre);
    return {
      respuesta: borrado ? `🗑️ Zona "${nombre}" borrada.` : `No encontré una zona llamada "${nombre}".`
    };
  }

  if (texto === "/baja") {
    const habia = darDeBaja(chatId);
    return {
      respuesta: habia ? "Te diste de baja. Borré todas tus zonas. 👋" : "No tenías ninguna zona guardada."
    };
  }

  return { respuesta: "No entendí ese mensaje. Mandá /ayuda para ver los comandos disponibles." };
}

// ---- Orquestacion (polling + chequeo periodico) ----

const INTERVALO_NOTIFICACIONES_MS = 15 * 60 * 1000; // 15 minutos

let corriendo = false;
let offsetActualizaciones = 0;
let intervaloNotificaciones = null;

const ESPERA_TRAS_ERROR_MS = 5000;

async function cicloPolling(token) {
  if (!corriendo) return;
  let huboError = false;
  try {
    const updates = await obtenerActualizaciones(token, offsetActualizaciones, 25);
    for (const update of updates) {
      offsetActualizaciones = update.update_id + 1;
      if (update.message) {
        const { respuesta } = procesarMensaje(update.message);
        if (respuesta) {
          try {
            await enviarMensaje(token, update.message.chat.id, respuesta);
          } catch (err) {
            console.error("Error enviando mensaje de Telegram:", err.message);
          }
        }
      }
    }
  } catch (err) {
    // Ante un error (por ejemplo, token invalido) getUpdates falla al toque
    // en vez de esperar el long-polling normal, asi que sin esta espera
    // reintentaria en un loop apretado golpeando la API de Telegram.
    huboError = true;
    console.error("Error en el polling de Telegram:", err.message);
  }
  if (!corriendo) return;
  if (huboError) {
    setTimeout(() => cicloPolling(token), ESPERA_TRAS_ERROR_MS);
  } else {
    setImmediate(() => cicloPolling(token));
  }
}

async function revisarTodasLasZonas(token) {
  // Requires tardios para no crear dependencias circulares con modulos que
  // a su vez podrian (en el futuro) importar cosas de bot.js.
  const { obtenerAlertaHumo } = require("./humo");
  const { obtenerCalidadAire } = require("./aire");
  const { todosLosPuntosEvaluados } = require("./puntos");
  const { listarBalnearios } = require("./balnearios");
  const { hayAlertaTemprana } = require("./reportes");

  const [datosHumo, datosAire] = await Promise.all([obtenerAlertaHumo(), obtenerCalidadAire()]);
  const nivelHumo = datosHumo.estado === "ok" ? datosHumo.nivel_actual : null;
  const nivelAire = datosAire.estado === "ok" ? datosAire.nivel_actual : null;
  const puntosAgua = todosLosPuntosEvaluados();
  const balnearios = listarBalnearios().balnearios;

  for (const { chatId, zonas } of todasLasSuscripciones()) {
    for (const zona of zonas) {
      const hayReportesAlerta = hayAlertaTemprana(zona.lat, zona.lng);
      const estadoActual = calcularEstadoActual(zona, {
        nivelHumo,
        nivelAire,
        puntosAgua,
        balnearios,
        hayReportesAlerta
      });
      const { mensajes, nuevoEstado } = calcularNotificaciones(zona, estadoActual);
      zona.estadoNotificado = nuevoEstado;

      for (const mensaje of mensajes) {
        try {
          await enviarMensaje(token, chatId, mensaje);
        } catch (err) {
          console.error(`Error notificando al chat ${chatId}:`, err.message);
        }
      }
    }
  }
}

function iniciarBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("TELEGRAM_BOT_TOKEN no configurado: el bot de Telegram no arranca (ver backend/.env.example).");
    return;
  }
  corriendo = true;
  cicloPolling(token);
  intervaloNotificaciones = setInterval(() => revisarTodasLasZonas(token), INTERVALO_NOTIFICACIONES_MS);
  console.log("Bot de Telegram iniciado (polling activo).");
}

function detenerBot() {
  corriendo = false;
  if (intervaloNotificaciones) {
    clearInterval(intervaloNotificaciones);
    intervaloNotificaciones = null;
  }
}

function _resetPendientes() {
  pendientes = {};
}

module.exports = {
  procesarMensaje,
  iniciarBot,
  detenerBot,
  revisarTodasLasZonas,
  TEXTO_AYUDA,
  _resetPendientes
};
