const test = require("node:test");
const assert = require("node:assert/strict");
const { presentarInforme, interpretarFallo } = require("../informes-demo.js");

const informeDemo = {
  pacienteId: "PAC-DEMO-01",
  periodo: { desde: "2026-10-15T08:00:00.000Z", hasta: "2026-10-18T08:05:00.000Z", dias: 3 },
  lecturasUtilizadas: 8,
  frecuenciaCardiaca: { disponible: true, promedio: 72, minimo: 68, maximo: 76, unidad: "BPM", lecturas: 4 },
  temperatura: { disponible: true, promedio: 36.6, minimo: 36.5, maximo: 36.6, unidad: "°C", lecturas: 3 },
  variabilidadCardiaca: { disponible: false, motivo: "No hay suficientes lecturas de variabilidad cardíaca para calcularla." },
  tendencias: { frecuenciaCardiaca: "ascendente", temperatura: "estable", variabilidadCardiaca: "insuficiente" },
  resumenOrientativo: "La frecuencia muestra la tendencia ya calculada.",
  limitaciones: ["La serie ficticia es breve."],
  advertencia: "Este informe es orientativo y no constituye un diagnóstico médico."
};

test("presenta las cifras recibidas y la variabilidad ausente", () => {
  const vista = presentarInforme(informeDemo);
  assert.equal(vista.pacienteId, "PAC-DEMO-01");
  assert.equal(vista.lecturasUtilizadas, "8");
  assert.equal(vista.dias, "3");
  assert.match(vista.frecuenciaCardiaca.texto, /72 BPM/);
  assert.match(vista.temperatura.texto, /36\.6 °C/);
  assert.equal(vista.variabilidadCardiaca.disponible, false);
  assert.match(vista.variabilidadCardiaca.texto, /No hay suficientes lecturas/);
  assert.equal(vista.tendencias.frecuenciaCardiaca, "ascendente");
  assert.equal(vista.resumenOrientativo, informeDemo.resumenOrientativo);
  assert.deepEqual(vista.limitaciones, ["La serie ficticia es breve."]);
  assert.match(vista.advertencia, /orientativo/);
  assert.deepEqual(vista.secciones, []);
  assert.equal(vista.origenExplicacion, "modelo");
});

test("presenta las secciones verificadas sin alterar las cifras", () => {
  const vista = presentarInforme({
    ...informeDemo,
    origenExplicacion: "respaldo",
    lecturasDescartadas: 2,
    secciones: [
      { id: "general", titulo: "Información general", cifras: "", parrafos: ["Mediciones analizadas: 8."] },
      { id: "frecuenciaCardiaca", titulo: "Frecuencia cardíaca", cifras: "promedio 72 BPM", parrafos: ["No indica si el ritmo es adecuado."] },
      { titulo: " ", parrafos: ["Se descarta"] }
    ]
  });
  assert.equal(vista.secciones.length, 2);
  assert.equal(vista.secciones[1].cifras, "promedio 72 BPM");
  assert.equal(vista.origenExplicacion, "respaldo");
  assert.equal(vista.lecturasDescartadas, "2");
  assert.equal(vista.frecuenciaCardiaca.texto.includes("72"), true);
});

test("no inventa cifras cuando falta una serie", () => {
  const vista = presentarInforme({
    pacienteId: "PAC-DEMO-02",
    frecuenciaCardiaca: { disponible: false },
    temperatura: null,
    variabilidadCardiaca: { disponible: true, promedio: 40 }
  });
  assert.equal(vista.frecuenciaCardiaca.texto, "No disponible.");
  assert.equal(vista.temperatura.texto, "No disponible.");
  assert.equal(vista.variabilidadCardiaca.disponible, false);
  assert.equal(vista.lecturasUtilizadas, "No disponible");
  assert.equal(vista.resumenOrientativo, "No disponible.");
});

test("traduce los errores del proveedor sin repetir mensajes sensibles", () => {
  assert.equal(interpretarFallo(422, "DATOS_INSUFICIENTES").fase, "insuficiente");
  assert.equal(interpretarFallo(0, "API_NO_DISPONIBLE").fase, "api");
  assert.match(interpretarFallo(0, "API_NO_DISPONIBLE").mensaje, /no está disponible/);
  assert.equal(interpretarFallo(502, "GENERACION_ESTRUCTURADA_FALLIDA").fase, "error");
  assert.match(interpretarFallo(503, "SIN_API_KEY").mensaje, /No fue posible generar el informe/);
  assert.match(interpretarFallo(504, "TIEMPO_AGOTADO").mensaje, /Inténtelo más tarde/);
  assert.equal(interpretarFallo(429, "LIMITE_SOLICITUDES").fase, "limite");
  assert.equal(interpretarFallo(403, "SOLO_LOCAL").fase, "error");
  const secreto = "GROQ_API_KEY gsk_secreto";
  const fallo = interpretarFallo(500, secreto);
  assert.equal(fallo.fase, "error");
  assert.equal(fallo.mensaje.includes("GROQ_API_KEY"), false);
  assert.equal(fallo.mensaje.includes("gsk_secreto"), false);
  assert.equal(fallo.mensaje.includes("esta máquina"), false);
});

