require('dotenv').config();
const express = require('express');
const path = require('path');
const supabase = require('./data/supabase');
const { products: seedProducts } = require('./data/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ CORS MIDDLEWARE ============
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isLocalhost = /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
    const isAllowedRender = origin === 'https://e-com-kyzr.onrender.com' || origin.endsWith('.onrender.com');
    
    if (isLocalhost || isAllowedRender) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ ADMIN PAGE PROTECTION ============
async function requireAdminPage(req, res, next) {
  try {
    const cookies = {};
    if (req.headers.cookie) {
      req.headers.cookie.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length >= 2) {
          cookies[parts[0].trim()] = parts[1].trim();
        }
      });
    }
    const token = cookies['pe_token'];

    if (!token) {
      return res.redirect('/account.html?redirect=admin.html&error=login_required');
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.redirect('/account.html?redirect=admin.html&error=session_expired');
    }

    const { data: profile } = await supabase.from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const role = profile?.role || user.user_metadata?.role || (user.email === 'admin@patra.com' ? 'admin' : 'customer');

    if (role !== 'admin') {
      return res.redirect('/index.html?error=unauthorized');
    }

    next();
  } catch (err) {
    console.error("Admin Page Protection Error:", err.message);
    res.redirect('/index.html?error=error');
  }
}

app.get('/admin.html', requireAdminPage);
app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/product/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'product.html'));
});

app.use(express.static(path.join(__dirname)));

// ============ CONFIG ENDPOINT ============
// Exposes the public URL and Anon Key so the frontend client can connect safely
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// ============ AUTH MIDDLEWARE ============
// Decrypts and validates standard Bearer JWT Access Tokens sent by Supabase Auth
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token required (Bearer JWT)' });
    }
    const token = authHeader.split(' ')[1];
    
    // Validate JWT via Supabase
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Session expired or invalid token' });
    }
    
    // Resolve profile from public.users profile table by primary key (UUID)
    const { data: profile, error: profErr } = await supabase.from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
      
    let userProfile = profile;
    
    if (profErr || !profile) {
      // Auto-reconcile / register public user profile if they exist in auth but not profile table
      const { data: newProfile, error: insErr } = await supabase.from('users').insert([{
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email.split('@')[0],
        phone: '',
        address: '{}'
      }]).select().maybeSingle();
      
      if (insErr || !newProfile) {
        console.error("Auto-profile insertion failed:", insErr ? insErr.message : 'no profile returned');
        userProfile = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email.split('@')[0],
          phone: '',
          address: '{}'
        };
      } else {
        userProfile = newProfile;
      }
    }
    
    // Parse address field (expected to be stringified JSON in DB)
    let parsedAddress = {};
    try {
      if (userProfile.address) {
        parsedAddress = typeof userProfile.address === 'string' ? JSON.parse(userProfile.address) : userProfile.address;
      }
    } catch (e) {
      parsedAddress = { street: userProfile.address, city: '', state: '', zip: '' };
    }

    // Set req.user to standard representation
    req.user = {
      id: userProfile.id,
      email: userProfile.email,
      name: userProfile.name,
      phone: userProfile.phone || '',
      address: parsedAddress,
      role: userProfile.role || user.user_metadata?.role || (userProfile.email === 'admin@patra.com' ? 'admin' : 'customer'),
      created_at: userProfile.created_at
    };
    
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ============ HELPER ============
function getFirstImage(imageField) {
  if (!imageField) return 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600&h=600&fit=crop';
  const imgStr = String(imageField).trim();
  if (imgStr.startsWith('{') || imgStr.startsWith('[')) {
    try {
      const parsed = JSON.parse(imgStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0];
      } else if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
        return parsed.images[0];
      }
    } catch (e) {
      console.error("Failed to parse image field in getFirstImage:", e);
    }
  }
  return imageField;
}

async function processBase64Images(imagesArray) {
  if (!imagesArray || !Array.isArray(imagesArray)) return [];
  
  const processedUrls = [];
  for (const img of imagesArray) {
    if (typeof img === 'string' && img.startsWith('data:image/')) {
      try {
        const matches = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64 format");
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!allowedTypes.includes(mimeType)) {
          throw new Error(`Invalid file type: ${mimeType}. Only JPG, PNG, and WebP are allowed.`);
        }
        
        if (buffer.length > 5 * 1024 * 1024) {
          throw new Error(`File size too large. Maximum allowed is 5MB.`);
        }
        
        const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const filePath = `products/${fileName}`;
        
        console.log(`Uploading ${filePath} to Supabase Storage...`);
        const { data, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, buffer, {
            contentType: mimeType,
            upsert: true
          });
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);
          
        if (!publicUrlData || !publicUrlData.publicUrl) {
          throw new Error("Failed to generate public URL");
        }
        
        processedUrls.push(publicUrlData.publicUrl);
        console.log(`Successfully uploaded. Public URL: ${publicUrlData.publicUrl}`);
      } catch (err) {
        console.error("Base64 upload error:", err.message);
        throw new Error(`Image upload failed: ${err.message}`);
      }
    } else if (typeof img === 'string' && img.trim() !== '') {
      processedUrls.push(img.trim());
    }
  }
  return processedUrls;
}

