import { useEffect, useMemo, useState } from "react";
import { Edit2, Trash2, UserPlus } from "lucide-react";
import { Modal } from "./Modal";

export function NuevoCliente({
  createCustomer,
  sellers = [],
  activeSellerId,
  customers = [],
  updateCustomer,
  deleteCustomer,
  isSubmitting,
}) {
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedSellerId, setSelectedSellerId] = useState(activeSellerId || "");

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  const sellerCustomers = useMemo(
    () => customers.filter((customer) => customer.seller_id === selectedSellerId),
    [customers, selectedSellerId],
  );

  return (
    <section className="workgrid">
      <form className="panel" onSubmit={createCustomer}>
        <div className="panelHead">
          <h2>Nuevo cliente</h2>
          <UserPlus size={18} />
        </div>

        <label className="field">
          <span>Vendedor</span>
          <select
            name="seller_id"
            value={selectedSellerId}
            onChange={(event) => setSelectedSellerId(event.target.value)}
            required
          >
            <option value="">Selecciona vendedor</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Nombre del cliente</span>
          <input name="name" placeholder="Ej. Maria Perez" required />
        </label>

        <label className="field">
          <span>Direccion</span>
          <input name="address" placeholder="Ej. Calle 10 # 20-30" required />
        </label>

        <label className="field">
          <span>Telefono</span>
          <input name="phone" placeholder="Ej. 3100000000" />
        </label>

        <label className="field">
          <span>Observacion</span>
          <input name="notes" placeholder="Nota u observacion" />
        </label>

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <span className="spinner" /> : <UserPlus size={17} />}
          {isSubmitting ? "Guardando..." : "Crear"}
        </button>
      </form>

      {selectedSellerId && (
        <div className="panel" style={{ gridColumn: "span 2" }}>
          <div className="panelHead">
            <h2>Lista de Clientes</h2>
          </div>
          {sellerCustomers.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Direccion</th>
                  <th>Telefono</th>
                  <th>Observacion</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sellerCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.address}</td>
                    <td>{customer.phone || "-"}</td>
                    <td>{customer.notes || "-"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setEditingCustomer(customer)}
                        className="table-icon-button"
                        title="Editar"
                        disabled={isSubmitting}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomer(customer.id)}
                        className="table-icon-button danger"
                        title="Eliminar"
                        disabled={isSubmitting}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No hay clientes para el vendedor seleccionado.</p>
          )}
        </div>
      )}

      {editingCustomer && (
        <Modal title="Editar Cliente" onClose={() => setEditingCustomer(null)}>
          <form
            className="field"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await updateCustomer(editingCustomer.id, {
                name: form.get("name"),
                address: form.get("address"),
                phone: form.get("phone"),
                notes: form.get("notes"),
              });
              setEditingCustomer(null);
            }}
          >
            <label className="field">
              <span>Nombre del cliente</span>
              <input name="name" defaultValue={editingCustomer.name} placeholder="Nombre" required />
            </label>
            <label className="field">
              <span>Direccion</span>
              <input
                name="address"
                defaultValue={editingCustomer.address}
                placeholder="Direccion"
                required
              />
            </label>
            <label className="field">
              <span>Telefono</span>
              <input name="phone" defaultValue={editingCustomer.phone || ""} placeholder="Telefono" />
            </label>
            <label className="field">
              <span>Observacion</span>
              <input
                name="notes"
                defaultValue={editingCustomer.notes || ""}
                placeholder="Observacion"
              />
            </label>
            <button type="submit" className="primary" style={{ marginTop: "10px" }} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
