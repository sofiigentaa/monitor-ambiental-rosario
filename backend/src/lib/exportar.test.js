const { generarCsvPuntos, filaDesdePunto, COLUMNAS } = require("./exportar");

describe("filaDesdePunto", () => {
  test("toma la ultima medicion del historial", () => {
    const punto = {
      id: "p1",
      nombre: "Punto 1",
      lat: -32.9,
      lng: -60.6,
      nivel_alerta: "rojo",
      ica: 40,
      uso_permitido: "III",
      historial_mediciones: [
        { fecha: "2023-01-01", ph: 5 },
        { fecha: "2024-01-01", ph: 7.2, dbo_mgl: 10 }
      ]
    };
    const fila = filaDesdePunto(punto);
    expect(fila.fecha_medicion).toBe("2024-01-01");
    expect(fila.ph).toBe(7.2);
    expect(fila.dbo_mgl).toBe(10);
  });

  test("compatibilidad con formato viejo (ultima_medicion)", () => {
    const punto = { id: "p1", nombre: "Punto 1", lat: -32.9, lng: -60.6, ultima_medicion: { fecha: "x", ph: 6 } };
    expect(filaDesdePunto(punto).ph).toBe(6);
  });

  test("punto sin ninguna medicion da nulls en los campos de medicion", () => {
    const punto = { id: "p1", nombre: "Punto 1", lat: -32.9, lng: -60.6, nivel_alerta: "sin_datos" };
    const fila = filaDesdePunto(punto);
    expect(fila.fecha_medicion).toBeNull();
    expect(fila.ph).toBeNull();
  });
});

describe("generarCsvPuntos", () => {
  test("el encabezado tiene todas las columnas en orden", () => {
    const csv = generarCsvPuntos([]);
    const primeraLinea = csv.split("\n")[0];
    expect(primeraLinea).toBe(COLUMNAS.join(","));
  });

  test("genera una fila por punto", () => {
    const puntos = [
      { id: "p1", nombre: "Uno", lat: -32.9, lng: -60.6, nivel_alerta: "verde", historial_mediciones: [{ fecha: "2024-01-01", ph: 7 }] },
      { id: "p2", nombre: "Dos", lat: -32.8, lng: -60.5, nivel_alerta: "rojo", historial_mediciones: [{ fecha: "2024-02-01", ph: 5 }] }
    ];
    const csv = generarCsvPuntos(puntos);
    const lineas = csv.trim().split("\n");
    expect(lineas.length).toBe(3); // encabezado + 2 filas
  });

  test("escapa valores con comas o comillas", () => {
    const puntos = [{ id: "p1", nombre: 'Punto, con "comillas"', lat: -32.9, lng: -60.6, nivel_alerta: "verde" }];
    const csv = generarCsvPuntos(puntos);
    expect(csv).toContain('"Punto, con ""comillas"""');
  });
});