test("combina ejemplos y pacientes registrados sin repetir identificadores", () => {
  const { combinarPacientes, conservarSeleccion, esEjemplo } = require("../informes-demo.js");
  const lista = combinarPacientes([
    { id: 4, nombre: "Ana", apellido: "López" },
    { id: "4", nombre: "Repetido" },
    { id: "PAC-DEMO-01", nombre: "No debe duplicar el ejemplo" },
    { id: "0", nombre: "Inválido" },
    { id: "12", nombre: "Luis" }
  ]);
  assert.deepEqual(lista.map((item) => item.id), ["PAC-DEMO-01", "PAC-DEMO-02", "4", "12"]);
  assert.equal(lista[2].nombre, "Ana López");
  assert.equal(lista[2].origen, "registrado");
  assert.equal(conservarSeleccion("12", lista), "12");
  assert.equal(conservarSeleccion("99", lista), "PAC-DEMO-01");
  assert.equal(esEjemplo("PAC-DEMO-01"), true);
  assert.equal(esEjemplo("12"), false);
});

test("distingue un paciente sin mediciones de un error al consultarlas", async () => {
  require("../consulta-clinica.js");
  const { consultarLecturas, mensajeConsulta, MENSAJE_SIN_MEDICIONES } = require("../informes-demo.js");
  const vacio = await consultarLecturas("8", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, mediciones: [] })
  }));
  assert.equal(vacio.estado, "vacio");
  assert.equal(MENSAJE_SIN_MEDICIONES.includes("todavía no tiene mediciones"), true);

  const ajenas = await consultarLecturas("8", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, mediciones: [{ paciente_id: 9, valor: 70 }] })
  }));
  assert.equal(ajenas.estado, "vacio");

  const propias = await consultarLecturas("8", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, mediciones: [{ paciente_id: "8", valor: 70 }, { paciente_id: 3, valor: 36 }] })
  }));
  assert.equal(propias.estado, "disponible");
  assert.equal(propias.total, 1);

  const caida = await consultarLecturas("8", async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(caida.estado, "error");
  assert.equal(caida.codigo, "RED");
  assert.equal(mensajeConsulta(caida).includes("todavía no tiene mediciones"), false);

  const servidor = await consultarLecturas("8", async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, codigo: "ERROR_INTERNO" })
  }));
  assert.equal(servidor.estado, "error");
  assert.equal(servidor.http, 500);
  assert.match(mensajeConsulta(servidor), /error del servicio/);
  assert.equal(mensajeConsulta({ codigo: "TIEMPO_AGOTADO", http: 504 }).includes("tardó demasiado"), true);
  assert.match(mensajeConsulta({ codigo: "NO_AUTORIZADO", http: 401 }), /autorización/);
});

test("traduce 401, 500 y 502 del informe sin tratarlos como falta de datos", () => {
  const { interpretarFallo, MENSAJE_SIN_MEDICIONES } = require("../informes-demo.js");
  for (const caso of [[401, "NO_AUTORIZADO"], [500, "ERROR_INTERNO"], [502, "RESPUESTA_INVALIDA"]]) {
    const fallo = interpretarFallo(caso[0], caso[1]);
    assert.equal(fallo.reintentar, true);
    assert.equal(fallo.mensaje.includes(MENSAJE_SIN_MEDICIONES), false);
    assert.equal(fallo.fase === "sin-datos", false);
  }
  assert.equal(interpretarFallo(401, "NO_AUTORIZADO").fase, "denegado");
  assert.equal(interpretarFallo(502, "RESPUESTA_INVALIDA").fase, "error");
});

test("el selector conserva los pacientes si el aviso llega antes de montar el informe", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { combinarPacientes, tomarRegistrados } = require("../informes-demo.js");
  const registrados = [
    { id: 1, nombre: "Ana", apellido: "López" },
    { id: " 2 ", nombre: "Luis" },
    { id: "3", nombre: "María" },
    { id: "3", nombre: "Repetida" }
  ];
  const raiz = { TELEMEDICINA_REGISTRADOS: registrados };
  const lista = combinarPacientes(tomarRegistrados(raiz));
  assert.deepEqual(lista.map((item) => item.id), ["PAC-DEMO-01", "PAC-DEMO-02", "1", "2", "3"]);
  assert.equal(lista.filter((item) => item.origen === "ejemplo").length, 2);
  assert.equal(lista.filter((item) => item.origen === "registrado").length, 3);

  const panel = fs.readFileSync(path.join(__dirname, "../dashboard.js"), "utf8");
  const aviso = panel.slice(panel.indexOf("function notificarPacientesInforme"), panel.indexOf("function escribirPastilla"));
  assert.ok(aviso.indexOf("TELEMEDICINA_REGISTRADOS") !== -1);
  assert.ok(aviso.indexOf("TELEMEDICINA_REGISTRADOS") < aviso.indexOf("recibirPacientes"));
  const informes = fs.readFileSync(path.join(__dirname, "../informes-demo.js"), "utf8");
  assert.ok(informes.indexOf("tomarRegistrados(window)") < informes.indexOf("aplicacion.mount"));
  assert.match(informes, /:key="claveSelector"|claveSelector/);
});
