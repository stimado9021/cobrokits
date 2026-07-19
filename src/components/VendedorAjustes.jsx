import { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";

export function VendedorAjustes({ seller }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!currentPw || !newPw) { setError("Completa todos los campos"); return; }
    if (newPw.length < 4) { setError("La contraseña debe tener al menos 4 caracteres"); return; }
    setSaving(true);
    try {
      const res = await fetch("/apis/sellers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seller.sellerId, password: newPw, current_password: currentPw }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Error al cambiar contraseña");
      setCurrentPw("");
      setNewPw("");
      setMsg("Contraseña cambiada exitosamente");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seller-form">
      <h3 style={{margin:'0 0 12px',fontSize:'1rem',fontWeight:600}}>Cambiar contraseña</h3>
      {error && <div style={{padding:'10px 14px',background:'var(--red-dim)',borderRadius:'var(--r-sm)',color:'var(--red)',fontSize:'0.82rem',marginBottom:'10px'}}>{error}</div>}
      {msg && <div style={{padding:'10px 14px',background:'var(--green-dim)',borderRadius:'var(--r-sm)',color:'var(--green)',fontSize:'0.82rem',display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}><Check size={16} />{msg}</div>}
      <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
        <div className="seller-field">
          <label>Contraseña actual</label>
          <input type={showPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Ingresa tu contraseña actual" />
        </div>
        <div className="seller-field">
          <label>Nueva contraseña</label>
          <div style={{position:'relative'}}>
            <input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nueva contraseña" style={{width:'100%',padding:'12px',borderRadius:'var(--r-sm)',border:'1px solid var(--line-strong)',background:'var(--surface)',color:'var(--ink)',fontSize:'0.95rem',paddingRight:'40px'}} />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </div>
        <button className="primary seller-submit" type="submit" disabled={saving}>
          {saving ? <span className="spinner" /> : null}
          {saving ? "Guardando..." : "Cambiar Contraseña"}
        </button>
      </form>
    </div>
  );
}
