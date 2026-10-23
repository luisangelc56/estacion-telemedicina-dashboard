const PALETA = ["#3dccc4", "#7eb6e8", "#8ee8e2", "#5aa8b0", "#c4ddd6", "#4f8f9a", "#9ecfc8"];
function tono(nombre, respaldo) {
  const raiz = document.body;
  if (!raiz || typeof getComputedStyle !== "function") return respaldo;
  const valor = getComputedStyle(raiz).getPropertyValue(nombre).trim();
  return valor || respaldo;
}
function paletaActiva() {
  return PALETA.map((respaldo, index) => tono(`--chart-${index + 1}`, respaldo));
}
function marcarServicio(estado) {
  const punto = $("api-dot");
  if (!punto) return;
  punto.dataset.state = estado;
  punto.style.background = "";
  punto.style.boxShadow = "";
}
const $ = (id) => document.getElementById(id);
const resolucionApi = window.TELEMEDICINA_API.resolverApiBase(window.location, window.TELEMEDICINA_CONFIG);
const API_BASE = resolucionApi.base || "";
const ERROR_API = resolucionApi.error || "";
function urlDeApi(ruta) {
  if (!API_BASE) {
    throw new Error(ERROR_API || "El servicio no está disponible en este momento.");
  }
  return window.TELEMEDICINA_API.urlDeApi(API_BASE, ruta);
}
let mediciones = [];
let pacientes = [];
let busquedaPaciente = "";
let tipoActual = "";
let pacienteActual = "";
let periodoActual = "7d";
let comparacionActiva = false;
let pacientesComparacion = ["", ""];
let medicionesComparacion = [[], []];
let cargando = false;
let consultaClinicaBloqueada = false;
let sesionActiva = false;
let pacienteDetalleActual = null;
let lecturasDetalleActuales = [];
let secuenciaDetallePaciente = 0;
const vistaPacientesVue = window.Vue ? window.Vue.createApp({
  data: () => ({ pacientes: [], mensajeVacio: "Aún no hay pacientes registrados." }),
  methods: {
    nombre: (paciente) => nombrePaciente(paciente),
    iniciales(paciente) {
      return this.nombre(paciente).split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join("").toUpperCase();
    },
    contacto: (paciente) => `ID ${paciente.id} · ${paciente.correo || paciente.telefono || "Sin contacto"}`,
    fechaRegistro: (valor) => fecha(valor, { year: "numeric" })
  }
}).mount("#patient-list") : null;

