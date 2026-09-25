const {
  crearReporte,
  listarReportes,
  reportesCercanos,
  hayAlertaTemprana,
  haversineKm,
  _reset
} = require("./reportes");

beforeEach(() => {
  _reset();
});

describe("crearReporte - validaciones", () => {
  test("rechaza sin lat/lng", () => {
    expect(() => crearReporte({ tipo: "sintoma" })).toThrow();
  });

  test("rechaza tipo invalido", () => {
    expect(() => crearReporte({ tipo: "otro", lat: -32.9, lng: -60.6 })).toThrow();
  });

  test("crea un reporte de sintoma valido", () => {
    const r = crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    expect(r.id).toBeDefined();
    expect(r.tipo).toBe("sintoma");
    expect(r.sintomas).toEqual(["tos"]);
  });

  test("crea un reporte de bruma valido", () => {
    const r = crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 72 });
    expect(r.bruma_estimada).toBe(72);
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
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    crearReporte({ tipo: "sintoma", lat: -33.5, lng: -61.2, sintomas: ["tos"] }); // lejos
    const cercanos = reportesCercanos(-32.9, -60.6);
    expect(cercanos.length).toBe(1);
  });

  test("filtra por ventana de tiempo: un reporte viejo no cuenta", () => {
    const hace48hs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"], fecha: hace48hs });
    const cercanos = reportesCercanos(-32.9, -60.6);
    expect(cercanos.length).toBe(0);
  });
});

describe("hayAlertaTemprana", () => {
  test("no alerta con menos de 3 reportes de sintomas cerca", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(false);
  });

  test("alerta con 3 o mas reportes de sintomas cerca en la ventana", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    crearReporte({ tipo: "sintoma", lat: -32.9001, lng: -60.6001, sintomas: ["ardor_ojos"] });
    crearReporte({ tipo: "sintoma", lat: -32.8999, lng: -60.5999, sintomas: ["tos"] });
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(true);
  });

  test("los reportes de bruma no cuentan para la alerta de sintomas", () => {
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 90 });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 80 });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 70 });
    expect(hayAlertaTemprana(-32.9, -60.6)).toBe(false);
  });
});

describe("listarReportes", () => {
  test("devuelve todos los reportes creados", () => {
    crearReporte({ tipo: "sintoma", lat: -32.9, lng: -60.6, sintomas: ["tos"] });
    crearReporte({ tipo: "bruma", lat: -32.9, lng: -60.6, bruma_estimada: 50 });
    expect(listarReportes().length).toBe(2);
  });
});
