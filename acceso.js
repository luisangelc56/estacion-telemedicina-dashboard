(function (raiz) {
  function mensajeDeSesion(codigo) {
    if (codigo === "SESION_EXPIRADA") return "La sesión expiró. Vuelve a iniciar sesión.";
    if (codigo === "SESION_REQUERIDA") return "Inicia sesión para consultar pacientes y mediciones.";
    if (codigo === "CREDENCIALES_INVALIDAS") return "Usuario o contraseña incorrectos.";
    if (codigo === "LIMITE_INTENTOS") return "Demasiados intentos. Espera unos minutos.";
    if (codigo === "ACCESO_NO_CONFIGURADO") return "El acceso del equipo todavía no está configurado.";
    return "No se pudo iniciar sesión. Inténtalo nuevamente.";
  }

  const api = { mensajeDeSesion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_ACCESO = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
