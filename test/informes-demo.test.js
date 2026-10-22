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
  assert.match(interpretarFallo(504, "TIEMPO_AGOTADO").mensaje, /Inténtalo nuevamente más tarde/);
  assert.equal(interpretarFallo(429, "LIMITE_SOLICITUDES").fase, "limite");
  assert.equal(interpretarFallo(403, "SOLO_LOCAL").fase, "error");
  const secreto = "GROQ_API_KEY gsk_secreto";
  const fallo = interpretarFallo(500, secreto);
  assert.equal(fallo.fase, "error");
  assert.equal(fallo.mensaje.includes("GROQ_API_KEY"), false);
  assert.equal(fallo.mensaje.includes("gsk_secreto"), false);
  assert.equal(fallo.mensaje.includes("esta máquina"), false);
});
