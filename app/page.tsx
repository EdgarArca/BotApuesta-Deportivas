"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";

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

// Columnas esperadas en cada bloque de equipo del Excel (en este orden, empezando en col B)
const COLUMNAS = [
  "fecha", "rival", "condicion", "resultado", "golAFavor", "golEnContra",
  "golesTotal", "rojas", "amarillasEquipo", "amarillasRival", "amarillasTotal",
  "cornersAFavor", "cornersEnContra", "cornersTotal",
] as const;

// Columnas del bloque "Proximos Partidos" (fecha, rival, condicion, competencia)
const COLUMNAS_PROXIMO = ["fecha", "rival", "condicion", "competencia"] as const;

type Partido = Record<(typeof COLUMNAS)[number], any>;
type ProximoPartido = Record<(typeof COLUMNAS_PROXIMO)[number], any>;
type EquipoExcel = { equipo: string; partidos: Partido[]; proximos: ProximoPartido[] };

function formatFecha(f: any): string {
  if (f instanceof Date) return f.toLocaleDateString("es-PY");
  if (typeof f === "number") {
    // fecha serial de Excel, por si cellDates no la convirtió
    const d = XLSX.SSF.parse_date_code(f);
    if (d) return `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}/${d.y}`;
  }
  return String(f ?? "");
}

function filaVacia(fila: any[] | undefined): boolean {
  if (!fila) return true;
  return fila.every(c => c === undefined || c === null || c === "");
}

// Recorre las filas crudas del Excel y arma un bloque por cada equipo:
// nombre del equipo → encabezados → partidos jugados → (opcional) "Proximos Partidos" → fechas.
function parsearExcel(rows: any[][]): EquipoExcel[] {
  const equipos: EquipoExcel[] = [];
  let i = 0;
  while (i < rows.length) {
    const fila = rows[i] || [];
    const c1 = fila[1];
    const c2 = fila[2];
    const esFilaDeEquipo = typeof c1 === "string" && c1.trim() !== "" &&
      c1.trim().toLowerCase() !== "fecha" &&
      c1.trim().toLowerCase() !== "proximos partidos" &&
      (c2 === undefined || c2 === null || c2 === "");

    if (esFilaDeEquipo) {
      const nombreEquipo = c1.trim();
      i++;
      if (rows[i] && String(rows[i][1]).trim().toLowerCase() === "fecha") i++; // saltar encabezados

      const partidos: Partido[] = [];
      while (i < rows.length && rows[i] && rows[i][1] !== undefined && rows[i][1] !== null && rows[i][1] !== "") {
        const r = rows[i];
        const partido = {} as Partido;
        COLUMNAS.forEach((col, idx) => { partido[col] = r[idx + 1]; });
        partidos.push(partido);
        i++;
      }

      // Puede venir una fila en blanco y después "Proximos Partidos" para este mismo equipo
      let j = i;
      while (j < rows.length && filaVacia(rows[j])) j++;
      const proximos: ProximoPartido[] = [];
      if (rows[j] && typeof rows[j][1] === "string" && rows[j][1].trim().toLowerCase() === "proximos partidos") {
        j++;
        while (j < rows.length && rows[j] && rows[j][1] !== undefined && rows[j][1] !== null && rows[j][1] !== "") {
          const r = rows[j];
          const prox = {} as ProximoPartido;
          COLUMNAS_PROXIMO.forEach((col, idx) => { prox[col] = r[idx + 1]; });
          proximos.push(prox);
          j++;
        }
        i = j; // consumimos también el bloque de próximos partidos
      }

      equipos.push({ equipo: nombreEquipo, partidos, proximos });
    } else {
      i++;
    }
  }
  return equipos;
}

