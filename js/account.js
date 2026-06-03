/* Account Page Logic — ELECTRONIC WORLD */
document.addEventListener('DOMContentLoaded', async () => {
  // Ensure Supabase client is fully loaded and initialized before page execution
  await ensureSupabase();

  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();

  const user = getUser();
  if (user) {
    showDashboard(user);
  } else {
    showAuth();
  }
  
  // Handle redirect queries if redirected from checkout page
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error') === 'login_required') {
    showToast('Please log in to continue to checkout.', 'info');
  }
});

function showAuth() {
  document.getElementById('auth-area').style.display = '';
  document.getElementById('account-area').style.display = 'none';
  document.getElementById('auth-area').innerHTML = `
    <div class="auth-container">
      <div class="auth-tabs">
        <button class="auth-tab active" onclick="switchTab('login')">Login</button>
        <button class="auth-tab" onclick="switchTab('register')">Register</button>
      </div>
      <div id="login-form" class="auth-form">
        <div class="form-group"><label>Email</label><input type="email" id="login-email" placeholder="your@email.com"></div>
        <div class="form-group"><label>Password</label><input type="password" id="login-pass" placeholder="••••••••"></div>
        <button class="btn btn-primary" onclick="doLogin()">Login →</button>
      </div>
      <div id="register-form" class="auth-form" style="display:none">
        <div class="form-group"><label>Full Name</label><input type="text" id="reg-name" placeholder="Your Name"></div>
        <div class="form-group"><label>Email</label><input type="email" id="reg-email" placeholder="your@email.com"></div>
        <div class="form-group"><label>Password</label><input type="password" id="reg-pass" placeholder="Min 6 characters"></div>
        <button class="btn btn-primary" onclick="doRegister()">Create Account →</button>
      </div>
    </div>`;
}

window.switchTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => { 
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1)); 
  });
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
};

window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!email || !password) { 
    showToast('Please fill all fields', 'error'); 
    return; 
  }
  
  try {
    await ensureSupabase();
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Welcome back!', 'success');
      
      // Delay slightly for session state listeners to write to localStorage
      setTimeout(() => {
        const user = getUser();
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        
        if (redirect) {
          window.location.href = '/' + redirect.replace(/^\/+/, '');
        } else if (user) {
          showDashboard(user);
        } else {
          // Fallback if listener propagation is delayed
          const fallbackUser = { email, name: email.split('@')[0], role: 'customer' };
          showDashboard(fallbackUser);
        }
      }, 600);
    }
  } catch (err) {
    showToast('Login failed: ' + err.message, 'error');
  }
};

window.doRegister = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  
  if (!name || !email || !password) { 
    showToast('Please fill all fields', 'error'); 
    return; 
  }
  
  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  
  try {
    await ensureSupabase();
    const { data, error } = await window.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: 'customer' }
      }
    });
    
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Account created successfully!', 'success');
      setTimeout(() => {
        const user = getUser();
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect');
        
        if (redirect) {
          window.location.href = '/' + redirect.replace(/^\/+/, '');
        } else if (user) {
          showDashboard(user);
        }
      }, 900);
    }
  } catch (err) {
    showToast('Registration failed: ' + err.message, 'error');
  }
};

let currentTab = 'orders';

async function showDashboard(user) {
  document.getElementById('auth-area').style.display = 'none';
  document.getElementById('account-area').style.display = '';
  document.getElementById('account-title').textContent = `Welcome, ${user.name}`;

  document.getElementById('account-area').innerHTML = `
    <div class="account-layout">
      <div class="account-sidebar">
        <div class="user-info">
          <div class="user-avatar">${user.name ? user.name[0].toUpperCase() : 'U'}</div>
          <div class="user-name">${user.name}</div>
          <div class="user-email">${user.email}</div>
        </div>
        <ul class="account-nav">
          <li><a href="#" class="active" onclick="showPanel('orders', this)">📦 My Orders</a></li>
          <li><a href="#" onclick="showPanel('track', this)">🔍 Track Order</a></li>
          <li><a href="#" onclick="showPanel('profile', this)">👤 Profile</a></li>
          <li><a href="#" onclick="showPanel('wishlist', this)">❤️ Wishlist</a></li>
          ${user.role === 'admin' ? `<li><a href="/admin.html" style="color:var(--accent); font-weight:700">⚙️ Admin Dashboard</a></li>` : ''}
          <li><a href="#" onclick="logout()" style="color:var(--danger)">🚪 Logout</a></li>
        </ul>
      </div>
      <div class="account-panel" id="account-panel"></div>
    </div>`;

  window.addEventListener('wishlistUpdated', () => {
    if (currentTab === 'wishlist') {
      showPanel('wishlist');
    }
  });

  showPanel('orders');
}

