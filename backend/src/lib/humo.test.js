const {
  rumboInicial,
  diferenciaAngular,
  direccionTransporte,
  distanciaKm,
  pasaConfianzaMinima,
  parseCsvFirms,
  pesoFoco,
  factorViento,
  nivelDesdeScore,
  zonaExpuesta,
  calcularPronosticoHumo,
  proximaVentanaRiesgo,
  obtenerAlertaHumo,
  REFERENCIA_CIUDAD,
  _resetCache
} = require("./humo");

beforeEach(() => {
  _resetCache();
  delete process.env.FIRMS_MAP_KEY;
});

describe("direccionTransporte", () => {
  test("el humo viaja opuesto a de donde viene el viento", () => {
    expect(direccionTransporte(0)).toBe(180); // viento del norte -> transporte hacia el sur
    expect(direccionTransporte(90)).toBe(270); // viento del este -> transporte hacia el oeste
    expect(direccionTransporte(270)).toBe(90);
  });
});

describe("diferenciaAngular", () => {
  test("diferencia simple", () => {
    expect(diferenciaAngular(10, 20)).toBe(10);
  });
  test("maneja el cruce por 0/360", () => {
    expect(diferenciaAngular(350, 10)).toBe(20);
  });
  test("direcciones opuestas dan 180", () => {
    expect(diferenciaAngular(0, 180)).toBe(180);
  });
});

describe("rumboInicial y distanciaKm", () => {
  test("un punto al norte tiene rumbo ~0", () => {
    const rumbo = rumboInicial(-33, -60.68, -32, -60.68);
    expect(rumbo).toBeLessThan(1);
  });
  test("un punto al este tiene rumbo ~90", () => {
    const rumbo = rumboInicial(-32.925, -61, -32.925, -60);
    expect(rumbo).toBeGreaterThan(85);
    expect(rumbo).toBeLessThan(95);
  });
  test("distancia cero entre el mismo punto", () => {
    expect(distanciaKm(-32.9, -60.6, -32.9, -60.6)).toBe(0);
  });
});

describe("pasaConfianzaMinima", () => {
  test("VIIRS: descarta 'l' (low)", () => {
    expect(pasaConfianzaMinima("l")).toBe(false);
  });
  test("VIIRS: acepta 'n' y 'h'", () => {
    expect(pasaConfianzaMinima("n")).toBe(true);
    expect(pasaConfianzaMinima("h")).toBe(true);
  });
  test("MODIS: descarta menor a 50", () => {
    expect(pasaConfianzaMinima("30")).toBe(false);
  });
  test("MODIS: acepta 50 o mas", () => {
    expect(pasaConfianzaMinima("75")).toBe(true);
  });
});

describe("parseCsvFirms", () => {
  const csvValido = [
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
    "-32.80,-60.40,320.1,0.4,0.4,2026-09-24,1745,N,VIIRS,n,2.0NRT,290.1,12.5,D",
    "-32.85,-60.35,300.0,0.4,0.4,2026-09-24,52,N,VIIRS,l,2.0NRT,280.0,2.1,N"
  ].join("\n");

  test("parsea filas validas y descarta confianza baja", () => {
    const focos = parseCsvFirms(csvValido, "VIIRS_SNPP_NRT");
    expect(focos).toHaveLength(1);
    expect(focos[0].lat).toBeCloseTo(-32.8);
    expect(focos[0].confianza).toBe("n");
  });

  test("rellena acq_time con ceros a la izquierda (52 -> 00:52Z)", () => {
    // Se prueba indirectamente con un CSV donde el unico foco valido tiene acq_time corto
    const csv = [
      "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
      "-32.80,-60.40,320.1,0.4,0.4,2026-09-24,52,N,VIIRS,n,2.0NRT,290.1,12.5,D"
    ].join("\n");
    const focos = parseCsvFirms(csv, "VIIRS_SNPP_NRT");
    expect(focos[0].fecha).toBe("2026-09-24T00:52:00Z");
  });

  test("devuelve null ante un mensaje de error en vez de CSV (key invalida)", () => {
    expect(parseCsvFirms("Invalid MAP_KEY.", "VIIRS_SNPP_NRT")).toBeNull();
  });

  test("devuelve null con texto vacio", () => {
    expect(parseCsvFirms("", "VIIRS_SNPP_NRT")).toBeNull();
  });
});

