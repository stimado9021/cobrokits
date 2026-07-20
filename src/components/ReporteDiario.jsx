"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCcw, FileDown, FileSpreadsheet
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────── */
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
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

/* ─── Column definitions ─────────────────────────────── */
const COLS = [
  { key: "suma_entrega",        label: "Cobros",               type: "money",   editable: false, desc: "Ventas nuevas dejadas en crédito hoy = Σ(line_sale_total)" },
  { key: "saldo_anterior",      label: "Saldo Ant.",           type: "money",   editable: false, desc: "Deuda de los clientes al inicio del día" },
  { key: "clientes_abonaron",   label: "Cuentas",              type: "number",  editable: false, desc: "Clientes únicos que compraron o abonaron hoy" },
  { key: "canceladas",          label: "CNL",                   type: "number",  editable: false, desc: "Clientes que cancelaron su saldo (nuevo saldo = 0)" },
  { key: "total_units",         label: "Unid.",                 type: "number",  editable: false, desc: "Total unidades vendidas = Σ(cantidad)" },
  { key: "inversion_dia",       label: "Costo",                type: "money",   editable: false, desc: "Costo de inversión = Σ(cantidad × costo_unitario)" },
  { key: "costo_cliente",       label: "Costo Cli.",           type: "money",   editable: false, desc: "Valor de venta = Σ(cantidad × precio_venta)" },
  { key: "efectividad_pct",     label: "% Efect.",             type: "percent", editable: false, desc: "(Efectivo + Nequi) ÷ Cobros × 100" },
  { key: "m1_efectivo",         label: "Efectivo",             type: "money",   editable: false, desc: "Recaudo en efectivo = Σ(pagos método efectivo)" },
  { key: "m2_nequi",            label: "Nequi",                type: "money",   editable: false, desc: "Recaudo por Nequi = Σ(pagos método nequi)" },
  { key: "abono_total",         label: "Total",                type: "money",   editable: false, desc: "Efectivo + Nequi = Σ(pagos del día)", highlight: "computed" },
  { key: "entrega",             label: "Entrega",              type: "money",   editable: false, desc: "(Saldo Ant. + Cobros) − Total (Efectivo + Nequi)", highlight: "computed" },
  { key: "gasto",               label: "Gasto",                type: "money",   editable: true,  desc: "Gasolina, almuerzo, viáticos… (lo ingresa el vendedor)" },
  { key: "dinero_a_entregar",   label: "$",                    type: "money",   editable: true,  desc: "Dinero que entrega el vendedor (lo ingresa el vendedor)" },
  { key: "d_merca",             label: "D/Merca",              type: "money",   editable: false, desc: "(Entrega + Total) − Costo Cli. − Cobros", highlight: "computed" },
  { key: "d_dinero",            label: "D/Dinero",             type: "money",   editable: false, desc: "Efectivo + Gastos − Total", highlight: "computed" },
  { key: "ganancia",            label: "Ganancia",             type: "money",   editable: false, desc: "Cobros − Costo + Abono − Gasto", highlight: "profit" },
];

const MANUAL_KEYS = ["gasto", "dinero_a_entregar"];

function cellTitle(col, rawVal) {
  const label = col.label;
  const v = n(rawVal);
  let valStr;
  if (col.type === "percent") valStr = v ? `${v}%` : "–";
  else if (col.type === "number") valStr = v || "–";
  else valStr = v ? fmt.format(v) : "–";
  return `${label}: ${valStr}\n${col.desc}`;
}

function metricCellClass(col) {
  return [
    "wr-cell",
    col.editable ? "wr-cell-editable" : "",
    col.highlight === "computed" ? "wr-cell-computed" : "",
    col.highlight === "profit" ? "wr-cell-profit" : "",
  ].filter(Boolean).join(" ");
}

