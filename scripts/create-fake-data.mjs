// Script para crear datos ficticios de clientes, stock y ventas
// Usa INSERT directos para evitar restricciones de días cerrados

const { query } = await import('../src/lib/db.js');

const SELLERS = [
  { id: 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9', name: 'luis troconis' },
  { id: 'f64d3b78-4e3c-463b-a85a-4ecebc873273', name: 'carmen' },
  { id: '74ca3596-d930-4bea-a891-f9cc77d6848f', name: 'mogollon' },
  { id: 'd7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9', name: 'pedro perez' }
];

const PRODUCTS = [
  { id: 'd4085082-edfc-4e9d-9d2c-d6d4f0437cfa', name: 'queso 1 kilo mosarela', sale_price: 3000, investment_cost: 2000 },
  { id: 'f1ffad6e-86c0-45b0-ac56-7ec5b56ee3d0', name: 'Salchichas', sale_price: 1500, investment_cost: 1000 },
  { id: '149d683d-ca65-4814-9a79-da418d0e320d', name: 'yogout albina', sale_price: 600, investment_cost: 500 },
  { id: 'da67f664-6e3a-411f-a516-bc21d78533d3', name: 'Mantequilla mavesa', sale_price: 1300, investment_cost: 900 },
  { id: 'cf17b8d3-a33c-4282-821b-3c2563c54fff', name: 'jugos del valle', sale_price: 2000, investment_cost: 1000 }
];

const FRI_JUL3 = '2026-07-03';
const FRI_JUL10 = '2026-07-10';
const FRI_DATES = [FRI_JUL3, FRI_JUL10];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr, count = 1) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const customerNames = [
  'tienda don jose', 'supermercado la esquina', 'cafeteria el exito',
  'bodega san miguel', 'restaurante el patio', 'panaderia el trigal',
  'tienda mari', 'carniceria la 40', 'licorera el oasis',
  'minimarket luna', 'abarrotes San Jorge', 'tienda el compadre',
  'supermercado el valle', 'bodega la 14', 'restaurante carmen',
  'cafeteria central', 'tienda lola', 'panaderia el horno',
  'licorera el barrio', 'abarrotes la fe'
];

