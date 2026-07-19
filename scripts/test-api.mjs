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
  console.log("Fetching sellers...");
  const sellersData = await api('/apis/sellers');
  let seller = sellersData.sellers[0];
  if (!seller) {
    console.log("No seller found, creating one...");
    const newSeller = await api('/apis/sellers', {
      method: "POST",
      body: JSON.stringify({ name: "Test Seller " + Date.now(), phone: "123456789" })
    });
    seller = newSeller.seller;
  }
  const seller_id = seller.id;
  console.log("Using seller_id:", seller_id);

  console.log("Creating product...");
  const productData = await api('/apis/products', {
    method: "POST",
    body: JSON.stringify({ name: "Test Product " + Date.now(), investment_cost: 100, sale_price: 200 })
  });
  const product_id = productData.product.id;
  console.log("Product created:", product_id);

  console.log("Creating customer...");
  const customerData = await api('/apis/customers', {
    method: "POST",
    body: JSON.stringify({ seller_id, name: "Test Customer " + Date.now(), address: "123 Main St", phone: "555-5555" })
  });
  const customer_id = customerData.customer.id;
  console.log("Customer created:", customer_id);

  console.log("Delivering inventory...");
  await api('/apis/inventory', {
    method: "POST",
    body: JSON.stringify({
      seller_id,
      items: [{ product_id, quantity: 10 }]
    })
  });
  console.log("Inventory delivered.");

  console.log("Registering visit...");
  await api('/apis/visits', {
    method: "POST",
    body: JSON.stringify({
      seller_id,
      customer_id,
      items: [{ product_id, quantity: 2, name: "Test Product" }],
      payment_amount: 50,
      payment_method: "efectivo",
      notes: "First visit test"
    })
  });
  console.log("Visit registered.");

  console.log("ALL TESTS PASSED!");
}

runTests().catch(console.error);