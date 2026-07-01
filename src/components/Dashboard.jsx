import { Banknote, Boxes, ClipboardList, CreditCard } from "lucide-react";

function SkeletonLine({ width = "60%", height = "1.2rem" }) {
  return (
    <span style={{
      display: "inline-block",
      width,
      height,
      borderRadius: "6px",
      background: "linear-gradient(90deg, #e5e7e6 25%, #f0f2f0 50%, #e5e7e6 75%)",
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
  const pendingBalances = (dashboard?.balances || []).filter(
    (balance) => !activeSellerId || balance.seller_id === activeSellerId,
  );

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
              <span>Cartera total</span>
              <strong>{formatMoney(totals.total_portfolio)}</strong>
            </article>
            <article>
              <CreditCard size={20} />
              <span>Nequi hoy</span>
              <strong>{formatMoney(totals.nequi_today)}</strong>
            </article>
            <article>
              <ClipboardList size={20} />
              <span>Efectivo hoy</span>
              <strong>{formatMoney(totals.cash_today)}</strong>
            </article>
            <article>
              <Boxes size={20} />
              <span>Produccion hoy</span>
              <strong>{formatMoney(totals.production_today)}</strong>
            </article>
          </>
        )}
      </section>

      {/* ── Lists ────────────────────────────────── */}
      <section className="workgrid">
        <div className="panel listPanel">
          <div className="panelHead">
            <div>
              <h2>Cartera pendiente</h2>
              <span>{activeSellerName}</span>
            </div>
            {loading
              ? <SkeletonLine width="20px" height="1rem" />
              : <span>{pendingBalances.length}</span>
            }
          </div>
          <div className="list">
            {loading
              ? [1,2,3].map(n => <ListItemSkeleton key={n} />)
              : pendingBalances.map((balance) => (
                  <article key={balance.customer_id} className="listItem">
                    <div>
                      <strong>{balance.customer_name}</strong>
                      <span>{balance.seller_name}</span>
                    </div>
                    <b>{formatMoney(balance.current_balance)}</b>
                  </article>
                ))
            }
            {!loading && pendingBalances.length === 0 && (
              <article className="listItem">
                <div>
                  <strong>Sin cartera pendiente</strong>
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
              : <span>{dashboard?.sellers?.length || 0}</span>
            }
          </div>
          <div className="list">
            {loading
              ? [1,2,3].map(n => <ListItemSkeleton key={n} />)
              : (dashboard?.sellers || []).map((seller) => (
                  <article key={seller.seller_id} className="listItem">
                    <div>
                      <strong>{seller.seller_name}</strong>
                      <span>{formatMoney(seller.total_cash)} efectivo · {formatMoney(seller.total_nequi)} nequi</span>
                    </div>
                    <b>{formatMoney(seller.total_collected)}</b>
                  </article>
                ))
            }
          </div>
        </div>
      </section>
    </>
  );
}
