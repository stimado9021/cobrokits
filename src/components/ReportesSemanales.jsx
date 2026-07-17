"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCcw, FileDown, FileSpreadsheet
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────── */
const DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function getWeekStart() {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const [y, m, d] = todayStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6);
  return `${formatDate(toISODate(weekStart))} – ${formatDate(toISODate(end))} · ${end.getUTCFullYear()}`;
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

function cellTitle(col, rawVal) {
  const label = col.label;
  const v = n(rawVal);
  let valStr;
  if (col.type === "percent") valStr = v ? `${v}%` : "–";
  else if (col.type === "number") valStr = v || "–";
  else valStr = v ? fmt.format(v) : "–";
  return `${label}: ${valStr}\n${col.desc}`;
}

/* ─── Row definitions (matches the physical ledger) ───── */
const ROWS = [
  { key: "suma_entrega",        label: "Cobros",               type: "money",   editable: false, desc: "Ventas nuevas dejadas en crédito = Σ(line_sale_total)" },
  { key: "saldo_anterior",      label: "Saldo Ant.",           type: "money",   editable: false, desc: "Deuda total de los clientes al inicio de la semana" },
  { key: "clientes_abonaron",   label: "Cuentas",              type: "number",  editable: false, desc: "Clientes únicos que compraron o abonaron hoy" },
  { key: "clientes_no_llevaron",label: "CNL",                  type: "number",  editable: false, desc: "Clientes que cancelaron su saldo (nuevo saldo = 0)" },
  { key: "visitas_totales",     label: "Unid.",                type: "number",  editable: false, desc: "Total unidades vendidas = Σ(cantidad)" },
  { key: "inversion_dia",       label: "Costo",                type: "money",   editable: false, desc: "Costo de inversión = Σ(cantidad × costo_unitario)" },
  { key: "costo_cliente",       label: "Costo Cli.",           type: "money",   editable: false, desc: "Valor de venta = Σ(cantidad × precio_venta)" },
  { key: "efectividad_pct",     label: "% Efect.",             type: "percent", editable: false, desc: "(Efectivo + Nequi) ÷ Cobros × 100" },
  { key: "m1_efectivo",         label: "Efectivo",             type: "money",   editable: false, desc: "Recaudo en efectivo = Σ(pagos método efectivo)" },
  { key: "m2_nequi",            label: "Nequi",                type: "money",   editable: false, desc: "Recaudo por Nequi = Σ(pagos método nequi)" },
  { key: "total_recaudo",       label: "Total",                type: "money",   editable: false, desc: "Efectivo + Nequi", highlight: "computed" },
  { key: "entrega",             label: "Entrega",              type: "money",   editable: false, desc: "(Saldo Ant. + Cobros) − Total (Efectivo + Nequi)", highlight: "computed" },
  { key: "gasto",               label: "Gasto",                type: "money",   editable: true,  desc: "Gasolina, almuerzo, viáticos… (lo ingresa el vendedor)" },
  { key: "d_merca",             label: "D/Merca",              type: "money",   editable: false, desc: "(Entrega + Total) − Costo Cli. − Cobros", highlight: "computed" },
  { key: "d_dinero",            label: "D/Dinero",             type: "money",   editable: false, desc: "Efectivo + Gastos − Total", highlight: "computed" },
  { key: "dinero_a_entregar",   label: "$",                    type: "money",   editable: true,  desc: "Dinero que entrega el vendedor (lo ingresa el vendedor)" },
  { key: "ganancia",            label: "Ganancia",             type: "money",   editable: false, desc: "Entrega − Inversión + Abono − Gasto", highlight: "profit" },
];

// (La columna "Novedades" fue removida temporalmente)

const MANUAL_KEYS = ["gasto", "cnt_notes", "dinero_a_entregar"];

/* ─── Empty day ───────────────────────────────────────── */
function emptyDay(dateStr) {
  return {
    day: dateStr,
    m1_efectivo: 0, m2_nequi: 0, abono_total: 0, entrega: 0, total_recaudo: 0,
    clientes_abonaron: 0, visitas_totales: 0, clientes_no_llevaron: 0,
    efectividad_pct: 0, suma_entrega: 0, inversion_dia: 0, costo_cliente: 0,
    saldo_anterior: 0,
    gasto: 0, d_merca: 0, d_dinero: 0,
    dinero_a_entregar: 0, ganancia: 0,
  };
}

