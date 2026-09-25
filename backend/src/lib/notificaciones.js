/**
 * Decide que avisos mandar a una zona suscripta, comparando el estado actual
 * (humo, punto de agua mas cercano, reportes ciudadanos, balnearios) contra
 * el ultimo estado notificado guardado en la zona. Logica pura, sin red ni
 * Telegram, para poder testearla facil (backend/src/lib/bot.js es quien la
 * usa junto con los datos reales).
 *
 * Regla general: solo se avisa ante un CAMBIO respecto de la ultima vez que
 * se reviso esa zona (no en cada chequeo periodico), y nunca en el primer
 * chequeo de una zona recien creada (ahi solo se establece la base).
 */

const RADIO_AGUA_KM = 3; // radio dentro del cual un punto de agua se considera "cercano" a una zona

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function puntoAguaMasCercano(zona, puntosAgua) {
  let mejor = null;
  let distMin = Infinity;
  for (const p of puntosAgua) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
    const d = haversineKm(zona.lat, zona.lng, p.lat, p.lng);
    if (d <= RADIO_AGUA_KM && d < distMin) {
      distMin = d;
      mejor = p;
    }
  }
  return mejor;
}

// Arma el estado "actual" de una zona a partir de los datos ya calculados de
// cada funcionalidad (el llamador se encarga de conseguirlos: humo, agua,
// balnearios, alerta temprana de reportes).
function calcularEstadoActual(zona, { nivelHumo, puntosAgua, balnearios, hayReportesAlerta }) {
  const cercano = puntoAguaMasCercano(zona, puntosAgua || []);
  const balneariosEstado = {};
  (balnearios || []).forEach((b) => {
    balneariosEstado[b.id] = b.aptitud;
  });

  return {
    humo_nivel: nivelHumo || "sin_riesgo",
    punto_cercano_id: cercano ? cercano.id : null,
    punto_cercano_nombre: cercano ? cercano.nombre : null,
    punto_cercano_nivel: cercano ? cercano.nivel_alerta : null,
    reportes_alerta: !!hayReportesAlerta,
    balnearios: balneariosEstado
  };
}

const NIVELES_RIESGO_HUMO = ["moderado", "alto"];

function calcularNotificaciones(zona, estadoActual) {
  const anterior = zona.estadoNotificado || {};
  const primeraVez = Object.keys(anterior).length === 0;
  const mensajes = [];

  if (!primeraVez) {
    if (
      NIVELES_RIESGO_HUMO.includes(estadoActual.humo_nivel) &&
      anterior.humo_nivel !== estadoActual.humo_nivel
    ) {
      mensajes.push(
        `🔥 Riesgo de humo *${estadoActual.humo_nivel}* previsto cerca de tu zona "${zona.nombre}". Revisá la pestaña "Alerta de humo".`
      );
    }

    if (estadoActual.punto_cercano_id && estadoActual.punto_cercano_nivel !== anterior.punto_cercano_nivel) {
      mensajes.push(
        `💧 "${estadoActual.punto_cercano_nombre}" (el punto de agua más cercano a tu zona "${zona.nombre}") cambió a nivel *${estadoActual.punto_cercano_nivel}*.`
      );
    }

    if (estadoActual.reportes_alerta && !anterior.reportes_alerta) {
      mensajes.push(
        `📢 Se acumularon reportes ciudadanos confirmados cerca de tu zona "${zona.nombre}" (síntomas respiratorios/irritación).`
      );
    }

    const balneariosAnteriores = anterior.balnearios || {};
    Object.entries(estadoActual.balnearios).forEach(([id, aptitud]) => {
      const antes = balneariosAnteriores[id];
      if (antes !== undefined && antes !== aptitud) {
        mensajes.push(`🏖️ Cambió el estado del balneario "${id}": ahora es "${aptitud}".`);
      }
    });
  }

  return { mensajes, nuevoEstado: estadoActual };
}

module.exports = { calcularEstadoActual, calcularNotificaciones, puntoAguaMasCercano, haversineKm, RADIO_AGUA_KM };
