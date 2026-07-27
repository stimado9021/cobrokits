import { useState } from "react";
import { Trash2, AlertCircle, RefreshCcw } from "lucide-react";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function fmt(v) { return money.format(Number(v || 0)); }

export function VendedorVentas({ seller, visits = [], onRefresh }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  
  // Filter visits from today for this seller
  const sellerVisits = visits.filter(v => v.seller_id === seller.sellerId && (v.visit_date?.startsWith(hoy) || v.visit_date === hoy));

  async function togglePaid(visit) {
    if (processing) return;
    setProcessing(true);
    setError("");
    try {
      const res = await fetch("/apis/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visit.id, is_paid: !visit.is_paid })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Error al actualizar estado");
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function deleteVisit(visit) {
    if (processing) return;
    if (!confirm(`¿Estás seguro de eliminar la venta a ${visit.customer_name}? Esto devolverá los productos a tu inventario y revertirá la deuda.`)) return;
    
    setProcessing(true);
    setError("");
    try {
      const res = await fetch(`/apis/visits?id=${visit.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Error al eliminar venta");
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="seller-ventas">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", padding: "0 4px" }}>
        <h2 style={{ fontSize: "18px", margin: 0 }}>Ventas de hoy</h2>
        <button onClick={onRefresh} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", padding: "4px" }} disabled={processing}>
          <RefreshCcw size={18} className={processing ? "spin" : ""} />
        </button>
      </div>

      {error && <div className="seller-notice-error" style={{ marginBottom: "16px" }}><AlertCircle size={16} /> {error}</div>}

      {sellerVisits.length === 0 ? (
        <p style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>No hay ventas registradas hoy</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {sellerVisits.map(v => (
            <div key={v.id} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "18px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.3px" }}>{v.customer_name}</strong>
                <button onClick={() => deleteVisit(v)} disabled={processing} style={{ background: "rgba(239, 68, 68, 0.08)", border: "none", color: "var(--red)", cursor: "pointer", padding: "8px", borderRadius: "50%", display: "flex", transition: "background 0.2s" }} title="Eliminar Venta">
                  <Trash2 size={15} />
                </button>
              </div>
              
              {v.products_summary ? (
                <div style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: "1.6", background: "var(--surface-2)", padding: "10px 12px", borderRadius: "var(--r-sm)" }}>
                  {v.products_summary.split(", ").map((item, i) => (
                    <div key={i} style={{ padding: "2px 0" }}>{item}</div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "var(--muted)", fontStyle: "italic", background: "var(--surface-2)", padding: "10px 12px", borderRadius: "var(--r-sm)" }}>
                  Solo abono registrado
                </div>
              )}
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div style={{ background: "var(--surface-2)", padding: "12px", borderRadius: "var(--r-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "4px" }}>Abono</div>
                  <div style={{ fontWeight: "600", color: "var(--green)", fontSize: "15px" }}>{fmt(v.payment_total)}</div>
                </div>
                <div style={{ background: "var(--surface-2)", padding: "12px", borderRadius: "var(--r-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "4px" }}>Deuda Restante</div>
                  <div style={{ fontWeight: "600", color: "var(--brand)", fontSize: "15px" }}>{fmt(v.new_balance)}</div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid", borderColor: v.is_paid ? "var(--brand)" : "var(--red)", width: "170px" }}>
                  <button
                    onClick={() => togglePaid(v)}
                    disabled={processing}
                    style={{
                      flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: "12px", transition: "all 0.25s",
                      background: !v.is_paid ? "var(--red)" : "var(--surface)",
                      color: !v.is_paid ? "#fff" : "var(--red)",
                      fontWeight: !v.is_paid ? "700" : "500"
                    }}
                  >
                    Debe
                  </button>
                  <button
                    onClick={() => togglePaid(v)}
                    disabled={processing}
                    style={{
                      flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: "12px", transition: "all 0.25s",
                      background: v.is_paid ? "var(--brand)" : "var(--surface)",
                      color: v.is_paid ? "#fff" : "var(--brand)",
                      fontWeight: v.is_paid ? "700" : "500"
                    }}
                  >
                    Cancelado
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
