const {
  obtenerCalidadAire,
  nivelDesdeConcentracion,
  peorNivel,
  UMBRALES_PM25,
  UMBRALES_PM10,
  _resetCache
} = require("./aire");

beforeEach(() => {
  _resetCache();
});

describe("nivelDesdeConcentracion", () => {
  test("PM2.5 dentro del rango 'buena'", () => {
    expect(nivelDesdeConcentracion(5, UMBRALES_PM25)).toBe("buena");
    expect(nivelDesdeConcentracion(12, UMBRALES_PM25)).toBe("buena");
  });

  test("PM2.5 'moderada'", () => {
    expect(nivelDesdeConcentracion(12.1, UMBRALES_PM25)).toBe("moderada");
    expect(nivelDesdeConcentracion(35.4, UMBRALES_PM25)).toBe("moderada");
  });

  test("PM2.5 'mala'", () => {
    expect(nivelDesdeConcentracion(35.5, UMBRALES_PM25)).toBe("mala");
    expect(nivelDesdeConcentracion(200, UMBRALES_PM25)).toBe("mala");
  });

  test("PM10 usa sus propios umbrales", () => {
    expect(nivelDesdeConcentracion(50, UMBRALES_PM10)).toBe("buena");
    expect(nivelDesdeConcentracion(100, UMBRALES_PM10)).toBe("moderada");
    expect(nivelDesdeConcentracion(200, UMBRALES_PM10)).toBe("mala");
  });

  test("valor no numerico da null", () => {
    expect(nivelDesdeConcentracion(null, UMBRALES_PM25)).toBeNull();
    expect(nivelDesdeConcentracion(undefined, UMBRALES_PM25)).toBeNull();
  });
});

describe("peorNivel", () => {
  test("devuelve el peor de los dos", () => {
    expect(peorNivel("buena", "mala")).toBe("mala");
    expect(peorNivel("moderada", "buena")).toBe("moderada");
    expect(peorNivel("mala", "mala")).toBe("mala");
  });

  test("si falta uno, devuelve el otro", () => {
    expect(peorNivel(null, "moderada")).toBe("moderada");
    expect(peorNivel("buena", null)).toBe("buena");
  });

  test("si faltan los dos, devuelve null", () => {
    expect(peorNivel(null, null)).toBeNull();
  });
});

describe("obtenerCalidadAire", () => {
  let fetchOriginal;

  beforeEach(() => {
    fetchOriginal = global.fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  const respuestaValida = {
    hourly: {
      time: ["2026-09-25T00:00", "2026-09-25T01:00"],
      pm2_5: [5, 50],
      pm10: [10, 60]
    }
  };

  test("arma el pronostico con nivel general por hora", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(respuestaValida) }));
    const data = await obtenerCalidadAire();
    expect(data.estado).toBe("ok");
    expect(data.pronostico).toHaveLength(2);
    expect(data.pronostico[0].nivel).toBe("buena");
    expect(data.pronostico[1].nivel).toBe("mala"); // pm2_5=50 -> mala aunque pm10=60 sea moderada
    expect(data.nivel_actual).toBe("buena");
  });

  test("responde datos_no_disponibles si la API falla", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve("limite") }));
    const data = await obtenerCalidadAire();
    expect(data.estado).toBe("datos_no_disponibles");
    expect(data.mensaje).toMatch(/429/);
  });

  test("usa la cache en llamadas subsiguientes", async () => {
    const mockFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(respuestaValida) }));
    global.fetch = mockFetch;
    await obtenerCalidadAire();
    await obtenerCalidadAire();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("forzarActualizacion ignora la cache", async () => {
    const mockFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(respuestaValida) }));
    global.fetch = mockFetch;
    await obtenerCalidadAire();
    await obtenerCalidadAire({ forzarActualizacion: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
