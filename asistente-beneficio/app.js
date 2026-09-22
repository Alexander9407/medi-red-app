(function(){

  const GROQ_API_KEY = "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"; 
  const GROQ_MODEL = "openai/gpt-oss-20b";
  const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

  const PLAN = {
    nombre: "Medi-red",
  };

  // Tabla de "Planes de Copago" (según la tarifa que compartiste). Cada plan tiene dos
  // reglas de copago independientes: una para "medicina_general" y otra para cualquier
  // otra especialidad ("especialidad") — la consulta de medicina general siempre sale
  // más barata. Cada regla puede ser:
  //  - { tipo:"fijo", monto } => el paciente paga siempre ese monto fijo.
  //  - { tipo:"porcentaje", porcentaje } => el paciente paga ese % del precio de la
  //    consulta (ver precioConsulta más abajo). Es el caso de "Plan de Indemnización":
  //    20% en especialidad y 10% en medicina general.
  // "limiteCobertura" es solo informativo (tope anual del plan), no afecta el copago
  // de una consulta individual.
  const PLANES_DE_COPAGO = {
    seguro_social: {
      nombre: "Seguro Social",
      especialidad: { tipo:"fijo", monto: 5 },
      medicina_general: { tipo:"fijo", monto: 3 },
    },
    programa_asistencia_social: {
      nombre: "Programa de Asistencia Social",
      especialidad: { tipo:"fijo", monto: 5 },
      medicina_general: { tipo:"fijo", monto: 3 },
    },
    hmo: {
      nombre: "HMO",
      especialidad: { tipo:"fijo", monto: 8 },
      medicina_general: { tipo:"fijo", monto: 4 },
    },
    ppo: {
      nombre: "PPO",
      especialidad: { tipo:"fijo", monto: 10 },
      medicina_general: { tipo:"fijo", monto: 5 },
    },
    pos: {
      nombre: "POS",
      especialidad: { tipo:"fijo", monto: 10 },
      medicina_general: { tipo:"fijo", monto: 5 },
    },
    indemnizacion: {
      nombre: "Indemnización",
      especialidad: { tipo:"porcentaje", porcentaje: 0.20 },
      medicina_general: { tipo:"porcentaje", porcentaje: 0.10 },
    },
    accidente_transito: {
      nombre: "Accidente de Tránsito",
      especialidad: { tipo:"fijo", monto: 0 },
      medicina_general: { tipo:"fijo", monto: 0 },
    },
    riesgo_laboral: {
      nombre: "Riesgo Laboral",
      especialidad: { tipo:"fijo", monto: 0 },
      medicina_general: { tipo:"fijo", monto: 0 },
    },
    gastos_medicos_mayores: {
      nombre: "Gastos Médicos Mayores",
      especialidad: { tipo:"fijo", monto: 0 },
      medicina_general: { tipo:"fijo", monto: 0 },
      limiteCobertura: 500000,
    },
  };

  // Lee del formulario previo qué categoría de seguro está activa (público, privado
  // o especial) y qué plan específico eligió dentro de esa categoría. Devuelve tanto
  // el "valor" crudo (para calcular el copago) como el "nombre" corto (para mostrar).
  function obtenerPlanSeleccionado(){
    const radioActivo = document.querySelector('input[name="tipoSeguro"]:checked');
    const categoria = radioActivo ? radioActivo.value : "publico";
    const selectPorCategoria = { publico: "planPublico", privado: "planPrivado", especial: "planEspecial" };
    const select = document.querySelector(`select[name="${selectPorCategoria[categoria]}"]`);
    const valor = select ? select.value : "";
    const plan = PLANES_DE_COPAGO[valor];
    return { valor, nombre: plan ? plan.nombre : PLAN.nombre };
  }

  // Calcula cuánto paga el paciente de copago para un plan específico, según si la
  // especialidad detectada es medicina general o cualquier otra especialidad, y dado
  // el precio de la consulta ya resuelto (precioConsulta más abajo).
  function calcularCopago(planValor, espId, tarifaConsulta){
    const plan = PLANES_DE_COPAGO[planValor];
    if(!plan) return 0;
    const regla = espId === "medicina_general" ? plan.medicina_general : plan.especialidad;
    if(!regla) return 0;
    if(regla.tipo === "porcentaje"){
      return +(tarifaConsulta * regla.porcentaje).toFixed(2);
    }
    return regla.monto;
  }


  // Especialidades reconocidas y sus palabras clave de síntomas
  const ESPECIALIDADES = [
    { id:"medicina_general", nombre:"Medicina General", keywords:["gripe","resfriado","fiebre","malestar","dolor de garganta","tos","cansancio","dolor de cabeza","gastritis","diarrea","nausea","náusea","vómito","alergia leve"] },
    { id:"cardiologia", nombre:"Cardiología", keywords:["dolor de pecho","palpitaciones","presión alta","hipertensión","corazón","arritmia","falta de aire al esfuerzo"] },
    { id:"dermatologia", nombre:"Dermatología", keywords:["ronchas","piel","acné","manchas en la piel","comezón","alergia en la piel","urticaria","lunar","labio hinchado","hinchazón en el labio","hinchazón facial","cara hinchada","hinchado","hinchada"] },
    { id:"traumatologia", nombre:"Traumatología / Ortopedia", keywords:["dolor de espalda","dolor de rodilla","esguince","fractura","dolor de hombro","dolor muscular","torcedura","dolor articular"] },
    { id:"pediatria", nombre:"Pediatría", keywords:["mi hijo","mi hija","niño con fiebre","bebé","niña con tos"] },
    { id:"gastroenterologia", nombre:"Gastroenterología", keywords:["dolor de estómago","acidez","reflujo","dolor abdominal","estreñimiento","colitis"] },
    { id:"neurologia", nombre:"Neurología", keywords:["migraña","mareo","vértigo","hormigueo","convulsión","pérdida de equilibrio"] },
    { id:"ginecologia", nombre:"Ginecología", keywords:["dolor menstrual","control ginecológico","embarazo","dolor pélvico"] },
    { id:"oftalmologia", nombre:"Oftalmología", keywords:["ojo rojo","visión borrosa","dolor de ojo","dolor en el ojo","dolor en los ojos","detrás del ojo","parte trasera del ojo","atrás del ojo","picazón en los ojos","molestia en el ojo","molestia en los ojos","ardor en el ojo","presión en el ojo"] },
    { id:"otorrino", nombre:"Otorrinolaringología", keywords:["dolor de oído","zumbido","sinusitis","congestión nasal","dolor de oidos"] },
  ];

  // Ubicaciones cubiertas por la red (distritos de Coclé) y hospital de referencia en cada una.
  const UBICACIONES = ["Penonomé","Antón","Natá","Olá","La Pintada","Aguadulce"];

  // Hospitales de la red: uno por ubicación. "ubicacion" se usa para calcular la
  // distancia real hacia el paciente contra la matriz DISTANCIAS (no es una asignación
  // fija 1:1: si el hospital de tu propio pueblo no atiende la especialidad, el
  // algoritmo recomienda el siguiente más cercano que sí la atienda). El precio de la
  // consulta de especialidad sí varía por hospital (ver PRECIO_ESPECIALIDAD_POR_HOSPITAL
  // más abajo); el de medicina general es igual en toda la red.
  const HOSPITALES = [
    { id:"h1", nombre:"Hospital Medi-red Penonomé",   ubicacion:"Penonomé",   direccion:"Vía Interamericana, Penonomé, Coclé" },
    { id:"h2", nombre:"Hospital Medi-red Antón",      ubicacion:"Antón",      direccion:"Calle Central, Antón, Coclé" },
    { id:"h3", nombre:"Hospital Medi-red Natá",       ubicacion:"Natá",       direccion:"Av. Los Caballeros, Natá, Coclé" },
    { id:"h4", nombre:"Hospital Medi-red Olá",        ubicacion:"Olá",        direccion:"Calle Principal, Olá, Coclé" },
    { id:"h5", nombre:"Hospital Medi-red La Pintada", ubicacion:"La Pintada", direccion:"Calle Principal, La Pintada, Coclé" },
    { id:"h6", nombre:"Hospital Medi-red Aguadulce",  ubicacion:"Aguadulce",  direccion:"Vía Interamericana, Aguadulce, Coclé" },
  ];

  // Precio de lista de la consulta de Medicina General: es fijo en toda la red (misma
  // tarifa negociada en cualquier hospital).
  const PRECIO_CONSULTA_MEDICINA_GENERAL = 10;

  // Precio de lista de la consulta de especialidad: a diferencia de medicina general,
  // SÍ varía según el hospital. Penonomé y Aguadulce son los centros más grandes de la
  // red (mayor volumen de pacientes), por lo que negocian una tarifa preferencial más
  // baja; en los pueblos más pequeños, al atender menos volumen de especialistas, la
  // tarifa es un poco más alta. Si un hospital no aparece aquí, se usa el valor por
  // defecto (20). Esta tarifa solo aplica en los hospitales que sí ofrecen la
  // especialidad (ver DISPONIBILIDAD) — eso ya lo filtra hospitalesParaEspecialidad().
  const PRECIO_CONSULTA_ESPECIALIDAD = 20; // valor por defecto / de referencia
  const PRECIO_ESPECIALIDAD_POR_HOSPITAL = {
    h1: 18, // Hospital Medi-red Penonomé — tarifa preferencial (hospital de referencia)
    h2: 22, // Hospital Medi-red Antón
    h3: 21, // Hospital Medi-red Natá
    h4: 23, // Hospital Medi-red Olá
    h5: 24, // Hospital Medi-red La Pintada
    h6: 20, // Hospital Medi-red Aguadulce — el otro centro grande, tarifa base
  };

  // Precio de la consulta para una especialidad EN un hospital específico. Medicina
  // general es siempre igual en toda la red; cualquier otra especialidad usa la tarifa
  // propia de ese hospital (o el valor de referencia si no está en el mapa).
  function precioConsultaEnHospital(espId, hospitalId){
    if(espId === "medicina_general"){
      return PRECIO_CONSULTA_MEDICINA_GENERAL;
    }
    return PRECIO_ESPECIALIDAD_POR_HOSPITAL[hospitalId] ?? PRECIO_CONSULTA_ESPECIALIDAD;
  }

  // Distancias aproximadas por carretera (km) entre cabeceras de distrito de Coclé.
  // Son estimaciones para esta demo; en producción se reemplazarían por una llamada a
  // una API de distancias (Google Distance Matrix, OSRM, etc.) usando coordenadas reales.
  const DISTANCIAS_BASE = [
    ["Penonomé","Antón",12],
    ["Penonomé","Natá",14],
    ["Penonomé","Olá",20],
    ["Penonomé","La Pintada",25],
    ["Penonomé","Aguadulce",24],
    ["Antón","Natá",26],
    ["Antón","Olá",32],
    ["Antón","La Pintada",37],
    ["Antón","Aguadulce",26],
    ["Natá","Olá",10],
    ["Natá","La Pintada",15],
    ["Natá","Aguadulce",10],
    ["Olá","La Pintada",10],
    ["Olá","Aguadulce",15],
    ["La Pintada","Aguadulce",10],
  ];

  // Construye la matriz simétrica completa a partir de la lista compacta de arriba.
  const DISTANCIAS = {};
  UBICACIONES.forEach(u => { DISTANCIAS[u] = { [u]: 0 }; });
  DISTANCIAS_BASE.forEach(([a,b,km])=>{
    DISTANCIAS[a][b] = km;
    DISTANCIAS[b][a] = km;
  });

  function distanciaEntre(origen, destino){
    if(!origen || !destino) return null;
    if(DISTANCIAS[origen] && typeof DISTANCIAS[origen][destino] === "number"){
      return DISTANCIAS[origen][destino];
    }
    return null; // ubicación desconocida
  }

  // Especialidades que no todos los hospitales atienden (simula red parcial: los pueblos
  // más pequeños solo cuentan con medicina general y pediatría; las especialidades más
  // complejas se concentran en Penonomé y Aguadulce, que son los centros más grandes).
  const DISPONIBILIDAD = {
    cardiologia:      ["h1","h6"],
    neurologia:       ["h1","h6"],
    ginecologia:      ["h1","h2","h6"],
    oftalmologia:     ["h1","h2","h6"],
    otorrino:         ["h1","h2","h6"],
    dermatologia:     ["h1","h2","h3","h6"],
    gastroenterologia:["h1","h2","h6"],
    // medicina_general, traumatologia y pediatria no aparecen aquí porque están
    // disponibles en toda la red (los 6 hospitales las atienden).
  };

  // Devuelve los hospitales que atienden esa especialidad, cada uno con la distancia
  // real (km) desde la ubicación del paciente ya calculada.
  function hospitalesParaEspecialidad(espId, ubicacionUsuario){
    const permitidos = DISPONIBILIDAD[espId];
    const base = permitidos ? HOSPITALES.filter(h => permitidos.includes(h.id)) : HOSPITALES;
    return base.map(h => ({
      ...h,
      distanciaKm: distanciaEntre(ubicacionUsuario, h.ubicacion)
    }));
  }

  function detectarEspecialidad(texto){
    const t = texto.toLowerCase();
    let mejor = null;
    let mejorScore = 0;
    ESPECIALIDADES.forEach(esp=>{
      esp.keywords.forEach(k=>{
        if(t.includes(k)){
          const score = k.length; // match más largo/específico gana
          if(score > mejorScore){ mejorScore = score; mejor = esp; }
        }
      });
    });
    return mejor;
  }

  // Lista de ids válidos para validar la respuesta del modelo antes de usarla
  const IDS_VALIDOS = ESPECIALIDADES.map(e => e.id);

  // Llama a Groq para clasificar el síntoma en una especialidad y redactar
  // un mensaje empático. Devuelve { especialidad, mensaje } o null si falla,
  // en cuyo caso quien llama debe usar el fallback local (detectarEspecialidad).
  async function detectarEspecialidadConGroq(texto){
    if(!GROQ_API_KEY){
      return null; // no configurado, usar motor local
    }
    try{
      const resp = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
`Eres un clasificador administrativo de un hospital. Dado un síntoma en español,
devuelve SOLO un JSON con esta forma exacta, sin texto adicional:
{"especialidad_id": "uno_de_la_lista", "confianza": "alta|media|baja", "mensaje_paciente": "1-2 frases empáticas explicando por qué se sugiere esa especialidad, sin dar diagnóstico ni tratamiento ni nombres de medicamentos"}

Lista válida de especialidad_id (usa exactamente uno de estos, tal cual está escrito):
${IDS_VALIDOS.join(", ")}

Si el síntoma no encaja claramente en ninguna, usa "medicina_general".
Nunca sugieras diagnósticos, tratamientos ni medicamentos. Nunca inventes un especialidad_id fuera de la lista.`
            },
            { role: "user", content: texto }
          ]
        })
      });

      if(!resp.ok){
        const errBody = await resp.text().catch(()=> "");
        console.error(`Groq API respondió ${resp.status}:`, errBody);
        window.__ultimoErrorGroq = `HTTP ${resp.status}: ${errBody.slice(0,200)}`;
        return null;
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if(!content){
        console.error("Groq respondió sin contenido utilizable:", data);
        window.__ultimoErrorGroq = "Respuesta sin contenido (revisa consola: 'data' completo impreso)";
        return null;
      }

      // Limpieza defensiva: algunos modelos envuelven el JSON en ```json ... ```
      // o agregan texto de razonamiento antes/después del objeto JSON.
      let limpio = content.trim();
      limpio = limpio.replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();

      let parsed;
      try{
        parsed = JSON.parse(limpio);
      }catch{
        // Último intento: extraer el primer bloque {...} del texto
        const match = limpio.match(/\{[\s\S]*\}/);
        if(match){
          try{ parsed = JSON.parse(match[0]); }catch{ parsed = null; }
        }
      }

      if(!parsed){
        console.error("No se pudo interpretar como JSON la respuesta de Groq:", content);
        window.__ultimoErrorGroq = "Respuesta no era JSON válido (revisa consola)";
        return null;
      }

      // Validación estricta: el id debe existir en nuestro catálogo cerrado
      if(!IDS_VALIDOS.includes(parsed.especialidad_id)){
        parsed.especialidad_id = "medicina_general";
      }

      const esp = ESPECIALIDADES.find(e => e.id === parsed.especialidad_id);
      if(!esp) return null;

      return {
        especialidad: esp,
        mensaje: typeof parsed.mensaje_paciente === "string" && parsed.mensaje_paciente.trim()
          ? parsed.mensaje_paciente.trim()
          : `Con base en lo que describes, esto suena a algo que atiende ${esp.nombre}.`
      };
    }catch(err){
      console.error("Error llamando a Groq:", err);
      window.__ultimoErrorGroq = err.message || String(err);
      return null; // ante cualquier error, quien llama usa el fallback local
    }
  }

  // Peso relativo de cada factor en la recomendación principal. El precio de la
  // consulta de especialidad ahora varía por hospital (ver PRECIO_ESPECIALIDAD_POR_HOSPITAL),
  // así que el costo para el paciente puede diferir entre hospitales — sobre todo en
  // planes donde el copago es un % de la consulta (p. ej. Indemnización). En planes de
  // copago fijo, lo que paga el paciente no cambia con el hospital (es un monto fijo
  // del plan), aunque el precio de lista de la consulta sí.
  const PESO_DISTANCIA = 0.7;
  const PESO_COSTO = 0.3;

  function calcularCostos(espId, ubicacionUsuario, planValor){
    const hospitales = hospitalesParaEspecialidad(espId, ubicacionUsuario);

    let calculado = hospitales.map(h=>{
      // La tarifa de consulta (y por lo tanto el copago, en planes por %) se calculan
      // por hospital, ya que la especialidad puede costar distinto en cada uno.
      const tarifaConsulta = precioConsultaEnHospital(espId, h.id);
      const copago = calcularCopago(planValor, espId, tarifaConsulta);
      // Lo que cubre el seguro es lo que queda del precio de la consulta después del
      // copago del paciente.
      const montoSeguro = +(tarifaConsulta - copago).toFixed(2);
      // "totalPaciente" es literalmente lo que el paciente paga: su copago. El resto
      // de la consulta (montoSeguro) lo cubre el seguro, no el paciente.
      return { ...h, copago, tarifaConsulta, montoSeguro, totalPaciente: copago };
    });

    // Normalizamos distancia y costo entre 0 y 1 dentro de este conjunto de candidatos,
    // para poder combinarlos aunque estén en unidades distintas (km vs $).
    const distancias = calculado.map(h=>h.distanciaKm).filter(d=>typeof d === "number");
    const costos = calculado.map(h=>h.totalPaciente);
    const minD = Math.min(...distancias), maxD = Math.max(...distancias);
    const minC = Math.min(...costos), maxC = Math.max(...costos);

    calculado.forEach(h=>{
      const distNorm = (typeof h.distanciaKm !== "number" || maxD === minD)
        ? 0.5 // sin dato de distancia, no penaliza ni favorece
        : (h.distanciaKm - minD) / (maxD - minD);
      const costoNorm = (maxC === minC) ? 0 : (h.totalPaciente - minC) / (maxC - minC);
      h.score = distNorm * PESO_DISTANCIA + costoNorm * PESO_COSTO;
      h.esMasCercano = h.distanciaKm === minD;
      h.esMasEconomico = h.totalPaciente === minC;
    });

    calculado.sort((a,b)=> a.score - b.score);
    return calculado;
  }

  // ---------- MOTOR DE CONVERSACIÓN ----------

  const thread = document.getElementById('thread');
  const chipsEl = document.getElementById('chips');
  const chipsToggle = document.getElementById('chipsToggle');
  const chipsPanel = document.getElementById('chipsPanel');
  const form = document.getElementById('composer');
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  document.getElementById('planChip').textContent = PLAN.nombre;

  // ---------- TEMA CLARO / OSCURO ----------

  const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>`;
  const THEME_KEY = "redMedi-red-theme";
  const themeToggle = document.getElementById('themeToggle');

  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');

  function aplicarTema(tema){
    document.documentElement.setAttribute('data-theme', tema);
    
    // Verificamos que los spans existan para no causar errores
    if (themeIcon && themeText) {
      // 1. Insertamos solo el SVG dentro del span del ícono
      themeIcon.innerHTML = tema === "dark" ? SUN_ICON : MOON_ICON;
      
      // 2. Cambiamos solo el texto dentro del span del texto
      themeText.textContent = "Tema " + (tema === "dark" ? "claro" : "oscuro");
    }
  }

  let temaGuardado = "light";
  try{ temaGuardado = localStorage.getItem(THEME_KEY) || "light"; }catch{ /* localStorage no disponible */ }
  aplicarTema(temaGuardado);

  themeToggle.addEventListener('click', function(){
    const actual = document.documentElement.getAttribute('data-theme') === "dark" ? "dark" : "light";
    const siguiente = actual === "dark" ? "light" : "dark";
    aplicarTema(siguiente);
    try{ localStorage.setItem(THEME_KEY, siguiente); }catch{ /* no pasa nada si no se puede guardar */ }
  });

  // Datos del paciente capturados en el formulario previo (nombre, edad, ubicación,
  // y el plan de seguro elegido en el bloque "Tipo de seguro").
  let usuario = { nombre:"", edad:null, ubicacion:"", planValor:"", planNombre:"" };

  let state = "inicio"; // inicio -> esperando_sintoma -> mostrado_resultado -> esperando_confirmacion_otro

  function scrollToBottom(){
    thread.scrollTop = thread.scrollHeight;
  }

  function addUserMessage(text){
    const row = document.createElement('div');
    row.className = 'row user';
    row.innerHTML = `<div class="bubble"><span class="label">Tú</span><p></p></div>`;
    row.querySelector('p').textContent = text;
    thread.appendChild(row);
    scrollToBottom();
  }

  function addBotMessageHTML(html){
    const row = document.createElement('div');
    row.className = 'row bot';
    row.innerHTML = `<div class="bubble">${html}</div>`;
    thread.appendChild(row);
    scrollToBottom();
    return row;
  }

  function addBotText(text){
    return addBotMessageHTML(`<p>${text}</p>`);
  }

  function showTyping(){
    const row = document.createElement('div');
    row.className = 'row bot';
    row.innerHTML = `<div class="bubble typing"><span></span><span></span><span></span></div>`;
    thread.appendChild(row);
    scrollToBottom();
    return row;
  }

  function abrirChipsPanel(){
    if(!chipsPanel || chipsPanel.hidden === false) return;
    chipsPanel.hidden = false;
    if(chipsToggle) chipsToggle.setAttribute('aria-expanded', 'true');
  }
  function cerrarChipsPanel(){
    if(!chipsPanel || chipsPanel.hidden === true) return;
    chipsPanel.hidden = true;
    if(chipsToggle) chipsToggle.setAttribute('aria-expanded', 'false');
  }
  if(chipsToggle){
    chipsToggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(chipsPanel && chipsPanel.hidden) abrirChipsPanel();
      else cerrarChipsPanel();
    });
  }
  document.addEventListener('click', (e)=>{
    if(!chipsPanel || chipsPanel.hidden) return;
    if(!chipsPanel.contains(e.target) && chipsToggle && !chipsToggle.contains(e.target)){
      cerrarChipsPanel();
    }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && chipsPanel && !chipsPanel.hidden) cerrarChipsPanel();
  });

  function setChips(list){
    chipsEl.innerHTML = "";
    list.forEach(label=>{
      const b = document.createElement('button');
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener('click', ()=>{
        input.value = label;
        cerrarChipsPanel();
        form.requestSubmit();
      });
      chipsEl.appendChild(b);
    });

    const hayChips = list.length > 0;
    if(chipsToggle) chipsToggle.hidden = !hayChips;
    if(!hayChips) cerrarChipsPanel();
  }

  function escapeHtml(str){
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderResultado(espId, espNombre, sintomaTexto){
    const costos = calcularCostos(espId, usuario.ubicacion, usuario.planValor);
    const mejor = costos[0];
    const resto = costos.slice(1,4);

    // Explicamos por qué se recomienda ese hospital: puede ser el más cercano, el más
    // económico, ambos a la vez, o simplemente el mejor balance entre los dos.
    let motivo;
    if(mejor.esMasCercano && mejor.esMasEconomico){
      motivo = `Es el hospital más cercano a ${escapeHtml(usuario.ubicacion)} y también el más económico para ${escapeHtml(espNombre.toLowerCase())}.`;
    } else if(mejor.esMasCercano){
      motivo = `Es el hospital más cercano a ${escapeHtml(usuario.ubicacion)} con esta especialidad, con un costo razonable frente a las demás opciones de tu red.`;
    } else if(mejor.esMasEconomico){
      motivo = `Es la opción más económica de tu red para ${escapeHtml(espNombre.toLowerCase())}, a una distancia razonable desde ${escapeHtml(usuario.ubicacion)}.`;
    } else {
      motivo = `Es el mejor balance entre cercanía a ${escapeHtml(usuario.ubicacion)} y costo, comparado con el resto de tu red.`;
    }

    let html = `
      <span class="label">Asistente</span>
      <div class="result-card">
        <div class="spec">Especialidad sugerida</div>
        <h3>${espNombre}</h3>
        <div class="cost-line">
          <span>Copago de tu plan (${escapeHtml(usuario.planNombre || PLAN.nombre)})</span>
          <span class="num">$${mejor.copago.toFixed(2)}</span>
        </div>
        <div class="cost-line">
          <span>Precio de la consulta</span>
          <span class="num">$${mejor.tarifaConsulta.toFixed(2)}</span>
        </div>
        <div class="cost-line">
          <span>Total a pagar por el seguro</span>
          <span class="num">$${mejor.montoSeguro.toFixed(2)}</span>
        </div>
        <div class="cost-line total">
          <span>Total a pagar</span>
          <span class="num">$${mejor.totalPaciente.toFixed(2)}</span>
        </div>

        <div class="hospital-pick">
          <div class="best">RECOMENDADO PARA TI</div>
          <div class="name">${escapeHtml(mejor.nombre)}</div>
          <div class="addr">${escapeHtml(mejor.direccion)} · ${mejor.distanciaKm} km desde ${escapeHtml(usuario.ubicacion)}</div>
          <div class="addr" style="margin-top:4px;">${motivo}</div>
        </div>
        ${resto.length ? `
        <div class="alt-list">
          ${resto.map(h=>`<div class="alt-item" title="Precio de la consulta en este hospital: $${h.tarifaConsulta.toFixed(2)}"><span>${escapeHtml(h.nombre)} · ${h.distanciaKm} km</span><span class="amt">$${h.totalPaciente.toFixed(2)}</span></div>`).join('')}
        </div>` : ''}
      </div>
    `;
    addBotMessageHTML(html);
  }

  async function manejarSintoma(texto){
    const typingRow = showTyping();

    // 1) Intentar con Groq (interpretación más flexible del lenguaje natural)
    const resultadoGroq = await detectarEspecialidadConGroq(texto);
    typingRow.remove();

    let esp, mensajeIntro;

    if(resultadoGroq){
      esp = resultadoGroq.especialidad;
      mensajeIntro = escapeHtml(resultadoGroq.mensaje);
    } else {
      // Aviso visible: Groq falló 
      if(GROQ_API_KEY){
        addBotMessageHTML(`<p style="color:#a3432f;font-size:13px;">⚠️ No pude conectar con el modelo de IA (${escapeHtml(window.__ultimoErrorGroq || "error desconocido")}). Usando el motor de respaldo por palabras clave.</p>`);
      }
      // 2) Fallback: motor local por palabras clave
      esp = detectarEspecialidad(texto);
      if(!esp){
        addBotText("No logré identificar con claridad tu especialidad a partir de eso. ¿Puedes darme un poco más de detalle? Por ejemplo: dónde sientes la molestia y desde cuándo.");
        setChips(["Dolor de garganta y fiebre","Dolor de espalda al agacharme","Dolor de pecho al respirar","Ronchas en la piel"]);
        return;
      }
      mensajeIntro = `Con base en "${escapeHtml(texto)}", esto suena a algo que atiende <strong>${esp.nombre}</strong>. Voy a revisar tu plan y la red de hospitales para calcular tu copago.`;
    }

    addBotText(mensajeIntro);

    const typing2 = showTyping();
    setTimeout(()=>{
      typing2.remove();
      renderResultado(esp.id, esp.nombre, texto);
      state = "esperando_confirmacion_otro";
      addBotText("¿Quieres que revise otro síntoma o programo información para agendar en ese hospital?");
      setChips(["Agendar en ese hospital","Consultar otro síntoma","Ver todos los hospitales de la red"]);
    }, 500);
  }

  function iniciar(){
    const primerNombre = usuario.nombre.split(" ")[0] || "";
    addBotText(`Hola${primerNombre ? ", " + escapeHtml(primerNombre) : ""}, soy tu agente virtual <strong>${PLAN.nombre}</strong>. 
    Cuéntame qué síntoma  o molestia tienes y te diré qué especialidad te conviene, cuánto pagarás de copago y 
    en qué hospital de la red te conviene más — combinando cercanía y costo.`);
    setChips(["Dolor de garganta y fiebre","Dolor de espalda","Dolor de pecho","Ronchas en la piel"]);
    state = "esperando_sintoma";
  }

  // ---------- FORMULARIO PREVIO (onboarding) ----------

  const onboarding = document.getElementById('onboarding');
  const layout = document.getElementById('layout');
  const onboardingForm = document.getElementById('onboardingForm');
  const nombreInput = document.getElementById('nombreInput');
  const edadInput = document.getElementById('edadInput');
  const ubicacionInput = document.getElementById('ubicacionInput');
  const sbNombre = document.getElementById('sbNombre');
  const sbEdad = document.getElementById('sbEdad');
  const sbUbicacion = document.getElementById('sbUbicacion');
  const sbPlan = document.getElementById('sbPlan');
  const logoutBtn = document.getElementById('logoutBtn');

  function marcarValidez(fieldId, esValido){
    document.getElementById(fieldId).classList.toggle('invalid', !esValido);
  }

  function mostrarChat(){
    sbNombre.textContent = usuario.nombre;
    sbEdad.textContent = `${usuario.edad} años`;
    sbUbicacion.textContent = usuario.ubicacion;
    sbPlan.textContent = usuario.planNombre;

    onboarding.hidden = true;
    layout.hidden = false;
    input.focus();
    iniciar();
  }

  onboardingForm.addEventListener('submit', function(e){
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const edadStr = edadInput.value.trim();
    const edad = Number(edadStr);
    const ubicacion = ubicacionInput.value;

    const nombreValido = nombre.length >= 3 && nombre.includes(" ");
    const edadValida = edadStr !== "" && Number.isFinite(edad) && edad >= 0 && edad <= 120;
    const ubicacionValida = UBICACIONES.includes(ubicacion);

    marcarValidez('fieldNombre', nombreValido);
    marcarValidez('fieldEdad', edadValida);
    marcarValidez('fieldUbicacion', ubicacionValida);

    if(!nombreValido || !edadValida || !ubicacionValida) return;

    const plan = obtenerPlanSeleccionado();
    usuario = { nombre, edad, ubicacion, planValor: plan.valor, planNombre: plan.nombre };
    mostrarChat();
  });

  // "Cerrar sesión": reinicia la conversación y los datos del paciente, y vuelve a
  // mostrar el formulario previo para empezar de cero.
  logoutBtn.addEventListener('click', function(){
    usuario = { nombre:"", edad:null, ubicacion:"", planValor:"", planNombre:"" };
    thread.innerHTML = "";
    setChips([]);
    input.value = "";
    lastSintoma = "";
    state = "inicio";
    sendBtn.disabled = false;

    onboardingForm.reset();
    // form.reset() no dispara "change", así que forzamos la resincronización del
    // bloque de tipo de seguro (habilita/deshabilita los <select> según el radio).
    document.querySelector('input[name="tipoSeguro"]:checked')?.dispatchEvent(new Event('change'));
    marcarValidez('fieldNombre', true);
    marcarValidez('fieldEdad', true);
    marcarValidez('fieldUbicacion', true);

    layout.hidden = true;
    onboarding.hidden = false;
    if (typeof cerrarSidebar === 'function') cerrarSidebar();
  });

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const val = input.value.trim();
    if(!val) return;
    addUserMessage(val);
    input.value = "";
    setChips([]);
    sendBtn.disabled = true;

    try{
      if(state === "esperando_confirmacion_otro"){
        const low = val.toLowerCase();
        if(low.includes("otro") || low.includes("síntoma") || low.includes("sintoma")){
          addBotText("Perfecto, cuéntame el nuevo síntoma.");
          state = "esperando_sintoma";
          return;
        }
        if(low.includes("agendar")){
          addBotText("Para agendar, comunícate al 800-Medi-red o desde la app de Medi-red indicando la especialidad y el hospital que te mostré. Tu copago ya calculado se aplicará al momento de la cita.");
          setChips(["Consultar otro síntoma"]);
          return;
        }
        if(low.includes("todos") || low.includes("hospitales")){
          const espUltimo = detectarEspecialidad(lastSintoma || "");
          addBotText("Aquí tienes la comparación completa de hospitales de tu red para esa especialidad.");
          if(espUltimo) renderResultado(espUltimo.id, espUltimo.nombre, lastSintoma);
          setChips(["Consultar otro síntoma"]);
          return;
        }
        // si no coincide con ninguna opción, lo tratamos como nuevo síntoma
        state = "esperando_sintoma";
      }

      lastSintoma = val;
      await manejarSintoma(val);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  let lastSintoma = "";
})();

// Referencias a los elementos del DOM
const profileMenuToggle = document.getElementById('profileMenuToggle');
const headerPopup = document.getElementById('headerPopup');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');

// Alternar visibilidad del popup al pulsar el botón de perfil
profileMenuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = headerPopup.hasAttribute('hidden');
  if (isHidden) {
    headerPopup.removeAttribute('hidden');
  } else {
    headerPopup.setAttribute('hidden', '');
  }
});

// Cerrar el popup al hacer clic fuera de él
document.addEventListener('click', (e) => {
  if (!headerPopup.contains(e.target) && !profileMenuToggle.contains(e.target)) {
    headerPopup.setAttribute('hidden', '');
  }
});

// Cerrar el popup al presionar la tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !headerPopup.hasAttribute('hidden')) {
    headerPopup.setAttribute('hidden', '');
  }
});

// Actualizar el tema y ajustar el ícono/texto dentro del popup
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  
  if (themeIcon && themeText) {
    themeIcon.innerHTML = tema === 'dark' ? SUN_ICON : MOON_ICON;
    // Opción A: "Tema claro" / "Tema oscuro"
    themeText.textContent = 'Tema ' + (tema === 'dark' ? 'claro' : 'oscuro');
    // Opción B: "Tema: Modo claro" / "Tema: Modo oscuro" (si prefieres mantener la palabra 'Modo')
    themeText.textContent = 'Tema: ' + (tema === 'dark' ? 'Modo claro' : 'Modo oscuro');
  }
}

// ---------- MENÚ LATERAL (SIDEBAR) EN RESPONSIVE ----------
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const layoutEl = document.getElementById('layout');

function abrirSidebar() {
  if (!layoutEl) return;
  layoutEl.classList.add('sidebar-open');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'true');
}
function cerrarSidebar() {
  if (!layoutEl) return;
  layoutEl.classList.remove('sidebar-open');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
}

if (sidebarToggle && layoutEl) {
  sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutEl.classList.contains('sidebar-open') ? cerrarSidebar() : abrirSidebar();
  });
}

// Clic fuera del panel (sobre el fondo oscurecido) lo cierra
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', cerrarSidebar);
}

// Escape cierra el sidebar (además del popup de perfil, ya manejado arriba)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layoutEl && layoutEl.classList.contains('sidebar-open')) {
    cerrarSidebar();
  }
});

// Tocar un enlace dentro del sidebar (ej. "¿Qué es Medi-Red?") lo cierra
document.querySelectorAll('.sidebar a').forEach((a) => {
  a.addEventListener('click', cerrarSidebar);
});

// Si la ventana se agranda y deja de ser "mobile", nos aseguramos de que quede cerrado
window.addEventListener('resize', () => {
  if (window.innerWidth > 760) cerrarSidebar();
});