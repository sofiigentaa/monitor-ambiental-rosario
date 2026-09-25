// Monitor Ambiental Rosario - frontend
// Diseño/layout hardcodeado a propósito. Este archivo solo consume el API
// propio (backend/src/routes/api.js) y pinta mapa + panel + detalle.

const API_BASE = window.location.origin.includes("localhost")
  ? "http://localhost:3001/api"
  : "/api";

const COLORES = {
  verde: "#1b8a5a",
  amarillo: "#b8860b",
  rojo: "#c0392b",
  sin_datos: "#6b7280"
};

// Categorias reales de reclamos.rosario.gob.ar, verificadas navegando el
// sitio a mano (no hay una categoria especifica para "contaminacion de un
// curso de agua" ni para humo/olores/sintomas respiratorios).
const RECLAMO_DESAGUES_URL = "https://www.rosario.gob.ar/inicio/reclamar-sobre-desagues-y-zanjas";
const RECLAMO_DESAGUES_LABEL = "Desagües y zanjas (agua, cloacas)";
const RECLAMO_GENERAL_URL = "https://www.rosario.gob.ar/inicio/consultas-y-reclamos";
const RECLAMO_GENERAL_LABEL = "Ver todas las categorías de reclamos";

// No hay login: un id de dispositivo generado y guardado en localStorage es
// lo unico que identifica "quien" reporta o confirma, para el rate limit y
// las confirmaciones del backend (ver backend/src/lib/reportes.js).
let dispositivoIdSesion = null;

function obtenerDispositivoId() {
  const generar = () => "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    let id = localStorage.getItem("dispositivo_id");
    if (!id) {
      id = generar();
      localStorage.setItem("dispositivo_id", id);
    }
    return id;
  } catch {
    // localStorage puede fallar (modo privado, bloqueado): usamos un id de
    // sesion, no persiste entre recargas pero no rompe la funcionalidad.
    if (!dispositivoIdSesion) dispositivoIdSesion = generar();
    return dispositivoIdSesion;
  }
}

let mapa;
let marcadores = [];
let todosLosPuntos = [];

function initMapa() {
  mapa = L.map("map", { scrollWheelZoom: false }).setView([-32.925, -60.68], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18
  }).addTo(mapa);
}

function crearMarcador(punto) {
  const color = COLORES[punto.nivel_alerta] || COLORES.sin_datos;
  const marker = L.circleMarker([punto.lat, punto.lng], {
    radius: 9,
    color: "#ffffff",
    weight: 2,
    fillColor: color,
    fillOpacity: 0.9
  }).addTo(mapa);

  marker.bindTooltip(punto.nombre, { direction: "top" });
  marker.on("click", () => mostrarDetalle(punto));

  return marker;
}

function pintarMarcadores(puntos) {
  marcadores.forEach((m) => mapa.removeLayer(m));
  marcadores = puntos
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
    .map(crearMarcador);
}

// Compatibilidad: los puntos ahora guardan un historial de mediciones
// (`historial_mediciones`), pero puede haber puntos viejos con el formato
// anterior de un solo objeto `ultima_medicion`.
function ultimaMedicionDePunto(punto) {
  const historial = punto.historial_mediciones;
  if (Array.isArray(historial) && historial.length > 0) return historial[historial.length - 1];
  return punto.ultima_medicion || null;
}

const ORDEN_SEVERIDAD = { rojo: 0, amarillo: 1, sin_datos: 2, verde: 3 };

function ordenarPorSeveridad(puntos) {
  return [...puntos].sort(
    (a, b) => (ORDEN_SEVERIDAD[a.nivel_alerta] ?? 9) - (ORDEN_SEVERIDAD[b.nivel_alerta] ?? 9)
  );
}

function pintarLista(puntosSinOrdenar) {
  const cont = document.getElementById("lista-puntos");
  const puntos = ordenarPorSeveridad(puntosSinOrdenar);
  if (puntos.length === 0) {
    cont.innerHTML = '<p class="panel__loading">No hay puntos para ese filtro.</p>';
    return;
  }

  cont.innerHTML = puntos
    .map((p) => {
      const m = ultimaMedicionDePunto(p);
      return `
      <div class="punto-item" data-id="${p.id}">
        <span class="punto-item__dot dot--${p.nivel_alerta}"></span>
        <div>
          <p class="punto-item__nombre">${p.nombre}</p>
          <p class="punto-item__meta">${p.barrio_aprox || ""}${m ? " · " + m.fecha : ""}</p>
        </div>
      </div>
    `;
    })
    .join("");

  cont.querySelectorAll(".punto-item").forEach((el) => {
    el.addEventListener("click", () => {
      const punto = todosLosPuntos.find((p) => p.id === el.dataset.id);
      if (punto) {
        mostrarDetalle(punto);
        if (typeof punto.lat === "number") {
          mapa.setView([punto.lat, punto.lng], 15);
        }
      }
    });
  });
}

function textoNivel(nivel) {
  return (
    {
      verde: "Apta / bajo riesgo",
      amarillo: "Evitar contacto directo",
      rojo: "No usar / riesgo de intoxicación",
      sin_datos: "Sin datos suficientes"
    }[nivel] || "Sin datos"
  );
}

const PATRONES_FUENTE = [
  { patron: /emisario\s*\d+/gi, etiqueta: (m) => `Descarga del ${m[0]}` },
  { patron: /pluviocloacal(es)?/gi, etiqueta: () => "Descarga pluviocloacal" },
  { patron: /conducto pluvial/gi, etiqueta: () => "Conducto pluvial" },
  { patron: /vertido[s]?\s+industrial(es)?/gi, etiqueta: () => "Vertido industrial" },
  { patron: /residuos/gi, etiqueta: () => "Residuos en el entorno" },
  { patron: /entubamiento/gi, etiqueta: () => "Tramo entubado" }
];

// Extrae menciones de posibles fuentes de contaminacion a partir del texto
// libre de "descripcion" (ya cargado en el dataset oficial). No agrega datos
// nuevos: solo resalta lo que el informe ya describe, para que sea mas facil
// de leer de un vistazo.
function extraerFuentesProbables(descripcion) {
  if (!descripcion) return [];
  const encontradas = new Set();
  PATRONES_FUENTE.forEach(({ patron, etiqueta }) => {
    const matches = descripcion.matchAll(patron);
    for (const m of matches) {
      encontradas.add(etiqueta(m));
    }
  });
  return [...encontradas];
}

