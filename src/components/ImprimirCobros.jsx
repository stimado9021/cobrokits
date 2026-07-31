"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, FileDown, FileSpreadsheet } from "lucide-react";

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

function money(val) {
  const v = Number(val || 0);
  if (v === 0) return "0";
  return fmt.format(v);
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function ImprimirCobros({ sellers, activeSellerId, activeSellerName, activeCobroId = "", cobros = [] }) {
  const activeCobroName = cobros.find(c => c.id === activeCobroId)?.name?.toUpperCase() || "";
  const scopeName = activeCobroId ? activeCobroName : (activeSellerId ? activeSellerName : "Todos");
  const scopeLabel = activeCobroId ? "Cobro" : "Vendedor";

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [customers, setCustomers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (activeCobroId) params.set("cobroId", activeCobroId);
      else if (activeSellerId) params.set("sellerId", activeSellerId);
      const res = await fetch(`/apis/collection-report?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Error al cargar reporte");
      setCustomers(data.customers);
    } catch (e) {
      setError(e.message);
      setCustomers(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, activeSellerId, activeCobroId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function generatePdf() {
    if (generatingPdf || !customers?.length) return;
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "16px";
      container.style.color = "#1a1a1a";
      container.style.fontSize = "11px";

      let rows = "";
      customers.forEach((c, i) => {
        const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
        rows += `<tr style="background:${bg};">
          <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
          <td style="padding:6px 8px;text-align:left;font-weight:600;border-bottom:1px solid #e5e7eb;">${c.name.toUpperCase()}</td>
          <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;">$${Number(c.current_balance).toLocaleString("es-CO")}</td>
          <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;">${c.last_visit_date ? "$" + Number(c.last_payment).toLocaleString("es-CO") : "0"}</td>
          <td style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">${c.last_products_summary || "0"}</td>
        </tr>`;
      });

      container.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #7c3aed;padding-bottom:12px;">
          <h1 style="margin:0;font-size:20px;color:#7c3aed;">CobroKits</h1>
          <p style="margin:2px 0 0;font-size:11px;color:#666;">Reporte de Cobros</p>
          <h2 style="margin:10px 0 0;font-size:16px;">${formatDate(selectedDate)}</h2>
          <p style="margin:2px 0 0;font-size:11px;color:#333;">${scopeLabel}: <strong>${scopeName}</strong></p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:#7c3aed;color:white;">
              <th style="padding:7px 8px;text-align:center;font-size:9px;font-weight:600;">#</th>
              <th style="padding:7px 8px;text-align:left;font-size:9px;font-weight:600;">CLIENTE</th>
              <th style="padding:7px 8px;text-align:center;font-size:9px;font-weight:600;">DEUDA ACTUAL</th>
              <th style="padding:7px 8px;text-align:center;font-size:9px;font-weight:600;">ÚLTIMO ABONO</th>
              <th style="padding:7px 8px;text-align:left;font-size:9px;font-weight:600;">ÚLTIMA VISITA - PRODUCTOS</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p style="font-size:9px;color:#999;text-align:center;">Generado por CobroKits</p>
      `;

      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `cobros-${selectedDate}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      }).from(container).save();
    } catch (e) {
      setError("Error al generar PDF: " + e.message);
    } finally {
      setGeneratingPdf(false);
    }
  }

  function generateExcel() {
    if (generatingExcel || !customers?.length) return;
    setGeneratingExcel(true);
    try {
      const sellerLabel = activeCobroId ? scopeName : (activeSellerId ? activeSellerName : "Todos");

      let rows = "";
      customers.forEach((c, i) => {
        rows += `<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${c.name.toUpperCase()}</td>
          <td style="text-align:right;">${Number(c.current_balance).toLocaleString("es-CO")}</td>
          <td style="text-align:right;">${c.last_visit_date ? Number(c.last_payment).toLocaleString("es-CO") : "0"}</td>
          <td>${c.last_products_summary || "0"}</td>
        </tr>`;
      });

      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8">
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Reporte</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px;}
          th{background:#7c3aed;color:#fff;padding:6px 8px;border:1px solid #5b21b6;font-weight:bold;}
          td{padding:5px 8px;border:1px solid #d1d5db;}
        </style></head>
        <body>
          <h2>CobroKits - Reporte de Cobros</h2>
          <p>Fecha: ${formatDate(selectedDate)} | Vendedor: ${sellerLabel}</p>
          <table>
            <thead><tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Deuda Actual</th>
              <th>Último Abono</th>
              <th>Última Visita - Productos</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="font-size:10px;color:#999;">Generado por CobroKits</p>
        </body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cobros-${selectedDate}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Error al generar Excel: " + e.message);
    } finally {
      setGeneratingExcel(false);
    }
  }

  return (
    <div className="panel imprimir-cobros">
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, maxWidth: 320 }}>
        <Calendar size={16} style={{ flexShrink: 0, color: "var(--muted)" }} />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {customers && customers.length > 0 && (
          <>
            <button className="primary" onClick={generatePdf} disabled={generatingPdf} style={{ background: "var(--accent)" }}>
              {generatingPdf ? <span className="spinner" style={{width:14,height:14}} /> : <FileDown size={16} />}
              {generatingPdf ? "Generando..." : "PDF"}
            </button>
            <button className="primary" onClick={generateExcel} disabled={generatingExcel} style={{ background: "var(--accent)" }}>
              {generatingExcel ? <span className="spinner" style={{width:14,height:14}} /> : <FileSpreadsheet size={16} />}
              {generatingExcel ? "Generando..." : "Excel"}
            </button>
          </>
        )}
      </div>

      {error ? <div className="notice">{error}</div> : null}

      {loading ? (
        <div style={{padding:20,gap:12,display:'flex',flexDirection:'column'}}>
          <div className="skel skel-line-lg" style={{width:'35%'}} />
          <div className="skel skel-line" />
          <div className="skel skel-line" />
          <div className="skel skel-line" />
          <div className="skel skel-line" />
        </div>
      ) : customers === null ? null : customers.length === 0 ? (
        <p style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          No hay clientes para cobrar en esta fecha.
        </p>
      ) : (
        <div id="collection-report-table" style={{ overflowX: "auto" }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Deuda Actual</th>
                <th>Último Abono</th>
                <th>Última Visita - Productos</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{c.name.toUpperCase()}</td>
                  <td>{money(c.current_balance)}</td>
                  <td>
                    {c.last_visit_date ? money(c.last_payment) : "0"}
                  </td>
                  <td>{c.last_products_summary || "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
