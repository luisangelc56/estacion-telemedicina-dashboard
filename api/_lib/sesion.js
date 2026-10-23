"use strict";

const crypto = require("node:crypto");

const NOMBRE_COOKIE = "telemedicina_sesion";
const DURACION_MS = 12 * 60 * 60 * 1000;
const VENTANA_INTENTOS_MS = 10 * 60 * 1000;
const MAXIMO_INTENTOS = 8;
const intentos = new Map();

function texto(valor) {
  return typeof valor === "string" ? valor : "";
}

function configurado(valor, minimo, maximo) {
  return /^[\x21-\x7E]+$/.test(valor) && valor.length >= minimo && valor.length <= maximo;
}

function huella(valor, secreto) {
  return crypto.createHmac("sha256", secreto).update(texto(valor)).digest();
}

function iguales(recibido, esperado, secreto) {
  return crypto.timingSafeEqual(huella(recibido, secreto), huella(esperado, secreto));
}

function leerConfiguracion(env) {
  const usuario = texto(env.TEAM_USERNAME).trim();
  const contrasena = texto(env.TEAM_PASSWORD);
  const secreto = texto(env.SESSION_SECRET).trim();
  if (!configurado(usuario, 3, 64) || !configurado(contrasena, 12, 128) || !configurado(secreto, 32, 256)) {
    return null;
  }
  return { usuario, contrasena, secreto };
}

function firmar(usuario, secreto, ahora) {
  const cuerpo = Buffer.from(JSON.stringify({ v: 1, u: usuario, exp: ahora + DURACION_MS })).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

function verificar(token, secreto, ahora) {
  if (!token) return { estado: "ausente" };
  const punto = token.indexOf(".");
  if (punto <= 0 || punto !== token.lastIndexOf(".")) return { estado: "invalida" };
  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  const recibida = Buffer.from(firma);
  const calculada = Buffer.from(esperada);
  if (recibida.length !== calculada.length || !crypto.timingSafeEqual(recibida, calculada)) {
    return { estado: "invalida" };
  }
  let datos;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return { estado: "invalida" };
  }
  if (!datos || datos.v !== 1 || typeof datos.u !== "string" || typeof datos.exp !== "number") {
    return { estado: "invalida" };
  }
  if (datos.exp <= ahora) return { estado: "expirada" };
  return { estado: "valida", usuario: datos.u };
}

function leerCookie(cabecera) {
  if (typeof cabecera !== "string") return "";
  for (const parte of cabecera.split(";")) {
    const separado = parte.trim();
    const igual = separado.indexOf("=");
    if (igual <= 0) continue;
    if (separado.slice(0, igual) === NOMBRE_COOKIE) return separado.slice(igual + 1);
  }
  return "";
}

function cabeceraCookie(token, segura, maxAge) {
  const partes = [`${NOMBRE_COOKIE}=${token}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAge}`];
  if (segura) partes.push("Secure");
  return partes.join("; ");
}

function direccion(encabezado) {
  if (typeof encabezado !== "string" || encabezado.trim() === "") return "desconocida";
  const partes = encabezado.split(",").map((parte) => parte.trim()).filter(Boolean);
  return partes[partes.length - 1] || "desconocida";
}

function origenPermitido(origen, host) {
  if (typeof origen !== "string" || typeof host !== "string" || host.trim() === "") return false;
  try {
    return new URL(origen).host === host.trim();
  } catch {
    return false;
  }
}

function claveIntento(ip, usuario) {
  return crypto.createHash("sha256").update(`${ip}\n${usuario}`).digest("hex");
}

function registrarFallo(ip, usuario, ahora) {
  const clave = claveIntento(ip, usuario);
  const previos = (intentos.get(clave) || []).filter((momento) => ahora - momento < VENTANA_INTENTOS_MS);
  previos.push(ahora);
  intentos.set(clave, previos);
  return previos.length > MAXIMO_INTENTOS;
}

function bloqueado(ip, usuario, ahora) {
  const clave = claveIntento(ip, usuario);
  const previos = (intentos.get(clave) || []).filter((momento) => ahora - momento < VENTANA_INTENTOS_MS);
  intentos.set(clave, previos);
  return previos.length >= MAXIMO_INTENTOS;
}

