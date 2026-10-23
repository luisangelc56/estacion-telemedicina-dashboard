"use strict";

const { sesionActual, origenPermitido } = require("./sesion");

const CONSULTAS = new Set(["periodo", "paciente_id"]);

function basePermitida(valor, permitirHttp) {
  if (typeof valor !== "string" || valor.trim() === "") return null;
  let url;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const https = url.protocol === "https:";
  const httpLocal = permitirHttp === true && url.protocol === "http:";
  if (!https && !httpLocal) return null;
  if (!url.hostname) return null;
  return url.origin;
}

function idValido(valor) {
  if (typeof valor !== "string" || !/^[1-9]\d*$/.test(valor)) return false;
  try {
    return BigInt(valor) <= 9223372036854775807n;
  } catch {
    return false;
  }
}

function construirDestino(peticion) {
  const base = basePermitida(peticion.base, peticion.permitirHttp);
  if (!base) return { error: { status: 503, codigo: "ACCESO_NO_CONFIGURADO", mensaje: "El servicio clínico no está configurado." } };
  const recurso = peticion.recurso;
  const method = peticion.method;
  const id = peticion.id;
  if (recurso === "estacion") {
    if (method !== "GET" && method !== "POST") {
      return { error: { status: 405, codigo: "METODO_NO_PERMITIDO", mensaje: "Método no permitido." } };
    }
    const claves = Array.isArray(peticion.claves) ? peticion.claves : [];
    if (claves.some((clave) => clave !== "recurso" && clave !== "accion")) {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La consulta incluye parámetros no permitidos." } };
    }
    if (peticion.accion && peticion.accion !== "finalizar") {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La acción no es válida." } };
    }
    if (method === "GET" && peticion.accion) {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La consulta incluye parámetros no permitidos." } };
    }
    const destino = new URL(`${base}/api/estacion/sesion`);
    if (method === "POST" && peticion.accion === "finalizar") destino.pathname += "/finalizar";
    return { destino };
  }
  if (recurso !== "pacientes" && recurso !== "mediciones" && recurso !== "informes") {
    return { error: { status: 404, codigo: "RUTA_NO_PERMITIDA", mensaje: "Esa consulta no está permitida." } };
  }
  const claves = Array.isArray(peticion.claves) ? peticion.claves : [];
  const detalle = id !== undefined && id !== null && id !== "";
  if (recurso === "informes") {
    if (method !== "GET" || !detalle || !idValido(id)) {
      return { error: { status: method === "GET" ? 400 : 404, codigo: method === "GET" ? "SOLICITUD_INVALIDA" : "RUTA_NO_PERMITIDA", mensaje: method === "GET" ? "El identificador del paciente no es válido." : "Esa consulta no está permitida." } };
    }
    if (claves.some((clave) => clave !== "recurso" && clave !== "id")) {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La consulta incluye parámetros no permitidos." } };
    }
    return { destino: new URL(`${base}/api/informes/${id}`) };
  }
  if (claves.some((clave) => clave !== "recurso" && clave !== "id" && !CONSULTAS.has(clave))) {
    return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La consulta incluye parámetros no permitidos." } };
  }
  if (recurso === "mediciones") {
    if (method !== "GET" || detalle) {
      return { error: { status: 404, codigo: "RUTA_NO_PERMITIDA", mensaje: "Esa consulta no está permitida." } };
    }
  } else if (method === "GET" && !detalle) {
    if (peticion.periodo || peticion.pacienteId) {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "La consulta de pacientes no admite esos filtros." } };
    }
  } else if (method === "GET" || method === "PUT") {
    if (!detalle || !idValido(id)) {
      return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "El identificador del paciente no es válido." } };
    }
  } else if (method === "POST") {
    if (detalle) return { error: { status: 404, codigo: "RUTA_NO_PERMITIDA", mensaje: "Esa consulta no está permitida." } };
  } else {
    return { error: { status: 405, codigo: "METODO_NO_PERMITIDO", mensaje: "Método no permitido." } };
  }
  if (peticion.periodo !== undefined && peticion.periodo !== null && peticion.periodo !== "" && !["24h", "7d", "30d"].includes(peticion.periodo)) {
    return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "El periodo no es válido." } };
  }
  if (peticion.pacienteId !== undefined && peticion.pacienteId !== null && peticion.pacienteId !== "" && !idValido(peticion.pacienteId)) {
    return { error: { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "El identificador del paciente no es válido." } };
  }
  const destino = new URL(`${base}/api/${recurso}`);
  if (detalle) destino.pathname += `/${id}`;
  if (peticion.periodo) destino.searchParams.set("periodo", peticion.periodo);
  if (peticion.pacienteId) destino.searchParams.set("paciente_id", peticion.pacienteId);
  return { destino };
}

