const { evaluarUso, nivelAlertaDesdeUso, evaluarPunto, ultimaMedicion } = require("./ica");

describe("evaluarUso - coliformes fecales faltantes (bug luduena-03/09)", () => {
  test("no debe dar Uso I si no hay medición de coliformes fecales, aunque el resto esté bien", () => {
    const medicion = { ph: 7.3, dbo_mgl: 2, oxigeno_disuelto_mgl: null };
    const { uso, motivos } = evaluarUso(medicion);
    expect(uso).not.toBe("I");
    expect(motivos.some((m) => m.toLowerCase().includes("coliformes fecales no medidos"))).toBe(true);
  });

  test("el nivel de alerta resultante no debe ser verde sin coliformes fecales", () => {
    const medicion = { ph: 7.3, dbo_mgl: 2 };
    const { uso } = evaluarUso(medicion);
    const nivel = nivelAlertaDesdeUso(uso, medicion);
    expect(nivel).not.toBe("verde");
  });

  test("con coliformes fecales cargados y dentro de límite, sí puede dar Uso I", () => {
    const medicion = { ph: 7.3, dbo_mgl: 2, oxigeno_disuelto_mgl: 8, coliformes_fecales_100ml: 50 };
    const { uso, motivos } = evaluarUso(medicion);
    expect(uso).toBe("I");
    expect(motivos).toEqual([]);
  });
});

describe("evaluarUso - límites de pH", () => {
  test("pH 6.5 (límite inferior Uso I) cumple", () => {
    const { uso } = evaluarUso({ ph: 6.5, coliformes_fecales_100ml: 0 });
    expect(uso).toBe("I");
  });

  test("pH 6.4 (fuera de rango Uso I) no cumple Uso I", () => {
    const { uso } = evaluarUso({ ph: 6.4, coliformes_fecales_100ml: 0 });
    expect(uso).not.toBe("I");
  });

  test("pH 9.01 (fuera de todos los rangos) da Uso III", () => {
    const { uso } = evaluarUso({ ph: 9.01, coliformes_fecales_100ml: 0 });
    expect(uso).toBe("III");
  });
});

describe("evaluarUso - límites de coliformes fecales", () => {
  test("150/100ml (límite Uso I) cumple Uso I", () => {
    const { uso } = evaluarUso({ coliformes_fecales_100ml: 150 });
    expect(uso).toBe("I");
  });

  test("151/100ml no cumple Uso I pero sí Uso II", () => {
    const { uso } = evaluarUso({ coliformes_fecales_100ml: 151 });
    expect(uso).toBe("II");
  });

  test("1000/100ml (límite Uso II) todavía da Uso II", () => {
    const { uso } = evaluarUso({ coliformes_fecales_100ml: 1000 });
    expect(uso).toBe("II");
  });

  test("1001/100ml supera Uso II y fuerza alerta roja automática", () => {
    const { uso } = evaluarUso({ coliformes_fecales_100ml: 1001 });
    const nivel = nivelAlertaDesdeUso(uso, { coliformes_fecales_100ml: 1001 });
    expect(nivel).toBe("rojo");
  });

  test("acepta notación científica tipo '1.1e5'", () => {
    const { uso } = evaluarUso({ coliformes_fecales_100ml: "1.1e5" });
    expect(uso).toBe("III");
  });
});

describe("evaluarUso - sin medición", () => {
  test("medición null devuelve uso null y motivo sin_datos", () => {
    const { uso, motivos } = evaluarUso(null);
    expect(uso).toBeNull();
    expect(motivos).toContain("sin_datos");
  });
});

describe("evaluarPunto", () => {
  test("punto sin ultima_medicion queda en nivel sin_datos", () => {
    const resultado = evaluarPunto({ id: "x", ultima_medicion: null });
    expect(resultado.nivel_alerta).toBe("sin_datos");
    expect(resultado.ica).toBeNull();
  });

  test("punto tipo luduena-03 (verde falso) ahora da amarillo, no verde", () => {
    const punto = {
      id: "luduena-03",
      ultima_medicion: { ph: 7.3, dbo_mgl: 2, oxigeno_disuelto_mgl: null }
    };
    const resultado = evaluarPunto(punto);
    expect(resultado.nivel_alerta).toBe("amarillo");
  });
});

describe("ultimaMedicion / historial_mediciones", () => {
  test("con historial, toma la mas reciente (ultima del array)", () => {
    const punto = {
      id: "x",
      historial_mediciones: [
        { fecha: "2023-01-01", ph: 5 },
        { fecha: "2024-01-01", ph: 7.5, coliformes_fecales_100ml: 50 }
      ]
    };
    expect(ultimaMedicion(punto).fecha).toBe("2024-01-01");
  });

  test("evaluarPunto usa la ultima del historial, no la primera", () => {
    const punto = {
      id: "x",
      historial_mediciones: [
        { fecha: "2023-01-01", ph: 5, coliformes_fecales_100ml: 50 }, // pH fuera de rango
        { fecha: "2024-01-01", ph: 7.5, coliformes_fecales_100ml: 50 } // dentro de rango
      ]
    };
    const resultado = evaluarPunto(punto);
    expect(resultado.nivel_alerta).toBe("verde");
  });

  test("historial vacio cae al mismo camino que sin datos", () => {
    const resultado = evaluarPunto({ id: "x", historial_mediciones: [] });
    expect(resultado.nivel_alerta).toBe("sin_datos");
  });

  test("compatibilidad: sin historial, usa ultima_medicion (formato viejo)", () => {
    const punto = { id: "x", ultima_medicion: { ph: 7.3, coliformes_fecales_100ml: 50, dbo_mgl: 2 } };
    expect(ultimaMedicion(punto)).toBe(punto.ultima_medicion);
  });
});
