import { useEffect, useMemo, useState } from "react";
import { Edit2, Trash2, UserPlus } from "lucide-react";
import { Modal } from "./Modal";

// Helper to convert day number to name
function dayName(dayNum) {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[dayNum] ?? "—";
}

export function NuevoCliente({
  createCustomer,
  sellers = [],
  activeSellerId,
  customers = [],
  updateCustomer,
  deleteCustomer,
  isSubmitting,
  loading = false,
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

        <label className="field">
          <span>Día de visita (0=Dom, 1=Lun... 6=Sab)</span>
          <select name="visit_day">
            <option value="">Sin día fijo</option>
            <option value={0}>Domingo</option>
            <option value={1}>Lunes</option>
            <option value={2}>Martes</option>
            <option value={3}>Miércoles</option>
            <option value={4}>Jueves</option>
            <option value={5}>Viernes</option>
            <option value={6}>Sábado</option>
          </select>
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
          {loading ? (
            <table className="dataTable skel-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Direccion</th>
                  <th>Telefono</th>
                  <th>Día visita</th>
                  <th>Observacion</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[1,2,3,4].map(n => (
                  <tr key={`skel-${n}`}>
                    <td><div className="skel skel-line" style={{width:'75%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'50%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'50px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'40%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : sellerCustomers.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Direccion</th>
                  <th>Telefono</th>
                  <th>Día visita</th>
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
                    <td>{customer.visit_day !== null && customer.visit_day !== undefined ? dayName(Number(customer.visit_day)) : "—"}</td>
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
            <label className="field">
              <span>Día de visita (0=Dom, 1=Lun... 6=Sab)</span>
              <select name="visit_day" defaultValue={editingCustomer.visit_day ?? ""}>
                <option value="">Sin día fijo</option>
                <option value={0}>Domingo</option>
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miércoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sábado</option>
              </select>
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
