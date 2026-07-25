import { useEffect, useMemo, useState, useCallback } from "react";
import { PackagePlus, RotateCcw, Calendar } from "lucide-react";

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function EntregarInventario({
  sellers,
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

  // Delivery form state (local)
  const [deliveryProductId, setDeliveryProductId] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("");
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [deliveryError, setDeliveryError] = useState("");

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  // Reset delivery form when seller changes
  useEffect(() => {
    setDeliveryItems([]);
    setDeliveryProductId("");
    setDeliveryQuantity("");
    setDeliveryError("");
    setCloseResult(null);
  }, [selectedSellerId]);

  // Clear closeResult when viewDate changes
  useEffect(() => {
    setCloseResult(null);
  }, [viewDate]);

  const busy = submitting || closing;

  // ─── Load available dates (lightweight) ───────────
  useEffect(() => {
    if (!selectedSellerId) { setAvailableDates([]); return; }
    let cancelled = false;
    fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&action=dates`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) setAvailableDates(data.dates || []);
      })
      .catch(() => { if (!cancelled) setAvailableDates([]); });
    return () => { cancelled = true; };
  }, [selectedSellerId]);

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

  // ─── Load daily stock for the selected date ───────
  useEffect(() => {
    if (!selectedSellerId) { setDailyItems([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&stockDate=${viewDate}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) setDailyItems(data.items || []);
      })
      .catch(() => { if (!cancelled) setDailyItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSellerId, viewDate]);

  const whMap = useMemo(() => {
    const map = {};
    warehouseStock.forEach((i) => { map[i.id] = Number(i.quantity); });
    return map;
  }, [warehouseStock]);

  const isPastDay = viewDate < todayDate;
  const isToday = viewDate === todayDate;

  // ─── Effective warehouse stock = on-hand minus queued items ────
  const effectiveWhMap = useMemo(() => {
    const map = { ...whMap };
    deliveryItems.forEach(item => {
      map[item.product_id] = Math.max(0, (map[item.product_id] || 0) - item.quantity);
    });
    return map;
  }, [whMap, deliveryItems]);

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

  // ─── Delivery form handlers ───────────────────────
  function addDeliveryItem() {
    if (!deliveryProductId || !deliveryQuantity) return;
    const qty = Number(deliveryQuantity);
    if (qty <= 0) return;

    const available = effectiveWhMap[deliveryProductId] || 0;
    if (qty > available) {
      setDeliveryError(`Solo hay ${available} unidades en bodega`);
      return;
    }

    const product = products.find(p => p.id === deliveryProductId);
    if (!product) return;

    setDeliveryItems(prev => {
      const existing = prev.find(i => i.product_id === deliveryProductId);
      if (existing) {
        const newQty = existing.quantity + qty;
        if (newQty > available) {
          setDeliveryError(`Solo hay ${available} unidades en bodega`);
          return prev;
        }
        return prev.map(i => i.product_id === deliveryProductId ? { ...i, quantity: newQty } : i);
      }
      return [...prev, { product_id: deliveryProductId, name: product.name, quantity: qty }];
    });
    setDeliveryProductId("");
    setDeliveryQuantity("");
    setDeliveryError("");
  }

  function removeDeliveryItem(productId) {
    setDeliveryItems(prev => prev.filter(i => i.product_id !== productId));
  }

  async function handleDeliver(event) {
    event.preventDefault();
    if (submitting || !selectedSellerId || deliveryItems.length === 0) return;
    setSubmitting(true);
    setDeliveryError("");
    try {
      const res = await fetch("/apis/daily-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_batch",
          seller_id: selectedSellerId,
          stock_date: todayDate,
          items: deliveryItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDeliveryItems([]);
        setDeliveryProductId("");
        setDeliveryQuantity("");
        // Reload daily stock for today
        const dsRes = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&stockDate=${todayDate}`);
        const dsData = await dsRes.json();
        if (dsData.success) setDailyItems(dsData.items || []);
        // Reload available dates
        const datesRes = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&action=dates`);
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
        const dsRes = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&stockDate=${viewDate}`);
        const dsData = await dsRes.json();
        if (dsData.success) setDailyItems(dsData.items || []);
        // Reload dates
        const datesRes = await fetch(`/apis/daily-stock?sellerId=${selectedSellerId}&action=dates`);
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

  const canCloseDay = !isPastDay && dailyRows.length > 0 && !dailyRows.every(r => r.is_closed);

  return (
    <section className="workgrid">
      <form className="panel" onSubmit={handleDeliver}>
        <div className="panelHead">
          <h2>Entregar inventario diario</h2>
          <PackagePlus size={18} />
        </div>
        <select
          value={selectedSellerId}
          onChange={(e) => setSelectedSellerId(e.target.value)}
          required
        >
          <option value="">Vendedor</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>{seller.name}</option>
          ))}
        </select>
        <div className="row">
          <select
            value={deliveryProductId}
            onChange={(e) => { setDeliveryProductId(e.target.value); setDeliveryError(""); }}
          >
            <option value="">Producto</option>
            {products
              .filter((p) => (effectiveWhMap[p.id] ?? 0) > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (bodega: {effectiveWhMap[p.id]} uds)
                </option>
              ))}
          </select>
          <input
            value={deliveryQuantity}
            onChange={(e) => setDeliveryQuantity(e.target.value)}
            type="number"
            min="1"
            placeholder="Cant."
            style={{ width: "70px" }}
          />
          <button type="button" className="iconButton" onClick={addDeliveryItem} title="Agregar" disabled={busy || !deliveryProductId}>
            <PackagePlus size={18} />
          </button>
        </div>
        {deliveryError && (
          <p style={{ fontSize: "12px", color: "var(--red)", margin: "4px 0" }}>{deliveryError}</p>
        )}
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
        <button className="primary" type="submit" disabled={busy || !isToday || deliveryItems.length === 0}>
          {submitting ? <span className="spinner" /> : <PackagePlus size={17} />}
          {submitting ? "Entregando..." : "Entregar"}
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
          ) : (
            <p>No hay registros de stock para esta fecha.</p>
          )}
        </div>
      )}

    </section>
  );
}
