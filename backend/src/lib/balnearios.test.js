const { listarBalnearios, mensajeAptitud } = require("./balnearios");

describe("listarBalnearios", () => {
  test("devuelve el dataset con fecha_actualizacion y al menos un balneario", () => {
    const data = listarBalnearios();
    expect(data.fecha_actualizacion).toBeDefined();
    expect(Array.isArray(data.balnearios)).toBe(true);
    expect(data.balnearios.length).toBeGreaterThan(0);
  });

  test("cada balneario tiene coordenadas y un campo aptitud", () => {
    const data = listarBalnearios();
    data.balnearios.forEach((b) => {
      expect(typeof b.lat).toBe("number");
      expect(typeof b.lng).toBe("number");
      expect(b.aptitud).toBeDefined();
    });
  });
});

describe("mensajeAptitud", () => {
  test("da un mensaje para cada estado conocido", () => {
    expect(mensajeAptitud("apta")).toMatch(/Apta/);
    expect(mensajeAptitud("evitar_contacto")).toMatch(/Evitar/);
    expect(mensajeAptitud("no_apta")).toMatch(/No apta/);
    expect(mensajeAptitud("sin_datos")).toMatch(/no se cargó/);
  });

  test("estado desconocido cae en el mensaje de sin_datos", () => {
    expect(mensajeAptitud("cualquier_otra_cosa")).toBe(mensajeAptitud("sin_datos"));
  });
});