async function main() {
  console.log('========================================');
  console.log('CREANDO DATOS FICTICIOS PARA COBROKITS');
  console.log('========================================');

  // 1. Crear clientes
  console.log('\n--- CREANDO CLIENTES (visit_day=5) ---');
  const allCustomers = [];
  let nameIdx = 0;
  for (const seller of SELLERS) {
    for (let i = 0; i < 5; i++) {
      const name = customerNames[nameIdx++];
      const r = await query(
        `INSERT INTO cobrokits.customers (seller_id, name, address, phone, is_active, visit_day, created_at)
         VALUES ($1, $2, $3, $4, true, 5, $5::date)
         RETURNING id`,
        [seller.id, name, `Direccion ${seller.name} #${i+1}`, `${3000000000 + randInt(0, 999999999)}`, FRI_JUL3]
      );
      allCustomers.push({ id: r[0].id, name, seller_id: seller.id });
      console.log(`  ${seller.name} -> ${name}`);
    }
  }
  console.log(`Total: ${allCustomers.length} clientes`);

  // 2. Asegurar warehouse stock
  console.log('\n--- ASEGURANDO STOCK EN BODEGA ---');
  for (const p of PRODUCTS) {
    const ws = await query('SELECT quantity FROM cobrokits.warehouse_stock WHERE product_id = $1', [p.id]);
    const current = ws.length > 0 ? Number(ws[0].quantity) : 0;
    const need = 500;
    if (current < need) {
      const add = need - current;
      if (ws.length > 0) {
        await query('UPDATE cobrokits.warehouse_stock SET quantity = quantity + $1 WHERE product_id = $2', [add, p.id]);
      } else {
        await query('INSERT INTO cobrokits.warehouse_stock (product_id, quantity) VALUES ($1, $2)', [p.id, add]);
      }
      await query(`INSERT INTO cobrokits.warehouse_stock_entries (product_id, quantity, notes) VALUES ($1, $2, 'Stock pruebas')`, [p.id, add]);
      console.log(`  ${p.name}: +${add} unidades`);
    } else {
      console.log(`  ${p.name}: ${current} unidades (ok)`);
    }
  }

  // 3. Entregar stock diario a cada vendedor para cada viernes
  // Limpiamos primero cualquier daily_stock existente para esas fechas
  console.log('\n--- ENTREGANDO STOCK DIARIO A VENDEDORES ---');
  for (const seller of SELLERS) {
    for (const date of FRI_DATES) {
      // Asegurar que no haya registros cerrados para esta fecha
      await query(
        `UPDATE cobrokits.daily_seller_stock SET is_closed = false
         WHERE seller_id = $1 AND stock_date = $2::date AND is_closed = true`,
        [seller.id, date]
      );

      for (const p of PRODUCTS) {
        const qty = randInt(15, 30);
        // Verificar warehouse stock
        const ws = await query('SELECT quantity FROM cobrokits.warehouse_stock WHERE product_id = $1', [p.id]);
        const available = ws.length > 0 ? Number(ws[0].quantity) : 0;
        const deliverQty = Math.min(qty, available);
        if (deliverQty <= 0) continue;

        // Descontar de bodega
        await query(
          'UPDATE cobrokits.warehouse_stock SET quantity = quantity - $1 WHERE product_id = $2',
          [deliverQty, p.id]
        );
        // Insertar/actualizar daily_seller_stock
        await query(
          `INSERT INTO cobrokits.daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered, quantity_sold, is_closed)
           VALUES ($1, $2, $3::date, $4, 0, false)
           ON CONFLICT (seller_id, product_id, stock_date)
           DO UPDATE SET quantity_delivered = cobrokits.daily_seller_stock.quantity_delivered + EXCLUDED.quantity_delivered,
                         is_closed = false, updated_at = now()`,
          [seller.id, p.id, date, deliverQty]
        );
        // Inventory movement
        await query(
          `INSERT INTO cobrokits.inventory_movements (seller_id, product_id, movement_type, quantity, unit_investment_cost, unit_sale_price, notes)
           VALUES ($1, $2, 'entrega_diaria_vendedor', $3, $4, $5, 'Stock ficticio pruebas')`,
          [seller.id, p.id, deliverQty, p.investment_cost, p.sale_price]
        );
      }

      // Verificar stock total entregado
      const totalDelivered = await query(
        `SELECT SUM(quantity_delivered) as total FROM cobrokits.daily_seller_stock
         WHERE seller_id = $1 AND stock_date = $2::date`,
        [seller.id, date]
      );
      const total = Number(totalDelivered[0]?.total || 0);
      console.log(`  ${seller.name} | ${date}: ${total} unidades entregadas`);
    }
  }

  // 4. Crear ventas
  console.log('\n--- CREANDO VENTAS ---');
  let totalVentas = 0;
  let totalAbonos = 0;
  let visitCount = 0;

  for (const seller of SELLERS) {
    const sellerCusts = allCustomers.filter(c => c.seller_id === seller.id);
    if (sellerCusts.length < 5) continue;

    // 3 ventas el viernes 3, 2 ventas el viernes 10
    const dateCusts = [
      { date: FRI_JUL3, customers: sellerCusts.slice(0, 3) },
      { date: FRI_JUL10, customers: sellerCusts.slice(3, 5) }
    ];

    for (const { date, customers } of dateCusts) {
      for (const cust of customers) {
        // Seleccionar 1-3 productos
        const numProds = randInt(1, 3);
        const prods = pickRandom(PRODUCTS, numProds);

        // Construir items
        const items = prods.map(p => ({
          product_id: p.id,
          quantity: randInt(1, 4),
          sale_price: Number(p.sale_price),
          investment_cost: Number(p.investment_cost)
        }));

        // Calcular totales
        const newProductsTotal = items.reduce((s, i) => s + (i.quantity * i.sale_price), 0);
        // Pago ~50% (30-70%)
        const pct = randInt(30, 70) / 100;
        const paymentAmount = Math.round(newProductsTotal * pct);
        const paymentMethod = paymentAmount > 0 ? (Math.random() > 0.5 ? 'efectivo' : 'nequi') : null;

        // Obtener balance actual del cliente
        const custRow = await query('SELECT current_balance FROM cobrokits.customers WHERE id = $1', [cust.id]);
        const prevBalance = custRow.length > 0 ? Number(custRow[0].current_balance) : 0;
        const newBalance = prevBalance + newProductsTotal - paymentAmount;

        // 1. Insert customer_visit
        const visit = await query(
          `INSERT INTO cobrokits.customer_visits (customer_id, seller_id, visit_date, previous_balance, new_products_total, payment_amount, payment_method, new_balance, notes)
           VALUES ($1, $2, $3::date, $4, $5, $6, $7::cobrokits.payment_method, $8, $9)
           RETURNING id`,
          [cust.id, seller.id, date, prevBalance, newProductsTotal, paymentAmount, paymentMethod, newBalance, `Venta ficticia ${date}`]
        );
        const visitId = visit[0].id;

        // 2. Insert customer_visit_items y actualizar daily_stock
        for (const item of items) {
          await query(
            `INSERT INTO cobrokits.customer_visit_items (visit_id, product_id, quantity, unit_investment_cost, unit_sale_price, line_investment_total, line_sale_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [visitId, item.product_id, item.quantity, item.investment_cost, item.sale_price,
             item.quantity * item.investment_cost, item.quantity * item.sale_price]
          );

          // Actualizar daily_seller_stock.quantity_sold
          await query(
            `UPDATE cobrokits.daily_seller_stock
             SET quantity_sold = quantity_sold + $1, updated_at = now()
             WHERE seller_id = $2 AND product_id = $3 AND stock_date = $4::date`,
            [item.quantity, seller.id, item.product_id, date]
          );

          // Inventory movement
          await query(
            `INSERT INTO cobrokits.inventory_movements (seller_id, product_id, customer_id, movement_type, quantity, unit_investment_cost, unit_sale_price, notes)
             VALUES ($1, $2, $3, 'venta_credito_cliente', $4, $5, $6, $7)`,
            [seller.id, item.product_id, cust.id, item.quantity, item.investment_cost, item.sale_price, `Venta ficticia ${date}`]
          );
        }

        // 3. Insert payment if any
        if (paymentAmount > 0) {
          await query(
            `INSERT INTO cobrokits.payments (visit_id, customer_id, seller_id, amount, method, notes)
             VALUES ($1, $2, $3, $4, $5::cobrokits.payment_method, $6)`,
            [visitId, cust.id, seller.id, paymentAmount, paymentMethod, `Pago ficticio ${date}`]
          );
        }

        // 4. Actualizar balance del cliente
        await query(
          'UPDATE cobrokits.customers SET current_balance = $1 WHERE id = $2',
          [newBalance, cust.id]
        );

        totalVentas += newProductsTotal;
        totalAbonos += paymentAmount;
        visitCount++;

        console.log(`  ${seller.name} | ${cust.name} | ${date} | Total: $${newProductsTotal.toLocaleString()} | Abono: $${paymentAmount.toLocaleString()} | Saldo: $${newBalance.toLocaleString()}`);
      }
    }
  }

  // 5. Cerrar los días para que no se puedan modificar (como datos históricos)
  console.log('\n--- CERRANDO DIAS ---');
  for (const seller of SELLERS) {
    for (const date of FRI_DATES) {
      await query(
        `UPDATE cobrokits.daily_seller_stock SET is_closed = true, updated_at = now()
         WHERE seller_id = $1 AND stock_date = $2::date AND is_closed = false`,
        [seller.id, date]
      );
      console.log(`  ${seller.name} | ${date}: cerrado`);
    }
  }

  console.log('\n========================================');
  console.log('RESUMEN');
  console.log('========================================');
  console.log(`Clientes creados: ${allCustomers.length}`);
  console.log(`Ventas registradas: ${visitCount}`);
  console.log(`Total ventas: $${totalVentas.toLocaleString()}`);
  console.log(`Total abonos: $${totalAbonos.toLocaleString()}`);
  console.log(`Saldo pendiente: $${(totalVentas - totalAbonos).toLocaleString()}`);
  console.log('\nListo!');

  process.exit(0);
}

await main();
