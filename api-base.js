(function (raiz) {
  function panelEnLocal(ubicacion) {
    return ubicacion.hostname === "localhost" || ubicacion.hostname === "127.0.0.1";
  }

  function hostLocal(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function normalizarApiBase(valor, ubicacion) {
    if (typeof valor !== "string" || !valor.trim()) {
      return { error: "El servicio no está disponible en este momento." };
    }
    let url;
    try {
      url = new URL(valor.trim());
    } catch {
      return { error: "El servicio no está disponible en este momento." };
    }
    if (url.username || url.password) {
      return { error: "El servicio no está disponible en este momento." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "El servicio no está disponible en este momento." };
    }
    if (url.search || url.hash) {
      return { error: "El servicio no está disponible en este momento." };
    }
    if (!panelEnLocal(ubicacion) && hostLocal(url.hostname)) {
      return { error: "El servicio no está disponible en este momento." };
    }
    if (ubicacion.protocol === "https:" && url.protocol === "http:") {
      return { error: "El servicio no está disponible en este momento." };
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
    return { error: "El servicio no está disponible en este momento." };
  }

  function urlDeApi(base, ruta) {
    if (!base) throw new Error("El servicio no está disponible en este momento.");
    return `${base}${ruta}`;
  }

  const api = { panelEnLocal, normalizarApiBase, resolverApiBase, urlDeApi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_API = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
