(function (raiz) {
  const PACIENTES_FICTICIOS = [
    { id: "PAC-DEMO-01", nombre: "Paciente de ejemplo 1" },
    { id: "PAC-DEMO-02", nombre: "Paciente de ejemplo 2" }
  ];
  const TENDENCIAS = new Set(["ascendente", "descendente", "estable", "insuficiente"]);

  function cifra(valor) {
    return typeof valor === "number" && Number.isFinite(valor);
  }

  function formatearFecha(iso) {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return "No disponible";
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC"
    }).format(fecha);
  }

  function presentarSerie(serie) {
    if (!serie || serie.disponible !== true || !cifra(serie.promedio) || !cifra(serie.minimo) || !cifra(serie.maximo) || !cifra(serie.lecturas)) {
      const motivo = serie && typeof serie.motivo === "string" && serie.motivo.trim()
        ? serie.motivo.trim()
        : "No disponible.";
      return { disponible: false, texto: motivo };
    }
    const unidad = typeof serie.unidad === "string" ? serie.unidad : "";
    return {
      disponible: true,
      texto: `Promedio ${serie.promedio} ${unidad}. Mínimo ${serie.minimo} ${unidad}. Máximo ${serie.maximo} ${unidad}. ${serie.lecturas} lecturas.`.replace(/\s{2,}/g, " ")
    };
  }

  function presentarTendencia(valor) {
    return TENDENCIAS.has(valor) ? valor : "No disponible";
  }

  function presentarInforme(informe) {
    const datos = informe && typeof informe === "object" ? informe : {};
    const periodo = datos.periodo && typeof datos.periodo === "object" ? datos.periodo : {};
    const tendencias = datos.tendencias && typeof datos.tendencias === "object" ? datos.tendencias : {};
    const limitaciones = Array.isArray(datos.limitaciones)
      ? datos.limitaciones.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    return {
      pacienteId: typeof datos.pacienteId === "string" ? datos.pacienteId : "No disponible",
      desde: formatearFecha(periodo.desde),
      hasta: formatearFecha(periodo.hasta),
      dias: Number.isInteger(periodo.dias) ? String(periodo.dias) : "No disponible",
      lecturasUtilizadas: cifra(datos.lecturasUtilizadas) ? String(datos.lecturasUtilizadas) : "No disponible",
      frecuenciaCardiaca: presentarSerie(datos.frecuenciaCardiaca),
      temperatura: presentarSerie(datos.temperatura),
      variabilidadCardiaca: presentarSerie(datos.variabilidadCardiaca),
      tendencias: {
        frecuenciaCardiaca: presentarTendencia(tendencias.frecuenciaCardiaca),
        temperatura: presentarTendencia(tendencias.temperatura),
        variabilidadCardiaca: presentarTendencia(tendencias.variabilidadCardiaca)
      },
      resumenOrientativo: typeof datos.resumenOrientativo === "string" && datos.resumenOrientativo.trim()
        ? datos.resumenOrientativo.trim()
        : "No disponible.",
      limitaciones: limitaciones.length > 0 ? limitaciones : ["No disponible."],
      advertencia: typeof datos.advertencia === "string" && datos.advertencia.trim()
        ? datos.advertencia.trim()
        : "No disponible."
    };
  }

  const MENSAJE_SIN_MEDICIONES = "Este paciente todavía no tiene mediciones registradas. Cuando se registren sus primeras lecturas, podrás generar su informe de seguimiento.";

  function esEjemplo(pacienteId) {
    return /^PAC-DEMO-\d{2}$/.test(String(pacienteId || ""));
  }

  function idRegistrado(pacienteId) {
    const id = String(pacienteId || "");
    return /^[1-9]\d*$/.test(id) ? id : "";
  }

  function nombreRegistrado(paciente) {
    const partes = [paciente && paciente.nombre, paciente && paciente.apellido]
      .filter((parte) => typeof parte === "string" && parte.trim())
      .map((parte) => parte.trim());
    return partes.join(" ");
  }

  function combinarPacientes(registrados) {
    const vistos = new Set();
    const lista = [];
    for (const ejemplo of PACIENTES_FICTICIOS) {
      if (vistos.has(ejemplo.id)) continue;
      vistos.add(ejemplo.id);
      lista.push({ id: ejemplo.id, nombre: ejemplo.nombre, origen: "ejemplo" });
    }
    const filas = Array.isArray(registrados) ? registrados : [];
    for (const paciente of filas) {
      const id = idRegistrado(paciente && paciente.id);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      lista.push({
        id,
        nombre: nombreRegistrado(paciente) || `Paciente ${id}`,
        origen: "registrado"
      });
    }
    return lista;
  }

  function conservarSeleccion(actual, lista) {
    const id = String(actual || "");
    if (Array.isArray(lista) && lista.some((item) => item.id === id)) return id;
    return lista && lista[0] ? lista[0].id : "";
  }

  function interpretarFallo(estado, codigo) {
    if (codigo === "DATOS_INSUFICIENTES" || estado === 422) {
      return { fase: "insuficiente", reintentar: false, mensaje: "No hay lecturas suficientes para generar el informe." };
    }
    if (codigo === "LIMITE_SOLICITUDES" || estado === 429) {
      return { fase: "limite", reintentar: true, mensaje: "Has realizado varias solicitudes seguidas. Espera un minuto e inténtalo de nuevo." };
    }
    if (estado === 401 || codigo === "NO_AUTORIZADO" || codigo === "SESION_REQUERIDA" || codigo === "SESION_EXPIRADA") {
      return { fase: "denegado", reintentar: true, mensaje: "No tienes autorización para generar este informe. Inicia sesión e inténtalo de nuevo." };
    }
    if (estado === 404 || codigo === "PACIENTE_NO_ENCONTRADO") {
      return { fase: "error", reintentar: false, mensaje: "No se encontró el paciente seleccionado." };
    }
    if (estado === 504 || codigo === "TIEMPO_AGOTADO") {
      return { fase: "error", reintentar: true, mensaje: "La generación tardó demasiado. Inténtalo nuevamente más tarde." };
    }
    if (estado === 500) {
      return { fase: "error", reintentar: true, mensaje: "No fue posible generar el informe. El servicio encontró un error interno. Inténtalo nuevamente más tarde." };
    }
    if (estado === 0 || codigo === "API_NO_DISPONIBLE") {
      return { fase: "api", reintentar: true, mensaje: "El servicio no está disponible en este momento." };
    }
    if (estado === 502 || estado === 503) {
      return { fase: "error", reintentar: true, mensaje: "No fue posible generar el informe. Inténtalo nuevamente más tarde." };
    }
    return { fase: "error", reintentar: true, mensaje: "No fue posible generar el informe. Inténtalo nuevamente más tarde." };
  }

  function mensajeConsulta(resultado) {
    const codigo = resultado && resultado.codigo;
    const estado = resultado && resultado.http;
    if (codigo === "TIEMPO_AGOTADO" || estado === 504) {
      return "La consulta de mediciones tardó demasiado. Puedes intentarlo de nuevo.";
    }
    if (estado === 401 || codigo === "NO_AUTORIZADO" || codigo === "SESION_REQUERIDA" || codigo === "SESION_EXPIRADA") {
      return "No tienes autorización para consultar las mediciones de este paciente. Inicia sesión e inténtalo de nuevo.";
    }
    if (estado === 500) {
      return "No se pudieron consultar las mediciones por un error del servicio. Puedes intentarlo de nuevo.";
    }
    if (estado === 502 || estado === 503) {
      return "No se pudieron consultar las mediciones. El servicio no completó la solicitud. Puedes intentarlo de nuevo.";
    }
    return "No se pudieron consultar las mediciones de este paciente. Puedes intentarlo de nuevo.";
  }

  async function consultarLecturas(pacienteId, fetchImpl) {
    const id = idRegistrado(pacienteId);
    const consulta = raiz.TELEMEDICINA_CONSULTA;
    if (!id || !consulta || typeof consulta.rutaClinica !== "function" || typeof fetchImpl !== "function") {
      return { estado: "error", codigo: "CONSULTA", http: 0 };
    }
    const destino = consulta.rutaClinica(`/api/mediciones?paciente_id=${encodeURIComponent(id)}`);
    if (!destino) return { estado: "error", codigo: "CONSULTA", http: 0 };
    const controlador = new AbortController();
    let agotado = false;
    const temporizador = setTimeout(() => {
      agotado = true;
      controlador.abort();
    }, 12000);
    if (typeof temporizador.unref === "function") temporizador.unref();
    const opciones = {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      signal: controlador.signal
    };
    let respuesta;
    try {
      respuesta = await fetchImpl(destino, opciones);
    } catch (error) {
      const tiempo = agotado || (error && (error.name === "TimeoutError" || error.name === "AbortError"));
      return { estado: "error", codigo: tiempo && agotado ? "TIEMPO_AGOTADO" : "RED", http: tiempo && agotado ? 504 : 0 };
    } finally {
      clearTimeout(temporizador);
    }
    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (!respuesta || !respuesta.ok) {
      return {
        estado: "error",
        codigo: cuerpo && typeof cuerpo.codigo === "string" ? cuerpo.codigo : "RESPUESTA",
        http: respuesta && respuesta.status
      };
    }
    if (!cuerpo || cuerpo.ok !== true || !Array.isArray(cuerpo.mediciones)) {
      return { estado: "error", codigo: "RESPUESTA", http: respuesta.status };
    }
    const propias = cuerpo.mediciones.filter((item) => item && String(item.paciente_id) === id);
    if (propias.length === 0) return { estado: "vacio" };
    return { estado: "disponible", total: propias.length };
  }

  const api = {
    PACIENTES_FICTICIOS,
    MENSAJE_SIN_MEDICIONES,
    presentarInforme,
    presentarSerie,
    interpretarFallo,
    esEjemplo,
    combinarPacientes,
    conservarSeleccion,
    consultarLecturas,
    mensajeConsulta
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_INFORMES = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

if (typeof document !== "undefined" && document.getElementById("informes-app") && window.Vue) {
  const informes = window.TELEMEDICINA_INFORMES;
  const aplicacion = window.Vue.createApp({
    data: () => ({
      pacientes: informes.combinarPacientes([]),
      pacienteId: "PAC-DEMO-01",
      fase: "inicial",
      mensaje: "Selecciona un paciente y genera el informe.",
      informe: null,
      reintentar: false,
      generacion: 0
    }),
    computed: {
      ejemplos() {
        return this.pacientes.filter((paciente) => paciente.origen === "ejemplo");
      },
      registrados() {
        return this.pacientes.filter((paciente) => paciente.origen === "registrado");
      },
      generacionBloqueada() {
        return this.fase === "cargando" || this.fase === "consultando" || this.fase === "sin-datos";
      }
    },
    watch: {
      pacienteId(id, anterior) {
        if (id !== anterior) this.alCambiar();
      }
    },
    mounted() {
      this.alCambiar();
    },
    methods: {
      nombreVisible(id) {
        const paciente = this.pacientes.find((item) => item.id === id);
        return paciente && paciente.nombre ? paciente.nombre : id;
      },
      recibirPacientes(registrados) {
        const lista = informes.combinarPacientes(registrados);
        const siguiente = informes.conservarSeleccion(this.pacienteId, lista);
        this.pacientes = lista;
        if (siguiente !== this.pacienteId) {
          this.pacienteId = siguiente;
          return;
        }
        if (!informes.esEjemplo(this.pacienteId) && (this.fase === "sin-datos" || this.fase === "error" || this.fase === "api" || this.fase === "denegado")) {
          this.alCambiar();
        }
      },
      alCambiar() {
        const id = this.pacienteId;
        const token = ++this.generacion;
        this.informe = null;
        this.reintentar = false;
        if (informes.esEjemplo(id)) {
          this.fase = "inicial";
          this.mensaje = `Seleccionado: ${this.nombreVisible(id)}. Es un paciente de ejemplo.`;
          return;
        }
        this.confirmarLecturas(id, token);
      },
      async confirmarLecturas(id, token) {
        this.fase = "consultando";
        this.mensaje = "Consultando las lecturas del paciente…";
        const resultado = await informes.consultarLecturas(id, (url, opciones) => fetch(url, opciones));
        if (token !== this.generacion || this.pacienteId !== id) return;
        if (resultado.estado === "vacio") {
          this.fase = "sin-datos";
          this.mensaje = informes.MENSAJE_SIN_MEDICIONES;
          this.reintentar = false;
          return;
        }
        if (resultado.estado !== "disponible") {
          this.fase = "error";
          this.mensaje = informes.mensajeConsulta(resultado);
          this.reintentar = true;
          return;
        }
        this.fase = "inicial";
        this.mensaje = `Seleccionado: ${this.nombreVisible(id)}. Hay lecturas registradas.`;
        this.reintentar = false;
      },
      async solicitarRegistrado(id, token) {
        const consulta = window.TELEMEDICINA_CONSULTA;
        const destino = consulta && typeof consulta.rutaClinica === "function"
          ? consulta.rutaClinica(`/api/informes/${encodeURIComponent(id)}`)
          : null;
        if (!destino) {
          const fallo = informes.interpretarFallo(0, "API_NO_DISPONIBLE");
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          this.reintentar = fallo.reintentar;
          return;
        }
        this.fase = "cargando";
        this.mensaje = "Generando el informe…";
        let respuesta;
        try {
          respuesta = await fetch(destino, {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(36000) : undefined
          });
        } catch (error) {
          if (token !== this.generacion || this.pacienteId !== id) return;
          const tiempo = error && (error.name === "TimeoutError" || error.name === "AbortError");
          const fallo = informes.interpretarFallo(tiempo ? 504 : 0, tiempo ? "TIEMPO_AGOTADO" : "API_NO_DISPONIBLE");
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          this.reintentar = fallo.reintentar;
          return;
        }
        if (token !== this.generacion || this.pacienteId !== id) return;
        await this.recibirInforme(respuesta, id);
      },
      async recibirInforme(respuesta, id) {
        let cuerpo = null;
        try {
          cuerpo = await respuesta.json();
        } catch {
          cuerpo = null;
        }
        if (!respuesta.ok || !cuerpo || cuerpo.ok !== true || !cuerpo.informe) {
          const fallo = informes.interpretarFallo(respuesta.status, cuerpo && cuerpo.codigo);
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          this.reintentar = fallo.reintentar;
          return;
        }
        if (String(cuerpo.informe.pacienteId) !== String(id)) {
          const fallo = informes.interpretarFallo(502, "RESPUESTA_INVALIDA");
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          this.reintentar = true;
          return;
        }
        this.informe = informes.presentarInforme(cuerpo.informe);
        this.fase = "listo";
        this.mensaje = `Seleccionado: ${this.nombreVisible(id)}. Informe de seguimiento listo.`;
        this.reintentar = false;
      },
      async solicitar() {
        if (this.fase === "cargando" || this.fase === "consultando" || this.fase === "sin-datos") return;
        const id = this.pacienteId;
        const token = ++this.generacion;
        this.informe = null;
        this.reintentar = false;
        if (!informes.esEjemplo(id)) {
          await this.solicitarRegistrado(id, token);
          return;
        }
        this.fase = "cargando";
        this.mensaje = "Generando el informe…";
        let respuesta;
        try {
          respuesta = await fetch(urlDeApi(`/api/demo/informes/${encodeURIComponent(this.pacienteId)}`), {
            headers: { Accept: "application/json" },
            signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined
          });
        } catch (error) {
          if (token !== this.generacion || this.pacienteId !== id) return;
          const tiempo = error && (error.name === "TimeoutError" || error.name === "AbortError");
          const fallo = informes.interpretarFallo(tiempo ? 504 : 0, tiempo ? "TIEMPO_AGOTADO" : "API_NO_DISPONIBLE");
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          this.reintentar = fallo.reintentar;
          return;
        }
        if (token !== this.generacion || this.pacienteId !== id) return;
        await this.recibirInforme(respuesta, id);
      }
    }
  });
  const vista = aplicacion.mount("#informes-app");
  informes.recibirPacientes = (registrados) => vista.recibirPacientes(registrados);
}
