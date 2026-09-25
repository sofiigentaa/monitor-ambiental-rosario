const {
  agregarZona,
  borrarZona,
  darDeBaja,
  listarZonas,
  todasLasSuscripciones,
  coordenadasPorBarrio,
  _reset
} = require("./suscripciones");

beforeEach(() => {
  _reset();
});

describe("agregarZona", () => {
  test("agrega una zona valida", () => {
    const zona = agregarZona("chat1", "casa", -32.9, -60.6);
    expect(zona.nombre).toBe("casa");
    expect(listarZonas("chat1")).toHaveLength(1);
  });

  test("rechaza sin nombre", () => {
    expect(() => agregarZona("chat1", "", -32.9, -60.6)).toThrow();
  });

  test("rechaza sin lat/lng validos", () => {
    expect(() => agregarZona("chat1", "casa", "no-es-numero", -60.6)).toThrow();
  });

  test("rechaza un nombre repetido para el mismo chat", () => {
    agregarZona("chat1", "casa", -32.9, -60.6);
    expect(() => agregarZona("chat1", "casa", -32.8, -60.5)).toThrow(/Ya tenés/);
  });

  test("el mismo nombre esta permitido en chats distintos", () => {
    agregarZona("chat1", "casa", -32.9, -60.6);
    expect(() => agregarZona("chat2", "casa", -32.8, -60.5)).not.toThrow();
  });

  test("una zona nueva arranca sin nada notificado", () => {
    const zona = agregarZona("chat1", "casa", -32.9, -60.6);
    expect(zona.estadoNotificado).toEqual({});
  });
});

describe("borrarZona", () => {
  test("borra una zona existente", () => {
    agregarZona("chat1", "casa", -32.9, -60.6);
    expect(borrarZona("chat1", "casa")).toBe(true);
    expect(listarZonas("chat1")).toHaveLength(0);
  });

  test("devuelve false si la zona no existe", () => {
    expect(borrarZona("chat1", "no-existe")).toBe(false);
  });

  test("no es sensible a mayusculas/minusculas", () => {
    agregarZona("chat1", "Casa", -32.9, -60.6);
    expect(borrarZona("chat1", "casa")).toBe(true);
  });
});

describe("darDeBaja", () => {
  test("borra todas las zonas de un chat", () => {
    agregarZona("chat1", "casa", -32.9, -60.6);
    agregarZona("chat1", "trabajo", -32.8, -60.5);
    expect(darDeBaja("chat1")).toBe(true);
    expect(listarZonas("chat1")).toHaveLength(0);
  });

  test("devuelve false si no tenia zonas", () => {
    expect(darDeBaja("chat-sin-zonas")).toBe(false);
  });
});

describe("todasLasSuscripciones", () => {
  test("lista todos los chats con zonas", () => {
    agregarZona("chat1", "casa", -32.9, -60.6);
    agregarZona("chat2", "casa", -32.8, -60.5);
    const todas = todasLasSuscripciones();
    expect(todas).toHaveLength(2);
  });
});

describe("coordenadasPorBarrio", () => {
  test("encuentra coordenadas para un barrio real del dataset", () => {
    const coords = coordenadasPorBarrio("Fisherton");
    expect(coords).not.toBeNull();
    expect(typeof coords.lat).toBe("number");
    expect(typeof coords.lng).toBe("number");
  });

  test("no es sensible a mayusculas/minusculas", () => {
    expect(coordenadasPorBarrio("fisherton")).not.toBeNull();
  });

  test("devuelve null para un barrio que no existe en el dataset", () => {
    expect(coordenadasPorBarrio("Barrio Inventado Que No Existe XYZ")).toBeNull();
  });

  test("devuelve null con texto vacio", () => {
    expect(coordenadasPorBarrio("")).toBeNull();
  });
});