function generarTextoReclamoPunto(punto) {
  const m = ultimaMedicionDePunto(punto);
  return [
    `Reclamo ambiental - Monitor Ambiental Rosario`,
    `Fecha: ${new Date().toLocaleString("es-AR")}`,
    `Punto: ${punto.nombre}`,
    `Ubicación (lat, lng): ${punto.lat}, ${punto.lng}`,
    `Barrio aprox.: ${punto.barrio_aprox || "-"}`,
    `Nivel de alerta actual: ${textoNivel(punto.nivel_alerta)}`,
    m ? `Última medición oficial: ${m.fecha}` : null,
    punto.mensaje_alerta ? `Detalle: ${punto.mensaje_alerta}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function copiarAlPortapapeles(texto, boton) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(() => {
      const original = boton.textContent;
      boton.textContent = "Copiado ✓";
      setTimeout(() => (boton.textContent = original), 1500);
    });
  }
}

function mostrarDetalle(punto) {
  const seccion = document.getElementById("detalle");
  const cont = document.getElementById("detalle-contenido");
  const historial = punto.historial_mediciones || (punto.ultima_medicion ? [punto.ultima_medicion] : []);
  const m = historial.length ? historial[historial.length - 1] : null;

  const params = m
    ? `
    <div class="detalle-params">
      ${m.ph !== undefined && m.ph !== null ? `<div><span class="label">pH</span><span class="value">${m.ph}</span></div>` : ""}
      ${m.oxigeno_disuelto_mgl !== undefined && m.oxigeno_disuelto_mgl !== null ? `<div><span class="label">Oxígeno disuelto</span><span class="value">${m.oxigeno_disuelto_mgl} mg/l</span></div>` : ""}
      ${m.dbo_mgl !== undefined && m.dbo_mgl !== null ? `<div><span class="label">DBO</span><span class="value">${m.dbo_mgl} mg/l</span></div>` : ""}
      ${m.dqo_mgl !== undefined && m.dqo_mgl !== null ? `<div><span class="label">DQO</span><span class="value">${m.dqo_mgl} mg/l</span></div>` : ""}
      ${m.turbidez_ntu !== undefined && m.turbidez_ntu !== null ? `<div><span class="label">Turbidez</span><span class="value">${m.turbidez_ntu} UNT</span></div>` : ""}
      ${m.conductividad_uscm !== undefined && m.conductividad_uscm !== null ? `<div><span class="label">Conductividad</span><span class="value">${m.conductividad_uscm} µS/cm</span></div>` : ""}
      ${m.coliformes_fecales_100ml ? `<div><span class="label">Coliformes fecales</span><span class="value">${m.coliformes_fecales_100ml} /100ml</span></div>` : ""}
      ${m.temperatura_c !== undefined && m.temperatura_c !== null ? `<div><span class="label">Temperatura</span><span class="value">${m.temperatura_c} °C</span></div>` : ""}
    </div>
  `
    : "<p>Todavía no hay una medición oficial cargada para este punto.</p>";

  const fuentes = extraerFuentesProbables(punto.descripcion);
  const fuentesHtml = fuentes.length
    ? `
    <div class="detalle-fuentes">
      <strong>Posibles fuentes mencionadas en el informe:</strong>
      <div class="detalle-fuentes__chips">
        ${fuentes.map((f) => `<span class="chip">${f}</span>`).join("")}
      </div>
    </div>
  `
    : "";

  cont.innerHTML = `
    <span class="detalle-badge badge--${punto.nivel_alerta}">${textoNivel(punto.nivel_alerta)}</span>
    <h2>${punto.nombre}</h2>
    <p>${punto.descripcion || ""}</p>
    <p><strong>Barrio aprox.:</strong> ${punto.barrio_aprox || "-"} · <strong>Distrito:</strong> ${punto.distrito || "-"}</p>
    ${m ? `<p><strong>Última medición:</strong> ${m.fecha}</p>` : ""}
    <p><em>${punto.mensaje_alerta || ""}</em></p>
    ${params}
    ${m && m.observacion_campo ? `<p><strong>Observación de campo:</strong> ${m.observacion_campo}</p>` : ""}
    ${fuentesHtml}
    <div class="historial-chart">
      <h3>Evolución histórica</h3>
      <div id="historial-chart-container"></div>
    </div>
    <div class="detalle-reclamo">
      <button type="button" id="btn-generar-reclamo">📋 Generar reclamo formal de este punto</button>
      <div id="reclamo-punto-resultado" hidden></div>
    </div>
  `;

  document.getElementById("btn-generar-reclamo").addEventListener("click", () => {
    const texto = generarTextoReclamoPunto(punto);
    const cont2 = document.getElementById("reclamo-punto-resultado");
    cont2.hidden = false;
    cont2.innerHTML = `
      <textarea readonly rows="6">${texto}</textarea>
      <div class="reclamo-acciones">
        <button type="button" id="btn-copiar-reclamo-punto">Copiar texto del reclamo</button>
        <a href="${RECLAMO_DESAGUES_URL}" target="_blank" rel="noopener" class="btn-ir-canal">
          Ir a "${RECLAMO_DESAGUES_LABEL}" ↗
        </a>
      </div>
    `;
    document
      .getElementById("btn-copiar-reclamo-punto")
      .addEventListener("click", (ev) => copiarAlPortapapeles(texto, ev.target));
  });

  renderizarHistorial(historial);

  seccion.hidden = false;
  seccion.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

let chartHistorial = null;

// Indicador simple de tendencia: compara los dos ultimos valores no nulos de
// un campo. "Mejora"/"empeora" depende del campo (para OD y pH mas alto no
// siempre es mejor, pero para DBO/turbidez/coliformes si baja es mejor).
function calcularTendencia(historial, campo, bajarEsMejor) {
  const valores = historial.map((m) => m[campo]).filter((v) => typeof v === "number");
  if (valores.length < 2) return null;
  const [anterior, actual] = valores.slice(-2);
  if (actual === anterior) return "igual";
  const subio = actual > anterior;
  const mejora = bajarEsMejor ? !subio : subio;
  return mejora ? "mejora" : "empeora";
}

const ICONO_TENDENCIA = { mejora: "🟢 mejorando", empeora: "🔴 empeorando", igual: "⚪ sin cambios" };

function renderizarHistorial(historial) {
  const cont = document.getElementById("historial-chart-container");
  if (!cont) return;

  if (historial.length === 0) {
    cont.innerHTML = "";
    return;
  }

  if (historial.length < 2) {
    cont.innerHTML = `
      <p class="historial-vacio">
        Todavía hay ${historial.length} medición cargada para este punto. El gráfico de
        tendencia se habilita automáticamente cuando haya al menos dos mediciones en el historial
        (ver <code>backend/scripts/actualizar-datos.js</code>).
      </p>
    `;
    return;
  }

  // El pH no tiene una direccion "mejor" clara (depende de si esta lejos de
  // neutro para cualquier lado), asi que solo se muestra tendencia para DBO
  // y oxigeno disuelto, que si tienen un sentido claro de mejora/empeora.
  const tendencias = [
    calcularTendencia(historial, "dbo_mgl", true),
    calcularTendencia(historial, "oxigeno_disuelto_mgl", false)
  ];

  const tendenciasHtml = `
    <p class="historial-tendencias">
      ${tendencias[0] ? `DBO: ${ICONO_TENDENCIA[tendencias[0]]}` : ""}
      ${tendencias[1] ? ` · Oxígeno disuelto: ${ICONO_TENDENCIA[tendencias[1]]}` : ""}
    </p>
  `;

  cont.innerHTML = `${tendenciasHtml}<canvas id="historial-canvas" height="220"></canvas>`;

  if (chartHistorial) {
    chartHistorial.destroy();
    chartHistorial = null;
  }
  if (typeof Chart === "undefined") return; // CDN pudo no cargar (sin internet, etc.)

  const ctx = document.getElementById("historial-canvas").getContext("2d");
  chartHistorial = new Chart(ctx, {
    type: "line",
    data: {
      labels: historial.map((m) => m.fecha),
      datasets: [
        { label: "pH", data: historial.map((m) => m.ph ?? null), borderColor: "#0e7490", tension: 0.2 },
        {
          label: "DBO (mg/l)",
          data: historial.map((m) => m.dbo_mgl ?? null),
          borderColor: "#c0392b",
          tension: 0.2
        },
        {
          label: "Oxígeno disuelto (mg/l)",
          data: historial.map((m) => m.oxigeno_disuelto_mgl ?? null),
          borderColor: "#1b8a5a",
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function pintarResumen(resumen, puntos) {
  document.getElementById("count-verde").textContent = resumen.verde ?? 0;
  document.getElementById("count-amarillo").textContent = resumen.amarillo ?? 0;
  document.getElementById("count-rojo").textContent = resumen.rojo ?? 0;
  document.getElementById("count-sin_datos").textContent = resumen.sin_datos ?? 0;

  ["verde", "amarillo", "rojo", "sin_datos"].forEach((nivel) => {
    const card = document.getElementById(`card-${nivel}`);
    if (!card) return;
    const nombres = puntos.filter((p) => p.nivel_alerta === nivel).map((p) => p.nombre);
    card.title = nombres.length ? nombres.join("\n") : "No hay puntos en esta categoría.";
  });
}

async function cargarDatos() {
  try {
    const [resPuntos, resResumen] = await Promise.all([
      fetch(`${API_BASE}/puntos`),
      fetch(`${API_BASE}/resumen`)
    ]);
    const dataPuntos = await resPuntos.json();
    const dataResumen = await resResumen.json();

    todosLosPuntos = dataPuntos.puntos;
    poblarBarrios(todosLosPuntos);
    pintarMarcadores(todosLosPuntos);
    pintarLista(todosLosPuntos);
    pintarResumen(dataResumen.resumen, todosLosPuntos);
  } catch (err) {
    document.getElementById("lista-puntos").innerHTML =
      '<p class="panel__loading">No se pudo conectar con el backend. ¿Está corriendo en el puerto 3001?</p>';
    console.error(err);
  }
}

function poblarBarrios(puntos) {
  const select = document.getElementById("filtro-barrio");
  const barrios = [...new Set(puntos.map((p) => p.barrio_aprox).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  select.innerHTML =
    '<option value="">Todos los barrios</option>' +
    barrios.map((b) => `<option value="${b}">${b}</option>`).join("");
}

function initFiltro() {
  const selectBarrio = document.getElementById("filtro-barrio");
  const selectNivel = document.getElementById("filtro-nivel");

  function aplicarFiltros() {
    const barrio = selectBarrio.value;
    const nivel = selectNivel.value;
    const filtrados = todosLosPuntos.filter((p) => {
      const coincideBarrio = !barrio || p.barrio_aprox === barrio;
      const coincideNivel = !nivel || p.nivel_alerta === nivel;
      return coincideBarrio && coincideNivel;
    });
    pintarLista(filtrados);
    pintarMarcadores(filtrados);
  }

  selectBarrio.addEventListener("change", aplicarFiltros);
  selectNivel.addEventListener("change", aplicarFiltros);
}

document.getElementById("detalle-cerrar").addEventListener("click", () => {
  document.getElementById("detalle").hidden = true;
});

// ---- Reportes ciudadanos: sintomas respiratorios y bruma estimada por foto ----
// No hay ninguna fuente de calidad de AIRE conectada a este proyecto (el
// dataset oficial es solo de agua). Esta capa es una señal comunitaria en
// tiempo real, explicitamente no-oficial, para detectar posibles focos.

let todosLosReportes = [];
let reportesMarcadores = [];
let ubicacionSintoma = null;
let ubicacionBruma = null;
let brumaEstimadaActual = null;

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Cada formulario que necesita una ubicación tiene su propio mapa chico (en
// vez de depender del mapa principal, que vive en la pestaña "Agua" y no se
// ve desde las otras pestañas). onClick recibe (lat, lng) cuando tocan el mapa.
function initMiniMapa(idContenedor, onClick) {
  const mapaChico = L.map(idContenedor, { scrollWheelZoom: false }).setView([-32.925, -60.68], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18
  }).addTo(mapaChico);

  let marcador = null;
  function marcar(lat, lng) {
    if (marcador) mapaChico.removeLayer(marcador);
    marcador = L.marker([lat, lng], { opacity: 0.85 }).addTo(mapaChico);
    mapaChico.panTo([lat, lng]);
  }

  mapaChico.on("click", (e) => {
    marcar(e.latlng.lat, e.latlng.lng);
    onClick(e.latlng.lat, e.latlng.lng);
  });

  return { mapaChico, marcar };
}

function usarGeolocacion(onOk, onError) {
  if (!navigator.geolocation) {
    onError();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => onOk(pos.coords.latitude, pos.coords.longitude),
    () => onError(),
    { timeout: 8000 }
  );
}

async function cargarReportes() {
  try {
    const res = await fetch(`${API_BASE}/reportes`);
    const data = await res.json();
    todosLosReportes = data.reportes || [];
    pintarReportesEnMapa(todosLosReportes);
  } catch (err) {
    console.error("No se pudieron cargar los reportes ciudadanos", err);
  }
}

// Peso de un reporte para mostrar en pantalla y para el calculo de riesgo
// respiratorio (misma logica que backend/src/lib/reportes.js pesoReporte:
// aislado pesa la mitad que uno confirmado por al menos un vecino).
function pesoReporteFrontend(reporte) {
  const confirmaciones = reporte.confirmaciones ? reporte.confirmaciones.length : 0;
  if (confirmaciones === 0) return 0.5;
  return Math.min(2, 1 + confirmaciones * 0.25);
}

function popupReporte(r) {
  const confirmaciones = r.confirmaciones || [];
  const miId = obtenerDispositivoId();
  const esMio = r.dispositivo_id === miId;
  const yaConfirme = confirmaciones.includes(miId);

  const descripcion =
    r.tipo === "bruma"
      ? `📷 Bruma estimada (foto, no oficial): <strong>${r.bruma_estimada}/100</strong>`
      : `🤧 Síntomas: <strong>${(r.sintomas || []).join(", ") || "sin detalle"}</strong>`;

  let accion;
  if (esMio) {
    accion = `<p class="reporte-popup__nota">Es tu reporte.</p>`;
  } else if (yaConfirme) {
    accion = `<p class="reporte-popup__nota">Ya lo confirmaste ✓</p>`;
  } else {
    accion = `<button type="button" class="btn-confirmar-reporte" data-id="${r.id}">👍 Yo también lo noto</button>`;
  }

  return `
    <div class="reporte-popup">
      <p>${descripcion}</p>
      <p class="reporte-popup__meta">
        ${new Date(r.fecha).toLocaleString("es-AR")} ·
        ${confirmaciones.length} confirmación(es)
      </p>
      ${accion}
    </div>
  `;
}

async function confirmarReporteCiudadano(id) {
  try {
    const res = await fetch(`${API_BASE}/reportes/${id}/confirmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispositivo_id: obtenerDispositivoId() })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo confirmar el reporte.");
      return;
    }
    await cargarReportes();
  } catch (err) {
    console.error(err);
    alert("No se pudo confirmar el reporte. Intentá de nuevo.");
  }
}

