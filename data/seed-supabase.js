const supabase = require('./supabase');
const { products, users, orders, reviews } = require('./seed');

function getBrandFromName(name) {
  if (name.includes("Galaxy") || name.includes("Samsung")) return "Samsung";
  if (name.includes("iPhone") || name.includes("MacBook") || name.includes("AirTag") || name.includes("Apple")) return "Apple";
  if (name.includes("Sony")) return "Sony";
  if (name.includes("Daikin")) return "Daikin";
  if (name.includes("LG")) return "LG";
  if (name.includes("Voltas")) return "Voltas";
  if (name.includes("Anker")) return "Anker";
  if (name.includes("Logitech")) return "Logitech";
  if (name.includes("Amazon") || name.includes("Echo")) return "Amazon";
  if (name.includes("Google") || name.includes("Nest")) return "Google";
  if (name.includes("DJI")) return "DJI";
  if (name.includes("Razer")) return "Razer";
  if (name.includes("JBL")) return "JBL";
  if (name.includes("Bose")) return "Bose";
  if (name.includes("Dell")) return "Dell";
  if (name.includes("ASUS")) return "ASUS";
  if (name.includes("HP")) return "HP";
  if (name.includes("Dyson")) return "Dyson";
  return "Patra";
}

async function seedDatabase() {
  console.log("🚀 Starting Supabase Database Migration & Seeding...\n");

  try {
    // Check connection first
    const { data: testData, error: testErr } = await supabase.from('products').select('id').limit(1);
    if (testErr) {
      throw new Error(`Connection test failed: ${testErr.message}. Verify your credentials inside the .env file.`);
    }
    console.log("✅ Connection to Supabase successful!");

    // 1. CLEAN NATIVE AUTH USERS (to prevent duplicates)
    console.log("\n🧹 Cleaning up native Supabase Auth users...");
    const { data: authUsersList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.warn("⚠️ Warning listing auth users (make sure you provided the service_role key):", listErr.message);
    } else if (authUsersList && authUsersList.users) {
      for (const u of authUsersList.users) {
        if (u.email === 'admin@patra.com' || u.email === 'demo@patra.com') {
          console.log(`   Deleting native auth user: ${u.email}`);
          const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
          if (delErr) console.warn(`   Failed to delete native auth user ${u.email}:`, delErr.message);
        }
      }
    }

    // 2. CLEAR RELATION TABLES (in reverse dependency order to avoid FK conflicts)
    console.log("\n🧹 Clearing existing records to prevent conflicts...");
    
    const deleteReviews = await supabase.from('reviews').delete().neq('id', 0);
    if (deleteReviews.error) console.warn("⚠️ Warning deleting reviews:", deleteReviews.error.message);

    const deleteOrderItems = await supabase.from('order_items').delete().neq('id', 0);
    if (deleteOrderItems.error) console.warn("⚠️ Warning deleting order_items:", deleteOrderItems.error.message);

    const deleteOrders = await supabase.from('orders').delete().neq('id', 0);
    if (deleteOrders.error) console.warn("⚠️ Warning deleting orders:", deleteOrders.error.message);

    const deleteCartItems = await supabase.from('cart').delete().neq('id', 0);
    if (deleteCartItems.error) console.warn("⚠️ Warning deleting cart:", deleteCartItems.error.message);

    const deleteUsers = await supabase.from('users').delete().neq('email', 'placeholder');
    if (deleteUsers.error) console.warn("⚠️ Warning deleting users:", deleteUsers.error.message);

    const deleteProducts = await supabase.from('products').delete().neq('id', 0);
    if (deleteProducts.error) console.warn("⚠️ Warning deleting products:", deleteProducts.error.message);

    console.log("✨ Table cleanups finished successfully.");

    // 3. CREATE NATIVE AUTH USERS IN SUPABASE AUTH
    console.log("\n🔑 Creating native Supabase Auth users...");
    
    console.log("   Creating user: admin@patra.com");
    const { data: adminAuth, error: adminAuthErr } = await supabase.auth.admin.createUser({
      email: 'admin@patra.com',
      password: 'admin123',
      email_confirm: true,
      user_metadata: { name: 'Admin User', role: 'admin' }
    });
    if (adminAuthErr) throw new Error(`Failed to create admin in auth: ${adminAuthErr.message}`);

    console.log("   Creating user: demo@patra.com");
    const { data: demoAuth, error: demoAuthErr } = await supabase.auth.admin.createUser({
      email: 'demo@patra.com',
      password: 'demo123',
      email_confirm: true,
      user_metadata: { name: 'Amiya Patra', role: 'customer' }
    });
    if (demoAuthErr) throw new Error(`Failed to create demo customer in auth: ${demoAuthErr.message}`);
    
    console.log("✅ Native auth users created successfully.");

    const adminUuid = adminAuth.user.id;
    const demoUuid = demoAuth.user.id;

    // 4. SEED PRODUCTS (Omit ID to support GENERATED ALWAYS AS IDENTITY columns)
    console.log("\n📦 Seeding 'products' table...");
    const mappedProducts = products.map(p => ({
      name: p.name,
      category: p.category,
      price: p.price,
      image: p.image,
      rating: p.rating || 0,
      stock: p.stock || 0,
      description: p.description || "",
      brand: getBrandFromName(p.name)
    }));

    const { error: prodErr } = await supabase.from('products').insert(mappedProducts);
    if (prodErr) throw new Error(`Error inserting products: ${prodErr.message}`);
    console.log(`✅ Seeded ${products.length} products successfully.`);

    // Fetch newly created product database IDs to link them correctly to orders and reviews
    const { data: dbProds, error: fetchProdsErr } = await supabase.from('products').select('id, name');
    if (fetchProdsErr || !dbProds) throw new Error(`Failed to fetch inserted products for ID mapping: ${fetchProdsErr?.message}`);
    
    const prodNameToId = new Map(dbProds.map(p => [p.name, p.id]));
    console.log("ℹ️ Product database IDs mapped successfully.");

    // 5. SEED USERS PROFILES (Using native auth UUIDs!)
    console.log("👤 Seeding 'users' profile table...");
    const profileUsers = [
      {
        id: adminUuid,
        email: "admin@patra.com",
        name: "Admin User",
        phone: "+91 98765 43210",
        address: JSON.stringify({ street: "KIIT Chowk, Patia", city: "Bhubaneswar", state: "Odisha", zip: "751024" })
      },
      {
        id: demoUuid,
        email: "demo@patra.com",
        name: "Amiya Patra",
        phone: "+91 87654 32109",
        address: JSON.stringify({ street: "42 Janpath Road", city: "Bhubaneswar", state: "Odisha", zip: "751001" })
      }
    ];

    const { error: userErr } = await supabase.from('users').insert(profileUsers);
    if (userErr) throw new Error(`Error inserting user profiles: ${userErr.message}`);
    console.log(`✅ Seeded user profiles successfully.`);

    // 6. SEED ORDERS AND ORDER ITEMS
    console.log("📋 Seeding 'orders' and 'order_items' table...");
    for (const o of orders) {
      const orderUserUuid = o.userId === 2 ? demoUuid : adminUuid;

      // Insert Order (Omit ID to support GENERATED ALWAYS AS IDENTITY columns)
      const { data: newOrd, error: ordInsErr } = await supabase.from('orders').insert([{
        user_id: orderUserUuid,
        total: o.total,
        order_status: o.status,
        payment_status: 'Paid'
      }]).select('id').maybeSingle();
      
      if (ordInsErr || !newOrd) throw new Error(`Error inserting order ${o.id}: ${ordInsErr?.message || 'no order returned'}`);

      // Insert Order Items
      const orderItemsPayload = o.items.map(i => {
        const dbProductId = prodNameToId.get(i.name);
        if (!dbProductId) throw new Error(`Could not map product '${i.name}' to database ID during order seeding.`);
        return {
          order_id: newOrd.id,
          product_id: dbProductId,
          quantity: i.quantity,
          price: i.price
        };
      });

      const { error: itemInsErr } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemInsErr) throw new Error(`Error inserting items for order ${o.id}: ${itemInsErr.message}`);
    }
    console.log(`✅ Seeded ${orders.length} orders and their order items successfully.`);

    // 7. SEED REVIEWS
    console.log("⭐️ Seeding 'reviews' table...");
    const mappedReviews = reviews.map(r => {
      const mockProd = products.find(p => p.id === r.productId);
      const dbProductId = mockProd ? prodNameToId.get(mockProd.name) : null;
      if (!dbProductId) throw new Error(`Could not map product ID ${r.productId} to database ID during review seeding.`);
      return {
        product_id: dbProductId,
        user_id: r.userId === 2 ? demoUuid : adminUuid,
        rating: r.rating,
        comment: r.comment
      };
    });

    const { error: reviewErr } = await supabase.from('reviews').insert(mappedReviews);
    if (reviewErr) throw new Error(`Error inserting reviews: ${reviewErr.message}`);
    console.log(`✅ Seeded ${reviews.length} reviews successfully.`);

    console.log("\n🎉 Database fully seeded and native auth fully operational!");
  } catch (error) {
    console.error("\n❌ Seeding failed with an error:");
    console.error(error.message);
    process.exit(1);
  }
}

seedDatabase();
