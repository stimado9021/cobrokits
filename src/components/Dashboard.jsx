import { Banknote, Boxes, ClipboardList, CreditCard } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

const weekDayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DONUT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#F97316"];

function compactMoney(v) {
  const n = Number(v || 0);
  if (n >= 1000000) return `$${(n / 1000000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  if (n >= 1000) return `$${(n / 1000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}k`;
  return `$${Math.round(n)}`;
}

function SkeletonLine({ width = "60%", height = "1.2rem" }) {
  return (
    <span style={{
      display: "inline-block",
      width,
      height,
      borderRadius: "6px",
      background: "linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)",
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

export function Dashboard({
  dashboard,
  formatMoney,
  loading,
  activeSellerId = "",
}) {
  const totals = dashboard?.totals || {};
  const sellers = dashboard?.sellers || [];
  
  // Get today's day of week from server (America/Bogota), fallback to local browser time
  const todayDow = dashboard?.today_dow ?? new Date().getDay();
  
  // Filtrar clientes que tienen visita programada para HOY (visit_day = today's day of week)
  const todayBalances = (dashboard?.balances || []).filter(
    (balance) => balance.visit_day === todayDow
  );
  
  // Meta del vendedor activo (o global si no hay filtro)
  const globalTargetToday = todayBalances.reduce((sum, b) => sum + Number(b.current_balance || 0), 0);
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

  const week = dashboard?.week || [];
  const weekData = week.map((d, i) => ({
    label: weekDayLabels[i] ?? String(i),
    ganancia: Number(d.ganancia_estimada || 0),
    produccion: Number(d.produccion || 0),
  }));
  const totalGananciaSemana = week.reduce((s, d) => s + Number(d.ganancia_estimada || 0), 0);
  const totalProdSemana = week.reduce((s, d) => s + Number(d.produccion || 0), 0);
  const donutData = weekData.filter((d) => d.produccion > 0);

  const sellersData = (dashboard?.sellers || []).map((s) => ({
    fullName: s.seller_name || "Sin nombre",
    label: (s.seller_name || "").split(" ")[0] || "—",
    produccion: Number(s.total_collected || 0),
  }));

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
              <article title="Suma global de la deuda de todos los clientes a visitar hoy (sin filtrar por vendedor)">
                <Banknote size={20} />
                <span>Por cobrar hoy</span>
                <strong>{formatMoney(globalTargetToday)}</strong>
              </article>
              <article title="Total de abonos recibidos por Nequi en el día de hoy">
                <CreditCard size={20} />
                <span>Nequi hoy</span>
                <strong>{formatMoney(totalNequi)}</strong>
              </article>
              <article title="Total de abonos recibidos en efectivo en el día de hoy">
                <ClipboardList size={20} />
                <span>Efectivo hoy</span>
                <strong>{formatMoney(totalCash)}</strong>
              </article>
              <article title="Suma total de abonos (Efectivo + Nequi) cobrados en el día de hoy">
                <Boxes size={20} />
                <span>Produccion hoy</span>
                <strong>{formatMoney(totalProduction)}</strong>
              </article>
            </>
          )}
      </section>

      {/* ── Weekly charts ───────────────────────── */}
      <section className="workgrid">
        <div className="panel listPanel">
          <div className="panelHead">
            <div>
              <h2>Rendimiento de la semana</h2>
              <span>Producción por día (abonos Lun-Dom)</span>
            </div>
            {loading
              ? <SkeletonLine width="60px" height="1rem" />
              : <span>{formatMoney(totalProdSemana)}</span>
            }
          </div>
          {loading
            ? <SkeletonLine width="100%" height="180px" />
            : donutData.length === 0
              ? <div style={{ display: "grid", placeItems: "center", height: 220, color: "var(--muted)", fontSize: 13 }}>Sin abonos esta semana</div>
              : <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="produccion" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {donutData.map((entry, i) => (
                          <Cell key={entry.label} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatMoney(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
          }
        </div>

        <div className="panel listPanel">
          <div className="panelHead">
            <div>
              <h2>Ganancias estimadas de la semana</h2>
              <span>Venta − inversión por día</span>
            </div>
            {loading
              ? <SkeletonLine width="60px" height="1rem" />
              : <span>{formatMoney(totalGananciaSemana)}</span>
            }
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted)" width={46} tickFormatter={compactMoney} />
                <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={(label) => `Día ${label}`} />
                <Bar dataKey="ganancia" name="Ganancia estimada" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel listPanel">
          <div className="panelHead">
            <div>
              <h2>Producción por vendedor</h2>
              <span>Abonos hoy (Efectivo + Nequi)</span>
            </div>
            {loading
              ? <SkeletonLine width="60px" height="1rem" />
              : <span>{formatMoney(totalProduction)}</span>
            }
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sellersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted)" interval={0} />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted)" width={46} tickFormatter={compactMoney} />
                <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={(label) => sellersData.find((s) => s.label === label)?.fullName || label} />
                <Bar dataKey="produccion" name="Producción" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </>
  );
}
