/**
 * Cliente minimo de la API de Telegram Bot, sin libreria externa (misma
 * filosofia que humo.js/rio.js: llamadas directas con fetch en vez de sumar
 * una dependencia para esto). Documentacion oficial y estable:
 * https://core.telegram.org/bots/api
 *
 * No requiere token para importarse: cada funcion lo recibe como parametro,
 * asi es facil de testear con un token falso sin pegarle a la red real.
 */

const BASE_URL = "https://api.telegram.org";

function urlBot(token, metodo) {
  return `${BASE_URL}/bot${token}/${metodo}`;
}

async function enviarMensaje(token, chatId, texto) {
  const res = await fetch(urlBot(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram sendMessage fallo: ${data.description || res.status}`);
  }
  return data.result;
}

// Long polling: espera hasta "timeoutSeg" segundos a que haya mensajes nuevos.
async function obtenerActualizaciones(token, offset, timeoutSeg = 25) {
  const url = `${urlBot(token, "getUpdates")}?offset=${offset}&timeout=${timeoutSeg}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram getUpdates fallo: ${data.description || res.status}`);
  }
  return data.result; // array de updates
}

async function obtenerInfoBot(token) {
  const res = await fetch(urlBot(token, "getMe"));
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram getMe fallo: ${data.description || res.status}`);
  }
  return data.result; // { id, username, ... }
}

module.exports = { enviarMensaje, obtenerActualizaciones, obtenerInfoBot };
