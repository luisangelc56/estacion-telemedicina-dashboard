(function (raiz) {
  function panelEnLocal(ubicacion) {
    return ubicacion.hostname === "localhost" || ubicacion.hostname === "127.0.0.1";
  }

  function hostLocal(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function normalizarApiBase(valor, ubicacion) {
    if (typeof valor !== "string" || !valor.trim()) {
      return { error: "La URL de la API debe ser absoluta y usar http o https." };
    }
    let url;
    try {
      url = new URL(valor.trim());
    } catch {
      return { error: "La URL de la API debe ser absoluta y usar http o https." };
    }
    if (url.username || url.password) {
      return { error: "La URL de la API no puede incluir usuario ni contraseña." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "La URL de la API debe usar el protocolo http o https." };
    }
    if (url.search || url.hash) {
      return { error: "La URL de la API no debe incluir una consulta ni un fragmento." };
    }
    if (!panelEnLocal(ubicacion) && hostLocal(url.hostname)) {
      return { error: "La versión publicada no puede usar localhost. Escribe la URL HTTPS de Render en config.public.js." };
    }
    if (ubicacion.protocol === "https:" && url.protocol === "http:") {
      return { error: "El panel está en HTTPS. La API también debe usar HTTPS para que el navegador permita la solicitud." };
    }
    const ruta = url.pathname.replace(/\/+$/, "");
    return { base: `${url.origin}${ruta}` };
  }

  function resolverApiBase(ubicacion, config) {
    const parametros = new URLSearchParams(ubicacion.search || "");
    if (panelEnLocal(ubicacion) && parametros.has("api")) {
      return normalizarApiBase(parametros.get("api"), ubicacion);
    }
    const configurada = config && config.apiBase;
    if (typeof configurada === "string" && configurada.trim()) {
      return normalizarApiBase(configurada, ubicacion);
    }
    if (panelEnLocal(ubicacion)) {
      return normalizarApiBase("http://localhost:3000", ubicacion);
    }
    return { error: "Falta la URL HTTPS de Render. Escríbela en config.public.js cuando el backend esté publicado." };
  }

  function urlDeApi(base, ruta) {
    if (!base) throw new Error("La API no está configurada.");
    return `${base}${ruta}`;
  }

  const api = { panelEnLocal, normalizarApiBase, resolverApiBase, urlDeApi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_API = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
