"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";

const AGENTS_INFO: Record<string, { name: string; icon: string; color: string }> = {
  scout: { name: "Scout", icon: "🔭", color: "#8B5CF6" },
  tarjetas: { name: "Tarjetas", icon: "🟨", color: "#EF4444" },
  corners: { name: "Córners", icon: "🚩", color: "#F97316" },
  esceptico: { name: "Escéptico", icon: "🔍", color: "#DC2626" },
  matematico: { name: "Matemático", icon: "🧮", color: "#10B981" },
  sintetizador: { name: "Síntesis", icon: "🧠", color: "#7C3AED" },
};

const AGENT_ORDER = ["scout", "tarjetas", "corners", "esceptico", "matematico", "sintetizador"];
const TOTAL_AGENTS = AGENT_ORDER.length;

// Columnas esperadas en la tabla principal de cada equipo (empezando en col B)
const COLUMNAS = [
  "fecha", "rival", "condicion", "resultado", "golAFavor", "golEnContra",
  "golesTotal", "rojas", "amarillasEquipo", "amarillasRival", "amarillasTotal",
  "cornersAFavor", "cornersEnContra", "cornersTotal",
] as const;

type Partido = Record<(typeof COLUMNAS)[number], any>;
type EquipoExcel = { equipo: string; partidos: Partido[]; proximos: any[]; racha: any[] };
type DatosExcel = { equipos: EquipoExcel[]; historial: any[]; arbitro: string };

// Etiquetas de secciones especiales que pueden aparecer en cualquier columna
const ETIQUETAS_SECCION = ["fecha", "proximos partidos", "racha de jugadores", "historial de encuentros"];

// Normaliza el texto de un encabezado leído del Excel a una key de datos consistente
const MAPA_ENCABEZADOS: Record<string, string> = {
  fecha: "fecha", rival: "rival", condicion: "condicion",
  competicion: "competencia", competencia: "competencia",
  resultado: "resultado", local: "local",
  jugador: "jugador", estadistica: "estadistica",
};

function formatFecha(f: any): string {
  if (f instanceof Date) return f.toLocaleDateString("es-PY");
  if (typeof f === "number") {
    const d = XLSX.SSF.parse_date_code(f); // fecha serial de Excel, por si cellDates no la convirtió
    if (d) return `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}/${d.y}`;
  }
  return String(f ?? "");
}

function celdaVacia(v: any): boolean {
  return v === undefined || v === null || v === "";
}

// Busca una etiqueta de texto (ej. "Proximos Partidos") en cualquier columna,
// dentro de un rango de filas dado. Devuelve su posición o null si no está.
function buscarEtiqueta(rows: any[][], filaIni: number, filaFin: number, etiqueta: string): { fila: number; col: number } | null {
  const obj = etiqueta.trim().toLowerCase();
  for (let r = filaIni; r <= filaFin && r < rows.length; r++) {
    const fila = rows[r] || [];
    for (let c = 0; c < fila.length; c++) {
      if (typeof fila[c] === "string" && fila[c].trim().toLowerCase() === obj) {
        return { fila: r, col: c };
      }
    }
  }
  return null;
}

// Lee una mini-tabla lateral (Próximos Partidos, Racha de Jugadores, Historial, etc.)
// a partir de dónde esté su etiqueta, sin asumir columnas fijas: si la fila siguiente
// a la etiqueta es un encabezado reconocido, lo usa; si no, cae a columnasDefault.
function leerTablaLateral(rows: any[][], labelFila: number, labelCol: number, filaLimite: number, columnasDefault: string[]): any[] {
  const filaSig = rows[labelFila + 1] || [];
  const posibleHeader = String(filaSig[labelCol] ?? "").trim().toLowerCase();
  let columnas: string[];
  let filaInicioDatos: number;

  if (MAPA_ENCABEZADOS[posibleHeader]) {
    columnas = [];
    let c = labelCol;
    while (!celdaVacia(filaSig[c])) {
      const texto = String(filaSig[c]).trim().toLowerCase();
      columnas.push(MAPA_ENCABEZADOS[texto] || texto);
      c++;
    }
    filaInicioDatos = labelFila + 2;
  } else {
    columnas = columnasDefault;
    filaInicioDatos = labelFila + 1;
  }

  const datos: any[] = [];
  let i = filaInicioDatos;
  while (i <= filaLimite && rows[i] && !celdaVacia(rows[i][labelCol])) {
    const r = rows[i];
    const obj: any = {};
    columnas.forEach((col, idx) => { obj[col] = r[labelCol + idx]; });
    datos.push(obj);
    i++;
  }
  return datos;
}