function enrichProduct(dbProduct) {
  if (!dbProduct) return null;
  
  // Parse images array and specs object from dbProduct.image JSON column
  let images = [];
  let image = dbProduct.image;
  let specs = {};
  
  if (dbProduct.image) {
    const imgStr = String(dbProduct.image).trim();
    if (imgStr.startsWith('{') || imgStr.startsWith('[')) {
      try {
        const parsed = JSON.parse(imgStr);
        if (Array.isArray(parsed)) {
          images = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.images)) {
            images = parsed.images;
          }
          if (parsed.specs && typeof parsed.specs === 'object') {
            specs = parsed.specs;
          }
        }
      } catch (e) {
        console.error("Failed to parse image JSON:", e);
      }
    }
  }
  
  if (images.length === 0) {
    images = dbProduct.image ? [dbProduct.image] : ['https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600&h=600&fit=crop'];
  }
  
  // Ensure product.image is the first image URL for single-image compatibility
  image = images[0];
  
  const mockProduct = seedProducts.find(p => p.name === dbProduct.name) || {};
  const price = Number(dbProduct.price);
  const oldPrice = mockProduct.oldPrice || undefined;
  const discount = oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  
  return {
    ...dbProduct,
    image,
    images,
    price,
    oldPrice,
    discount,
    badge: mockProduct.badge || null,
    isNew: mockProduct.isNew || false,
    specs: Object.keys(specs).length > 0 ? specs : (mockProduct.specs || {}),
    reviews: dbProduct.reviews || mockProduct.reviews || 0,
    stockStatus: dbProduct.stock > 10 ? 'In Stock' : dbProduct.stock > 0 ? 'Low Stock' : 'Out of Stock'
  };
}

// ============ SLUG GENERATION HELPERS ============
function generateSlug(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')         // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')   // Remove special characters (keep alphanumeric and hyphen)
    .replace(/\-+/g, '-')         // Replace multiple hyphens with a single one
    .replace(/^-+/, '')           // Trim hyphens from beginning
    .replace(/-+$/, '');          // Trim hyphens from end
}

