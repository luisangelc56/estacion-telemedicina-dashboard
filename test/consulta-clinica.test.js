const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { clasificarFalloClinico, debeConsultarDatosClinicos } = require("../consulta-clinica.js");

const RAIZ = path.join(__dirname, "..");

test("un HTTP 401 no se presenta como servicio no disponible", () => {
  const vista = clasificarFalloClinico({ estado: 401 });
  assert.equal(vista.restringido, true);
  assert.equal(vista.servicio, "Sin autorización");
  assert.match(vista.mensaje, /autorización/);
  assert.match(vista.mensaje, /protegidos/);
  assert.doesNotMatch(vista.mensaje, /no está disponible/);
  assert.match(vista.mediciones, /autorización/);
  assert.match(vista.pacientes, /autorización/);
  assert.equal(vista.pastilla, "Protegido");
});

test("un fallo de red o un HTTP 500 siguen indicando que el servicio no está disponible", () => {
  for (const error of [new TypeError("Failed to fetch"), { estado: 500 }, { estado: 0 }, undefined]) {
    const vista = clasificarFalloClinico(error);
    assert.equal(vista.restringido, false);
    assert.equal(vista.servicio, "No disponible");
    assert.match(vista.mensaje, /no está disponible/);
    assert.equal(vista.pastilla, "En vivo");
  }
});

test("después de un 401 solo una acción manual vuelve a consultar los datos clínicos", () => {
  assert.equal(debeConsultarDatosClinicos(false, false), true);
  assert.equal(debeConsultarDatosClinicos(true, false), false);
  assert.equal(debeConsultarDatosClinicos(true, true), true);
});

test("los informes de ejemplo no consultan pacientes ni mediciones y el panel no incluye la clave", () => {
  const informes = fs.readFileSync(path.join(RAIZ, "informes-demo.js"), "utf8");
  const panel = fs.readFileSync(path.join(RAIZ, "dashboard.js"), "utf8");
  const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
  assert.equal(informes.includes("/api/pacientes"), false);
  assert.equal(informes.includes("/api/mediciones"), false);
  assert.match(informes, /\/api\/demo\/informes\//);
  assert.equal(panel.includes("DASHBOARD_API_KEY"), false);
  assert.equal(panel.includes("Authorization"), false);
  assert.equal(panel.includes("Bearer"), false);
  assert.match(panel, /clasificarFalloClinico/);
  assert.match(panel, /debeConsultarDatosClinicos/);
  assert.match(html, /consulta-clinica\.js/);
  const panelDespues = html.indexOf("dashboard.js");
  const consultaAntes = html.indexOf("consulta-clinica.js");
  assert.ok(consultaAntes > -1 && consultaAntes < panelDespues);
});
