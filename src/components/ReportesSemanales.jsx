"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCcw, FileDown
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────── */
const DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-CO", {
    day: "2-digit", month: "2-digit",
  });
}

function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6);
  return `${formatDate(toISODate(weekStart))} – ${formatDate(toISODate(end))} · ${end.getFullYear()}`;
}

function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

function money(val) {
  const v = n(val);
  if (v === 0) return "–";
  return fmt.format(v);
}

function moneyColored(val, zeroClass = "empty") {
  const v = n(val);
  if (v === 0) return <span className={zeroClass}>–</span>;
  return <span className={v > 0 ? "positive" : "negative"}>{fmt.format(v)}</span>;
}

/* ─── Row definitions (matches the physical ledger) ───── */
const ROWS = [
  { key: "suma_entrega",        label: "Suma Ventas",          type: "money",   editable: false, desc: "Ventas nuevas dejadas en crédito" },
  { key: "clientes_abonaron",   label: "Clientes",             type: "number",  editable: false, desc: "Clientes únicos que compraron o abonaron hoy" },
  { key: "clientes_no_llevaron",label: "CNL (Canceladas)",     type: "number",  editable: false, desc: "Clientes que pagaron todo y su saldo quedó en 0 ese día" },
  { key: "visitas_totales",     label: "Unid/Vendidas",         type: "number",  editable: false, desc: "Total de unidades vendidas (suma de cantidades)" },
  { key: "inversion_dia",       label: "Costo inicial",        type: "money",   editable: false, desc: "Costo de inversion de los productos entregados" },
  { key: "efectividad_pct",     label: "% Efectividad",        type: "percent", editable: false, desc: "Abonos del día / Meta de cobro del día * 100" },
  { key: "m1_efectivo",         label: "m1 (Efectivo)",        type: "money",   editable: false, desc: "Recaudo en efectivo" },
  { key: "m2_nequi",            label: "M2 (Nequi)",           type: "money",   editable: false, desc: "Recaudo por Nequi" },
  { key: "gasto",               label: "Gasto",                type: "money",   editable: true,  desc: "Gasolina, almuerzo, viáticos…" },
  { key: "dinero_a_entregar",   label: "$ (A entregar)",       type: "money",   editable: false, desc: "Abono – Gasto", highlight: "computed" },
  { key: "cnt_notes",           label: "CNT (Novedades)",      type: "text",    editable: true,  desc: "Observaciones del día" },
  { key: "ganancia",            label: "Ganancia",             type: "money",   editable: false, desc: "Entrega – Inversión + Abono – Gasto", highlight: "profit" },
];

const MANUAL_KEYS = ["gasto", "cnt_notes"];

/* ─── Empty day ───────────────────────────────────────── */
function emptyDay(dateStr) {
  return {
    day: dateStr,
    m1_efectivo: 0, m2_nequi: 0, abono_total: 0,
    clientes_abonaron: 0, visitas_totales: 0, clientes_no_llevaron: 0,
    efectividad_pct: 0, suma_entrega: 0, inversion_dia: 0,
    gasto: 0, cnt_notes: "",
    dinero_a_entregar: 0, ganancia: 0,
  };
}

