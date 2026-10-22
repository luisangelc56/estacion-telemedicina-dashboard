const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { manejarSesion, firmar, cabeceraCookie, reiniciarIntentos, NOMBRE_COOKIE } = require("../api/_lib/sesion");
const { consultarClinico, construirDestino } = require("../api/_lib/proxy");
const { rutaClinica, clasificarFalloClinico } = require("../consulta-clinica");
const { mensajeDeSesion } = require("../acceso");

const RAIZ = path.join(__dirname, "..");
const AHORA = Date.parse("2026-10-22T12:00:00.000Z");
const ENV = {
  TEAM_USERNAME: "equipo-prueba",
  TEAM_PASSWORD: "contrasena-de-prueba-000",
  SESSION_SECRET: "secreto-de-prueba-0000000000000000",
  DASHBOARD_API_KEY: "clave-dashboard-de-prueba-0000",
  BACKEND_API_BASE: "https://backend-de-prueba.example"
};

function peticionSesion(extra) {
  return {
    ahora: AHORA,
    env: ENV,
    seguro: true,
    origen: "https://panel.example",
    host: "panel.example",
    reenviado: "203.0.113.8",
    ...extra
  };
}

function cookieDe(resultado) {
  const token = resultado.cookie.split(";")[0].slice(NOMBRE_COOKIE.length + 1);
  return `${NOMBRE_COOKIE}=${token}`;
}

test("el inicio de sesión entrega una cookie HttpOnly, Secure y SameSite y no revela la contraseña", async () => {
  reiniciarIntentos();
  const incorrecto = await manejarSesion(peticionSesion({
    method: "POST",
    body: { usuario: ENV.TEAM_USERNAME, contrasena: "otra-contrasena-000" }
  }));
  assert.equal(incorrecto.status, 401);
  assert.equal(incorrecto.body.codigo, "CREDENCIALES_INVALIDAS");
  assert.equal(incorrecto.cookie, undefined);
  assert.equal(JSON.stringify(incorrecto).includes(ENV.TEAM_PASSWORD), false);

  const correcto = await manejarSesion(peticionSesion({
    method: "POST",
    body: { usuario: ENV.TEAM_USERNAME, contrasena: ENV.TEAM_PASSWORD }
  }));
  assert.equal(correcto.status, 200);
  assert.equal(correcto.body.usuario, ENV.TEAM_USERNAME);
  assert.match(correcto.cookie, /HttpOnly/);
  assert.match(correcto.cookie, /Secure/);
  assert.match(correcto.cookie, /SameSite=Strict/);
  assert.equal(correcto.cookie.includes(ENV.TEAM_PASSWORD), false);
  assert.equal(correcto.cookie.includes(ENV.DASHBOARD_API_KEY), false);

  const activa = await manejarSesion(peticionSesion({ method: "GET", cookie: cookieDe(correcto) }));
  assert.equal(activa.status, 200);
  assert.equal(activa.body.usuario, ENV.TEAM_USERNAME);
});

test("un anónimo no consulta pacientes y una sesión válida sí los obtiene", async () => {
  reiniciarIntentos();
  let llamadas = 0;
  const anonimo = await consultarClinico({
    method: "GET",
    recurso: "pacientes",
    claves: ["recurso"],
    env: ENV,
    ahora: AHORA,
    fetchImpl() {
      llamadas += 1;
      throw new Error("no debe salir");
    }
  });
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.codigo, "SESION_REQUERIDA");
  assert.equal(llamadas, 0);

  const sesion = await manejarSesion(peticionSesion({
    method: "POST",
    body: { usuario: ENV.TEAM_USERNAME, contrasena: ENV.TEAM_PASSWORD }
  }));
  const consulta = await consultarClinico({
    method: "GET",
    recurso: "pacientes",
    claves: ["recurso"],
    cookie: cookieDe(sesion),
    env: ENV,
    ahora: AHORA,
    fetchImpl(destino, opciones) {
      llamadas += 1;
      assert.equal(String(destino), "https://backend-de-prueba.example/api/pacientes");
      assert.equal(opciones.headers.Authorization, `Bearer ${ENV.DASHBOARD_API_KEY}`);
      assert.equal(opciones.headers.Cookie, undefined);
      return {
        status: 200,
        async text() {
          return JSON.stringify({ ok: true, pacientes: [{ id: "7", nombre: "Ana" }] });
        }
      };
    }
  });
  assert.equal(llamadas, 1);
  assert.equal(consulta.status, 200);
  assert.equal(consulta.body.pacientes[0].nombre, "Ana");
  assert.equal(JSON.stringify(consulta).includes(ENV.DASHBOARD_API_KEY), false);
});

