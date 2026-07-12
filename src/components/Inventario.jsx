import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, History, Package, FileDown } from "lucide-react";

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "Error de solicitud");
  return data;
}

function formatDate(d) {
  return new Date(d).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Row that expands inline to enter quantity
function ProductRow({ product, onAdded }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) {
      setError("Ingresa una cantidad válida");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/apis/stock", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          quantity: Number(qty),
          notes: notes.trim() || null,
        }),
      });
      setQty("");
      setNotes("");
      setOpen(false);
      onAdded(product.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr
        style={{
          background: open ? "rgba(15,118,110,0.04)" : undefined,
          transition: "background 0.2s",
        }}
      >
        <td style={{ textAlign: "left", fontWeight: 500 }}>
          <Package
            size={14}
            style={{
              verticalAlign: "middle",
              marginRight: "6px",
              color: "var(--brand)",
              opacity: 0.6,
            }}
          />
          {product.name}
        </td>
        <td>
          <strong
            style={{
              fontSize: "1.05rem",
              color: Number(product.quantity) === 0 ? "#dc2626" : "var(--ink)",
            }}
          >
            {product.quantity}
          </strong>
        </td>
        <td>
          <button
            type="button"
            title="Agregar stock"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              border: "none",
              background: open ? "var(--brand-dark)" : "var(--brand)",
              color: "white",
              cursor: "pointer",
              transition: "background 0.2s, transform 0.2s",
              transform: open ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            <Plus size={16} />
          </button>
        </td>
      </tr>

      {/* Inline expansion */}
      {open && (
        <tr style={{ background: "rgba(15,118,110,0.04)" }}>
          <td colSpan={3} style={{ paddingBottom: "12px", paddingTop: "4px" }}>
            <form
              onSubmit={handleAdd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                paddingLeft: "28px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="number"
                min="1"
                placeholder="Cantidad"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
                style={{ width: "100px" }}
                required
              />
              <input
                type="text"
                placeholder="Notas (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: "180px" }}
              />
              <button
                type="submit"
                className="primary"
                disabled={saving}
                style={{ minHeight: "36px", fontSize: "0.85rem", padding: "0 14px" }}
              >
                {saving ? <span className="spinner" /> : <Plus size={14} />}
                {saving ? "Guardando…" : "Confirmar"}
              </button>
              {error && (
                <span style={{ color: "#dc2626", fontSize: "0.82rem" }}>
                  {error}
                </span>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export function Inventario() {
  const [stock, setStock] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedProductName, setSelectedProductName] = useState("todos los productos");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load general stock
  async function loadStock() {
    setLoadingStock(true);
    try {
      const data = await api("/apis/stock");
      setStock(data.stock || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStock(false);
    }
  }

  // Load history for a product (or all)
  const loadHistory = useCallback(async (productId) => {
    setLoadingHistory(true);
    try {
      const url = productId
        ? `/apis/stock/history?productId=${productId}`
        : `/apis/stock/history`;
      const data = await api(url);
      setHistory(data.entries || []);
    } catch (e) {
      console.error(e);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadStock();
    loadHistory(null);
  }, [loadHistory]);

  // Called when a row adds stock
  function handleAdded(productId) {
    loadStock();
    // Switch history to that product
    setSelectedProductId(productId);
    const prod = stock.find((s) => s.id === productId);
    if (prod) setSelectedProductName(prod.name);
    loadHistory(productId);
  }

  function selectProduct(productId, productName) {
    setSelectedProductId(productId);
    setSelectedProductName(productName || "todos los productos");
    loadHistory(productId);
  }

  async function generatePdf() {
    if (generatingPdf || stock.length === 0) return;
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const today = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric", month: "long", day: "numeric",
      }).format(new Date());

      const totalUnits = stock.reduce((s, p) => s + Number(p.quantity), 0);

      // Build PDF content
      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "20px";
      container.style.color = "#1a1a1a";

      container.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #7c3aed; padding-bottom: 16px;">
          <h1 style="margin: 0; font-size: 22px; color: #7c3aed;">CobroKits</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #666;">Consignacion semanal</p>
          <h2 style="margin: 12px 0 0; font-size: 18px;">Inventario General</h2>
          <p style="margin: 4px 0 0; font-size: 12px; color: #666;">${today}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #7c3aed; color: white;">
              <th style="padding: 10px 12px; text-align: left; font-size: 13px;">#</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 13px;">Producto</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 13px;">Stock</th>
            </tr>
          </thead>
          <tbody>
            ${stock.map((p, i) => `
              <tr style="background: ${i % 2 === 0 ? "#f9f9f9" : "#fff"};">
                <td style="padding: 8px 12px; font-size: 12px; color: #666;">${i + 1}</td>
                <td style="padding: 8px 12px; font-size: 13px; font-weight: 500;">${p.name}</td>
                <td style="padding: 8px 12px; text-align: center; font-size: 14px; font-weight: bold; color: ${Number(p.quantity) > 0 ? "#16a34a" : "#dc2626"};">${p.quantity}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr style="background: #f3f0ff; border-top: 2px solid #7c3aed;">
              <td style="padding: 10px 12px; font-weight: bold; font-size: 13px;" colspan="2">Total unidades</td>
              <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-size: 14px; color: #7c3aed;">${totalUnits}</td>
            </tr>
          </tfoot>
        </table>

        <div style="text-align: center; font-size: 10px; color: #999; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px;">
          Generado por CobroKits · ${today}
        </div>
      `;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `inventario-general-${new Date().toISOString().slice(0, 10)}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        })
        .from(container)
        .save();
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(300px, 1fr) minmax(300px, 1.4fr)",
        gap: "14px",
        alignItems: "start",
      }}
    >
      {/* ── LEFT: Products + stock ─────────────── */}
      <div className="panel">
        <div className="panelHead" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2>Inventario General</h2>
            <span>{stock.length}</span>
          </div>
          <button
            className="iconButton"
            onClick={generatePdf}
            disabled={generatingPdf || loadingStock || stock.length === 0}
            title="Descargar PDF"
            style={{ opacity: generatingPdf ? 0.5 : 1 }}
          >
            {generatingPdf ? <span className="spinner" /> : <FileDown size={18} />}
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 12px" }}>
          Haz clic en <Plus size={11} style={{ verticalAlign: "middle" }} /> para
          agregar stock a un producto.
        </p>

        {loadingStock ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  height: "1.1rem",
                  width: `${90 - n * 8}%`,
                  borderRadius: "6px",
                  background:
                    "linear-gradient(90deg,#e5e7e6 25%,#f0f2f0 50%,#e5e7e6 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.4s infinite",
                }}
              />
            ))}
          </div>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Producto</th>
                <th>Stock</th>
                <th>Agregar</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onAdded={handleAdded}
                />
              ))}
              {stock.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--muted)" }}>
                    No hay productos activos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── RIGHT: History ─────────────────────── */}
      <div className="panel">
        <div className="panelHead" style={{ flexWrap: "wrap", gap: "8px" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <History size={16} />
            Historial de ingresos
          </h2>
        </div>

        {/* Filter by product */}
        <div style={{ marginBottom: "12px" }}>
          <select
            value={selectedProductId || ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const name =
                stock.find((s) => s.id === id)?.name || "todos los productos";
              selectProduct(id, name);
            }}
            style={{ width: "100%" }}
          >
            <option value="">Todos los productos</option>
            {stock.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.8rem",
            margin: "0 0 10px",
          }}
        >
          Mostrando: <strong>{selectedProductName}</strong>
        </p>

        {loadingHistory ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  height: "1.1rem",
                  width: `${80 - n * 5}%`,
                  borderRadius: "6px",
                  background:
                    "linear-gradient(90deg,#e5e7e6 25%,#f0f2f0 50%,#e5e7e6 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.4s infinite",
                }}
              />
            ))}
          </div>
        ) : history.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                      {formatDate(entry.created_at)}
                    </td>
                    <td>{entry.product_name}</td>
                    <td>
                      <strong style={{ color: "var(--brand)" }}>
                        +{entry.quantity}
                      </strong>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {entry.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>
            {selectedProductId
              ? "No hay ingresos registrados para este producto."
              : "No hay ingresos registrados aún."}
          </p>
        )}
      </div>
    </div>
  );
}
