// app/api/analyze/route.ts
// STREAMING con agente de RESULTADOS CORRECTOS

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const CASA_APUESTAS = "Apostala (aposta.la) - Paraguay";

// Modelos disponibles:
// - claude-sonnet-5   → agentes chicos / rápidos
// - claude-opus-4-8    → agentes clave (mayor razonamiento)
const MODEL_CHICO = "claude-sonnet-5";
const MODEL_GRANDE = "claude-opus-4-8";

const AGENTS = [
  {
    id: "scout",
    name: "🔭 Scout",
    search: true,
    model: MODEL_CHICO,
    prompt: `Scout de datos para ${CASA_APUESTAS}. Busca TODO:
- Odds 1X2, O/U 2.5, BTTS
- Promedio goles a favor y en contra de cada equipo (local/visitante)
- Árbitro y su promedio de tarjetas
- xG (expected goals) si está disponible
- H2H últimos 5 partidos CON MARCADORES EXACTOS
- Forma últimos 5 y lesiones

Formato compacto (máx 12 líneas).`
  },
  {
    id: "marcadores",
    name: "🎯 Marcadores",
    search: false,
    model: MODEL_GRANDE,
    prompt: `Especialista en RESULTADOS CORRECTOS (Correct Score).

Con los datos del Scout, analiza:
1. Promedio de goles de cada equipo (local/visitante)
2. Resultados más frecuentes en H2H
3. xG y tendencias de goles

Calcula probabilidad de cada marcador usando:
- Distribución de Poisson: P(x) = (λ^x × e^-λ) / x!
- Donde λ = promedio goles esperados

Formato:
═══ MARCADORES MÁS PROBABLES ═══
1. [X-X] → XX% prob | Cuota justa: X.XX
2. [X-X] → XX% prob | Cuota justa: X.XX
3. [X-X] → XX% prob | Cuota justa: X.XX
4. [X-X] → XX% prob | Cuota justa: X.XX
5. [X-X] → XX% prob | Cuota justa: X.XX

VALOR: Si la casa paga más que la cuota justa = HAY VALOR
MEJOR APUESTA: [marcador] @ [cuota casa] vs [cuota justa] → EV +XX%`
  },
  {
    id: "tarjetas",
    name: "🟨 Tarjetas",
    search: false,
    model: MODEL_GRANDE,
    prompt: `Analista TARJETAS. Con los datos:
ÁRBITRO: [nombre] [X.X/partido]
OVER 3.5: XX% | OVER 4.5: XX%
MEJOR APUESTA: [mercado]
(máx 3 líneas)`
  },
  {
    id: "corners",
    name: "🚩 Córners",
    search: false,
    model: MODEL_GRANDE,
    prompt: `Analista CÓRNERS. Con los datos:
PROMEDIO CÓRNERS: [equipo local] X.X | [equipo visitante] X.X | TOTAL ESPERADO: X.X
OVER 8.5: XX% | OVER 9.5: XX% | OVER 10.5: XX%
MEJOR APUESTA: [mercado]
(máx 3 líneas)`
  },
  {
    id: "disparos",
    name: "🎯 Disparos",
    search: false,
    model: MODEL_GRANDE,
    prompt: `Analista DISPAROS:
ESPERADOS: XX tiros | ARQUERO EXIGIDO: [nombre]
MEJOR APUESTA: [mercado]
(máx 2 líneas)`
  },
  {
    id: "tactico",
    name: "📋 Táctico",
    search: false,
    model: MODEL_CHICO,
    prompt: `Táctico. FACTOR_CLAVE: [lo más importante del partido] (1 línea)`
  },
  {
    id: "h2h",
    name: "📜 H2H",
    search: false,
    model: MODEL_CHICO,
    prompt: `H2H. TENDENCIA: [patrón de los últimos enfrentamientos] (1 línea)`
  },
  {
    id: "esceptico",
    name: "🔍 Escéptico",
    search: false,
    model: MODEL_CHICO,
    prompt: `Escéptico. Cuestiona todo:
TRAMPA: [mercado inflado sin valor]
VALOR OCULTO: [mercado que nadie ve]
(máx 2 líneas)`
  },
  {
    id: "matematico",
    name: "🧮 Matemático",
    search: false,
    model: MODEL_CHICO,
    prompt: `Matemático. Calcula EV = (Prob × Cuota) - 1 para TODOS los mercados incluyendo marcadores exactos.

TOP 5 VALOR (incluyendo al menos 1 marcador exacto):
1. [mercado/marcador] @ [cuota] → EV +XX%
2. [mercado/marcador] @ [cuota] → EV +XX%
3. [mercado/marcador] @ [cuota] → EV +XX%
4. [mercado/marcador] @ [cuota] → EV +XX%
5. [mercado/marcador] @ [cuota] → EV +XX%`
  },
  {
    id: "sintetizador",
    name: "🧠 Síntesis",
    search: false,
    model: MODEL_GRANDE,
    prompt: `VEREDICTO FINAL:

⚽ PREDICCIÓN: [marcador exacto más probable]
📊 CONFIANZA: XX%

🏆 TOP 3 APUESTAS SEGURAS:
1️⃣ [MERCADO] @ [cuota] | EV +XX%
2️⃣ [MERCADO] @ [cuota] | EV +XX%  
3️⃣ [MERCADO] @ [cuota] | EV +XX%

🎯 MARCADOR EXACTO CON VALOR:
[X-X] @ [cuota] | Prob real: XX% | EV +XX%
(Apostar solo X% del bankroll por ser alto riesgo)

🟨 TARJETAS: [recomendación]
🎯 DISPAROS: [recomendación]

⚠️ EVITAR: [mercado trampa]
💡 MEJOR APUESTA: [en 1 línea]`
  }
];

async function callClaude(client: Anthropic, prompt: string, context: string, useSearch: boolean, model: string) {
  const params: any = {
    model,
    max_tokens: 900,
    messages: [{ role: "user", content: `${prompt}\n\n---\n\n${context}` }]
  };
  if (useSearch) {
    params.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const message = await client.messages.create(params);
  return message.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}

export async function POST(request: NextRequest) {
  const { partido } = await request.json();
  
  if (!partido) {
    return new Response(JSON.stringify({ error: "Falta partido" }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Falta API KEY" }), { status: 500 });
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const results: Record<string, string> = {};
      
      for (const agent of AGENTS) {
        try {
          let context = "";
          if (agent.id === "scout") {
            context = `Partido: ${partido}\nCasa: ${CASA_APUESTAS}`;
          } else if (["esceptico", "matematico", "sintetizador"].includes(agent.id)) {
            context = Object.entries(results).map(([id, text]) => {
              const a = AGENTS.find(x => x.id === id);
              return `${a?.name || id}:\n${text}`;
            }).join("\n\n");
          } else {
            context = `DATOS:\n${results.scout || ""}\n\nPartido: ${partido}`;
          }

          const result = await callClaude(client, agent.prompt, context, agent.search, agent.model);
          results[agent.id] = result;

          const data = JSON.stringify({ 
            agentId: agent.id, 
            name: agent.name, 
            result,
            done: agent.id === "sintetizador"
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            agentId: agent.id, 
            error: error.message 
          })}\n\n`));
        }
      }
      
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
