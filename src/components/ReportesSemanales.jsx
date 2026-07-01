"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCcw, User, ShoppingBag, Banknote
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

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
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

function moneyColored(val, zeroClass = "empty") {
  const v = n(val);
  if (v === 0) return <span className={zeroClass}>–</span>;
  return <span className={v > 0 ? "positive" : "negative"}>{fmt.format(v)}</span>;
}

const METHOD_LABELS = { efectivo: "Efectivo", nequi: "Nequi", cash: "Efectivo", transfer: "Transferencia" };

/* ─── Row definitions (matches the physical ledger) ───── */
const ROWS = [
  { key: "cartera",             label: "Suma (Cartera)",       type: "money",   editable: false, desc: "Cartera total activa en la calle" },
  { key: "clientes_abonaron",   label: "Abn (Abonaron)",       type: "number",  editable: false, desc: "Clientes que pagaron ese día" },
  { key: "clientes_no_llevaron",label: "CNL (Llevaron)",       type: "number",  editable: false, desc: "Cantidad de productos dejados ese dia" },
  { key: "visitas_totales",     label: "UV (Visitas)",         type: "number",  editable: false, desc: "Total de clientes atendidos" },
  { key: "efectividad_pct",     label: "% Efectividad",        type: "percent", editable: false, desc: "Visitas / clientes activos totales" },
  { key: "m1_efectivo",         label: "m1 (Efectivo)",        type: "money",   editable: false, desc: "Recaudo en efectivo" },
  { key: "m2_nequi",            label: "M2 (Nequi)",           type: "money",   editable: false, desc: "Recaudo por Nequi" },
  { key: "abono_total",         label: "Abono Total",          type: "money",   editable: false, desc: "m1 + M2", highlight: "computed" },
  { key: "cnt_notes",           label: "CNT (Novedades)",      type: "text",    editable: true,  desc: "Observaciones del día" },
  { key: "suma_entrega",        label: "Suma Ventas",          type: "money",   editable: false, desc: "Ventas nuevas dejadas en crédito" },
  { key: "abono_total2",        label: "Total (Recaudo)",      type: "money",   editable: false, desc: "= Abono total del día", highlight: "computed" },
  { key: "gasto",               label: "Gasto",                type: "money",   editable: true,  desc: "Gasolina, almuerzo, viáticos…" },
  { key: "d1",                  label: "D1",                   type: "money_signed", editable: true, desc: "Diferencia / ajuste de caja" },
  { key: "d2",                  label: "D2",                   type: "money_signed", editable: true, desc: "Diferencia / ajuste de inventario" },
  { key: "dinero_a_entregar",   label: "$ (A entregar)",       type: "money",   editable: false, desc: "Abono – Gasto ± D1 ± D2", highlight: "computed" },
  { key: "ganancia",            label: "Ganancia",             type: "money",   editable: false, desc: "Entrega – Inversión + Abono – Gasto", highlight: "profit" },
];

const MANUAL_KEYS = ["gasto", "d1", "d2", "cnt_notes"];

/* ─── Empty day ───────────────────────────────────────── */
function emptyDay(dateStr) {
  return {
    day: dateStr,
    m1_efectivo: 0, m2_nequi: 0, abono_total: 0,
    clientes_abonaron: 0, visitas_totales: 0, clientes_no_llevaron: 0,
    efectividad_pct: 0, suma_entrega: 0, inversion_dia: 0,
    gasto: 0, d1: 0, d2: 0, cnt_notes: "",
    dinero_a_entregar: 0, ganancia: 0,
  };
}

