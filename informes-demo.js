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

  function interpretarFallo(estado, codigo) {
    if (codigo === "DATOS_INSUFICIENTES" || estado === 422) {
      return { fase: "insuficiente", mensaje: "No hay lecturas suficientes para generar el informe." };
    }
    if (codigo === "LIMITE_SOLICITUDES" || estado === 429) {
      return { fase: "limite", mensaje: "Has realizado varias solicitudes seguidas. Espera un minuto e inténtalo de nuevo." };
    }
    if (estado === 0 || codigo === "API_NO_DISPONIBLE") {
      return { fase: "api", mensaje: "El servicio no está disponible en este momento." };
    }
    if (estado === 502 || estado === 503 || estado === 504) {
      return { fase: "error", mensaje: "No fue posible generar el informe. Inténtalo nuevamente más tarde." };
    }
    return { fase: "error", mensaje: "No fue posible generar el informe. Inténtalo nuevamente más tarde." };
  }

  const api = { PACIENTES_FICTICIOS, presentarInforme, presentarSerie, interpretarFallo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.TELEMEDICINA_INFORMES = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

if (typeof document !== "undefined" && document.getElementById("informes-app") && window.Vue) {
  const informes = window.TELEMEDICINA_INFORMES;
  window.Vue.createApp({
    data: () => ({
      pacientes: informes.PACIENTES_FICTICIOS,
      pacienteId: "PAC-DEMO-01",
      fase: "inicial",
      mensaje: "Selecciona un paciente y genera el informe.",
      informe: null
    }),
    methods: {
      nombreVisible(id) {
        const paciente = this.pacientes.find((item) => item.id === id);
        return paciente && paciente.nombre ? paciente.nombre : id;
      },
      async solicitar() {
        if (this.fase === "cargando") return;
        this.fase = "cargando";
        this.mensaje = "Generando el informe…";
        this.informe = null;
        let respuesta;
        try {
          respuesta = await fetch(urlDeApi(`/api/demo/informes/${encodeURIComponent(this.pacienteId)}`), {
            headers: { Accept: "application/json" }
          });
        } catch {
          const fallo = informes.interpretarFallo(0, "API_NO_DISPONIBLE");
          this.fase = fallo.fase;
          this.mensaje = fallo.mensaje;
          return;
        }
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
          return;
        }
        this.informe = informes.presentarInforme(cuerpo.informe);
        this.fase = "listo";
        this.mensaje = "Informe de seguimiento listo.";
      }
    }
  }).mount("#informes-app");
}