function pintarReportesEnMapa(reportes) {
  reportesMarcadores.forEach((m) => mapa.removeLayer(m));
  reportesMarcadores = reportes.map((r) => {
    const marker =
      r.tipo === "bruma"
        ? (() => {
            const intensidad = (r.bruma_estimada || 0) / 100;
            return L.circleMarker([r.lat, r.lng], {
              radius: 8 + intensidad * 6,
              color: "#8b5e34",
              weight: 1,
              fillColor: "#c9a26a",
              fillOpacity: 0.3 + intensidad * 0.4
            });
          })()
        : L.circleMarker([r.lat, r.lng], {
            radius: 7,
            color: "#e67e22",
            weight: 1,
            fillColor: "#f39c12",
            fillOpacity: 0.6
          });

    marker.addTo(mapa).bindPopup(popupReporte(r));
    marker.on("popupopen", () => {
      const boton = document.querySelector(`.btn-confirmar-reporte[data-id="${r.id}"]`);
      if (boton) boton.addEventListener("click", () => confirmarReporteCiudadano(r.id));
    });
    return marker;
  });
}

async function enviarReporte(payload) {
  try {
    const res = await fetch(`${API_BASE}/reportes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, dispositivo_id: obtenerDispositivoId() })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo enviar el reporte.");
      return null;
    }
    mostrarConfirmacionReporte(data);
    await cargarReportes();
    return data;
  } catch (err) {
    console.error(err);
    alert("No se pudo enviar el reporte. Intentá de nuevo.");
    return null;
  }
}

function generarTextoReclamoReporte(reporte) {
  const tipoTexto = reporte.tipo === "sintoma" ? "síntomas respiratorios/irritación" : "bruma o humo visible";
  return [
    `Reclamo ambiental - Monitor Ambiental Rosario`,
    `Fecha: ${new Date(reporte.fecha).toLocaleString("es-AR")}`,
    `Ubicación (lat, lng): ${reporte.lat.toFixed(5)}, ${reporte.lng.toFixed(5)}`,
    `Tipo de reporte: ${tipoTexto}`,
    reporte.sintomas && reporte.sintomas.length ? `Síntomas: ${reporte.sintomas.join(", ")}` : null,
    reporte.bruma_estimada !== null && reporte.bruma_estimada !== undefined
      ? `Bruma estimada (visual, no certificada): ${reporte.bruma_estimada}/100`
      : null,
    reporte.descripcion ? `Descripción: ${reporte.descripcion}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function mostrarConfirmacionReporte(reporte) {
  const cont = document.getElementById("reporte-confirmacion");
  const texto = generarTextoReclamoReporte(reporte);
  cont.hidden = false;
  cont.innerHTML = `
    <p>✓ Reporte enviado, gracias. Si querés, pasalo de queja a reclamo formal:</p>
    <textarea readonly rows="6">${texto}</textarea>
    <p class="reclamo-elegir">rosario.gob.ar no tiene una categoría para humo/olores: elegí a dónde va tu reclamo</p>
    <div class="reclamo-acciones">
      <button type="button" id="btn-copiar-reclamo-reporte">Copiar texto del reclamo</button>
      <a href="${RECLAMO_DESAGUES_URL}" target="_blank" rel="noopener" class="btn-ir-canal">
        Es por agua/cloacas → "${RECLAMO_DESAGUES_LABEL}" ↗
      </a>
      <a href="${RECLAMO_GENERAL_URL}" target="_blank" rel="noopener" class="btn-ir-canal btn-ir-canal--secundario">
        Es otra cosa (aire, olores) → ${RECLAMO_GENERAL_LABEL} ↗
      </a>
    </div>
  `;
  document
    .getElementById("btn-copiar-reclamo-reporte")
    .addEventListener("click", (ev) => copiarAlPortapapeles(texto, ev.target));
}

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Heuristica visual simple para estimar "bruma" a partir de una foto (NO es
// una medicion certificada de calidad de aire). Una escena con bruma/humo
// tiende a verse mas grisacea/blanquecina: baja saturacion de color y bajo
// contraste de luminancia. Se muestrea la imagen reducida a 64x64 en un
// canvas y se combinan esas dos señales en un puntaje 0-100.
async function estimarBrumaDesdeFoto(file) {
  const img = await cargarImagen(file);
  const tam = 64;
  const canvas = document.createElement("canvas");
  canvas.width = tam;
  canvas.height = tam;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, tam, tam);
  const { data } = ctx.getImageData(0, 0, tam, tam);

  let sumaSat = 0;
  let sumaLum = 0;
  let sumaLum2 = 0;
  const n = tam * tam;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sumaSat += sat;
    sumaLum += lum;
    sumaLum2 += lum * lum;
  }

  const satProm = sumaSat / n;
  const lumProm = sumaLum / n;
  const varianzaLum = Math.max(sumaLum2 / n - lumProm * lumProm, 0);
  const contraste = Math.sqrt(varianzaLum);

  const puntajeSaturacion = (1 - satProm) * 60;
  const puntajeContraste = (1 - Math.min(contraste * 4, 1)) * 40;

  return Math.max(0, Math.min(100, Math.round(puntajeSaturacion + puntajeContraste)));
}

let mapaSintoma;
let mapaBruma;

function initReportesCiudadanos() {
  const btnSintoma = document.getElementById("btn-reportar-sintoma");
  const btnBruma = document.getElementById("btn-reportar-bruma");
  const formSintoma = document.getElementById("form-sintoma");
  const formBruma = document.getElementById("form-bruma");

  mapaSintoma = initMiniMapa("mapa-sintoma", (lat, lng) => {
    ubicacionSintoma = { lat, lng };
    document.getElementById("ubicacion-sintoma-estado").textContent = "Ubicación marcada en el mapa ✓";
  });
  mapaBruma = initMiniMapa("mapa-bruma", (lat, lng) => {
    ubicacionBruma = { lat, lng };
    document.getElementById("ubicacion-bruma-estado").textContent = "Ubicación marcada en el mapa ✓";
  });

  btnSintoma.addEventListener("click", () => {
    formSintoma.hidden = !formSintoma.hidden;
    formBruma.hidden = true;
    if (!formSintoma.hidden) setTimeout(() => mapaSintoma.mapaChico.invalidateSize(), 0);
  });
  btnBruma.addEventListener("click", () => {
    formBruma.hidden = !formBruma.hidden;
    formSintoma.hidden = true;
    if (!formBruma.hidden) setTimeout(() => mapaBruma.mapaChico.invalidateSize(), 0);
  });

  document.getElementById("btn-usar-ubicacion-sintoma").addEventListener("click", () => {
    usarGeolocacion(
      (lat, lng) => {
        ubicacionSintoma = { lat, lng };
        document.getElementById("ubicacion-sintoma-estado").textContent = "Ubicación capturada ✓";
        mapaSintoma.marcar(lat, lng);
      },
      () => {
        document.getElementById("ubicacion-sintoma-estado").textContent =
          "No se pudo acceder a tu ubicación: tocá el mapa de abajo para marcarla.";
      }
    );
  });

  document.getElementById("btn-usar-ubicacion-bruma").addEventListener("click", () => {
    usarGeolocacion(
      (lat, lng) => {
        ubicacionBruma = { lat, lng };
        document.getElementById("ubicacion-bruma-estado").textContent = "Ubicación capturada ✓";
        mapaBruma.marcar(lat, lng);
      },
      () => {
        document.getElementById("ubicacion-bruma-estado").textContent =
          "No se pudo acceder a tu ubicación: tocá el mapa de abajo para marcarla.";
      }
    );
  });

  formSintoma.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ubicacionSintoma) {
      alert("Primero marcá tu ubicación (botón 'Usar mi ubicación' o click en el mapa).");
      return;
    }
    const sintomas = [...formSintoma.querySelectorAll('input[name="sintoma-sintoma"]:checked')].map(
      (el) => el.value
    );
    const descripcion = document.getElementById("sintoma-descripcion").value;
    const ok = await enviarReporte({ tipo: "sintoma", ...ubicacionSintoma, sintomas, descripcion });
    if (ok) {
      formSintoma.reset();
      formSintoma.hidden = true;
      ubicacionSintoma = null;
      document.getElementById("ubicacion-sintoma-estado").textContent = "o tocá el mapa de abajo para marcarla";
    }
  });

  document.getElementById("input-foto-bruma").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    brumaEstimadaActual = await estimarBrumaDesdeFoto(file);
    document.getElementById("bruma-preview").innerHTML = `
      <p>Bruma estimada: <strong>${brumaEstimadaActual}/100</strong>
      (estimación visual aproximada a partir de la foto, no es una medición certificada).</p>
    `;
    document.getElementById("btn-enviar-bruma").disabled = false;
  });

  formBruma.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ubicacionBruma) {
      alert("Primero marcá tu ubicación (botón 'Usar mi ubicación' o click en el mapa).");
      return;
    }
    if (brumaEstimadaActual === null) {
      alert("Subí una foto primero.");
      return;
    }
    const ok = await enviarReporte({ tipo: "bruma", ...ubicacionBruma, bruma_estimada: brumaEstimadaActual });
    if (ok) {
      formBruma.reset();
      formBruma.hidden = true;
      document.getElementById("bruma-preview").innerHTML = "";
      document.getElementById("btn-enviar-bruma").disabled = true;
      ubicacionBruma = null;
      brumaEstimadaActual = null;
      document.getElementById("ubicacion-bruma-estado").textContent = "o tocá el mapa de abajo para marcarla";
    }
  });
}

