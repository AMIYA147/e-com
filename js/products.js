/* Products Listing Logic */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();

  const params = new URLSearchParams(window.location.search);
  let currentCategory = params.get('category') || '';
  let currentSort = params.get('sort') || '';
  let currentSearch = params.get('search') || '';

  const categoryImages = {
    'Smartphones': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
    'Laptops': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    'Audio': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',
    'Air Conditioning': '/images/ac_banner.png',
    'Accessories': 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400&h=400&fit=crop',
    'Tablets': 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',
    'Smart Home': 'https://images.unsplash.com/photo-1543512214-318c7553f230?w=400&h=400&fit=crop',
    'TV': 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop',
    'Cameras': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop'
  };

  function updateHeaderImage(cat) {
    const headerEl = document.getElementById('products-page-header');
    if (headerEl) {
      if (cat && categoryImages[cat]) {
        // Use a slightly larger crop for the banner background
        const bgUrl = categoryImages[cat].replace('w=400&h=400', 'w=1600&h=600');
        headerEl.style.backgroundImage = `url('${bgUrl}')`;
        headerEl.classList.add('has-bg');
      } else {
        headerEl.style.backgroundImage = 'none';
        headerEl.classList.remove('has-bg');
      }
    }
  }

  if (currentCategory) {
    document.getElementById('page-title').textContent = currentCategory;
    document.getElementById('breadcrumb-current').textContent = currentCategory;
    updateHeaderImage(currentCategory);
  } else {
    updateHeaderImage('');
  }
  if (currentSearch) {
    document.getElementById('page-title').textContent = `Search: "${currentSearch}"`;
    document.getElementById('breadcrumb-current').textContent = 'Search';
    const si = document.getElementById('nav-search-input');
    if (si) si.value = currentSearch;
  }
  if (currentSort) document.getElementById('sort-select').value = currentSort;

  // Load categories for filter
  try {
    const cats = await fetch(`${API}/products/categories`).then(r => r.json());
    const cf = document.getElementById('category-filters');
    cf.innerHTML = `<div class="filter-option ${!currentCategory ? 'active' : ''}" onclick="filterCategory('')"><input type="radio" name="cat" value="" ${!currentCategory ? 'checked' : ''}> All Categories</div>` +
      cats.map(c => `<div class="filter-option ${currentCategory === c ? 'active' : ''}" onclick="filterCategory('${c}')"><input type="radio" name="cat" value="${c}" ${currentCategory === c ? 'checked' : ''}> ${c}</div>`).join('');
  } catch {}

  loadProducts();

  // Sort
  document.getElementById('sort-select').addEventListener('change', (e) => { currentSort = e.target.value; loadProducts(); });

  // Price filter
  document.querySelectorAll('input[name="price"]').forEach(r => r.addEventListener('change', () => loadProducts()));
  document.querySelectorAll('input[name="rating"]').forEach(r => r.addEventListener('change', () => loadProducts()));

  // View toggle
  const grid = document.getElementById('products-grid');
  document.getElementById('grid-view-btn').addEventListener('click', function() {
    grid.style.gridTemplateColumns = ''; this.classList.add('active'); document.getElementById('list-view-btn').classList.remove('active');
  });
  document.getElementById('list-view-btn').addEventListener('click', function() {
    grid.style.gridTemplateColumns = '1fr'; this.classList.add('active'); document.getElementById('grid-view-btn').classList.remove('active');
  });

  // Mobile Filter Drawer Toggling
  const filterToggleBtn = document.getElementById('filter-toggle-btn');
  const sidebarEl = document.querySelector('.sidebar');
  const sidebarCloseBtn = document.getElementById('sidebar-close');
  const sidebarOverlayEl = document.getElementById('sidebar-overlay');

  const closeDrawer = () => {
    if (sidebarEl) sidebarEl.classList.remove('open');
    if (sidebarOverlayEl) sidebarOverlayEl.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (filterToggleBtn && sidebarEl && sidebarOverlayEl) {
    filterToggleBtn.addEventListener('click', () => {
      sidebarEl.classList.add('open');
      sidebarOverlayEl.classList.add('active');
      document.body.style.overflow = 'hidden';
    });

    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeDrawer);
    sidebarOverlayEl.addEventListener('click', closeDrawer);
  }

  window.filterCategory = function(cat) {
    currentCategory = cat;
    document.getElementById('page-title').textContent = cat || 'All Products';
    document.getElementById('breadcrumb-current').textContent = cat || 'Products';
    updateHeaderImage(cat);
    document.querySelectorAll('#category-filters .filter-option').forEach(el => {
      el.classList.toggle('active', el.querySelector('input').value === cat);
      el.querySelector('input').checked = el.querySelector('input').value === cat;
    });
    loadProducts();
    closeDrawer();
  };

  async function loadProducts() {
    const grid = document.getElementById('products-grid');
    const empty = document.getElementById('empty-state');
    grid.innerHTML = '<div class="skeleton" style="height:300px"></div>'.repeat(4);

    let url = `${API}/products?`;
    if (currentCategory) url += `category=${encodeURIComponent(currentCategory)}&`;
    if (currentSort) url += `sort=${currentSort}&`;
    if (currentSearch) url += `search=${encodeURIComponent(currentSearch)}&`;

    const price = document.querySelector('input[name="price"]:checked')?.value;
    if (price) { const [min, max] = price.split('-'); url += `minPrice=${min}&maxPrice=${max}&`; }

    const rating = document.querySelector('input[name="rating"]:checked')?.value;
    if (rating) url += `rating=${rating}&`;

    try {
      const products = await fetch(url).then(r => r.json());
      document.getElementById('result-count').textContent = `${products.length} products found`;
      if (products.length === 0) { grid.innerHTML = ''; empty.style.display = ''; }
      else { 
        empty.style.display = 'none'; 
        grid.innerHTML = products.map(renderProductCard).join(''); 
        if (typeof window.updateHeartIcons === 'function') {
          await window.updateHeartIcons();
        }
      }
    } catch (err) { 
      console.error(err);
      grid.innerHTML = '<p style="color:var(--text-muted);padding:40px;text-align:center">Failed to load products.</p>'; 
    }
  }
});
