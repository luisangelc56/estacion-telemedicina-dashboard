const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolverApiBase, urlDeApi } = require("../api-base.js");

const RAIZ = path.join(__dirname, "..");

function ubicacion(datos) {
  return {
    hostname: datos.hostname,
    protocol: datos.protocol,
    search: datos.search || ""
  };
}

test("la configuración publicada no apunta a localhost", () => {
  const publico = fs.readFileSync(path.join(RAIZ, "config.public.js"), "utf8");
  const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
  const informes = fs.readFileSync(path.join(RAIZ, "informes-demo.js"), "utf8");
  assert.equal(publico.includes("localhost"), false);
  assert.match(publico, /apiBase:\s*"https:\/\/estacion-telemedicina-api\.onrender\.com"/);
  assert.equal(publico.includes("estacion-telemedicina-api.onrender.com/"), false);
  assert.match(html, /config\.public\.js/);
  assert.match(html, /hostname === "localhost" \|\| location\.hostname === "127\.0\.0\.1"/);
  assert.match(informes, /\/api\/demo\/informes\/\$\{encodeURIComponent\(this\.pacienteId\)\}/);
  assert.match(informes, /resumenOrientativo/);
  assert.match(informes, /limitaciones/);
  assert.match(informes, /advertencia/);
});

test("el panel publicado espera la URL HTTPS de Render y el local conserva localhost", () => {
  const publicado = resolverApiBase(ubicacion({
    hostname: "estacion-telemedicina-dashboard.vercel.app",
    protocol: "https:"
  }), { apiBase: "" });
  assert.equal(publicado.base, undefined);
  assert.match(publicado.error, /no está disponible/);
  assert.equal(publicado.error.includes("localhost"), false);
  assert.equal(publicado.error.includes("config.public.js"), false);

  const local = resolverApiBase(ubicacion({
    hostname: "127.0.0.1",
    protocol: "http:"
  }), { apiBase: "" });
  assert.equal(local.base, "http://localhost:3000");

  const rechazado = resolverApiBase(ubicacion({
    hostname: "estacion-telemedicina-dashboard.vercel.app",
    protocol: "https:"
  }), { apiBase: "http://localhost:3000" });
  assert.equal(rechazado.base, undefined);
  assert.match(rechazado.error, /no está disponible/);
  assert.equal(rechazado.error.includes("localhost"), false);

  const listo = resolverApiBase(ubicacion({
    hostname: "estacion-telemedicina-dashboard.vercel.app",
    protocol: "https:"
  }), { apiBase: "https://backend-de-prueba.example" });
  assert.equal(listo.base, "https://backend-de-prueba.example");
  assert.equal(urlDeApi(listo.base, "/api/demo/informes/PAC-DEMO-01"), "https://backend-de-prueba.example/api/demo/informes/PAC-DEMO-01");
});