/* ─── Component ─────────────────────────────────────────── */
export function ReportesSemanales({ activeSellerId = "", activeSellerName = "Todos los vendedores" }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [days, setDays] = useState(() =>
    Array.from({ length: 7 }, (_, i) => emptyDay(toISODate(addDays(getWeekStart(), i))))
  );
  const [loading, setLoading] = useState(false);

  // Editing state: { dayIdx, key, value }
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  const abortRef = useRef(null);

  /* Load weekly data from API */
  const loadWeek = useCallback(async (ws) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart: toISODate(ws) });
      if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/weekly-report?${params.toString()}`, { signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setDays(data.days.map(d => {
          const totalRecaudo = n(d.m1_efectivo) + n(d.m2_nequi);
          const entrega = n(d.saldo_anterior) + n(d.suma_entrega) - totalRecaudo;
          const dMerca = (entrega + totalRecaudo) - n(d.costo_cliente) - n(d.suma_entrega);
          const dDinero = n(d.m1_efectivo) + n(d.gasto) - totalRecaudo;
          return { ...d, total_recaudo: totalRecaudo, entrega, d_merca: dMerca, d_dinero: dDinero };
        }));
      }
    } catch (err) {
      if (err?.name !== "AbortError") console.error("loadWeek error:", err);
    }
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
    setDays(prev => prev.map((d, i) => i === dayIdx
      ? { ...d, [key]: key === "cnt_notes" ? value : n(value) }
      : d));
    setEditing(null);

    const updatedGasto = key === "gasto" ? n(value) : n(dayData.gasto);
    const updatedNotes = key === "cnt_notes" ? value : dayData.cnt_notes;
    const updatedEntregado = key === "dinero_a_entregar" ? n(value) : n(dayData.dinero_a_entregar);

    setSaving(true);
    try {
      const payload = {
        date: dayData.day,
        gasto: n(updatedGasto),
        cnt_notes: updatedNotes || "",
        entregado: updatedEntregado,
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
      const v = n(rawVal);
      let valDisplay;
      if (key === "cnt_notes") {
        valDisplay = rawVal || <span className="wr-placeholder">…</span>;
      } else {
        valDisplay = v !== 0 ? money(rawVal) : <span className="wr-placeholder">–</span>;
      }
      const valStr = key === "cnt_notes" ? (rawVal || "…") : (v ? fmt.format(v) : "–");
      const titleText = `${row.label}: ${valStr}\n${row.desc}\nClic para editar`;
      return (
        <span
          className="wr-editable-val"
          onClick={() => startEdit(dayIdx, key)}
          title={titleText}
        >
          {valDisplay}
        </span>
      );
    }

    // Read-only calculated cells
    const t = cellTitle(row, rawVal);
    if (row.type === "number") return <span title={t}>{n(rawVal) || "–"}</span>;
    if (row.type === "percent") return <span title={t}>{n(rawVal) ? `${n(rawVal)}%` : "–"}</span>;
    if (row.type === "money_signed") return moneyColored(rawVal);
    if (row.key === "ganancia") {
      const v = n(rawVal);
      return <strong className={v > 0 ? "gain-positive" : v < 0 ? "gain-negative" : "empty"} title={t}>{money(rawVal)}</strong>;
    }
    return <span className={n(rawVal) > 0 ? "positive" : "empty"} title={t}>{money(rawVal)}</span>;
  }

  /* Render total cell */
  function renderTotal(row) {
    const val = totals[row.key];
    // Saldo anterior no es aditivo: el Total muestra el saldo con el que arrancó la semana (lunes).
    if (row.key === "saldo_anterior") {
      const opening = days[0]?.[row.key];
      const t = `Total Saldo Ant.: ${n(opening) ? fmt.format(opening) : "–"}\n${row.desc}`;
      return <span className={n(opening) > 0 ? "positive" : "empty"} title={t}>{money(opening)}</span>;
    }
    const t = `Total ${row.label}: ${n(val) ? fmt.format(val) : "–"}\n${row.desc}`;
    if (row.type === "text") return "–";
    if (row.type === "number") return <span title={t}>{n(val) || "–"}</span>;
    if (row.type === "percent") return <span title={t}>{n(val) ? `${Math.round(n(val) / 7)}%` : "–"}</span>;
    if (row.key === "ganancia") {
      const v = n(val);
      return <strong className={v > 0 ? "gain-positive" : v < 0 ? "gain-negative" : "empty"} title={t}>{money(val)}</strong>;
    }
    return <span className={n(val) > 0 ? "positive" : "empty"} title={t}>{money(val)}</span>;
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
        { key: "suma_entrega", label: "COBROS", type: "money" },
        { key: "saldo_anterior", label: "SALDO ANT.", type: "money" },
        { key: "clientes_abonaron", label: "CUENTAS", type: "number" },
        { key: "clientes_no_llevaron", label: "CNL", type: "number" },
        { key: "visitas_totales", label: "UNID.", type: "number" },
        { key: "inversion_dia", label: "COSTO", type: "money" },
        { key: "costo_cliente", label: "COSTO CLI.", type: "money" },
        { key: "efectividad_pct", label: "% EFECT.", type: "percent" },
        { key: "m1_efectivo", label: "EFECTIVO", type: "money" },
        { key: "m2_nequi", label: "NEQUI", type: "money" },
        { key: "total_recaudo", label: "TOTAL", type: "money" },
        { key: "entrega", label: "ENTREGA", type: "money" },
        { key: "gasto", label: "GASTO", type: "money" },
        { key: "d_merca", label: "D/MERCA", type: "money" },
        { key: "d_dinero", label: "D/DINERO", type: "money" },
        { key: "dinero_a_entregar", label: "$", type: "money" },
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

  function generateExcel() {
    if (generatingExcel || loading) return;
    setGeneratingExcel(true);
    try {
      const excelCols = [
        { key: "day", label: "FECHA", type: "label" },
        ...ROWS,
      ];

      const weekEnd = addDays(weekStart, 6);
      const weekLabel = `${formatDate(toISODate(weekStart))} – ${formatDate(toISODate(weekEnd))} · ${weekEnd.getFullYear()}`;

      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Reporte Semanal</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
          th { background: #7c3aed; color: #fff; padding: 6px 8px; text-align: center; font-weight: bold; border: 1px solid #5b21b6; }
          td { padding: 5px 8px; border: 1px solid #d1d5db; text-align: center; }
          .label { text-align: left; font-weight: bold; }
          .total { background: #7c3aed; color: #fff; font-weight: bold; }
          .gain { color: #16a34a; }
          .gain-neg { color: #dc2626; }
        </style></head><body>
        <h2 style="font-family:Arial;color:#7c3aed;">CobroKits - Reporte Semanal</h2>
        <p style="font-family:Arial;font-size:12px;">${weekLabel} · Vendedor: ${activeSellerName}</p>
        <table>`;

      html += "<thead><tr>" + excelCols.map(c =>
        `<th${c.type === 'label' ? ' style="text-align:left;"' : ''}>${c.label}</th>`
      ).join("") + "</tr></thead><tbody>";

      days.forEach((dayData, di) => {
        const bg = di % 2 === 0 ? "#f9f9f9" : "#fff";
        const dayLabel = `${DAYS_ES[di]} ${dayData?.day ? formatDate(dayData.day) : ""}`;
        html += `<tr style="background:${bg};">`;
        excelCols.forEach(col => {
          const val = dayData?.[col.key];
          let display = ""; let cls = "";
          if (col.type === "label") { display = dayLabel; cls = "label"; }
          else if (col.type === "percent") display = n(val) ? `${n(val)}%` : "–";
          else if (col.type === "number") display = n(val) || "–";
          else {
            const v = n(val);
            display = v ? `$${Number(v).toLocaleString("es-CO")}` : "–";
            if (col.key === "ganancia") cls = v > 0 ? "gain" : v < 0 ? "gain-neg" : "";
          }
          html += `<td class="${cls}">${display}</td>`;
        });
        html += "</tr>";
      });

      html += `<tr style="background:#7c3aed; color:#fff; font-weight:bold;">`;
      excelCols.forEach(col => {
        let display = ""; let cls = "total";
        if (col.type === "label") display = "TOTAL";
        else if (col.type === "percent") {
          const avg = n(totals[col.key]) ? `${Math.round(n(totals[col.key]) / 7)}%` : "–";
          display = avg;
        }
        else if (col.type === "number") display = n(totals[col.key]) || "–";
        else {
          const val = col.key === "saldo_anterior" ? n(days[0]?.[col.key]) : n(totals[col.key]);
          display = val ? `$${Number(val).toLocaleString("es-CO")}` : "–";
        }
        html += `<td class="${cls}">${display}</td>`;
      });
      html += "</tr>";

      html += `</tbody></table>
        <p style="font-family:Arial;font-size:10px;color:#999;margin-top:8px;">Generado por CobroKits · ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "long", day: "numeric" }).format(new Date())}</p>
        </body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-semanal-${activeSellerName}-${toISODate(weekStart)}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating Excel:", err);
    } finally {
      setGeneratingExcel(false);
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
          <button className="iconButton" onClick={generateExcel} disabled={generatingExcel || loading} title="Descargar Excel">
            {generatingExcel ? <span className="spinner" /> : <FileSpreadsheet size={16} />}
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
