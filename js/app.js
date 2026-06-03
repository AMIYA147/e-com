/* ============================================
   ELECTRONIC WORLD — Shared App Module
   ============================================ */

const API = 'https://e-com-kyzr.onrender.com/api';

// ============ SUPABASE CLIENT SETUP ============
let supabaseInitializedPromise;
function ensureSupabase() {
  if (window.supabase && typeof window.supabase.auth === 'object' && typeof window.supabase.auth.signInWithPassword === 'function') {
    return Promise.resolve();
  }
  if (supabaseInitializedPromise) return supabaseInitializedPromise;
  
  supabaseInitializedPromise = (async () => {
    try {
      const config = await fetch('/api/config').then(r => r.json());
      
      // Sanitize URL and Key on the frontend to avoid trailing slashes or duplicate paths
      let supabaseUrl = config.supabaseUrl;
      let supabaseAnonKey = config.supabaseAnonKey;
      if (supabaseUrl) {
        supabaseUrl = supabaseUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
      }
      if (supabaseAnonKey) {
        supabaseAnonKey = supabaseAnonKey.trim();
      }

      // Check if Supabase SDK is loaded. If not, inject CDN script tag dynamically.
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.log("📦 Dynamically injecting Supabase client SDK...");
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load Supabase SDK from CDN"));
          document.head.appendChild(script);
        });
      }

      if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
        console.log("🔌 Supabase Browser SDK Connected");
        
        // Listen to Auth State Changes natively
        window.supabase.auth.onAuthStateChange(async (event, session) => {
          if (session) {
            localStorage.setItem('pe_token', session.access_token);
            document.cookie = `pe_token=${session.access_token}; path=/; max-age=86400; SameSite=Lax; Secure`;
            try {
              const res = await fetch(`${API}/auth/profile/${session.user.id}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
              });
              if (res.ok) {
                const profile = await res.json();
                localStorage.setItem('pe_user', JSON.stringify(profile));
              } else {
                const userObj = {
                  id: session.user.id,
                  email: session.user.email,
                  name: session.user.user_metadata?.name || session.user.email.split('@')[0],
                  role: session.user.user_metadata?.role || 'customer'
                };
                localStorage.setItem('pe_user', JSON.stringify(userObj));
              }
            } catch {
              const userObj = {
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.name || session.user.email.split('@')[0],
                role: session.user.user_metadata?.role || 'customer'
              };
              localStorage.setItem('pe_user', JSON.stringify(userObj));
            }
          } else {
            localStorage.removeItem('pe_token');
            localStorage.removeItem('pe_user');
            document.cookie = "pe_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure";
          }
          updateCartBadge();
        });
      } else {
        console.error("❌ Failed to initialize Supabase SDK after dynamic script injection.");
      }
    } catch (err) {
      console.error("Supabase connection error:", err.message);
    }
  })();
  
  return supabaseInitializedPromise;
}
ensureSupabase();

// ============ AUTHENTICATED FETCH WRAPPER ============
async function authFetch(url, options = {}) {
  const token = localStorage.getItem('pe_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    console.warn("Session expired or invalid token on API request. Logging out client.");
    localStorage.removeItem('pe_token');
    localStorage.removeItem('pe_user');
    document.cookie = "pe_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure";
    
    // Force a redirect or reload to show the login screen
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') !== 'session_expired') {
      window.location.href = '/account.html?error=session_expired';
    } else {
      window.location.reload();
    }
  }
  
  return res;
}

// ============ THEME LOGIC ============
function initTheme() {
  const savedTheme = localStorage.getItem('pe_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}
initTheme(); // Run immediately to prevent flash

window.toggleTheme = function() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('pe_theme', newTheme);
  
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.style.transform = 'scale(0.5) rotate(180deg)';
    btn.style.opacity = '0';
    setTimeout(() => {
      btn.textContent = newTheme === 'dark' ? '🌙' : '☀️';
      btn.style.transform = 'scale(1) rotate(0deg)';
      btn.style.opacity = '1';
    }, 150);
  }
};

// ============ AUTH STATE ============
function getUser() {
  const data = localStorage.getItem('pe_user');
  return data ? JSON.parse(data) : null;
}
function getToken() { return localStorage.getItem('pe_token'); }
function setAuth(token, user) {
  localStorage.setItem('pe_token', token);
  localStorage.setItem('pe_user', JSON.stringify(user));
  document.cookie = `pe_token=${token}; path=/; max-age=86400; SameSite=Lax; Secure`;
}
async function logout() {
  await ensureSupabase();
  if (window.supabase && typeof window.supabase.auth.signOut === 'function') {
    await window.supabase.auth.signOut();
  }
  localStorage.removeItem('pe_token');
  localStorage.removeItem('pe_user');
  document.cookie = "pe_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure";
  updateCartBadge();
  window.location.href = '/account.html';
}
function requireAuth() {
  if (!getUser()) { window.location.href = '/account.html'; return false; }
  return true;
}

// ============ CART HELPERS ============
function getLocalCart() {
  const data = localStorage.getItem('pe_cart');
  return data ? JSON.parse(data) : [];
}
function saveLocalCart(cart) { localStorage.setItem('pe_cart', JSON.stringify(cart)); }

async function addToCart(productId, quantity = 1) {
  const user = getUser();
  if (user) {
    await authFetch(`${API}/cart/${user.id}`, { method: 'POST', body: JSON.stringify({ productId, quantity }) });
  } else {
    const cart = getLocalCart();
    const existing = cart.find(i => i.productId === productId);
    if (existing) existing.quantity += quantity;
    else cart.push({ productId, quantity });
    saveLocalCart(cart);
  }
  updateCartBadge();
  showToast('Added to cart!', 'success');
}

async function getCartCount() {
  const user = getUser();
  if (user) {
    try {
      const res = await authFetch(`${API}/cart/${user.id}`);
      const data = await res.json();
      return data.count || 0;
    } catch { return 0; }
  }
  return getLocalCart().reduce((s, i) => s + i.quantity, 0);
}

async function updateCartBadge() {
  const count = await getCartCount();
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

// ============ FORMAT ============
function formatPrice(price) {
  return '₹' + Number(price).toLocaleString('en-IN');
}

function getStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

function getStockClass(status) {
  if (status === 'In Stock') return 'stock-in';
  if (status === 'Low Stock') return 'stock-low';
  return 'stock-out';
}

function getBadgeClass(badge) {
  if (!badge) return '';
  const lower = badge.toLowerCase();
  if (['best seller', 'popular', 'hot'].includes(lower)) return 'badge-hot';
  if (lower === 'new') return 'badge-new';
  if (['premium', 'exclusive', 'pro'].includes(lower)) return 'badge-premium';
  return 'badge-sale';
}

// ============ SLUGIFY HELPER ============
function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// ============ PRODUCT CARD ============
function renderProductCard(product) {
  const discount = product.discount || (product.oldPrice ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) : 0);
  return `
    <div class="card product-card" onclick="window.location.href='/product/${product.slug || slugify(product.name)}'">
      <div class="card-image">
        <img src="${product.image || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'}" alt="${product.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'; this.onerror=null;">
        ${discount > 0 ? `<span class="card-badge badge-sale">-${discount}%</span>` : ''}
        ${product.badge && !discount ? `<span class="card-badge ${getBadgeClass(product.badge)}">${product.badge}</span>` : ''}
        ${product.isNew && !product.badge ? `<span class="card-badge badge-new">New</span>` : ''}
        <div class="card-actions">
          <button class="card-action-btn" onclick="event.stopPropagation(); addToCart(${product.id})" title="Add to cart">🛒</button>
          <button class="card-action-btn wishlist-btn" data-wishlist-id="${product.id}" onclick="event.stopPropagation(); toggleWishlist(${product.id})" title="Wishlist">♡</button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-category">${product.category}</div>
        <h3 class="card-title">${product.name}</h3>
        <div class="card-rating">
          <span class="card-stars">${getStars(product.rating)}</span>
          <span class="card-reviews">(${product.reviews || 0})</span>
        </div>
        <div class="card-price">
          <span class="current">${formatPrice(product.price)}</span>
          ${product.oldPrice ? `<span class="original">${formatPrice(product.oldPrice)}</span>` : ''}
          ${discount > 0 ? `<span class="discount">${discount}% off</span>` : ''}
        </div>
        <button class="quick-add" onclick="event.stopPropagation(); addToCart(${product.id})">Add to Cart</button>
      </div>
    </div>
  `;
}

// ============ WISHLIST ============
window.activeWishlist = null;

async function getWishlistIds() {
  const user = getUser();
  if (user) {
    if (window.activeWishlist === null || window.activeWishlist === undefined) {
      try {
        const res = await authFetch(`${API}/wishlist/${user.id}`);
        if (res.ok) {
          const items = await res.json();
          window.activeWishlist = items.map(item => Number(item.id));
        } else {
          window.activeWishlist = [];
        }
      } catch (e) {
        console.error("Failed to fetch wishlist", e);
        window.activeWishlist = [];
      }
    }
    return window.activeWishlist;
  } else {
    const local = localStorage.getItem('pe_wishlist');
    return local ? JSON.parse(local).map(Number) : [];
  }
}

window.toggleWishlist = async function(productId) {
  productId = Number(productId);
  const user = getUser();
  if (user) {
    try {
      let wishlistIds = await getWishlistIds();
      const exists = wishlistIds.includes(productId);
      if (exists) {
        const res = await authFetch(`${API}/wishlist/${user.id}/${productId}`, { method: 'DELETE' });
        if (res.ok) {
          window.activeWishlist = window.activeWishlist.filter(id => id !== productId);
          showToast('Removed from wishlist', 'info');
        } else {
          showToast('Failed to update wishlist', 'error');
        }
      } else {
        const res = await authFetch(`${API}/wishlist/${user.id}`, {
          method: 'POST',
          body: JSON.stringify({ productId })
        });
        if (res.ok) {
          if (!window.activeWishlist) window.activeWishlist = [];
          if (!window.activeWishlist.includes(productId)) {
            window.activeWishlist.push(productId);
          }
          showToast('Added to wishlist!', 'success');
        } else {
          showToast('Failed to update wishlist', 'error');
        }
      }
    } catch (err) {
      console.error("Wishlist sync error:", err);
      showToast('Failed to update wishlist', 'error');
    }
  } else {
    let wishlist = localStorage.getItem('pe_wishlist');
    wishlist = wishlist ? JSON.parse(wishlist).map(Number) : [];
    if (wishlist.includes(productId)) {
      wishlist = wishlist.filter(id => id !== productId);
      showToast('Removed from wishlist', 'info');
    } else {
      wishlist.push(productId);
      showToast('Added to wishlist!', 'success');
    }
    localStorage.setItem('pe_wishlist', JSON.stringify(wishlist));
  }
  await window.updateHeartIcons();
  window.dispatchEvent(new CustomEvent('wishlistUpdated'));
};

window.updateHeartIcons = async function() {
  try {
    const activeIds = await getWishlistIds();
    document.querySelectorAll('.wishlist-btn').forEach(btn => {
      const id = Number(btn.getAttribute('data-wishlist-id'));
      if (activeIds.includes(id)) {
        btn.textContent = '❤️';
        btn.classList.add('active');
        btn.title = 'Remove from Wishlist';
      } else {
        btn.textContent = '♡';
        btn.classList.remove('active');
        btn.title = 'Add to Wishlist';
      }
    });
  } catch (err) {
    console.error("Error updating heart icons:", err);
  }
};

// ============ TOAST ============
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ============ NAVBAR ============
function initNavbar() {
  // Scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
    const btn = document.querySelector('.back-to-top');
    if (btn) btn.classList.toggle('visible', window.scrollY > 400);
  });

  // Hamburger
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
    });
  }

  // Active link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPage || (currentPage === '' && href === 'index.html'))) {
      link.classList.add('active');
    }
  });

  // Live Autocomplete Search Implementation
  const autocompleteCache = {};

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  document.querySelectorAll('#nav-search-input, #mobile-search-input').forEach(input => {
    const parent = input.parentElement;
    if (!parent) return;

    // 1. Create or fetch dynamic dropdown container
    let dropdown = parent.querySelector('.search-suggestions');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'search-suggestions';
      parent.appendChild(dropdown);
    }

    let selectedIndex = -1;
    let suggestions = [];

    // 2. Fetch and Cache suggestions
    const loadSuggestions = async (val) => {
      const query = val.trim().toLowerCase();
      if (query.length < 2) {
        suggestions = [];
        selectedIndex = -1;
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      if (autocompleteCache[query]) {
        suggestions = autocompleteCache[query];
      } else {
        try {
          const res = await fetch(`${API}/products?search=${encodeURIComponent(query)}`);
          if (!res.ok) throw new Error("Search API error");
          const products = await res.json();
          suggestions = products.slice(0, 6);
          autocompleteCache[query] = suggestions;
        } catch (err) {
          console.error("Autocomplete fetch error:", err);
          suggestions = [];
        }
      }

      // Render suggestions
      if (suggestions.length === 0) {
        dropdown.innerHTML = `<div class="suggestion-no-results">No products found for "${escapeHTML(val)}"</div>`;
      } else {
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');

        dropdown.innerHTML = suggestions.map((product, idx) => {
          const highlightedName = product.name.replace(regex, '<mark>$1</mark>');
          const brandOrCategory = product.brand ? `${product.brand} | ${product.category}` : product.category;
          return `
            <div class="suggestion-item" data-index="${idx}">
              <img class="suggestion-thumb" src="${product.image}" alt="${product.name}" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=100&h=100&fit=crop'; this.onerror=null;">
              <div class="suggestion-info">
                <div class="suggestion-name">${highlightedName}</div>
                <div class="suggestion-meta">${brandOrCategory}</div>
              </div>
              <div class="suggestion-price">${formatPrice(product.price)}</div>
            </div>
          `;
        }).join('');
      }

      selectedIndex = -1;
      dropdown.classList.add('active');
    };

    const debouncedLoad = debounce((val) => loadSuggestions(val), 200);

    // 3. Register standard input event
    input.addEventListener('input', (e) => {
      debouncedLoad(e.target.value);
    });

    // 4. Keyboard Navigation: ArrowDown, ArrowUp, Enter, Escape
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.suggestion-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length > 0) {
          selectedIndex = (selectedIndex + 1) % items.length;
          updateItemsSelection(items);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length > 0) {
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          updateItemsSelection(items);
        }
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          const selectedProduct = suggestions[selectedIndex];
          navigateToProduct(selectedProduct);
        } else if (input.value.trim()) {
          window.location.href = `/products.html?search=${encodeURIComponent(input.value.trim())}`;
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('active');
        selectedIndex = -1;
        input.blur();
      }
    });

    const updateItemsSelection = (items) => {
      items.forEach((item, idx) => {
        item.classList.toggle('selected', idx === selectedIndex);
        if (idx === selectedIndex) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    };

    const navigateToProduct = (product) => {
      const slug = product.slug || slugify(product.name);
      window.location.href = `/product/${slug}`;
    };

    // 5. Clicking item selection
    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item) {
        const idx = parseInt(item.getAttribute('data-index'), 10);
        if (idx >= 0 && idx < suggestions.length) {
          navigateToProduct(suggestions[idx]);
        }
      }
    });

    // 6. Handle focus input open suggestion
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) {
        loadSuggestions(input.value);
      }
    });
  });

  // 7. Click outside auto-close dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-search') && !e.target.closest('.mobile-search')) {
      document.querySelectorAll('.search-suggestions').forEach(el => {
        el.classList.remove('active');
      });
    }
  });

  // User button
  const userBtn = document.querySelector('.user-btn');
  if (userBtn) {
    const user = getUser();
    if (user) userBtn.title = user.name;
  }

  // Cart badge
  updateCartBadge();

  // Back to top
  const backBtn = document.querySelector('.back-to-top');
  if (backBtn) backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ============ SCROLL REVEAL ============
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  const navRoot = document.getElementById('navbar-root');
  const footRoot = document.getElementById('footer-root');
  
  if (navRoot) navRoot.innerHTML = getNavbarHTML();
  if (footRoot) footRoot.innerHTML = getFooterHTML();
  
  initNavbar();
  setTimeout(initReveal, 100);
  setTimeout(window.updateHeartIcons, 200);
});

// Navbar HTML template
function getNavbarHTML() {
  const user = getUser();
  return `
  <nav class="navbar" id="navbar">
    <div class="nav-inner">
      <a href="/index.html" class="nav-logo">
        <div class="logo-icon">⚡</div>
        <span>ELECTRONIC <span class="highlight">WORLD</span></span>
      </a>
      <ul class="nav-links">
        <li class="mobile-search-item">
          <div class="mobile-search">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Search products..." id="mobile-search-input">
          </div>
        </li>
        <li><a href="/index.html">Home</a></li>
        <li><a href="/products.html">Products</a></li>
        <li><a href="/services.html">Services</a></li>
        <li><a href="/find-us.html">Find Us</a></li>
        <li><a href="/about.html">About Us</a></li>
      </ul>
      <div class="nav-actions">
        <div class="nav-search">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search products..." id="nav-search-input">
        </div>
        <button id="theme-toggle" class="nav-btn" title="Toggle Theme" onclick="toggleTheme()" style="transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">${document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙'}</button>
        <a href="/cart.html" class="nav-btn" title="Cart">🛒 <span class="cart-badge" style="display:none">0</span></a>
        <a href="/account.html" class="nav-btn user-btn" title="${user ? user.name : 'Account'}">👤</a>
        <button class="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </nav>`;
}

function getFooterHTML() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="nav-logo" style="margin-bottom:4px">
            <div class="logo-icon">⚡</div>
            <span>ELECTRONIC <span class="highlight">WORLD</span></span>
          </div>
          <p>Your trusted destination for premium electronics in Odisha. Quality products, competitive prices, and exceptional service since 2015.</p>
          <div class="footer-social">
            <a href="#" title="Facebook">📘</a>
            <a href="#" title="Twitter">🐦</a>
            <a href="#" title="Instagram">📸</a>
            <a href="#" title="YouTube">▶️</a>
          </div>
        </div>
        <div>
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/products.html">All Products</a></li>
            <li><a href="/services.html">Our Services</a></li>
            <li><a href="/find-us.html">Find Us</a></li>
            <li><a href="/about.html">About Us</a></li>
            <li><a href="/products.html?sort=newest">New Arrivals</a></li>
          </ul>
        </div>
        <div>
          <h4>Support</h4>
          <ul>
            <li><a href="/about.html">Contact Us</a></li>
            <li><a href="/find-us.html">Store Locations</a></li>
            <li><a href="/account.html">Track Order</a></li>
            <li><a href="#">Return Policy</a></li>
            <li><a href="#">Warranty</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li>📧 support@electronicworld.com</li>
            <li>📞 +91 98765 43210</li>
            <li>📍 KIIT Chowk, Patia, Bhubaneswar</li>
            <li>🕐 Mon-Sat: 10AM - 9PM</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Electronic World. All rights reserved.</p>
        <div class="footer-payments">
          <span>💳 Visa</span><span>💳 Mastercard</span><span>📱 UPI</span><span>🏦 Net Banking</span>
        </div>
      </div>
    </div>
  </footer>
  <button class="back-to-top" title="Back to top">↑</button>`;
}