function fecha(valor, opciones = {}) {
  if (!valor) return "-";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return "-";
  const formato = Object.keys(opciones).length ? opciones : { dateStyle: "medium" };
  return new Intl.DateTimeFormat("es-GT", formato).format(date);
}
function fechaHora(valor) {
  if (!valor) return "-";
  const date = new Date(valor);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function fechaLocal(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || ""));
  if (!partes) return fecha(valor);
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
}
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? new Intl.NumberFormat("es-GT", { maximumFractionDigits: 2 }).format(n) : "-";
}
function animarContador(id, objetivo) {
  const elemento = $(id);
  const destino = Number(objetivo) || 0;
  const inicio = Number(elemento.dataset.count || 0);
  elemento.dataset.count = String(destino);
  if (inicio === destino || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elemento.textContent = numero(destino);
    return;
  }
  const marca = performance.now();
  const duracion = 720;
  const avanzar = (ahora) => {
    const progreso = Math.min((ahora - marca) / duracion, 1);
    const suavizado = 1 - Math.pow(1 - progreso, 3);
    elemento.textContent = numero(Math.round(inicio + (destino - inicio) * suavizado));
    if (progreso < 1) requestAnimationFrame(avanzar);
  };
  requestAnimationFrame(avanzar);
}
function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function nombrePaciente(paciente) {
  if (!paciente) return "Sin asignar";
  return [paciente.nombre, paciente.apellido].filter(Boolean).join(" ") || `Paciente #${paciente.id}`;
}
function coincidePaciente(paciente, consulta) {
  if (!consulta) return true;
  const datos = [nombrePaciente(paciente), paciente.id, paciente.correo, paciente.telefono].join(" ");
  return normalizarTipo(datos).includes(normalizarTipo(consulta.trim()));
}
function antiguedadLectura(valor) {
  const fechaLectura = new Date(valor).getTime();
  if (!Number.isFinite(fechaLectura)) return { estado: "unknown", texto: "Fecha no disponible" };
  const diferencia = Date.now() - fechaLectura;
  if (diferencia < -60_000) return { estado: "future", texto: "Fecha no válida" };
  if (diferencia <= 60_000) return { estado: "fresh", texto: "Recibida hace menos de 1 min · reciente" };
  const minutos = Math.floor(diferencia / 60_000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);
  const tiempo = dias ? `Hace ${dias} ${dias === 1 ? "día" : "días"}` : horas ? `Hace ${horas} ${horas === 1 ? "hora" : "horas"}` : `Hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const desactualizada = diferencia > 15 * 60_000;
  return { estado: desactualizada ? "stale" : "fresh", texto: `${tiempo} · ${desactualizada ? "sin actualizar" : "reciente"}` };
}
function notificarPacientesInforme() {
  const lista = sesionActiva ? pacientes : [];
  window.TELEMEDICINA_REGISTRADOS = lista;
  const recibir = window.TELEMEDICINA_INFORMES && window.TELEMEDICINA_INFORMES.recibirPacientes;
  if (typeof recibir === "function") recibir(lista);
}
function escribirPastilla(texto, restringido) {
  const etiqueta = $("live-label");
  if (etiqueta) etiqueta.textContent = texto;
  const pastilla = document.querySelector(".live-pill");
  if (pastilla) pastilla.classList.toggle("is-restricted", restringido);
}
function mostrarAcceso(mensaje) {
  const panel = $("access-panel");
  if (panel) panel.hidden = false;
  const salir = $("logout-button");
  if (salir) salir.hidden = true;
  const estado = $("access-status");
  if (!estado) return;
  if (mensaje) {
    estado.textContent = mensaje;
    estado.hidden = false;
  } else {
    estado.textContent = "";
    estado.hidden = true;
  }
}
function ocultarAcceso() {
  const panel = $("access-panel");
  if (panel) panel.hidden = true;
  const salir = $("logout-button");
  if (salir) salir.hidden = false;
  const estado = $("access-status");
  if (estado) estado.hidden = true;
}
function presentarSinSesion() {
  const clasificacion = window.TELEMEDICINA_CONSULTA.clasificarFalloClinico({ codigo: "SESION_REQUERIDA" });
  $("error-banner").hidden = true;
  $("api-status").textContent = clasificacion.servicio;
  marcarServicio("restricted");
  escribirPastilla(clasificacion.pastilla, true);
  $("measurement-rows").innerHTML = `<tr><td colspan="5" class="loading-cell">${escapar(clasificacion.mediciones)}</td></tr>`;
  if (vistaPacientesVue) {
    vistaPacientesVue.pacientes = [];
    vistaPacientesVue.mensajeVacio = clasificacion.pacientes;
  } else {
    $("patient-list").innerHTML = `<div class="loading-cell">${escapar(clasificacion.pacientes)}</div>`;
  }
  $("chart-empty").hidden = false;
  $("chart-empty-message").textContent = "Inicia sesión para consultar las lecturas.";
  $("chart-show-all").hidden = true;
  $("updated-at").textContent = "Esperando acceso del equipo";
  notificarPacientesInforme();
}
function mostrarFalloDeCarga(error) {
  const clasificacion = window.TELEMEDICINA_CONSULTA.clasificarFalloClinico(error);
  consultaClinicaBloqueada = clasificacion.restringido;
  if (clasificacion.sesion) {
    sesionActiva = false;
    mostrarAcceso(clasificacion.mensaje);
  }
  $("error-message").textContent = !API_BASE && ERROR_API && !clasificacion.restringido ? ERROR_API : clasificacion.mensaje;
  $("error-banner").hidden = false;
  $("error-banner").classList.toggle("is-restricted", clasificacion.restringido);
  $("api-status").textContent = clasificacion.servicio;
  marcarServicio(clasificacion.restringido ? "restricted" : "down");
  escribirPastilla(clasificacion.pastilla === "En vivo" ? "No disponible" : clasificacion.pastilla, clasificacion.restringido);
  $("measurement-rows").innerHTML = `<tr><td colspan="5" class="loading-cell">${escapar(clasificacion.mediciones)}</td></tr>`;
  if (vistaPacientesVue) {
    vistaPacientesVue.pacientes = [];
    vistaPacientesVue.mensajeVacio = clasificacion.pacientes;
  } else {
    $("patient-list").innerHTML = `<div class="loading-cell">${escapar(clasificacion.pacientes)}</div>`;
  }
  $("chart-empty").hidden = !clasificacion.restringido;
  if (clasificacion.restringido) {
    $("chart-empty-message").textContent = "Las lecturas clínicas requieren autorización.";
    $("chart-show-all").hidden = true;
    $("updated-at").textContent = "Datos clínicos protegidos";
  } else {
    $("updated-at").textContent = "Sin actualización";
  }
  console.error(error);
}
async function obtener(url) {
  const destino = window.TELEMEDICINA_CONSULTA.rutaClinica(url);
  if (!destino) throw new Error("Consulta no permitida");
  const response = await fetch(destino, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  const cuerpo = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallo = new Error(`Error ${response.status} al consultar ${url}`);
    fallo.estado = response.status;
    fallo.codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo : "";
    throw fallo;
  }
  return cuerpo;
}
async function cargar(opciones = {}) {
  const manual = opciones.manual === true;
  if (!window.TELEMEDICINA_CONSULTA.debeConsultarDatosClinicos(consultaClinicaBloqueada, manual)) return;
  if (cargando) return;
  cargando = true;
  const button = $("refresh-button");
  const filtroPaciente = $("patient-filter");
  const controles = [button, filtroPaciente, $("context-add-patient"), $("period-filter"), $("compare-toggle"), $("compare-one"), $("compare-two")];
  controles.forEach((control) => { control.disabled = true; });
  button.setAttribute("aria-busy", "true");
  document.body.classList.add("is-refreshing");
  try {
    const parametros = new URLSearchParams({ periodo: periodoActual });
    if (pacienteActual) parametros.set("paciente_id", pacienteActual);
    const solicitudes = [obtener(`/api/mediciones?${parametros}`), obtener("/api/pacientes")];
    if (comparacionActiva && pacientesComparacion[0] && pacientesComparacion[1]) {
      solicitudes.push(...pacientesComparacion.map((id) => obtener(`/api/mediciones?${new URLSearchParams({ periodo: periodoActual, paciente_id: id })}`)));
    }
    const respuestas = await Promise.all(solicitudes);
    const [resMediciones, resPacientes] = respuestas;
    mediciones = Array.isArray(resMediciones.mediciones) ? resMediciones.mediciones : [];
    pacientes = Array.isArray(resPacientes.pacientes) ? resPacientes.pacientes : [];
    medicionesComparacion = comparacionActiva && respuestas.length > 2
      ? respuestas.slice(2).map((respuesta) => Array.isArray(respuesta.mediciones) ? respuesta.mediciones : [])
      : [[], []];
    consultaClinicaBloqueada = false;
    sesionActiva = true;
    notificarPacientesInforme();
    ocultarAcceso();
    $("error-banner").hidden = true;
    $("error-banner").classList.remove("is-restricted");
    $("api-status").textContent = "Disponible";
    marcarServicio("up");
    escribirPastilla("Servicio activo", false);
    $("updated-at").textContent = `Actualizado ${new Intl.DateTimeFormat("es-GT", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    dibujar();
  } catch (error) {
    mostrarFalloDeCarga(error);
  } finally {
    controles.forEach((control) => { control.disabled = false; });
    $("compare-toggle").disabled = pacientes.length < 2;
    button.removeAttribute("aria-busy");
    document.body.classList.remove("is-refreshing");
    cargando = false;
  }
}
function dibujar() {
  const porTipo = new Map();
  for (const lectura of mediciones) porTipo.set(lectura.tipo, (porTipo.get(lectura.tipo) || 0) + 1);
  const tipos = [...porTipo.keys()];
  if (!tipoActual || !porTipo.has(tipoActual)) tipoActual = tipos[0] || "";
  animarContador("patient-count", pacientes.length);
  animarContador("measurement-count", mediciones.length);
  animarContador("type-count", tipos.length);
  $("patient-badge").textContent = numero(pacientes.length);
  $("patient-search").value = busquedaPaciente;
  const filtroPaciente = $("patient-filter");
  const pacientesCoincidentes = pacientes.filter((paciente) => coincidePaciente(paciente, busquedaPaciente));
  const pacienteSeleccionado = pacientes.find((paciente) => String(paciente.id) === pacienteActual);
  if (pacienteSeleccionado && !pacientesCoincidentes.some((paciente) => String(paciente.id) === pacienteActual)) pacientesCoincidentes.unshift(pacienteSeleccionado);
  filtroPaciente.innerHTML = '<option value="">Todos los pacientes</option>' + (pacientesCoincidentes.length
    ? pacientesCoincidentes.map((paciente) => `<option value="${escapar(paciente.id)}">${escapar(nombrePaciente(paciente))}${coincidePaciente(paciente, busquedaPaciente) ? "" : " · seleccionado"}</option>`).join("")
    : '<option value="" disabled>Sin coincidencias</option>');
  filtroPaciente.value = pacienteActual;
  $("period-filter").value = periodoActual;
  const idsPacientes = pacientes.map((paciente) => String(paciente.id));
  if (!idsPacientes.includes(pacientesComparacion[0])) pacientesComparacion[0] = idsPacientes[0] || "";
  if (!idsPacientes.includes(pacientesComparacion[1]) || pacientesComparacion[1] === pacientesComparacion[0]) {
    pacientesComparacion[1] = idsPacientes.find((id) => id !== pacientesComparacion[0]) || "";
  }
  const opcionesComparacion = (seleccionado) => '<option value="">Selecciona paciente</option>' + pacientes.map((paciente) => `<option value="${escapar(paciente.id)}">${escapar(nombrePaciente(paciente))} · #${escapar(paciente.id)}</option>`).join("");
  $("compare-one").innerHTML = opcionesComparacion(pacientesComparacion[0]);
  $("compare-two").innerHTML = opcionesComparacion(pacientesComparacion[1]);
  $("compare-one").value = pacientesComparacion[0];
  $("compare-two").value = pacientesComparacion[1];
  $("compare-toggle").checked = comparacionActiva;
  $("compare-toggle").disabled = pacientes.length < 2;
  $("compare-selects").hidden = !comparacionActiva;
  const pacienteFiltrado = pacientes.find((paciente) => String(paciente.id) === pacienteActual);
  $("view-patient-detail").hidden = !pacienteFiltrado;
  if (pacienteFiltrado) $("view-patient-detail").dataset.patientId = pacienteActual;
  const periodoTexto = { "24h": "últimas 24 horas", "7d": "últimos 7 días", "30d": "últimos 30 días" }[periodoActual];
  $("patient-context-heading").textContent = pacienteFiltrado ? nombrePaciente(pacienteFiltrado) : "Todos los pacientes";
  $("patient-context-help").textContent = pacienteFiltrado
    ? (mediciones.length ? `Viendo las lecturas de ${nombrePaciente(pacienteFiltrado)}.` : `Todavía no hay lecturas asociadas a ${nombrePaciente(pacienteFiltrado)}.`)
    : "Viendo las lecturas de toda la estación. Las mediciones sin paciente aparecen como “Sin asignar”.";
  $("vitals-caption").textContent = pacienteFiltrado ? `Última lectura guardada de ${nombrePaciente(pacienteFiltrado)}. La hora indica si es reciente o histórica.` : "Última lectura guardada de la estación. La hora indica si es reciente o histórica.";
  $("measurement-caption").textContent = pacienteFiltrado ? `Lecturas guardadas de ${nombrePaciente(pacienteFiltrado)} en las ${periodoTexto}.` : `Lecturas guardadas de las ${periodoTexto}.`;
  $("measurement-foot").textContent = pacienteFiltrado ? `Paciente · ${periodoTexto}` : `Periodo: ${periodoTexto}`;
  $("type-select").innerHTML = tipos.length ? tipos.map((tipo) => `<option value="${escapar(tipo)}">${escapar(tipo)}</option>`).join("") : '<option value="">Sin lecturas en este periodo</option>';
  $("type-select").value = tipoActual;
  const ultima = mediciones[0];
  $("last-reading").textContent = ultima ? `${numero(ultima.valor)} ${ultima.unidad || ""}` : "-";
  $("last-reading-time").textContent = ultima ? `${ultima.tipo} · ${fechaHora(ultima.registrado_en)}` : "Sin lecturas registradas";
  const estadoLectura = $("last-reading-status");
  const antiguedad = ultima ? antiguedadLectura(ultima.registrado_en) : { estado: "unknown", texto: "" };
  estadoLectura.dataset.state = antiguedad.estado;
  estadoLectura.textContent = antiguedad.texto;
  dibujarTabla();
  dibujarPacientes();
  dibujarDonut(tipos, porTipo);
  dibujarSignosVitales();
  dibujarGrafica();
}
function normalizarTipo(tipo) {
  return String(tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function seleccionarPuntos(lecturas) {
  const ordenadas = [...lecturas].sort((a, b) => new Date(a.registrado_en) - new Date(b.registrado_en));
  if (ordenadas.length <= 24) return ordenadas;
  return Array.from({ length: 24 }, (_, indice) => ordenadas[Math.round(indice * (ordenadas.length - 1) / 23)]);
}
function dibujarSignosVitales() {
  const temperatura = mediciones.find((m) => /temp|celsius/.test(normalizarTipo(m.tipo)));
  const pulso = mediciones.find((m) => /frecuencia|cardiac|cardio|pulso|heart.?rate|bpm|lpm/.test(normalizarTipo(m.tipo)));
  const rmssd = mediciones.find((m) => /rmssd|hrv|variabilidad/.test(normalizarTipo(m.tipo)));
  const actualizarTarjeta = (id, lectura, valorId, unidadId, tiempoId, unidadPredeterminada, nombreMetrica) => {
    const tarjeta = $(id);
    const tiempo = $(tiempoId);
    const edad = lectura ? antiguedadLectura(lectura.registrado_en) : { estado: "unknown", texto: "" };
    const marca = edad.estado === "fresh" ? "Lectura reciente" : edad.estado === "stale" ? "Lectura histórica" : edad.estado === "future" ? "Fecha no válida" : "Sin fecha de lectura";
    tarjeta.disabled = !lectura;
    tarjeta.dataset.tipo = lectura?.tipo || "";
    $(valorId).textContent = lectura ? numero(lectura.valor) : "-";
    $(unidadId).textContent = lectura?.unidad || unidadPredeterminada;
    tiempo.textContent = lectura ? `${marca}. ${fechaHora(lectura.registrado_en)}` : "Sin lectura guardada";
    tiempo.dataset.state = lectura ? edad.estado : "unknown";
    tarjeta.setAttribute("aria-label", lectura ? `${lectura.tipo}: ${numero(lectura.valor)} ${lectura.unidad || unidadPredeterminada}. ${marca}. ${fechaHora(lectura.registrado_en)}. Pulsa para ver la tendencia.` : `Sin lecturas guardadas de ${nombreMetrica}`);
    tarjeta.setAttribute("aria-pressed", String(Boolean(lectura && lectura.tipo === tipoActual)));
    tarjeta.classList.toggle("selected", Boolean(lectura && lectura.tipo === tipoActual));
  };
  actualizarTarjeta("vital-heart", pulso, "heart-value", "heart-unit", "heart-time", "BPM", "frecuencia cardíaca");
  actualizarTarjeta("vital-temperature", temperatura, "temperature-value", "temperature-unit", "temperature-time", "°C", "temperatura");
  actualizarTarjeta("vital-rmssd", rmssd, "rmssd-value", "rmssd-unit", "rmssd-time", "ms", "RMSSD");
  const relleno = $("thermometer-fill");
  if (temperatura && relleno) {
    const celsius = Number(temperatura.valor);
    const porcentaje = Math.max(0, Math.min(1, (celsius - 15) / 27));
    const alto = Math.round(12 + porcentaje * 56);
    relleno.setAttribute("y", String(100 - alto));
    relleno.setAttribute("height", String(alto));
  }
}
function dibujarTabla() {
  const pacientesPorId = new Map(pacientes.map((p) => [String(p.id), p]));
  if (!mediciones.length) {
    $("measurement-rows").innerHTML = '<tr><td colspan="5" class="loading-cell">Aún no hay mediciones registradas.</td></tr>';
    return;
  }
  $("measurement-rows").innerHTML = mediciones.slice(0, 6).map((m) => {
    const paciente = pacientesPorId.get(String(m.paciente_id));
    const edad = antiguedadLectura(m.registrado_en);
    const marca = edad.estado === "fresh" ? "Reciente" : edad.estado === "stale" ? "Histórica" : edad.estado === "future" ? "Fecha no válida" : "Sin fecha";
    return `<tr><td><span class="type-cell"><i class="type-dot"></i>${escapar(m.tipo)}</span></td><td class="patient-ref">${escapar(nombrePaciente(paciente))}</td><td class="value-cell">${escapar(numero(m.valor))} ${escapar(m.unidad)}</td><td>${escapar(fechaHora(m.registrado_en))}</td><td><span class="table-status" data-state="${edad.estado}">${marca}</span></td></tr>`;
  }).join("");
}
function dibujarPacientes() {
  const recientes = [...pacientes]
    .filter((paciente) => coincidePaciente(paciente, busquedaPaciente))
    .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0));
  $("patient-count-visible").textContent = busquedaPaciente ? `${recientes.length} coincidencias` : `${recientes.length} en total`;
  $("patient-foot-count").textContent = busquedaPaciente ? `Resultados para “${busquedaPaciente}”` : `Mostrando ${recientes.length} pacientes`;
  if (vistaPacientesVue) {
    vistaPacientesVue.pacientes = recientes;
    vistaPacientesVue.mensajeVacio = busquedaPaciente ? "No se encontraron pacientes con esa búsqueda." : "Aún no hay pacientes registrados.";
    return;
  }
  const lista = $("patient-list");
  lista.removeAttribute("v-cloak");
  if (!recientes.length) {
    $("patient-list").innerHTML = `<div class="loading-cell">${busquedaPaciente ? "No se encontraron pacientes con esa búsqueda." : "Aún no hay pacientes registrados."}</div>`;
    return;
  }
  $("patient-list").innerHTML = recientes.map((p) => {
    const nombre = nombrePaciente(p);
    const iniciales = nombre.split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join("").toUpperCase();
    const contacto = p.correo || p.telefono || "Sin contacto";
    return `<button class="patient-row patient-detail-trigger" type="button" data-patient-id="${escapar(p.id)}"><span class="patient-avatar">${escapar(iniciales)}</span><span class="patient-info"><strong>${escapar(nombre)}</strong><span>ID ${escapar(p.id)} | ${escapar(contacto)}</span></span><span class="patient-date">${escapar(fecha(p.creado_en, { year: "numeric" }))}</span><span class="patient-row-arrow" aria-hidden="true">&rsaquo;</span></button>`;
  }).join("");
}
function mostrarCampoDetalle(etiqueta, valor) {
  return `<div class="patient-detail-field"><span>${escapar(etiqueta)}</span><strong>${escapar(valor || "No registrado")}</strong></div>`;
}
function dibujarDetallePaciente(paciente, lecturas) {
  const nombre = nombrePaciente(paciente);
  const iniciales = nombre.split(/\s+/).slice(0, 2).map((parte) => parte.charAt(0)).join("").toUpperCase();
  $("patient-detail-avatar").textContent = iniciales || "P";
  $("patient-detail-name").textContent = nombre;
  $("patient-detail-id").textContent = `Paciente ${paciente.id}`;
  $("patient-detail-contact").innerHTML = [
    mostrarCampoDetalle("Fecha de nacimiento", fechaLocal(paciente.fecha_nacimiento)),
    mostrarCampoDetalle("Sexo", paciente.sexo),
    mostrarCampoDetalle("Telefono", paciente.telefono),
    mostrarCampoDetalle("Correo", paciente.correo),
    mostrarCampoDetalle("Direccion", paciente.direccion)
  ].join("");
  const tipos = new Set(lecturas.map((lectura) => lectura.tipo));
  const ultima = lecturas[0];
  $("detail-reading-count").textContent = numero(lecturas.length);
  $("detail-type-count").textContent = numero(tipos.size);
  $("detail-last-reading").textContent = ultima ? fechaHora(ultima.registrado_en) : "Sin lecturas";
  $("detail-measurement-note").textContent = lecturas.length === 100
    ? "Se muestran las 100 lecturas mas recientes disponibles."
    : `Se encontraron ${lecturas.length} lecturas vinculadas.`;
  $("patient-detail-rows").innerHTML = lecturas.length
    ? lecturas.slice(0, 10).map((lectura) => `<tr><td><span class="type-cell"><i class="type-dot"></i>${escapar(lectura.tipo)}</span></td><td class="value-cell">${escapar(numero(lectura.valor))} ${escapar(lectura.unidad || "")}</td><td>${escapar(fechaHora(lectura.registrado_en))}</td></tr>`).join("")
    : '<tr><td colspan="3" class="loading-cell">No hay lecturas vinculadas a este paciente.</td></tr>';
}
function descargarFichaPaciente() {
  const paciente = pacienteDetalleActual;
  if (!paciente) return;
  const lecturas = lecturasDetalleActuales.slice(0, 10);
  const campos = [
    ["ID", paciente.id],
    ["Nombre completo", nombrePaciente(paciente)],
    ["Fecha de nacimiento", fechaLocal(paciente.fecha_nacimiento)],
    ["Sexo", paciente.sexo || "No registrado"],
    ["Teléfono", paciente.telefono || "No registrado"],
    ["Correo", paciente.correo || "No registrado"],
    ["Dirección", paciente.direccion || "No registrada"]
  ];
  const filas = lecturas.length
    ? lecturas.map((lectura) => `<tr><td>${escapar(lectura.tipo || "Sin tipo")}</td><td>${escapar(numero(lectura.valor))} ${escapar(lectura.unidad || "")}</td><td>${escapar(fechaHora(lectura.registrado_en))}</td></tr>`).join("")
    : '<tr><td colspan="3">No hay lecturas vinculadas a este paciente.</td></tr>';
  const documento = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ficha de ${escapar(nombrePaciente(paciente))}</title><style>*{box-sizing:border-box}body{max-width:900px;margin:40px auto;padding:0 24px;color:#20334d;font:15px Arial,sans-serif}header{padding:22px 0;border-bottom:3px solid #0f6e73}h1{margin:0;font-size:26px}header p,small{color:#718197}.section{margin-top:26px}h2{font-size:17px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}dl div{padding:12px;border:1px solid #e2eaf0;border-radius:8px;background:#fbfcfd}dt{color:#718197;font-size:11px;text-transform:uppercase}dd{margin:5px 0 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{padding:11px;text-align:left;border-bottom:1px solid #e5ebf2}th{background:#f2f7f8;color:#53657b;font-size:11px}@media(max-width:560px){body{margin:20px auto;padding:0 14px}dl{grid-template-columns:1fr}}@media print{body{margin:0 auto;padding:0}header{break-after:avoid}tr{break-inside:avoid}}</style></head><body><header><h1>Ficha del paciente</h1><p>${escapar(nombrePaciente(paciente))} · ID ${escapar(paciente.id)}</p><small>Generada el ${escapar(fechaHora(new Date().toISOString()))}</small></header><section class="section"><h2>Datos del paciente</h2><dl>${campos.map(([etiqueta, valor]) => `<div><dt>${escapar(etiqueta)}</dt><dd>${escapar(valor)}</dd></div>`).join("")}</dl></section><section class="section"><h2>Mediciones recientes</h2><p><small>Se incluyen hasta 10 de las ${escapar(lecturasDetalleActuales.length)} lecturas consultadas.</small></p><table><thead><tr><th>Tipo</th><th>Valor</th><th>Fecha y hora</th></tr></thead><tbody>${filas}</tbody></table></section><footer class="section"><small>Documento informativo generado por la estación de telemedicina.</small></footer></body></html>`;
  const ventanaImpresion = window.open("", "_blank");
  if (!ventanaImpresion) {
    const aviso = $("patient-detail-feedback");
    aviso.textContent = "El navegador bloqueó la ventana del PDF. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.";
    aviso.hidden = false;
    return;
  }
  ventanaImpresion.document.open();
  ventanaImpresion.document.write(documento.replace("<style>", "<style>@page{size:A4;margin:18mm}"));
  ventanaImpresion.document.close();
  let impresionIniciada = false;
  const iniciarImpresion = () => {
    if (impresionIniciada || ventanaImpresion.closed) return;
    impresionIniciada = true;
    ventanaImpresion.focus();
    ventanaImpresion.print();
  };
  ventanaImpresion.addEventListener("load", () => {
    iniciarImpresion();
  }, { once: true });
  setTimeout(iniciarImpresion, 700);
}
async function mostrarDetallePaciente(id) {
  const dialogo = $("patient-detail-dialog");
  const idPaciente = String(id);
  const secuencia = ++secuenciaDetallePaciente;
  dialogo.dataset.patientId = idPaciente;
  const inicial = pacientes.find((paciente) => String(paciente.id) === idPaciente);
  pacienteDetalleActual = inicial || null;
  lecturasDetalleActuales = [];
  $("patient-detail-download").disabled = true;
  $("patient-detail-feedback").hidden = true;
  $("patient-detail-name").textContent = inicial ? nombrePaciente(inicial) : "Cargando paciente…";
  $("patient-detail-id").textContent = `Paciente ${idPaciente}`;
  $("patient-detail-contact").innerHTML = '<div class="loading-cell">Cargando datos del paciente…</div>';
  $("detail-reading-count").textContent = "-";
  $("detail-type-count").textContent = "-";
  $("detail-last-reading").textContent = "-";
  $("detail-measurement-note").textContent = "Consultando las últimas lecturas…";
  $("patient-detail-rows").innerHTML = '<tr><td colspan="3" class="loading-cell">Cargando…</td></tr>';
  if (!dialogo.open) dialogo.showModal();
  try {
    const [respuestaPaciente, respuestaMediciones] = await Promise.all([
      obtener(`/api/pacientes/${encodeURIComponent(idPaciente)}`),
      obtener(`/api/mediciones?${new URLSearchParams({ paciente_id: idPaciente })}`)
    ]);
    if (secuencia !== secuenciaDetallePaciente || !dialogo.open || dialogo.dataset.patientId !== idPaciente) return;
    const lecturas = Array.isArray(respuestaMediciones.mediciones) ? respuestaMediciones.mediciones : [];
    pacienteDetalleActual = respuestaPaciente.paciente;
    lecturasDetalleActuales = lecturas;
    dibujarDetallePaciente(respuestaPaciente.paciente, lecturas);
    $("patient-detail-download").disabled = false;
  } catch (error) {
    if (secuencia !== secuenciaDetallePaciente || !dialogo.open) return;
    $("patient-detail-download").disabled = true;
    const sinAutorizacion = error && error.estado === 401;
    $("patient-detail-contact").innerHTML = `<div class="loading-cell">${sinAutorizacion ? "No tienes autorización para ver esta ficha." : "No se pudo cargar la ficha."}</div>`;
    $("detail-measurement-note").textContent = sinAutorizacion ? "Las lecturas requieren autorización." : "No se pudieron consultar las lecturas.";
    $("patient-detail-rows").innerHTML = '<tr><td colspan="3" class="loading-cell">Vuelve a abrir la ficha para intentarlo de nuevo.</td></tr>';
  }
}
function establecerModoEdicionPaciente(edicion) {
  const paciente = pacienteDetalleActual;
  const formulario = $("patient-edit-form");
  if (!paciente) return;
  if (edicion) {
    formulario.elements.nombre.value = paciente.nombre || "";
    formulario.elements.apellido.value = paciente.apellido || "";
    formulario.elements.fecha_nacimiento.value = paciente.fecha_nacimiento ? String(paciente.fecha_nacimiento).slice(0, 10) : "";
    formulario.elements.telefono.value = paciente.telefono || "";
    formulario.elements.correo.value = paciente.correo || "";
    formulario.elements.direccion.value = paciente.direccion || "";
    const sexo = paciente.sexo || "";
    if (sexo && ![...formulario.elements.sexo.options].some((opcion) => opcion.value === sexo)) {
      formulario.elements.sexo.add(new Option(sexo, sexo));
    }
    formulario.elements.sexo.value = sexo;
    $("patient-edit-status").hidden = true;
    $("patient-edit-status").classList.remove("error");
    $("patient-detail-feedback").hidden = true;
    $("patient-detail-body").hidden = true;
    formulario.hidden = false;
    $("patient-detail-edit").hidden = true;
    $("detail-filter-patient").hidden = true;
    $("patient-detail-done").hidden = true;
    $("patient-detail-download").hidden = true;
    $("patient-edit-cancel").hidden = false;
    formulario.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    formulario.elements.nombre.focus({ preventScroll: true });
    return;
  }
  formulario.hidden = true;
  $("patient-detail-body").hidden = false;
  $("patient-detail-edit").hidden = false;
  $("detail-filter-patient").hidden = false;
  $("patient-detail-done").hidden = false;
  $("patient-detail-download").hidden = false;
  $("patient-edit-cancel").hidden = true;
}
window.verDetallePaciente = mostrarDetallePaciente;
function dibujarDonut(tipos, porTipo) {
  const total = mediciones.length;
  $("donut-total").textContent = numero(total);
  if (!total) {
    $("donut").style.background = `conic-gradient(${tono("--chart-empty", "#1e4650")} 0% 100%)`;
    $("legend-list").innerHTML = '<span class="muted">Sin datos</span>';
    return;
  }
  const colores = paletaActiva();
  let cursor = 0;
  const segmentos = tipos.map((tipo, index) => {
    const siguiente = cursor + porTipo.get(tipo) / total * 100;
    const tramo = `${colores[index % colores.length]} ${cursor}% ${siguiente}%`;
    cursor = siguiente;
    return tramo;
  });
  $("donut").style.background = `conic-gradient(${segmentos.join(",")})`;
  $("legend-list").innerHTML = tipos.slice(0, 5).map((tipo, index) => `<div class="legend-item"><i style="background:${colores[index % colores.length]}"></i><span title="${escapar(tipo)}">${escapar(tipo)}</span><strong>${porTipo.get(tipo)}</strong></div>`).join("");
  if (tipos.length > 5) $("legend-list").insertAdjacentHTML("beforeend", `<div class="legend-item"><i style="background:${tono("--chart-other", "#5f7f86")}"></i><span>Otros</span><strong>${tipos.slice(5).reduce((suma, tipo) => suma + porTipo.get(tipo), 0)}</strong></div>`);
}
function dibujarGrafica() {
  const svg = $("chart");
  const porPaciente = new Map(pacientes.map((paciente) => [String(paciente.id), `${nombrePaciente(paciente)} · #${paciente.id}`]));
  const filasPorSerie = comparacionActiva
    ? medicionesComparacion.map((lecturas, index) => ({
      nombre: porPaciente.get(pacientesComparacion[index]) || `Paciente ${index + 1}`,
      color: index === 0 ? tono("--chart-1", "#3dccc4") : tono("--chart-2", "#7eb6e8"),
      filas: seleccionarPuntos(lecturas.filter((m) => m.tipo === tipoActual && Number.isFinite(Number(m.valor))))
    }))
    : [{
      nombre: tipoActual || "Mediciones",
      color: tono("--chart-1", "#3dccc4"),
      filas: seleccionarPuntos(mediciones.filter((m) => m.tipo === tipoActual && Number.isFinite(Number(m.valor))))
    }];
  const valores = filasPorSerie.flatMap((serie) => serie.filas.map((fila) => Number(fila.valor)));
  if (!valores.length) {
    svg.innerHTML = "";
    $("chart-wrap").hidden = true;
    $("chart-empty").hidden = false;
    $("chart-latest").textContent = "-";
    const periodoLegible = { "24h": "las últimas 24 horas", "7d": "los últimos 7 días", "30d": "los últimos 30 días" }[periodoActual] || "el periodo seleccionado";
    $("chart-unit").textContent = `Sin lecturas en ${periodoLegible}`;
    const sinLecturasComparables = comparacionActiva && mediciones.length > 0;
    $("chart-empty-message").textContent = sinLecturasComparables
      ? `No hay lecturas asociadas a los pacientes elegidos en ${periodoLegible}. Puedes mostrar las lecturas generales sin atribuirlas a un paciente.`
      : mediciones.length === 0
        ? `No hay lecturas en ${periodoLegible}. Prueba con un periodo más amplio, como los últimos 7 días.`
        : `No hay lecturas de ${tipoActual || "este tipo"} para los pacientes seleccionados en ${periodoLegible}.`;
    $("chart-show-all").hidden = !sinLecturasComparables;
    $("chart-legend").innerHTML = "";
    return;
  }
  $("chart-wrap").hidden = false;
  $("chart-empty").hidden = true;
  $("chart-show-all").hidden = true;
  const max = Math.max(...valores), min = Math.min(...valores);
  const margen = Math.max((max - min) * .22, Math.abs(max || 1) * .04, .5);
  const bajo = min - margen, alto = max + margen;
  const x0 = 42, x1 = 748, y0 = 16, y1 = 192;
  const marcasTiempo = filasPorSerie.flatMap((serie) => serie.filas.map((fila) => new Date(fila.registrado_en).getTime()).filter(Number.isFinite));
  const tiempoMin = Math.min(...marcasTiempo), tiempoMax = Math.max(...marcasTiempo);
  let markup = "<defs>";
  filasPorSerie.forEach((serie, index) => { markup += `<linearGradient id="chart-fill-${index}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${serie.color}" stop-opacity=".15"/><stop offset="100%" stop-color="${serie.color}" stop-opacity="0"/></linearGradient>`; });
  markup += "</defs>";
  for (let i = 0; i < 4; i++) {
    const y = y0 + i * (y1 - y0) / 3;
    const val = alto - i * (alto - bajo) / 3;
    markup += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${tono("--chart-grid", "#1e4650")}" stroke-dasharray="3 4"/><text x="0" y="${y + 4}" fill="${tono("--chart-axis", "#b7d6d6")}" font-size="13">${escapar(numero(val))}</text>`;
  }
  filasPorSerie.forEach((serie, serieIndex) => {
    if (!serie.filas.length) return;
    const puntos = serie.filas.map((fila) => {
      const tiempo = new Date(fila.registrado_en).getTime();
      const x = tiempoMax === tiempoMin ? (x0 + x1) / 2 : x0 + (tiempo - tiempoMin) / (tiempoMax - tiempoMin) * (x1 - x0);
      const value = Number(fila.valor);
      return { x, y: y1 - (value - bajo) / (alto - bajo) * (y1 - y0), value, fila, serie };
    });
    const path = puntos.map((p, index) => `${index ? "L" : "M"}${p.x},${p.y}`).join(" ");
    if (!comparacionActiva && puntos.length > 1) {
      const area = `${path} L${puntos[puntos.length - 1].x},${y1} L${puntos[0].x},${y1} Z`;
      markup += `<path d="${area}" fill="url(#chart-fill-${serieIndex})"/>`;
    }
    markup += `<path d="${path}" fill="none" stroke="${serie.color}" style="--series-color:${serie.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    puntos.forEach((p, index) => {
      const paciente = comparacionActiva ? serie.nombre : nombrePaciente(pacientes.find((persona) => String(persona.id) === String(p.fila.paciente_id)));
      const hora = fechaHora(p.fila.registrado_en);
      const etiqueta = `${numero(p.value)} ${p.fila.unidad || ""} · ${hora} · ${paciente}`;
      markup += `<circle cx="${p.x}" cy="${p.y}" r="3.4" fill="${tono("--chart-point", "#e7f4f2")}" stroke="${serie.color}" style="--series-color:${serie.color}" stroke-width="2" tabindex="0" role="img" aria-label="${escapar(etiqueta)}" data-index="${index}" data-value="${escapar(numero(p.value))}" data-unit="${escapar(p.fila.unidad || "")}" data-time="${escapar(hora)}" data-patient="${escapar(comparacionActiva ? serie.nombre : "")}"><title>${escapar(etiqueta)}</title></circle>`;
    });
  });
  const ticks = [tiempoMin, (tiempoMin + tiempoMax) / 2, tiempoMax];
  const formatoTick = periodoActual === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" };
  ticks.forEach((tiempo, index) => {
    const x = x0 + index * (x1 - x0) / 2;
    markup += `<text x="${x}" y="${y1 + 22}" text-anchor="middle" fill="${tono("--chart-axis", "#b7d6d6")}" font-size="13">${escapar(new Intl.DateTimeFormat("es-GT", formatoTick).format(new Date(tiempo)))}</text>`;
  });
  svg.innerHTML = markup;
  const etiquetaUnidad = filasPorSerie.flatMap((serie) => serie.filas)[0]?.unidad || "";
  if (comparacionActiva) {
    const ultimas = filasPorSerie.map((serie) => serie.filas[serie.filas.length - 1]);
    $("chart-latest").textContent = ultimas.map((fila) => fila ? numero(fila.valor) : "-").join(" / ");
    $("chart-unit").textContent = `${etiquetaUnidad} · ${periodoActual}`;
    $("chart-legend").innerHTML = filasPorSerie.map((serie) => `<span class="legend-series"><i style="background:${serie.color}"></i>${escapar(serie.nombre)}</span>`).join("");
  } else {
    const reciente = filasPorSerie[0].filas[filasPorSerie[0].filas.length - 1];
    $("chart-latest").textContent = reciente ? `${numero(reciente.valor)} ${reciente.unidad || ""}` : "-";
    $("chart-unit").textContent = `Última lectura · ${fechaHora(reciente.registrado_en)}`;
    $("chart-legend").innerHTML = `<i></i><span id="chart-label">${escapar(tipoActual || "Mediciones")}</span>`;
  }
}

