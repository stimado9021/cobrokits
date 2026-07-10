const fs = require('fs');

async function api(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`API ${path} failed: ${data.message}`);
  }
  return data;
}

async function runTests() {
  console.log("1. Fetching sellers and products...");
  const sellersData = await api('/apis/sellers');
  let seller = sellersData.sellers[0];
  if (!seller) {
    const newSeller = await api('/apis/sellers', {
      method: "POST",
      body: JSON.stringify({ name: "Test Seller " + Date.now(), phone: "123456789" })
    });
    seller = newSeller.seller;
  }
  const seller_id = seller.id;

  const productsData = await api('/apis/products');
  let product = productsData.products[0];
  if (!product) {
    const newProduct = await api('/apis/products', {
      method: "POST",
      body: JSON.stringify({ name: "Test Product " + Date.now(), investment_cost: 100, sale_price: 200 })
    });
    product = newProduct.product;
  }
  const product_id = product.id;

  console.log(`Using Seller: ${seller.name} (${seller_id})`);
  console.log(`Using Product: ${product.name} (${product_id})`);

  console.log("\n2. Getting initial general stock for product...");
  const initialStockData = await api('/apis/general-stock');
  const initialStockItem = initialStockData.inventory.find(i => i.id === product_id);
  const initialQty = initialStockItem ? Number(initialStockItem.quantity) : 0;
  console.log(`Initial warehouse quantity for product: ${initialQty}`);

  console.log("\n3. Delivering 5 units to seller for daily stock...");
  const today = new Date().toISOString().slice(0, 10);
  await api('/apis/daily-stock', {
    method: "POST",
    body: JSON.stringify({
      action: "deliver",
      seller_id,
      product_id,
      quantity: 5,
      stock_date: today
    })
  });
  console.log("Delivered 5 units to seller daily stock.");

  console.log("\n4. Checking general stock after delivery...");
  const midStockData = await api('/apis/general-stock');
  const midStockItem = midStockData.inventory.find(i => i.id === product_id);
  const midQty = midStockItem ? Number(midStockItem.quantity) : 0;
  console.log(`Mid warehouse quantity for product: ${midQty} (Expected: ${initialQty - 5})`);
  
  if (midQty !== initialQty - 5) {
      console.error("WARNING: General stock did NOT decrease by 5!");
  } else {
      console.log("SUCCESS: General stock decreased by 5.");
  }

  console.log("\n5. Checking daily stock for seller...");
  const dailyStockData = await api(`/apis/daily-stock?sellerId=${seller_id}&stockDate=${today}`);
  const dailyItem = dailyStockData.items.find(i => i.product_id === product_id);
  const dailyDelivered = dailyItem ? Number(dailyItem.quantity_delivered) : 0;
  const dailySold = dailyItem ? Number(dailyItem.quantity_sold) : 0;
  console.log(`Daily stock for seller: Delivered=${dailyDelivered}, Sold=${dailySold}, Remaining=${dailyDelivered - dailySold}`);

  console.log("\n6. Closing day...");
  const closeDayData = await api('/apis/daily-stock', {
    method: "POST",
    body: JSON.stringify({
      action: "close_day",
      seller_id,
      stock_date: today
    })
  });
  console.log("Closed day results:", JSON.stringify(closeDayData.closed, null, 2));

  console.log("\n7. Checking general stock after close day...");
  const finalStockData = await api('/apis/general-stock');
  const finalStockItem = finalStockData.inventory.find(i => i.id === product_id);
  const finalQty = finalStockItem ? Number(finalStockItem.quantity) : 0;
  console.log(`Final warehouse quantity for product: ${finalQty} (Expected: ${midQty + (dailyDelivered - dailySold)})`);

  if (finalQty === initialQty) {
      console.log("SUCCESS: Warehouse stock correctly returned to original amount.");
  } else {
      console.error("WARNING: Final warehouse stock is NOT equal to initial, check logic.");
  }

  console.log("\nDone testing.");
}

runTests().catch(console.error);
