import { consultarClinico } from "./_lib/proxy.js";

function json(resultado) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  return Response.json(resultado.body, { status: resultado.status, headers });
}

async function despachar(request) {
  const url = new URL(request.url);
  let body;
  let esJson = false;
  if (request.method === "POST" || request.method === "PUT") {
    const texto = await request.text();
    if (texto.length > 32768) {
      return json({ status: 413, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "La solicitud es demasiado grande." } });
    }
    const tipo = request.headers.get("content-type") || "";
    if (texto && !/^application\/json(?:\s*;|$)/i.test(tipo)) {
      return json({ status: 415, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser JSON." } });
    }
    if (texto) {
      try {
        body = JSON.parse(texto);
      } catch {
        return json({ status: 400, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser JSON." } });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ status: 400, body: { ok: false, codigo: "SOLICITUD_INVALIDA", mensaje: "El cuerpo debe ser un objeto JSON." } });
      }
      esJson = true;
    } else {
      body = {};
      esJson = /^application\/json(?:\s*;|$)/i.test(tipo);
    }
  }
  const resultado = await consultarClinico({
    method: request.method,
    recurso: url.searchParams.get("recurso"),
    id: url.searchParams.get("id"),
    periodo: url.searchParams.get("periodo"),
    pacienteId: url.searchParams.get("paciente_id"),
    claves: [...url.searchParams.keys()],
    body,
    json: esJson,
    cookie: request.headers.get("cookie") || "",
    origen: request.headers.get("origin") || "",
    host: request.headers.get("host") || "",
    env: process.env
  });
  return json(resultado);
}

export function GET(request) {
  return despachar(request);
}

export function POST(request) {
  return despachar(request);
}

export function PUT(request) {
  return despachar(request);
}