// ---- Expediente colectivo ----
// Ver backend/src/lib/expediente.js: cuando se acumulan reportes ciudadanos
// confirmados en una zona, arma un resumen para usar como base de un
// reclamo formal o un pedido de informes. No reemplaza una inspeccion oficial.

let mapaExpediente;

function formatearFechaHora(iso) {
  return iso ? new Date(iso).toLocaleString("es-AR") : "-";
}

// Calcula una vez los textos de cada seccion, para que generarTextoExpediente
// (copiar/pegar) y generarHtmlExpediente (documento imprimible) muestren
// exactamente lo mismo sin tener que parsear el texto plano del uno al otro.
function calcularTextosExpediente(data, ubicacion) {
  const sintomasTexto =
    Object.entries(data.sintomas)
      .map(([s, n]) => `- ${s}: ${n}`)
      .join("\n") || "Sin datos.";

  const brumaTexto = data.bruma
    ? `${data.bruma.cantidad} reporte(s) de foto, puntaje visual promedio estimado ${data.bruma.promedio_estimado}/100 (heurística no oficial)`
    : "Sin reportes de foto en el período.";

  const puntosTexto = data.puntos_agua_en_alerta.length
    ? data.puntos_agua_en_alerta
        .map((p) => `- ${p.nombre} — nivel ${p.nivel_alerta}${p.fecha_medicion ? ` (medición: ${p.fecha_medicion})` : ""}`)
        .join("\n")
    : "Ninguno dentro de 3km.";

  const humoTexto =
    data.humo.estado === "ok"
      ? `Nivel actual: ${data.humo.nivel_actual}.${
          data.humo.proxima_ventana_riesgo
            ? ` Próxima ventana de riesgo: ${formatearFechaHora(data.humo.proxima_ventana_riesgo.desde)} a ${formatearFechaHora(data.humo.proxima_ventana_riesgo.hasta)}.`
            : ""
        }`
      : "Sin datos de humo disponibles en este momento.";

  return {
    generado: formatearFechaHora(data.generado),
    ubicacion: `${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)}`,
    resumen: `Vecinos involucrados (dispositivos distintos): ${data.vecinos_involucrados}\nReportes totales: ${data.total_reportes} (${data.reportes_confirmados} confirmados por al menos otro vecino)\nPeríodo: ${formatearFechaHora(data.periodo.desde)} a ${formatearFechaHora(data.periodo.hasta)}`,
    sintomasTexto,
    brumaTexto,
    puntosTexto,
    humoTexto,
    disclaimer:
      "Generado automáticamente a partir de reportes ciudadanos autogestionados en Monitor Ambiental Rosario (proyecto no oficial, de código abierto), sin verificación de campo. No reemplaza una inspección o medición oficial. Sirve como base para un reclamo formal ante la Municipalidad de Rosario o un pedido de informes ante el Concejo Municipal."
  };
}

