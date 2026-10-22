import { manejarSesion } from "./_lib/sesion.js";

function segura(request) {
  return request.headers.get("x-forwarded-proto") === "https";
}

function json(resultado) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (resultado.cookie) headers.set("Set-Cookie", resultado.cookie);
  return Response.json(resultado.body, { status: resultado.status, headers });
}

async function cuerpo(request) {
  const texto = await request.text();
  if (texto.length > 4096) {
    return { error: { status: 413, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "La solicitud es demasiado grande." } } };
  }
  if (!texto) return { valor: {} };
  const tipo = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(tipo)) {
    return { error: { status: 415, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser JSON." } } };
  }
  try {
    const valor = JSON.parse(texto);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
      return { error: { status: 400, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser un objeto JSON." } } };
    }
    return { valor };
  } catch {
    return { error: { status: 400, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser JSON." } } };
  }
}

function comun(request) {
  return {
    headers: request.headers,
    cookie: request.headers.get("cookie") || "",
    origen: request.headers.get("origin") || "",
    host: request.headers.get("host") || "",
    reenviado: request.headers.get("x-forwarded-for") || "",
    seguro: segura(request),
    env: process.env
  };
}

export async function GET(request) {
  return json(await manejarSesion({ method: "GET", ...comun(request) }));
}

export async function POST(request) {
  const leido = await cuerpo(request);
  if (leido.error) return json(leido.error);
  return json(await manejarSesion({ method: "POST", body: leido.valor, ...comun(request) }));
}

export async function DELETE(request) {
  return json(await manejarSesion({ method: "DELETE", ...comun(request) }));
}
