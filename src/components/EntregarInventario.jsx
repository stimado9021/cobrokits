import { useEffect, useMemo, useState } from "react";
import { PackagePlus, RotateCcw, Calendar } from "lucide-react";

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function EntregarInventario({
  deliverDailyStock,
  sellers,
  activeSellerId,
  products,
  currentDeliveryProductId,
  setCurrentDeliveryProductId,
  currentDeliveryQuantity,
  setCurrentDeliveryQuantity,
  addDeliveryItem,
  deliveryItems,
  removeDeliveryItem,
  formatMoney,
  isSubmitting,
}) {
  const [selectedSellerId, setSelectedSellerId] = useState(activeSellerId || "");
  const [dailyItems, setDailyItems] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState(null);
  const todayDate = useMemo(() => hoyColombia(), []);
  const [viewDate, setViewDate] = useState(todayDate);
  const [availableDates, setAvailableDates] = useState([]);

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  // Load available dates for the seller
  useEffect(() => {
    if (!selectedSellerId) { setAvailableDates([]); return; }

    let cancelled = false;
    async function loadDates() {
      try {
        const res = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          const dates = [...new Set(data.items.map(i => i.stock_date?.slice(0, 10)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
          setAvailableDates(dates);
        }
      } catch {
        if (!cancelled) setAvailableDates([]);
      }
    }
    loadDates();
    return () => { cancelled = true; };
  }, [selectedSellerId]);

  // Use todayDate for delivery, viewDate for display
  const effectiveDate = viewDate;

  // Load warehouse stock and daily stock for the view date
  useEffect(() => {
    if (!selectedSellerId) { setDailyItems([]); return; }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [wsRes, dsRes] = await Promise.all([
          fetch("/apis/general-stock"),
          fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&stockDate=${effectiveDate}`),
        ]);
        const wsData = await wsRes.json();
        const dsData = await dsRes.json();
        if (!cancelled) {
          if (wsData.success) setWarehouseStock(wsData.inventory || []);
          if (dsData.success) setDailyItems(dsData.items || []);
        }
      } catch {
        if (!cancelled) { setWarehouseStock([]); setDailyItems([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [selectedSellerId, effectiveDate]);

  const busy = isSubmitting || closing;

  const whMap = useMemo(() => {
    const map = {};
    warehouseStock.forEach((i) => { map[i.id] = Number(i.quantity); });
    return map;
  }, [warehouseStock]);

  const isPastDay = viewDate < todayDate;
  const isToday = viewDate === todayDate;

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
    // Ocultar items cerrados en vista "Hoy"
    if (isToday) {
      rows = rows.filter(r => !r.is_closed);
    }
    return rows;
  }, [dailyItems, isToday]);

  const inversionVendido = useMemo(() => {
    return dailyRows.reduce((sum, r) => sum + (r.sold * r.investment_cost), 0);
  }, [dailyRows]);

  async function handleCloseDay() {
    if (!selectedSellerId || closing) return;
    setClosing(true);
    setCloseResult(null);
    try {
      const res = await fetch("/apis/daily-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_day", seller_id: selectedSellerId, stock_date: todayDate }),
      });
      const data = await res.json();
      if (data.success) {
        setCloseResult(data.closed);
        const dsRes = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&stockDate=${todayDate}`);
        const dsData = await dsRes.json();
        if (dsData.success) setDailyItems(dsData.items || []);
      } else {
        setCloseResult({ error: data.message || "Error al cerrar día" });
      }
    } catch (e) {
      setCloseResult({ error: e.message });
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="workgrid">
      <form className="panel" onSubmit={deliverDailyStock}>
        <div className="panelHead">
          <h2>Entregar inventario diario</h2>
          <PackagePlus size={18} />
        </div>
        <select
          name="seller_id"
          value={selectedSellerId}
          onChange={(event) => setSelectedSellerId(event.target.value)}
          required
        >
          <option value="">Vendedor</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.name}
            </option>
          ))}
        </select>
        <div className="row">
          <select
            value={currentDeliveryProductId}
            onChange={(event) => setCurrentDeliveryProductId(event.target.value)}
          >
            <option value="">Producto</option>
            {products.map((product) => {
              const whQty = whMap[product.id] ?? 0;
              return (
                <option key={product.id} value={product.id}>
                  {product.name} (bodega: {whQty} uds)
                </option>
              );
            })}
          </select>
          <input
            value={currentDeliveryQuantity}
            onChange={(event) => setCurrentDeliveryQuantity(event.target.value)}
            type="number"
            min="0"
            placeholder="Cant."
            style={{ width: "70px" }}
          />
          <button type="button" className="iconButton" onClick={addDeliveryItem} title="Agregar" disabled={busy}>
            <PackagePlus size={18} />
          </button>
        </div>
        {deliveryItems.length > 0 && (
          <div className="pending-items">
            {deliveryItems.map((item) => (
              <div key={item.product_id} className="pending-item">
                <span>{item.quantity}x {item.name}</span>
                <button type="button" onClick={() => removeDeliveryItem(item.product_id)} className="text-danger-button">x</button>
              </div>
            ))}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy || !isToday}>
          {busy ? <span className="spinner" /> : <PackagePlus size={17} />}
          {busy ? "Entregando..." : "Entregar"}
        </button>
      </form>

      {selectedSellerId && (
        <div className="panel inventory-preview-panel">
          <div className="panelHead inventory-day-head" style={{ justifyContent: "space-between" }}>
            <h2>
              Stock para <span>{sellers.find(s => s.id === selectedSellerId)?.name || "vendedor"}</span>
            </h2>
            <div className="row" style={{ gap: "8px", margin: 0 }}>
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
              {isToday && dailyRows.length > 0 && !dailyRows.every(r => r.is_closed) && (
                <button
                  type="button"
                  className="primary"
                  style={{ padding: "4px 12px", fontSize: "13px" }}
                  onClick={handleCloseDay}
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
                    <td>{item.product_name} <span style={{fontSize:'11px', color:'var(--text-dim)'}}>{item.investment_cost}/{item.sale_price}</span>{item.is_closed && <span style={{fontSize:'10px', color:'var(--brand)', marginLeft:'4px'}}>(Cerrado)</span>}</td>
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
                    <td><strong>Total inversion vendido</strong></td>
                    <td></td>
                    <td style={{ fontWeight: "bold", color: "var(--red)" }}>{formatMoney(inversionVendido)}</td>
                    <td colSpan={isPastDay || dailyRows.some(r => r.is_closed) ? 2 : 1}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <p>No hay registros de stock para esta fecha.</p>
          )}
        </div>
      )}

    </section>
  );
}
