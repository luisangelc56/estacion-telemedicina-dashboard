(function (raiz) {
  const PACIENTES_FICTICIOS = [
    { id: "PAC-DEMO-01" },
    { id: "PAC-DEMO-02" }
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
      return { fase: "insuficiente", mensaje: "No hay lecturas ficticias suficientes para generar el informe." };
    }
    if (codigo === "LIMITE_SOLICITUDES" || estado === 429) {
      return { fase: "limite", mensaje: "Demasiadas solicitudes de prueba. Espera un minuto antes de intentar de nuevo." };
    }
    if (estado === 0 || codigo === "API_NO_DISPONIBLE") {
      return { fase: "api", mensaje: "La API no está disponible. No se solicitó el informe." };
    }
    if (estado === 502 || estado === 503 || estado === 504) {
      return { fase: "error", mensaje: "El proveedor no pudo completar la explicación. No se inventaron cifras." };
    }
    return { fase: "error", mensaje: "No se pudo generar el informe orientativo." };
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
      mensaje: "Elige un paciente ficticio y solicita el informe. Los datos de esta sección no son reales.",
      informe: null
    }),
    methods: {
      async solicitar() {
        if (this.fase === "cargando") return;
        this.fase = "cargando";
        this.mensaje = "Generando el informe orientativo…";
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
        this.mensaje = "Informe orientativo generado con datos ficticios.";
      }
    }
  }).mount("#informes-app");
}
