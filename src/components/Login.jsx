import { useState } from "react";
import { LogIn, Eye, EyeOff, UserCog, User } from "lucide-react";

export function Login({ onLogin, sellers = [] }) {
  const [mode, setMode] = useState(null);
  const [password, setPassword] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  function handleAdmin() {
    if (password === "master9021") {
      onLogin({ role: "admin" });
    } else {
      setError("Contraseña incorrecta");
    }
  }

  function handleSeller() {
    if (!sellerId) { setError("Selecciona un vendedor"); return; }
    const seller = sellers.find(s => s.id === sellerId);
    if (!seller) { setError("Vendedor no encontrado"); return; }
    if (password === (seller.password || "")) {
      onLogin({ role: "seller", sellerId: seller.id, sellerName: seller.name });
    } else {
      setError("Contraseña incorrecta");
    }
  }

  function reset() {
    setMode(null);
    setPassword("");
    setSellerId("");
    setError("");
  }

  if (!mode) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <div className="login-brand">
            <div className="login-logo">CK</div>
            <h1>CobroKits</h1>
            <p>Consignación semanal</p>
          </div>
          <div className="login-buttons">
            <button className="primary login-btn" onClick={() => setMode("admin")}>
              <UserCog size={20} /> Administrador
            </button>
            <button className="login-btn login-btn-seller" onClick={() => setMode("seller")}>
              <User size={20} /> Vendedor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <button className="login-back" onClick={reset}>← Volver</button>
        <div className="login-brand">
          <div className="login-logo" style={{fontSize:'28px',width:'56px',height:'56px'}}>CK</div>
          <h2 style={{margin:'8px 0 4px'}}>{mode === "admin" ? "Administrador" : "Vendedor"}</h2>
        </div>

        {mode === "seller" && (
          <select className="login-select" value={sellerId} onChange={e => { setSellerId(e.target.value); setError(""); }}>
            <option value="">Selecciona tu nombre</option>
            {sellers.filter(s => s.status === "activo").map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <div className="login-pw-wrap">
          <input
            type={showPw ? "text" : "password"}
            className="login-input"
            placeholder="Contraseña"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && (mode === "admin" ? handleAdmin() : handleSeller())}
            autoFocus
          />
          <button className="login-toggle-pw" onClick={() => setShowPw(!showPw)} type="button">
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && <p className="login-error">{error}</p>}

        <button className="primary login-btn" onClick={mode === "admin" ? handleAdmin : handleSeller} style={{marginTop:'8px'}}>
          <LogIn size={18} /> Ingresar
        </button>
      </div>
    </div>
  );
}