/* ─── Component ─────────────────────────────────────────── */
export function ReportesSemanales({ activeSellerId = "", activeSellerName = "Todos los vendedores" }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [days, setDays] = useState(() =>
    Array.from({ length: 7 }, (_, i) => emptyDay(toISODate(addDays(getWeekStart(new Date()), i))))
  );
  const [carteraActual, setCarteraActual] = useState(0);
  const [loading, setLoading] = useState(false);

  // Editing state: { dayIdx, key, value }
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Visits panel
  const [visits, setVisits] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);

  /* Load weekly data from API */
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart: toISODate(ws) });
      if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/weekly-report?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDays(data.days.length === 7 ? data.days : data.days);
        setCarteraActual(n(data.cartera_actual));
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activeSellerId]);

  /* Load visits for the week */
  const loadVisits = useCallback(async () => {
    setVisitsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/visits${params.toString() ? `?${params.toString()}` : ""}`);
      const data = await res.json();
      if (data.success) setVisits(data.visits || []);
    } catch { /* silent */ }
    finally { setVisitsLoading(false); }
  }, [activeSellerId]);

  useEffect(() => {
    loadWeek(weekStart);
    loadVisits();
  }, [loadWeek, loadVisits, weekStart]);

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
        d1: key === "d1" ? n(value) : n(dayData.d1),
        d2: key === "d2" ? n(value) : n(dayData.d2),
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
    if (row.key === "cartera") { acc[row.key] = carteraActual; return acc; }
    if (row.key === "abono_total2") { acc[row.key] = days.reduce((s, d) => s + n(d.abono_total), 0); return acc; }
    acc[row.key] = days.reduce((s, d) => s + n(d[row.key] ?? 0), 0);
    return acc;
  }, {});

  /* Filter visits for current week */
  const weekEnd = addDays(weekStart, 7);
  const weekVisits = visits.filter(v => {
    const d = new Date(v.visit_date);
    return d >= weekStart && d < weekEnd;
  });

  /* Render a cell value */
  function renderCell(row, dayData, dayIdx) {
    const key = row.key;
    const rawVal = key === "cartera" ? carteraActual : (key === "abono_total2" ? dayData?.abono_total : dayData?.[key]);
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
        </div>
        <div className="reportes-seller-name">
          Vendedor: <strong>{activeSellerName}</strong>
        </div>
        <p className="reportes-hint">Las celdas en <span style={{color:"var(--brand)"}}>verde</span> son editables. El resto se calcula automáticamente.</p>
      </div>

      {/* Body */}
      <div className="reportes-body">
        {/* Left: main table */}
        <div className="reportes-left">
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
                {days.map((dayData, di) => (
                  <tr
                    key={dayData.day || di}
                    className={di % 2 === 0 ? "row-even" : "row-odd"}
                  >
                    {/* Row label */}
                    <td className="wr-row-label">
                      <span className="wr-label-text">{DAYS_ES[di]}</span>
                      <span className="wr-day-date">{dayData?.day ? formatDate(dayData.day) : ""}</span>
                    </td>
                    {/* Day cells */}
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

          {/* Summary cards */}
          <div className="reportes-cards">
            <div className="reportes-card">
              <span>Cartera activa</span>
              <strong>{money(carteraActual)}</strong>
            </div>
            <div className="reportes-card">
              <span>Recaudo (m1 efectivo)</span>
              <strong>{money(totals.m1_efectivo)}</strong>
            </div>
            <div className="reportes-card">
              <span>Recaudo (M2 Nequi)</span>
              <strong>{money(totals.m2_nequi)}</strong>
            </div>
            <div className="reportes-card">
              <span>Abono total semana</span>
              <strong>{money(totals.abono_total)}</strong>
            </div>
            <div className="reportes-card">
              <span>Ventas semana</span>
              <strong>{money(totals.suma_entrega)}</strong>
            </div>
            <div className="reportes-card">
              <span>Gastos semana</span>
              <strong className="negative">{money(totals.gasto)}</strong>
            </div>
            <div className={`reportes-card card-ganancia ${n(totals.ganancia) >= 0 ? "gain-positive" : "gain-negative"}`}>
              <span>Ganancia neta semana</span>
              <strong>{money(totals.ganancia)}</strong>
            </div>
          </div>
        </div>

        {/* Right: visits panel */}
        <div className="visits-panel">
          <div className="visits-panel-header">
            <h3>Visitas de la semana</h3>
            <button className="iconButton" onClick={loadVisits} disabled={visitsLoading} title="Actualizar">
              <RefreshCcw size={15} className={visitsLoading ? "spin" : ""} />
            </button>
          </div>
          <div className="visits-count-badge">{weekVisits.length} visita{weekVisits.length !== 1 ? "s" : ""}</div>

          {visitsLoading && <p className="visits-loading">Cargando visitas…</p>}
          {!visitsLoading && weekVisits.length === 0 && (
            <p className="visits-empty">No hay visitas registradas esta semana.</p>
          )}

          <ul className="visits-list">
            {weekVisits.map((v, i) => (
              <li key={v.id || i} className="visit-item">
                <div className="visit-meta">
                  <span className="visit-date">{formatDateTime(v.visit_date)}</span>
                </div>
                <div className="visit-row">
                  <User size={13} className="visit-icon" />
                  <span className="visit-label">Vendedor</span>
                  <span className="visit-value">{v.seller_name}</span>
                </div>
                <div className="visit-row">
                  <User size={13} className="visit-icon muted" />
                  <span className="visit-label">Cliente</span>
                  <span className="visit-value">{v.customer_name}</span>
                </div>
                <div className="visit-row">
                  <ShoppingBag size={13} className="visit-icon" />
                  <span className="visit-label">Compra</span>
                  <span className="visit-value positive">{money(v.new_products_total)}</span>
                </div>
                {n(v.payment_amount) > 0 && (
                  <div className="visit-row">
                    <Banknote size={13} className="visit-icon gain-positive" />
                    <span className="visit-label">Abono</span>
                    <span className="visit-value gain-positive">
                      {money(v.payment_amount)}
                      {v.payment_method && (
                        <span className="visit-method">{METHOD_LABELS[v.payment_method] || v.payment_method}</span>
                      )}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