function generarTextoExpediente(data, ubicacion) {
  const t = calcularTextosExpediente(data, ubicacion);
  return [
    "EXPEDIENTE COLECTIVO - Monitor Ambiental Rosario",
    `Generado: ${t.generado}`,
    `Ubicación de referencia: ${t.ubicacion}`,
    "",
    "RESUMEN",
    t.resumen,
    "",
    "SÍNTOMAS REPORTADOS",
    t.sintomasTexto,
    "",
    "REPORTES DE BRUMA (FOTO)",
    t.brumaTexto,
    "",
    "PUNTOS DE AGUA CERCANOS EN ALERTA (hasta 3km)",
    t.puntosTexto,
    "",
    "CONDICIÓN DE HUMO POR QUEMAS EN LAS ISLAS",
    t.humoTexto,
    "",
    t.disclaimer
  ].join("\n");
}

function generarHtmlExpediente(data, ubicacion) {
  const t = calcularTextosExpediente(data, ubicacion);
  const nl2br = (s) => s.replace(/\n/g, "<br>");

  const cuerpo = `
    <p>Generado: ${t.generado}<br>Ubicación de referencia: ${t.ubicacion}</p>
    <h2>Resumen</h2><p>${nl2br(t.resumen)}</p>
    <h2>Síntomas reportados</h2><p>${nl2br(t.sintomasTexto)}</p>
    <h2>Reportes de bruma (foto)</h2><p>${t.brumaTexto}</p>
    <h2>Puntos de agua cercanos en alerta (hasta 3km)</h2><p>${nl2br(t.puntosTexto)}</p>
    <h2>Condición de humo por quemas en las islas</h2><p>${t.humoTexto}</p>
    <p class="disclaimer">${t.disclaimer}</p>
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Expediente colectivo - Monitor Ambiental Rosario</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 40px auto; color: #111; line-height: 1.5; padding: 0 20px; }
  h1 { font-size: 1.4rem; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { font-size: 1.05rem; margin-top: 26px; margin-bottom: 4px; }
  p { margin: 4px 0 0; }
  .disclaimer { margin-top: 30px; font-size: 0.78rem; color: #777; border-top: 1px solid #ccc; padding-top: 12px; }
  .no-imprimir { margin: 0 0 20px; }
  .no-imprimir button { padding: 8px 14px; font-size: 0.9rem; cursor: pointer; }
  @media print { .no-imprimir { display: none; } body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <div class="no-imprimir"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>
  <h1>Expediente colectivo — Reclamo ambiental</h1>
  ${cuerpo}
</body>
</html>`;
}

async function generarExpedienteUI(lat, lng) {
  if (mapaExpediente) mapaExpediente.marcar(lat, lng);
  const cont = document.getElementById("expediente-resultado");
  cont.innerHTML = '<p class="panel__loading">Generando expediente…</p>';
  try {
    const res = await fetch(`${API_BASE}/expediente?lat=${lat}&lng=${lng}`);
    const data = await res.json();
    pintarExpediente(data, { lat, lng }, cont);
  } catch (err) {
    console.error("No se pudo generar el expediente", err);
    cont.innerHTML = '<p class="panel__loading">No se pudo conectar con el backend.</p>';
  }
}

