import { Banknote, Boxes, ClipboardList, CreditCard } from "lucide-react";

function SkeletonLine({ width = "60%", height = "1.2rem" }) {
  return (
    <span style={{
      display: "inline-block",
      width,
      height,
      borderRadius: "6px",
      background: "linear-gradient(90deg, #222 25%, #2d2d2d 50%, #222 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
      verticalAlign: "middle"
    }} />
  );
}

function MetricSkeleton() {
  return (
    <article>
      <span style={{ color: "var(--brand)", opacity: 0.3 }}>
        <Banknote size={20} />
      </span>
      <SkeletonLine width="70%" height="0.8rem" />
      <SkeletonLine width="50%" height="1.6rem" />
    </article>
  );
}

function ListItemSkeleton() {
  return (
    <div className="listItem">
      <div style={{ display: "grid", gap: "6px", flex: 1 }}>
        <SkeletonLine width="55%" height="0.9rem" />
        <SkeletonLine width="38%" height="0.75rem" />
      </div>
      <SkeletonLine width="70px" height="1rem" />
    </div>
  );
}

export function Dashboard({
  dashboard,
  formatMoney,
  loading,
  activeSellerId = "",
  activeSellerName = "Todos los vendedores",
}) {
  const totals = dashboard?.totals || {};
  const sellers = dashboard?.sellers || [];
  
  // Get today's day of week from server (America/Bogota), fallback to local browser time
  const todayDow = dashboard?.today_dow ?? new Date().getDay();
  
  // Filtrar clientes que tienen visita programada para HOY (visit_day = today's day of week)
  const todayBalances = (dashboard?.balances || []).filter(
    (balance) => balance.visit_day === todayDow
  );
  const filteredBalances = todayBalances.filter(
    (balance) => !activeSellerId || balance.seller_id === activeSellerId,
  );
  
  // Meta del vendedor activo (o global si no hay filtro)
  const sellerTargetToday = filteredBalances.reduce((sum, b) => sum + Number(b.current_balance || 0), 0);
  // Total cobrado hoy (global)
  const totalCollectedToday = Number(totals.collected_today || 0);

  const totalNequi = sellers.reduce((sum, seller) => sum + Number(seller.total_nequi || 0), 0);
  const totalCash = sellers.reduce((sum, seller) => sum + Number(seller.total_cash || 0), 0);
  const totalProduction = sellers.reduce((sum, seller) => sum + Number(seller.total_collected || 0), 0);
  
  // Collection target for active seller (or all)
  const collectionTarget = dashboard?.collectionTarget?.target_amount 
    ? Number(dashboard.collectionTarget.target_amount) 
    : (activeSellerId 
        ? (sellers.find(s => s.seller_id === activeSellerId)?.collection_target || 0)
        : sellers.reduce((sum, s) => sum + Number(s.collection_target || 0), 0));

  return (
    <>
      {/* Shimmer keyframe injected inline once */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Metric cards ─────────────────────────── */}
      <section className="metrics">
{loading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <article>
                <Banknote size={20} />
                <span>Por cobrar hoy</span>
                <strong>{formatMoney(sellerTargetToday)}</strong>
              </article>
              <article>
                <CreditCard size={20} />
                <span>Nequi hoy</span>
                <strong>{formatMoney(totalNequi)}</strong>
              </article>
              <article>
                <ClipboardList size={20} />
                <span>Efectivo hoy</span>
                <strong>{formatMoney(totalCash)}</strong>
              </article>
              <article>
                <Boxes size={20} />
                <span>Produccion hoy</span>
                <strong>{formatMoney(totalProduction)}</strong>
              </article>
            </>
          )}
      </section>

      {/* ── Lists ────────────────────────────────── */}
      <section className="workgrid">
        <div className="panel listPanel">
          <div className="panelHead">
            <div>
              <h2>Clientes a visitar hoy</h2>
              <span>{activeSellerName} · Meta: {formatMoney(sellerTargetToday)}</span>
            </div>
            {loading
              ? <SkeletonLine width="20px" height="1rem" />
              : <span>{filteredBalances.length} clientes</span>
            }
          </div>
          <div className="list">
            {loading
              ? [1,2,3].map(n => <ListItemSkeleton key={n} />)
              : filteredBalances.map((balance) => (
                  <article key={balance.customer_id} className="listItem">
                    <div>
                      <strong>{balance.customer_name}</strong>
                      <span>{balance.seller_name} · {formatMoney(balance.current_balance)}</span>
                    </div>
                    <b>{formatMoney(balance.current_balance)}</b>
                  </article>
                ))
            }
            {!loading && filteredBalances.length > 0 && (
              <article className="listItem summaryRow" style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)', fontWeight: 'bold' }}>
                <div>
                  <strong>META TOTAL</strong>
                  <span>{filteredBalances.length} clientes a visitar hoy</span>
                </div>
                <b>{formatMoney(sellerTargetToday)}</b>
              </article>
            )}
            {!loading && filteredBalances.length === 0 && (
              <article className="listItem">
                <div>
                  <strong>Sin clientes programados para hoy</strong>
                  <span>{activeSellerName}</span>
                </div>
              </article>
            )}
          </div>
        </div>

        <div className="panel listPanel">
          <div className="panelHead">
            <h2>Rendimiento hoy</h2>
            {loading
              ? <SkeletonLine width="20px" height="1rem" />
              : <span>{dashboard?.sellers?.length || 0} vendedores</span>
            }
          </div>
          <div className="list">
            {loading
              ? [1,2,3].map(n => <ListItemSkeleton key={n} />)
              : (dashboard?.sellers || []).map((seller) => {
                  const meta = Number(seller.collection_target || 0);
                  const cobrado = Number(seller.total_collected || 0);
                  const pendiente = meta - cobrado;
                  return (
                    <article key={seller.seller_id} className="listItem">
                      <div>
                        <strong>{seller.seller_name}</strong>
                        <span>
                          Meta: {formatMoney(meta)} · Cobrado: {formatMoney(cobrado)} · Pendiente: {formatMoney(pendiente > 0 ? pendiente : 0)}
                        </span>
                      </div>
                      <b style={{ color: cobrado >= meta ? 'var(--green)' : 'var(--red)' }}>
                        {formatMoney(cobrado)}
                      </b>
                    </article>
                  );
                })
            }
          </div>
        </div>
      </section>
    </>
  );
}
