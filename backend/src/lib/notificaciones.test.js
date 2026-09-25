const { calcularEstadoActual, calcularNotificaciones, puntoAguaMasCercano } = require("./notificaciones");

const ZONA_BASE = { nombre: "casa", lat: -32.9, lng: -60.6 };

describe("puntoAguaMasCercano", () => {
  const puntos = [
    { id: "lejos", lat: -33.5, lng: -61.2, nivel_alerta: "rojo" },
    { id: "cerca", lat: -32.901, lng: -60.601, nivel_alerta: "verde" }
  ];

  test("encuentra el punto dentro del radio", () => {
    const p = puntoAguaMasCercano(ZONA_BASE, puntos);
    expect(p.id).toBe("cerca");
  });

  test("devuelve null si no hay ninguno dentro del radio", () => {
    const soloLejos = [puntos[0]];
    expect(puntoAguaMasCercano(ZONA_BASE, soloLejos)).toBeNull();
  });
});

describe("calcularEstadoActual", () => {
  test("arma el estado combinando todas las fuentes", () => {
    const estado = calcularEstadoActual(ZONA_BASE, {
      nivelHumo: "alto",
      puntosAgua: [{ id: "p1", lat: -32.901, lng: -60.601, nombre: "Punto 1", nivel_alerta: "rojo" }],
      balnearios: [{ id: "la-florida", aptitud: "sin_datos" }],
      hayReportesAlerta: true
    });
    expect(estado).toEqual({
      humo_nivel: "alto",
      punto_cercano_id: "p1",
      punto_cercano_nombre: "Punto 1",
      punto_cercano_nivel: "rojo",
      reportes_alerta: true,
      balnearios: { "la-florida": "sin_datos" }
    });
  });

  test("humo_nivel por defecto es sin_riesgo si no se provee", () => {
    const estado = calcularEstadoActual(ZONA_BASE, { puntosAgua: [], balnearios: [] });
    expect(estado.humo_nivel).toBe("sin_riesgo");
  });
});

describe("calcularNotificaciones", () => {
  test("no notifica nada en el primer chequeo de una zona nueva", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: {} };
    const estado = calcularEstadoActual(zona, { nivelHumo: "alto", puntosAgua: [], balnearios: [] });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes).toHaveLength(0);
  });

  test("notifica cuando el humo sube a moderado/alto desde un nivel mas bajo", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { humo_nivel: "bajo" } };
    const estado = calcularEstadoActual(zona, { nivelHumo: "alto", puntosAgua: [], balnearios: [] });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("humo"))).toBe(true);
  });

  test("no notifica de nuevo si el humo se mantiene en el mismo nivel de riesgo", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { humo_nivel: "alto" } };
    const estado = calcularEstadoActual(zona, { nivelHumo: "alto", puntosAgua: [], balnearios: [] });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("humo"))).toBe(false);
  });

  test("no notifica humo si el nivel es bajo/sin_riesgo aunque cambie", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { humo_nivel: "sin_riesgo" } };
    const estado = calcularEstadoActual(zona, { nivelHumo: "bajo", puntosAgua: [], balnearios: [] });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("humo"))).toBe(false);
  });

  test("notifica cuando cambia el nivel del punto de agua mas cercano", () => {
    const zona = {
      ...ZONA_BASE,
      estadoNotificado: { punto_cercano_id: "p1", punto_cercano_nivel: "verde" }
    };
    const estado = calcularEstadoActual(zona, {
      puntosAgua: [{ id: "p1", lat: -32.901, lng: -60.601, nombre: "Punto 1", nivel_alerta: "rojo" }],
      balnearios: []
    });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("Punto 1"))).toBe(true);
  });

  test("notifica cuando aparecen reportes confirmados en alerta (de false a true)", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { reportes_alerta: false } };
    const estado = calcularEstadoActual(zona, { puntosAgua: [], balnearios: [], hayReportesAlerta: true });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("reportes ciudadanos"))).toBe(true);
  });

  test("no notifica reportes si ya estaba en alerta antes (sin cambio)", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { reportes_alerta: true } };
    const estado = calcularEstadoActual(zona, { puntosAgua: [], balnearios: [], hayReportesAlerta: true });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("reportes ciudadanos"))).toBe(false);
  });

  test("notifica cuando cambia el estado de un balneario ya conocido", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { balnearios: { "la-florida": "sin_datos" } } };
    const estado = calcularEstadoActual(zona, {
      puntosAgua: [],
      balnearios: [{ id: "la-florida", aptitud: "no_apta" }]
    });
    const { mensajes } = calcularNotificaciones(zona, estado);
    expect(mensajes.some((m) => m.includes("la-florida"))).toBe(true);
  });

  test("nuevoEstado siempre refleja el estado actual, incluso sin mensajes", () => {
    const zona = { ...ZONA_BASE, estadoNotificado: { humo_nivel: "alto" } };
    const estado = calcularEstadoActual(zona, { nivelHumo: "alto", puntosAgua: [], balnearios: [] });
    const { nuevoEstado } = calcularNotificaciones(zona, estado);
    expect(nuevoEstado).toEqual(estado);
  });
});