$("type-select").addEventListener("change", (event) => { tipoActual = event.target.value; dibujarGrafica(); });
$("patient-filter").addEventListener("change", (event) => {
  pacienteActual = event.target.value;
  cargar();
});
$("view-patient-detail").addEventListener("click", () => mostrarDetallePaciente($("view-patient-detail").dataset.patientId));
$("patient-list").addEventListener("click", (event) => {
  const fila = event.target.closest("[data-patient-id]");
  if (fila) mostrarDetallePaciente(fila.dataset.patientId);
});
$("patient-detail-close").addEventListener("click", () => $("patient-detail-dialog").close());
$("patient-detail-done").addEventListener("click", () => $("patient-detail-dialog").close());
$("patient-detail-edit").addEventListener("click", () => establecerModoEdicionPaciente(true));
$("patient-detail-download").addEventListener("click", descargarFichaPaciente);
$("patient-edit-cancel").addEventListener("click", () => establecerModoEdicionPaciente(false));
$("patient-detail-dialog").addEventListener("close", () => {
  secuenciaDetallePaciente++;
  if (!$('patient-edit-form').hidden) establecerModoEdicionPaciente(false);
});
$("patient-detail-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$("patient-edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const boton = $("patient-edit-save");
  const estado = $("patient-edit-status");
  const datos = Object.fromEntries(new FormData(form).entries());
  for (const clave of Object.keys(datos)) datos[clave] = String(datos[clave]).trim();
  if (!datos.nombre) {
    estado.textContent = "El nombre es obligatorio.";
    estado.classList.add("error");
    estado.hidden = false;
    form.elements.nombre.focus();
    return;
  }
  const id = $("patient-detail-dialog").dataset.patientId;
  boton.disabled = true;
  estado.hidden = true;
  estado.classList.remove("error");
  try {
    const destino = window.TELEMEDICINA_CONSULTA.rutaClinica(`/api/pacientes/${encodeURIComponent(id)}`);
    if (!destino) throw new Error("Consulta no permitida");
    const response = await fetch(destino, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(datos)
    });
    const resultado = await response.json().catch(() => ({}));
    if (response.status === 401 || resultado.codigo === "SESION_EXPIRADA" || resultado.codigo === "SESION_REQUERIDA") {
      sesionActiva = false;
      consultaClinicaBloqueada = true;
      mostrarAcceso(window.TELEMEDICINA_ACCESO.mensajeDeSesion(resultado.codigo || "SESION_REQUERIDA"));
      throw new Error(window.TELEMEDICINA_ACCESO.mensajeDeSesion(resultado.codigo || "SESION_REQUERIDA"));
    }
    if (!response.ok) throw new Error(resultado.mensaje || "No se pudieron guardar los cambios. Inténtalo nuevamente.");
    if (!resultado.paciente?.id) throw new Error("No se pudieron guardar los cambios. Inténtalo nuevamente.");
    pacienteDetalleActual = resultado.paciente;
    pacientes = pacientes.map((paciente) => String(paciente.id) === String(id) ? resultado.paciente : paciente);
    notificarPacientesInforme();
    dibujar();
    dibujarDetallePaciente(resultado.paciente, lecturasDetalleActuales);
    establecerModoEdicionPaciente(false);
    $("patient-detail-feedback").textContent = "Los datos del paciente se actualizaron correctamente.";
    $("patient-detail-feedback").hidden = false;
  } catch (error) {
    estado.textContent = error instanceof TypeError
      ? "No se pudo conectar. Inténtalo nuevamente más tarde."
      : error.message || "No se pudieron guardar los cambios.";
    estado.classList.add("error");
    estado.hidden = false;
  } finally {
    boton.disabled = false;
  }
});
$("detail-filter-patient").addEventListener("click", () => {
  pacienteActual = $("patient-detail-dialog").dataset.patientId || "";
  $("patient-search").value = "";
  busquedaPaciente = "";
  $("patient-detail-dialog").close();
  cargar();
  $("vitals-section")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});