describe("pesoFoco y factorViento", () => {
  test("un foco mas centrado en el cono pesa mas que uno en el borde", () => {
    const centrado = pesoFoco(0, 20, 30);
    const borde = pesoFoco(30, 20, 30);
    expect(centrado).toBeGreaterThan(borde);
  });
  test("un foco mas cercano pesa mas que uno lejano", () => {
    const cerca = pesoFoco(0, 10, 30);
    const lejos = pesoFoco(0, 100, 30);
    expect(cerca).toBeGreaterThan(lejos);
  });
  test("viento debil pesa menos que viento en rango medio", () => {
    expect(factorViento(3)).toBeLessThan(factorViento(15));
  });
  test("viento muy fuerte pesa menos que viento en rango medio", () => {
    expect(factorViento(50)).toBeLessThan(factorViento(15));
  });
});

describe("nivelDesdeScore", () => {
  test.each([
    [0, "sin_riesgo"],
    [9, "sin_riesgo"],
    [10, "bajo"],
    [29, "bajo"],
    [30, "moderado"],
    [59, "moderado"],
    [60, "alto"],
    [100, "alto"]
  ])("score %i -> %s", (score, esperado) => {
    expect(nivelDesdeScore(score)).toBe(esperado);
  });
});

describe("zonaExpuesta", () => {
  test("focos al norte de la ciudad -> zona norte", () => {
    const focos = [{ foco: { lat: REFERENCIA_CIUDAD.lat + 0.2 } }];
    expect(zonaExpuesta(focos)).toMatch(/norte/);
  });
  test("focos al sur de la ciudad -> zona sur", () => {
    const focos = [{ foco: { lat: REFERENCIA_CIUDAD.lat - 0.2 } }];
    expect(zonaExpuesta(focos)).toMatch(/sur/);
  });
  test("sin focos alineados no hay zona", () => {
    expect(zonaExpuesta([])).toBeNull();
  });
});

describe("calcularPronosticoHumo", () => {
  test("foco alineado con el viento sube el nivel de esa hora", () => {
    // Foco cercano al este de la ciudad, viento del este (90) -> transporte
    // hacia el oeste (270), directo hacia la ciudad.
    const focos = [{ lat: REFERENCIA_CIUDAD.lat, lng: REFERENCIA_CIUDAD.lng + 0.15, frp: 80 }];
    const pronosticoViento = [{ hora: "2026-09-25T18:00", velocidad_kmh: 15, viento_desde_grados: 90 }];
    const resultado = calcularPronosticoHumo(focos, pronosticoViento, null);
    expect(resultado[0].focos_alineados).toBe(1);
    expect(resultado[0].nivel).not.toBe("sin_riesgo");
    expect(resultado[0].zona_expuesta).not.toBeNull();
  });

  test("foco en direccion opuesta al viento no genera riesgo", () => {
    // Mismo foco al este, pero viento del oeste -> transporte hacia el este,
    // alejandose de la ciudad en vez de acercandose.
    const focos = [{ lat: REFERENCIA_CIUDAD.lat, lng: REFERENCIA_CIUDAD.lng + 1, frp: 80 }];
    const pronosticoViento = [{ hora: "2026-09-25T18:00", velocidad_kmh: 15, viento_desde_grados: 270 }];
    const resultado = calcularPronosticoHumo(focos, pronosticoViento, null);
    expect(resultado[0].focos_alineados).toBe(0);
    expect(resultado[0].nivel).toBe("sin_riesgo");
  });

  test("sin focos, sin riesgo en ninguna hora", () => {
    const pronosticoViento = [
      { hora: "2026-09-25T18:00", velocidad_kmh: 15, viento_desde_grados: 90 },
      { hora: "2026-09-25T19:00", velocidad_kmh: 15, viento_desde_grados: 90 }
    ];
    const resultado = calcularPronosticoHumo([], pronosticoViento, null);
    expect(resultado.every((h) => h.nivel === "sin_riesgo")).toBe(true);
  });

  test("adjunta pm2_5 cuando se provee el mapa", () => {
    const pronosticoViento = [{ hora: "2026-09-25T18:00", velocidad_kmh: 15, viento_desde_grados: 90 }];
    const resultado = calcularPronosticoHumo([], pronosticoViento, { "2026-09-25T18:00": 42 });
    expect(resultado[0].pm2_5).toBe(42);
  });
});

