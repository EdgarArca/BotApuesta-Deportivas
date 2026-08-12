"use client";
import { useState } from "react";

const AGENTS_INFO: Record<string, { name: string; icon: string; color: string }> = {
  scout: { name: "Scout", icon: "🔭", color: "#8B5CF6" },
  tarjetas: { name: "Tarjetas", icon: "🟨", color: "#EF4444" },
  corners: { name: "Córners", icon: "🚩", color: "#F97316" },
  disparos: { name: "Disparos", icon: "🎯", color: "#0EA5E9" },
  jugadores_clave: { name: "Jugadores Clave", icon: "⭐", color: "#EAB308" },
  esceptico: { name: "Escéptico", icon: "🔍", color: "#DC2626" },
  matematico: { name: "Matemático", icon: "🧮", color: "#10B981" },
  sintetizador: { name: "Síntesis", icon: "🧠", color: "#7C3AED" },
};

const AGENT_ORDER = ["scout", "tarjetas", "corners", "disparos", "jugadores_clave", "esceptico", "matematico", "sintetizador"];
const TOTAL_AGENTS = AGENT_ORDER.length;

export default function Home() {
  const [partido, setPartido] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [skippedAgents, setSkippedAgents] = useState<Record<string, boolean>>({});

  // Datos manuales (opcional) para saltear el Scout y ahorrar tokens
  const [mostrarDatos, setMostrarDatos] = useState(false);
  const [ultimos5Local, setUltimos5Local] = useState("");
  const [ultimos5Visitante, setUltimos5Visitante] = useState("");
  const [tarjetasLocal, setTarjetasLocal] = useState("");
  const [tarjetasVisitante, setTarjetasVisitante] = useState("");
  const [cornersLocal, setCornersLocal] = useState("");
  const [cornersVisitante, setCornersVisitante] = useState("");
  const [golesLocal, setGolesLocal] = useState("");
  const [golesVisitante, setGolesVisitante] = useState("");
  const [jugadoresClave, setJugadoresClave] = useState("");
  const [proximosLocal, setProximosLocal] = useState("");
  const [proximosVisitante, setProximosVisitante] = useState("");

  function construirDatosManuales(): string {
    const bloques = [
      ultimos5Local && `Últimos 5 resultados equipo local:\n${ultimos5Local}`,
      ultimos5Visitante && `Últimos 5 resultados equipo visitante:\n${ultimos5Visitante}`,
      (tarjetasLocal || tarjetasVisitante) && `Tarjetas — Local: ${tarjetasLocal || "N/D"} | Visitante: ${tarjetasVisitante || "N/D"}`,
      (cornersLocal || cornersVisitante) && `Córners — Local: ${cornersLocal || "N/D"} | Visitante: ${cornersVisitante || "N/D"}`,
      (golesLocal || golesVisitante) && `Goles (a favor/en contra) — Local: ${golesLocal || "N/D"} | Visitante: ${golesVisitante || "N/D"}`,
      jugadoresClave && `Jugadores clave (según el usuario):\n${jugadoresClave}`,
      proximosLocal && `Próximos 2 partidos del equipo local:\n${proximosLocal}`,
      proximosVisitante && `Próximos 2 partidos del equipo visitante:\n${proximosVisitante}`,
    ].filter(Boolean);
    return bloques.join("\n\n");
  }

  async function analizar() {
    if (!partido.trim() || loading) return;
    setLoading(true);
    setError("");
    setResults({});
    setActiveAgent("scout");
    setSkippedAgents({});

    const datosManuales = construirDatosManuales();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partido, datosManuales }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace("data: ", ""));
            
            if (data.error) {
              setError(`${data.agentId}: ${data.error}`);
            } else if (data.result) {
              setResults(prev => ({ ...prev, [data.agentId]: data.result }));
              if (data.skipped) {
                setSkippedAgents(prev => ({ ...prev, [data.agentId]: true }));
              }
              
              const currentIndex = AGENT_ORDER.indexOf(data.agentId);
              if (currentIndex < AGENT_ORDER.length - 1) {
                setActiveAgent(AGENT_ORDER[currentIndex + 1]);
              } else {
                setActiveAgent(null);
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
    
    setLoading(false);
    setActiveAgent(null);
  }

  const completedCount = Object.keys(results).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-3xl">
        
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex gap-2 bg-purple-50 rounded-full px-3 py-1 mb-2">
            <span className="text-xs font-bold text-purple-600">⚽ SWARM PRO</span>
            <span className="text-xs font-bold text-emerald-600">APOSTALA 🇵🇾</span>
          </div>
          <h1 className="text-xl font-bold">{TOTAL_AGENTS} Agentes en Tiempo Real</h1>
          <p className="text-xs text-gray-500 mt-1">Incluye predicción de marcadores exactos</p>
        </div>

        {/* Input */}
        <div className="bg-white rounded-xl border p-4 mb-4 shadow-sm">
          <input
            type="text"
            value={partido}
            onChange={(e) => setPartido(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analizar()}
            placeholder="Ej: Barcelona vs Real Madrid La Liga"
            className="w-full rounded-lg border px-3 py-2.5 mb-3 outline-none focus:border-purple-400"
          />

          <button
            type="button"
            onClick={() => setMostrarDatos(v => !v)}
            className="w-full text-left text-xs font-semibold text-purple-600 mb-3 flex items-center gap-1"
          >
            {mostrarDatos ? "▲" : "▼"} Datos manuales (opcional, ahorra tokens — se salta la búsqueda del Scout)
          </button>

          {mostrarDatos && (
            <div className="space-y-3 mb-4 bg-purple-50/50 rounded-lg p-3 border border-purple-100">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Últimos 5 — Local</label>
                  <textarea
                    value={ultimos5Local}
                    onChange={(e) => setUltimos5Local(e.target.value)}
                    placeholder="Ej: W 2-0, L 0-1, D 1-1, W 3-0, L 0-2"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Últimos 5 — Visitante</label>
                  <textarea
                    value={ultimos5Visitante}
                    onChange={(e) => setUltimos5Visitante(e.target.value)}
                    placeholder="Ej: W 1-0, W 2-1, D 0-0, L 1-2, W 3-1"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Tarjetas — Local</label>
                  <input
                    value={tarjetasLocal}
                    onChange={(e) => setTarjetasLocal(e.target.value)}
                    placeholder="Ej: 3.2 por partido"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Tarjetas — Visitante</label>
                  <input
                    value={tarjetasVisitante}
                    onChange={(e) => setTarjetasVisitante(e.target.value)}
                    placeholder="Ej: 2.5 por partido"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Córners — Local</label>
                  <input
                    value={cornersLocal}
                    onChange={(e) => setCornersLocal(e.target.value)}
                    placeholder="Ej: 5.8 por partido"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Córners — Visitante</label>
                  <input
                    value={cornersVisitante}
                    onChange={(e) => setCornersVisitante(e.target.value)}
                    placeholder="Ej: 4.1 por partido"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Goles (favor/contra) — Local</label>
                  <input
                    value={golesLocal}
                    onChange={(e) => setGolesLocal(e.target.value)}
                    placeholder="Ej: 1.8 a favor / 0.9 en contra"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Goles (favor/contra) — Visitante</label>
                  <input
                    value={golesVisitante}
                    onChange={(e) => setGolesVisitante(e.target.value)}
                    placeholder="Ej: 1.2 a favor / 1.4 en contra"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500">Jugadores clave (según vos)</label>
                <textarea
                  value={jugadoresClave}
                  onChange={(e) => setJugadoresClave(e.target.value)}
                  placeholder="Ej: Juan Pérez (delantero, 8 goles, capitán, equipo pierde 60% sin él)"
                  className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Próximos 2 partidos — Local</label>
                  <textarea
                    value={proximosLocal}
                    onChange={(e) => setProximosLocal(e.target.value)}
                    placeholder="Ej: vs Equipo X (liga), vs Equipo Y (copa)"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500">Próximos 2 partidos — Visitante</label>
                  <textarea
                    value={proximosVisitante}
                    onChange={(e) => setProximosVisitante(e.target.value)}
                    placeholder="Ej: vs Equipo Z (liga), vs Equipo W (copa)"
                    className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-400">
                Campos vacíos se ignoran. Si dejás todo vacío, el Scout busca los datos por su cuenta (gasta más tokens).
              </p>
            </div>
          )}
          <button
            onClick={analizar}
            disabled={loading || !partido.trim()}
            className="w-full rounded-xl py-3 font-semibold text-white disabled:bg-gray-300"
            style={{ background: loading ? "#9CA3AF" : "linear-gradient(135deg, #8B5CF6, #6366F1)" }}
          >
            {loading ? `⏳ Analizando... (${completedCount}/${TOTAL_AGENTS} agentes)` : `▶ Analizar con ${TOTAL_AGENTS} Agentes`}
          </button>
          
          {loading && (
            <div className="mt-3">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(completedCount / TOTAL_AGENTS) * 100}%` }}
                />
              </div>
              <p className="text-center text-xs text-gray-500 mt-2">
                {activeAgent && `${AGENTS_INFO[activeAgent]?.icon} ${AGENTS_INFO[activeAgent]?.name} trabajando...`}
              </p>
            </div>
          )}
          
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-600">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Agents Grid */}
        {(loading || completedCount > 0) && (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase text-gray-400">Agentes ({completedCount}/{TOTAL_AGENTS})</span>
              {completedCount > 0 && !loading && (
                <button 
                  onClick={() => {
                    const txt = AGENT_ORDER.filter(id => results[id])
                      .map(id => `${AGENTS_INFO[id].icon} ${AGENTS_INFO[id].name}\n${results[id]}`)
                      .join("\n\n───────────────\n\n");
                    navigator.clipboard.writeText(`⚽ SWARM - ${partido}\n\n${txt}`);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  📋 Copiar
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {AGENT_ORDER.filter(id => id !== "sintetizador").map(id => {
                const agent = AGENTS_INFO[id];
                const result = results[id];
                const isActive = activeAgent === id;
                const short = result?.slice(0, 150) || "";
                const isLong = (result?.length || 0) > 150;
                const isExpanded = expanded[id];

                return (
                  <div 
                    key={id}
                    className="relative bg-white rounded-xl border p-2.5 transition-all"
                    style={{ borderColor: result ? `${agent.color}50` : "#e5e7eb" }}
                  >
                    {isActive && (
                      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl animate-pulse" style={{ background: agent.color }} />
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{agent.icon}</span>
                      <span className="text-xs font-semibold" style={{ color: result ? "#111" : "#aaa" }}>{agent.name}</span>
                      {result && !isActive && <span className="ml-auto text-xs" style={{ color: agent.color }}>✓</span>}
                      {skippedAgents[id] && <span className="ml-1 text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded">manual</span>}
                      {isActive && <div className="ml-auto h-2 w-2 rounded-full animate-pulse" style={{ background: agent.color }} />}
                    </div>
                    {result && (
                      <div className="bg-gray-50 rounded p-1.5 mt-1">
                        <pre className="whitespace-pre-wrap text-[10px] text-gray-700 font-sans leading-relaxed">
                          {isExpanded ? result : short}{!isExpanded && isLong && "..."}
                        </pre>
                        {isLong && (
                          <button 
                            onClick={() => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
                            className="text-[9px] mt-1" 
                            style={{ color: agent.color }}
                          >
                            {isExpanded ? "▲ Menos" : "▼ Más"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Veredicto Final */}
        {results.sintetizador && (
          <div className="bg-white rounded-xl border-2 border-purple-300 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🧠</span>
              <span className="font-bold text-gray-900">Veredicto Final</span>
            </div>
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-gray-800">
              {results.sintetizador}
            </pre>
          </div>
        )}

        {/* Empty state */}
        {!loading && completedCount === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">⚽</div>
            <p>Escribí un partido para analizar</p>
            <div className="flex justify-center gap-2 mt-3 text-xs flex-wrap">
              <span className="bg-yellow-50 text-yellow-600 px-2 py-1 rounded">⭐ Jugadores Clave</span>
              <span className="bg-red-50 text-red-600 px-2 py-1 rounded">🟨 Tarjetas</span>
              <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded">🚩 Córners</span>
              <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">🎯 Disparos</span>
              <span className="bg-green-50 text-green-600 px-2 py-1 rounded">🧠 Veredicto</span>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 mt-6">
          aposta.la • Juega responsablemente
        </div>
      </div>
    </div>
  );
}
