# MEDI-RED

**MEDI-RED** es un asistente conversacional que ayuda a un paciente a entender, *antes de atenderse*, cuánto le costará una consulta médica: le sugiere la especialidad según su síntoma, calcula su copago según su plan de seguro y le recomienda el hospital de su red que más le conviene, combinando cercanía y costo.

Es una demo desarrollada para el **hackIAthon**, por el equipo **Los Legendarios PTY**.

---

## 📌 Sobre el hackIAthon y el reto elegido

El hackIAthon planteaba cinco retos distintos. Nuestro equipo, **Los Legendarios PTY**, eligió el **Reto 3**:

> **3. Estimador Agéntico de Copago y Cobertura para el Paciente**
>
> **Descripción:** Un agente conversacional que ayude al paciente a entender su beneficio antes de atenderse. El paciente ingresa su síntoma, el agente sugiere la especialidad en el hospital y, cruzando datos con su plan de seguro, le indica exactamente cuánto será su copago y qué hospital de la red le conviene más económicamente.

MEDI-RED es nuestra implementación de ese reto: un agente que recibe el síntoma en lenguaje natural, lo clasifica en una especialidad, cruza esa información con el plan de seguro del paciente y responde con un estimado de copago y una recomendación de hospital dentro de su red.

---

## ¿Qué hace la demo?

1. **Onboarding**: el paciente ingresa su nombre, edad, ubicación (un pueblo de Coclé) y su tipo/plan de seguro (público, privado o especializado y de accidentes).
2. **Chat con el agente**: el paciente describe su síntoma en sus propias palabras (ej. *"dolor de garganta y fiebre"*).
3. **Clasificación de especialidad**: el mensaje se envía a un modelo de lenguaje (Groq) que decide a qué especialidad corresponde el síntoma. Si la IA no responde, hay un buscador de respaldo local por palabras clave.
4. **Cálculo del copago**: según el plan de seguro del paciente y si la especialidad es medicina general o no, se calcula cuánto pagará de copago y cuánto cubre el seguro.
5. **Recomendación de hospital**: entre los hospitales de la red que sí atienden esa especialidad, el sistema calcula la distancia desde la ubicación del paciente y el costo estimado, y recomienda el que ofrece el mejor balance entre ambos.
6. **Respuesta final**: el paciente ve la especialidad sugerida, su copago, el precio de la consulta, cuánto cubre el seguro, el hospital recomendado y alternativas cercanas.

---

## Lógica de copagos y precios

- **Copago**: lo define el plan de seguro del paciente, y puede ser de dos tipos:
  - **Monto fijo** (ej. Seguro Social, HMO, PPO, POS, seguros de accidentes): el paciente paga siempre el mismo monto, sin importar el hospital.
  - **Porcentaje** (Plan de Indemnización): el paciente paga un % del precio de la consulta — así que si ese precio cambia según el hospital, su copago también cambia.
- **Medicina general** tiene siempre el mismo precio de lista en toda la red ($10).
- **Especialidades** tienen un precio de consulta propio por hospital: más bajo en los centros más grandes de la red (Penonomé y Aguadulce) y un poco más alto en los pueblos con menos infraestructura — y esa tarifa solo aplica en los hospitales que realmente ofrecen esa especialidad.

## Cómo se elige el hospital recomendado

1. Se filtran los hospitales de la red que **sí atienden** la especialidad detectada (no todos los pueblos tienen todas las especialidades).
2. Entre los que quedan, se normalizan la **distancia** (km desde el paciente) y el **costo** (lo que pagaría el paciente ahí) a una misma escala.
3. Se combinan con un peso fijo: **70% distancia, 30% costo**. Gana el mejor balance entre ambos — no necesariamente el más barato ni el más cercano por separado.

---

## Estructura del proyecto

```
├── index.html         # El asistente: onboarding + chat con el agente
├── landing.html        # Página de inicio / presentación del proyecto
├── diseño.html         # Página "¿Cómo funciono?": explica la lógica interna del asistente
├── copagos.html         # Página informativa: qué es un copago y tabla de copagos por plan
├── styles.css          # Estilos de index.html (tema claro/oscuro incluido)
├── app.js              # Toda la lógica: clasificación de síntomas, cálculo de copago/costos,
│                        #   selección de hospital y motor de conversación
└── media/               # Ícono, logo y demás recursos gráficos del sitio
```

---

## Tecnologías usadas

- **HTML, CSS y JavaScript** puro (sin frameworks ni build step).
- **Groq API** (`openai/gpt-oss-20b`) para clasificar el síntoma del paciente en una especialidad médica, con un mensaje de sistema que le exige responder solo en JSON y nunca dar diagnósticos, tratamientos ni medicamentos.
- **Buscador de respaldo local** por palabras clave (gana la coincidencia más larga/específica), usado únicamente si la llamada a la IA falla.
- Datos de hospitales, distancias, especialidades, planes de seguro y copagos definidos directamente en `app.js`, a modo de datos de ejemplo para la demo.

---

> ⚠️ La clave de la API de Groq está incluida directamente en `app.js` solo para fines de esta demo. En un entorno real, esa llamada debería hacerse desde un backend propio, nunca exponiendo la clave en el cliente.

---

## Limitaciones y disclaimer

Esta es una **demo de hackathon**, no un producto médico ni de seguros real:

- Las ubicaciones (Penonomé, Antón, Natá, Olá, La Pintada y Aguadulce) son pueblos reales de Coclé, Panamá — de donde son los autores del proyecto — pero los **hospitales, distancias, especialidades disponibles, planes y montos de copago son datos de ejemplo**, no información real de ninguna aseguradora u hospital.
- La IA puede equivocarse al clasificar un síntoma poco claro; el estimado que entrega **nunca sustituye una evaluación médica real** ni la verificación final de una aseguradora.

---

## Equipo

**Los Legendarios PTY**
Proyecto desarrollado para el hackIAthon — Reto 3: Estimador Agéntico de Copago y Cobertura para el Paciente.
