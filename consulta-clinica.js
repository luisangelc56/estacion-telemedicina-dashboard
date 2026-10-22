(function (raiz) {
  const MENSAJE_RESTRINGIDO = "No tienes autorización para consultar pacientes y mediciones. El servicio está en línea y estos datos permanecen protegidos.";
  const MENSAJE_NO_DISPONIBLE = "No se pudieron cargar los datos. El servicio no está disponible en este momento.";

  function clasificarFalloClinico(error) {
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

  function debeConsultarDatosClinicos(bloqueado, manual) {
    return manual === true || bloqueado !== true;
  }

  const api = { clasificarFalloClinico, debeConsultarDatosClinicos, MENSAJE_RESTRINGIDO, MENSAJE_NO_DISPONIBLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_CONSULTA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