function pintarExpediente(data, ubicacion, cont) {
  if (!data.elegible) {
    cont.innerHTML = `
      <div class="humo-sin-datos">
        <p>
          Todavía no hay suficientes reportes confirmados en esta zona para armar un
          expediente (señal acumulada: ${data.peso_total} / umbral: ${data.umbral}).
          Pedile a más vecinos que reporten y confirmen desde el formulario de arriba.
        </p>
      </div>
    `;
    return;
  }

  const textoPlano = generarTextoExpediente(data, ubicacion);

  cont.innerHTML = `
    <div class="expediente-resumen">
      <p><strong>${data.vecinos_involucrados}</strong> vecino(s) involucrados ·
      <strong>${data.total_reportes}</strong> reporte(s) (${data.reportes_confirmados} confirmados)</p>
      <p>Período: ${formatearFechaHora(data.periodo.desde)} a ${formatearFechaHora(data.periodo.hasta)}</p>
    </div>
    <div class="reclamo-acciones">
      <button type="button" id="btn-copiar-expediente">Copiar texto</button>
      <button type="button" id="btn-imprimir-expediente" class="btn-ir-canal">🖨️ Ver documento para imprimir/PDF</button>
      <a href="${RECLAMO_DESAGUES_URL}" target="_blank" rel="noopener" class="btn-ir-canal btn-ir-canal--secundario">Es por agua/cloacas ↗</a>
      <a href="${RECLAMO_GENERAL_URL}" target="_blank" rel="noopener" class="btn-ir-canal btn-ir-canal--secundario">Otras categorías ↗</a>
    </div>
    <textarea readonly rows="12">${textoPlano}</textarea>
  `;

  document
    .getElementById("btn-copiar-expediente")
    .addEventListener("click", (ev) => copiarAlPortapapeles(textoPlano, ev.target));

  document.getElementById("btn-imprimir-expediente").addEventListener("click", () => {
    const html = generarHtmlExpediente(data, ubicacion);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  });
}

function initExpediente() {
  mapaExpediente = initMiniMapa("mapa-expediente", (lat, lng) => generarExpedienteUI(lat, lng));

  document.getElementById("btn-usar-ubicacion-expediente").addEventListener("click", () => {
    usarGeolocacion(
      (lat, lng) => generarExpedienteUI(lat, lng),
      () => {
        document.getElementById("expediente-resultado").innerHTML =
          "<p>No se pudo acceder a tu ubicación. Tocá el mapa de abajo para elegir la zona.</p>";
      }
    );
  });
}

// ---- Riesgo respiratorio personal ----
// Combina reportes comunitarios cercanos (sintomas + bruma estimada) con un
// peso segun perfil de salud. Es un indicador propio, no un diagnostico
// medico ni una medicion oficial de calidad de aire.

const PESO_PERFIL_RESPIRATORIO = {
  general: 1,
  asma: 1.6,
  epoc: 1.8,
  nino_deportista: 1.4
};

function calcularYMostrarRiesgo(lat, lng) {
  const perfil = document.getElementById("perfil-respiratorio").value;
  const peso = PESO_PERFIL_RESPIRATORIO[perfil] || 1;
  const radioKm = 0.8;
  const ventanaMs = 24 * 60 * 60 * 1000;
  const ahora = Date.now();

  if (mapaRiesgo) mapaRiesgo.marcar(lat, lng);

  const cercanos = todosLosReportes.filter((r) => {
    const d = distanciaKm(lat, lng, r.lat, r.lng);
    const antig = ahora - new Date(r.fecha).getTime();
    return d <= radioKm && antig <= ventanaMs;
  });

  const sintomas = cercanos.filter((r) => r.tipo === "sintoma");
  const brumas = cercanos.filter((r) => r.tipo === "bruma");
  const brumaProm = brumas.length
    ? brumas.reduce((acc, r) => acc + (r.bruma_estimada || 0), 0) / brumas.length
    : 0;

  // Un reporte de sintoma aislado (sin confirmar por otro vecino) pesa menos
  // que uno confirmado, misma logica que backend/src/lib/reportes.js.
  const pesoSintomasTotal = sintomas.reduce((acc, r) => acc + pesoReporteFrontend(r), 0);

  // Componente de humo por quemas en las islas (pronostico, no reporte
  // ciudadano): usa la hora "actual" del pronostico de /api/humo si esta
  // disponible. Se suma con menos peso que los reportes porque es un dato
  // de ciudad entera, no hiperlocal como los reportes cercanos al punto.
  const horaHumoActual =
    datosHumo && datosHumo.estado === "ok" && datosHumo.pronostico.length ? datosHumo.pronostico[0] : null;
  const puntajeHumo = horaHumoActual ? horaHumoActual.score : 0;

  const puntajeReportes = pesoSintomasTotal * 15 + brumaProm * 0.5;
  const puntajeFinal = Math.min(100, Math.round((puntajeReportes + puntajeHumo * 0.6) * peso));

  let nivel, mensaje;
  if (puntajeFinal >= 60) {
    nivel = "alto";
    mensaje = "Riesgo alto para tu perfil en esta zona: evitá actividad física al aire libre.";
  } else if (puntajeFinal >= 25) {
    nivel = "moderado";
    mensaje = "Riesgo moderado para tu perfil: prestá atención a síntomas y considerá reducir la exposición.";
  } else {
    nivel = "bajo";
    mensaje = "No hay señales comunitarias recientes de riesgo respiratorio en esta zona.";
  }

  const detalleHumo = horaHumoActual
    ? ` y el pronóstico de humo por quemas en las islas (nivel ${horaHumoActual.nivel})`
    : "";

  document.getElementById("riesgo-resultado").innerHTML = `
    <p class="riesgo-nivel riesgo-nivel--${nivel}">${mensaje}</p>
    <p class="riesgo-detalle">
      Basado en ${sintomas.length} reporte(s) de síntomas (ponderados según cuántos vecinos los
      confirmaron) y ${brumas.length} reporte(s) de bruma en un radio de ${radioKm * 1000}m en las
      últimas 24hs${detalleHumo}. Esto es un indicador comunitario, no una medición oficial de
      calidad de aire ni un diagnóstico médico.
    </p>
  `;
}

let mapaRiesgo;

function initRiesgoRespiratorio() {
  mapaRiesgo = initMiniMapa("mapa-riesgo", (lat, lng) => calcularYMostrarRiesgo(lat, lng));

  document.getElementById("btn-calcular-riesgo").addEventListener("click", () => {
    usarGeolocacion(
      (lat, lng) => calcularYMostrarRiesgo(lat, lng),
      () => {
        document.getElementById("riesgo-resultado").innerHTML =
          "<p>No se pudo acceder a tu ubicación. Tocá el mapa de abajo para elegir el punto a evaluar.</p>";
      }
    );
  });
}

// ---- Reciclaje ----
// Datos verificados a mano en rosario.gob.ar/inicio/residuos (no hardcodeamos
// los ~742 contenedores naranjas individuales: para esos se embebe el mapa
// oficial de la Municipalidad más abajo).
const PUNTOS_RESIDUOS_ESPECIALES = [
  {
    nombre: "Centro Municipal Distrito Oeste «Felipe Moré»",
    direccion: "Av. Presidente Perón 4602",
    horario: "Lunes a viernes de 8 a 14 hs",
    acepta: "Pilas, aceite de cocina usado, lámparas y tubos fluorescentes, textiles"
  },
  {
    nombre: "Dirección de Gestión Integral de Residuos",
    direccion: "Montevideo 2852",
    horario: "Lunes a viernes de 8 a 14 hs",
    acepta: "Pilas, aceite de cocina usado, lámparas y tubos fluorescentes, textiles"
  },
  {
    nombre: "Emprendimiento de Clasificación «Reciclando Futuro»",
    direccion: "Bulevar Seguí 3964",
    horario: "Lunes a viernes de 9 a 15 hs",
    acepta: "Pilas, aceite de cocina usado, lámparas y tubos fluorescentes, textiles"
  },
  {
    nombre: "Mercado del Patio",
    direccion: "Cafferata 729",
    horario: "Martes a domingo de 9 a 21 hs",
    acepta: "Pilas, aceite de cocina usado, lámparas y tubos fluorescentes, textiles"
  },
  {
    nombre: "Shopping Alto Rosario",
    direccion: "Junín 501",
    horario: "Lunes a domingo de 10 a 21 hs",
    acepta: "Pilas, aceite de cocina usado, lámparas y tubos fluorescentes, textiles"
  }
];

