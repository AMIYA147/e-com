/* Cart Page Logic */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();
  loadCart();
});

async function loadCart() {
  const user = getUser();
  const layout = document.getElementById('cart-layout');
  const empty = document.getElementById('empty-cart');

  let items = [], total = 0, savings = 0;

  if (user) {
    try {
      const data = await authFetch(`${API}/cart/${user.id}`).then(r => r.json());
      items = data.items || [];
      total = data.total || 0;
      savings = data.savings || 0;
    } catch { items = []; }
  } else {
    const localCart = getLocalCart();
    if (localCart.length === 0) { layout.style.display = 'none'; empty.style.display = ''; return; }
    try {
      const allProducts = await fetch(`${API}/products`).then(r => r.json());
      items = localCart.map(ci => {
        const product = allProducts.find(p => p.id === ci.productId);
        return product ? { ...ci, product } : null;
      }).filter(Boolean);
      total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
      savings = items.reduce((s, i) => s + (i.product.oldPrice ? (i.product.oldPrice - i.product.price) * i.quantity : 0), 0);
    } catch { items = []; }
  }

  if (items.length === 0) { layout.style.display = 'none'; empty.style.display = ''; return; }
  layout.style.display = ''; empty.style.display = 'none';

  layout.innerHTML = `
    <div class="cart-items">
      ${items.map(item => `
        <div class="cart-item">
          <div class="cart-item-image">
            <a href="/product.html?id=${item.productId}"><img src="${item.product.image || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'}" alt="${item.product.name}" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'; this.onerror=null;"></a>
          </div>
          <div class="cart-item-info">
            <h3><a href="/product.html?id=${item.productId}" style="color:var(--text-primary)">${item.product.name}</a></h3>
            <div class="category">${item.product.category}</div>
            <div class="item-price">${formatPrice(item.product.price)}</div>
          </div>
          <div class="cart-item-controls">
            <div class="qty-controls">
              <button onclick="changeQty(${item.productId}, ${item.quantity - 1})">−</button>
              <input type="number" value="${item.quantity}" readonly>
              <button onclick="changeQty(${item.productId}, ${item.quantity + 1})">+</button>
            </div>
            <div style="font-weight:700;font-family:var(--font-display)">${formatPrice(item.product.price * item.quantity)}</div>
            <button class="remove-btn" onclick="removeItem(${item.productId})">🗑️ Remove</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="cart-summary">
      <h3>Order Summary</h3>
      <div class="summary-row"><span>Subtotal (${items.reduce((s, i) => s + i.quantity, 0)} items)</span><span>${formatPrice(total)}</span></div>
      ${savings > 0 ? `<div class="summary-row"><span>Savings</span><span class="savings">-${formatPrice(savings)}</span></div>` : ''}
      <div class="summary-row"><span>Delivery</span><span style="color:var(--success)">FREE</span></div>
      <div class="summary-row total"><span>Total</span><span>${formatPrice(total)}</span></div>
      <div class="coupon-input">
        <input type="text" placeholder="Coupon code">
        <button class="btn btn-secondary btn-sm" onclick="showToast('Coupon applied!', 'success')">Apply</button>
      </div>
      <a href="/checkout.html" class="btn btn-primary btn-lg" style="width:100%">Proceed to Checkout →</a>
      <a href="/products.html" class="btn btn-secondary btn-sm" style="width:100%;margin-top:8px">Continue Shopping</a>
    </div>
  `;
}

window.changeQty = async function(productId, newQty) {
  if (newQty <= 0) return removeItem(productId);
  const user = getUser();
  if (user) {
    await authFetch(`${API}/cart/${user.id}/${productId}`, { method: 'PUT', body: JSON.stringify({ quantity: newQty }) });
  } else {
    const cart = getLocalCart();
    const item = cart.find(i => i.productId === productId);
    if (item) item.quantity = newQty;
    saveLocalCart(cart);
  }
  updateCartBadge();
  loadCart();
};

window.removeItem = async function(productId) {
  const user = getUser();
  if (user) {
    await authFetch(`${API}/cart/${user.id}/${productId}`, { method: 'DELETE' });
  } else {
    saveLocalCart(getLocalCart().filter(i => i.productId !== productId));
  }
  updateCartBadge();
  showToast('Item removed from cart', 'info');
  loadCart();
};
