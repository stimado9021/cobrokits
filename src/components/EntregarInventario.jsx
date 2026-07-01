import { useEffect, useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";

function toLocalISODate(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

export function EntregarInventario({
  deliverInventory,
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
  const [todayMovements, setTodayMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const todayDate = useMemo(() => toLocalISODate(new Date()), []);

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  useEffect(() => {
    if (!selectedSellerId || isSubmitting) return;

    let cancelled = false;

    async function loadTodayMovements() {
      setMovementsLoading(true);
      try {
        const params = new URLSearchParams({
          sellerId: selectedSellerId,
          date: todayDate,
        });
        const response = await fetch(`/apis/inventory/movements?${params.toString()}`);
        const data = await response.json();
        if (!cancelled && data.success) {
          setTodayMovements(data.movements || []);
        }
      } catch {
        if (!cancelled) setTodayMovements([]);
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    }

    loadTodayMovements();

    return () => {
      cancelled = true;
    };
  }, [isSubmitting, selectedSellerId, todayDate]);

  const busy = isSubmitting;
  const selectedSellerName = useMemo(
    () => sellers.find((seller) => seller.id === selectedSellerId)?.name || "vendedor",
    [sellers, selectedSellerId],
  );
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date()),
    [],
  );
  const todayDeliveryRows = useMemo(() => {
    const rowsByProduct = new Map();

    todayMovements.forEach((movement) => {
      const existing = rowsByProduct.get(movement.product_id);
      const quantity = Number(movement.quantity || 0);
      const salePrice = Number(movement.unit_sale_price || 0);

      rowsByProduct.set(movement.product_id, {
        id: movement.product_id,
        product_id: movement.product_id,
        product_name: movement.product_name,
        quantity: (existing?.quantity || 0) + quantity,
        sale_price: salePrice || existing?.sale_price || 0,
        sold_quantity: existing?.sold_quantity ?? Number(movement.sold_quantity || 0),
        sold_total: existing?.sold_total ?? Number(movement.sold_total || 0),
      });
    });

    deliveryItems.forEach((item) => {
      const product = products.find((current) => current.id === item.product_id);
      const existing = rowsByProduct.get(item.product_id);
      const quantity = Number(item.quantity || 0);

      if (existing) {
        rowsByProduct.set(item.product_id, {
          ...existing,
          quantity: existing.quantity + quantity,
        });
        return;
      }

      rowsByProduct.set(item.product_id, {
        id: `pending-${item.product_id}`,
        product_id: item.product_id,
        product_name: item.name,
        quantity,
        sale_price: Number(product?.sale_price || 0),
        sold_quantity: 0,
        sold_total: 0,
      });
    });

    return Array.from(rowsByProduct.values())
      .map((item) => ({
        ...item,
        remaining_quantity: Math.max(Number(item.quantity || 0) - Number(item.sold_quantity || 0), 0),
      }))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [deliveryItems, products, todayMovements]);

  return (
    <section className="workgrid">
      <form className="panel" onSubmit={deliverInventory}>
        <div className="panelHead">
          <h2>Entregar inventario</h2>
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
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <input
            value={currentDeliveryQuantity}
            onChange={(event) => setCurrentDeliveryQuantity(event.target.value)}
            type="number"
            min="0"
            placeholder="Cant."
            style={{ width: "70px" }}
          />
          <button
            type="button"
            className="iconButton"
            onClick={addDeliveryItem}
            title="Agregar al inventario"
            disabled={busy}
          >
            <PackagePlus size={18} />
          </button>
        </div>
        {deliveryItems.length > 0 && (
          <div className="pending-items">
            {deliveryItems.map((item) => (
              <div key={item.product_id} className="pending-item">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeDeliveryItem(item.product_id)}
                  className="text-danger-button"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : <PackagePlus size={17} />}
          {busy ? "Entregando..." : "Entregar"}
        </button>
      </form>

      {selectedSellerId && (
        <div className="panel inventory-preview-panel">
          <div className="panelHead inventory-day-head">
            <h2>
              Entregas de hoy para <span>{selectedSellerName}</span>
            </h2>
            <strong>{todayLabel}</strong>
          </div>
          {movementsLoading ? (
            <p>Cargando entregas de hoy...</p>
          ) : todayDeliveryRows.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad entregada</th>
                  <th>Stock restante</th>
                  <th>Producto vendido</th>
                  <th>Total vendido</th>
                  <th>Precio unidad</th>
                  <th>Total entregado</th>
                </tr>
              </thead>
              <tbody>
                {todayDeliveryRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.remaining_quantity}</td>
                    <td>{item.sold_quantity}</td>
                    <td>{formatMoney(item.sold_total)}</td>
                    <td>{formatMoney(item.sale_price)}</td>
                    <td>{formatMoney(item.quantity * item.sale_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No hay entregas de productos registradas hoy para este vendedor.</p>
          )}
        </div>
      )}

    </section>
  );
}
