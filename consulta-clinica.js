(function (raiz) {
  const MENSAJE_RESTRINGIDO = "No tienes autorización para consultar pacientes y mediciones. El servicio está en línea y estos datos permanecen protegidos.";
  const MENSAJE_NO_DISPONIBLE = "No se pudieron cargar los datos. El servicio no está disponible en este momento.";

  function clasificarFalloClinico(error) {
    if (error && error.codigo === "SESION_EXPIRADA") {
      return {
        restringido: true,
        sesion: true,
        servicio: "Sin sesión",
        mensaje: "La sesión expiró. Vuelve a iniciar sesión.",
        mediciones: "Inicia sesión para consultar las mediciones.",
        pacientes: "Inicia sesión para consultar los pacientes.",
        pastilla: "Sin sesión"
      };
    }
    if (error && error.codigo === "SESION_REQUERIDA") {
      return {
        restringido: true,
        sesion: true,
        servicio: "Sin sesión",
        mensaje: "Inicia sesión para consultar pacientes y mediciones.",
        mediciones: "Inicia sesión para consultar las mediciones.",
        pacientes: "Inicia sesión para consultar los pacientes.",
        pastilla: "Sin sesión"
      };
    }
    if (error && error.estado === 401) {
      return {
        restringido: true,
        servicio: "Sin autorización",
        mensaje: MENSAJE_RESTRINGIDO,
        mediciones: "Las mediciones requieren autorización.",
        pacientes: "Los pacientes requieren autorización.",
        pastilla: "Protegido"
      };
    }
    return {
      restringido: false,
      servicio: "No disponible",
      mensaje: MENSAJE_NO_DISPONIBLE,
      mediciones: "No se pudieron cargar las mediciones.",
      pacientes: "No se pudieron cargar los pacientes.",
      pastilla: "En vivo"
    };
  }

  function rutaClinica(ruta) {
    let url;
    try {
      url = new URL(ruta, "https://panel.local");
    } catch {
      return null;
    }
    const segmentos = url.pathname.split("/").filter(Boolean);
    if (segmentos.length < 2 || segmentos.length > 3 || segmentos[0] !== "api") return null;
    const recurso = segmentos[1];
    if (recurso !== "pacientes" && recurso !== "mediciones") return null;
    const params = new URLSearchParams();
    params.set("recurso", recurso);
    if (segmentos[2]) {
      if (recurso !== "pacientes") return null;
      params.set("id", segmentos[2]);
    }
    for (const [clave, valor] of url.searchParams) {
      if (clave !== "periodo" && clave !== "paciente_id") return null;
      params.append(clave, valor);
    }
    return `/api/clinico?${params.toString()}`;
  }

  function debeConsultarDatosClinicos(bloqueado, manual) {
    return manual === true || bloqueado !== true;
  }

  const api = { clasificarFalloClinico, debeConsultarDatosClinicos, rutaClinica, MENSAJE_RESTRINGIDO, MENSAJE_NO_DISPONIBLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_CONSULTA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
