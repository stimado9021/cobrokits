import { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardList, PackagePlus, Save } from "lucide-react";

// Helper to convert day number to name
function dayName(dayNum) {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[dayNum] ?? "—";
}

export function RegistrarVisita({ 
  registerVisit, 
  sellers, 
  activeSellerId, 
  setActiveSellerId,
  activeCustomers, 
  formatMoney, 
  products, 
  currentProductId, 
  setCurrentProductId, 
  currentQuantity, 
  setCurrentQuantity, 
  addVisitItem, 
  visitItems, 
  removeVisitItem,
  isSubmitting,
  loading = false,
  visits = [],
  activeSellerName = "Todos los vendedores",
  selectedVisitCustomer,
  setSelectedVisitCustomer,
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const todayDow = new Date().getDay(); // 0=Domingo, 6=Sábado (zona horaria local, usaremos Colombia)
  const [selectedDate, setSelectedDate] = useState(today);

  const sellerVisits = useMemo(
    () => visits
      .filter((visit) => !activeSellerId || visit.seller_id === activeSellerId)
      .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date)),
    [visits, activeSellerId]
  );

  const availableDates = useMemo(() => {
    const dates = new Set();
    sellerVisits.forEach((v) => {
      const d = v.visit_date ? v.visit_date.slice(0, 10) : "";
      if (d) dates.add(d);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [sellerVisits]);

  useEffect(() => {
    if (selectedDate && !availableDates.includes(selectedDate)) {
      if (selectedDate !== today) {
        setSelectedDate(today);
      }
    }
  }, [availableDates, selectedDate, today]);

  // Reset selected customer when seller changes
  useEffect(() => {
    setSelectedVisitCustomer("");
  }, [activeSellerId]);

  const filteredVisits = useMemo(
    () => sellerVisits.filter((v) => {
      const vd = v.visit_date ? v.visit_date.slice(0, 10) : "";
      return vd === selectedDate;
    }),
    [sellerVisits, selectedDate]
  );

  const dailyPayments = useMemo(() => {
    const map = {};
    sellerVisits.forEach((v) => {
      const d = v.visit_date ? v.visit_date.slice(0, 10) : "";
      if (d) map[d] = (map[d] || 0) + Number(v.payment_total || 0);
    });
    return map;
  }, [sellerVisits]);

  const [dailyStockItems, setDailyStockItems] = useState([]);

  useEffect(() => {
    if (!activeSellerId) { setDailyStockItems([]); return; }

    let cancelled = false;

    async function loadDailyStock() {
      try {
        const params = new URLSearchParams({ sellerId: activeSellerId, stockDate: today });
        const res = await fetch(`/apis/daily-stock?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && data.success) setDailyStockItems(data.items || []);
      } catch {
        if (!cancelled) setDailyStockItems([]);
      }
    }

    loadDailyStock();
    return () => { cancelled = true; };
  }, [activeSellerId, today]);

  const timerRef = useRef(null);

  const stockMap = useMemo(() => {
    const map = {};
    dailyStockItems.forEach((i) => {
      map[i.product_id] = Number(i.quantity_delivered) - Number(i.quantity_sold);
    });
    return map;
  }, [dailyStockItems]);

  const hasStock = useMemo(() => {
    if (!activeSellerId || !currentProductId) return true;
    return (stockMap[currentProductId] ?? 0) > 0;
  }, [activeSellerId, currentProductId, stockMap]);

  const [showWarning, setShowWarning] = useState(false);

  const hasAnyStock = useMemo(
    () => Object.values(stockMap).some((q) => q > 0),
    [stockMap]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!hasStock) {
      setShowWarning(true);
      timerRef.current = setTimeout(() => setShowWarning(false), 5000);
    } else {
      setShowWarning(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hasStock]);

  return (
    <section className="registrar-visita-layout">
      <form className="panel" onSubmit={registerVisit}>
        <div className="panelHead">
          <h2>Registrar visita</h2>
          <Save size={18} />
        </div>
        <select
          name="seller_id"
          value={activeSellerId}
          onChange={(event) => setActiveSellerId(event.target.value)}
          required
        >
          <option value="">Vendedor</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.name}
            </option>
          ))}
        </select>
        <select name="customer_id" id="visit-customer-select" required value={selectedVisitCustomer} onChange={e => setSelectedVisitCustomer(e.target.value)}>
          <option value="">Cliente</option>
          {activeCustomers.map((customer) => {
            const visitDay = customer.visit_day !== null && customer.visit_day !== undefined ? Number(customer.visit_day) : null;
            const isToday = visitDay !== null && visitDay === todayDow;
            const label = visitDay !== null 
              ? `${customer.name} (Visita: ${dayName(visitDay)}) - ${formatMoney(customer.current_balance)}`
              : `${customer.name} - ${formatMoney(customer.current_balance)}`;
            return (
              <option 
                key={customer.id} 
                value={customer.id} 
                disabled={!isToday}
                style={{ opacity: isToday ? 1 : 0.5, color: isToday ? 'var(--text)' : 'var(--text-dim)' }}
              >
                {label} {isToday ? "✓" : " (solo " + dayName(visitDay) + ")"}
              </option>
            );
          })}
        </select>
        {!hasAnyStock && activeSellerId && (
          <div className="notice" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "var(--red)", margin: "0" }}>
            Vendedor sin inventario hoy. Asígnele productos en la pestaña "Entregar Inventario" primero.
          </div>
        )}
        <div className="row">
          <select value={currentProductId} onChange={e => setCurrentProductId(e.target.value)}>
            <option value="">Producto dejado</option>
            {products
              .filter((product) => (stockMap[product.id] ?? 0) > 0)
              .map((product) => {
                const qty = stockMap[product.id];
                return (
                  <option key={product.id} value={product.id}>
                    {product.name} ({qty} uds)
                  </option>
                );
              })}
          </select>
          <input value={currentQuantity} onChange={e => setCurrentQuantity(e.target.value)} type="number" min="0" placeholder="Cant." style={{width: "70px"}} />
          <button type="button" className="iconButton" onClick={addVisitItem} title="Agregar a la visita" disabled={isSubmitting}>
            <PackagePlus size={18} />
          </button>
        </div>
        {showWarning && (
          <div className="notice" style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.1)", color: "var(--accent)", margin: "0" }}>
            No hay suficientes existencias de este producto en el inventario del vendedor.
          </div>
        )}
        {visitItems.length > 0 && (
          <div className="pending-items">
            {visitItems.map(item => (
              <div key={item.product_id} className="pending-item">
                <span>{item.quantity}x {item.name}</span>
                <button type="button" className="text-danger-button" onClick={() => removeVisitItem(item.product_id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <input name="payment_amount" type="number" min="0" placeholder="Abono" />
          <select name="payment_method">
            <option value="">Metodo</option>
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
          </select>
        </div>
        <input name="notes" placeholder="Nota" />
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <span className="spinner" /> : <Save size={17} />}
          {isSubmitting ? "Registrando..." : "Registrar"}
        </button>
      </form>

      <section className="panel visitas-table-panel">
        <div className="panelHead">
          <div>
            <h2>Visitas registradas</h2>
            <span>{activeSellerName}</span>
          </div>
          <ClipboardList size={18} />
        </div>

        <div className="visitas-table-wrap">
          {availableDates.length > 0 && (
            <div className="date-filter-row">
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d === today
                      ? "Hoy"
                      : new Date(d + "T00:00:00").toLocaleDateString("es-CO", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <table className="visitas-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Anterior</th>
                <th>Venta</th>
                <th>Abono</th>
                <th>Deuda</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3,4].map(n => (
                  <tr key={`skel-${n}`}>
                    <td><div className="skel skel-line" style={{width:'70%'}} /><div className="skel skel-line-sm" style={{width:'45%', marginTop:'4px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                  </tr>
                ))
              ) : filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-cell">Sin visitas en esta fecha</td>
                </tr>
              ) : (
                filteredVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <strong>{visit.customer_name}</strong>
                      <span>
                        {new Date(visit.visit_date).toLocaleDateString("es-CO")} ·{" "}
                        {visit.products_summary || "Sin producto nuevo"}
                      </span>
                    </td>
                    <td className="money-cell">{formatMoney(visit.previous_balance)}</td>
                    <td className="money-cell">{formatMoney(visit.sale_total)}</td>
                    <td className="money-cell">{formatMoney(visit.payment_total)}</td>
                    <td className="money-cell">{formatMoney(visit.new_balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