window.showPanel = async function(panel, el) {
  currentTab = panel;
  if (el) { 
    document.querySelectorAll('.account-nav a').forEach(a => a.classList.remove('active')); 
    el.classList.add('active'); 
  }
  
  const panelEl = document.getElementById('account-panel');
  const user = getUser();
  if (!user) return;

  if (panel === 'orders') {
    panelEl.innerHTML = '<div class="skeleton" style="height:200px; border-radius:8px"></div>';
    try {
      const res = await authFetch(`${API}/orders/${user.id}`);
      if (!res.ok) {
        throw new Error('Failed to load order history');
      }
      const orders = await res.json();
      if (!Array.isArray(orders) || orders.length === 0) {
        panelEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><h3>No orders yet</h3><p>Start shopping to see your orders here</p><a href="/products.html" class="btn btn-primary">Shop Now</a></div>';
      } else {
        panelEl.innerHTML = `<h2 style="margin-bottom:20px">My Orders</h2>` + orders.map(o => {
          const deliveryEst = new Date(new Date(o.date).getTime() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          return `
            <div class="order-card" style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:16px; box-shadow:var(--shadow); transition:var(--transition)">
              <div class="order-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px">
                <div>
                  <span class="order-id" style="font-weight:700; color:var(--text-primary)">${o.id}</span> 
                  <span style="color:var(--text-muted); font-size:0.85rem; margin-left:8px">• ${o.date}</span>
                  <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">
                    🚚 Carrier: <span style="color:var(--accent); font-weight:600;">Delhivery</span> | Est. Delivery: <span style="font-weight:600; color:var(--text-primary);">${deliveryEst}</span>
                  </div>
                </div>
                <span class="order-status status-${o.status.toLowerCase().replace(/\s/g, '-')}">${o.status}</span>
              </div>
              <div class="order-items" style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap">
                ${o.items.map(i => `
                  <div class="order-item-thumb" style="width:54px; height:54px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); overflow:hidden; display:flex; align-items:center; justify-content:center" title="${i.name}">
                    <img src="${i.image || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'}" alt="${i.name}" style="max-width:100%; max-height:100%; object-fit:contain" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'; this.onerror=null;">
                  </div>
                `).join('')}
                <span style="color:var(--text-secondary); font-size:0.85rem; align-self:center; margin-left:8px">${o.items.length} item${o.items.length > 1 ? 's' : ''} purchased</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center">
                <span style="font-weight:700; font-size:1.05rem; color:var(--text-primary)">Total: ${formatPrice(o.total)}</span>
                <button class="btn btn-secondary btn-sm" onclick="trackOrder('${o.id}')">Track Order</button>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) { 
      console.error(err);
      panelEl.innerHTML = '<p style="color:var(--text-muted)">Failed to load order history.</p>'; 
    }
  } else if (panel === 'track') {
    panelEl.innerHTML = `
      <h2 style="margin-bottom:20px">Track Order</h2>
      <div style="display:flex; gap:12px; margin-bottom:24px">
        <input type="text" id="track-input" placeholder="Enter Order Reference (e.g., EW-10001)" style="flex:1; padding:12px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-primary); outline:none; transition:var(--transition)" onkeypress="if(event.key === 'Enter') trackOrder(this.value)">
        <button class="btn btn-primary" onclick="trackOrder(document.getElementById('track-input').value)">Track</button>
      </div>
      <div id="tracking-result"></div>`;
  } else if (panel === 'profile') {
    panelEl.innerHTML = `
      <h2 style="margin-bottom:20px">Profile Settings</h2>
      <div class="form-grid">
        <div class="form-group"><label>Name</label><input type="text" id="prof-name" value="${user.name || ''}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="prof-email" value="${user.email || ''}" disabled></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="prof-phone" value="${user.phone || ''}"></div>
        <div class="form-group"><label>City</label><input type="text" id="prof-city" value="${user.address?.city || ''}"></div>
        <div class="form-group"><label>Zip/PIN Code</label><input type="text" id="prof-zip" value="${user.address?.zip || ''}"></div>
        <div class="form-group full"><label>Address</label><input type="text" id="prof-address" value="${user.address?.street || ''}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:20px" onclick="saveProfile()">Save Changes</button>`;
  } else if (panel === 'wishlist') {
    panelEl.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const res = await authFetch(`${API}/wishlist/${user.id}`);
      if (res.ok) {
        const wishItems = await res.json();
        if (wishItems.length === 0) {
          panelEl.innerHTML = '<div class="empty-state"><div class="empty-icon">❤️</div><h3>Wishlist is empty</h3><p>Save products you love!</p><a href="/products.html" class="btn btn-primary">Browse Products</a></div>';
        } else {
          panelEl.innerHTML = `<h2 style="margin-bottom:20px">My Wishlist</h2><div class="products-grid">${wishItems.map(renderProductCard).join('')}</div>`;
          if (typeof window.updateHeartIcons === 'function') {
            await window.updateHeartIcons();
          }
        }
      } else {
        throw new Error('Failed to fetch wishlist');
      }
    } catch (err) {
      console.error(err);
      panelEl.innerHTML = '<p style="color:var(--text-muted)">Failed to load wishlist items.</p>';
    }
  }
};

window.trackOrder = async function(orderId) {
  const cleanId = String(orderId || '').trim();
  if (!cleanId) { 
    showToast('Please enter an order reference ID', 'error'); 
    return; 
  }

  // Handle cross-tab navigation transitions safely using async await to resolve DOM lifecycle
  if (currentTab !== 'track') { 
    await showPanel('track'); 
    
    // Highlights the Track Navigation Link in the Sidebar
    document.querySelectorAll('.account-nav a').forEach(a => {
      const isTrack = a.textContent.includes('Track');
      a.classList.toggle('active', isTrack);
    });
  }

  const resultEl = document.getElementById('tracking-result');
  const inputEl = document.getElementById('track-input');
  
  if (inputEl) inputEl.value = cleanId;
  if (resultEl) resultEl.innerHTML = '<div class="skeleton" style="height:150px; border-radius:8px"></div>';

  try {
    const order = await authFetch(`${API}/orders/track/${cleanId}`).then(r => r.json());
    if (order.error || !order.id) { 
      resultEl.innerHTML = `<div class="card" style="padding:20px; border-color:var(--danger); background:rgba(239,68,68,0.05)"><p style="color:var(--danger); font-weight:600">Order Reference "${cleanId}" not found. Verify the reference key.</p></div>`; 
      return; 
    }
    
    // Render high-fidelity step timelines
    const steps = order.tracking?.steps || [];
    const reachedSteps = {};
    steps.forEach(s => {
      reachedSteps[s.status] = s;
    });

    const stages = reachedSteps['Cancelled'] 
      ? ['Order Placed', 'Cancelled'] 
      : ['Order Placed', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

    const currentStatus = order.status;
    let currentActiveIdx = -1;
    stages.forEach((stage, idx) => {
      if (reachedSteps[stage]) {
        currentActiveIdx = idx;
      }
    });

    const timelineHTML = `
      <div class="visual-timeline" style="margin: 32px 0; display: flex; flex-direction: column; gap: 24px; position: relative;">
        <!-- Vertical connector line -->
        <div class="timeline-line" style="position: absolute; left: 15px; top: 8px; bottom: 8px; width: 2px; background: var(--border); z-index: 1;"></div>
        <!-- Active connector line filling up to the current active step -->
        <div class="timeline-line-active" style="position: absolute; left: 15px; top: 8px; height: ${currentActiveIdx >= 0 ? (currentActiveIdx / (stages.length - 1)) * 100 : 0}%; width: 2px; background: var(--accent); z-index: 2; transition: height 1s ease;"></div>
        
        ${stages.map((stage, idx) => {
          const reached = reachedSteps[stage];
          const isActive = stage === currentStatus || (idx === currentActiveIdx && !reachedSteps[stages[idx+1]]);
          const isCompleted = !!reached && !isActive;
          
          let statusClass = 'pending';
          let dotBg = 'var(--bg-secondary)';
          let dotBorder = '2px solid var(--border)';
          let dotColor = 'var(--text-muted)';
          let pulseClass = '';
          
          if (isActive) {
            statusClass = 'active';
            dotBg = 'var(--accent)';
            dotBorder = '2px solid var(--accent)';
            dotColor = '#fff';
            pulseClass = 'timeline-pulse';
          } else if (isCompleted) {
            statusClass = 'completed';
            dotBg = 'var(--accent-2)';
            dotBorder = '2px solid var(--accent-2)';
            dotColor = '#fff';
          }
          
          return `
            <div class="timeline-item ${statusClass}" style="display: flex; gap: 16px; align-items: flex-start; z-index: 3; position: relative;">
              <div class="timeline-dot ${pulseClass}" style="width: 32px; height: 32px; border-radius: 50%; background: ${dotBg}; border: ${dotBorder}; color: ${dotColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; box-shadow: var(--shadow); transition: all 0.3s ease;">
                ${isCompleted ? '✓' : idx + 1}
              </div>
              <div class="timeline-content" style="flex: 1; padding-top: 4px;">
                <div class="timeline-stage-title" style="font-weight: 700; font-size: 1rem; color: ${isActive ? 'var(--accent)' : reached ? 'var(--text-primary)' : 'var(--text-muted)'}; transition: color 0.3s ease;">
                  ${stage}
                </div>
                ${reached ? `
                  <div class="timeline-meta" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                    📅 ${reached.date} at ${reached.time}
                  </div>
                ` : `
                  <div class="timeline-meta" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                    Pending
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const user = getUser();

    resultEl.innerHTML = `
      <div class="order-card" style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:28px; box-shadow:var(--shadow)">
        <div class="order-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:16px">
          <div>
            <span class="order-id" style="font-weight:700; font-size:1.25rem; color:var(--text-primary)">${order.id}</span>
            <span style="color:var(--text-muted); font-size:0.85rem; margin-left:8px">• ${order.date}</span>
          </div>
          <span class="order-status status-${order.status.toLowerCase().replace(/\s/g, '-')}">${order.status}</span>
        </div>
        
        <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
          <p style="color:var(--text-secondary); font-size:0.9rem; margin: 0;">
            🚚 Carrier: <strong style="color:var(--text-primary)">Delhivery</strong> • 
            Tracking ID: <strong style="color:var(--text-primary)">${order.tracking?.trackingId || 'N/A'}</strong>
          </p>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin: 0;">
            Payment Method: <strong style="color:var(--text-primary)">${order.payment || 'Card'}</strong>
          </p>
        </div>

        <!-- Timeline -->
        ${timelineHTML}

        <!-- Products Ordered -->
        <div style="margin-top:28px; padding-top:20px; border-top:1px solid var(--border)">
          <h4 style="font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:12px">Products Ordered</h4>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${order.items.map(item => `
              <div style="display: flex; gap: 16px; align-items: center; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px;">
                <div style="width: 50px; height: 50px; border-radius: var(--radius-sm); overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0;">
                  <img src="${item.image}" alt="${item.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </div>
                <div style="flex: 1;">
                  <h5 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${item.name}</h5>
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">${item.quantity} x ${formatPrice(item.price)}</span>
                </div>
                <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">${formatPrice(item.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 12px 0 0 0;">
            <span style="font-weight: 700; color: var(--text-secondary);">Grand Total:</span>
            <span style="font-weight: 800; font-size: 1.2rem; color: var(--accent);">${formatPrice(order.total)}</span>
          </div>
        </div>
        
        <!-- Delivery Details -->
        <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--border)">
          <h4 style="font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:8px">Delivery Address</h4>
          <p style="font-size:0.9rem; color:var(--text-secondary); line-height: 1.5; margin: 0;">
            <strong>${user ? user.name : 'Customer'}</strong><br>
            ${order.address?.street || 'N/A'}<br>
            ${order.address?.city || ''}${order.address?.state ? ', ' + order.address.state : ''} ${order.address?.zip || ''}
          </p>
        </div>
      </div>`;
  } catch (err) { 
    console.error(err);
    resultEl.innerHTML = '<p style="color:var(--danger)">Failed to fetch tracking information.</p>'; 
  }
};

window.saveProfile = async function() {
  const user = getUser();
  const name = document.getElementById('prof-name').value.trim();
  const phone = document.getElementById('prof-phone').value.trim();
  const street = document.getElementById('prof-address').value.trim();
  const city = document.getElementById('prof-city').value.trim();
  const zip = document.getElementById('prof-zip').value.trim();

  if (!name) {
    showToast('Name field is required', 'error');
    return;
  }

  const updates = {
    name,
    phone,
    address: { street, city, state: 'Odisha', zip }
  };
  
  const btn = document.querySelector('#account-panel .btn-primary');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving Profile Changes...';

  try {
    await ensureSupabase();
    // 1. Sync metadata inside Supabase native auth
    const { error: authUpdErr } = await window.supabase.auth.updateUser({
      data: { name: updates.name }
    });
    if (authUpdErr) throw authUpdErr;
    
    // 2. Sync fields in database profiles table
    const res = await authFetch(`${API}/auth/profile/${user.id}`, { 
      method: 'PUT', 
      body: JSON.stringify(updates) 
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server profile sync failed');
    }
    
    const updated = await res.json();
    setAuth(getToken(), updated);
    
    showToast('Profile settings saved successfully!', 'success');
    
    // Update sidebar layout user name representation
    const sName = document.querySelector('.user-info .user-name');
    if (sName) sName.textContent = updated.name;
    const sAvatar = document.querySelector('.user-info .user-avatar');
    if (sAvatar && updated.name) sAvatar.textContent = updated.name[0].toUpperCase();
    document.getElementById('account-title').textContent = `Welcome, ${updated.name}`;
  } catch (err) {
    console.error(err);
    showToast('Failed to update profile settings: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};
