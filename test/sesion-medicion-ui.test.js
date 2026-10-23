const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

test("la sección de medición usa pacientes registrados y avisa sobre lecturas retrasadas", () => {
  const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
  const panel = fs.readFileSync(path.join(RAIZ, "dashboard.js"), "utf8");
  const inicio = html.indexOf('id="sesion-medicion"');
  const fin = html.indexOf('id="vitals-section"');
  const seccion = html.slice(inicio, fin);
  assert.ok(inicio > -1 && fin > inicio);
  assert.match(seccion, /Sesión de medición/);
  assert.match(seccion, /Iniciar medición/);
  assert.match(seccion, /Finalizar sesión/);
  assert.match(seccion, /registros simulados para el congreso/);
  assert.match(seccion, /No representan personas reales/);
  assert.match(seccion, /hora de captura/);
  assert.match(seccion, /id="sesion-medicion-paciente"/);
  assert.equal(seccion.includes("PAC-DEMO"), false);
  assert.match(panel, /\/api\/estacion\/sesion\/finalizar/);
  assert.match(panel, /idMedicionValido/);
  assert.match(panel, /PAC-DEMO/);
  assert.match(panel, /sesionMedicion/);
  assert.equal(panel.includes("DEVICE_API_KEY"), false);
  assert.equal(panel.includes("DASHBOARD_API_KEY"), false);
  assert.equal(panel.includes("x-device-key"), false);
});