// ── POSICIONES FIJAS DE LA PLANTILLA ──────────────────────────────────────
// Ajustá estos números si tu plantilla cambia.
const FILA_EQUIPO_1 = 2;   // Excel fila 2 → nombre del primer equipo en col B
const FILA_EQUIPO_2 = 10;  // Excel fila 10 → nombre del segundo equipo en col B
const COL_PROXIMOS = 16;   // columna Q (índice 0-based) → sección "Próximos Partidos"
const COL_RACHA = 21;      // columna V (índice 0-based) → sección "Racha de Jugadores"
// ────────────────────────────────────────────────────────────────────────

// Lee una sección lateral (Próximos Partidos / Racha de Jugadores) con la
// estructura fija exacta: título en filaEquipo+1 (misma fila que "Fecha"),
// sub-encabezados en filaEquipo+2, datos reales desde filaEquipo+3.
function leerSeccionLateral(rows: any[][], filaEquipo: number, filaFin: number, colInicio: number, columnasDefault: string[]): any[] {
  const filaSubHeader = rows[filaEquipo + 2] || [];
  const textoSub = celdaVacia(filaSubHeader[colInicio]) ? "" : String(filaSubHeader[colInicio]).trim().toLowerCase();

  let columnas: string[];
  if (MAPA_ENCABEZADOS[textoSub]) {
    columnas = [];
    let c = colInicio;
    while (!celdaVacia(filaSubHeader[c])) {
      const texto = String(filaSubHeader[c]).trim().toLowerCase();
      columnas.push(MAPA_ENCABEZADOS[texto] || texto);
      c++;
    }
  } else {
    columnas = columnasDefault;
  }

  const datos: any[] = [];
  let i = filaEquipo + 3;
  while (i <= filaFin && rows[i] && !celdaVacia(rows[i][colInicio])) {
    const r = rows[i];
    const obj: any = {};
    columnas.forEach((col, idx) => { obj[col] = r[colInicio + idx]; });
    datos.push(obj);
    i++;
  }
  return datos;
}

// Parser principal: usa las dos filas fijas de arriba para ubicar a cada
// equipo, y dentro del rango de cada uno lee Próximos Partidos + Racha de
// Jugadores con la estructura fija (título / sub-encabezados / datos).
// Al final busca la sección global de Historial de Encuentros + Árbitro.
function parsearExcel(rows: any[][]): DatosExcel {
  const filasEquipo = [FILA_EQUIPO_1 - 1, FILA_EQUIPO_2 - 1]; // a índice 0-based

  let filaHistorial: number | null = null;
  for (let r = 0; r < rows.length; r++) {
    const fila = rows[r] || [];
    const c1 = fila[1];
    if (typeof c1 === "string" && c1.trim().toLowerCase() === "historial de encuentros") {
      filaHistorial = r;
      break;
    }
  }

  const finalRow = rows.length - 1;
  const limites = filasEquipo.map((r, idx) => {
    const siguiente = filasEquipo[idx + 1] ?? null;
    if (filaHistorial !== null && (siguiente === null || filaHistorial < siguiente)) return filaHistorial - 1;
    return siguiente !== null ? siguiente - 1 : finalRow;
  });

  const equipos: EquipoExcel[] = filasEquipo.map((filaEquipo, idx) => {
    const filaCruda = rows[filaEquipo];
    const nombreEquipo = filaCruda && !celdaVacia(filaCruda[1]) ? String(filaCruda[1]).trim() : "";
    const filaFin = limites[idx];

    const partidos: Partido[] = [];
    let i = filaEquipo + 1;
    if (rows[i] && String(rows[i][1] ?? "").trim().toLowerCase() === "fecha") i++;
    while (i <= filaFin && rows[i] && !celdaVacia(rows[i][1])) {
      const r = rows[i];
      const p = {} as Partido;
      COLUMNAS.forEach((col, ci) => { p[col] = r[ci + 1]; });
      partidos.push(p);
      i++;
    }

    const proximos = leerSeccionLateral(rows, filaEquipo, filaFin, COL_PROXIMOS, ["fecha", "rival", "competencia", "condicion"]);
    const racha = leerSeccionLateral(rows, filaEquipo, filaFin, COL_RACHA, ["jugador", "estadistica"]);

    return { equipo: nombreEquipo, partidos, proximos, racha };
  }).filter(e => e.equipo !== ""); // si alguna de las 2 filas fijas está vacía, la descartamos

  let historial: any[] = [];
  let arbitro = "";
  if (filaHistorial !== null) {
    historial = leerTablaLateral(rows, filaHistorial, 1, finalRow, ["fecha", "resultado", "local"]);
    const etArb = buscarEtiqueta(rows, filaHistorial, filaHistorial, "arbitro");
    if (etArb) {
      const filaRef = rows[etArb.fila + 1];
      if (filaRef && !celdaVacia(filaRef[etArb.col])) arbitro = String(filaRef[etArb.col]).trim();
    }
  }

  return { equipos, historial, arbitro };
}

