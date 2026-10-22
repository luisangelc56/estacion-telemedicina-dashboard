"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = "127.0.0.1";
const PUERTO_PREDETERMINADO = 5173;
const RAIZ = __dirname;
const RAIZ_REAL = fs.realpathSync(RAIZ);

const ARCHIVOS = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["dashboard.js", "text/javascript; charset=utf-8"],
  ["config.js", "text/javascript; charset=utf-8"],
  ["config.public.js", "text/javascript; charset=utf-8"],
  ["api-base.js", "text/javascript; charset=utf-8"],
  ["dashboard.css", "text/css; charset=utf-8"],
  ["dashboard-polish.css", "text/css; charset=utf-8"],
  ["dashboard-vitals.css", "text/css; charset=utf-8"],
  ["dashboard-controls.css", "text/css; charset=utf-8"],
  ["informes-demo.css", "text/css; charset=utf-8"],
  ["informes-demo.js", "text/javascript; charset=utf-8"]
]);

function leerPuerto() {
  const crudo = process.env.PORT;
  if (crudo === undefined || crudo.trim() === "") {
    return PUERTO_PREDETERMINADO;
  }
  if (!/^[1-9][0-9]{0,4}$/.test(crudo.trim())) {
    return null;
  }
  const puerto = Number(crudo.trim());
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return null;
  }
  return puerto;
}

function enviar(res, metodo, estado, cuerpo, tipo, cabecerasExtra) {
  const buffer = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo);
  const cabeceras = {
    "Content-Type": tipo,
    "Content-Length": buffer.length,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...cabecerasExtra
  };
  res.writeHead(estado, cabeceras);
  res.end(metodo === "HEAD" ? undefined : buffer);
}

function enviarTexto(res, metodo, estado, mensaje, cabecerasExtra) {
  enviar(res, metodo, estado, mensaje, "text/plain; charset=utf-8", cabecerasExtra);
}

function clasificarRuta(urlRecibida) {
  const consulta = urlRecibida.indexOf("?");
  const cruda = consulta === -1 ? urlRecibida : urlRecibida.slice(0, consulta);
  if (/\.\.|%2e|%2f|%5c|\\/i.test(cruda)) {
    return { estado: 403 };
  }
  let ruta;
  try {
    ruta = new URL(urlRecibida, `http://${HOST}`).pathname;
  } catch {
    return { estado: 400 };
  }
  if (ruta.includes("\\") || ruta.includes("\0")) {
    return { estado: 400 };
  }
  let decodificada;
  try {
    decodificada = decodeURIComponent(ruta);
  } catch {
    return { estado: 400 };
  }
  if (decodificada.includes("\\") || decodificada.includes("\0") || decodificada.includes("%")) {
    return { estado: 400 };
  }
  if (decodificada === "/") {
    return { archivo: "index.html" };
  }
  if (!decodificada.startsWith("/")) {
    return { estado: 403 };
  }
  const segmentos = decodificada.slice(1).split("/");
  if (segmentos.some((segmento) => segmento === "" || segmento === "." || segmento === "..")) {
    return { estado: 403 };
  }
  if (segmentos.some((segmento) => segmento.startsWith(".") || segmento === "secrets" || segmento === "node_modules")) {
    return { estado: 403 };
  }
  if (segmentos.length !== 1 || !ARCHIVOS.has(segmentos[0])) {
    return { estado: 404 };
  }
  return { archivo: segmentos[0] };
}

function archivoDentroDeRaiz(nombre) {
  const candidato = path.resolve(RAIZ, nombre);
  const relativo = path.relative(RAIZ, candidato);
  if (relativo.startsWith(`..${path.sep}`) || relativo === ".." || path.isAbsolute(relativo)) {
    return null;
  }
  let real;
  try {
    real = fs.realpathSync(candidato);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { estado: 404 };
    }
    return { estado: 403 };
  }
  const relativoReal = path.relative(RAIZ_REAL, real);
  const sale = relativoReal === "" || relativoReal === ".." || relativoReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativoReal);
  if (sale) {
    return { estado: 403 };
  }
  let estadistica;
  try {
    estadistica = fs.statSync(real);
  } catch {
    return { estado: 403 };
  }
  if (!estadistica.isFile()) {
    return { estado: 404 };
  }
  return { ruta: real };
}

async function servirArchivo(res, metodo, nombre) {
  const ubicacion = archivoDentroDeRaiz(nombre);
  if (!ubicacion || ubicacion.estado) {
    enviarTexto(res, metodo, ubicacion ? ubicacion.estado : 403, ubicacion && ubicacion.estado === 404 ? "No encontrado" : "No disponible");
    return;
  }
  let contenido;
  try {
    contenido = await fs.promises.readFile(ubicacion.ruta);
  } catch (error) {
    const estado = error.code === "ENOENT" ? 404 : 403;
    enviarTexto(res, metodo, estado, estado === 404 ? "No encontrado" : "No disponible");
    return;
  }
  enviar(res, metodo, 200, contenido, ARCHIVOS.get(nombre));
}

function crearServidor() {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      enviarTexto(res, req.method, 405, "Método no permitido", { Allow: "GET, HEAD" });
      return;
    }
    if (!req.url || req.url.length > 2048) {
      enviarTexto(res, req.method, 400, "Solicitud no válida");
      return;
    }
    const clasificacion = clasificarRuta(req.url);
    if (clasificacion.estado) {
      const mensaje = clasificacion.estado === 404 ? "No encontrado" : clasificacion.estado === 400 ? "Solicitud no válida" : "No disponible";
      enviarTexto(res, req.method, clasificacion.estado, mensaje);
      return;
    }
    servirArchivo(res, req.method, clasificacion.archivo).catch(() => {
      if (!res.headersSent) {
        enviarTexto(res, req.method, 500, "No se pudo leer el recurso");
      }
    });
  });
}

function iniciar() {
  const puerto = leerPuerto();
  if (puerto === null) {
    console.error("PORT debe ser un entero entre 1 y 65535.");
    process.exit(1);
  }
  const servidor = crearServidor();
  servidor.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`No se pudo iniciar: el puerto ${puerto} ya está en uso.`);
    } else if (error.code === "EACCES") {
      console.error(`No se pudo iniciar: no hay permiso para escuchar en el puerto ${puerto}.`);
    } else {
      console.error("No se pudo iniciar el servidor.");
    }
    process.exit(1);
  });
  servidor.listen(puerto, HOST, () => {
    console.log(`Panel disponible en http://${HOST}:${puerto}`);
  });
}

iniciar();