/* ─── Component ─────────────────────────────────────────── */
export function ReporteDiario({ activeSellerId = "", activeSellerName = "Todos los vendedores" }) {
  const [currentDate, setCurrentDate] = useState(() => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  });
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  // Editing state: { sellerIdx, key, value }
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const abortRef = useRef(null);

  const loadDay = useCallback(async (date) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/daily-report?${params.toString()}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = await res.json();
      if (data.success) {
        setSellers(data.sellers.map(s => {
          const abono = n(s.m1_efectivo) + n(s.m2_nequi);
          const entrega = n(s.saldo_anterior) + n(s.suma_entrega) - abono;
          return {
            ...s,
            abono_total: abono,
            entrega,
            d_merca: (entrega + abono) - n(s.costo_cliente) - n(s.suma_entrega),
            d_dinero: n(s.m1_efectivo) + n(s.gasto) - abono,
          };
        }));
      }
    } catch (err) {
      if (err?.name !== "AbortError") console.error("loadDay error:", err);
    }
    finally { if (abortRef.current === controller) setLoading(false); }
  }, [activeSellerId]);

  useEffect(() => {
    loadDay(currentDate);
  }, [loadDay, currentDate]);

  function prevDay() { setCurrentDate(d => toISODate(addDays(parseDate(d), -1))); }
  function nextDay() { setCurrentDate(d => toISODate(addDays(parseDate(d), 1))); }
  function goToday() {
    setCurrentDate(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()));
  }

  /* Start editing a manual cell */
  function startEdit(sellerIdx, key) {
    const val = sellers[sellerIdx]?.[key] ?? "";
    setEditing({ sellerIdx, key, value: String(val) });
  }

  /* Save manual field to DB */
  async function saveEdit() {
    if (!editing || saving) return;
    const { sellerIdx, key, value } = editing;
    const sellerData = sellers[sellerIdx];
    if (!sellerData) return;

    setSellers(prev => prev.map((s, i) => i === sellerIdx
      ? { ...s, [key]: n(value) }
      : s));
    setEditing(null);

    const updatedGasto = key === "gasto" ? n(value) : n(sellerData.gasto);
    const updatedEntregado = key === "dinero_a_entregar" ? n(value) : n(sellerData.dinero_a_entregar);

    setSaving(true);
    try {
      const payload = {
        date: currentDate,
        seller_id: sellerData.seller_id,
        gasto: n(updatedGasto),
        cnt_notes: sellerData.cnt_notes || "",
        entregado: updatedEntregado,
      };
      const res = await fetch("/apis/daily-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadDay(currentDate);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  /* Compute totals */
  const totals = COLS.reduce((acc, col) => {
    acc[col.key] = sellers.reduce((s, row) => s + n(row[col.key] ?? 0), 0);
    return acc;
  }, {});

  function formatDayLabel(dateStr) {
    const d = parseDate(dateStr);
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return `${days[d.getUTCDay()]} ${formatDate(dateStr)}`;
  }

  /* Render a cell */
  function renderCell(col, sellerData, sellerIdx) {
    const key = col.key;
    const rawVal = sellerData?.[key];
    const isEditing = editing?.sellerIdx === sellerIdx && editing?.key === key;

    if (col.editable && isEditing) {
      return (
        <input
          className="wr-input"
          type="number"
          value={editing.value}
          autoFocus
          onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") saveEdit(); if (e.key === "Escape") setEditing(null); }}
        />
      );
    }

    if (col.editable) {
      const v = n(rawVal);
      const valDisplay = v !== 0 ? money(rawVal) : <span className="wr-placeholder">–</span>;
      const titleText = `${col.label}: ${v ? fmt.format(v) : "–"}\n${col.desc}\nClic para editar`;
      return (
        <span
          className="wr-editable-val"
          onClick={() => startEdit(sellerIdx, key)}
          title={titleText}
        >
          {valDisplay}
        </span>
      );
    }

    const val = n(rawVal ?? 0);
    const t = cellTitle(col, rawVal);
    if (col.type === "number") return <span title={t}>{val || "–"}</span>;
    if (col.type === "percent") return <span title={t}>{val ? `${val}%` : "–"}</span>;
    if (col.key === "ganancia") {
      return <strong className={val > 0 ? "gain-positive" : val < 0 ? "gain-negative" : "empty"} title={t}>{money(val)}</strong>;
    }
    if (col.highlight === "computed") {
      return <span className={val !== 0 ? "positive" : "empty"} title={t}>{money(val)}</span>;
    }
    return <span className={val > 0 ? "positive" : "empty"} title={t}>{money(val)}</span>;
  }

  function renderTotalCell(col) {
    const val = n(totals[col.key]);
    const t = `Total ${col.label}: ${val ? fmt.format(val) : "–"}\n${col.desc}`;
    if (col.type === "number") return <span title={t}>{val || "–"}</span>;
    if (col.type === "percent") return <span title={t}>{val ? `${Math.round(val / Math.max(sellers.length, 1))}%` : "–"}</span>;
    if (col.key === "ganancia") {
      return <strong className={val > 0 ? "gain-positive" : val < 0 ? "gain-negative" : "empty"} title={t}>{money(val)}</strong>;
    }
    return <span className={val > 0 ? "positive" : "empty"} title={t}>{money(val)}</span>;
  }

  async function generatePdf() {
    if (generatingPdf || loading) return;
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "16px";
      container.style.color = "#1a1a1a";
      container.style.fontSize = "11px";

      const pdfCols = [
        { key: "seller_name", label: "VENDEDOR", type: "label" },
        { key: "suma_entrega", label: "COBROS", type: "money" },
        { key: "saldo_anterior", label: "SALDO ANT.", type: "money" },
        { key: "clientes_abonaron", label: "CUENTAS", type: "number" },
        { key: "canceladas", label: "CNL", type: "number" },
        { key: "total_units", label: "UNID.", type: "number" },
        { key: "inversion_dia", label: "COSTO", type: "money" },
        { key: "costo_cliente", label: "COSTO CLI.", type: "money" },
        { key: "efectividad_pct", label: "% EFECT.", type: "percent" },
        { key: "m1_efectivo", label: "EFECTIVO", type: "money" },
        { key: "m2_nequi", label: "NEQUI", type: "money" },
        { key: "abono_total", label: "TOTAL", type: "money" },
        { key: "entrega", label: "ENTREGA", type: "money" },
        { key: "gasto", label: "GASTO", type: "money" },
        { key: "dinero_a_entregar", label: "$", type: "money" },
        { key: "d_merca", label: "D/MERCA", type: "money" },
        { key: "d_dinero", label: "D/DINERO", type: "money" },
        { key: "ganancia", label: "GANANCIA", type: "money" },
      ];

      let tableRows = "";
      sellers.forEach((row, i) => {
        const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
        tableRows += `<tr style="background:${bg};">`;
        pdfCols.forEach((col) => {
          const val = row?.[col.key];
          let display = "";
          if (col.type === "label") display = val || "";
          else if (col.type === "percent") display = n(val) ? `${n(val)}%` : "–";
          else if (col.type === "number") display = n(val) || "–";
          else display = n(val) ? `$${Number(val).toLocaleString("es-CO")}` : "–";

          const isGain = col.key === "ganancia";
          const isComputed = ["entrega", "d_merca", "d_dinero"].includes(col.key);
          const color = isGain ? (n(val) > 0 ? "#16a34a" : n(val) < 0 ? "#dc2626" : "#999") : isComputed ? (n(val) !== 0 ? "#1a1a1a" : "#999") : "#1a1a1a";
          const weight = isGain || col.key === "dinero_a_entregar" ? "bold" : "normal";
          const align = col.type === "label" ? "left" : "center";

          tableRows += `<td style="padding:6px 8px; text-align:${align}; font-weight:${weight}; color:${color}; font-size:10px; border-bottom:1px solid #e5e7eb;">${display}</td>`;
        });
        tableRows += "</tr>";
      });

      tableRows += '<tr style="background:#7c3aed; color:white; font-weight:bold;">';
      pdfCols.forEach((col) => {
        let display = "";
        if (col.type === "label") display = "TOTAL";
        else if (col.type === "percent") {
          const totalPct = Math.round(n(totals[col.key]) / Math.max(sellers.length, 1));
          display = totalPct ? `${totalPct}%` : "–";
        }
        else if (col.type === "number") display = n(totals[col.key]) || "–";
        else display = n(totals[col.key]) ? `$${Number(totals[col.key]).toLocaleString("es-CO")}` : "–";

        const align = col.type === "label" ? "left" : "center";
        tableRows += `<td style="padding:6px 8px; text-align:${align}; font-size:10px; border-bottom:1px solid #6d28d9;">${display}</td>`;
      });
      tableRows += "</tr>";

      container.innerHTML = `
        <div style="text-align:center; margin-bottom:16px; border-bottom:2px solid #7c3aed; padding-bottom:12px;">
          <h1 style="margin:0; font-size:20px; color:#7c3aed;">CobroKits</h1>
          <p style="margin:2px 0 0; font-size:11px; color:#666;">Reporte Diario</p>
          <h2 style="margin:10px 0 0; font-size:16px;">${formatDayLabel(currentDate)}</h2>
          <p style="margin:2px 0 0; font-size:11px; color:#333;">Vendedor: <strong>${activeSellerName}</strong></p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          <thead>
            <tr style="background:#7c3aed; color:white;">
              ${pdfCols.map(col => `<th style="padding:7px 8px; text-align:${col.type === 'label' ? 'left' : 'center'}; font-size:9px; font-weight:600;">${col.label}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="text-align:center; font-size:9px; color:#999; border-top:1px solid #eee; padding-top:6px;">
          Generado por CobroKits · ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "long", day: "numeric" }).format(new Date())}
        </div>
      `;

      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `reporte-diario-${currentDate}.pdf`,
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
        { key: "seller_name", label: "VENDEDOR", type: "label" },
        ...COLS,
      ];

      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Reporte Diario</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
          th { background: #7c3aed; color: #fff; padding: 6px 8px; text-align: center; font-weight: bold; border: 1px solid #5b21b6; }
          td { padding: 5px 8px; border: 1px solid #d1d5db; text-align: center; }
          .label { text-align: left; font-weight: bold; }
          .total { background: #7c3aed; color: #fff; font-weight: bold; }
          .gain { color: #16a34a; }
          .gain-neg { color: #dc2626; }
          .computed { font-weight: bold; color: #1a1a1a; }
        </style></head><body>
        <h2 style="font-family:Arial;color:#7c3aed;">CobroKits - Reporte Diario</h2>
        <p style="font-family:Arial;font-size:12px;">${formatDayLabel(currentDate)} · Vendedor: ${activeSellerName}</p>
        <table>`;

      html += "<thead><tr>" + excelCols.map(c =>
        `<th${c.type === 'label' ? ' style="text-align:left;"' : ''}>${c.label}</th>`
      ).join("") + "</tr></thead><tbody>";

      sellers.forEach((row, i) => {
        const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
        html += `<tr style="background:${bg};">`;
        excelCols.forEach(col => {
          const val = row?.[col.key];
          let display = ""; let cls = "";
          if (col.type === "label") { display = val || ""; cls = "label"; }
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
          const totalPct = Math.round(n(totals[col.key]) / Math.max(sellers.length, 1));
          display = totalPct ? `${totalPct}%` : "–";
        }
        else if (col.type === "number") display = n(totals[col.key]) || "–";
        else display = n(totals[col.key]) ? `$${Number(totals[col.key]).toLocaleString("es-CO")}` : "–";
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
      a.download = `reporte-diario-${currentDate}.xls`;
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
          <button className="iconButton" onClick={prevDay} title="Día anterior"><ChevronLeft size={18} /></button>
          <div className="reportes-week-label">
            <Calendar size={16} />
            <span>{formatDayLabel(currentDate)}</span>
          </div>
          <button className="iconButton" onClick={nextDay} title="Día siguiente"><ChevronRight size={18} /></button>
          <button className="iconButton" onClick={goToday} title="Hoy">Hoy</button>
          <button className="iconButton" onClick={() => loadDay(currentDate)} disabled={loading} title="Actualizar">
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
        <p className="reportes-hint">Las celdas en <span style={{color:"var(--brand)"}}>verde</span> son editables. Gasto y $ los ingresa el vendedor.</p>
      </div>

      {/* Table */}
      <div className="wr-table-wrap">
        <table className="wr-table">
          <thead>
            <tr>
              <th className="wr-th-label">Vendedor</th>
              {COLS.map((col) => (
                <th key={col.key} className="wr-th-metric" title={col.desc}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4].map(di => (
                <tr key={`skel-${di}`} className={di % 2 === 0 ? "row-even" : "row-odd"}>
                  <td className="wr-row-label"><div className="skel skel-line" style={{width:'100px'}} /></td>
                  {COLS.map((col) => (
                    <td key={col.key} className={metricCellClass(col)}>
                      <div className="skel skel-line" style={{width:'50px'}} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sellers.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} style={{textAlign:'center', padding:'24px', color:'#999'}}>
                  No hay datos para esta fecha
                </td>
              </tr>
            ) : sellers.map((row, i) => (
              <tr key={row.seller_id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                <td className="wr-row-label">
                  <span className="wr-label-text">{row.seller_name}</span>
                </td>
                {COLS.map((col) => (
                  <td key={col.key} className={metricCellClass(col)}>
                    {renderCell(col, row, i)}
                  </td>
                ))}
              </tr>
            ))}
            {sellers.length > 0 && (
              <tr className="wr-total-row">
                <td className="wr-row-label">
                  <span className="wr-label-text">Total</span>
                </td>
                {COLS.map((col) => (
                  <td key={col.key} className="wr-cell wr-total-cell">
                    {renderTotalCell(col)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