$("patient-search").addEventListener("input", (event) => {
  busquedaPaciente = event.target.value;
  dibujar();
});
$("period-filter").addEventListener("change", (event) => {
  periodoActual = event.target.value;
  cargar();
});
$("compare-toggle").addEventListener("change", (event) => {
  comparacionActiva = event.target.checked;
  $("compare-selects").hidden = !comparacionActiva;
  cargar();
});
$("compare-one").addEventListener("change", (event) => {
  pacientesComparacion[0] = event.target.value;
  if (pacientesComparacion[0] && pacientesComparacion[0] === pacientesComparacion[1]) {
    pacientesComparacion[1] = pacientes.map((paciente) => String(paciente.id)).find((id) => id !== pacientesComparacion[0]) || "";
  }
  cargar();
});
$("compare-two").addEventListener("change", (event) => {
  pacientesComparacion[1] = event.target.value;
  if (pacientesComparacion[1] && pacientesComparacion[1] === pacientesComparacion[0]) {
    pacientesComparacion[0] = pacientes.map((paciente) => String(paciente.id)).find((id) => id !== pacientesComparacion[1]) || "";
  }
  cargar();
});
$("chart-show-all").addEventListener("click", () => {
  comparacionActiva = false;
  pacienteActual = "";
  $("compare-toggle").checked = false;
  $("compare-selects").hidden = true;
  $("patient-filter").value = "";
  cargar();
});
function abrirFormularioPaciente() {
  const form = $("patient-form");
  const boton = $("context-add-patient");
  form.hidden = false;
  form.classList.add("is-open");
  boton.setAttribute("aria-expanded", "true");
  boton.textContent = "Cerrar formulario";
  const movimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  form.scrollIntoView({ behavior: movimiento, block: "center" });
  form.elements.nombre.focus({ preventScroll: true });
}
function alternarFormularioPaciente() {
  const form = $("patient-form");
  if (form.hidden) {
    abrirFormularioPaciente();
    return;
  }
  form.hidden = true;
  form.classList.remove("is-open");
  $("context-add-patient").setAttribute("aria-expanded", "false");
  $("context-add-patient").textContent = "＋ Registrar paciente";
}
$("nav-add-patient").addEventListener("click", abrirFormularioPaciente);
$("context-add-patient").addEventListener("click", alternarFormularioPaciente);
$("patient-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const boton = form.querySelector("button[type='submit']");
  const estado = $("patient-form-status");
  const datos = Object.fromEntries([...new FormData(form)].map(([clave, valor]) => [clave, String(valor).trim()]).filter(([, valor]) => valor !== ""));
  if (!datos.nombre) {
    estado.textContent = "Escribe el nombre del paciente para poder registrarlo.";
    estado.classList.add("error");
    estado.hidden = false;
    form.elements.nombre.focus();
    return;
  }
  boton.disabled = true;
  estado.hidden = true;
  estado.classList.remove("error");
  try {
    const destino = window.TELEMEDICINA_CONSULTA.rutaClinica("/api/pacientes");
    if (!destino) throw new Error("Consulta no permitida");
    const response = await fetch(destino, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(datos)
    });
    const resultado = await response.json().catch(() => ({}));
    if (response.status === 401 || resultado.codigo === "SESION_EXPIRADA" || resultado.codigo === "SESION_REQUERIDA") {
      sesionActiva = false;
      consultaClinicaBloqueada = true;
      mostrarAcceso(window.TELEMEDICINA_ACCESO.mensajeDeSesion(resultado.codigo || "SESION_REQUERIDA"));
      throw new Error(window.TELEMEDICINA_ACCESO.mensajeDeSesion(resultado.codigo || "SESION_REQUERIDA"));
    }
    if (!response.ok) throw new Error(resultado.mensaje || (response.status === 409 ? "Ya existe un paciente con esos datos." : "No se pudo registrar el paciente. Revisa los datos e inténtalo de nuevo."));
    if (!resultado.paciente?.id) throw new Error("No se pudo confirmar el registro. Actualiza la lista para revisarlo.");
    form.reset();
    pacienteActual = String(resultado.paciente.id);
    busquedaPaciente = "";
    await cargar();
    estado.textContent = `Paciente registrado. Identificador ${resultado.paciente.id}.`;
    estado.hidden = false;
  } catch (error) {
    estado.textContent = error instanceof TypeError
      ? "No se pudo conectar. Inténtalo nuevamente más tarde."
      : error.message || "No se pudo registrar el paciente. Revisa los datos e inténtalo de nuevo.";
    estado.classList.add("error");
    estado.hidden = false;
  } finally {
    boton.disabled = false;
  }
});
$("refresh-button").addEventListener("click", () => {
  if (sesionActiva) cargar({ manual: true });
  else prepararAcceso();
});
$("retry-button").addEventListener("click", () => {
  if (sesionActiva) cargar({ manual: true });
  else prepararAcceso();
});
document.querySelectorAll(".vital-card").forEach((tarjeta) => tarjeta.addEventListener("click", () => {
  const tipo = tarjeta.dataset.tipo;
  if (!tipo) return;
  tipoActual = tipo;
  $("type-select").value = tipo;
  dibujarSignosVitales();
  dibujarGrafica();
  $("mediciones").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}));
