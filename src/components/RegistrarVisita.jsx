import { useState, useEffect, useMemo } from "react";
import { ClipboardList, Save } from "lucide-react";
import { Modal } from "./Modal";

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
  const [deliveryQuantities, setDeliveryQuantities] = useState({});
  const [deliveryError, setDeliveryError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [editingVisit, setEditingVisit] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    setSelectedCustomer("");
    setDeliveryQuantities({});
    setPaymentAmount("");
    setPaymentMethod("efectivo");
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
    Object.entries(deliveryQuantities).forEach(([product_id, quantity]) => {
      map[product_id] = Math.max(0, (map[product_id] || 0) - quantity);
    });
    return map;
  }, [stockMap, deliveryQuantities]);

  const hasAnyStock = useMemo(
    () => Object.values(effectiveStockMap).some((q) => q > 0),
    [effectiveStockMap]
  );

  // ─── Update delivery quantities ───
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
    const available = effectiveStockMap[productId] ?? 0;
    if (qty > available) {
      setDeliveryError(`Stock insuficiente: solo hay ${available} unidades`);
      return;
    }
    setDeliveryError("");
    setDeliveryQuantities(prev => ({ ...prev, [productId]: qty }));
  }

  // ─── Submit ─────────────────────────────
  const canSubmit = useMemo(() => {
    if (!activeSellerId || !selectedCustomer) return false;
    const hasItems = Object.keys(deliveryQuantities).length > 0;
    if (!hasItems && (!paymentAmount || Number(paymentAmount) <= 0)) return false;
    return true;
  }, [activeSellerId, selectedCustomer, deliveryQuantities, paymentAmount]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || !canSubmit) return;

    const customer = activeCustomers.find(c => c.id === selectedCustomer);
    if (customer) {
      const visitDay = customer.visit_day !== null && customer.visit_day !== undefined ? Number(customer.visit_day) : null;
      if (visitDay !== null && visitDay !== todayDow) {
        alert(`${customer.name} solo se visita los ${dayName(visitDay)}. Hoy es ${dayName(todayDow)}.`);
        return;
      }
    }

    const items = Object.entries(deliveryQuantities).map(([product_id, quantity]) => {
      const product = products.find(p => p.id === product_id);
      return { product_id, quantity, name: product?.name || "" };
    });

    try {
      const res = await fetch("/apis/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: activeSellerId,
          customer_id: selectedCustomer,
          items,
          payment_amount: Number(paymentAmount) || 0,
          payment_method: paymentMethod || null,
          notes: notes || null,
          visit_date: today,
        }),
      });
      const data = await res.json();
      if (data.success) {
setDeliveryQuantities({});
        setSelectedCustomer("");
        setPaymentAmount("");
        setPaymentMethod("efectivo");
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
        {deliveryError && (
          <p style={{ fontSize: "12px", color: "var(--red)", margin: "4px 0" }}>{deliveryError}</p>
        )}
        <div className="row" style={{ overflowX: "auto" }}>
          <table className="dataTable" style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 8px", textAlign: "left", fontSize: "11px" }}>Producto</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>Stock</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const stock = effectiveStockMap[p.id] ?? 0;
                return (
                  <tr key={p.id}>
                    <td style={{ padding: "3px 8px", fontSize: "12px" }}>{p.name}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", fontWeight: "bold", fontSize: "12px" }}>{stock}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={deliveryQuantities[p.id] || ""}
                        onChange={(e) => updateDeliveryQty(p.id, e.target.value)}
                        style={{ width: "60px", textAlign: "center", padding: "3px 6px", fontSize: "12px", minHeight: "28px" }}
                        disabled={stock === 0}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "center" }}>
          <input
            type="number"
            min="0"
            placeholder="$ Abono"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            style={{ width: "100%", fontSize: "13px" }}
          />
          <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--brand)" }}>
            <button
              type="button"
              onClick={() => setPaymentMethod("efectivo")}
              style={{
                flex: 1,
                padding: "7px 0",
                border: "none",
                background: paymentMethod === "efectivo" ? "var(--brand)" : "var(--surface-2)",
                color: paymentMethod === "efectivo" ? "#fff" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: paymentMethod === "efectivo" ? "700" : "500",
                transition: "all 0.25s",
              }}
            >
              Efectivo
            </button>
            <div style={{ width: "1px", background: "var(--line)" }} />
            <button
              type="button"
              onClick={() => setPaymentMethod("nequi")}
              style={{
                flex: 1,
                padding: "7px 0",
                border: "none",
                background: paymentMethod === "nequi" ? "var(--brand)" : "var(--surface-2)",
                color: paymentMethod === "nequi" ? "#fff" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: paymentMethod === "nequi" ? "700" : "500",
                transition: "all 0.25s",
              }}
            >
              Nequi
            </button>
          </div>
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
                <th></th>
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
                <tr><td colSpan="6" className="empty-cell">Sin visitas en esta fecha</td></tr>
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
                      <td>
                        <button
                          type="button"
                          className="iconButton"
                          onClick={() => {
                            setEditingVisit(visit);
                            setEditValues({
                              previous_balance: visit.previous_balance,
                              sale_total: visit.sale_total,
                              payment_amount: visit.payment_total,
                              payment_method: visit.payment_method || "",
                            });
                          }}
                          title="Editar"
                        >
                          ✎
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="visitas-totals">
                    <td><strong>Total</strong></td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.previous_balance || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.sale_total || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.payment_total || 0), 0))}</td>
                    <td className="money-cell">{formatMoney(filteredVisits.reduce((s, v) => s + Number(v.new_balance || 0), 0))}</td>
                    <td></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
       </section>

       {editingVisit && (
         <Modal title="Editar visita" onClose={() => setEditingVisit(null)}>
           <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
             <div>
               <label style={{ fontSize: "12px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Cliente</label>
               <p style={{ fontWeight: "600" }}>{editingVisit.customer_name}</p>
             </div>
             <div>
               <label style={{ fontSize: "12px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Saldo anterior ($)</label>
               <input
                 type="number"
                 min="0"
                value={editValues.previous_balance ?? ""}
                 onChange={(e) => setEditValues(prev => ({ ...prev, previous_balance: e.target.value }))}
                 style={{ width: "100%" }}
               />
             </div>
             <div>
               <label style={{ fontSize: "12px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Total venta ($)</label>
               <input
                 type="number"
                 min="0"
                 value={editValues.sale_total ?? ""}
                 onChange={(e) => setEditValues(prev => ({ ...prev, sale_total: e.target.value }))}
                 style={{ width: "100%" }}
               />
             </div>
             <div>
               <label style={{ fontSize: "12px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Abono ($)</label>
               <input
                 type="number"
                 min="0"
                 value={editValues.payment_amount ?? ""}
                 onChange={(e) => setEditValues(prev => ({ ...prev, payment_amount: e.target.value }))}
                 style={{ width: "100%" }}
               />
             </div>
             <div>
               <label style={{ fontSize: "12px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Nuevo saldo</label>
               <p style={{ fontWeight: "600", color: "var(--brand)" }}>
                 {formatMoney(
                   (Number(editValues.previous_balance) || 0) +
                   (Number(editValues.sale_total) || 0) -
                   (Number(editValues.payment_amount) || 0)
                 )}
               </p>
             </div>
             <button
               className="primary"
               onClick={() => {
                 setEditingVisit(null);
                 setEditValues({});
               }}
             >
               Guardar
             </button>
           </div>
         </Modal>
       )}
     </section>
   );
 }
