import { useState, useEffect } from "react";
import { MapPin, Plus, Trash2, AlertCircle } from "lucide-react";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function fmt(v) { return money.format(Number(v || 0)); }

function hoyColombiaDow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return d.getDay();
}

export function VendedorVisita({ seller, customers = [], products = [], onVisit, cobroIds = [] }) {

  const [customerId, setCustomerId] = useState("");
  const [deliveryQuantities, setDeliveryQuantities] = useState({});
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stock, setStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(true);

  const todayDow = hoyColombiaDow();
  const sellerCustomers = customers.filter(c => c.cobro_id && cobroIds.includes(c.cobro_id) && c.visit_day === todayDow);

  useEffect(() => {
    let cancelled = false;
    async function loadStock() {
      setLoadingStock(true);
      try {
        const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
        const res = await fetch(`/apis/daily-stock?sellerId=${seller.sellerId}&stockDate=${hoy}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          const map = {};
          for (const item of data.items) {
            const avail = Number(item.quantity_delivered) - Number(item.quantity_sold);
            map[item.product_id] = avail;
          }
          setStock(map);
        }
      } catch {} finally {
        if (!cancelled) setLoadingStock(false);
      }
    }
    loadStock();
    return () => { cancelled = true; };
  }, [seller.sellerId]);

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
    const available = stock[productId] ?? 0;
    if (qty > available) {
      setError(`Stock insuficiente: solo hay ${available} unidades`);
      return;
    }
    setError("");
    setDeliveryQuantities(prev => ({ ...prev, [productId]: qty }));
  }

  const hasItems = Object.keys(deliveryQuantities).length > 0;
  const canSubmit = customerId && (hasItems || (amount && Number(amount) > 0));

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const itemsPayload = Object.entries(deliveryQuantities).map(([product_id, quantity]) => {
        const p = products.find(x => x.id === product_id);
        return { product_id, quantity, name: p?.name || "" };
      });

      await onVisit({
        seller_id: seller.sellerId,
        customer_id: customerId,
        items: itemsPayload,
        payment_amount: amount || 0,
        payment_method: method || null,
        notes: notes || null,
      });
      setCustomerId("");
      setDeliveryQuantities({});
      setAmount("");
      setMethod("efectivo");
      setNotes("");
      setSuccess("Visita registrada con éxito");
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      const res = await fetch(`/apis/daily-stock?sellerId=${seller.sellerId}&stockDate=${hoy}`);
      const data = await res.json();
      if (data.success) {
        const map = {};
        for (const item of data.items) {
          map[item.product_id] = Number(item.quantity_delivered) - Number(item.quantity_sold);
        }
        setStock(map);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalSale = Object.entries(deliveryQuantities).reduce((s, [pid, qty]) => {
    const p = products.find(x => x.id === pid);
    return s + qty * Number(p?.sale_price || 0);
  }, 0);
  const hasStock = Object.keys(stock).length > 0;

  return (
    <>
      {!loadingStock && !hasStock && (
        <div className="seller-notice-warn">
          <AlertCircle size={16} />
          No tienes inventario asignado para hoy. Pídele al administrador que te entregue stock.
        </div>
      )}
      {error && <div className="seller-notice-error">{error}</div>}
      {success && <div className="seller-notice-success">{success}</div>}
      <form className="seller-form" onSubmit={handleSubmit}>
        <div className="seller-field">
          <label>Cliente</label>
          <select value={customerId} onChange={e => { setCustomerId(e.target.value); setError(""); }} required>
            <option value="">Selecciona cliente</option>
            {sellerCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name.toUpperCase()} {c.current_balance > 0 ? `(${fmt(c.current_balance)})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="seller-field" style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
          <table className="dataTable" style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 8px", textAlign: "left", fontSize: "11px", color: "var(--brand)", textTransform: "uppercase" }}>Producto</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px", color: "var(--brand)", textTransform: "uppercase" }}>Stock</th>
                <th style={{ padding: "4px 8px", textAlign: "center", fontSize: "11px", color: "var(--brand)", textTransform: "uppercase" }}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const available = stock[p.id] ?? 0;
                const remaining = available - (deliveryQuantities[p.id] || 0);
                return (
                  <tr key={p.id}>
                    <td style={{ padding: "6px 8px", fontSize: "12px", borderBottom: "1px solid var(--line-light)" }}>{p.name.toUpperCase()}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: "bold", fontSize: "12px", borderBottom: "1px solid var(--line-light)", color: remaining < available ? "var(--red)" : undefined }}>{remaining}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid var(--line-light)" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={deliveryQuantities[p.id] || ""}
                        onChange={(e) => updateDeliveryQty(p.id, e.target.value)}
                        style={{ width: "60px", textAlign: "center", padding: "4px 6px", fontSize: "12px", minHeight: "28px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}
                        disabled={remaining === 0 && !deliveryQuantities[p.id]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalSale > 0 && (
          <div className="seller-total" style={{textAlign:"right", padding:"10px 0", fontWeight:"bold"}}>
            Total: {fmt(totalSale)}
          </div>
        )}

        <div className="seller-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "center", marginBottom: "14px", marginTop: "14px" }}>
          <input
            type="number"
            min="0"
            placeholder="$ Abono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%", fontSize: "13px" }}
          />
          <div style={{ display: "flex", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--brand)" }}>
            <button
              type="button"
              onClick={() => setMethod("efectivo")}
              style={{
                flex: 1,
                padding: "7px 0",
                border: "none",
                background: method === "efectivo" ? "var(--brand)" : "var(--surface-2)",
                color: method === "efectivo" ? "#fff" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: method === "efectivo" ? "700" : "500",
                transition: "all 0.25s",
              }}
            >
              Efectivo
            </button>
            <div style={{ width: "1px", background: "var(--line)" }} />
            <button
              type="button"
              onClick={() => setMethod("nequi")}
              style={{
                flex: 1,
                padding: "7px 0",
                border: "none",
                background: method === "nequi" ? "var(--brand)" : "var(--surface-2)",
                color: method === "nequi" ? "#fff" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: method === "nequi" ? "700" : "500",
                transition: "all 0.25s",
              }}
            >
              Nequi
            </button>
          </div>
        </div>

        <div className="seller-field">
          <input placeholder="Nota (opcional)" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button className="primary seller-submit" type="submit" disabled={submitting || !canSubmit}>
          {submitting ? <span className="spinner" /> : <MapPin size={18} />}
          {submitting ? "Guardando..." : "Registrar Visita"}
        </button>
      </form>
    </>
  );
}