const chart = $("chart");
const tooltip = $("chart-tooltip");
function mostrarTooltip(punto) {
  if (!punto) { tooltip.hidden = true; return; }
  tooltip.textContent = `${punto.dataset.value} ${punto.dataset.unit} · ${punto.dataset.time}${punto.dataset.patient ? ` · ${punto.dataset.patient}` : ""}`;
  const chartBounds = chart.getBoundingClientRect();
  const tooltipLeft = Number(punto.getAttribute("cx")) / 760 * chartBounds.width;
  const tooltipTop = Number(punto.getAttribute("cy")) / 245 * chartBounds.height;
  tooltip.style.left = `${Math.max(8, Math.min(chartBounds.width - 200, tooltipLeft))}px`;
  tooltip.style.top = `${Math.max(2, tooltipTop - 42)}px`;
  tooltip.hidden = false;
}
chart.addEventListener("pointerover", (event) => mostrarTooltip(event.target.closest("circle[data-index]")));
chart.addEventListener("pointermove", (event) => {
  const punto = event.target.closest("circle[data-index]");
  if (punto) mostrarTooltip(punto);
});
chart.addEventListener("pointerout", (event) => {
  if (!event.relatedTarget?.closest?.("circle[data-index]")) tooltip.hidden = true;
});
chart.addEventListener("focusin", (event) => mostrarTooltip(event.target.closest("circle[data-index]")));
chart.addEventListener("focusout", (event) => {
  if (!event.relatedTarget?.closest?.("circle[data-index]")) tooltip.hidden = true;
});
chart.addEventListener("pointerleave", () => { tooltip.hidden = true; });