function promedio(nums: number[]): string {
  if (nums.length === 0) return "0";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

// Convierte los partidos parseados de un equipo en texto listo para el prompt
function formatearBloqueEquipo(e: EquipoExcel): string {
  if (e.partidos.length === 0) return `${e.equipo}: sin partidos cargados en el Excel`;

  const num = (v: any) => Number(v) || 0;
  const golF = e.partidos.map(p => num(p.golAFavor));
  const golC = e.partidos.map(p => num(p.golEnContra));
  const amE = e.partidos.map(p => num(p.amarillasEquipo));
  const amR = e.partidos.map(p => num(p.amarillasRival));
  const corF = e.partidos.map(p => num(p.cornersAFavor));
  const corC = e.partidos.map(p => num(p.cornersEnContra));
  const rojasTotal = e.partidos.reduce((a, p) => a + num(p.rojas), 0);

  const detalle = e.partidos.map(p =>
    `${formatFecha(p.fecha)} vs ${p.rival} (${p.condicion}): ${p.resultado} | Amarillas ${p.amarillasEquipo}-${p.amarillasRival} | Córners ${p.cornersAFavor}-${p.cornersEnContra}`
  ).join("\n");

  let texto = `${e.equipo} — últimos ${e.partidos.length} partidos:\n${detalle}\n\nPromedios ${e.equipo}: Goles a favor ${promedio(golF)} | Goles en contra ${promedio(golC)} | Amarillas propias ${promedio(amE)} | Amarillas rival ${promedio(amR)} | Córners a favor ${promedio(corF)} | Córners en contra ${promedio(corC)} | Rojas totales (suma): ${rojasTotal}`;

  if (e.proximos.length > 0) {
    const proxTxt = e.proximos.map(p => `${formatFecha(p.fecha)} vs ${p.rival} (${p.condicion}) — ${p.competencia}`).join("\n");
    texto += `\n\nPróximos partidos de ${e.equipo} (fixture / congestión de calendario):\n${proxTxt}`;
  }

  return texto;
}

export default function Home() {
  const [partido, setPartido] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [skippedAgents, setSkippedAgents] = useState<Record<string, boolean>>({});

  // Datos cargados desde Excel (opcional) para saltear el Scout y ahorrar tokens
  const [equiposExcel, setEquiposExcel] = useState<EquipoExcel[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [errorExcel, setErrorExcel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorExcel("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      const equipos = parsearExcel(rows);

      if (equipos.length === 0) {
        setErrorExcel("No pude reconocer equipos en el Excel. Revisá que siga la plantilla (nombre de equipo en una fila, encabezados en la siguiente, partidos abajo).");
        setEquiposExcel(null);
        return;
      }
      setEquiposExcel(equipos);
      setNombreArchivo(file.name);
    } catch (err: any) {
      setErrorExcel("No pude leer el archivo: " + err.message);
      setEquiposExcel(null);
    }
  }

  function quitarExcel() {
    setEquiposExcel(null);
    setNombreArchivo("");
    setErrorExcel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function construirDatosManuales(): string {
    const bloques: string[] = [];
    if (equiposExcel && equiposExcel.length > 0) {
      bloques.push("DATOS HISTÓRICOS CARGADOS POR EL USUARIO (desde Excel):");
      equiposExcel.forEach(e => bloques.push(formatearBloqueEquipo(e)));
    }
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

          <div className="mb-3">
            <label className="text-[10px] font-semibold text-gray-500 block mb-1">
              📊 Excel con datos históricos (opcional, ahorra tokens — se salta la búsqueda del Scout)
            </label>
            {!equiposExcel ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-purple-200 rounded-lg py-3 text-xs text-purple-600 cursor-pointer hover:bg-purple-50">
                📁 Subir Liga_Paraguaya.xlsx (misma plantilla de siempre)
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-emerald-700">✓ {nombreArchivo}</span>
                  <button onClick={quitarExcel} className="text-xs text-gray-400 hover:text-red-500">✕ quitar</button>
                </div>
                {equiposExcel.map(e => (
                  <div key={e.equipo} className="text-[10px] text-gray-600">
                    <span className="font-semibold">{e.equipo}</span>: {e.partidos.length} partidos cargados
                    {e.proximos.length > 0 && <> · {e.proximos.length} próximos partidos</>}
                  </div>
                ))}
              </div>
            )}
            {errorExcel && (
              <p className="text-[10px] text-red-500 mt-1">{errorExcel}</p>
            )}
          </div>

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
