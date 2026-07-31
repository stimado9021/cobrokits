import { useState } from "react";
import { Plus, Edit2, Trash2, Save } from "lucide-react";
import { Modal } from "./Modal";

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function ConfigCobros({ cobros = [], loading = false, onSaved }) {
  const [showModal, setShowModal] = useState(false);
  const [editingCobro, setEditingCobro] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    day_of_week: "",
    route: "",
    observation: "",
    is_active: true,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      day_of_week: "",
      route: "",
      observation: "",
      is_active: true,
    });
  };

  const openAddModal = () => {
    setEditingCobro(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (cobro) => {
    setEditingCobro(cobro);
    setFormData({
      name: cobro.name || "",
      day_of_week: cobro.day_of_week ?? "",
      route: cobro.route || "",
      observation: cobro.observation || "",
      is_active: cobro.is_active ?? true,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCobro(null);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        day_of_week: Number(formData.day_of_week),
        route: formData.route || null,
        observation: formData.observation || null,
        is_active: formData.is_active,
      };

      let res;
      if (editingCobro) {
        res = await fetch("/apis/cobros", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCobro.id, ...payload }),
        });
      } else {
        res = await fetch("/apis/cobros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        onSaved?.();
        closeModal();
      } else {
        alert(data.message || "Error al guardar el cobro");
      }
    } catch (e) {
      alert(e.message || "Error de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (cobro) => {
    if (!confirm(`¿Estás seguro de eliminar "${cobro.name.toUpperCase()}"?`)) return;
    try {
      const res = await fetch(`/apis/cobros?id=${cobro.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onSaved?.();
      } else {
        alert(data.message || "Error al eliminar");
      }
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Configuración de Cobros</h2>
        <button className="primary" onClick={openAddModal} style={{ height: "32px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Plus size={16} /> Agregar Cobro
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line-strong)" }}>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Nombre</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Día</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Recorrido</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Observación</th>
              <th style={{ textAlign: "center", padding: "8px 12px" }}>Activo</th>
              <th style={{ textAlign: "center", padding: "8px 12px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cobros.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "var(--ink)" }}>
                  No hay cobros registrados
                </td>
              </tr>
            ) : (
              cobros.map((cobro) => (
                <tr key={cobro.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 12px" }}>{cobro.name.toUpperCase()}</td>
                  <td style={{ padding: "8px 12px" }}>{dayNames[cobro.day_of_week] || cobro.day_of_week}</td>
                  <td style={{ padding: "8px 12px", maxWidth: "200px" }}>{cobro.route || "-"}</td>
                  <td style={{ padding: "8px 12px", maxWidth: "200px" }}>{cobro.observation || "-"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{cobro.is_active ? "✓" : "✗"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button onClick={() => openEditModal(cobro)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--ink)" }} title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(cobro)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--danger, #e74c3c)" }} title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editingCobro ? "Editar Cobro" : "Nuevo Cobro"} onClose={closeModal}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Nombre *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: "100%", padding: "8px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Día de la semana *</label>
              <select
                required
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
                style={{ width: "100%", padding: "8px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}
              >
                <option value="">Selecciona un día</option>
                {dayNames.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Recorrido</label>
              <textarea
                value={formData.route}
                onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                style={{ width: "100%", padding: "8px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", minHeight: "80px", resize: "vertical" }}
                placeholder="Describe el recorrido..."
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Observación</label>
              <textarea
                value={formData.observation}
                onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
                style={{ width: "100%", padding: "8px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", minHeight: "60px", resize: "vertical" }}
                placeholder="Observaciones adicionales..."
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <label htmlFor="is_active" style={{ fontSize: "0.8rem" }}>Activo</label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" onClick={closeModal} style={{ padding: "8px 16px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface-2)", cursor: "pointer" }}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={isSubmitting} style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {isSubmitting ? <span className="spinner" style={{ width: "14px", height: "14px" }} /> : <Save size={14} />}
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
