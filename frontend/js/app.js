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
    .map(
      (p) => `
      <div class="punto-item" data-id="${p.id}">
        <span class="punto-item__dot dot--${p.nivel_alerta}"></span>
        <div>
          <p class="punto-item__nombre">${p.nombre}</p>
          <p class="punto-item__meta">${p.barrio_aprox || ""}${
        p.ultima_medicion ? " · " + p.ultima_medicion.fecha : ""
      }</p>
        </div>
      </div>
    `
    )
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
  return [
    `Reclamo ambiental - Monitor Ambiental Rosario`,
    `Fecha: ${new Date().toLocaleString("es-AR")}`,
    `Punto: ${punto.nombre}`,
    `Ubicación (lat, lng): ${punto.lat}, ${punto.lng}`,
    `Barrio aprox.: ${punto.barrio_aprox || "-"}`,
    `Nivel de alerta actual: ${textoNivel(punto.nivel_alerta)}`,
    punto.ultima_medicion ? `Última medición oficial: ${punto.ultima_medicion.fecha}` : null,
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
  const m = punto.ultima_medicion;

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

  seccion.hidden = false;
  seccion.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

function pintarReportesEnMapa(reportes) {
  reportesMarcadores.forEach((m) => mapa.removeLayer(m));
  reportesMarcadores = reportes.map((r) => {
    if (r.tipo === "bruma") {
      const intensidad = (r.bruma_estimada || 0) / 100;
      return L.circleMarker([r.lat, r.lng], {
        radius: 8 + intensidad * 6,
        color: "#8b5e34",
        weight: 1,
        fillColor: "#c9a26a",
        fillOpacity: 0.3 + intensidad * 0.4
      })
        .addTo(mapa)
        .bindTooltip(`Bruma estimada (foto, no oficial): ${r.bruma_estimada}/100`);
    }
    return L.circleMarker([r.lat, r.lng], {
      radius: 7,
      color: "#e67e22",
      weight: 1,
      fillColor: "#f39c12",
      fillOpacity: 0.6
    })
      .addTo(mapa)
      .bindTooltip(`Síntomas reportados: ${(r.sintomas || []).join(", ") || "sin detalle"}`);
  });
}

async function enviarReporte(payload) {
  try {
    const res = await fetch(`${API_BASE}/reportes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("No se pudo enviar el reporte");
    const reporte = await res.json();
    mostrarConfirmacionReporte(reporte);
    await cargarReportes();
    return reporte;
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

  // Componente de humo por quemas en las islas (pronostico, no reporte
  // ciudadano): usa la hora "actual" del pronostico de /api/humo si esta
  // disponible. Se suma con menos peso que los reportes porque es un dato
  // de ciudad entera, no hiperlocal como los reportes cercanos al punto.
  const horaHumoActual =
    datosHumo && datosHumo.estado === "ok" && datosHumo.pronostico.length ? datosHumo.pronostico[0] : null;
  const puntajeHumo = horaHumoActual ? horaHumoActual.score : 0;

  const puntajeReportes = sintomas.length * 15 + brumaProm * 0.5;
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
      Basado en ${sintomas.length} reporte(s) de síntomas y ${brumas.length} reporte(s) de bruma
      en un radio de ${radioKm * 1000}m en las últimas 24hs${detalleHumo}. Esto es un indicador
      comunitario, no una medición oficial de calidad de aire ni un diagnóstico médico.
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
        }
        if (tab === "riesgo" && mapaRiesgo) mapaRiesgo.mapaChico.invalidateSize();
      }, 0);
    });
  });
}

initMapa();
initFiltro();
initReportesCiudadanos();
initRiesgoRespiratorio();
initReciclaje();
initAlertaHumo();
initTabs();
cargarDatos();
cargarReportes();
cargarHumo();
