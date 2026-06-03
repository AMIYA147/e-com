  /* Admin Dashboard Logic */
document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    showToast('Unauthorized access. Redirecting...', 'error');
    setTimeout(() => window.location.href = '/index.html', 1500);
    return;
  }
  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  initNavbar();
  showAdminPanel('overview');
});

window.showAdminPanel = async function(panel, el) {
  if (el) { document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active')); el.classList.add('active'); }
  const content = document.getElementById('admin-content');

  if (panel === 'overview') {
    try {
      const stats = await authFetch(`${API}/admin/stats`).then(r => r.json());
      content.innerHTML = `
        <h2 style="margin-bottom:24px">Dashboard Overview</h2>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-icon" style="background:rgba(59,130,246,0.15);color:var(--accent)">📦</div><div class="stat-value">${stats.totalProducts}</div><div class="stat-label">Total Products</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:rgba(16,185,129,0.15);color:var(--success)">💰</div><div class="stat-value">${formatPrice(stats.totalRevenue)}</div><div class="stat-label">Total Revenue</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:rgba(245,158,11,0.15);color:var(--warning)">📋</div><div class="stat-value">${stats.totalOrders}</div><div class="stat-label">Total Orders</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:rgba(139,92,246,0.15);color:#8b5cf6">👥</div><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">Customers</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div class="card" style="padding:24px">
            <h3 style="margin-bottom:16px">📊 Products by Category</h3>
            ${Object.entries(stats.categoryCounts).map(([cat, count]) => `
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                <span style="width:120px;font-size:0.9rem">${cat}</span>
                <div style="flex:1;height:24px;background:var(--bg-glass-light);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${(count / stats.totalProducts * 100)}%;background:linear-gradient(135deg,var(--accent),#8b5cf6);border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:0.75rem;font-weight:600;color:#fff">${count}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="card" style="padding:24px">
            <h3 style="margin-bottom:16px">📋 Recent Orders</h3>
            ${stats.recentOrders.map(o => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                <div><span style="font-weight:600">${o.id}</span><span style="color:var(--text-muted);font-size:0.85rem;margin-left:8px">${o.date}</span></div>
                <div style="display:flex;align-items:center;gap:12px"><span>${formatPrice(o.total)}</span><span class="order-status status-${o.status.toLowerCase().replace(/\s/g, '-')}">${o.status}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="stats-grid" style="margin-top:24px">
          <div class="stat-card"><div class="stat-icon" style="background:rgba(16,185,129,0.15);color:var(--success)">✓</div><div class="stat-value">${stats.inStock}</div><div class="stat-label">In Stock</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:rgba(239,68,68,0.15);color:var(--danger)">✗</div><div class="stat-value">${stats.outOfStock}</div><div class="stat-label">Out of Stock</div></div>
        </div>`;
    } catch { content.innerHTML = '<p>Failed to load stats</p>'; }
  } else if (panel === 'products') {
    try {
      const products = await authFetch(`${API}/products`).then(r => r.json());
      content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
          <h2>Products (${products.length})</h2>
          <button class="btn btn-primary btn-sm" onclick="showAdminPanel('add-product')">➕ Add Product</button>
        </div>
        <div class="card" style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th>Actions</th></tr></thead>
            <tbody>
              ${products.map(p => `<tr>
                <td><div class="product-cell"><div class="product-thumb"><img src="${p.image || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'}" alt="${p.name}" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'; this.onerror=null;"></div><span style="font-weight:500">${p.name}</span></div></td>
                <td>${p.category}</td>
                <td><div>${formatPrice(p.price)}</div>${p.oldPrice ? `<div style="font-size:0.8rem;color:var(--text-muted);text-decoration:line-through">${formatPrice(p.oldPrice)}</div>` : ''}</td>
                <td><span class="order-status ${p.stock > 10 ? 'status-delivered' : p.stock > 0 ? 'status-transit' : 'status-cancelled'}">${p.stock > 0 ? p.stock + ' units' : 'Out of Stock'}</span></td>
                <td>${getStars(p.rating)} ${p.rating}</td>
                <td><div class="table-actions"><button onclick="editProduct(${p.id})">✏️ Edit</button><button class="delete" onclick="deleteProduct(${p.id})">🗑️</button></div></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch { content.innerHTML = '<p>Failed to load products</p>'; }
  } else if (panel === 'orders') {
    try {
      // Concurrently fetch orders and user profiles to build a dynamic mapping key directory
      const [orders, users] = await Promise.all([
        authFetch(`${API}/admin/orders`).then(r => r.json()),
        authFetch(`${API}/admin/users`).then(r => r.json())
      ]);

      const userMap = {};
      (users || []).forEach(u => {
        userMap[u.id] = { name: u.name, email: u.email };
      });

      content.innerHTML = `
        <h2 style="margin-bottom:24px">Orders (${orders.length})</h2>
        <div class="card" style="overflow-x:auto; padding:8px">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Items Count</th>
                <th>Total Price</th>
                <th>Current Status</th>
                <th>Purchase Date</th>
                <th>Mutate Status</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(o => {
                const customer = userMap[o.userId] || { name: 'Guest Customer', email: o.userId ? `ID: ${o.userId.slice(0, 8)}...` : 'N/A' };
                const statuses = ['Processing', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
                const statusOptions = statuses.map(s => `
                  <option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>
                `).join('');

                return `
                  <tr>
                    <td style="font-weight:700; color:var(--text-primary)">${o.id}</td>
                    <td>
                      <div class="admin-user-info">
                        <span class="admin-user-name">${customer.name}</span>
                        <span class="admin-user-email">${customer.email}</span>
                      </div>
                    </td>
                    <td>
                      <div style="font-size:0.85rem; color:var(--text-secondary)">
                        <strong>${o.items.length} item${o.items.length > 1 ? 's' : ''}</strong>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px" title="${o.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}">
                          ${o.items.map(i => i.name).join(', ').slice(0, 32)}${o.items.map(i => i.name).join(', ').length > 32 ? '...' : ''}
                        </div>
                      </div>
                    </td>
                    <td style="font-weight:700; color:var(--text-primary)">${formatPrice(o.total)}</td>
                    <td><span class="order-status status-${o.status.toLowerCase().replace(/\s/g, '-')}">${o.status}</span></td>
                    <td style="font-size:0.85rem; color:var(--text-secondary)">${o.date}</td>
                    <td>
                      <select class="admin-select" onchange="updateOrderStatus('${o.id}', this.value)">
                        ${statusOptions}
                      </select>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      console.error(err);
      content.innerHTML = '<p style="color:var(--text-muted); padding:20px;">Failed to load order records.</p>';
    }
  } else if (panel === 'users') {
    try {
      const users = await authFetch(`${API}/admin/users`).then(r => r.json());
      content.innerHTML = `
        <h2 style="margin-bottom:24px">Users (${users.length})</h2>
        <div class="card" style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th></tr></thead>
            <tbody>
              ${users.map(u => `<tr>
                <td style="font-weight:500">${u.name}</td>
                <td>${u.email}</td>
                <td><span class="order-status ${u.role === 'admin' ? 'status-processing' : 'status-delivered'}">${u.role}</span></td>
                <td>${u.phone || 'N/A'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch { content.innerHTML = '<p>Failed to load users</p>'; }
  } else if (panel === 'add-product') {
    window.selectedImages = [];
    content.innerHTML = `
      <h2 style="margin-bottom:24px">Add New Product</h2>
      <div class="card" style="padding:28px">
        <div class="form-grid">
          <div class="form-group"><label>Name</label><input type="text" id="ap-name" placeholder="Product name"></div>
          <div class="form-group"><label>Slug (SEO Friendly)</label><input type="text" id="ap-slug" placeholder="auto-generated-slug"></div>
          <div class="form-group"><label>Category</label>
            <select id="ap-category"><option>Smartphones</option><option>Laptops</option><option>Audio</option><option>Air Conditioning</option><option>Accessories</option><option>Tablets</option><option>Smart Home</option><option>TV</option><option>Cameras</option></select></div>
          <div class="form-group"><label>Price (₹)</label><input type="number" id="ap-price" placeholder="29999"></div>
          <div class="form-group"><label>Old Price (₹)</label><input type="number" id="ap-oldprice" placeholder="34999"></div>
          <div class="form-group"><label>Stock</label><input type="number" id="ap-stock" placeholder="50"></div>
          <div class="form-group full">
            <label>Product Images</label>
            <div class="upload-dropzone" id="upload-dropzone">
              <div class="upload-icon">📤</div>
              <h4>Drag & drop images here or click to browse</h4>
              <p>Supports JPG, PNG, and WebP up to 5MB per file</p>
              <input type="file" id="ap-images-input" multiple accept="image/jpeg,image/png,image/webp">
            </div>
            <div class="upload-preview-grid" id="upload-preview-grid"></div>
          </div>
          <div class="form-group full"><label>Description</label><textarea id="ap-desc" rows="3" placeholder="Product description..."></textarea></div>
          <div class="form-group full">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <label style="margin-bottom:0">Product Specifications</label>
              <button type="button" class="btn btn-secondary btn-sm" onclick="addSpecRow()" style="margin:0;padding:6px 12px;font-size:0.85rem">➕ Add Field</button>
            </div>
            <div id="ap-specs-container" style="display:flex;flex-direction:column;gap:10px">
              <!-- Dynamically populated spec fields -->
            </div>
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:20px" onclick="addProduct()">Add Product</button>
      </div>`;
      
    setTimeout(() => {
      window.renderImagesPreview();
      window.initUploaderEvents();
      
      // Real-time SEO slug generator with manual override support
      const nameInput = document.getElementById('ap-name');
      const slugInput = document.getElementById('ap-slug');
      if (nameInput && slugInput) {
        let isSlugManuallyEdited = slugInput.value.trim() !== '';
        
        nameInput.addEventListener('input', () => {
          if (!isSlugManuallyEdited) {
            slugInput.value = slugify(nameInput.value);
          }
        });
        
        slugInput.addEventListener('input', () => {
          isSlugManuallyEdited = slugInput.value.trim() !== '';
          if (slugInput.value.trim() === '') {
            slugInput.value = slugify(nameInput.value);
          }
        });
      }
      
      // Auto-populate spec template based on smartphones default category
      window.populateCategoryTemplates();
      const catSelect = document.getElementById('ap-category');
      if (catSelect) {
        catSelect.addEventListener('change', window.populateCategoryTemplates);
      }
    }, 50);
  }
};

window.deleteProduct = async function(id) {
  if (!confirm('Delete this product?')) return;
  await authFetch(`${API}/products/${id}`, { method: 'DELETE' });
  showToast('Product deleted', 'info');
  showAdminPanel('products');
};

window.editProduct = async function(id) {
  const product = await authFetch(`${API}/products/${id}`).then(r => r.json());
  showAdminPanel('add-product');
  setTimeout(() => {
    document.getElementById('ap-name').value = product.name;
    document.getElementById('ap-slug').value = product.slug || '';
    document.getElementById('ap-category').value = product.category;
    document.getElementById('ap-price').value = product.price;
    document.getElementById('ap-oldprice').value = product.oldPrice || '';
    document.getElementById('ap-stock').value = product.stock;
    document.getElementById('ap-desc').value = product.description || '';
    
    window.selectedImages = product.images && product.images.length > 0 
      ? [...product.images] 
      : (product.image ? [product.image] : []);
      
    window.renderImagesPreview();
    window.initUploaderEvents();
    
    // Populate dynamic specs editor
    const specs = product.specs || {};
    const specsContainer = document.getElementById('ap-specs-container');
    if (specsContainer) {
      specsContainer.innerHTML = '';
      if (Object.keys(specs).length > 0) {
        Object.entries(specs).forEach(([k, v]) => {
          window.addSpecRow(k, v);
        });
      } else {
        window.populateCategoryTemplates();
      }
    }
    
    const catSelect = document.getElementById('ap-category');
    if (catSelect) {
      catSelect.addEventListener('change', window.populateCategoryTemplates);
    }
    
    document.querySelector('#admin-content .btn-primary').textContent = 'Update Product';
    document.querySelector('#admin-content .btn-primary').onclick = async () => {
      const btn = document.querySelector('#admin-content .btn-primary');
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Updating...';
      
      try {
        let specsObj = {};
        try {
          specsObj = window.getSpecsPayload();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = origText;
          return;
        }
        
        const res = await authFetch(`${API}/products/${id}`, { 
          method: 'PUT',
          body: JSON.stringify({
            name: document.getElementById('ap-name').value,
            slug: document.getElementById('ap-slug').value.trim(),
            category: document.getElementById('ap-category').value,
            price: Number(document.getElementById('ap-price').value),
            oldPrice: Number(document.getElementById('ap-oldprice').value),
            stock: Number(document.getElementById('ap-stock').value),
            image: window.selectedImages,
            description: document.getElementById('ap-desc').value,
            specs: specsObj
          })
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to update product");
        }
        
        showToast('Product updated!', 'success');
        showAdminPanel('products');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    };
  }, 100);
};

window.addProduct = async function() {
  let specsObj = {};
  try {
    specsObj = window.getSpecsPayload();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const data = {
    name: document.getElementById('ap-name').value,
    slug: document.getElementById('ap-slug').value.trim(),
    category: document.getElementById('ap-category').value,
    price: Number(document.getElementById('ap-price').value),
    oldPrice: Number(document.getElementById('ap-oldprice').value) || undefined,
    stock: Number(document.getElementById('ap-stock').value),
    image: window.selectedImages,
    description: document.getElementById('ap-desc').value,
    badge: '',
    isNew: true,
    specs: specsObj,
  };
  
  if (!data.name || !data.price) { showToast('Name and price required', 'error'); return; }
  
  const btn = document.querySelector('#admin-content .btn-primary');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    const res = await authFetch(`${API}/products`, { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to save product");
    }
    
    showToast('Product added!', 'success');
    showAdminPanel('products');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
};

/* ============ MULTI-IMAGE UPLOADER UTILS ============ */
window.selectedImages = [];

window.renderImagesPreview = function() {
  const grid = document.getElementById('upload-preview-grid');
  if (!grid) return;
  
  if (window.selectedImages.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;grid-column:1/-1;text-align:center;padding:12px 0;">No images uploaded yet.</p>';
    return;
  }
  
  grid.innerHTML = window.selectedImages.map((img, index) => {
    const isMain = index === 0;
    return `
      <div class="preview-card" data-index="${index}">
        <img src="${img}" alt="Preview ${index + 1}">
        <div class="preview-badge ${isMain ? 'main-badge' : 'sub-badge'}">
          ${isMain ? '★ Main' : `#${index + 1}`}
        </div>
        <div class="preview-overlay">
          ${index > 0 ? `<button type="button" class="preview-btn" onclick="moveImageLeft(${index})" title="Move Left">←</button>` : ''}
          ${index < window.selectedImages.length - 1 ? `<button type="button" class="preview-btn" onclick="moveImageRight(${index})" title="Move Right">→</button>` : ''}
          <button type="button" class="preview-btn delete-btn" onclick="removeSelectedImage(${index})" title="Remove Image">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
};

window.removeSelectedImage = function(index) {
  window.selectedImages.splice(index, 1);
  window.renderImagesPreview();
};

window.moveImageLeft = function(index) {
  if (index <= 0) return;
  const temp = window.selectedImages[index];
  window.selectedImages[index] = window.selectedImages[index - 1];
  window.selectedImages[index - 1] = temp;
  window.renderImagesPreview();
};

window.moveImageRight = function(index) {
  if (index >= window.selectedImages.length - 1) return;
  const temp = window.selectedImages[index];
  window.selectedImages[index] = window.selectedImages[index + 1];
  window.selectedImages[index + 1] = temp;
  window.renderImagesPreview();
};

window.initUploaderEvents = function() {
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('ap-images-input');
  
  if (!dropzone || !fileInput) return;
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  // Intercept the drop event on the file input target itself to prevent the browser
  // from updating the input's files list and triggering a secondary 'change' event.
  fileInput.addEventListener('drop', (e) => {
    e.preventDefault();
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    const files = dt.files;
    handleUploadedFiles(files);
  });
  
  fileInput.addEventListener('change', (e) => {
    handleUploadedFiles(e.target.files);
  });
};
let lastUploadTime = 0;

async function handleUploadedFiles(files) {
  const now = Date.now();
  if (now - lastUploadTime < 100) {
    return;
  }
  lastUploadTime = now;

  if (!files || files.length === 0) return;
  
  for (const file of files) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      showToast(`Invalid file type: ${file.name}. Only JPG, PNG, and WebP are allowed.`, 'error');
      continue;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showToast(`File size too large: ${file.name}. Maximum size allowed is 5MB.`, 'error');
      continue;
    }
    
    try {
      const base64Str = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
      });
      
      window.selectedImages.push(base64Str);
    } catch (err) {
      showToast(`Failed to read file: ${file.name}`, 'error');
      console.error(err);
    }
  }
  
  window.renderImagesPreview();
  
  // Clear the input value so the change event can trigger again if the user re-selects the same file
  const input = document.getElementById('ap-images-input');
  if (input) input.value = '';
}

window.updateOrderStatus = async function(orderId, status) {
  await authFetch(`${API}/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, trackingStep: { status, date: new Date().toISOString().split('T')[0], time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) } })
  });
  showToast(`Order ${orderId} marked as ${status}`, 'success');
  showAdminPanel('orders');
};

/* ============ SPECIFICATIONS BUILDER UTILS ============ */
window.getPlaceholderForKey = function(key) {
  if (!key) return 'Value';
  const k = String(key).trim().toLowerCase();
  if (k === '') return 'Value';
  
  if (k.includes('ram')) return 'e.g., 16GB';
  if (k.includes('processor') || k.includes('cpu')) return 'e.g., Core i7';
  if (k.includes('storage') || k.includes('ssd') || k.includes('hdd')) return 'e.g., 512GB SSD';
  if (k.includes('display') || k.includes('screen')) return 'e.g., 6.8" AMOLED';
  if (k.includes('battery')) return 'e.g., 5000 mAh';
  if (k.includes('camera')) return 'e.g., 108MP';
  if (k.includes('warranty')) return 'e.g., 1 Year';
  if (k.includes('graphics') || k.includes('gpu')) return 'e.g., RTX 4060';
  if (k.includes('os') || k.includes('operating')) return 'e.g., Windows 11';
  if (k.includes('capacity')) return 'e.g., 1.5 Ton';
  if (k.includes('energy') || k.includes('rating') || k.includes('star')) return 'e.g., 5 Star';
  if (k.includes('compressor')) return 'e.g., Inverter';
  if (k.includes('cooling')) return 'e.g., Fast Cooling';
  if (k.includes('power') || k.includes('consumption')) return 'e.g., 1200W';
  if (k.includes('resolution')) return 'e.g., 4K Ultra HD';
  if (k.includes('refresh')) return 'e.g., 120Hz';
  if (k.includes('smart')) return 'e.g., Android TV';
  if (k.includes('audio') || k.includes('output') || k.includes('sound')) return 'e.g., 40W Dolby';
  if (k.includes('hdmi') || k.includes('port')) return 'e.g., 3x HDMI 2.1';
  if (k.includes('type')) return 'e.g., Over-Ear';
  if (k.includes('life')) return 'e.g., 30 Hours';
  if (k.includes('connectivity')) return 'e.g., Bluetooth 5.3';
  if (k.includes('driver')) return 'e.g., 40mm';
  if (k.includes('noise')) return 'e.g., Noise Cancellation';
  if (k.includes('sensor')) return 'e.g., CMOS';
  if (k.includes('lens')) return 'e.g., 24-70mm';
  if (k.includes('video')) return 'e.g., 4K @ 60fps';
  if (k.includes('iso')) return 'e.g., 100 - 32000';
  if (k.includes('brand')) return 'e.g., Sony';
  if (k.includes('model')) return 'e.g., WH-1000XM5';
  
  return `Value (e.g., ${key})`;
};

window.updateSpecPlaceholder = function(keyInput) {
  const row = keyInput.parentElement;
  if (!row) return;
  const valInput = row.querySelector('.spec-value');
  if (!valInput) return;
  valInput.placeholder = window.getPlaceholderForKey(keyInput.value);
};

window.addSpecRow = function(key = '', val = '') {
  const container = document.getElementById('ap-specs-container');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'spec-row';
  div.style.display = 'flex';
  div.style.gap = '12px';
  div.style.alignItems = 'center';
  
  const placeholderText = window.getPlaceholderForKey(key);
  
  div.innerHTML = `
    <input type="text" class="spec-key" placeholder="Key (e.g., RAM)" value="${key}" style="flex:1; background:var(--bg-glass-light); border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:var(--radius-sm)" oninput="window.updateSpecPlaceholder(this)">
    <input type="text" class="spec-value" placeholder="${placeholderText}" value="${val}" style="flex:1.5; background:var(--bg-glass-light); border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:var(--radius-sm)">
    <button type="button" class="preview-btn delete-btn" onclick="this.parentElement.remove()" title="Remove Specification" style="padding:10px;margin-top:0;position:static;display:flex;align-items:center;justify-content:center;height:38px;width:38px;border-radius:var(--radius-sm)">🗑️</button>
  `;
  container.appendChild(div);
};

window.getSpecsPayload = function() {
  const container = document.getElementById('ap-specs-container');
  if (!container) return {};
  
  const specs = {};
  const rows = container.querySelectorAll('.spec-row');
  let hasDuplicate = false;
  const duplicateKeys = new Set();
  
  rows.forEach(row => {
    const kInput = row.querySelector('.spec-key');
    const vInput = row.querySelector('.spec-value');
    if (!kInput || !vInput) return;
    
    const key = kInput.value.trim();
    const val = vInput.value.trim();
    
    if (key !== '') {
      if (specs[key] !== undefined) {
        hasDuplicate = true;
        duplicateKeys.add(key);
      }
      specs[key] = val;
    }
  });
  
  if (hasDuplicate) {
    throw new Error(`Duplicate specification keys detected: "${Array.from(duplicateKeys).join(', ')}". Please ensure all keys are unique.`);
  }
  
  return specs;
};

window.populateCategoryTemplates = function() {
  const catSelect = document.getElementById('ap-category');
  const container = document.getElementById('ap-specs-container');
  if (!catSelect || !container) return;
  
  const existingRows = container.querySelectorAll('.spec-row');
  
  // Set of all template keys across all categories to identify unmodified default keys
  const defaultKeys = new Set([
    'Display', 'Processor', 'RAM', 'Storage', 'Battery', 'Camera', 'Warranty',
    'Graphics', 'OS', 'Capacity', 'Energy Rating', 'Compressor', 'Cooling Technology',
    'Power Consumption', 'Screen Size', 'Resolution', 'Refresh Rate', 'Smart TV OS',
    'Audio Output', 'HDMI Ports', 'Type', 'Battery Life', 'Connectivity', 'Driver Size',
    'Noise Cancellation', 'Sensor', 'Lens', 'Video Recording', 'ISO Range', 'Brand', 'Model'
  ]);
  
  let hasManualContent = false;
  existingRows.forEach(row => {
    const k = row.querySelector('.spec-key').value.trim();
    const v = row.querySelector('.spec-value').value.trim();
    
    // If there is any value entered, it is manually entered.
    // If the key is not in our default set and not empty, it is manually entered.
    if (v !== '' || (k !== '' && !defaultKeys.has(k))) {
      hasManualContent = true;
    }
  });
  
  // If there are manually entered specs, do not overwrite them!
  if (hasManualContent) return;
  
  // Clear the spec editor safely to populate the new category template
  container.innerHTML = '';
  
  const category = catSelect.value;
  const cat = String(category).toLowerCase();
  
  let defaults = ['Brand', 'Model', 'Warranty'];
  
  if (cat.includes('phone') || cat.includes('tablet')) {
    defaults = ['Display', 'Processor', 'RAM', 'Storage', 'Battery', 'Camera', 'Warranty'];
  } else if (cat.includes('laptop') || cat.includes('computer')) {
    defaults = ['Processor', 'RAM', 'Storage', 'Display', 'Graphics', 'OS', 'Battery', 'Warranty'];
  } else if (cat.includes('conditioning') || cat.includes('ac')) {
    defaults = ['Capacity', 'Energy Rating', 'Compressor', 'Cooling Technology', 'Power Consumption', 'Warranty'];
  } else if (cat.includes('tv') || cat.includes('television')) {
    defaults = ['Screen Size', 'Resolution', 'Refresh Rate', 'Smart TV OS', 'Audio Output', 'HDMI Ports', 'Warranty'];
  } else if (cat.includes('audio') || cat.includes('headphone') || cat.includes('speaker')) {
    defaults = ['Type', 'Battery Life', 'Connectivity', 'Driver Size', 'Noise Cancellation', 'Warranty'];
  } else if (cat.includes('camera')) {
    defaults = ['Sensor', 'Lens', 'Resolution', 'Video Recording', 'ISO Range', 'Battery', 'Warranty'];
  }
  
  defaults.forEach(key => window.addSpecRow(key, ''));
};