// Estimaciones ambientales de divulgación general (no datos oficiales de
// Rosario). Las cifras varían mucho según la fuente; se muestran como rango
// junto con un disclaimer explícito en la UI.
const IMPACTO_PRODUCTOS = [
  {
    icono: "🔋",
    producto: "Pilas",
    texto:
      "Una sola pila puede contaminar entre 3.000 y 170.000 litros de agua o tierra, según el tipo, por los metales pesados que contiene."
  },
  {
    icono: "🛢️",
    producto: "Aceite de cocina usado",
    texto:
      "Un litro tirado por la cañería puede contaminar entre 1.000 y 40.000 litros de agua, formando una capa que corta el oxígeno en ríos y arroyos."
  },
  {
    icono: "🥤",
    producto: "Botellas de plástico (PET)",
    texto: "Puede tardar hasta 1.000 años en degradarse, fragmentándose en microplásticos mientras tanto."
  },
  {
    icono: "🍾",
    producto: "Vidrio",
    texto: "Se recicla infinitamente sin perder calidad, pero si se descarta puede tardar hasta 4.000 años en degradarse."
  },
  {
    icono: "📱",
    producto: "Celulares y electrónicos",
    texto:
      "Contienen plomo, mercurio y cadmio que contaminan suelo y agua si van a la basura común. Pueden tardar entre 150 y 4.000 años en degradarse."
  }
];

function initReciclaje() {
  const select = document.getElementById("selector-punto-reciclaje");
  const detalle = document.getElementById("detalle-punto-reciclaje");

  select.innerHTML =
    '<option value="">Elegí un centro de recepción...</option>' +
    PUNTOS_RESIDUOS_ESPECIALES.map((p, i) => `<option value="${i}">${p.nombre}</option>`).join("");

  select.addEventListener("change", () => {
    if (select.value === "") {
      detalle.hidden = true;
      return;
    }
    const punto = PUNTOS_RESIDUOS_ESPECIALES[Number(select.value)];
    detalle.hidden = false;
    detalle.innerHTML = `
      <p><strong>${punto.nombre}</strong></p>
      <p>📍 ${punto.direccion}</p>
      <p>🕒 ${punto.horario}</p>
      <p>♻️ Acepta: ${punto.acepta}</p>
    `;
  });

  const grid = document.getElementById("impacto-grid");
  grid.innerHTML = IMPACTO_PRODUCTOS.map(
    (item) => `
    <div class="impacto-card">
      <div class="impacto-card__icono">${item.icono}</div>
      <p class="impacto-card__titulo">${item.producto}</p>
      <p class="impacto-card__texto">${item.texto}</p>
    </div>
  `
  ).join("");
}

// ---- Alerta de humo por quemas en las islas ----
// Ver backend/src/lib/humo.js para el detalle del calculo (estimacion propia
// combinando focos de calor satelitales + pronostico de viento, no es un
// modelo de dispersion oficial).

let datosHumo = null;
let focosCalorMarcadores = [];

const TEXTO_NIVEL_HUMO = {
  sin_riesgo: "Sin riesgo de humo previsto",
  bajo: "Riesgo bajo de humo",
  moderado: "Riesgo moderado de humo",
  alto: "Riesgo alto de humo"
};

function formatearHora(horaIso) {
  // Open-Meteo ya devuelve la hora en el huso horario de Argentina.
  const partes = horaIso.split("T");
  return partes[1] ? partes[1].slice(0, 5) : horaIso;
}

async function cargarHumo() {
  try {
    const res = await fetch(`${API_BASE}/humo`);
    datosHumo = await res.json();
  } catch (err) {
    console.error("No se pudo consultar la alerta de humo", err);
    datosHumo = { estado: "datos_no_disponibles", mensaje: "No se pudo conectar con el backend." };
  }
  pintarHumo(datosHumo);
  actualizarBannerHumo(datosHumo);
  pintarFocosCalorEnMapa(document.getElementById("toggle-focos-calor").checked);
}

function pintarHumo(data) {
  const cont = document.getElementById("humo-contenido");

  if (!data || data.estado !== "ok") {
    cont.innerHTML = `
      <div class="humo-sin-datos">
        <p>${(data && data.mensaje) || "No hay datos disponibles en este momento."}</p>
      </div>
    `;
    return;
  }

  const ventana = data.proxima_ventana_riesgo;
  const ventanaHtml = ventana
    ? `
    <div class="humo-ventana">
      🕒 Próxima ventana de riesgo: <strong>${formatearHora(ventana.desde)} a ${formatearHora(ventana.hasta)}</strong>
      (nivel ${ventana.nivel_max})${ventana.zona_expuesta ? `, sobre todo en <strong>${ventana.zona_expuesta}</strong>` : ""}.
    </div>
  `
    : `<div class="humo-ventana">No se detecta una ventana de riesgo moderado/alto en las próximas 48hs.</div>`;

  const etiquetas = data.pronostico
    .map((h, i) => (i % 3 === 0 ? `<span>${formatearHora(h.hora)}</span>` : `<span></span>`))
    .join("");

  const barras = data.pronostico
    .map(
      (h) => `
      <div class="humo-timeline__hora" title="${formatearHora(h.hora)} - ${TEXTO_NIVEL_HUMO[h.nivel]}${
        h.zona_expuesta ? " - " + h.zona_expuesta : ""
      }">
        <div class="humo-timeline__barra humo-timeline__barra--${h.nivel}"></div>
      </div>
    `
    )
    .join("");

  cont.innerHTML = `
    <div class="humo-nivel-actual humo-nivel-actual--${data.nivel_actual}">
      ${data.nivel_actual === "alto" ? "🔴" : data.nivel_actual === "moderado" ? "🟡" : "🟢"}
      ${TEXTO_NIVEL_HUMO[data.nivel_actual]}
    </div>
    ${ventanaHtml}
    <p><strong>Próximas horas:</strong></p>
    <div class="humo-timeline__etiquetas">${etiquetas}</div>
    <div class="humo-timeline">${barras}</div>
    <p class="humo-focos-lista">
      ${data.focos.length} foco(s) de calor detectado(s) en las islas en los últimos días
      (fuente: NASA FIRMS). Se pueden ver en el mapa desde la pestaña "Agua"
      activando "Mostrar focos de calor".
    </p>
  `;
}

function actualizarBannerHumo(data) {
  const banner = document.getElementById("banner-humo");
  const texto = document.getElementById("banner-humo-texto");

  if (!data || data.estado !== "ok") {
    banner.hidden = true;
    return;
  }

  const relevante = ["moderado", "alto"];
  if (relevante.includes(data.nivel_actual)) {
    texto.textContent = `🔥 ${TEXTO_NIVEL_HUMO[data.nivel_actual]} ahora en Rosario${
      data.pronostico[0].zona_expuesta ? ", sobre todo en " + data.pronostico[0].zona_expuesta : ""
    }.`;
    banner.hidden = false;
    return;
  }

  if (data.proxima_ventana_riesgo) {
    const v = data.proxima_ventana_riesgo;
    texto.textContent = `🔥 Se espera humo de las islas desde las ${formatearHora(v.desde)}hs${
      v.zona_expuesta ? ", sobre todo en " + v.zona_expuesta : ""
    }.`;
    banner.hidden = false;
    return;
  }

  banner.hidden = true;
}