const enlacesSeccion = [...document.querySelectorAll(".nav-item[href^='#']")];
function activarSeccion(id) {
  document.querySelectorAll(".nav-item").forEach((enlace) => {
    const activo = enlace.getAttribute("href") === `#${id}` || (id === "resumen" && enlace.getAttribute("href") === "./index.html");
    enlace.classList.toggle("active", activo);
    if (activo) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  });
}
enlacesSeccion.forEach((enlace) => enlace.addEventListener("click", (event) => {
  const destino = document.querySelector(enlace.getAttribute("href"));
  if (!destino) return;
  event.preventDefault();
  destino.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  activarSeccion(destino.id);
}));
const paneles = document.querySelectorAll(".content-grid .panel, .bottom-grid .panel");
if ("IntersectionObserver" in window) {
  const seccionesVisibles = new IntersectionObserver((entradas) => {
    const visibles = entradas.filter((entrada) => entrada.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visibles[0]) activarSeccion(visibles[0].target.id);
  }, { rootMargin: "-18% 0px -62% 0px", threshold: [0, .15, .35, .6] });
  ["mediciones", "pacientes"].forEach((id) => {
    const seccion = $(id);
    if (seccion) seccionesVisibles.observe(seccion);
  });
  const revelarPaneles = new IntersectionObserver((entradas, observador) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add("is-visible");
        observador.unobserve(entrada.target);
      }
    });
  }, { threshold: .12 });
  paneles.forEach((panel) => {
    panel.classList.add("scroll-reveal");
    revelarPaneles.observe(panel);
  });
} else {
  paneles.forEach((panel) => panel.classList.add("is-visible"));
}
window.addEventListener("scroll", () => {
  if (window.scrollY < 120) activarSeccion("resumen");
}, { passive: true });
setInterval(() => {
  if (sesionActiva) cargar();
}, 60000);