/* ─── Component ─────────────────────────────────────────── */
export function ReportesSemanales({ activeSellerId = "", activeSellerName = "Todos los vendedores" }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [days, setDays] = useState(() =>
    Array.from({ length: 7 }, (_, i) => emptyDay(toISODate(addDays(getWeekStart(new Date()), i))))
  );
  const [loading, setLoading] = useState(false);

  // Editing state: { dayIdx, key, value }
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  /* Load weekly data from API */
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart: toISODate(ws) });
      if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/weekly-report?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDays(data.days);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activeSellerId]);

  useEffect(() => {
    loadWeek(weekStart);
  }, [loadWeek, weekStart]);

  function prevWeek() { setWeekStart(w => addDays(w, -7)); }
  function nextWeek() { setWeekStart(w => addDays(w, 7)); }

  /* Start editing a manual cell */
  function startEdit(dayIdx, key) {
    const val = days[dayIdx]?.[key] ?? "";
    setEditing({ dayIdx, key, value: String(val) });
  }

  /* Save manual field to DB */
  async function saveEdit() {
    if (!editing || saving) return;
    const { dayIdx, key, value } = editing;
    const dayData = days[dayIdx];
    if (!dayData) return;

    // Optimistic update
    setDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, [key]: key === "cnt_notes" ? value : n(value) } : d));
    setEditing(null);

    setSaving(true);
    try {
      const payload = {
        date: dayData.day,
        gasto: key === "gasto" ? n(value) : n(dayData.gasto),
        cnt_notes: key === "cnt_notes" ? value : (dayData.cnt_notes || ""),
      };
      const res = await fetch("/apis/weekly-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Reload to get recalculated fields from DB
        await loadWeek(weekStart);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  /* Compute column totals */
  const totals = ROWS.reduce((acc, row) => {
    if (row.type === "text") { acc[row.key] = ""; return acc; }
    acc[row.key] = days.reduce((s, d) => s + n(d[row.key] ?? 0), 0);
    return acc;
  }, {});

  /* Render a cell value */
  function renderCell(row, dayData, dayIdx) {
    const key = row.key;
    const rawVal = dayData?.[key];
    const isEditing = editing?.dayIdx === dayIdx && editing?.key === key;

    if (row.editable && isEditing) {
      return (
        <input
          className="wr-input"
          type={key === "cnt_notes" ? "text" : "number"}
          value={editing.value}
          autoFocus
          onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") saveEdit(); if (e.key === "Escape") setEditing(null); }}
        />
      );
    }

    if (row.editable) {
      return (
        <span
          className="wr-editable-val"
          onClick={() => startEdit(dayIdx, key)}
          title="Clic para editar"
        >
          {key === "cnt_notes"
            ? (rawVal || <span className="wr-placeholder">…</span>)
            : (n(rawVal) !== 0 ? money(rawVal) : <span className="wr-placeholder">–</span>)
          }
        </span>
      );
    }

    // Read-only calculated cells
    if (row.type === "number") return <span>{n(rawVal) || "–"}</span>;
    if (row.type === "percent") return <span>{n(rawVal) ? `${n(rawVal)}%` : "–"}</span>;
    if (row.type === "money_signed") return moneyColored(rawVal);
    if (row.key === "ganancia") {
      const v = n(rawVal);
      return <strong className={v > 0 ? "gain-positive" : v < 0 ? "gain-negative" : "empty"}>{money(rawVal)}</strong>;
    }
    return <span className={n(rawVal) > 0 ? "positive" : "empty"}>{money(rawVal)}</span>;
  }

  /* Render total cell */
  function renderTotal(row) {
    const val = totals[row.key];
    if (row.type === "text") return "–";
    if (row.type === "number") return n(val) || "–";
    if (row.type === "percent") return n(val) ? `${Math.round(n(val) / 7)}%` : "–";
    if (row.key === "ganancia") {
      const v = n(val);
      return <strong className={v > 0 ? "gain-positive" : v < 0 ? "gain-negative" : "empty"}>{money(val)}</strong>;
    }
    return <span className={n(val) > 0 ? "positive" : "empty"}>{money(val)}</span>;
  }

  function metricCellClass(row) {
    return [
      "wr-cell",
      row.highlight === "computed" ? "wr-cell-computed" : "",
      row.highlight === "profit" ? "wr-cell-profit" : "",
      row.editable ? "wr-cell-editable" : "",
    ].filter(Boolean).join(" ");
  }

  function formatMoneyPdf(val) {
    const v = n(val);
    if (v === 0) return "–";
    return "$" + v.toLocaleString("es-CO");
  }

  async function generatePdf() {
    if (generatingPdf || loading) return;
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const weekEnd = addDays(weekStart, 6);
      const weekLabel = `${formatDate(toISODate(weekStart))} – ${formatDate(toISODate(weekEnd))} · ${weekEnd.getFullYear()}`;

      // Columnas visibles en el PDF
      const pdfCols = [
        { key: "day", label: "FECHA", type: "label" },
        { key: "suma_entrega", label: "SUMA VENTAS", type: "money" },
        { key: "clientes_abonaron", label: "CLIENTES", type: "number" },
        { key: "clientes_no_llevaron", label: "CNL", type: "number" },
        { key: "visitas_totales", label: "UNID/VENDIDAS", type: "number" },
        { key: "inversion_dia", label: "COSTO INICIAL", type: "money" },
        { key: "efectividad_pct", label: "% EFECTIVIDAD", type: "percent" },
        { key: "m1_efectivo", label: "M1 (EFECTIVO)", type: "money" },
        { key: "m2_nequi", label: "M2 (NEQUI)", type: "money" },
        { key: "gasto", label: "GASTO", type: "money" },
        { key: "dinero_a_entregar", label: "$ (A ENTREGAR)", type: "money" },
        { key: "ganancia", label: "GANANCIA", type: "money" },
      ];

      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "16px";
      container.style.color = "#1a1a1a";
      container.style.fontSize = "11px";

      let tableRows = "";
      days.forEach((dayData, di) => {
        const isEven = di % 2 === 0;
        const bg = isEven ? "#f9f9f9" : "#fff";
        const dayLabel = `${DAYS_ES[di]} ${dayData?.day ? formatDate(dayData.day) : ""}`;

        tableRows += `<tr style="background:${bg};">`;
        pdfCols.forEach((col) => {
          const val = dayData?.[col.key];
          let display = "";
          if (col.type === "label") display = dayLabel;
          else if (col.type === "percent") display = n(val) ? `${n(val)}%` : "–";
          else if (col.type === "number") display = n(val) || "–";
          else display = formatMoneyPdf(val);

          const isGain = col.key === "ganancia";
          const color = isGain ? (n(val) > 0 ? "#16a34a" : n(val) < 0 ? "#dc2626" : "#999") : "#1a1a1a";
          const weight = isGain || col.key === "dinero_a_entregar" ? "bold" : "normal";
          const align = col.type === "label" ? "left" : "center";

          tableRows += `<td style="padding:6px 8px; text-align:${align}; font-weight:${weight}; color:${color}; font-size:10px; border-bottom:1px solid #e5e7eb;">${display}</td>`;
        });
        tableRows += "</tr>";
      });

      // Total row
      tableRows += '<tr style="background:#7c3aed; color:white; font-weight:bold;">';
      pdfCols.forEach((col) => {
        let display = "";
        if (col.type === "label") display = "TOTAL";
        else if (col.type === "percent") {
          const avg = n(totals[col.key]) ? `${Math.round(n(totals[col.key]) / 7)}%` : "–";
          display = avg;
        }
        else if (col.type === "number") display = n(totals[col.key]) || "–";
        else display = formatMoneyPdf(totals[col.key]);

        const align = col.type === "label" ? "left" : "center";
        tableRows += `<td style="padding:6px 8px; text-align:${align}; font-size:10px; border-bottom:1px solid #6d28d9;">${display}</td>`;
      });
      tableRows += "</tr>";

      container.innerHTML = `
        <div style="text-align:center; margin-bottom:16px; border-bottom:2px solid #7c3aed; padding-bottom:12px;">
          <h1 style="margin:0; font-size:20px; color:#7c3aed;">CobroKits</h1>
          <p style="margin:2px 0 0; font-size:11px; color:#666;">Consignacion semanal</p>
          <h2 style="margin:10px 0 0; font-size:16px;">Reporte Semanal</h2>
          <p style="margin:3px 0 0; font-size:11px; color:#666;">${weekLabel}</p>
          <p style="margin:2px 0 0; font-size:11px; color:#333;">Vendedor: <strong>${activeSellerName}</strong></p>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          <thead>
            <tr style="background:#7c3aed; color:white;">
              ${pdfCols.map(col => `<th style="padding:7px 8px; text-align:${col.type === 'label' ? 'left' : 'center'}; font-size:9px; font-weight:600;">${col.label}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div style="text-align:center; font-size:9px; color:#999; border-top:1px solid #eee; padding-top:6px;">
          Generado por CobroKits · ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "long", day: "numeric" }).format(new Date())}
        </div>
      `;

      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `reporte-semanal-${activeSellerName}-${toISODate(weekStart)}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "letter", orientation: "landscape" },
        })
        .from(container)
        .save();
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="reportes-container">
      {/* Header */}
      <div className="reportes-header">
        <div className="reportes-week-nav">
          <button className="iconButton" onClick={prevWeek} title="Semana anterior"><ChevronLeft size={18} /></button>
          <div className="reportes-week-label">
            <Calendar size={16} />
            <span>{formatWeekRange(weekStart)}</span>
          </div>
          <button className="iconButton" onClick={nextWeek} title="Semana siguiente"><ChevronRight size={18} /></button>
          <button className="iconButton" onClick={() => loadWeek(weekStart)} disabled={loading} title="Actualizar">
            <RefreshCcw size={16} className={loading ? "spin" : ""} />
          </button>
          <button className="iconButton" onClick={generatePdf} disabled={generatingPdf || loading} title="Descargar PDF">
            {generatingPdf ? <span className="spinner" /> : <FileDown size={16} />}
          </button>
        </div>
        <div className="reportes-seller-name">
          Vendedor: <strong>{activeSellerName}</strong>
        </div>
        <p className="reportes-hint">Las celdas en <span style={{color:"var(--brand)"}}>verde</span> son editables. El resto se calcula automáticamente.</p>
      </div>

      {/* Table full width */}
      <div className="wr-table-wrap">
        <table className="wr-table">
          <thead>
            <tr>
              <th className="wr-th-label">Fecha</th>
              {ROWS.map((row) => (
                <th key={row.key} className="wr-th-metric" title={row.desc}>
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5,6,7].map(di => (
                <tr key={`skel-${di}`} className={di % 2 === 0 ? "row-even" : "row-odd"}>
                  <td className="wr-row-label"><div className="skel skel-line" style={{width:'60px'}} /></td>
                  {ROWS.map((row) => (
                    <td key={row.key} className={metricCellClass(row)}>
                      <div className="skel skel-line" style={{width: row.type === 'text' ? '80%' : '50px'}} />
                    </td>
                  ))}
                </tr>
              ))
            ) : days.map((dayData, di) => (
              <tr
                key={dayData.day || di}
                className={di % 2 === 0 ? "row-even" : "row-odd"}
              >
                <td className="wr-row-label">
                  <span className="wr-label-text">{DAYS_ES[di]}</span>
                  <span className="wr-day-date">{dayData?.day ? formatDate(dayData.day) : ""}</span>
                </td>
                {ROWS.map((row) => (
                  <td key={row.key} className={metricCellClass(row)}>
                    {renderCell(row, dayData, di)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="wr-total-row">
              <td className="wr-row-label">
                <span className="wr-label-text">Total</span>
              </td>
              {ROWS.map((row) => (
                <td key={row.key} className={`${metricCellClass(row)} wr-total-cell`}>
                  {renderTotal(row)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
