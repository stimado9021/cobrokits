import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText, UserPlus, PackagePlus, Edit2, Trash2 } from "lucide-react";
import { Modal } from "./Modal";

function dayName(dayNum) {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[dayNum] ?? "—";
}

const fmt = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

export function Configuracion({ createSeller, createProduct, sellers, products, updateSeller, deleteSeller, updateProduct, deleteProduct, createCustomer, customers = [], activeSellerId, updateCustomer, deleteCustomer, isSubmitting, loading = false }) {
  const [openSection, setOpenSection] = useState("sellers");
  const [editingSeller, setEditingSeller] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showAddSeller, setShowAddSeller] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState(activeSellerId || "");
  const [generating, setGenerating] = useState(null);

  const today = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric", month: "long", day: "numeric",
  }).format(new Date());

  function toggleSection(name) {
    setOpenSection(prev => prev === name ? null : name);
  }

  const accordionHead = (name, label, count, onAdd, addIcon) => (
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 12px 0'}}>
      <div onClick={() => toggleSection(name)} style={{cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flex: 1, userSelect: 'none'}}>
        <h2 style={{margin: 0, fontSize: '1rem'}}>{label} <span style={{fontSize:'0.75rem', color:'var(--ink)', fontWeight:400}}>({count})</span></h2>
        <ChevronDown size={16} style={{transform: openSection === name ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--ink)'}} />
      </div>
      <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="primary" style={{height:'30px', padding:'0 10px', display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.78rem'}}>
        {addIcon} Agregar
      </button>
    </div>
  );

  const exportButtons = (key, label, data, cols) => (
    <div style={{display:'flex', gap:'6px', justifyContent:'flex-end', marginTop:'10px'}}>
      <button onClick={() => exportPdf(key, label, data, cols)} disabled={generating === key+'-pdf'} style={{height:'30px', padding:'0 10px', display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.78rem', border:'1px solid var(--line-strong)', borderRadius:'var(--r-sm)', background:'var(--surface-2)', color:'var(--ink)', cursor:'pointer'}}>
        {generating === key+'-pdf' ? <span className="spinner" style={{width:'14px',height:'14px'}} /> : <FileText size={14} />}
        {generating === key+'-pdf' ? "Generando..." : "PDF"}
      </button>
      <button onClick={() => exportExcel(key, label, data, cols)} disabled={generating === key+'-xls'} style={{height:'30px', padding:'0 10px', display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.78rem', border:'1px solid var(--line-strong)', borderRadius:'var(--r-sm)', background:'var(--surface-2)', color:'var(--ink)', cursor:'pointer'}}>
        {generating === key+'-xls' ? <span className="spinner" style={{width:'14px',height:'14px'}} /> : <FileSpreadsheet size={14} />}
        {generating === key+'-xls' ? "Generando..." : "Excel"}
      </button>
    </div>
  );

  const exportPdf = useCallback(async (key, label, data, cols) => {
    if (generating || data.length === 0) return;
    setGenerating(key+'-pdf');
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const container = document.createElement("div");
      container.style.fontFamily = "Arial, sans-serif";
      container.style.padding = "20px";
      container.style.color = "#1a1a1a";

      let rows = data.map((item, i) => {
        const cells = cols.map(c => {
          let val = item[c.key];
          if (c.fmt) val = c.fmt(val);
          return `<td style="padding:6px 10px;font-size:12px;border:1px solid #d1d5db;${c.align ? 'text-align:'+c.align:''}">${val ?? '-'}</td>`;
        }).join('');
        return `<tr style="background:${i%2===0?'#f9f9f9':'#fff'}">${cells}</tr>`;
      }).join('');

      const headers = cols.map(c => `<th style="padding:8px 10px;font-size:12px;background:#7c3aed;color:#fff;border:1px solid #5b21b6;${c.align?'text-align:'+c.align:''}">${c.label}</th>`).join('');

      container.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #7c3aed;padding-bottom:12px;">
          <h1 style="margin:0;font-size:20px;color:#7c3aed;">CobroKits</h1>
          <p style="margin:4px 0 0;font-size:11px;color:#666;">${label}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#666;">${today}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">${headers}${rows}</table>
        <div style="text-align:center;font-size:10px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:8px;">Generado por CobroKits · ${today}</div>
      `;

      await html2pdf().set({
        margin: [10,10,10,10],
        filename: `${key}-${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "letter", orientation: "landscape" },
      }).from(container).save();
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setGenerating(null);
    }
  }, [generating, today]);

  const exportExcel = useCallback((key, label, data, cols) => {
    if (generating || data.length === 0) return;
    setGenerating(key+'-xls');
    try {
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${label}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px;}th{background:#7c3aed;color:#fff;padding:6px 8px;border:1px solid #5b21b6;font-weight:bold;}td{padding:5px 8px;border:1px solid #d1d5db;}</style></head><body>
        <h2 style="font-family:Arial;color:#7c3aed;">CobroKits - ${label}</h2>
        <p style="font-family:Arial;font-size:12px;">${today}</p>
        <table><thead><tr>${cols.map(c => `<th style="${c.align?'text-align:'+c.align:''}">${c.label}</th>`).join('')}</tr></thead><tbody>`;

      data.forEach((item, i) => {
        const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
        html += `<tr style="background:${bg};">${cols.map(c => {
          let val = item[c.key];
          if (c.fmt) val = c.fmt(val);
          return `<td style="${c.align?'text-align:'+c.align:''}">${val ?? '-'}</td>`;
        }).join('')}</tr>`;
      });

      html += `</tbody></table><p style="font-family:Arial;font-size:10px;color:#999;margin-top:8px;">Generado por CobroKits · ${today}</p></body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${key}-${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating Excel:", err);
    } finally {
      setGenerating(null);
    }
  }, [generating, today]);

  useEffect(() => {
    setSelectedSellerId(activeSellerId || "");
  }, [activeSellerId]);

  const sellerCustomers = useMemo(
    () => customers.filter((customer) => customer.seller_id === selectedSellerId),
    [customers, selectedSellerId],
  );

  const sellerCols = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono', fmt: v => v || '-' },
    { key: 'status', label: 'Estado' },
  ];

  const productCols = [
    { key: 'name', label: 'Nombre' },
    { key: 'investment_cost', label: 'Costo', fmt: v => fmt(v) },
    { key: 'sale_price', label: 'PVP', fmt: v => fmt(v) },
  ];

  const customerCols = [
    { key: 'name', label: 'Nombre' },
    { key: 'address', label: 'Dirección' },
    { key: 'phone', label: 'Teléfono', fmt: v => v || '-' },
    { key: 'visit_day', label: 'Día visita', fmt: v => v != null ? dayName(Number(v)) : '—' },
    { key: 'notes', label: 'Observación', fmt: v => v || '-' },
  ];

  return (
    <section style={{display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px'}}>
      <div className="panel" style={{width: '100%'}}>
        {accordionHead('sellers', 'Vendedor', sellers.length, () => setShowAddSeller(true), <UserPlus size={14} />)}
        {openSection === 'sellers' && <>
        <table className="dataTable skel-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3].map(n => (
                <tr key={`skel-s-${n}`}>
                  <td><div className="skel skel-line" style={{width:'70%'}} /></td>
                  <td><div className="skel skel-line" style={{width:'55%'}} /></td>
                  <td><div className="skel skel-line" style={{width:'50px'}} /></td>
                  <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                </tr>
              ))
            ) : sellers.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.phone || '-'}</td>
                <td>{s.status}</td>
                <td>
                  <button type="button" onClick={() => setEditingSeller(s)} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', marginRight: '10px'}} title="Editar" disabled={isSubmitting}>
                    <Edit2 size={16} />
                  </button>
                  <button type="button" onClick={() => deleteSeller(s.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444'}} title="Eliminar" disabled={isSubmitting}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sellers.length > 0 && exportButtons('vendedores', 'Vendedores', sellers, sellerCols)}
        </>}
      </div>

      <div className="panel" style={{width: '100%'}}>
        {accordionHead('products', 'Producto', products.length, () => setShowAddProduct(true), <PackagePlus size={14} />)}
        {openSection === 'products' && <>
        <table className="dataTable skel-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Costo</th>
              <th>PVP</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3].map(n => (
                <tr key={`skel-p-${n}`}>
                  <td><div className="skel skel-line" style={{width:'70%'}} /></td>
                  <td><div className="skel skel-line" style={{width:'50px'}} /></td>
                  <td><div className="skel skel-line" style={{width:'50px'}} /></td>
                  <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                </tr>
              ))
            ) : products.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{fmt(p.investment_cost)}</td>
                <td>{fmt(p.sale_price)}</td>
                <td>
                  <button type="button" onClick={() => setEditingProduct(p)} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', marginRight: '10px'}} title="Editar" disabled={isSubmitting}>
                    <Edit2 size={16} />
                  </button>
                  <button type="button" onClick={() => deleteProduct(p.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444'}} title="Eliminar" disabled={isSubmitting}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length > 0 && exportButtons('productos', 'Productos', products, productCols)}
        </>}
      </div>

      <div className="panel" style={{width: '100%'}}>
        {accordionHead('customers', 'Cliente', customers.length, () => setShowAddCustomer(true), <UserPlus size={14} />)}
        {openSection === 'customers' && <>
        <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px'}}>
          <label style={{fontSize:'0.78rem', color:'var(--ink)', fontWeight:500, whiteSpace:'nowrap'}}>Vendedor:</label>
          <select value={selectedSellerId} onChange={(e) => setSelectedSellerId(e.target.value)} style={{width:'auto', minHeight:'34px', color:'var(--ink)'}}>
            <option value="">Todos</option>
            {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {selectedSellerId ? (
          <table className="dataTable skel-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>Teléfono</th>
                <th>Día visita</th>
                <th>Observación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3].map(n => (
                  <tr key={`skel-c-${n}`}>
                    <td><div className="skel skel-line" style={{width:'70%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'50%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'50px'}} /></td>
                    <td><div className="skel skel-line" style={{width:'40%'}} /></td>
                    <td><div className="skel skel-line" style={{width:'60px'}} /></td>
                  </tr>
                ))
              ) : sellerCustomers.length > 0 ? sellerCustomers.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.address}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.visit_day !== null && c.visit_day !== undefined ? dayName(Number(c.visit_day)) : "—"}</td>
                  <td>{c.notes || '-'}</td>
                  <td>
                    <button type="button" onClick={() => setEditingCustomer(c)} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', marginRight: '10px'}} title="Editar" disabled={isSubmitting}>
                      <Edit2 size={16} />
                    </button>
                    <button type="button" onClick={() => deleteCustomer(c.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444'}} title="Eliminar" disabled={isSubmitting}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} style={{textAlign: 'center', padding: '20px', color: 'var(--ink)'}}>No hay clientes para el vendedor seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <p style={{textAlign:'center', padding:'20px', color:'var(--ink)'}}>Selecciona un vendedor para ver sus clientes.</p>
        )}
        {sellerCustomers.length > 0 && exportButtons('clientes', 'Clientes', sellerCustomers, customerCols)}
        </>}
      </div>

      {showAddSeller && (
        <Modal title="Agregar Vendedor" onClose={() => setShowAddSeller(false)}>
          <form className="field" onSubmit={(e) => { createSeller(e); setShowAddSeller(false); }}>
            <input name="name" placeholder="Nombre del vendedor" required />
            <input name="phone" placeholder="Teléfono" />
            <input name="password" type="text" placeholder="Contraseña" />
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </Modal>
      )}

      {showAddProduct && (
        <Modal title="Agregar Producto" onClose={() => setShowAddProduct(false)}>
          <form className="field" onSubmit={(e) => { createProduct(e); setShowAddProduct(false); }}>
            <input name="name" placeholder="Nombre del producto" required />
            <input name="investment_cost" type="number" min="0" placeholder="Costo unitario" required />
            <input name="sale_price" type="number" min="0" placeholder="PVP (precio venta)" required />
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </Modal>
      )}

      {showAddCustomer && (
        <Modal title="Agregar Cliente" onClose={() => setShowAddCustomer(false)}>
          <form className="field" onSubmit={(e) => { createCustomer(e); setShowAddCustomer(false); }}>
            <select name="seller_id" required style={{color:'var(--ink)'}}>
              <option value="">Selecciona vendedor</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input name="name" placeholder="Nombre del cliente" required />
            <input name="address" placeholder="Dirección" required />
            <input name="phone" placeholder="Teléfono" />
            <input name="notes" placeholder="Observación" />
            <select name="visit_day" style={{color:'var(--ink)'}}>
              <option value="">Sin día fijo</option>
              <option value={0}>Domingo</option>
              <option value={1}>Lunes</option>
              <option value={2}>Martes</option>
              <option value={3}>Miércoles</option>
              <option value={4}>Jueves</option>
              <option value={5}>Viernes</option>
              <option value={6}>Sábado</option>
            </select>
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </Modal>
      )}

      {editingCustomer && (
        <Modal title="Editar Cliente" onClose={() => setEditingCustomer(null)}>
          <form
            className="field"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const form = new FormData(e.currentTarget);
                await updateCustomer(editingCustomer.id, {
                  name: form.get("name"),
                  address: form.get("address"),
                  phone: form.get("phone"),
                  notes: form.get("notes"),
                  visit_day: form.get("visit_day") !== "" ? form.get("visit_day") : null,
                });
                setEditingCustomer(null);
              } catch {}
            }}
          >
            <input name="name" defaultValue={editingCustomer.name} placeholder="Nombre" required />
            <input name="address" defaultValue={editingCustomer.address} placeholder="Dirección" required />
            <input name="phone" defaultValue={editingCustomer.phone || ""} placeholder="Teléfono" />
            <input name="notes" defaultValue={editingCustomer.notes || ""} placeholder="Observación" />
            <select name="visit_day" defaultValue={editingCustomer.visit_day ?? ""} style={{color:'var(--ink)'}}>
              <option value="">Sin día fijo</option>
              <option value={0}>Domingo</option>
              <option value={1}>Lunes</option>
              <option value={2}>Martes</option>
              <option value={3}>Miércoles</option>
              <option value={4}>Jueves</option>
              <option value={5}>Viernes</option>
              <option value={6}>Sábado</option>
            </select>
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </button>
          </form>
        </Modal>
      )}

      {editingSeller && (
        <Modal title="Editar Vendedor" onClose={() => setEditingSeller(null)}>
          <form
            className="field"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const form = new FormData(e.currentTarget);
                await updateSeller(editingSeller.id, {
                  name: form.get('name'),
                  phone: form.get('phone'),
                  password: form.get('password') || null,
                  status: form.get('status')
                });
                setEditingSeller(null);
              } catch {}
            }}
          >
            <input name="name" defaultValue={editingSeller.name} placeholder="Nombre" required />
            <input name="phone" defaultValue={editingSeller.phone} placeholder="Teléfono" />
            <input name="password" type="text" defaultValue={editingSeller.password || ""} placeholder="Contraseña" />
            <select name="status" defaultValue={editingSeller.status}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </button>
          </form>
        </Modal>
      )}

      {editingProduct && (
        <Modal title="Editar Producto" onClose={() => setEditingProduct(null)}>
          <form
            className="field"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const form = new FormData(e.currentTarget);
                await updateProduct(editingProduct.id, {
                  name: form.get('name'),
                  investment_cost: form.get('investment_cost'),
                  sale_price: form.get('sale_price')
                });
                setEditingProduct(null);
              } catch {}
            }}
          >
            <input name="name" defaultValue={editingProduct.name} placeholder="Nombre" required />
            <input name="investment_cost" type="number" min="0" defaultValue={editingProduct.investment_cost} placeholder="Costo" required />
            <input name="sale_price" type="number" min="0" defaultValue={editingProduct.sale_price} placeholder="PVP" required />
            <button type="submit" className="primary" style={{marginTop:'10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
