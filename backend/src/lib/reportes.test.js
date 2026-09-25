const {
  crearReporte,
  confirmarReporte,
  pesoReporte,
  listarReportes,
  reportesCercanos,
  hayAlertaTemprana,
  superaLimiteReportes,
  RATE_LIMIT_MAX_REPORTES,
  haversineKm,
  _reset
} = require("./reportes");

beforeEach(() => {
  _reset();
});

describe("crearReporte - validaciones", () => {
  test("rechaza sin lat/lng", () => {
    expect(() => crearReporte({ tipo: "sintoma", dispositivo_id: "d1" })).toThrow();
  });

  test("rechaza tipo invalido", () => {
    expect(() => crearReporte({ tipo: "otro", lat: -32.9, lng: -60.6, dispositivo_id: "d1" })).toThrow();
  });

  test("rechaza sin dispositivo_id", () => {
    expect(() => crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6 })).toThrow();
  });

  test("crea un reporte de sintoma valido", () => {
    const r = crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    expect(r.id).toBeDefined();
    expect(r.tipo).toBe("sintoma");
    expect(r.sintomas).toEqual(["tos"]);
    expect(r.confirmaciones).toEqual([]);
  });

  test("crea un reporte de bruma valido", () => {
    const r = crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 72, dispositivo_id: "d1" });
    expect(r.bruma_estimada).toBe(72);
  });
});

describe("crearReporte - limite de envios por dispositivo", () => {
  test("permite hasta el limite configurado por hora", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTES; i++) {
      expect(() =>
        crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" })
      ).not.toThrow();
    }
  });

  test("rechaza el envio que supera el limite", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTES; i++) {
      crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    }
    expect(() =>
      crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" })
    ).toThrow(/limite/);
  });

  test("el limite es por dispositivo: otro dispositivo no se ve afectado", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTES; i++) {
      crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    }
    expect(() =>
      crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d2" })
    ).not.toThrow();
  });

  test("superaLimiteReportes refleja el estado sin crear un reporte", () => {
    expect(superaLimiteReportes("d1")).toBe(false);
    for (let i = 0; i < RATE_LIMIT_MAX_REPORTES; i++) {
      crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    }
    expect(superaLimiteReportes("d1")).toBe(true);
  });
});

describe("confirmarReporte", () => {
  test("otro dispositivo puede confirmar un reporte", () => {
    const r = crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    const confirmado = confirmarReporte(r.id, "d2");
    expect(confirmado.confirmaciones).toEqual(["d2"]);
  });

  test("no se puede confirmar el propio reporte", () => {
    const r = crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    expect(() => confirmarReporte(r.id, "d1")).toThrow(/propio/);
  });

  test("un mismo dispositivo no puede confirmar dos veces", () => {
    const r = crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    confirmarReporte(r.id, "d2");
    expect(() => confirmarReporte(r.id, "d2")).toThrow(/Ya confirmaste/);
  });

  test("devuelve null si el reporte no existe", () => {
    expect(confirmarReporte(9999, "d2")).toBeNull();
  });
});

describe("pesoReporte", () => {
  test("un reporte sin confirmar pesa la mitad", () => {
    const r = { confirmaciones: [] };
    expect(pesoReporte(r)).toBe(0.5);
  });

  test("un reporte con una confirmacion pesa mas que uno sin confirmar", () => {
    const sinConfirmar = { confirmaciones: [] };
    const conUnaConfirmacion = { confirmaciones: ["d2"] };
    expect(pesoReporte(conUnaConfirmacion)).toBeGreaterThan(pesoReporte(sinConfirmar));
  });

  test("el peso tiene un techo aunque haya muchas confirmaciones", () => {
    const muchas = { confirmaciones: Array.from({ length: 50 }, (_, i) => `d${i}`) };
    expect(pesoReporte(muchas)).toBeLessThanOrEqual(2);
  });
});

describe("haversineKm", () => {
  test("distancia cero entre el mismo punto", () => {
    expect(haversineKm(-32.9, -60.6, -32.9, -60.6)).toBe(0);
  });

  test("distancia razonable entre dos puntos cercanos de Rosario", () => {
    const d = haversineKm(-32.911, -60.6975, -32.9105, -60.699);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });
});

describe("reportesCercanos", () => {
  test("filtra por radio: un reporte lejano no cuenta", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    crearReporte({ tipo: "sintoma", lat: -33.5, lng: -61.2, sintomas: ["tos"], dispositivo_id: "d2" }); // lejos
    const cercanos = reportesCercanos(-32.9, -60.6);
    expect(cercanos.length).toBe(1);
  });

  test("filtra por ventana de tiempo: un reporte viejo no cuenta", () => {
    const hace48hs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    crearReporte({
      tipo: "sintoma",
      lat: -32.9,
      lng: -60.6,
      sintomas: ["tos"],
      fecha: hace48hs,
      dispositivo_id: "d1"
    });
    const cercanos = reportesCercanos(-32.9, -60.6);
    expect(cercanos.length).toBe(0);
  });
});

describe("hayAlertaTemprana", () => {
  test("no alerta con pocos reportes sin confirmar cerca", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d2" });
    // 2 reportes sin confirmar = peso 1.0, por debajo del umbral (3)
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(false);
  });

  test("alerta si el peso acumulado de reportes sin confirmar llega al umbral", () => {
    // 6 reportes sin confirmar = peso 3.0 (0.5 c/u), llega justo al umbral
    for (let i = 0; i < 6; i++) {
      crearReporte({
        tipo: "sintoma",
        lat: -32.9 + i * 0.0001,
        lng: -60.6,
        sintomas: ["tos"],
        dispositivo_id: `d${i}`
      });
    }
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(true);
  });

  test("reportes confirmados disparan la alerta con menos cantidad que sin confirmar", () => {
    // 3 reportes, cada uno confirmado por 1 vecino: peso 1.25 c/u = 3.75 >= 3
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = crearReporte({
        tipo: "sintoma",
        lat: -32.9 + i * 0.0001,
        lng: -60.6,
        sintomas: ["tos"],
        dispositivo_id: `d${i}`
      });
      ids.push(r.id);
    }
    ids.forEach((id, i) => confirmarReporte(id, `confirmador-${i}`));
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(true);
  });

  test("los reportes de bruma no cuentan para la alerta de sintomas", () => {
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 90, dispositivo_id: "d1" });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 80, dispositivo_id: "d2" });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 70, dispositivo_id: "d3" });
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(false);
  });
});

describe("listarReportes", () => {
  test("devuelve todos los reportes creados", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], dispositivo_id: "d1" });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 50, dispositivo_id: "d2" });
    expect(listarReportes().length).toBe(2);
  });
});