function promedio(nums: number[]): string {
  if (nums.length === 0) return "0";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

// Convierte los datos parseados de un equipo en texto listo para el prompt
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

  if (e.racha.length > 0) {
    const rachaTxt = e.racha.map(j => `${j.jugador}: ${j.estadistica}`).join("\n");
    texto += `\n\nRacha de jugadores destacados de ${e.equipo} (según el usuario):\n${rachaTxt}`;
  }

  return texto;
}

// Formatea la sección global (no por equipo): árbitro + historial de enfrentamientos H2H
function formatearGlobal(datos: DatosExcel): string {
  const partes: string[] = [];
  if (datos.arbitro) partes.push(`Árbitro designado: ${datos.arbitro}`);
  if (datos.historial.length > 0) {
    const txt = datos.historial.map(h => `${formatFecha(h.fecha)}: ${h.resultado} (local: ${h.local})`).join("\n");
    partes.push(`Historial de enfrentamientos directos (H2H):\n${txt}`);
  }
  return partes.join("\n\n");
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
  const [datosExcel, setDatosExcel] = useState<DatosExcel | null>(null);
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
      const datos = parsearExcel(rows);

      if (datos.equipos.length === 0) {
        setErrorExcel("No pude reconocer equipos en el Excel. Revisá que siga la plantilla (nombre de equipo en una fila, encabezados en la siguiente, partidos abajo).");
        setDatosExcel(null);
        return;
      }
      setDatosExcel(datos);
      setNombreArchivo(file.name);
    } catch (err: any) {
      setErrorExcel("No pude leer el archivo: " + err.message);
      setDatosExcel(null);
    }
  }

  function quitarExcel() {
    setDatosExcel(null);
    setNombreArchivo("");
    setErrorExcel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function construirDatosManuales(): string {
    const bloques: string[] = [];
    if (datosExcel && datosExcel.equipos.length > 0) {
      bloques.push("DATOS HISTÓRICOS CARGADOS POR EL USUARIO (desde Excel):");
      datosExcel.equipos.forEach(e => bloques.push(formatearBloqueEquipo(e)));
      const global = formatearGlobal(datosExcel);
      if (global) bloques.push(global);
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
            {!datosExcel ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-purple-200 rounded-lg py-3 text-xs text-purple-600 cursor-pointer hover:bg-purple-50">
                📁 Subir Excel (misma plantilla de siempre)
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
                {datosExcel.equipos.map(e => (
                  <div key={e.equipo} className="text-[10px] text-gray-600">
                    <span className="font-semibold">{e.equipo}</span>: {e.partidos.length} partidos
                    {e.proximos.length > 0 && <> · {e.proximos.length} próximos</>}
                    {e.racha.length > 0 && <> · {e.racha.length} jugadores en racha</>}
                  </div>
                ))}
                {(datosExcel.arbitro || datosExcel.historial.length > 0) && (
                  <div className="text-[10px] text-gray-600 mt-1 pt-1 border-t border-emerald-100">
                    {datosExcel.arbitro && <>🧑‍⚖️ Árbitro: {datosExcel.arbitro} </>}
                    {datosExcel.historial.length > 0 && <>· {datosExcel.historial.length} enfrentamientos H2H</>}
                  </div>
                )}
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
              <span className="bg-red-50 text-red-600 px-2 py-1 rounded">🟨 Tarjetas</span>
              <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded">🚩 Córners</span>
              <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded">🔍 Escéptico</span>
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
