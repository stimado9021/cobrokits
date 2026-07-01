import { ClipboardList, PackagePlus, Save } from "lucide-react";

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
  visits = [],
  activeSellerName = "Todos los vendedores",
}) {
  const sellerVisits = visits
    .filter((visit) => !activeSellerId || visit.seller_id === activeSellerId)
    .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));

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
        <select name="customer_id" required>
          <option value="">Cliente</option>
          {activeCustomers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} - {formatMoney(customer.current_balance)}
            </option>
          ))}
        </select>
        <div className="row">
          <select value={currentProductId} onChange={e => setCurrentProductId(e.target.value)}>
            <option value="">Producto dejado</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <input value={currentQuantity} onChange={e => setCurrentQuantity(e.target.value)} type="number" min="0" placeholder="Cant." style={{width: "70px"}} />
          <button type="button" className="iconButton" onClick={addVisitItem} title="Agregar a la visita" disabled={isSubmitting}>
            <PackagePlus size={18} />
          </button>
        </div>
        {visitItems.length > 0 && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px', fontSize: '0.9rem', padding: '8px', background: 'var(--color-bg-alt, #f5f5f5)', borderRadius: '4px'}}>
            {visitItems.map(item => (
              <div key={item.product_id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span>{item.quantity}x {item.name}</span>
                <button type="button" onClick={() => removeVisitItem(item.product_id)} style={{background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer'}}>✕</button>
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
          <table className="visitas-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Venta</th>
                <th>Abono</th>
              </tr>
            </thead>
            <tbody>
              {sellerVisits.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-cell">Sin visitas registradas</td>
                </tr>
              ) : (
                sellerVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <strong>{visit.customer_name}</strong>
                      <span>
                        {new Date(visit.visit_date).toLocaleDateString("es-CO")} ·{" "}
                        {visit.products_summary || "Sin producto nuevo"}
                      </span>
                    </td>
                    <td className="money-cell">{formatMoney(visit.sale_total)}</td>
                    <td className="money-cell">{formatMoney(visit.payment_total)}</td>
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