async function generateUniqueSlug(baseText, productId = null) {
  const baseSlug = generateSlug(baseText) || 'product';
  let uniqueSlug = baseSlug;
  let suffix = 1;
  let exists = true;
  
  while (exists) {
    let query = supabase.from('products').select('id').eq('slug', uniqueSlug);
    if (productId) {
      query = query.neq('id', productId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Error checking slug uniqueness:", error.message);
      throw error;
    }
    
    if (data && data.length > 0) {
      uniqueSlug = `${baseSlug}-${suffix}`;
      suffix++;
    } else {
      exists = false;
    }
  }
  return uniqueSlug;
}

// ============ PRODUCT API ============
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, sort, minPrice, maxPrice, rating, limit } = req.query;
    
    let query = supabase.from('products').select('*');
    
    if (category && category !== 'All') {
      query = query.eq('category', category);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%,brand.ilike.%${search}%`);
    }
    
    if (minPrice) {
      query = query.gte('price', Number(minPrice));
    }
    if (maxPrice) {
      query = query.lte('price', Number(maxPrice));
    }
    if (rating) {
      query = query.gte('rating', Number(rating));
    }
    
    if (sort === 'price-asc') {
      query = query.order('price', { ascending: true });
    } else if (sort === 'price-desc') {
      query = query.order('price', { ascending: false });
    } else if (sort === 'rating') {
      query = query.order('rating', { ascending: false });
    } else {
      query = query.order('id', { ascending: true });
    }
    
    if (limit) {
      query = query.limit(Number(limit));
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    res.json((data || []).map(enrichProduct));
  } catch (err) {
    console.error("Error in GET /api/products:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('category');
    if (error) throw error;
    const cats = [...new Set((data || []).map(p => p.category))];
    res.json(cats);
  } catch (err) {
    console.error("Error in GET /api/products/categories:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    
    // Fetch product
    const { data: product, error: prodErr } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
    if (prodErr) throw prodErr;
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    // Fetch product reviews directly (independent of relation foreign key constraints)
    const { data: prodReviews, error: revErr } = await supabase.from('reviews')
      .select('*')
      .eq('product_id', productId);
    if (revErr) throw revErr;
    
    // Manually map review authors
    let formattedReviews = [];
    if (prodReviews && prodReviews.length > 0) {
      const userIds = [...new Set(prodReviews.map(r => r.user_id))];
      const { data: usersData, error: usersErr } = await supabase.from('users')
        .select('id, name')
        .in('id', userIds);
      
      const userMap = {};
      if (!usersErr && usersData) {
        usersData.forEach(u => {
          userMap[u.id] = u.name;
        });
      }
      
      formattedReviews = prodReviews.map(r => ({
        id: r.id,
        productId: r.product_id,
        userId: r.user_id,
        name: userMap[r.user_id] || 'Amiya Patra',
        rating: r.rating,
        comment: r.comment,
        date: r.created_at ? r.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
      }));
    }
    
    // Fetch related products
    const { data: relatedData, error: relErr } = await supabase.from('products')
      .select('*')
      .eq('category', product.category)
      .neq('id', productId)
      .limit(4);
    if (relErr) throw relErr;
    
    const enrichedProduct = enrichProduct(product);
    const related = (relatedData || []).map(enrichProduct);
    
    res.json({ ...enrichedProduct, reviews: formattedReviews, related });
  } catch (err) {
    console.error("Error in GET /api/products/:id:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin Operations (Secured by requireAuth & Role checks)
app.post('/api/products', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const { name, slug, category, price, image, description, stock, brand, specs } = req.body;
    
    // Validate and sanitize specifications
    let validatedSpecs = {};
    if (specs && typeof specs === 'object') {
      Object.entries(specs).forEach(([k, v]) => {
        if (k && k.trim() !== '' && v !== null && v !== undefined) {
          validatedSpecs[k.trim()] = String(v).trim();
        }
      });
    }
    
    const processedUrls = Array.isArray(image) ? await processBase64Images(image) : (typeof image === 'string' && image.trim() !== '' ? [image.trim()] : []);
    const dbImage = JSON.stringify({
      images: processedUrls,
      specs: validatedSpecs
    });
    
    const baseSlugSource = (slug && slug.trim() !== '') ? slug : name;
    const finalSlug = await generateUniqueSlug(baseSlugSource);
    
    const { data, error } = await supabase.from('products').insert([{
      name,
      category,
      price: Number(price),
      image: dbImage,
      description,
      stock: stock ? Number(stock) : 0,
      brand: brand || 'Electronic World',
      rating: 0,
      slug: finalSlug
    }]).select().maybeSingle();
    
    if (error || !data) throw error || new Error("Failed to insert product");
    res.status(201).json(enrichProduct(data));
  } catch (err) {
    console.error("Error in POST /api/products:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const productId = Number(req.params.id);
    const updatePayload = { ...req.body };
    
    // Omit fields not in database schema
    delete updatePayload.oldPrice;
    delete updatePayload.isNew;
    delete updatePayload.specs;
    delete updatePayload.badge;
    delete updatePayload.reviews;
    
    if (req.body.slug !== undefined) {
      const baseSlugSource = (req.body.slug && req.body.slug.trim() !== '') ? req.body.slug : (req.body.name || '');
      updatePayload.slug = await generateUniqueSlug(baseSlugSource, productId);
    }
    
    // Safely retrieve existing product image data for merging
    const { data: existing, error: getErr } = await supabase.from('products')
      .select('image')
      .eq('id', productId)
      .maybeSingle();
      
    if (getErr || !existing) return res.status(404).json({ error: 'Product not found' });
    
    let existingImages = [];
    let existingSpecs = {};
    
    if (existing.image) {
      const imgStr = String(existing.image).trim();
      if (imgStr.startsWith('{') || imgStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(imgStr);
          if (Array.isArray(parsed)) {
            existingImages = parsed;
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.images)) existingImages = parsed.images;
            if (parsed.specs && typeof parsed.specs === 'object') existingSpecs = parsed.specs;
          }
        } catch {}
      } else {
        existingImages = [existing.image];
      }
    }
    
    let shouldUpdateImage = false;
    let newImages = existingImages;
    let newSpecs = existingSpecs;
    
    if (req.body.image !== undefined) {
      shouldUpdateImage = true;
      if (Array.isArray(req.body.image)) {
        newImages = await processBase64Images(req.body.image);
      } else if (typeof req.body.image === 'string' && req.body.image.trim() !== '') {
        newImages = [req.body.image.trim()];
      } else {
        newImages = [];
      }
    }
    
    if (req.body.specs !== undefined) {
      shouldUpdateImage = true;
      let validatedSpecs = {};
      if (req.body.specs && typeof req.body.specs === 'object') {
        Object.entries(req.body.specs).forEach(([k, v]) => {
          if (k && k.trim() !== '' && v !== null && v !== undefined) {
            validatedSpecs[k.trim()] = String(v).trim();
          }
        });
      }
      newSpecs = validatedSpecs;
    }
    
    if (shouldUpdateImage) {
      updatePayload.image = JSON.stringify({ images: newImages, specs: newSpecs });
    }
    
    const { data, error } = await supabase.from('products')
      .update(updatePayload)
      .eq('id', productId)
      .select()
      .maybeSingle();
      
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });
    
    res.json(enrichProduct(data));
  } catch (err) {
    console.error("Error in PUT /api/products/:id:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const productId = Number(req.params.id);
    
    // First clear dependencies in order items and reviews
    await supabase.from('order_items').delete().eq('product_id', productId);
    await supabase.from('reviews').delete().eq('product_id', productId);
    await supabase.from('cart').delete().eq('product_id', productId);

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /api/products/:id:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ CART API ============
app.get('/api/cart/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: cart mismatch' });
    }
    
    const { data, error } = await supabase.from('cart').select('*, products(*)').eq('user_id', userId);
    if (error) throw error;
    
    const enriched = (data || []).map(item => {
      const enrichedProd = enrichProduct(item.products);
      return {
        productId: item.product_id,
        quantity: item.quantity,
        product: enrichedProd
      };
    });
    
    const total = enriched.reduce((sum, item) => sum + (item.product ? item.product.price * item.quantity : 0), 0);
    const savings = enriched.reduce((sum, item) => sum + (item.product && item.product.oldPrice ? (item.product.oldPrice - item.product.price) * item.quantity : 0), 0);
    const count = enriched.reduce((sum, item) => sum + item.quantity, 0);
    
    res.json({ items: enriched, total, savings, count });
  } catch (err) {
    console.error("Error in GET /api/cart/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: cart mismatch' });
    }
    const { productId, quantity = 1 } = req.body;
    
    const { data: existing, error: findErr } = await supabase.from('cart')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
      
    if (findErr) throw findErr;
    
    if (existing) {
      const { error: updErr } = await supabase.from('cart')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from('cart')
        .insert([{ user_id: userId, product_id: Number(productId), quantity }]);
      if (insErr) throw insErr;
    }
    
    const { data: updatedCart, error: getErr } = await supabase.from('cart').select('*').eq('user_id', userId);
    if (getErr) throw getErr;
    
    res.json({ success: true, cart: updatedCart.map(item => ({ productId: item.product_id, quantity: item.quantity })) });
  } catch (err) {
    console.error("Error in POST /api/cart/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cart/:userId/:productId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: cart mismatch' });
    }
    const productId = Number(req.params.productId);
    const newQty = Number(req.body.quantity);
    
    if (newQty <= 0) {
      const { error } = await supabase.from('cart')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('cart')
        .update({ quantity: newQty })
        .eq('user_id', userId)
        .eq('product_id', productId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Item not in cart' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error in PUT /api/cart/:userId/:productId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:userId/:productId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: cart mismatch' });
    }
    const productId = Number(req.params.productId);
    
    const { error } = await supabase.from('cart')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /api/cart/:userId/:productId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: cart mismatch' });
    }
    const { error } = await supabase.from('cart').delete().eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /api/cart/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ PROFILE API ============
app.get('/api/auth/profile/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: profile mismatch' });
    }
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: profile mismatch' });
    }
    
    const updates = { ...req.body };
    delete updates.role; // Block malicious privilege escalations
    delete updates.email; // Block key index mutations
    delete updates.id; // Block id index mutations
    
    // Stringify address if it is an object
    if (updates.address && typeof updates.address === 'object') {
      updates.address = JSON.stringify(updates.address);
    }
    
    const { data: userProfile, error } = await supabase.from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .maybeSingle();
      
    if (error) throw error;
    if (!userProfile) return res.status(404).json({ error: 'User profile not found' });
    
    let parsedAddress = {};
    try {
      if (userProfile.address) {
        parsedAddress = typeof userProfile.address === 'string' ? JSON.parse(userProfile.address) : userProfile.address;
      }
    } catch {
      parsedAddress = { street: userProfile.address, city: '', state: '', zip: '' };
    }

    res.json({
      id: userProfile.id,
      email: userProfile.email,
      name: userProfile.name,
      phone: userProfile.phone || '',
      address: parsedAddress,
      role: req.user.role,
      created_at: userProfile.created_at
    });
  } catch (err) {
    console.error("Error in PUT /api/auth/profile/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ ORDER API ============
app.get('/api/orders/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: order history mismatch' });
    }
    
    const { data: dbOrders, error } = await supabase.from('orders')
      .select('*, order_items(*, products(*))')
      .eq('user_id', userId)
      .order('id', { ascending: false });
      
    if (error) throw error;
    
    const formatted = (dbOrders || []).map(o => {
      const items = (o.order_items || []).map(oi => ({
        productId: oi.product_id,
        name: oi.products?.name || 'Product',
        price: Number(oi.price),
        quantity: oi.quantity,
        image: getFirstImage(oi.products?.image)
      }));
      
      const dateStr = o.created_at ? o.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
      
      let history = [];
      if (o.tracking_history) {
        try {
          history = typeof o.tracking_history === 'string' 
            ? JSON.parse(o.tracking_history) 
            : o.tracking_history;
        } catch {}
      }
      
      if (!Array.isArray(history) || history.length === 0) {
        // Fallback baseline for older orders
        history = [
          { status: 'Order Placed', date: dateStr, time: '10:30 AM' }
        ];
        if (o.order_status === 'Confirmed' || o.order_status === 'Packed' || o.order_status === 'Shipped' || o.order_status === 'Out for Delivery' || o.order_status === 'Delivered') {
          history.push({ status: 'Confirmed', date: dateStr, time: '11:15 AM' });
        }
        if (o.order_status === 'Packed' || o.order_status === 'Shipped' || o.order_status === 'Out for Delivery' || o.order_status === 'Delivered') {
          history.push({ status: 'Packed', date: dateStr, time: '01:30 PM' });
        }
        if (o.order_status === 'Shipped' || o.order_status === 'Out for Delivery' || o.order_status === 'Delivered') {
          history.push({ status: 'Shipped', date: dateStr, time: '04:20 PM' });
        }
        if (o.order_status === 'Out for Delivery' || o.order_status === 'Delivered') {
          history.push({ status: 'Out for Delivery', date: dateStr, time: '09:00 AM' });
        }
        if (o.order_status === 'Delivered') {
          history.push({ status: 'Delivered', date: dateStr, time: '03:45 PM' });
        }
        if (o.order_status === 'Cancelled') {
          history.push({ status: 'Cancelled', date: dateStr, time: '12:00 PM' });
        }
      }
      
      const tracking = {
        carrier: 'Delhivery',
        trackingId: `DL${(o.id + 192837465).toString().slice(-10)}`,
        steps: history
      };
      
      let orderAddress = {};
      if (o.shipping_address) {
        try {
          orderAddress = typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address;
        } catch (e) {
          orderAddress = { street: o.shipping_address, city: '', state: '', zip: '' };
        }
      } else {
        orderAddress = req.user.address || {};
      }
      
      return {
        id: `EW-${o.id}`,
        userId: o.user_id,
        items,
        total: Number(o.total),
        status: o.order_status || 'Processing',
        date: dateStr,
        tracking,
        address: orderAddress,
        payment: o.payment_method || 'Card'
      };
    });
    
    res.json(formatted);
  } catch (err) {
    console.error("Error in GET /api/orders/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/track/:orderId', requireAuth, async (req, res) => {
  try {
    const numericId = Number(req.params.orderId.replace(/^EW-/, ''));
    if (isNaN(numericId)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const { data: order, error } = await supabase.from('orders')
      .select('*, order_items(*, products(*))')
      .eq('id', numericId)
      .maybeSingle();
      
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: not your order' });
    }
    
    const items = (order.order_items || []).map(oi => ({
      productId: oi.product_id,
      name: oi.products?.name || 'Product',
      price: Number(oi.price),
      quantity: oi.quantity,
      image: getFirstImage(oi.products?.image)
    }));
    
    const dateStr = order.created_at ? order.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
    
    let history = [];
    if (order.tracking_history) {
      try {
        history = typeof order.tracking_history === 'string' 
          ? JSON.parse(order.tracking_history) 
          : order.tracking_history;
      } catch {}
    }
    
    if (!Array.isArray(history) || history.length === 0) {
      // Fallback baseline for older orders
      history = [
        { status: 'Order Placed', date: dateStr, time: '10:30 AM' }
      ];
      if (order.order_status === 'Confirmed' || order.order_status === 'Packed' || order.order_status === 'Shipped' || order.order_status === 'Out for Delivery' || order.order_status === 'Delivered') {
        history.push({ status: 'Confirmed', date: dateStr, time: '11:15 AM' });
      }
      if (order.order_status === 'Packed' || order.order_status === 'Shipped' || order.order_status === 'Out for Delivery' || order.order_status === 'Delivered') {
        history.push({ status: 'Packed', date: dateStr, time: '01:30 PM' });
      }
      if (order.order_status === 'Shipped' || order.order_status === 'Out for Delivery' || order.order_status === 'Delivered') {
        history.push({ status: 'Shipped', date: dateStr, time: '04:20 PM' });
      }
      if (order.order_status === 'Out for Delivery' || order.order_status === 'Delivered') {
        history.push({ status: 'Out for Delivery', date: dateStr, time: '09:00 AM' });
      }
      if (order.order_status === 'Delivered') {
        history.push({ status: 'Delivered', date: dateStr, time: '03:45 PM' });
      }
      if (order.order_status === 'Cancelled') {
        history.push({ status: 'Cancelled', date: dateStr, time: '12:00 PM' });
      }
    }
    
    const tracking = {
      carrier: 'Delhivery',
      trackingId: `DL${(order.id + 192837465).toString().slice(-10)}`,
      steps: history
    };
    
    let orderAddress = {};
    if (order.shipping_address) {
      try {
        orderAddress = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address;
      } catch (e) {
        orderAddress = { street: order.shipping_address, city: '', state: '', zip: '' };
      }
    } else {
      if (order.user_id === req.user.id) {
        orderAddress = req.user.address || {};
      } else {
        const { data: uProfile } = await supabase.from('users').select('address').eq('id', order.user_id).maybeSingle();
        if (uProfile && uProfile.address) {
          try {
            orderAddress = JSON.parse(uProfile.address);
          } catch {
            orderAddress = { street: uProfile.address, city: '', state: '', zip: '' };
          }
        }
      }
    }
    
    const formatted = {
      id: `EW-${order.id}`,
      userId: order.user_id,
      items,
      total: Number(order.total),
      status: order.order_status || 'Processing',
      date: dateStr,
      tracking,
      address: orderAddress,
      payment: order.payment_method || 'Card'
    };
    
    res.json(formatted);
  } catch (err) {
    console.error("Error in GET /api/orders/track/:orderId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { userId, items, total, paymentMethod, shippingAddress } = req.body;
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied: user identity mismatch' });
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    const initialTracking = [
      { status: 'Order Placed', date: dateStr, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }
    ];
    
    // Insert into orders
    const { data: newOrder, error: insErr } = await supabase.from('orders').insert([{
      user_id: userId,
      total: Number(total),
      order_status: 'Processing',
      payment_status: 'Paid',
      payment_method: paymentMethod || 'Card',
      shipping_address: shippingAddress ? (typeof shippingAddress === 'object' ? JSON.stringify(shippingAddress) : shippingAddress) : null,
      tracking_history: JSON.stringify(initialTracking)
    }]).select().maybeSingle();
    
    if (insErr || !newOrder) throw insErr || new Error("Failed to insert order");
    
    // Insert into order_items
    const orderItemsPayload = items.map(i => ({
      order_id: newOrder.id,
      product_id: i.productId,
      quantity: i.quantity,
      price: i.price
    }));
    const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload);
    if (itemsErr) throw itemsErr;
    
    // Clear user cart
    const { error: clearCartErr } = await supabase.from('cart').delete().eq('user_id', userId);
    if (clearCartErr) console.error("Warning clearing cart after order:", clearCartErr.message);
    
    const tracking = {
      carrier: 'Delhivery',
      trackingId: `DL${(newOrder.id + 192837465).toString().slice(-10)}`,
      steps: initialTracking
    };
    
    let orderAddress = {};
    if (newOrder.shipping_address) {
      try {
        orderAddress = typeof newOrder.shipping_address === 'string' ? JSON.parse(newOrder.shipping_address) : newOrder.shipping_address;
      } catch (e) {
        orderAddress = { street: newOrder.shipping_address, city: '', state: '', zip: '' };
      }
    } else {
      orderAddress = req.user.address || {};
    }

    const formatted = {
      id: `EW-${newOrder.id}`,
      userId: newOrder.user_id,
      items: items.map(i => ({ ...i, quantity: Number(i.quantity), price: Number(i.price) })),
      total: Number(newOrder.total),
      status: 'Processing',
      date: dateStr,
      tracking,
      address: orderAddress,
      payment: newOrder.payment_method || 'Card'
    };
    
    res.status(201).json(formatted);
  } catch (err) {
    console.error("Error in POST /api/orders:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:orderId/status', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const numericId = Number(req.params.orderId.replace(/^EW-/, ''));
    const { status } = req.body;
    
    // Fetch current order to append tracking history
    const { data: existing, error: getErr } = await supabase.from('orders')
      .select('tracking_history, created_at')
      .eq('id', numericId)
      .maybeSingle();
      
    if (getErr || !existing) return res.status(404).json({ error: 'Order not found' });
    
    let history = [];
    if (existing.tracking_history) {
      try {
        history = typeof existing.tracking_history === 'string' 
          ? JSON.parse(existing.tracking_history) 
          : existing.tracking_history;
      } catch {}
    }
    
    const dateStr = existing.created_at ? existing.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
    if (!Array.isArray(history) || history.length === 0) {
      history = [{ status: 'Order Placed', date: dateStr, time: '10:30 AM' }];
    }
    
    // Append new status
    const lastStep = history[history.length - 1];
    if (!lastStep || lastStep.status !== status) {
      const now = new Date();
      history.push({
        status: status,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      });
    }
    
    const { data: updatedOrder, error: updErr } = await supabase.from('orders')
      .update({ 
        order_status: status,
        tracking_history: JSON.stringify(history)
      })
      .eq('id', numericId)
      .select()
      .maybeSingle();
      
    if (updErr || !updatedOrder) throw updErr || new Error("Order not found");
    
    res.json({ success: true, status: updatedOrder.order_status, tracking_history: history });
  } catch (err) {
    console.error("Error in PUT /api/orders/:orderId/status:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ ADMIN API ============
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const { data: prods, error: prodErr } = await supabase.from('products').select('category, stock');
    if (prodErr) throw prodErr;
    
    const { data: ords, error: ordErr } = await supabase.from('orders').select('*');
    if (ordErr) throw ordErr;
    
    const { data: custs, error: custErr } = await supabase.from('users').select('id');
    if (custErr) throw custErr;
    
    const totalProducts = prods.length;
    const totalOrders = ords.length;
    const totalRevenue = ords.reduce((sum, o) => sum + Number(o.total), 0);
    const totalUsers = custs.length;
    const inStock = prods.filter(p => p.stock > 0).length;
    const outOfStock = prods.filter(p => p.stock === 0).length;
    
    const categoryCounts = {};
    prods.forEach(p => { categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1; });
    
    const recentOrders = ords.slice(-5).reverse().map(o => ({
      id: `EW-${o.id}`,
      userId: o.user_id,
      total: Number(o.total),
      status: o.order_status || 'Processing',
      date: o.created_at ? o.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    }));
    
    res.json({ totalProducts, totalOrders, totalRevenue, totalUsers, inStock, outOfStock, categoryCounts, recentOrders });
  } catch (err) {
    console.error("Error in GET /api/admin/stats:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const { data: ords, error } = await supabase.from('orders')
      .select('*, order_items(*, products(*))')
      .order('id', { ascending: false });
    if (error) throw error;
    
    const formatted = (ords || []).map(o => {
      const items = (o.order_items || []).map(oi => ({
        productId: oi.product_id,
        name: oi.products?.name || 'Product',
        price: Number(oi.price),
        quantity: oi.quantity,
        image: getFirstImage(oi.products?.image)
      }));

      let orderAddress = {};
      if (o.shipping_address) {
        try {
          orderAddress = typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address;
        } catch (e) {
          orderAddress = { street: o.shipping_address, city: '', state: '', zip: '' };
        }
      }
      
      return {
        id: `EW-${o.id}`,
        userId: o.user_id,
        items,
        total: Number(o.total),
        status: o.order_status || 'Processing',
        date: o.created_at ? o.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        payment: o.payment_method || 'Card',
        address: orderAddress
      };
    });
    
    res.json(formatted);
  } catch (err) {
    console.error("Error in GET /api/admin/orders:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    let usrs = [];
    
    // Attempt to query the role column dynamically in case it exists in the database
    const { data: dataWithRole, error: errWithRole } = await supabase.from('users')
      .select('id, email, name, phone, address, role');
      
    if (!errWithRole) {
      usrs = dataWithRole || [];
    } else {
      // Fallback: select without role column if column does not exist
      const { data: dataWithoutRole, error: errWithoutRole } = await supabase.from('users')
        .select('id, email, name, phone, address');
      if (errWithoutRole) throw errWithoutRole;
      usrs = dataWithoutRole || [];
    }
    
    const formatted = (usrs || []).map(u => {
      let parsedAddress = {};
      try {
        parsedAddress = typeof u.address === 'string' ? JSON.parse(u.address) : u.address;
      } catch {
        parsedAddress = { street: u.address, city: '', state: '', zip: '' };
      }
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        address: parsedAddress,
        role: u.role || (u.email === 'admin@patra.com' ? 'admin' : 'customer')
      };
    });
    res.json(formatted);
  } catch (err) {
    console.error("Error in GET /api/admin/users:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ WISHLIST API ============
app.get('/api/wishlist/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: wishlist mismatch' });
    }
    
    const { data: userProfile, error: getErr } = await supabase.from('users')
      .select('address')
      .eq('id', userId)
      .maybeSingle();
      
    if (getErr || !userProfile) return res.status(404).json({ error: 'User profile not found' });
    
    let parsedAddress = {};
    try {
      if (userProfile.address) {
        parsedAddress = typeof userProfile.address === 'string' ? JSON.parse(userProfile.address) : userProfile.address;
      }
    } catch {}
    
    const wishlistIds = Array.isArray(parsedAddress.wishlist) ? parsedAddress.wishlist : [];
    if (wishlistIds.length === 0) {
      return res.json([]);
    }
    
    const { data: dbProducts, error: prodErr } = await supabase.from('products')
      .select('*')
      .in('id', wishlistIds);
      
    if (prodErr) throw prodErr;
    
    res.json((dbProducts || []).map(enrichProduct));
  } catch (err) {
    console.error("Error in GET /api/wishlist/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wishlist/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: wishlist mismatch' });
    }
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    
    const { data: userProfile, error: getErr } = await supabase.from('users')
      .select('address')
      .eq('id', userId)
      .maybeSingle();
      
    if (getErr || !userProfile) return res.status(404).json({ error: 'User profile not found' });
    
    let parsedAddress = {};
    try {
      if (userProfile.address) {
        parsedAddress = typeof userProfile.address === 'string' ? JSON.parse(userProfile.address) : userProfile.address;
      }
    } catch {}
    
    let wishlistIds = Array.isArray(parsedAddress.wishlist) ? parsedAddress.wishlist : [];
    if (!wishlistIds.includes(Number(productId))) {
      wishlistIds.push(Number(productId));
    }
    parsedAddress.wishlist = wishlistIds;
    
    const { error: updErr } = await supabase.from('users')
      .update({ address: JSON.stringify(parsedAddress) })
      .eq('id', userId);
      
    if (updErr) throw updErr;
    
    res.json({ success: true, wishlist: wishlistIds });
  } catch (err) {
    console.error("Error in POST /api/wishlist/:userId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/wishlist/:userId/:productId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: wishlist mismatch' });
    }
    const productId = Number(req.params.productId);
    
    const { data: userProfile, error: getErr } = await supabase.from('users')
      .select('address')
      .eq('id', userId)
      .maybeSingle();
      
    if (getErr || !userProfile) return res.status(404).json({ error: 'User profile not found' });
    
    let parsedAddress = {};
    try {
      if (userProfile.address) {
        parsedAddress = typeof userProfile.address === 'string' ? JSON.parse(userProfile.address) : userProfile.address;
      }
    } catch {}
    
    let wishlistIds = Array.isArray(parsedAddress.wishlist) ? parsedAddress.wishlist : [];
    wishlistIds = wishlistIds.filter(id => id !== productId);
    parsedAddress.wishlist = wishlistIds;
    
    const { error: updErr } = await supabase.from('users')
      .update({ address: JSON.stringify(parsedAddress) })
      .eq('id', userId);
      
    if (updErr) throw updErr;
    
    res.json({ success: true, wishlist: wishlistIds });
  } catch (err) {
    console.error("Error in DELETE /api/wishlist/:userId/:productId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ REVIEWS API ============
app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { productId, userId, rating, comment } = req.body;
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied: user identity mismatch' });
    }
    
    // 1. Lock review submissions to verified purchasers only
    const { data: userOrders, error: orderErr } = await supabase.from('orders')
      .select('id, order_items(product_id)')
      .eq('user_id', userId);
      
    if (orderErr) throw orderErr;
    
    const hasPurchased = (userOrders || []).some(o => 
      (o.order_items || []).some(oi => oi.product_id === Number(productId))
    );
    
    if (!hasPurchased) {
      return res.status(403).json({ error: 'Verified Purchase Required: You can only review products you have purchased.' });
    }
    
    // 2. Prevent duplicate reviews from the same user per product
    const { data: existingReview, error: checkErr } = await supabase.from('reviews')
      .select('id')
      .eq('product_id', Number(productId))
      .eq('user_id', userId)
      .maybeSingle();
      
    if (checkErr) throw checkErr;
    if (existingReview) {
      return res.status(400).json({ error: 'Duplicate Review: You have already reviewed this product.' });
    }
    
    const { data, error } = await supabase.from('reviews').insert([{
      product_id: Number(productId),
      user_id: userId,
      rating: Number(rating),
      comment: comment
    }]).select().maybeSingle();
    
    if (error || !data) throw error || new Error("Failed to insert review");
    
    // Recalculate average rating for product
    const { data: allReviews, error: getRevErr } = await supabase.from('reviews')
      .select('rating')
      .eq('product_id', productId);
      
    if (!getRevErr && allReviews && allReviews.length > 0) {
      const newReviewsCount = allReviews.length;
      const averageRating = Number((allReviews.reduce((sum, r) => sum + r.rating, 0) / newReviewsCount).toFixed(1));
      
      const { error: updProdErr } = await supabase.from('products')
        .update({ rating: averageRating })
        .eq('id', productId);
      if (updProdErr) console.error("Warning updating product rating aggregate:", updProdErr.message);
    }
    
    res.status(201).json({
      id: data.id,
      productId: data.product_id,
      userId: data.user_id,
      name: req.user.name,
      rating: data.rating,
      comment: data.comment,
      verifiedPurchase: true,
      date: data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    });
  } catch (err) {
    console.error("Error in POST /api/reviews:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews/:productId', async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const { data, error } = await supabase.from('reviews')
      .select('*, users(name)')
      .eq('product_id', productId);
    if (error) throw error;
    
    // Fetch all orders containing this product to determine verified purchases
    const { data: productOrders, error: orderErr } = await supabase.from('order_items')
      .select('product_id, orders(user_id)')
      .eq('product_id', productId);
      
    const verifiedUserIds = new Set();
    if (!orderErr && productOrders) {
      productOrders.forEach(po => {
        if (po.orders && po.orders.user_id) {
          verifiedUserIds.add(po.orders.user_id);
        }
      });
    }
    
    const formatted = (data || []).map(r => ({
      id: r.id,
      productId: r.product_id,
      userId: r.user_id,
      name: r.users?.name || 'Amiya P.',
      rating: r.rating,
      comment: r.comment,
      verifiedPurchase: verifiedUserIds.has(r.user_id),
      date: r.created_at ? r.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error("Error in GET /api/reviews/:productId:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ NEWSLETTER ============
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    
    const { data: existing, error: checkErr } = await supabase.from('newsletter_subscribers')
      .select('id')
      .eq('email', email)
      .maybeSingle();
      
    if (checkErr) throw checkErr;
    if (existing) return res.status(400).json({ error: 'Already subscribed' });
    
    const { error: insErr } = await supabase.from('newsletter_subscribers').insert([{ email }]);
    if (insErr) throw insErr;
    
    res.json({ success: true, message: 'Thank you for subscribing!' });
  } catch (err) {
    console.error("Error in POST /api/newsletter:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback - Use Express wildcard
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🔌 ELECTRONIC WORLD Server`);
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  ✨ Dynamic backend integrated with Supabase Native Auth`);
});
