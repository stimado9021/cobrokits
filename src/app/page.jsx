"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Boxes,
  ClipboardList,
  CreditCard,
  PackagePlus,
  RefreshCcw,
  Save,
  UserPlus,
  Home as HomeIcon,
  MapPin,
  Settings,
  Archive,
  Truck,
  BarChart2,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Users,
  CloudOff,
  Upload,
} from "lucide-react";

import { queueOperation, getPendingOperations, removeOperation } from "../lib/offline";

import { Dashboard } from "../components/Dashboard";
import { RegistrarVisita } from "../components/RegistrarVisita";
import { EntregarInventario } from "../components/EntregarInventario";
import { Inventario } from "../components/Inventario";
import { Configuracion } from "../components/Configuracion";
import { ReportesSemanales } from "../components/ReportesSemanales";
import { ReporteDiario } from "../components/ReporteDiario";
import { Login } from "../components/Login";
import { VendedorVisita } from "../components/VendedorVisita";
import { VendedorCliente } from "../components/VendedorCliente";
import { VendedorAjustes } from "../components/VendedorAjustes";
import { ErrorBoundary } from "../components/ErrorBoundary";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

function formatMoney(value) {
  return money.format(Number(value || 0));
}

async function api(path, options, { queueOffline = false } = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    if (queueOffline && options?.method === "POST") {
      await queueOperation({ url: path, body: options.body });
      return { success: true, queued: true };
    }
    throw new Error("Error de conexión. Verifica tu internet e intenta de nuevo.");
  }
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "Error inesperado del servidor");
  return data;
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [sellerTab, setSellerTab] = useState("visita");
  const [isOffline, setIsOffline] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);

  async function refreshPendingCount() {
    try {
      const ops = await getPendingOperations();
      setPendingOps(ops.length);
    } catch {}
  }

  function dayName(dayNum) {
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[dayNum] ?? "—";
  }

  function hoyColombiaDow() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    return d.getDay();
  }

  const [dashboard, setDashboard] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [visits, setVisits] = useState([]);
  const [activeSellerId, setActiveSellerId] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visitFormKey, setVisitFormKey] = useState(0);
  const [entregarFormKey, setEntregarFormKey] = useState(0);

  const [visitItems, setVisitItems] = useState([]);
  const [currentProductId, setCurrentProductId] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [selectedVisitCustomer, setSelectedVisitCustomer] = useState("");

  function addVisitItem() {
    if (!currentProductId || !currentQuantity || currentQuantity <= 0) return;
    const product = products.find(p => p.id === currentProductId);
    if (!product) return;
    const customerSelect = document.getElementById('visit-customer-select');
    const customerId = customerSelect?.value;
    if (!customerId) {
      alert("Seleccione un cliente primero");
      return;
    }
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const visitDay = customer.visit_day !== null && customer.visit_day !== undefined ? Number(customer.visit_day) : null;
      const todayDow = hoyColombiaDow();
      if (visitDay !== null && visitDay !== todayDow) {
        alert(`${customer.name} solo se visita los ${dayName(visitDay)}. Hoy es ${dayName(todayDow)}.`);
        return;
      }
    }
    setVisitItems(prev => {
      const existing = prev.find(item => item.product_id === currentProductId);
      if (existing) {
        return prev.map(item => item.product_id === currentProductId ? { ...item, quantity: item.quantity + Number(currentQuantity) } : item);
      }
      return [...prev, { product_id: currentProductId, quantity: Number(currentQuantity), name: product.name }];
    });
    setCurrentProductId("");
    setCurrentQuantity("");
  }

  function removeVisitItem(productId) {
    setVisitItems(prev => prev.filter(item => item.product_id !== productId));
  }

  const [deliveryItems, setDeliveryItems] = useState([]);
  const [currentDeliveryProductId, setCurrentDeliveryProductId] = useState("");
  const [currentDeliveryQuantity, setCurrentDeliveryQuantity] = useState("");

  function addDeliveryItem() {
    if (!currentDeliveryProductId || !currentDeliveryQuantity || currentDeliveryQuantity <= 0) return;
    const product = products.find(p => p.id === currentDeliveryProductId);
    if (!product) return;
    setDeliveryItems(prev => {
      const existing = prev.find(item => item.product_id === currentDeliveryProductId);
      if (existing) {
        return prev.map(item => item.product_id === currentDeliveryProductId ? { ...item, quantity: item.quantity + Number(currentDeliveryQuantity) } : item);
      }
      return [...prev, { product_id: currentDeliveryProductId, quantity: Number(currentDeliveryQuantity), name: product.name }];
    });
    setCurrentDeliveryProductId("");
    setCurrentDeliveryQuantity("");
  }

  function removeDeliveryItem(productId) {
    setDeliveryItems(prev => prev.filter(item => item.product_id !== productId));
  }

  const activeCustomers = useMemo(
    () => customers.filter((customer) => !activeSellerId || customer.seller_id === activeSellerId),
    [customers, activeSellerId],
  );

  const activeSellerName = useMemo(
    () => sellers.find((seller) => seller.id === activeSellerId)?.name || "Todos los vendedores",
    [sellers, activeSellerId],
  );

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api("/apis/dashboard"),
        api("/apis/sellers"),
        api("/apis/products"),
        api("/apis/customers"),
        api("/apis/inventory"),
        api("/apis/visits"),
      ]);

      const [dashboardData, sellersData, productsData, customersData, inventoryData, visitsData] = results.map(r => r.status === "fulfilled" ? r.value : null);

      if (dashboardData) setDashboard(dashboardData);
      if (sellersData?.sellers) setSellers(sellersData.sellers);
      if (productsData?.products) setProducts(productsData.products);
      if (customersData?.customers) setCustomers(customersData.customers);
      if (inventoryData?.inventory) setInventory(inventoryData.inventory);
      if (visitsData?.visits) setVisits(visitsData.visits);

      const sl = sellersData?.sellers || [];
      const vl = visitsData?.visits || [];
      setActiveSellerId((current) => {
        if (current) return current;
        const firstWithVisits = sl.find((s) => vl.some((v) => v.seller_id === s.id));
        return firstWithVisits?.id || sl[0]?.id || "";
      });

      const errors = results.filter(r => r.status === "rejected").map(r => r.reason?.message);
      if (errors.length > 0) setNotice(errors[0]);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedSession = localStorage.getItem("session");
    if (storedSession) setSession(JSON.parse(storedSession));
    const storedTab = localStorage.getItem("activeTab");
    if (storedTab) setActiveTab(storedTab);
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) loadAll(); }, [hydrated]);

  useEffect(() => {
    refreshPendingCount();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    function handleOnline() { setIsOffline(false); }
    function handleOffline() { setIsOffline(true); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOffline && pendingOps > 0) syncPending().catch(() => {});
  }, [isOffline]);

  useEffect(() => {
    api("/apis/daily-stock", { method: "POST", body: JSON.stringify({ action: "auto_close" }) }).catch(() => {});
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem("activeTab", activeTab);
  }, [activeTab, session]);

  async function createSeller(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/apis/sellers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          password: form.get("password") || null,
        }),
      });
      formElement.reset();
      setNotice("Vendedor creado");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/apis/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          investment_cost: form.get("investment_cost"),
          sale_price: form.get("sale_price"),
        }),
      });
      formElement.reset();
      setNotice("Producto creado");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createCustomer(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/apis/customers", {
        method: "POST",
        body: JSON.stringify({
          seller_id: form.get("seller_id"),
          name: form.get("name"),
          address: form.get("address"),
          phone: form.get("phone"),
          notes: form.get("notes"),
          visit_day: form.get("visit_day") !== "" ? Number(form.get("visit_day")) : null,
        }),
      });
      formElement.reset();
      setNotice("Cliente creado");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateEntity(type, id, data) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api(`/apis/${type}`, {
        method: "PUT",
        body: JSON.stringify({ id, ...data }),
      });
      setNotice("Actualizado exitosamente");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteEntity(type, id) {
    if (isSubmitting) return;
    if (!confirm("¿Está seguro de que desea eliminar este registro?")) return;
    setIsSubmitting(true);
    try {
      await api(`/apis/${type}?id=${id}`, { method: "DELETE" });
      setNotice("Eliminado exitosamente");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function hoyColombia() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  }

  async function deliverDailyStock(event) {
    event.preventDefault();
    if (isSubmitting) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (deliveryItems.length === 0) {
      setNotice("Agrega al menos un producto");
      return;
    }
    setIsSubmitting(true);
    try {
      const sellerId = form.get("seller_id");
      const stock_date = hoyColombia();
      for (const item of deliveryItems) {
        await api("/apis/daily-stock", {
          method: "POST",
          body: JSON.stringify({ action: "deliver", seller_id: sellerId, product_id: item.product_id, quantity: Number(item.quantity), stock_date }),
        });
      }
      formElement.reset();
      setDeliveryItems([]);
      setNotice("Stock diario entregado");
      setEntregarFormKey(k => k + 1);
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function registerVisit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      const result = await api("/apis/visits", {
        method: "POST",
        body: JSON.stringify({
          seller_id: form.get("seller_id"),
          customer_id: form.get("customer_id"),
          items: visitItems,
          payment_amount: form.get("payment_amount") || 0,
          payment_method: form.get("payment_method") || null,
          notes: form.get("notes"),
          visit_date: hoy,
        }),
      }, { queueOffline: true });
      formElement.reset();
      setVisitItems([]);
      setCurrentProductId("");
      setCurrentQuantity("");
      setSelectedVisitCustomer("");
      setVisitFormKey(k => k + 1);
      if (result.queued) {
        setNotice("Visita guardada offline — se sincronizará cuando haya conexión");
        await refreshPendingCount();
      } else {
        setNotice("Visita registrada");
      }
      if (!result.queued) await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function syncPending() {
    const ops = await getPendingOperations();
    if (ops.length === 0) return;
    setNotice(`Sincronizando ${ops.length} operación(es) pendiente(s)...`);
    for (const op of ops) {
      try {
        const res = await fetch(op.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: op.body,
        });
        const data = await res.json();
        if (data.success) await removeOperation(op.id);
      } catch {
        break;
      }
    }
    await refreshPendingCount();
    setNotice("Sincronización completada");
    await loadAll();
  }

  async function sellerCreateCustomer(data) {
    setIsSubmitting(true);
    try {
      const result = await api("/apis/customers", {
        method: "POST",
        body: JSON.stringify({
          seller_id: session.sellerId,
          ...data,
        }),
      }, { queueOffline: true });
      setNotice("Cliente creado");
      if (result.queued) await refreshPendingCount();
      await loadAll();
    } catch (e) {
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sellerRegisterVisit(data) {
    setIsSubmitting(true);
    try {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      const result = await api("/apis/visits", {
        method: "POST",
        body: JSON.stringify({ ...data, visit_date: hoy }),
      }, { queueOffline: true });
      setNotice("Visita registrada");
      if (result.queued) await refreshPendingCount();
      await loadAll();
    } catch (e) {
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }

  const totals = dashboard?.totals || {};

  function doLogin(s) {
    localStorage.setItem("session", JSON.stringify(s));
    setSession(s);
  }

  function doLogout() {
    localStorage.removeItem("session");
    setSession(null);
  }

  // ====== HYDRATING / NOT READY ======
  if (!hydrated) {
    return (
      <div className="login-screen">
        <div className="spinner-lg" />
      </div>
    );
  }

  // ====== LOGIN SCREEN ======
  if (!session) {
    return <Login onLogin={doLogin} sellers={sellers} />;
  }

  // ====== SELLER VIEW (MOBILE) ======
  if (session.role === "seller") {
    const sellerCustomers = customers.filter(c => c.seller_id === session.sellerId);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const abonosHoy = visits
      .filter(v => v.seller_id === session.sellerId && v.visit_date?.startsWith(hoy))
      .reduce((s, v) => s + Number(v.payment_amount || 0), 0);
    const handleSync = async () => { try { await syncPending(); } catch {} };

    return (
      <div className="seller-viewport">
      <div className="seller-shell">
        <header className="seller-header">
          <div>
            <strong>{session.sellerName}</strong>
            <span>{sellerCustomers.length} clientes</span>
            <span className="seller-abonos">Abonos: {formatMoney(abonosHoy)}</span>
          </div>
          <div className="seller-header-actions">
            {pendingOps > 0 && (
              <button className="seller-sync-btn" onClick={handleSync} title="Sincronizar operaciones pendientes">
                <Upload size={16} /> {pendingOps}
              </button>
            )}
            {isOffline && <span className="seller-offline-badge"><CloudOff size={16} /></span>}
            <button className="seller-logout" onClick={doLogout}><LogOut size={20} /></button>
          </div>
        </header>
        {isOffline && (
          <div className="seller-offline-bar">
            <CloudOff size={16} /> Sin conexión — los datos se guardarán localmente y se sincronizarán automáticamente
          </div>
        )}
        {pendingOps > 0 && !isOffline && (
          <div className="seller-sync-bar">
            <Upload size={16} /> {pendingOps} operación(es) pendiente(s) — <button className="seller-sync-link" onClick={handleSync}>sincronizar ahora</button>
          </div>
        )}

        <div className="seller-content">
          {sellerTab === "nuevo-cliente" && (
            <VendedorCliente
              seller={session}
              onNewCustomer={sellerCreateCustomer}
            />
          )}
          {sellerTab === "ajustes" && (
            <VendedorAjustes seller={session} />
          )}
          {sellerTab === "visita" && (
            <VendedorVisita
              seller={session}
              customers={customers}
              products={products}
              onVisit={sellerRegisterVisit}
            />
          )}
          {sellerTab === "clientes" && (
            <div className="seller-clients">
              <button className="primary seller-submit" onClick={() => setSellerTab("nuevo-cliente")} style={{marginBottom:'10px'}}>
                <UserPlus size={18} /> Nuevo Cliente
              </button>
              {sellerCustomers.length === 0 ? (
                <p style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>No tienes clientes asignados</p>
              ) : (
                sellerCustomers.map(c => (
                  <div key={c.id} className="seller-client-card">
                    <div className="seller-client-name">{c.name}</div>
                    <div className="seller-client-info">{c.address} · {c.phone || 'Sin teléfono'}</div>
                    <div className="seller-client-balance">
                      Saldo: <strong>{formatMoney(c.current_balance)}</strong>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <nav className="seller-bottom-nav">
          <button className={`seller-bottom-tab ${sellerTab === 'visita' ? 'active' : ''}`} onClick={() => setSellerTab('visita')}>
            <MapPin size={22} /><span>Visita</span>
          </button>
          <button className={`seller-bottom-tab ${sellerTab === 'clientes' || sellerTab === 'nuevo-cliente' ? 'active' : ''}`} onClick={() => setSellerTab('clientes')}>
            <Users size={22} /><span>Clientes</span>
          </button>
          <button className={`seller-bottom-tab ${sellerTab === 'ajustes' ? 'active' : ''}`} onClick={() => setSellerTab('ajustes')}>
            <Settings size={22} /><span>Ajustes</span>
          </button>
        </nav>
      </div>
      </div>
    );
  }

  // ====== ADMIN VIEW (FULL SYSTEM) ======
  return (
    <main className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <div className="brandMark">CK</div>
            {!sidebarCollapsed && (
              <div>
                <strong>CobroKits</strong>
                <span>Consignacion semanal</span>
              </div>
            )}
          </div>
          <div style={{display:'flex', gap:'4px'}}>
            <button className="sidebar-toggle" onClick={doLogout} title="Cerrar sesión">
              <LogOut size={18} />
            </button>
            <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}>
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
        </div>

        <nav className="navMenu">
          <button className={`navButton ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')} title="Inicio">
            <HomeIcon size={18} />
            {!sidebarCollapsed && <span>Inicio</span>}
          </button>
          <button className={`navButton ${activeTab === 'registrar-visita' ? 'active' : ''}`} onClick={() => setActiveTab('registrar-visita')} title="Registrar Visita">
            <MapPin size={18} />
            {!sidebarCollapsed && <span>Registrar Visita</span>}
          </button>
          <button className={`navButton ${activeTab === 'entregar-inventario' ? 'active' : ''}`} onClick={() => setActiveTab('entregar-inventario')} title="Entregar Inventario">
            <Truck size={18} />
            {!sidebarCollapsed && <span>Entregar Inventario</span>}
          </button>
          <button className={`navButton ${activeTab === 'inventario' ? 'active' : ''}`} onClick={() => setActiveTab('inventario')} title="Inventario General">
            <Archive size={18} />
            {!sidebarCollapsed && <span>Inventario General</span>}
          </button>
          <button className={`navButton ${activeTab === 'reportes' ? 'active' : ''}`} onClick={() => setActiveTab('reportes')} title="Reportes Semanales">
            <BarChart2 size={18} />
            {!sidebarCollapsed && <span>Reportes Semanales</span>}
          </button>
          <button className={`navButton ${activeTab === 'venta-diaria' ? 'active' : ''}`} onClick={() => setActiveTab('venta-diaria')} title="Venta Diaria">
            <ClipboardList size={18} />
            {!sidebarCollapsed && <span>Venta Diaria</span>}
          </button>
          <button className={`navButton ${activeTab === 'configuracion' ? 'active' : ''}`} onClick={() => setActiveTab('configuracion')} title="Configuración">
            <Settings size={18} />
            {!sidebarCollapsed && <span>Configuración</span>}
          </button>
          <button className="navButton" onClick={doLogout} title="Cerrar sesión" style={{borderTop:'1px solid var(--line)', marginTop:'4px', paddingTop:'12px'}}>
            <LogOut size={18} />
            {!sidebarCollapsed && <span>Salir</span>}
          </button>
        </nav>

        <div style={{flex: 1}}></div>

        {!sidebarCollapsed && (
          <>
            <label className="field">
              <span>Vendedor activo</span>
              <select value={activeSellerId} onChange={(e) => setActiveSellerId(e.target.value)}>
                <option value="">Todos</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            </label>
            <div className="sideStats">
              <span>Cartera</span>
              <strong>{formatMoney(totals.total_portfolio)}</strong>
              <span>Recaudo hoy</span>
              <strong>{formatMoney(totals.collected_today)}</strong>
            </div>
          </>
        )}
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p>Inventario, credito y recaudo</p>
            <h1>
              {activeTab === 'dashboard' && 'Operacion diaria'}
              {activeTab === 'registrar-visita' && 'Registrar Visita'}
              {activeTab === 'entregar-inventario' && 'Entregar Inventario'}
              {activeTab === 'inventario' && 'Inventario General'}
              {activeTab === 'reportes' && 'Reportes Semanales'}
              {activeTab === 'venta-diaria' && 'Venta Diaria'}
              {activeTab === 'configuracion' && 'Configuración de Sistema'}
            </h1>
          </div>
          <button className="iconButton" onClick={loadAll} disabled={loading} title="Actualizar">
            <RefreshCcw size={18} />
          </button>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        {loading ? (
          <div className="skel-section">
            {activeTab === 'dashboard' && (
              <>
                <div className="skel-metrics">
                  {[1,2,3,4].map(i => <div key={i} className="skel skel-card" />)}
                </div>
                <div className="skel skel-table"><div className="skel skel-line-lg" style={{width:'40%',margin:'16px 0'}} /></div>
                {[1,2,3].map(i => <div key={i} className="skel skel-row" />)}
              </>
            )}
            {activeTab === 'registrar-visita' && (
              <div className="workgrid">
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'60%'}} />
                  <div className="skel skel-line" />
                  <div className="skel skel-line" />
                  <div className="skel skel-line" />
                  <div className="skel skel-line-lg" style={{width:'40%',marginTop:8}} />
                </div>
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'50%'}} />
                  {[1,2,3].map(i => <div key={i} className="skel skel-row" />)}
                </div>
              </div>
            )}
            {activeTab === 'entregar-inventario' && (
              <div className="workgrid">
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'55%'}} />
                  <div className="skel skel-line" />
                  <div className="skel skel-line" />
                  <div className="skel skel-line-lg" style={{width:'35%',marginTop:8}} />
                </div>
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'45%'}} />
                  {[1,2,3,4].map(i => <div key={i} className="skel skel-row" />)}
                </div>
              </div>
            )}
            {(activeTab === 'inventario') && (
              <div className="workgrid">
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'50%'}} />
                  {[1,2,3,4,5].map(i => <div key={i} className="skel skel-row" />)}
                </div>
                <div className="panel" style={{gap:12}}>
                  <div className="skel skel-line-lg" style={{width:'40%'}} />
                  {[1,2,3].map(i => <div key={i} className="skel skel-row" />)}
                </div>
              </div>
            )}
            {activeTab === 'reportes' && (
              <div style={{padding:20,gap:12,display:'flex',flexDirection:'column'}}>
                <div className="skel skel-line-lg" style={{width:'30%'}} />
                {[1,2,3,4,5,6,7].map(i => <div key={i} className="skel skel-row" />)}
              </div>
            )}
            {activeTab === 'venta-diaria' && (
              <div style={{padding:20,gap:12,display:'flex',flexDirection:'column'}}>
                <div className="skel skel-line-lg" style={{width:'35%'}} />
                {[1,2,3,4].map(i => <div key={i} className="skel skel-row" />)}
              </div>
            )}
            {activeTab === 'configuracion' && (
              <div style={{padding:20,gap:12,display:'flex',flexDirection:'column'}}>
                <div className="skel skel-line-lg" style={{width:'40%'}} />
                {[1,2,3].map(i => <div key={i} className="skel skel-row" />)}
              </div>
            )}
          </div>
        ) : (
          <>
        {activeTab === 'dashboard' && (
          <ErrorBoundary key="dashboard" message="Error al cargar el dashboard">
            <Dashboard dashboard={dashboard} formatMoney={formatMoney} loading={loading} activeSellerId={activeSellerId} activeSellerName={activeSellerName} />
          </ErrorBoundary>
        )}
        {activeTab === 'registrar-visita' && 
          <ErrorBoundary key="registrar-visita" message="Error al cargar el registro de visitas">
          <RegistrarVisita key={visitFormKey} registerVisit={registerVisit} sellers={sellers} activeSellerId={activeSellerId} setActiveSellerId={setActiveSellerId} activeCustomers={activeCustomers} formatMoney={formatMoney} products={products} currentProductId={currentProductId} setCurrentProductId={setCurrentProductId} currentQuantity={currentQuantity} setCurrentQuantity={setCurrentQuantity} addVisitItem={addVisitItem} visitItems={visitItems} removeVisitItem={removeVisitItem} isSubmitting={isSubmitting} loading={loading} visits={visits} activeSellerName={activeSellerName} selectedVisitCustomer={selectedVisitCustomer} setSelectedVisitCustomer={setSelectedVisitCustomer} />
          </ErrorBoundary>
        }
        {activeTab === 'entregar-inventario' && 
          <ErrorBoundary key="entregar-inventario" message="Error al cargar la entrega de inventario">
          <EntregarInventario key={entregarFormKey} deliverDailyStock={deliverDailyStock} sellers={sellers} activeSellerId={activeSellerId} products={products} currentDeliveryProductId={currentDeliveryProductId} setCurrentDeliveryProductId={setCurrentDeliveryProductId} currentDeliveryQuantity={currentDeliveryQuantity} setCurrentDeliveryQuantity={setCurrentDeliveryQuantity} addDeliveryItem={addDeliveryItem} deliveryItems={deliveryItems} removeDeliveryItem={removeDeliveryItem} formatMoney={formatMoney} isSubmitting={isSubmitting} />
          </ErrorBoundary>
        }
        {activeTab === 'inventario' && 
          <ErrorBoundary key="inventario" message="Error al cargar el inventario">
            <Inventario />
          </ErrorBoundary>
        }
        {activeTab === 'reportes' && (
          <ErrorBoundary key="reportes" message="Error al cargar los reportes">
            <ReportesSemanales activeSellerId={activeSellerId} activeSellerName={activeSellerName} />
          </ErrorBoundary>
        )}
        {activeTab === 'venta-diaria' && (
          <ErrorBoundary key="venta-diaria" message="Error al cargar la venta diaria">
            <ReporteDiario activeSellerId={activeSellerId} activeSellerName={activeSellerName} />
          </ErrorBoundary>
        )}
        {activeTab === 'configuracion' && 
          <ErrorBoundary key="configuracion" message="Error al cargar la configuración">
          <Configuracion createSeller={createSeller} createProduct={createProduct} sellers={sellers} products={products} updateSeller={(id, data) => updateEntity('sellers', id, data)} deleteSeller={(id) => deleteEntity('sellers', id)} updateProduct={(id, data) => updateEntity('products', id, data)} deleteProduct={(id) => deleteEntity('products', id)} createCustomer={createCustomer} customers={customers} activeSellerId={activeSellerId} updateCustomer={(id, data) => updateEntity('customers', id, data)} deleteCustomer={(id) => deleteEntity('customers', id)} isSubmitting={isSubmitting} loading={loading} />
          </ErrorBoundary>
        }
          </>
        )}
      </section>
    </main>
  );
}
