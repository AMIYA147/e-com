/* Homepage Logic */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();

  const categoryIcons = { Smartphones: '📱', Laptops: '💻', Audio: '🎧', 'Air Conditioning': '❄️', Accessories: '🔌', Tablets: '📟', 'Smart Home': '🏠', TV: '📺', Cameras: '📷' };

  try {
    const [products, categories] = await Promise.all([
      fetch(`${API}/products`).then(r => r.json()),
      fetch(`${API}/products/categories`).then(r => r.json())
    ]);

    // Categories
    const catGrid = document.getElementById('categories-grid');
    catGrid.innerHTML = categories.map(cat => {
      const count = products.filter(p => p.category === cat).length;
      return `<a href="/products.html?category=${encodeURIComponent(cat)}" class="category-card">
        <div class="cat-icon">${categoryIcons[cat] || '📦'}</div>
        <div class="cat-name">${cat}</div>
        <div class="cat-count">${count} products</div>
      </a>`;
    }).join('');

    // Featured (best sellers + high rating)
    const featured = products.filter(p => p.badge === 'Best Seller' || p.rating >= 4.7).slice(0, 8);
    document.getElementById('featured-products').innerHTML = featured.map(renderProductCard).join('');

    // Flash Deals (highest discount)
    const deals = [...products].sort((a, b) => (b.discount || 0) - (a.discount || 0)).slice(0, 4);
    document.getElementById('deal-products').innerHTML = deals.map(renderProductCard).join('');

    // New Arrivals
    const newA = products.filter(p => p.isNew).slice(0, 4);
    document.getElementById('new-arrivals').innerHTML = newA.map(renderProductCard).join('');

  } catch (err) {
    console.error('Failed to load data:', err);
  }

  // Testimonials
  const testimonials = [
    { name: 'Rajesh Mohapatra', role: 'Tech Enthusiast', text: '"Bought my MacBook Pro from Electronic World. Best prices in Bhubaneswar and the after-sales support is incredible!"', rating: 5, initial: 'R' },
    { name: 'Sneha Das', role: 'Student', text: '"Love the variety of products available. Got my AirPods Pro with warranty at a great deal. Highly recommend!"', rating: 5, initial: 'S' },
    { name: 'Priya Sharma', role: 'Business Owner', text: '"Electronic World is my go-to for all office equipment. Professional service and genuine products every time."', rating: 5, initial: 'P' }
  ];
  document.getElementById('testimonials-grid').innerHTML = testimonials.map(t => `
    <div class="testimonial-card">
      <div class="testimonial-stars">${'★'.repeat(t.rating)}</div>
      <p class="testimonial-text">${t.text}</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar">${t.initial}</div>
        <div><div class="testimonial-name">${t.name}</div><div class="testimonial-role">${t.role}</div></div>
      </div>
    </div>
  `).join('');

  // Countdown timer
  function updateCountdown() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const diff = end - now;
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('cd-hours').textContent = String(hrs).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Newsletter
  document.getElementById('newsletter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('input').value;
    try {
      const res = await fetch(`${API}/newsletter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (res.ok) { showToast(data.message, 'success'); e.target.reset(); }
      else showToast(data.error, 'error');
    } catch { showToast('Failed to subscribe', 'error'); }
  });

  initReveal();
});
