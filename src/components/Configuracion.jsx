import { useState } from "react";
import { UserPlus, PackagePlus, Edit2, Trash2 } from "lucide-react";
import { Modal } from "./Modal";

export function Configuracion({ createSeller, createProduct, sellers, products, updateSeller, deleteSeller, updateProduct, deleteProduct, isSubmitting, loading = false }) {
  const [editingSeller, setEditingSeller] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);

  return (
    <section style={{display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px'}}>
      <div className="panel" style={{width: '100%'}}>
        <form className="inlineForm" onSubmit={createSeller} style={{marginBottom: '1rem'}}>
          <h2>Vendedor</h2>
          <input name="name" placeholder="Nombre" required />
          <input name="phone" placeholder="Telefono" />
          <button className="iconButton" type="submit" title="Crear vendedor" disabled={isSubmitting}>
            {isSubmitting ? <span className="spinner" /> : <UserPlus size={18} />}
          </button>
        </form>
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
      </div>

      <div className="panel" style={{width: '100%'}}>
        <form className="inlineForm" onSubmit={createProduct} style={{marginBottom: '1rem'}}>
          <h2>Producto</h2>
          <input name="name" placeholder="Nombre" required />
          <input name="investment_cost" type="number" min="0" placeholder="Costo" required style={{width: '80px'}}/>
          <input name="sale_price" type="number" min="0" placeholder="PVP" required style={{width: '80px'}}/>
          <button className="iconButton" type="submit" title="Crear producto" disabled={isSubmitting}>
            {isSubmitting ? <span className="spinner" /> : <PackagePlus size={18} />}
          </button>
        </form>
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
                <td>${Number(p.investment_cost).toLocaleString()}</td>
                <td>${Number(p.sale_price).toLocaleString()}</td>
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
      </div>

      {editingSeller && (
        <Modal title="Editar Vendedor" onClose={() => setEditingSeller(null)}>
          <form
            className="field"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              await updateSeller(editingSeller.id, {
                name: form.get('name'),
                phone: form.get('phone'),
                status: form.get('status')
              });
              setEditingSeller(null);
            }}
          >
            <input name="name" defaultValue={editingSeller.name} placeholder="Nombre" required />
            <input name="phone" defaultValue={editingSeller.phone} placeholder="Teléfono" />
            <select name="status" defaultValue={editingSeller.status}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <button type="submit" className="primary" style={{marginTop: '10px'}} disabled={isSubmitting}>
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
              const form = new FormData(e.currentTarget);
              await updateProduct(editingProduct.id, {
                name: form.get('name'),
                investment_cost: form.get('investment_cost'),
                sale_price: form.get('sale_price')
              });
              setEditingProduct(null);
            }}
          >
            <input name="name" defaultValue={editingProduct.name} placeholder="Nombre" required />
            <input name="investment_cost" type="number" min="0" defaultValue={editingProduct.investment_cost} placeholder="Costo" required />
            <input name="sale_price" type="number" min="0" defaultValue={editingProduct.sale_price} placeholder="PVP" required />
            <button type="submit" className="primary" style={{marginTop: '10px'}} disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : null}
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
