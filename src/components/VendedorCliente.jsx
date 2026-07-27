import { useState } from "react";
import { UserPlus } from "lucide-react";

export function VendedorCliente({ seller, onNewCustomer, onBack }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return;
    setSaving(true);
    try {
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
      const todayDow = d.getDay();

      await onNewCustomer({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim() || null,
        visit_day: todayDow,
        neighborhood: neighborhood.trim() || null,
      });
      if (onBack) onBack();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="seller-form" onSubmit={handleSubmit}>
      <h3 style={{margin:'0 0 8px',fontSize:'1rem',fontWeight:600}}>Nuevo cliente</h3>
      <div className="seller-field">
        <label>Nombre del cliente</label>
        <input placeholder="Nombre completo" value={name} onChange={e => setName(e.target.value)} required autoFocus />
      </div>
      <div className="seller-field">
        <label>Dirección</label>
        <input placeholder="Dirección" value={address} onChange={e => setAddress(e.target.value)} />
      </div>
      <div className="seller-field">
        <label>Teléfono</label>
        <input type="tel" placeholder="Teléfono (opcional)" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <div className="seller-field">
        <label>Observación</label>
        <input placeholder="Nota u observación (opcional)" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
      </div>
      <button className="primary seller-submit" type="submit" disabled={saving || !name.trim()}>
        {saving ? <span className="spinner" /> : <UserPlus size={18} />}
        {saving ? "Guardando..." : "Crear Cliente"}
      </button>
    </form>
  );
}