test("el registro reenvía el paciente autorizado y rechaza rutas ajenas", async () => {
  reiniciarIntentos();
  const sesion = await manejarSesion(peticionSesion({
    method: "POST",
    body: { usuario: ENV.TEAM_USERNAME, contrasena: ENV.TEAM_PASSWORD }
  }));
  const registro = await consultarClinico({
    method: "POST",
    recurso: "pacientes",
    claves: ["recurso"],
    json: true,
    body: { nombre: "Ana" },
    cookie: cookieDe(sesion),
    origen: "https://panel.example",
    host: "panel.example",
    env: ENV,
    ahora: AHORA,
    fetchImpl(destino, opciones) {
      assert.equal(String(destino), "https://backend-de-prueba.example/api/pacientes");
      assert.equal(opciones.method, "POST");
      assert.equal(opciones.body, JSON.stringify({ nombre: "Ana" }));
      assert.equal(opciones.headers.Authorization, `Bearer ${ENV.DASHBOARD_API_KEY}`);
      return { status: 201, async text() { return JSON.stringify({ ok: true, paciente: { id: "9", nombre: "Ana" } }); } };
    }
  });
  assert.equal(registro.status, 201);
  assert.equal(registro.body.paciente.id, "9");

  let salio = false;
  const abierta = await consultarClinico({
    method: "GET",
    recurso: "https://otro.example/secreto",
    claves: ["recurso"],
    cookie: cookieDe(sesion),
    env: ENV,
    ahora: AHORA,
    fetchImpl() {
      salio = true;
    }
  });
  const dispositivo = await consultarClinico({
    method: "POST",
    recurso: "mediciones",
    claves: ["recurso"],
    json: true,
    body: { valor: 1 },
    cookie: cookieDe(sesion),
    origen: "https://panel.example",
    host: "panel.example",
    env: ENV,
    ahora: AHORA,
    fetchImpl() {
      salio = true;
    }
  });
  assert.equal(abierta.status, 404);
  assert.equal(abierta.body.codigo, "RUTA_NO_PERMITIDA");
  assert.equal(dispositivo.status, 404);
  assert.equal(salio, false);
  assert.equal(construirDestino({ method: "GET", recurso: "mediciones", periodo: "7d", base: ENV.BACKEND_API_BASE }).destino.href, "https://backend-de-prueba.example/api/mediciones?periodo=7d");
});

test("una sesión vencida se rechaza y las funciones públicas no contienen la clave", async () => {
  const vencida = cabeceraCookie(firmar(ENV.TEAM_USERNAME, ENV.SESSION_SECRET, AHORA - 13 * 60 * 60 * 1000), true, 60);
  const resultado = await manejarSesion(peticionSesion({
    method: "GET",
    cookie: vencida.split(";")[0],
    ahora: AHORA
  }));
  assert.equal(resultado.status, 401);
  assert.equal(resultado.body.codigo, "SESION_EXPIRADA");
  assert.match(mensajeDeSesion("SESION_EXPIRADA"), /expiró/);
  assert.equal(clasificarFalloClinico({ estado: 401, codigo: "SESION_EXPIRADA" }).sesion, true);
  assert.match(rutaClinica("/api/pacientes"), /^\/api\/clinico\?recurso=pacientes$/);
  assert.match(rutaClinica("/api/mediciones?periodo=7d&paciente_id=4"), /recurso=mediciones/);
  assert.equal(rutaClinica("/api/demo/informes/PAC-DEMO-01"), null);

  const publico = ["dashboard.js", "acceso.js", "consulta-clinica.js", "config.public.js", "informes-demo.js", "index.html"];
  for (const nombre of publico) {
    const texto = fs.readFileSync(path.join(RAIZ, nombre), "utf8");
    assert.equal(texto.includes("DASHBOARD_API_KEY"), false, nombre);
    assert.equal(texto.includes(ENV.TEAM_PASSWORD), false, nombre);
    assert.equal(texto.includes(ENV.DASHBOARD_API_KEY), false, nombre);
  }
  const panel = fs.readFileSync(path.join(RAIZ, "dashboard.js"), "utf8");
  assert.match(panel, /credentials:\s*"same-origin"/);
  assert.equal(panel.includes("Authorization"), false);
  const informes = fs.readFileSync(path.join(RAIZ, "informes-demo.js"), "utf8");
  assert.match(informes, /\/api\/demo\/informes\//);
});

test("las entradas de Vercel exigen sesión antes de hablar con el backend", async () => {
  const previo = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    const sesion = await import("../api/sesion.mjs");
    const clinico = await import("../api/clinico.mjs");
    const entrada = await sesion.POST(new Request("https://panel.example/api/sesion", {
      method: "POST",
      headers: {
        origin: "https://panel.example",
        host: "panel.example",
        "content-type": "application/json",
        "x-forwarded-proto": "https"
      },
      body: JSON.stringify({ usuario: ENV.TEAM_USERNAME, contrasena: ENV.TEAM_PASSWORD })
    }));
    assert.equal(entrada.status, 200);
    const cookie = entrada.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    const sinSesion = await clinico.GET(new Request("https://panel.example/api/clinico?recurso=pacientes"));
    assert.equal(sinSesion.status, 401);
    assert.equal((await sinSesion.json()).codigo, "SESION_REQUERIDA");
  } finally {
    process.env = previo;
    reiniciarIntentos();
  }
});
