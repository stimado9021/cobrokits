import { useState } from "react";
import { Plus, Edit2, Trash2, Save } from "lucide-react";
import { Modal } from "./Modal";

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function fmtMoney(v) { return money.format(Number(v || 0)); }

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dayNames[dt.getDay()]} ${d} de ${monthNames[m - 1]}`;
}

export function ConfigCobros({ cobros = [], loading = false, onSaved }) {
  const [showModal, setShowModal] = useState(false);
  const [editingCobro, setEditingCobro] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterDow, setFilterDow] = useState(() => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })).getDay());
  const [viewCobro, setViewCobro] = useState(null);
  const [cobroDates, setCobroDates] = useState([]);
  const [cobroVisits, setCobroVisits] = useState([]);
  const [selectedVisitDate, setSelectedVisitDate] = useState("");
  const [loadingCobro, setLoadingCobro] = useState(false);
  const [cobroError, setCobroError] = useState("");
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [editSale, setEditSale] = useState("");
  const [editAbono, setEditAbono] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
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

  const filteredCobros = cobros.filter(c => Number(c.day_of_week) === filterDow);

  async function openCobroModal(cobro) {
    setViewCobro(cobro);
    setLoadingCobro(true);
    setCobroError("");
    setCobroDates([]);
    setCobroVisits([]);
    try {
      const res = await fetch(`/apis/cobro-visits?cobroId=${cobro.id}`);
      const data = await res.json();
      if (data.success) {
        setCobroDates(data.dates || []);
        setCobroVisits(data.visits || []);
        setSelectedVisitDate((data.dates && data.dates[0]) || "");
      } else {
        setCobroError(data.message || "Error al cargar las ventas");
      }
    } catch (e) {
      setCobroError(e.message || "Error de conexión");
    } finally {
      setLoadingCobro(false);
    }
  }

  const closeCobroModal = () => {
    setViewCobro(null);
    setCobroDates([]);
    setCobroVisits([]);
    setSelectedVisitDate("");
    setCobroError("");
    setEditingVisitId(null);
    setEditSale("");
    setEditAbono("");
    setDeletingId(null);
  };

  const selectedVisits = selectedVisitDate ? cobroVisits.filter(v => v.visit_day === selectedVisitDate) : [];

  async function refreshCobroVisits() {
    if (!viewCobro) return;
    try {
      const res = await fetch(`/apis/cobro-visits?cobroId=${viewCobro.id}`);
      const data = await res.json();
      if (data.success) {
        setCobroDates(data.dates || []);
        setCobroVisits(data.visits || []);
        setSelectedVisitDate(prev => (data.dates && data.dates.includes(prev) ? prev : (data.dates && data.dates[0]) || ""));
      }
    } catch {}
  }

  function startEdit(v) {
    setEditingVisitId(v.id);
    setEditSale(String(v.sale_total ?? ""));
    setEditAbono(String(v.payment_total ?? ""));
  }

  const cancelEdit = () => {
    setEditingVisitId(null);
    setEditSale("");
    setEditAbono("");
  };

  async function saveEdit(v) {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/apis/cobro-visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, new_products_total: Number(editSale) || 0, payment_amount: Number(editAbono) || 0 }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Registro se actualizó con éxito");
        cancelEdit();
        refreshCobroVisits();
      } else {
        alert(data.message || "Error al actualizar el registro");
      }
    } catch (e) {
      alert(e.message || "Error de conexión");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteVisit(v) {
    if (!confirm(`¿Borrar el registro de ${v.customer_name.toUpperCase()}? Sus datos y stock dejarán de influir en los cálculos.`)) return;
    setDeletingId(v.id);
    try {
      const res = await fetch(`/apis/cobro-visits?id=${v.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        refreshCobroVisits();
      } else {
        alert(data.message || "Error al borrar el registro");
      }
    } catch (e) {
      alert(e.message || "Error de conexión");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <select
          value={filterDow}
          onChange={(e) => setFilterDow(Number(e.target.value))}
          style={{ width: "170px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: "0.88rem", fontWeight: 600 }}
        >
          {dayNames.map((day, i) => (
            <option key={i} value={i}>Grupo {day}</option>
          ))}
        </select>
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
            {filteredCobros.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "var(--ink)" }}>
                  No hay cobros registrados para el grupo {dayNames[filterDow]}
                </td>
              </tr>
            ) : (
              filteredCobros.map((cobro) => (
                <tr key={cobro.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <button
                      onClick={() => openCobroModal(cobro)}
                      title="Ver ventas del cobro"
                      style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}
                    >
                      {cobro.name.toUpperCase()}
                    </button>
                  </td>
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
        <Modal title={editingCobro ? "Editar Cobro" : "Nuevo Cobro"} onClose={closeModal}>          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

      {viewCobro && (
        <Modal title={`Ventas de ${viewCobro.name.toUpperCase()}`} onClose={closeCobroModal} width="1100px" height="88vh">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {loadingCobro ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
                <span className="spinner" />
              </div>
            ) : cobroError ? (
              <div style={{ color: "var(--danger, #e74c3c)", fontSize: "0.85rem" }}>{cobroError}</div>
            ) : cobroDates.length === 0 ? (
              <p style={{ margin: 0, textAlign: "center", color: "var(--ink)", padding: 20 }}>
                No hay ventas registradas para este cobro
              </p>
            ) : (
              <>
                <select
                  value={selectedVisitDate || ""}
                  onChange={(e) => setSelectedVisitDate(e.target.value)}
                  style={{ width: "200px", padding: "6px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: "0.85rem" }}
                >
                  {cobroDates.map((d) => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--line-strong)" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px" }}>Cliente</th>
                        <th style={{ textAlign: "left", padding: "8px 10px" }}>Productos</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Venta</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Abono</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Saldo</th>
                        <th style={{ textAlign: "center", padding: "8px 10px" }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisits.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "20px", color: "var(--ink)" }}>
                            Sin ventas en esta fecha
                          </td>
                        </tr>
                      ) : (
                        selectedVisits.map((v) => {
                          const isEditing = editingVisitId === v.id;
                          const nuevoSaldo = isEditing ? (Number(v.previous_balance) + (Number(editSale) || 0) - (Number(editAbono) || 0)) : null;
                          return (
                          <tr key={v.id} style={{ borderBottom: "1px solid var(--line)", background: isEditing ? "#EFF6FF" : undefined }}>
                            <td style={{ padding: "8px 10px" }}>{v.customer_name.toUpperCase()}</td>
                            <td style={{ padding: "8px 10px", maxWidth: "200px" }}>{v.products_summary || "-"}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editSale}
                                  onChange={(e) => setEditSale(e.target.value)}
                                  style={{ width: "90px", textAlign: "right", padding: "4px 6px", fontSize: "0.8rem", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)" }}
                                />
                              ) : (
                                fmtMoney(v.sale_total)
                              )}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editAbono}
                                  onChange={(e) => setEditAbono(e.target.value)}
                                  style={{ width: "90px", textAlign: "right", padding: "4px 6px", fontSize: "0.8rem", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)" }}
                                />
                              ) : (
                                fmtMoney(v.payment_total)
                              )}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right" }}>{isEditing ? fmtMoney(nuevoSaldo) : fmtMoney(v.new_balance)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              {isEditing ? (
                                <button
                                  onClick={() => saveEdit(v)}
                                  disabled={savingEdit}
                                  title="Guardar cambios"
                                  style={{ background: "var(--brand)", border: "none", borderRadius: "6px", cursor: "pointer", padding: "5px 8px", color: "#fff", display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                  {savingEdit ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />} Guardar
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEdit(v)}
                                    title="Editar registro"
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--ink)" }}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteVisit(v)}
                                    disabled={deletingId === v.id}
                                    title="Borrar registro"
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--danger, #e74c3c)" }}
                                  >
                                    {deletingId === v.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Trash2 size={14} />}
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
