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
  Users,
  Settings,
  Archive,
  Truck,
  BarChart2
} from "lucide-react";

import { Dashboard } from "../components/Dashboard";
import { RegistrarVisita } from "../components/RegistrarVisita";
import { NuevoCliente } from "../components/NuevoCliente";
import { EntregarInventario } from "../components/EntregarInventario";
import { Inventario } from "../components/Inventario";
import { Configuracion } from "../components/Configuracion";
import { ReportesSemanales } from "../components/ReportesSemanales";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatMoney(value) {
  return money.format(Number(value || 0));
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "Error de solicitud");
  return data;
}

export default function Home() {
  // Helper to convert day number to name
  function dayName(dayNum) {
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[dayNum] ?? "—";
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
    
    // Get the selected customer from the select element
    const customerSelect = document.getElementById('visit-customer-select');
    const customerId = customerSelect?.value;
    if (!customerId) {
      alert("Seleccione un cliente primero");
      return;
    }
    
    // Validate customer's visit day matches today
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const visitDay = customer.visit_day !== null && customer.visit_day !== undefined ? Number(customer.visit_day) : null;
      const todayDow = new Date().getDay();
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
      // Auto-close any open daily stock from previous days
      try { await api("/apis/daily-stock", { method: "POST", body: JSON.stringify({ action: "auto_close" }) }); } catch { /* ignore */ }

      const [dashboardData, sellersData, productsData, customersData, inventoryData, visitsData] = await Promise.all([
        api("/apis/dashboard"),
        api("/apis/sellers"),
        api("/apis/products"),
        api("/apis/customers"),
        api("/apis/inventory"),
        api("/apis/visits"),
      ]);
      setDashboard(dashboardData);
      setSellers(sellersData.sellers);
      setProducts(productsData.products);
      setCustomers(customersData.customers);
      setInventory(inventoryData.inventory);
      setVisits(visitsData.visits);
      setActiveSellerId((current) => {
        if (current) return current;
        const firstWithVisits = sellersData.sellers.find((s) =>
          visitsData.visits?.some((v) => v.seller_id === s.id)
        );
        return firstWithVisits?.id || sellersData.sellers[0]?.id || "";
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

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
      await api(`/apis/${type}?id=${id}`, {
        method: "DELETE",
      });
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
          body: JSON.stringify({
            action: "deliver",
            seller_id: sellerId,
            product_id: item.product_id,
            quantity: Number(item.quantity),
            stock_date,
          }),
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

      await api("/apis/visits", {
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
      });
      formElement.reset();
      setVisitItems([]);
      setCurrentProductId("");
      setCurrentQuantity("");
      setSelectedVisitCustomer("");
      setVisitFormKey((key) => key + 1);
      setNotice("Visita registrada");
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const totals = dashboard?.totals || {};

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CK</div>
          <div>
            <strong>CobroKits</strong>
            <span>Consignacion semanal</span>
          </div>
        </div>

        <nav className="navMenu">
          <button className={`navButton ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <HomeIcon size={18} />
            <span>Inicio</span>
          </button>
          <button className={`navButton ${activeTab === 'registrar-visita' ? 'active' : ''}`} onClick={() => setActiveTab('registrar-visita')}>
            <MapPin size={18} />
            <span>Registrar Visita</span>
          </button>
          <button className={`navButton ${activeTab === 'entregar-inventario' ? 'active' : ''}`} onClick={() => setActiveTab('entregar-inventario')}>
            <Truck size={18} />
            <span>Entregar Inventario</span>
          </button>
          <button className={`navButton ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
            <Users size={18} />
            <span>Clientes</span>
          </button>
          <button className={`navButton ${activeTab === 'inventario' ? 'active' : ''}`} onClick={() => setActiveTab('inventario')}>
            <Archive size={18} />
            <span>Inventario General</span>
          </button>
          <button className={`navButton ${activeTab === 'reportes' ? 'active' : ''}`} onClick={() => setActiveTab('reportes')}>
            <BarChart2 size={18} />
            <span>Reportes Semanales</span>
          </button>
          <button className={`navButton ${activeTab === 'configuracion' ? 'active' : ''}`} onClick={() => setActiveTab('configuracion')}>
            <Settings size={18} />
            <span>Configuración</span>
          </button>
        </nav>

        <div style={{flex: 1}}></div>

        <label className="field">
          <span>Vendedor activo</span>
          <select
            value={activeSellerId}
            onChange={(event) => setActiveSellerId(event.target.value)}
          >
            <option value="">Todos</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>

        <div className="sideStats">
          <span>Cartera</span>
          <strong>{formatMoney(totals.total_portfolio)}</strong>
          <span>Recaudo hoy</span>
          <strong>{formatMoney(totals.collected_today)}</strong>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p>Inventario, credito y recaudo</p>
            <h1>
              {activeTab === 'dashboard' && 'Operacion diaria'}
              {activeTab === 'registrar-visita' && 'Registrar Visita'}
              {activeTab === 'entregar-inventario' && 'Entregar Inventario'}
              {activeTab === 'clientes' && 'Gestión de Clientes'}
              {activeTab === 'inventario' && 'Inventario General'}
              {activeTab === 'reportes' && 'Reportes Semanales'}
              {activeTab === 'configuracion' && 'Configuración de Sistema'}
            </h1>
          </div>
          <button className="iconButton" onClick={loadAll} disabled={loading} title="Actualizar">
            <RefreshCcw size={18} />
          </button>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        {loading && (
          <div className="loading-overlay">
            <div className="spinner-lg" />
            <span>Cargando datos…</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <Dashboard
            dashboard={dashboard}
            formatMoney={formatMoney}
            loading={loading}
            activeSellerId={activeSellerId}
            activeSellerName={activeSellerName}
          />
        )}
        {activeTab === 'registrar-visita' && 
          <RegistrarVisita 
            key={visitFormKey}
            registerVisit={registerVisit}
            sellers={sellers}
            activeSellerId={activeSellerId}
            setActiveSellerId={setActiveSellerId}
            activeCustomers={activeCustomers}
            formatMoney={formatMoney}
            products={products}
            currentProductId={currentProductId}
            setCurrentProductId={setCurrentProductId}
            currentQuantity={currentQuantity}
            setCurrentQuantity={setCurrentQuantity}
            addVisitItem={addVisitItem}
            visitItems={visitItems}
            removeVisitItem={removeVisitItem}
            isSubmitting={isSubmitting}
            loading={loading}
            visits={visits}
            activeSellerName={activeSellerName}
            selectedVisitCustomer={selectedVisitCustomer}
            setSelectedVisitCustomer={setSelectedVisitCustomer}
          />
        }
        {activeTab === 'clientes' && 
          <NuevoCliente 
            createCustomer={createCustomer}
            sellers={sellers}
            activeSellerId={activeSellerId}
            customers={customers}
            updateCustomer={(id, data) => updateEntity('customers', id, data)}
            deleteCustomer={(id) => deleteEntity('customers', id)}
            isSubmitting={isSubmitting}
            loading={loading}
          />
        }
        {activeTab === 'entregar-inventario' && 
          <EntregarInventario 
            key={entregarFormKey}
            deliverDailyStock={deliverDailyStock}
            sellers={sellers}
            activeSellerId={activeSellerId}
            products={products}
            currentDeliveryProductId={currentDeliveryProductId}
            setCurrentDeliveryProductId={setCurrentDeliveryProductId}
            currentDeliveryQuantity={currentDeliveryQuantity}
            setCurrentDeliveryQuantity={setCurrentDeliveryQuantity}
            addDeliveryItem={addDeliveryItem}
            deliveryItems={deliveryItems}
            removeDeliveryItem={removeDeliveryItem}
            formatMoney={formatMoney}
            isSubmitting={isSubmitting}
          />
        }
        {activeTab === 'inventario' && <Inventario />}
        {activeTab === 'reportes' && (
          <ReportesSemanales activeSellerId={activeSellerId} activeSellerName={activeSellerName} />
        )}
        {activeTab === 'configuracion' && 
          <Configuracion 
            createSeller={createSeller}
            createProduct={createProduct}
            sellers={sellers}
            products={products}
            updateSeller={(id, data) => updateEntity('sellers', id, data)}
            deleteSeller={(id) => deleteEntity('sellers', id)}
            updateProduct={(id, data) => updateEntity('products', id, data)}
            deleteProduct={(id) => deleteEntity('products', id)}
            isSubmitting={isSubmitting}
            loading={loading}
          />
        }

      </section>
    </main>
  );
}