function reiniciarIntentos() {
  intentos.clear();
}

function limpiarIntentos(ip, usuario) {
  intentos.delete(claveIntento(ip, usuario));
}

function sesionActual(peticion) {
  const env = peticion.env || process.env;
  const ahora = peticion.ahora || Date.now();
  const configuracion = leerConfiguracion(env);
  if (!configuracion) {
    return { status: 503, body: { ok: false, codigo: "ACCESO_NO_CONFIGURADO", mensaje: "El acceso del equipo no está configurado." } };
  }
  const token = leerCookie(peticion.cookie);
  const verificacion = verificar(token, configuracion.secreto, ahora);
  if (verificacion.estado === "expirada") {
    return { status: 401, body: { ok: false, codigo: "SESION_EXPIRADA", mensaje: "La sesión del equipo expiró. Vuelva a iniciar sesión." } };
  }
  if (verificacion.estado !== "valida" || verificacion.usuario !== configuracion.usuario) {
    return { status: 401, body: { ok: false, codigo: "SESION_REQUERIDA", mensaje: "Inicie sesión para consultar los datos clínicos." } };
  }
  return { status: 200, body: { ok: true, usuario: verificacion.usuario }, configuracion };
}

async function manejarSesion(peticion) {
  const method = peticion.method;
  const env = peticion.env || process.env;
  const ahora = peticion.ahora || Date.now();
  const segura = peticion.seguro === true;
  if (method === "GET") {
    const actual = sesionActual({ ...peticion, env, ahora });
    return { status: actual.status, body: actual.body };
  }
  if (method !== "POST" && method !== "DELETE") {
    return { status: 405, body: { ok: false, codigo: "METODO_NO_PERMITIDO", mensaje: "Método no permitido." } };
  }
  if (!origenPermitido(peticion.origen, peticion.host)) {
    return { status: 403, body: { ok: false, codigo: "ORIGEN_NO_PERMITIDO", mensaje: "El origen de la solicitud no está permitido." } };
  }
  if (method === "DELETE") {
    return {
      status: 200,
      body: { ok: true },
      cookie: cabeceraCookie("", segura, 0)
    };
  }
  const cuerpo = peticion.body;
  const usuario = cuerpo && typeof cuerpo.usuario === "string" ? cuerpo.usuario.trim() : "";
  const contrasena = cuerpo && typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
  const ip = direccion(peticion.reenviado);
  if (bloqueado(ip, usuario, ahora)) {
    return { status: 429, body: { ok: false, codigo: "LIMITE_INTENTOS", mensaje: "Demasiados intentos. Espere unos minutos e inténtelo de nuevo." } };
  }
  const configuracion = leerConfiguracion(env);
  if (!configuracion) {
    return { status: 503, body: { ok: false, codigo: "ACCESO_NO_CONFIGURADO", mensaje: "El acceso del equipo no está configurado." } };
  }
  const usuarioOk = iguales(usuario, configuracion.usuario, configuracion.secreto);
  const contrasenaOk = iguales(contrasena, configuracion.contrasena, configuracion.secreto);
  if (!usuarioOk || !contrasenaOk) {
    registrarFallo(ip, usuario, ahora);
    return { status: 401, body: { ok: false, codigo: "CREDENCIALES_INVALIDAS", mensaje: "Usuario o contraseña incorrectos." } };
  }
  limpiarIntentos(ip, usuario);
  return {
    status: 200,
    body: { ok: true, usuario: configuracion.usuario },
    cookie: cabeceraCookie(firmar(configuracion.usuario, configuracion.secreto, ahora), segura, Math.floor(DURACION_MS / 1000))
  };
}

module.exports = {
  NOMBRE_COOKIE,
  DURACION_MS,
  leerConfiguracion,
  firmar,
  verificar,
  leerCookie,
  cabeceraCookie,
  origenPermitido,
  sesionActual,
  manejarSesion,
  reiniciarIntentos
};
