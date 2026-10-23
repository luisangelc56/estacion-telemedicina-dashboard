(function (raiz) {
  function mensajeDeSesion(codigo) {
    if (codigo === "SESION_EXPIRADA") return "La sesión del equipo expiró. Vuelva a iniciar sesión.";
    if (codigo === "SESION_REQUERIDA") return "Inicie sesión para consultar pacientes y mediciones.";
    if (codigo === "CREDENCIALES_INVALIDAS") return "Usuario o contraseña incorrectos.";
    if (codigo === "LIMITE_INTENTOS") return "Demasiados intentos. Espere unos minutos e inténtelo de nuevo.";
    if (codigo === "ACCESO_NO_CONFIGURADO") return "El acceso del equipo no está configurado.";
    return "No se pudo iniciar sesión. Inténtelo de nuevo.";
  }

  const api = { mensajeDeSesion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_ACCESO = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
