const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

test("el registro de paciente usa el tema oscuro y no cambia el paciente en revisión", () => {
  const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
  const panel = fs.readFileSync(path.join(RAIZ, "dashboard.js"), "utf8");
  const estilos = fs.readFileSync(path.join(RAIZ, "monitor.css"), "utf8");
  const inicio = html.indexOf('id="patient-form"');
  const fin = html.indexOf('id="mediciones"');
  const formulario = html.slice(inicio, fin);
  assert.match(formulario, /id="patient-form" hidden/);
  assert.match(formulario, /id="patient-form-cancel"/);
  assert.match(formulario, />Cancelar</);
  assert.match(formulario, /id="patient-register-confirm"/);
  assert.match(panel, /El paciente se registró correctamente\./);
  assert.equal(panel.includes("pacienteActual = String(resultado.paciente.id)"), false);
  assert.match(panel, /cerrarFormularioPaciente\(\{ limpiar: true \}\)/);
  assert.match(panel, /cerrarFormularioPaciente\(\)/);
  assert.match(estilos, /#patient-form:not\(\[hidden\]\)/);
  assert.match(estilos, /background: var\(--raised\)/);
  assert.match(estilos, /#patient-form\[hidden\] \{ display: none; \}/);
});
