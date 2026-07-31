import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { PackagePlus, RotateCcw, Calendar, FileDown, FileSpreadsheet } from "lucide-react";

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function hoyColombiaDow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return d.getDay();
}

export function EntregarInventario({
  sellers,
  cobros = [],
  activeCobroId = "",
  setActiveCobroId,
  activeSellerId,
  products,
  formatMoney,
  onDelivered,
}) {
  const [selectedSellerId, setSelectedSellerId] = useState(activeSellerId || "");
  const [dailyItems, setDailyItems] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closeResult, setCloseResult] = useState(null);
  const todayDate = useMemo(() => hoyColombia(), []);
  const [viewDate, setViewDate] = useState(todayDate);
  const [availableDates, setAvailableDates] = useState([]);

  const [deliveryQuantities, setDeliveryQuantities] = useState({});
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryCommitted, setDeliveryCommitted] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  // Reset seller when the cobro changes from the sidebar (the cobro select's own
  // onChange only fires on manual changes to this component's select).
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    setSelectedSellerId("");
  }, [activeCobroId]);

  // Reset delivery form when seller changes
  useEffect(() => {
    setDeliveryQuantities({});
    setDeliveryError("");
    setCloseResult(null);
    setDeliveryCommitted(false);
  }, [selectedSellerId]);

  // Clear closeResult when viewDate changes
  useEffect(() => {
    setCloseResult(null);
  }, [viewDate]);

  const busy = submitting || closing;

  // ─── Load available dates (lightweight) ───────────
  useEffect(() => {
    if (!activeCobroId && !selectedSellerId) { setAvailableDates([]); return; }
    let cancelled = false;
    const params = new URLSearchParams();
    if (activeCobroId) params.set("cobroId", activeCobroId);
    else params.set("sellerId", selectedSellerId);
    params.set("action", "dates");
    fetch(`/apis/daily-stock?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) setAvailableDates(data.dates || []);
      })
      .catch(() => { if (!cancelled) setAvailableDates([]); });
    return () => { cancelled = true; };
  }, [activeCobroId, selectedSellerId]);

  // ─── Load warehouse stock ONCE per seller (not per date) ─────
  useEffect(() => {
    let cancelled = false;
    fetch("/apis/general-stock")
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) setWarehouseStock(data.inventory || []);
      })
      .catch(() => { if (!cancelled) setWarehouseStock([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/apis/general-stock")
        .then(r => r.json())
        .then(data => { if (data.success) setWarehouseStock(data.inventory || []); })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // ─── Load daily stock for the selected cobro/seller and date ───────
  useEffect(() => {
    if (!activeCobroId && !selectedSellerId) { setDailyItems([]); return; }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (activeCobroId) params.set("cobroId", activeCobroId);
    else params.set("sellerId", selectedSellerId);
    params.set("stockDate", viewDate);
    fetch(`/apis/daily-stock?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) setDailyItems(data.items || []);
      })
      .catch(() => { if (!cancelled) setDailyItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeCobroId, selectedSellerId, viewDate]);

  useEffect(() => {
    if (!activeCobroId && !selectedSellerId) return;
    const interval = setInterval(() => {
      const params = new URLSearchParams();
      if (activeCobroId) params.set("cobroId", activeCobroId);
      else params.set("sellerId", selectedSellerId);
      params.set("stockDate", viewDate);
      fetch(`/apis/daily-stock?${params}`)
        .then(r => r.json())
        .then(data => { if (data.success) setDailyItems(data.items || []); })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [activeCobroId, selectedSellerId, viewDate]);

  const whMap = useMemo(() => {
    const map = {};
    warehouseStock.forEach((i) => { map[i.id] = Number(i.quantity); });
    return map;
  }, [warehouseStock]);

  const isPastDay = viewDate < todayDate;
  const isToday = viewDate === todayDate;

  // ─── Effective warehouse stock = on-hand minus queued items ────
  // Once a delivery is committed, the warehouse already reflects the reduction,
  // so we stop subtracting (the form keeps the delivered quantities visible).
  const effectiveWhMap = useMemo(() => {
    const map = { ...whMap };
    if (!deliveryCommitted) {
      Object.entries(deliveryQuantities).forEach(([product_id, quantity]) => {
        map[product_id] = Math.max(0, (map[product_id] || 0) - quantity);
      });
    }
    return map;
  }, [whMap, deliveryQuantities, deliveryCommitted]);

  // ─── Daily rows (deduplicated by product) ────────
  const dailyRows = useMemo(() => {
    const rowsByProduct = new Map();
    dailyItems.forEach((item) => {
      const delivered = Number(item.quantity_delivered);
      const sold = Number(item.quantity_sold);
      rowsByProduct.set(item.product_id, {
        product_id: item.product_id,
        product_name: item.product_name,
        delivered,
        sold,
        remaining: delivered - sold,
        sale_price: Number(item.sale_price),
        investment_cost: Number(item.investment_cost),
        is_closed: item.is_closed,
      });
    });
    let rows = Array.from(rowsByProduct.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));
    if (isToday) rows = rows.filter(r => !r.is_closed);
    return rows;
  }, [dailyItems, isToday]);

  const inversionVendido = useMemo(() => dailyRows.reduce((sum, r) => sum + (r.sold * r.investment_cost), 0), [dailyRows]);
  const ventaVendido = useMemo(() => dailyRows.reduce((sum, r) => sum + (r.sold * r.sale_price), 0), [dailyRows]);

  // ─── Seller already assigned to this cobro (from the stock delivered that day) ───
  const assignedSellerIds = useMemo(
    () => [...new Set(dailyItems.map(i => i.seller_id).filter(Boolean))],
    [dailyItems],
  );
  const assignedSellerId = assignedSellerIds.length > 0 ? assignedSellerIds[0] : null;
  const assignedSellerName = useMemo(
    () => sellers.find(s => s.id === assignedSellerId)?.name?.toUpperCase() || "vendedor",
    [sellers, assignedSellerId],
  );

  // Auto-select the assigned seller when the cobro already has stock for the viewed date
  useEffect(() => {
    if (loading || !assignedSellerId) return;
    if (selectedSellerId !== assignedSellerId) {
      setSelectedSellerId(assignedSellerId);
    }
  }, [assignedSellerId, selectedSellerId, loading, viewDate]);

  // ─── Delivery form handlers ───────────────────────
  function updateDeliveryQty(productId, value) {
    const qty = Number(value);
    if (isNaN(qty) || qty <= 0) {
      setDeliveryQuantities(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      return;
    }
    const available = effectiveWhMap[productId] ?? 0;
    if (qty > available) {
      setDeliveryError(`Stock insuficiente: solo hay ${available} unidades de "${products.find(p => p.id === productId)?.name}"`);
      setDeliveryQuantities(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      return;
    }
    setDeliveryError("");
    setDeliveryQuantities(prev => ({ ...prev, [productId]: qty }));
  }

  async function handleDeliver(event) {
    event.preventDefault();
    if (submitting || !selectedSellerId || Object.keys(deliveryQuantities).length === 0) return;
    setSubmitting(true);
    setDeliveryError("");
    const items = Object.entries(deliveryQuantities).map(([product_id, quantity]) => {
      const product = products.find(p => p.id === product_id);
      return { product_id, name: product?.name || "", quantity };
    });
    try {
      const res = await fetch("/apis/daily-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_batch",
          seller_id: selectedSellerId,
          cobro_id: activeCobroId || null,
          stock_date: todayDate,
          items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDeliveryCommitted(true);
        // Keep the delivered quantities visible in the form (same cobro y vendedor)
        // Reload daily stock for today so the side card shows the delivery
        const dsParams = new URLSearchParams();
        if (activeCobroId) dsParams.set("cobroId", activeCobroId);
        else if (selectedSellerId) dsParams.set("sellerId", selectedSellerId);
        dsParams.set("stockDate", todayDate);
        const dsRes = await fetch(`/apis/daily-stock?${dsParams}`);
        const dsData = await dsRes.json();
        if (dsData.success) setDailyItems(dsData.items || []);
        // Reload available dates
        const datesParams = new URLSearchParams();
        if (activeCobroId) datesParams.set("cobroId", activeCobroId);
        else if (selectedSellerId) datesParams.set("sellerId", selectedSellerId);
        datesParams.set("action", "dates");
        const datesRes = await fetch(`/apis/daily-stock?${datesParams}`);
        const datesData = await datesRes.json();
        if (datesData.success) setAvailableDates(datesData.dates || []);
        if (onDelivered) onDelivered();
      } else {
        setDeliveryError(data.message || "Error al entregar");
      }
    } catch (e) {
      setDeliveryError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Close day handler ────────────────────────────
  function handleCloseDayClick() {
    if (!selectedSellerId || closing) return;
    if (!confirm("¿Estás seguro de cerrar el día? Los productos no vendidos se devolverán a bodega.")) return;
    handleCloseDay();
  }

  async function handleCloseDay() {
    if (!selectedSellerId || closing) return;
    setClosing(true);
    setCloseResult(null);
    try {
      const res = await fetch("/apis/daily-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_day", seller_id: selectedSellerId, stock_date: viewDate }),
      });
      const data = await res.json();
      if (data.success) {
        setCloseResult(data.closed);
        // Reload daily stock for the view date
        const dsParams = new URLSearchParams();
        if (activeCobroId) dsParams.set("cobroId", activeCobroId);
        else if (selectedSellerId) dsParams.set("sellerId", selectedSellerId);
        dsParams.set("stockDate", viewDate);
        const dsRes = await fetch(`/apis/daily-stock?${dsParams}`);
        const dsData = await dsRes.json();
        if (dsData.success) setDailyItems(dsData.items || []);
        // Reload dates
        const datesParams = new URLSearchParams();
        if (activeCobroId) datesParams.set("cobroId", activeCobroId);
        else if (selectedSellerId) datesParams.set("sellerId", selectedSellerId);
        datesParams.set("action", "dates");
        const datesRes = await fetch(`/apis/daily-stock?${datesParams}`);
        const datesData = await datesRes.json();
        if (datesData.success) setAvailableDates(datesData.dates || []);
      } else {
        setCloseResult({ error: data.message || "Error al cerrar día" });
      }
    } catch (e) {
      setCloseResult({ error: e.message });
    } finally {
      setClosing(false);
    }
  }

  const canCloseDay = !!selectedSellerId && !isPastDay && dailyRows.length > 0 && !dailyRows.every(r => r.is_closed);
  const cobroHasStock = !!activeCobroId && isToday && dailyItems.length > 0;

  // ─── PDF generation ────────────────────────────────
  async function generatePdf() {
    if (generatingPdf || dailyRows.length === 0) return;
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const sellerName = sellers.find(s => s.id === selectedSellerId)?.name?.toUpperCase() || "VENDEDOR";
      const today = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric", month: "long", day: "numeric",
      }).format(new Date());

      const hasReturn = isPastDay || dailyRows.some(r => r.is_closed);
      const returnCol = hasReturn ? `<th style="padding: 10px 12px; text-align: center; font-size: 13px;">Devuelto</th>` : "";

      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "20px";
      container.style.color = "#1a1a1a";

      container.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #3B82F6; padding-bottom: 16px;">
          <h1 style="margin: 0; font-size: 22px; color: #3B82F6;">CobroKits</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #666;">Consignacion semanal</p>
          <h2 style="margin: 12px 0 0; font-size: 18px;">Stock - ${sellerName}</h2>
          <p style="margin: 4px 0 0; font-size: 12px; color: #666;">Fecha: ${viewDate} · ${today}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #2563EB; color: white;">
              <th style="padding: 10px 12px; text-align: left; font-size: 13px;">#</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 13px;">Producto</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Entregado</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Vendido</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Disponible</th>
              ${returnCol}
              <th style="padding: 10px 12px; text-align: right; font-size: 13px;">Inversion</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 13px;">Venta</th>
            </tr>
          </thead>
          <tbody>
            ${dailyRows.map((item, i) => {
              const invRow = item.sold * item.investment_cost;
              const saleRow = item.sold * item.sale_price;
              const returnTd = hasReturn ? `<td style="padding: 8px 12px; text-align: center; font-size: 13px;">${item.is_closed ? item.remaining : 0}</td>` : "";
              return `
              <tr style="background: ${i % 2 === 0 ? "#f9f9f9" : "#fff"};">
                <td style="padding: 8px 12px; font-size: 12px; color: #666;">${i + 1}</td>
                <td style="padding: 8px 12px; font-size: 13px; font-weight: 500;">${item.product_name} <span style="font-size:11px;color:#666;">${formatMoney(item.investment_cost)}/${formatMoney(item.sale_price)}</span>${item.is_closed ? ' <span style="font-size:10px;color:#3B82F6;">(Cerrado)</span>' : ""}</td>
                <td style="padding: 8px 12px; text-align: center; font-size: 13px;">${item.delivered}</td>
                <td style="padding: 8px 12px; text-align: center; font-size: 13px;">${item.sold}</td>
                <td style="padding: 8px 12px; text-align: center; font-size: 14px; font-weight: bold; color: ${item.remaining > 0 ? "#16a34a" : "#dc2626"};">${item.is_closed ? 0 : item.remaining}</td>
                ${returnTd}
                <td style="padding: 8px 12px; text-align: right; font-size: 13px;">${formatMoney(invRow)}</td>
                <td style="padding: 8px 12px; text-align: right; font-size: 13px; font-weight: bold;">${formatMoney(saleRow)}</td>
              </tr>`;
            }).join("")}
          </tbody>
          <tfoot>
            <tr style="background: #EFF6FF; border-top: 2px solid #2563EB;">
              <td style="padding: 10px 12px; font-weight: bold; font-size: 13px;" colspan="2">Total vendido</td>
              <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-size: 13px;"></td>
              <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-size: 14px; color: #2563EB;">${dailyRows.reduce((s, r) => s + r.sold, 0)}</td>
              <td colspan="${hasReturn ? 2 : 1}"></td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px;">${formatMoney(inversionVendido)}</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-size: 14px; color: #2563EB;">${formatMoney(ventaVendido)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="text-align: center; font-size: 10px; color: #999; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px;">
          Generado por CobroKits · ${today}
        </div>
      `;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `stock-${sellerName.replace(/\s+/g, "-").toLowerCase()}-${viewDate}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        })
        .from(container)
        .save();
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ─── Excel generation ──────────────────────────────
  function generateExcel() {
    if (generatingExcel || dailyRows.length === 0) return;
    setGeneratingExcel(true);
    try {
      const sellerName = sellers.find(s => s.id === selectedSellerId)?.name?.toUpperCase() || "VENDEDOR";
      const today = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric", month: "long", day: "numeric",
      }).format(new Date());

      const hasReturn = isPastDay || dailyRows.some(r => r.is_closed);
      const totalSold = dailyRows.reduce((s, r) => s + r.sold, 0);

      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Stock</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
          th { background: #2563EB; color: #fff; padding: 6px 8px; text-align: center; font-weight: bold; border: 1px solid #1D4ED8; }
          td { padding: 5px 8px; border: 1px solid #d1d5db; text-align: center; }
          .label { text-align: left; font-weight: bold; }
          .total { background: #2563EB; color: #fff; font-weight: bold; }
          .stock-ok { color: #16a34a; font-weight: bold; }
          .stock-zero { color: #dc2626; font-weight: bold; }
        </style></head><body>
        <h2 style="font-family:Arial;color:#2563EB;">CobroKits - Stock ${sellerName}</h2>
        <p style="font-family:Arial;font-size:12px;">Fecha: ${viewDate} · ${today}</p>
        <table>
        <thead><tr>
          <th style="text-align:left;">#</th>
          <th style="text-align:left;">Producto</th>
          <th>Entregado</th>
          <th>Vendido</th>
          <th>Disponible</th>
          ${hasReturn ? "<th>Devuelto</th>" : ""}
          <th>Inversion</th>
          <th>Venta</th>
        </tr></thead><tbody>`;

      dailyRows.forEach((item, i) => {
        const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
        const cls = item.remaining > 0 ? "stock-ok" : "stock-zero";
        const invRow = item.sold * item.investment_cost;
        const saleRow = item.sold * item.sale_price;
        html += `<tr style="background:${bg};">
          <td class="label">${i + 1}</td>
          <td class="label">${item.product_name} <span style="font-size:10px;color:#666;">${formatMoney(item.investment_cost)}/${formatMoney(item.sale_price)}</span>${item.is_closed ? " (Cerrado)" : ""}</td>
          <td>${item.delivered}</td>
          <td>${item.sold}</td>
          <td class="${cls}">${item.is_closed ? 0 : item.remaining}</td>
          ${hasReturn ? `<td>${item.is_closed ? item.remaining : 0}</td>` : ""}
          <td>${formatMoney(invRow)}</td>
          <td style="font-weight:bold;">${formatMoney(saleRow)}</td>
        </tr>`;
      });

      html += `</tbody><tfoot><tr style="background:#EFF6FF; border-top:2px solid #2563EB;">
        <td class="total" colspan="2" style="text-align:left;">Total vendido</td>
        <td class="total"></td>
        <td class="total">${totalSold}</td>
        <td colspan="${hasReturn ? 2 : 1}"></td>
        <td class="total">${formatMoney(inversionVendido)}</td>
        <td class="total">${formatMoney(ventaVendido)}</td>
      </tr></tfoot></table>
        <p style="font-family:Arial;font-size:10px;color:#999;margin-top:8px;">Generado por CobroKits · ${today}</p>
        </body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stock-${sellerName.replace(/\s+/g, "-").toLowerCase()}-${viewDate}.xls`;
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
    <section className="workgrid">
      <form className="panel" onSubmit={handleDeliver}>
        <div className="panelHead">
          <h2>Entregar inventario diario</h2>
          <PackagePlus size={18} />
        </div>
        <select
          value={activeCobroId}
          onChange={(e) => { setActiveCobroId(e.target.value); setSelectedSellerId(""); }}
          required
        >
          <option value="">Selecciona un cobro</option>
          {cobros.filter(c => c.day_of_week === hoyColombiaDow() && c.is_active).map((cobro) => (
            <option key={cobro.id} value={cobro.id}>{cobro.name.toUpperCase()}</option>
          ))}
        </select>
        {activeCobroId && (
          <select
            value={selectedSellerId}
            onChange={(e) => {
              const next = e.target.value;
              if (assignedSellerIds.length > 0 && next !== assignedSellerId) {
                alert(`Este cobro ya tiene asignado el vendedor ${assignedSellerName} para el día ${viewDate}. No se puede cambiar.`);
                return;
              }
              setSelectedSellerId(next);
            }}
            required
          >
            <option value="">Selecciona un vendedor</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>{seller.name.toUpperCase()}</option>
            ))}
          </select>
        )}
        {cobroHasStock && (
          <p style={{ fontSize: "12px", color: "var(--red)", margin: "4px 0", fontWeight: "bold" }}>
            Este cobro ya tiene stock asignado para hoy a {assignedSellerName}. No se puede volver a entregar.
          </p>
        )}
        <div className="row" style={{ overflowX: "auto" }}>
          <table className="dataTable" style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 8px", textAlign: "left", fontSize: "11px" }}>Producto</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>Stock</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>Costo</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>PVP</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const stock = effectiveWhMap[p.id] ?? 0;
                return (
                  <tr key={p.id}>
                    <td style={{ padding: "3px 8px", fontSize: "12px" }}>{p.name.toUpperCase()}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontWeight: "bold", fontSize: "12px" }}>{stock}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontSize: "12px" }}>{formatMoney(p.investment_cost)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontSize: "12px" }}>{formatMoney(p.sale_price)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={deliveryQuantities[p.id] || ""}
                        onChange={(e) => updateDeliveryQty(p.id, e.target.value)}
                        style={{ width: "60px", textAlign: "center", padding: "3px 6px", fontSize: "12px", minHeight: "28px" }}
                        disabled={stock === 0 || cobroHasStock}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {deliveryError && (
          <p style={{ fontSize: "12px", color: "var(--red)", margin: "4px 0" }}>{deliveryError}</p>
        )}
        <button className="primary" type="submit" disabled={busy || !isToday || cobroHasStock || Object.keys(deliveryQuantities).length === 0}>
          {submitting ? <span className="spinner" /> : <PackagePlus size={17} />}
          {submitting ? "Entregando..." : "Entregar"}
        </button>
      </form>

      <div className="panel inventory-preview-panel">
        <div className="panelHead inventory-day-head" style={{ justifyContent: "space-between" }}>
          <h2>
            {activeCobroId ? (
              <>Stock para <span>{cobros.find(c => c.id === activeCobroId)?.name?.toUpperCase() || "cobro"}</span></>
            ) : (
              <>Stock entregado</>
            )}
          </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {selectedSellerId && (
                <span style={{ fontSize: "0.8rem", color: "var(--ink)" }}>Vendedor: {sellers.find(s => s.id === selectedSellerId)?.name?.toUpperCase() || "vendedor"}</span>
              )}
              <button
                className="iconButton"
                onClick={generatePdf}
                disabled={generatingPdf || loading || dailyRows.length === 0}
                title="Descargar PDF"
                style={{ opacity: generatingPdf ? 0.5 : 1, padding: "6px" }}
              >
                {generatingPdf ? <span className="spinner" /> : <FileDown size={16} />}
              </button>
              <button
                className="iconButton"
                onClick={generateExcel}
                disabled={generatingExcel || loading || dailyRows.length === 0}
                title="Descargar Excel"
                style={{ opacity: generatingExcel ? 0.5 : 1, padding: "6px" }}
              >
                {generatingExcel ? <span className="spinner" /> : <FileSpreadsheet size={16} />}
              </button>
              <Calendar size={14} />
              <select
                value={viewDate}
                onChange={(e) => setViewDate(e.target.value)}
                style={{ width: "150px", fontSize: "13px", padding: "4px", backgroundColor: "var(--surface-2)", color: "var(--text)" }}
              >
                {!availableDates.includes(todayDate) && (
                  <option value={todayDate}>Hoy ({todayDate})</option>
                )}
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d === todayDate ? `Hoy (${d})` : `Historial: ${d}`}
                  </option>
                ))}
              </select>
              {canCloseDay && (
                <button
                  type="button"
                  className="primary"
                  style={{ padding: "4px 12px", fontSize: "13px" }}
                  onClick={handleCloseDayClick}
                  disabled={closing}
                >
                  {closing ? <span className="spinner" /> : <RotateCcw size={14} />}
                  {closing ? "Cerrando..." : "Cerrar día"}
                </button>
              )}
            </div>
          </div>

          {isPastDay && <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "8px" }}>Vista histórica (solo lectura)</p>}

          {closeResult && !closeResult.error && closeResult.length > 0 && (
            <div className="notice" style={{ marginBottom: "8px" }}>
              Día cerrado. {closeResult.map(r => `${r.out_product_name}: ${r.out_returned_to_warehouse} uds devueltas`).join(", ")}
            </div>
          )}
          {closeResult?.error && (
            <div className="notice" style={{ marginBottom: "8px", color: "var(--red)" }}>
              {closeResult.error}
            </div>
          )}

          {loading ? (
            <table className="dataTable skel-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Entregado</th>
                  <th>Vendido</th>
                  <th>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {[1,2,3].map(n => (
                  <tr key={`skel-${n}`}>
                    <td><div className="skel skel-line" style={{width:'70%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'40px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'40px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'40px'}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : dailyRows.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Entregado</th>
                  <th>Vendido</th>
                  <th>Disponible</th>
                  {(isPastDay || dailyRows.some(r => r.is_closed)) && <th>Devuelto</th>}
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((item) => (
                  <tr key={item.product_id} style={{ opacity: item.is_closed ? 0.6 : 1 }}>
                    <td>{item.product_name} <span style={{fontSize:'11px', color:'var(--text-dim)'}}>{formatMoney(item.investment_cost)}/{formatMoney(item.sale_price)}</span>{item.is_closed && <span style={{fontSize:'10px', color:'var(--brand)', marginLeft:'4px'}}>(Cerrado)</span>}</td>
                    <td>{item.delivered}</td>
                    <td>{item.sold}</td>
                    <td>{item.is_closed ? 0 : item.remaining}</td>
                    {(isPastDay || dailyRows.some(r => r.is_closed)) && <td>{item.is_closed ? item.remaining : 0}</td>}
                  </tr>
                ))}
              </tbody>
              {dailyRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td><strong>Total vendido</strong></td>
                    <td></td>
                    <td style={{ fontWeight: "bold", color: "var(--red)" }}>
                      {formatMoney(inversionVendido)}/{formatMoney(ventaVendido)}
                    </td>
                    <td colSpan={isPastDay || dailyRows.some(r => r.is_closed) ? 2 : 1}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : !activeCobroId ? (
            <p>Selecciona un cobro y un vendedor para ver el stock entregado.</p>
          ) : (
            <p>No hay registros de stock para esta fecha.</p>
          )}
        </div>
    </section>
  );
}