describe("proximaVentanaRiesgo", () => {
  test("encuentra el primer tramo contiguo de riesgo moderado/alto", () => {
    const pronostico = [
      { hora: "h0", nivel: "sin_riesgo" },
      { hora: "h1", nivel: "bajo" },
      { hora: "h2", nivel: "moderado", zona_expuesta: "zona norte" },
      { hora: "h3", nivel: "alto", zona_expuesta: "zona norte" },
      { hora: "h4", nivel: "bajo" }
    ];
    const ventana = proximaVentanaRiesgo(pronostico);
    expect(ventana).toEqual({ desde: "h2", hasta: "h3", nivel_max: "alto", zona_expuesta: "zona norte" });
  });

  test("null si no hay ninguna hora en riesgo", () => {
    const pronostico = [{ hora: "h0", nivel: "sin_riesgo" }, { hora: "h1", nivel: "bajo" }];
    expect(proximaVentanaRiesgo(pronostico)).toBeNull();
  });
});

describe("obtenerAlertaHumo - sin FIRMS_MAP_KEY", () => {
  test("responde datos_no_disponibles sin romper", async () => {
    const data = await obtenerAlertaHumo();
    expect(data.estado).toBe("datos_no_disponibles");
    expect(data.mensaje).toMatch(/FIRMS_MAP_KEY/);
  });
});

describe("obtenerAlertaHumo - con key, mockeando fetch", () => {
  const csvFocoAlineado =
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n" +
    `${REFERENCIA_CIUDAD.lat},${REFERENCIA_CIUDAD.lng + 0.15},320,0.4,0.4,2026-09-24,1200,N,VIIRS,n,2.0NRT,290,80,D`;

  const vientoJson = {
    hourly: {
      time: ["2026-09-25T00:00"],
      wind_speed_10m: [15],
      wind_direction_10m: [90]
    }
  };

  let fetchOriginal;

  beforeEach(() => {
    process.env.FIRMS_MAP_KEY = "clave-de-prueba";
    fetchOriginal = global.fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  test("arma el pronostico combinando FIRMS y el viento", async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes("firms.modaps")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(csvFocoAlineado) });
      }
      if (String(url).includes("air-quality-api")) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(vientoJson) });
    });

    const data = await obtenerAlertaHumo();
    expect(data.estado).toBe("ok");
    expect(data.focos.length).toBeGreaterThan(0);
    expect(data.pronostico).toHaveLength(1);
    expect(data.nivel_actual).not.toBe("sin_riesgo");
  });

  test("si todas las fuentes FIRMS fallan, responde datos_no_disponibles", async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes("firms.modaps")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("Invalid MAP_KEY.") });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(vientoJson) });
    });

    const data = await obtenerAlertaHumo();
    expect(data.estado).toBe("datos_no_disponibles");
  });

  test("usa la cache en llamadas subsiguientes (no vuelve a llamar fetch)", async () => {
    const mockFetch = jest.fn((url) => {
      if (String(url).includes("firms.modaps")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(csvFocoAlineado) });
      }
      if (String(url).includes("air-quality-api")) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(vientoJson) });
    });
    global.fetch = mockFetch;

    await obtenerAlertaHumo();
    const llamadasPrimeraVez = mockFetch.mock.calls.length;
    await obtenerAlertaHumo();
    expect(mockFetch.mock.calls.length).toBe(llamadasPrimeraVez);
  });
});