function claveDashboard(env) {
  const clave = typeof env.DASHBOARD_API_KEY === "string" ? env.DASHBOARD_API_KEY.trim() : "";
  return /^[\x21-\x7E]{24,256}$/.test(clave) ? clave : "";
}

async function consultarClinico(peticion) {
  const method = peticion.method;
  if (method === "POST" || method === "PUT") {
    if (!origenPermitido(peticion.origen, peticion.host)) {
      return { status: 403, body: { ok: false, codigo: "ORIGEN_NO_PERMITIDO", mensaje: "El origen de la solicitud no está permitido." } };
    }
  }
  const actual = sesionActual(peticion);
  if (actual.status !== 200) return { status: actual.status, body: actual.body };
  const env = peticion.env || process.env;
  const clave = claveDashboard(env);
  if (!clave) {
    return { status: 503, body: { ok: false, codigo: "ACCESO_NO_CONFIGURADO", mensaje: "El servicio clínico no está configurado." } };
  }
  const construido = construirDestino({ ...peticion, base: env.BACKEND_API_BASE });
  if (construido.error) {
    return { status: construido.error.status, body: { ok: false, codigo: construido.error.codigo, mensaje: construido.error.mensaje } };
  }
  const fetchImpl = peticion.fetchImpl || fetch;
  const encabezados = { Accept: "application/json", Authorization: `Bearer ${clave}` };
  let cuerpo;
  if (method === "POST" || method === "PUT") {
    if (!peticion.json) {
      return { status: 415, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser JSON." } };
    }
    encabezados["Content-Type"] = "application/json";
    cuerpo = JSON.stringify(peticion.body && typeof peticion.body === "object" ? peticion.body : {});
  }
  let respuesta;
  const tiempoMs = peticion.recurso === "informes" ? 36000 : peticion.tiempoMs || 12000;
  try {
    respuesta = await fetchImpl(construido.destino, {
      method,
      headers: encabezados,
      body: cuerpo,
      redirect: "manual",
      signal: AbortSignal.timeout(tiempoMs)
    });
  } catch {
    return { status: 502, body: { ok: false, codigo: "CONEXION_FALLIDA", mensaje: "No se pudo consultar el servicio clínico." } };
  }
  if (respuesta.status >= 300 && respuesta.status < 400) {
    return { status: 502, body: { ok: false, codigo: "RESPUESTA_INVALIDA", mensaje: "El servicio clínico devolvió una respuesta inesperada." } };
  }
  const texto = typeof respuesta.text === "function" ? await respuesta.text() : "";
  if (texto.length > 1_000_000) {
    return { status: 502, body: { ok: false, codigo: "RESPUESTA_INVALIDA", mensaje: "El servicio clínico devolvió una respuesta inesperada." } };
  }
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    return { status: 502, body: { ok: false, codigo: "RESPUESTA_INVALIDA", mensaje: "El servicio clínico devolvió una respuesta inesperada." } };
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    return { status: 502, body: { ok: false, codigo: "CLAVE_NO_ACEPTADA", mensaje: "El servicio rechazó el acceso clínico." } };
  }
  return { status: respuesta.status, body: datos };
}

module.exports = { basePermitida, idValido, construirDestino, claveDashboard, consultarClinico };
