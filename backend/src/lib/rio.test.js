const { obtenerAlturaRio, parsearAlturaRio, extraerFilaRosario, _resetCache } = require("./rio");

// Fragmento real de la tabla de https://contenidosweb.prefecturanaval.gob.ar/alturas/
// (capturado a mano el 25/09/2026, para no depender de la red en los tests).
const HTML_EJEMPLO = `
<table class="fpTable">
<tbody>
<tr class="" >
    <th data-label="Puerto:">SANTA FE</th>
    <td data-label="Río:">PARANA</td>
    <td data-label="Ultimo Registro:" class="warning">3.00</td>
    <td data-label="Variacion">-0.05</td>
    <td data-label="Periodo">12</td>
    <td data-label="Fecha Hora:"><b>25/SEP/26 - 1200</b></td>
    <td data-label="Estado:">BAJA</td>
    <td><img src="img/abajo.svg" width="40" /></td>
    <td data-label="Registro Anterior:">3.05</td>
    <td data-label="Fecha Anterior:">25/SEP/26 - 0000</td>
    <td data-label="Alerta:">5.30</td>
    <td data-label="Evacuación:">5.70</td>
    <td><a href="/alturas/?page=historico&tiempo=7&id=270" target="_blank"><i class="fa fa-2x fa-line-chart"></i></a></td>
</tr>
<tr class="" >
    <th data-label="Puerto:">ROSARIO</th>
    <td data-label="Río:">PARANA</td>
    <td data-label="Ultimo Registro:" class="warning">2.65</td>
    <td data-label="Variacion">-0.02</td>
    <td data-label="Periodo">12</td>
    <td data-label="Fecha Hora:"><b>25/SEP/26 - 1200</b></td>
    <td data-label="Estado:">BAJA</td>
    <td><img src="img/abajo.svg" width="40" /></td>
    <td data-label="Registro Anterior:">2.67</td>
    <td data-label="Fecha Anterior:">25/SEP/26 - 0000</td>
    <td data-label="Alerta:">5.00</td>
    <td data-label="Evacuación:">5.30</td>
    <td><a href="/alturas/?page=historico&tiempo=7&id=280" target="_blank"><i class="fa fa-2x fa-line-chart"></i></a></td>
</tr>
<tr class="" >
    <th data-label="Puerto:">VILLA CONSTITUCION</th>
    <td data-label="Río:">PARANA</td>
    <td data-label="Ultimo Registro:" class="warning">1.96</td>
    <td data-label="Variacion">-0.03</td>
    <td data-label="Periodo">12</td>
    <td data-label="Fecha Hora:"><b>25/SEP/26 - 1200</b></td>
    <td data-label="Estado:">BAJA</td>
    <td><img src="img/abajo.svg" width="40" /></td>
    <td data-label="Registro Anterior:">1.99</td>
    <td data-label="Fecha Anterior:">25/SEP/26 - 0000</td>
    <td data-label="Alerta:">4.00</td>
    <td data-label="Evacuación:">4.50</td>
    <td><a href="/alturas/?page=historico&tiempo=7&id=290" target="_blank"><i class="fa fa-2x fa-line-chart"></i></a></td>
</tr>
</tbody>
</table>
`;

beforeEach(() => {
  _resetCache();
});

describe("extraerFilaRosario", () => {
  test("encuentra la fila de Rosario/Parana entre varios puertos", () => {
    const fila = extraerFilaRosario(HTML_EJEMPLO);
    expect(fila).not.toBeNull();
    expect(fila).toContain("2.65");
  });

  test("devuelve null si no hay ninguna fila de Rosario", () => {
    expect(extraerFilaRosario("<table><tr><th>SANTA FE</th></tr></table>")).toBeNull();
  });
});

describe("parsearAlturaRio", () => {
  test("extrae todos los campos de la fila real", () => {
    const datos = parsearAlturaRio(HTML_EJEMPLO);
    expect(datos).toEqual({
      nivel_m: 2.65,
      variacion_m: -0.02,
      fecha_hora: "25/SEP/26 - 1200",
      estado_rio: "BAJA",
      estado_texto: "Bajando",
      estado_icono: "📉",
      registro_anterior_m: 2.67,
      alerta_m: 5.0,
      evacuacion_m: 5.3,
      nivel_riesgo: "normal"
    });
  });

  test("devuelve null ante HTML sin la fila esperada (pagina caida o cambio de formato)", () => {
    expect(parsearAlturaRio("<html>algo distinto</html>")).toBeNull();
  });

  test("clasifica nivel_riesgo como alerta si supera el umbral", () => {
    const html = HTML_EJEMPLO.replace(
      '<td data-label="Ultimo Registro:" class="warning">2.65</td>',
      '<td data-label="Ultimo Registro:" class="warning">5.10</td>'
    );
    expect(parsearAlturaRio(html).nivel_riesgo).toBe("alerta");
  });

  test("clasifica nivel_riesgo como evacuacion si supera ese umbral", () => {
    const html = HTML_EJEMPLO.replace(
      '<td data-label="Ultimo Registro:" class="warning">2.65</td>',
      '<td data-label="Ultimo Registro:" class="warning">5.40</td>'
    );
    expect(parsearAlturaRio(html).nivel_riesgo).toBe("evacuacion");
  });
});

describe("obtenerAlturaRio", () => {
  let fetchOriginal;

  beforeEach(() => {
    fetchOriginal = global.fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  test("devuelve los datos parseados cuando la fuente responde bien", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(HTML_EJEMPLO) }));
    const data = await obtenerAlturaRio();
    expect(data.estado).toBe("ok");
    expect(data.nivel_m).toBe(2.65);
  });

  test("responde datos_no_disponibles si la fuente falla", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }));
    const data = await obtenerAlturaRio();
    expect(data.estado).toBe("datos_no_disponibles");
  });

  test("responde datos_no_disponibles si el HTML no se puede interpretar", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve("<html></html>") }));
    const data = await obtenerAlturaRio();
    expect(data.estado).toBe("datos_no_disponibles");
  });

  test("usa la cache en llamadas subsiguientes", async () => {
    const mockFetch = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(HTML_EJEMPLO) }));
    global.fetch = mockFetch;
    await obtenerAlturaRio();
    await obtenerAlturaRio();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
