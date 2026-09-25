const {
  generarExpediente,
  contarVecinos,
  agruparSintomas,
  resumenBruma,
  puntosAguaEnAlertaCerca,
  UMBRAL_EXPEDIENTE_PESO
} = require("./expediente");
const { crearReporte, confirmarReporte, _reset: resetReportes } = require("./reportes");

const LAT = -32.9;
const LNG = -60.6;

beforeEach(() => {
  resetReportes();
  delete process.env.FIRMS_MAP_KEY; // sin key, obtenerAlertaHumo no pega a la red
});

describe("contarVecinos", () => {
  test("cuenta el creador de cada reporte", () => {
    const reportes = [{ dispositivo_id: "d1", confirmaciones: [] }, { dispositivo_id: "d2", confirmaciones: [] }];
    expect(contarVecinos(reportes)).toBe(2);
  });

  test("suma confirmadores distintos sin duplicar", () => {
    const reportes = [
      { dispositivo_id: "d1", confirmaciones: ["d2", "d3"] },
      { dispositivo_id: "d2", confirmaciones: ["d1"] } // d1 y d2 ya contados
    ];
    expect(contarVecinos(reportes)).toBe(3); // d1, d2, d3
  });
});

describe("agruparSintomas", () => {
  test("cuenta ocurrencias por sintoma, ignorando reportes de bruma", () => {
    const reportes = [
      { tipo: "sintoma", sintomas: ["tos", "ardor_ojos"] },
      { tipo: "sintoma", sintomas: ["tos"] },
      { tipo: "bruma", sintomas: [] }
    ];
    expect(agruparSintomas(reportes)).toEqual({ tos: 2, ardor_ojos: 1 });
  });
});

describe("resumenBruma", () => {
  test("null si no hay reportes de bruma", () => {
    expect(resumenBruma([{ tipo: "sintoma" }])).toBeNull();
  });

  test("promedia el puntaje de bruma", () => {
    const reportes = [
      { tipo: "bruma", bruma_estimada: 40 },
      { tipo: "bruma", bruma_estimada: 60 }
    ];
    expect(resumenBruma(reportes)).toEqual({ cantidad: 2, promedio_estimado: 50 });
  });
});

describe("puntosAguaEnAlertaCerca", () => {
  test("devuelve un array (sin tirar error) usando el dataset real", () => {
    const puntos = puntosAguaEnAlertaCerca(-32.91, -60.7, 5);
    expect(Array.isArray(puntos)).toBe(true);
    puntos.forEach((p) => {
      expect(["amarillo", "rojo"]).toContain(p.nivel_alerta);
    });
  });
});

describe("generarExpediente", () => {
  test("no elegible sin suficientes reportes", async () => {
    crearReporte({ tipo: "sintoma", lat: LAT, lng: LNG, sintomas: ["tos"], dispositivo_id: "d1" });
    const exp = await generarExpediente(LAT, LNG);
    expect(exp.elegible).toBe(false);
    expect(exp.umbral).toBe(UMBRAL_EXPEDIENTE_PESO);
  });

  test("elegible cuando el peso acumulado supera el umbral", async () => {
    // 5 confirmados por 2 vecinos c/u: peso 1.5 * 5 = 7.5 >= 5
    for (let i = 0; i < 5; i++) {
      const r = crearReporte({
        tipo: "sintoma",
        lat: LAT + i * 0.0001,
        lng: LNG,
        sintomas: ["tos"],
        dispositivo_id: `creador-${i}`
      });
      confirmarReporte(r.id, `confirmador-${i}-a`);
      confirmarReporte(r.id, `confirmador-${i}-b`);
    }
    const exp = await generarExpediente(LAT, LNG);
    expect(exp.elegible).toBe(true);
    expect(exp.total_reportes).toBe(5);
    expect(exp.reportes_confirmados).toBe(5);
    expect(exp.vecinos_involucrados).toBe(15); // 5 creadores + 10 confirmadores
    expect(exp.sintomas).toEqual({ tos: 5 });
  });

  test("incluye el resumen de humo (sin key configurada -> datos_no_disponibles)", async () => {
    const exp = await generarExpediente(LAT, LNG);
    expect(exp.humo.estado).toBe("datos_no_disponibles");
  });

  test("periodo desde/hasta es null sin reportes", async () => {
    const exp = await generarExpediente(LAT, LNG);
    expect(exp.periodo.desde).toBeNull();
    expect(exp.periodo.hasta).toBeNull();
  });

  test("periodo desde/hasta refleja las fechas de los reportes", async () => {
    const hace2hs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    crearReporte({ tipo: "sintoma", lat: LAT, lng: LNG, sintomas: ["tos"], dispositivo_id: "d1", fecha: hace2hs });
    crearReporte({ tipo: "sintoma", lat: LAT, lng: LNG, sintomas: ["tos"], dispositivo_id: "d2" });
    const exp = await generarExpediente(LAT, LNG);
    expect(new Date(exp.periodo.desde).getTime()).toBeLessThan(new Date(exp.periodo.hasta).getTime());
  });
});
