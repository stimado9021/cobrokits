# CobroKits - Agent Instructions

## Project Overview
Credit-based inventory and collection management system for field sales teams. Next.js 16 app with PostgreSQL (Neon), single-page architecture with client-side routing.

## Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **Database:** PostgreSQL via `pg` (Neon serverless with connection pooling)
- **Styling:** Plain CSS (globals.css, no CSS-in-JS)
- **Icons:** lucide-react
- **PDF Generation:** html2pdf.js (client-side)
- **Timezone:** All dates/times use `America/Bogota` (UTC-5)

## Key Commands
```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run db:setup     # Apply database schema
npm run db:seed      # Seed initial data
```

## Architecture

### Single-Page App Structure
- `src/app/page.jsx` — Main orchestrator, manages all state and tab routing
- `src/app/layout.js` — Root layout
- Components are imported and conditionally rendered based on `activeTab` state
- No file-based routing for pages; all views are component-based

### API Routes (src/app/apis/)
All APIs use the same pattern:
```js
import { fail, ok, query } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { ... }
```
- `query()` returns rows directly (not pool result)
- `ok()` wraps response with `{ success: true, ...data }`
- `fail()` returns `{ success: false, message }`

### Database Connection (src/lib/db.js)
- Sets `search_path TO cobrokits, public` on every connection
- Sets `timezone TO 'America/Bogota'` on every connection
- Connection pool is singleton; SSL enabled with `rejectUnauthorized: false`
- **Always use `cobrokits.` schema prefix in SQL** (e.g., `cobrokits.products`)

### Database Schema
- Schema: `cobrokits`
- Main tables: `sellers`, `products`, `customers`, `seller_inventory`, `inventory_movements`, `customer_visits`, `customer_visit_items`, `payments`, `daily_seller_stock`, `warehouse_stock`, `weekly_manual_entries`
- Key functions: `register_customer_visit()`, `deliver_daily_stock()`, `close_seller_day()`, `auto_close_old_days()`
- All monetary values: `NUMERIC(14,2)`
- All IDs: `UUID` (gen_random_uuid())
- Visit dates use `TIMESTAMPTZ`, daily stock uses `DATE`

### Timezone Handling
- **Always convert to Colombia time in SQL:**
  ```sql
  (column_name AT TIME ZONE 'America/Bogota')::date
  ```
- Use `EXTRACT(DOW FROM ...)` for day-of-week (0=Sunday, 6=Saturday)
- `visit_day` column on customers matches DOW convention
- Client-side uses `Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })` for today's date

## Components
- `Dashboard.jsx` — Metrics cards + customer list + seller performance
- `RegistrarVisita.jsx` — Visit registration with product delivery + payment
- `EntregarInventario.jsx` — Daily stock delivery + day close
- `Inventario.jsx` — Warehouse stock management + history + PDF export
- `ReportesSemanales.jsx` — Weekly report table with editable fields + PDF export
- `Configuracion.jsx` — Seller and product CRUD
- `NuevoCliente.jsx` — Customer creation
- `Modal.jsx` — Reusable modal component

## Common Pitfalls

### Date/Time Issues
- Always use `America/Bogota` timezone in SQL queries
- `visit_date` is `TIMESTAMPTZ` — cast to date with `AT TIME ZONE 'America/Bogota'`
- `stock_date` in `daily_seller_stock` is `DATE` type
- `visit_day` (0-6) must match `EXTRACT(DOW FROM ...)` in Colombia timezone

### Foreign Key Constraints
- `products` has FK references from: `seller_inventory`, `inventory_movements`, `customer_visit_items`, `daily_seller_stock`, `warehouse_stock`, `warehouse_stock_entries`
- To delete a product, must delete references from all dependent tables first
- Use soft delete (`is_active = false`) when possible

### Stock System
- Two stock systems exist:
  1. `seller_inventory` — Legacy per-seller inventory (used by `deliver_inventory()`)
  2. `warehouse_stock` + `daily_seller_stock` — Current system (used by `deliver_daily_stock()`)
- Daily stock flow: `warehouse_stock` → `daily_seller_stock` → sold/returned
- `close_seller_day()` returns unsold items to `warehouse_stock`
- `auto_close_old_days()` closes all unclosed days before today

### Report Calculations
- **% Efectividad** = `((efectivo + nequi) / cobros) * 100`, donde cobros = `suma_entrega`
- **Meta de cobro** = (ya no se usa para % Efectividad)
- **Cuentas** (columna, antes "Clientes") = conteo de clientes únicos que compraron o abonaron hoy
- **D1/D2 columns** — Removed from UI but still in DB (`weekly_manual_entries`)
- **Dinero a entregar** = `abono_total - gasto`
- **Ganancia** = `suma_entrega - inversion_dia + abono_total - gasto`

## Running Scripts
Many scripts in `scripts/` and root require `DATABASE_URL` env var:
```bash
$env:DATABASE_URL="postgresql://..."; node scripts/cleanup-zero-stock.mjs
```
Always use PowerShell syntax on Windows: `$env:VAR="value"; node script.mjs`

## Git Conventions
- Branch: `main`
- Remote: `https://github.com/stimado9021/cobrokits.git`
- Vercel auto-deploys from `main` branch
- Commit messages in Spanish (e.g., "Corregir % Efectividad")