function pintarFocosCalorEnMapa(mostrar) {
  focosCalorMarcadores.forEach((m) => mapa.removeLayer(m));
  focosCalorMarcadores = [];

  if (!mostrar || !datosHumo || datosHumo.estado !== "ok") return;

  focosCalorMarcadores = datosHumo.focos.map((foco) =>
    L.circleMarker([foco.lat, foco.lng], {
      radius: 6,
      color: "#ffffff",
      weight: 1,
      fillColor: "#ff5722",
      fillOpacity: 0.85
    })
      .addTo(mapa)
      .bindTooltip(
        `🔥 Foco de calor · ${foco.fecha} · confianza: ${foco.confianza} · FRP: ${foco.frp} · ${foco.fuente}`
      )
  );
}

function initAlertaHumo() {
  document.getElementById("toggle-focos-calor").addEventListener("change", (ev) => {
    pintarFocosCalorEnMapa(ev.target.checked);
  });

  document.getElementById("banner-humo-ver").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="humo"]').click();
  });
}

// ---- Río y playas ----
// Ver backend/src/lib/rio.js (altura del río, scrapeada de Prefectura Naval)
// y backend/src/lib/balnearios.js (semaforo cargado a mano, sin fuente
// automatica publica).

const TEXTO_NIVEL_RIESGO_RIO = {
  normal: "Nivel normal",
  alerta: "Nivel de alerta",
  evacuacion: "Nivel de evacuación"
};

async function cargarRio() {
  const cont = document.getElementById("rio-contenido");
  try {
    const res = await fetch(`${API_BASE}/rio`);
    const data = await res.json();
    pintarRio(data, cont);
  } catch (err) {
    console.error("No se pudo consultar la altura del río", err);
    pintarRio({ estado: "datos_no_disponibles", mensaje: "No se pudo conectar con el backend." }, cont);
  }
}

function pintarRio(data, cont) {
  if (!data || data.estado !== "ok") {
    cont.innerHTML = `<div class="humo-sin-datos"><p>${
      (data && data.mensaje) || "No hay datos disponibles en este momento."
    }</p></div>`;
    return;
  }

  const claseRiesgo = data.nivel_riesgo !== "normal" ? ` rio-card--${data.nivel_riesgo}` : "";

  cont.innerHTML = `
    <div class="rio-card${claseRiesgo}">
      <div>
        <div class="rio-card__nivel">${data.nivel_m.toFixed(2)} m</div>
        <div class="rio-card__tendencia">${data.estado_icono} ${data.estado_texto}</div>
      </div>
      <div class="rio-card__meta">
        <p>${TEXTO_NIVEL_RIESGO_RIO[data.nivel_riesgo] || ""}</p>
        <p>Alerta: ${data.alerta_m} m · Evacuación: ${data.evacuacion_m} m</p>
        <p>Medición anterior: ${data.registro_anterior_m} m</p>
        <p>Fecha/hora: ${data.fecha_hora}</p>
        <p>Fuente: ${data.fuente}</p>
      </div>
    </div>
  `;
}

let mapaBalnearios;

async function cargarBalnearios() {
  const cont = document.getElementById("balnearios-contenido");
  try {
    const res = await fetch(`${API_BASE}/balnearios`);
    const data = await res.json();
    pintarBalnearios(data, cont);
  } catch (err) {
    console.error("No se pudieron consultar los balnearios", err);
    cont.innerHTML = '<p class="panel__loading">No se pudo conectar con el backend.</p>';
  }
}

// La aptitud de un balneario usa el mismo semaforo visual (verde/amarillo/
// rojo/sin_datos) que los puntos de agua, para que se lea igual en toda la app.
const NIVEL_EQUIVALENTE_APTITUD = {
  apta: "verde",
  evitar_contacto: "amarillo",
  no_apta: "rojo",
  sin_datos: "sin_datos"
};

function pintarBalnearios(data, cont) {
  const balnearios = data.balnearios || [];

  cont.innerHTML = `
    <p class="rio-playas__disclaimer">Última actualización de este estado: ${data.fecha_actualizacion}</p>
    ${balnearios
      .map((b) => {
        const nivel = NIVEL_EQUIVALENTE_APTITUD[b.aptitud] || "sin_datos";
        return `
      <div class="balneario-card">
        <span class="detalle-badge badge--${nivel}">${textoNivel(nivel)}</span>
        <p class="balneario-card__nombre">${b.nombre}</p>
        <p class="balneario-card__descripcion">${b.descripcion}</p>
        <p class="balneario-card__descripcion"><em>${b.mensaje_aptitud}</em></p>
        <p class="balneario-card__fuente">
          <a href="${b.referencia}" target="_blank" rel="noopener">Más info en rosario.gob.ar ↗</a>
        </p>
      </div>
    `;
      })
      .join("")}
  `;

  if (mapaBalnearios) {
    balnearios
      .filter((b) => typeof b.lat === "number" && typeof b.lng === "number")
      .forEach((b) => {
        L.marker([b.lat, b.lng]).addTo(mapaBalnearios).bindTooltip(b.nombre);
      });
  }
}

function initRioPlayas() {
  mapaBalnearios = L.map("mapa-balnearios", { scrollWheelZoom: false }).setView([-32.9, -60.65], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18
  }).addTo(mapaBalnearios);
}

function initTabs() {
  const botones = [...document.querySelectorAll(".tab-btn")];
  const paneles = [...document.querySelectorAll(".tab-panel")];

  botones.forEach((boton) => {
    boton.addEventListener("click", () => {
      const tab = boton.dataset.tab;

      botones.forEach((b) => b.classList.toggle("is-active", b === boton));
      paneles.forEach((p) => {
        p.hidden = p.dataset.tabPanel !== tab;
      });

      // Los mapas de Leaflet calculan su tamaño con el contenedor visible; si
      // se inicializaron (o quedaron) ocultos por una pestaña, hay que refrescarlos.
      setTimeout(() => {
        if (tab === "agua" && mapa) mapa.invalidateSize();
        if (tab === "reportes") {
          if (mapaSintoma && !document.getElementById("form-sintoma").hidden) {
            mapaSintoma.mapaChico.invalidateSize();
          }
          if (mapaBruma && !document.getElementById("form-bruma").hidden) {
            mapaBruma.mapaChico.invalidateSize();
          }
          if (mapaExpediente) mapaExpediente.mapaChico.invalidateSize();
        }
        if (tab === "riesgo" && mapaRiesgo) mapaRiesgo.mapaChico.invalidateSize();
        if (tab === "rio" && mapaBalnearios) mapaBalnearios.invalidateSize();
      }, 0);
    });
  });
}

// ---- Botón "Recibí alertas en Telegram" ----
// Se esconde solo si el bot no esta configurado en el backend
// (TELEGRAM_BOT_TOKEN/TELEGRAM_BOT_USERNAME), ver backend/src/lib/bot.js.
async function cargarTelegramCta() {
  try {
    const res = await fetch(`${API_BASE}/telegram/info`);
    const data = await res.json();
    if (data.disponible && data.usuario) {
      document.getElementById("telegram-cta-link").href = `https://t.me/${data.usuario}`;
      document.getElementById("telegram-cta").hidden = false;
    }
  } catch (err) {
    console.error("No se pudo consultar el estado del bot de Telegram", err);
  }
}

initMapa();
initFiltro();
initReportesCiudadanos();
initExpediente();
initRiesgoRespiratorio();
initReciclaje();
initAlertaHumo();
initRioPlayas();
initTabs();
cargarDatos();
cargarReportes();
cargarTelegramCta();
cargarHumo();
cargarRio();
cargarBalnearios();
