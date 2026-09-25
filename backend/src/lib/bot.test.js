const { procesarMensaje, _resetPendientes } = require("./bot");
const { _reset: resetSuscripciones, listarZonas } = require("./suscripciones");

function mensaje(chatId, texto) {
  return { chat: { id: chatId }, text: texto };
}

function mensajeUbicacion(chatId, lat, lng) {
  return { chat: { id: chatId }, location: { latitude: lat, longitude: lng } };
}

beforeEach(() => {
  resetSuscripciones();
  _resetPendientes();
});

describe("procesarMensaje - ayuda", () => {
  test("/start y /ayuda devuelven el texto de ayuda", () => {
    expect(procesarMensaje(mensaje(1, "/start")).respuesta).toMatch(/Comandos/);
    expect(procesarMensaje(mensaje(1, "/ayuda")).respuesta).toMatch(/Comandos/);
  });

  test("mensaje no reconocido pide usar /ayuda", () => {
    expect(procesarMensaje(mensaje(1, "hola")).respuesta).toMatch(/ayuda/);
  });
});

describe("procesarMensaje - /agregar por barrio", () => {
  test("agrega una zona con nombre y barrio real", () => {
    const { respuesta } = procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    expect(respuesta).toMatch(/guardada/);
    expect(listarZonas(1)).toHaveLength(1);
    expect(listarZonas(1)[0].nombre).toBe("casa");
  });

  test("avisa si falta el barrio", () => {
    const { respuesta } = procesarMensaje(mensaje(1, "/agregar casa"));
    expect(respuesta).toMatch(/Uso:/);
    expect(listarZonas(1)).toHaveLength(0);
  });

  test("avisa si el barrio no existe en los datos", () => {
    const { respuesta } = procesarMensaje(mensaje(1, "/agregar casa BarrioQueNoExisteXYZ"));
    expect(respuesta).toMatch(/No encontré el barrio/);
  });

  test("avisa si el nombre ya esta usado", () => {
    procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    const { respuesta } = procesarMensaje(mensaje(1, "/agregar casa Ludueña"));
    expect(respuesta).toMatch(/❌/);
  });
});

describe("procesarMensaje - flujo de ubicacion", () => {
  test("una ubicacion pide el nombre y el siguiente texto la guarda", () => {
    const r1 = procesarMensaje(mensajeUbicacion(2, -32.9, -60.6));
    expect(r1.respuesta).toMatch(/nombre/);

    const r2 = procesarMensaje(mensaje(2, "trabajo"));
    expect(r2.respuesta).toMatch(/guardada/);
    expect(listarZonas(2)).toHaveLength(1);
    expect(listarZonas(2)[0]).toMatchObject({ nombre: "trabajo", lat: -32.9, lng: -60.6 });
  });

  test("un comando despues de la ubicacion no se toma como nombre", () => {
    procesarMensaje(mensajeUbicacion(2, -32.9, -60.6));
    procesarMensaje(mensaje(2, "/zonas"));
    expect(listarZonas(2)).toHaveLength(0);
  });
});

describe("procesarMensaje - /zonas", () => {
  test("sin zonas, avisa que no hay ninguna", () => {
    expect(procesarMensaje(mensaje(1, "/zonas")).respuesta).toMatch(/no tenés ninguna/);
  });

  test("con zonas, las lista", () => {
    procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    procesarMensaje(mensaje(1, "/agregar trabajo Ludueña"));
    const { respuesta } = procesarMensaje(mensaje(1, "/zonas"));
    expect(respuesta).toContain("casa");
    expect(respuesta).toContain("trabajo");
  });
});

describe("procesarMensaje - /borrar", () => {
  test("borra una zona existente", () => {
    procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    const { respuesta } = procesarMensaje(mensaje(1, "/borrar casa"));
    expect(respuesta).toMatch(/borrada/);
    expect(listarZonas(1)).toHaveLength(0);
  });

  test("avisa si la zona no existe", () => {
    const { respuesta } = procesarMensaje(mensaje(1, "/borrar no-existe"));
    expect(respuesta).toMatch(/No encontré/);
  });
});

describe("procesarMensaje - /baja", () => {
  test("borra todas las zonas del chat", () => {
    procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    procesarMensaje(mensaje(1, "/agregar trabajo Ludueña"));
    const { respuesta } = procesarMensaje(mensaje(1, "/baja"));
    expect(respuesta).toMatch(/diste de baja/);
    expect(listarZonas(1)).toHaveLength(0);
  });

  test("avisa si no tenia zonas", () => {
    const { respuesta } = procesarMensaje(mensaje(1, "/baja"));
    expect(respuesta).toMatch(/No tenías ninguna/);
  });
});

describe("procesarMensaje - aislamiento entre chats", () => {
  test("las zonas de un chat no aparecen en otro", () => {
    procesarMensaje(mensaje(1, "/agregar casa Fisherton"));
    expect(listarZonas(2)).toHaveLength(0);
  });
});
