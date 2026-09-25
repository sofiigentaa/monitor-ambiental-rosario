// Monitor Hídrico Rosario - frontend
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

function pintarLista(puntos) {
  const cont = document.getElementById("lista-puntos");
  if (puntos.length === 0) {
    cont.innerHTML = '<p class="panel__loading">No hay puntos para ese barrio.</p>';
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

  cont.innerHTML = `
    <span class="detalle-badge badge--${punto.nivel_alerta}">${textoNivel(punto.nivel_alerta)}</span>
    <h2>${punto.nombre}</h2>
    <p>${punto.descripcion || ""}</p>
    <p><strong>Barrio aprox.:</strong> ${punto.barrio_aprox || "-"} · <strong>Distrito:</strong> ${punto.distrito || "-"}</p>
    ${m ? `<p><strong>Última medición:</strong> ${m.fecha}</p>` : ""}
    <p><em>${punto.mensaje_alerta || ""}</em></p>
    ${params}
    ${m && m.observacion_campo ? `<p><strong>Observación de campo:</strong> ${m.observacion_campo}</p>` : ""}
  `;

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
    pintarMarcadores(todosLosPuntos);
    pintarLista(todosLosPuntos);
    pintarResumen(dataResumen.resumen, todosLosPuntos);
  } catch (err) {
    document.getElementById("lista-puntos").innerHTML =
      '<p class="panel__loading">No se pudo conectar con el backend. ¿Está corriendo en el puerto 3001?</p>';
    console.error(err);
  }
}

function initFiltro() {
  const input = document.getElementById("filtro-barrio");
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    const filtrados = todosLosPuntos.filter((p) =>
      (p.barrio_aprox || "").toLowerCase().includes(q) ||
      (p.nombre || "").toLowerCase().includes(q)
    );
    pintarLista(filtrados);
    pintarMarcadores(filtrados);
  });
}

document.getElementById("detalle-cerrar").addEventListener("click", () => {
  document.getElementById("detalle").hidden = true;
});

initMapa();
initFiltro();
cargarDatos();
