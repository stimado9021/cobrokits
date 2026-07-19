import { useState } from "react";
import { UserPlus } from "lucide-react";

export function VendedorCliente({ seller, onNewCustomer, onBack }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [visitDay, setVisitDay] = useState("6");
  const [neighborhood, setNeighborhood] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onNewCustomer({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim() || null,
        visit_day: Number(visitDay),
        neighborhood: neighborhood.trim() || null,
      });
      if (onBack) onBack();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
        <label>Barrio</label>
        <input placeholder="Barrio (opcional)" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
      </div>
      <div className="seller-field">
        <label>Día de visita</label>
        <select value={visitDay} onChange={e => setVisitDay(e.target.value)}>
          {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </div>
      <button className="primary seller-submit" type="submit" disabled={saving || !name.trim()}>
        {saving ? <span className="spinner" /> : <UserPlus size={18} />}
        {saving ? "Guardando..." : "Crear Cliente"}
      </button>
    </form>
  );
}
