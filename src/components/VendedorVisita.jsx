import { useState, useEffect } from "react";
import { MapPin, Plus, Trash2, AlertCircle } from "lucide-react";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function fmt(v) { return money.format(Number(v || 0)); }

export function VendedorVisita({ seller, customers = [], products = [], onVisit }) {

  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [stock, setStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(true);

  const sellerCustomers = customers.filter(c => c.seller_id === seller.sellerId);

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

  function addItem() {
    setError("");
    if (!productId || !quantity || Number(quantity) <= 0) return;
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const available = stock[productId] ?? 0;
    const inCart = items.find(x => x.product_id === productId)?.quantity ?? 0;
    if (available <= 0) {
      setError("No tienes stock disponible de este producto");
      return;
    }
    if (inCart + Number(quantity) > available) {
      setError(`Solo tienes ${available} unidades disponibles de ${p.name}`);
      return;
    }
    setItems(prev => {
      const existing = prev.find(x => x.product_id === productId);
      if (existing) return prev.map(x => x.product_id === productId ? { ...x, quantity: x.quantity + Number(quantity) } : x);
      return [...prev, { product_id: productId, quantity: Number(quantity), name: p.name, price: p.sale_price }];
    });
    setProductId("");
    setQuantity("");
  }

  function removeItem(pid) {
    setItems(prev => prev.filter(x => x.product_id !== pid));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (submitting || !customerId || items.length === 0) return;
    setSubmitting(true);
    try {
      await onVisit({
        seller_id: seller.sellerId,
        customer_id: customerId,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, name: i.name })),
        payment_amount: amount || 0,
        payment_method: method || null,
        notes: notes || null,
      });
      setCustomerId("");
      setItems([]);
      setAmount("");
      setMethod("");
      setNotes("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalSale = items.reduce((s, i) => s + i.quantity * Number(i.price), 0);
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
      <form className="seller-form" onSubmit={handleSubmit}>
        <div className="seller-field">
          <label>Cliente</label>
          <select value={customerId} onChange={e => { setCustomerId(e.target.value); setError(""); }} required>
            <option value="">Selecciona cliente</option>
            {sellerCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name} {c.current_balance > 0 ? `(${fmt(c.current_balance)})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="seller-field">
          <label>Productos</label>
          <div className="seller-row">
            <select value={productId} onChange={e => { setProductId(e.target.value); setError(""); }} style={{flex:1}}>
              <option value="">Producto</option>
              {products.filter(p => (stock[p.id] ?? 0) > 0).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({fmt(p.sale_price)}) — disp: {stock[p.id]}</option>
              ))}
            </select>
            <input type="number" min="1" placeholder="Cant" value={quantity} onChange={e => setQuantity(e.target.value)} style={{width:'70px'}} />
            <button type="button" className="primary" onClick={addItem} style={{padding:'0 12px',height:'42px',minWidth:'42px'}}><Plus size={20} /></button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="seller-items">
            {items.map(i => (
              <div key={i.product_id} className="seller-item">
                <span>{i.name} <strong>x{i.quantity}</strong> = {fmt(i.quantity * Number(i.price))}</span>
                <button type="button" onClick={() => removeItem(i.product_id)} style={{background:'none',border:'none',color:'#ff4444',cursor:'pointer'}}><Trash2 size={16} /></button>
              </div>
            ))}
            <div className="seller-total">Total: {fmt(totalSale)}</div>
          </div>
        )}

        <div className="seller-field">
          <label>Abono</label>
          <input type="number" min="0" placeholder="$0" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="seller-field">
          <label>Método de pago</label>
          <select value={method} onChange={e => setMethod(e.target.value)}>
            <option value="">Selecciona</option>
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
          </select>
        </div>

        <div className="seller-field">
          <label>Observación</label>
          <input placeholder="Nota (opcional)" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button className="primary seller-submit" type="submit" disabled={submitting || !customerId || items.length === 0 || !hasStock}>
          {submitting ? <span className="spinner" /> : <MapPin size={18} />}
          {submitting ? "Guardando..." : "Registrar Visita"}
        </button>
      </form>
    </>
  );
}