async function prepararAcceso() {
  let respuesta;
  try {
    respuesta = await fetch("/api/sesion", { headers: { Accept: "application/json" }, credentials: "same-origin" });
  } catch (error) {
    mostrarFalloDeCarga(error);
    return;
  }
  if (respuesta.ok) {
    sesionActiva = true;
    consultaClinicaBloqueada = false;
    ocultarAcceso();
    await cargar({ manual: true });
    return;
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  sesionActiva = false;
  consultaClinicaBloqueada = true;
  if (respuesta.status === 401) {
    mostrarAcceso(cuerpo.codigo === "SESION_EXPIRADA" ? window.TELEMEDICINA_ACCESO.mensajeDeSesion("SESION_EXPIRADA") : "");
    presentarSinSesion();
    return;
  }
  mostrarFalloDeCarga({ estado: respuesta.status, codigo: cuerpo.codigo });
}
$("access-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const boton = form.querySelector("button[type='submit']");
  const estado = $("access-status");
  const usuario = String(new FormData(form).get("usuario") || "").trim();
  const contrasena = String(new FormData(form).get("contrasena") || "");
  boton.disabled = true;
  estado.hidden = true;
  try {
    const respuesta = await fetch("/api/sesion", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usuario, contrasena })
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    form.elements.contrasena.value = "";
    if (!respuesta.ok) {
      estado.textContent = window.TELEMEDICINA_ACCESO.mensajeDeSesion(cuerpo.codigo);
      estado.hidden = false;
      return;
    }
    sesionActiva = true;
    consultaClinicaBloqueada = false;
    ocultarAcceso();
    await cargar({ manual: true });
  } catch {
    form.elements.contrasena.value = "";
    estado.textContent = "No se pudo iniciar sesión. Inténtalo nuevamente.";
    estado.hidden = false;
  } finally {
    boton.disabled = false;
  }
});
$("logout-button").addEventListener("click", async () => {
  try {
    await fetch("/api/sesion", { method: "DELETE", credentials: "same-origin" });
  } catch {
    /* La interfaz cierra la sesión local aunque la red falle. */
  }
  sesionActiva = false;
  consultaClinicaBloqueada = true;
  mediciones = [];
  pacientes = [];
  notificarPacientesInforme();
  pacienteActual = "";
  dibujar();
  mostrarAcceso("");
  presentarSinSesion();
});
prepararAcceso();
