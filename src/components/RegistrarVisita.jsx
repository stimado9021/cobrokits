import { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardList, PackagePlus, Save } from "lucide-react";

function dayName(dayNum) {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[dayNum] ?? "—";
}

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function hoyColombiaDow() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return now.getDay();
}

export function RegistrarVisita({
  sellers,
  activeSellerId,
  setActiveSellerId,
  activeCustomers,
  formatMoney,
  products,
  isSubmitting,
  loading = false,
  visits = [],
  activeSellerName = "Todos los vendedores",
  onRegistered,
}) {
  const today = useMemo(() => hoyColombia(), []);
  const todayDow = useMemo(() => hoyColombiaDow(), []);

  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [visitItems, setVisitItems] = useState([]);
  const [currentProductId, setCurrentProductId] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);

  useEffect(() => {
    setSelectedCustomer("");
    setVisitItems([]);
    setCurrentProductId("");
    setCurrentQuantity("");
    setPaymentAmount("");
    setPaymentMethod("");
    setNotes("");
  }, [activeSellerId]);

  // ─── History panel ────────────────────────────────
  const sellerVisits = useMemo(
    () => visits
      .filter((v) => !activeSellerId || v.seller_id === activeSellerId)
      .sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date)),
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
    if (selectedDate && !availableDates.includes(selectedDate) && selectedDate !== today) {
      setSelectedDate(today);
    }
  }, [availableDates, selectedDate, today]);

  const filteredVisits = useMemo(
    () => sellerVisits.filter((v) => (v.visit_date ? v.visit_date.slice(0, 10) : "") === selectedDate),
    [sellerVisits, selectedDate]
  );

  // ─── Load daily stock ─────────────────────────────
  const [dailyStockItems, setDailyStockItems] = useState([]);

  useEffect(() => {
    if (!activeSellerId) { setDailyStockItems([]); return; }
    let cancelled = false;
    fetch(`/apis/daily-stock?sellerId=${activeSellerId}&stockDate=${today}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && data.success) setDailyStockItems(data.items || []); })
      .catch(() => { if (!cancelled) setDailyStockItems([]); });
    return () => { cancelled = true; };
  }, [activeSellerId, today]);

  const stockMap = useMemo(() => {
    const map = {};
    dailyStockItems.forEach((i) => {
      map[i.product_id] = Number(i.quantity_delivered) - Number(i.quantity_sold);
    });
    return map;
  }, [dailyStockItems]);

  const effectiveStockMap = useMemo(() => {
    const map = { ...stockMap };
    visitItems.forEach(item => {
      map[item.product_id] = Math.max(0, (map[item.product_id] || 0) - item.quantity);
    });
    return map;
  }, [stockMap, visitItems]);

  const hasAnyStock = useMemo(
    () => Object.values(effectiveStockMap).some((q) => q > 0),
    [effectiveStockMap]
  );

  // ─── Stock warning ────────────────────────────────
  const timerRef = useRef(null);
  const [showWarning, setShowWarning] = useState(false);
  const hasStock = useMemo(() => {
    if (!activeSellerId || !currentProductId) return true;
    return (effectiveStockMap[currentProductId] ?? 0) > 0;
  }, [activeSellerId, currentProductId, effectiveStockMap]);

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

  // ─── Add item ─────────────────────────────────────
  function addVisitItem() {
    if (!currentProductId || !currentQuantity || Number(currentQuantity) <= 0) return;
    const product = products.find(p => p.id === currentProductId);
    if (!product) return;

    const qtyNum = Number(currentQuantity);
    const available = effectiveStockMap[currentProductId] || 0;
    if (qtyNum > available) {
      alert(`Solo hay ${available} unidades disponibles de ${product.name}`);
      return;
    }

    setVisitItems(prev => {
      const existing = prev.find(item => item.product_id === currentProductId);
      if (existing) {
        const newQty = existing.quantity + qtyNum;
        if (newQty > available) {
          alert(`Solo hay ${available} unidades disponibles de ${product.name}`);
          return prev;
        }
        return prev.map(item => item.product_id === currentProductId ? { ...item, quantity: newQty } : item);
      }
      return [...prev, { product_id: currentProductId, quantity: qtyNum, name: product.name }];
    });
    setCurrentProductId("");
    setCurrentQuantity("");
  }

  function removeVisitItem(productId) {
    setVisitItems(prev => prev.filter(item => item.product_id !== productId));
  }

  // ─── Submit ───────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (!activeSellerId || !selectedCustomer) return false;
    if (visitItems.length === 0 && (!paymentAmount || Number(paymentAmount) <= 0)) return false;
    return true;
  }, [activeSellerId, selectedCustomer, visitItems, paymentAmount]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || !canSubmit) return;

    // Validate visit day
    const customer = activeCustomers.find(c => c.id === selectedCustomer);
    if (customer) {
      const visitDay = customer.visit_day !== null && customer.visit_day !== undefined ? Number(customer.visit_day) : null;
      if (visitDay !== null && visitDay !== todayDow) {
        alert(`${customer.name} solo se visita los ${dayName(visitDay)}. Hoy es ${dayName(todayDow)}.`);
        return;
      }
    }

    try {
      const res = await fetch("/apis/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: activeSellerId,
          customer_id: selectedCustomer,
          items: visitItems,
          payment_amount: Number(paymentAmount) || 0,
          payment_method: paymentMethod || null,
          notes: notes || null,
          visit_date: today,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVisitItems([]);
        setSelectedCustomer("");
        setCurrentProductId("");
        setCurrentQuantity("");
        setPaymentAmount("");
        setPaymentMethod("");
        setNotes("");
        if (onRegistered) onRegistered();
      } else {
        alert(data.message || "Error al registrar visita");
      }
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <section className="registrar-visita-layout">
      <form className="panel" onSubmit={handleSubmit}>
        <div className="panelHead">
          <h2>Registrar visita</h2>
          <Save size={18} />
        </div>
        <select value={activeSellerId} onChange={(e) => setActiveSellerId(e.target.value)} required>
          <option value="">Vendedor</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} required>
          <option value="">Cliente</option>
          {activeCustomers.map((c) => {
            const visitDay = c.visit_day !== null && c.visit_day !== undefined ? Number(c.visit_day) : null;
            const isToday = visitDay !== null && visitDay === todayDow;
            const label = visitDay !== null
              ? `${c.name} (${dayName(visitDay)}) - ${formatMoney(c.current_balance)}`
              : `${c.name} - ${formatMoney(c.current_balance)}`;
            return (
              <option key={c.id} value={c.id} disabled={!isToday}>
                {label} {isToday ? "✓" : ""}
              </option>
            );
          })}
        </select>
        {!hasAnyStock && activeSellerId && (
          <div className="notice" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "var(--red)", margin: "0" }}>
            Vendedor sin inventario hoy. Asígnele productos en "Entregar Inventario" primero.
          </div>
        )}
        <div className="row">
          <select value={currentProductId} onChange={(e) => setCurrentProductId(e.target.value)}>
            <option value="">Producto dejado</option>
            {products
              .filter((p) => (effectiveStockMap[p.id] ?? 0) > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({effectiveStockMap[p.id]} uds)
                </option>
              ))}
          </select>
          <input
            value={currentQuantity}
            onChange={(e) => setCurrentQuantity(e.target.value)}
            type="number"
            min="1"
            placeholder="Cant."
            style={{ width: "70px" }}
          />
          <button type="button" className="iconButton" onClick={addVisitItem} title="Agregar" disabled={isSubmitting || !currentProductId}>
            <PackagePlus size={18} />
          </button>
        </div>
        {showWarning && (
          <div className="notice" style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.1)", color: "var(--accent)", margin: "0" }}>
            No hay suficientes existencias de este producto.
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
          <input
            type="number"
            min="0"
            placeholder="Abono"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">Metodo</option>
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
          </select>
        </div>
        <input placeholder="Nota" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="primary" type="submit" disabled={isSubmitting || !canSubmit}>
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
              <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d === today ? "Hoy" : new Date(d + "T00:00:00").toLocaleDateString("es-CO", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric",
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
                <tr><td colSpan="5" className="empty-cell">Sin visitas en esta fecha</td></tr>
              ) : (
                <>
                  {filteredVisits.map((visit) => (
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
                  ))}
                  <tr className="visitas-totals">
                    <td><strong>Total</strong></td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.previous_balance || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.sale_total || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.payment_total || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.new_balance || 0), 0))}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
