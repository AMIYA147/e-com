/* Checkout Page Logic — ELECTRONIC WORLD */
let selectedPayment = 'Card';

document.addEventListener('DOMContentLoaded', async () => {
  // Ensure Supabase client is initialized
  await ensureSupabase();

  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();

  // Enforce authentication
  const user = getUser();
  if (!user) {
    showToast('Please log in to proceed with checkout.', 'info');
    setTimeout(() => {
      window.location.href = '/account.html?redirect=checkout.html';
    }, 1500);
    return;
  }

  // Form fields remain blank by default for manual entry (no pre-fill)

  // Load cart summary dynamically from database
  let items = [];
  let total = 0;
  let savings = 0;

  try {
    const data = await authFetch(`${API}/cart/${user.id}`).then(r => r.json());
    items = data.items || [];
    total = data.total || 0;
    savings = data.savings || 0;
  } catch (err) {
    console.error("Error loading cart summary:", err);
    showToast("Failed to retrieve cart items. Redirecting...", "error");
    setTimeout(() => { window.location.href = '/cart.html'; }, 2000);
    return;
  }

  if (items.length === 0) {
    showToast("Your cart is empty. Redirecting...", "info");
    setTimeout(() => { window.location.href = '/cart.html'; }, 1500);
    return;
  }

  // Render the Dynamic Cart Summary Side-Panel
  document.getElementById('checkout-summary').innerHTML = `
    <div class="cart-summary" style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); padding:24px; position:sticky; top:calc(var(--nav-height) + 20px); box-shadow:var(--shadow)">
      <h3 style="font-family:var(--font-display); font-weight:700; margin-bottom:20px; color:var(--text-primary)">Order Summary</h3>
      <div style="max-height:320px; overflow-y:auto; margin-bottom:16px; padding-right:4px">
        ${items.map(i => {
          const mainImg = i.product.images && i.product.images.length > 0 ? i.product.images[0] : (i.product.image || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop');
          return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--border)">
              <div style="width:48px; height:48px; border-radius:var(--radius-sm); overflow:hidden; background:var(--bg-secondary); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0">
                <img src="${mainImg}" style="max-width:100%; max-height:100%; object-fit:contain" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400&h=400&fit=crop'; this.onerror=null;">
              </div>
              <div style="flex:1">
                <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${i.product.name}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px">Qty: ${i.quantity}</div>
              </div>
              <div style="font-weight:600; color:var(--text-primary); font-size:0.9rem">${formatPrice(i.product.price * i.quantity)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; border-top:1px solid var(--border); padding-top:16px">
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:var(--text-secondary)">
          <span>Subtotal</span>
          <span>${formatPrice(total)}</span>
        </div>
        ${savings > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:var(--text-secondary)">
          <span>Savings</span>
          <span style="color:var(--success)">-${formatPrice(savings)}</span>
        </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:var(--text-secondary)">
          <span>Delivery</span>
          <span style="color:var(--success); font-weight:600">FREE</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:1.1rem; color:var(--text-primary); border-top:1px dashed var(--border); padding-top:12px; margin-top:8px">
          <span>Total</span>
          <span>${formatPrice(total)}</span>
        </div>
      </div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:24px; text-align:center; display:flex; align-items:center; justify-content:center; gap:8px">
        <span>🔒 Secure 256-bit SSL Transaction</span>
      </div>
    </div>`;

  window._checkoutItems = items;
  window._checkoutTotal = total;
});

window.selectPayment = function(el, method) {
  selectedPayment = method;
  document.querySelectorAll('.payment-method').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('card-fields').style.display = method === 'Card' ? '' : 'none';
};

window.placeOrder = async function() {
  const name = document.getElementById('sh-name').value.trim();
  const phone = document.getElementById('sh-phone').value.trim();
  const address = document.getElementById('sh-address').value.trim();
  const city = document.getElementById('sh-city').value.trim();
  const state = document.getElementById('sh-state').value.trim();
  const zip = document.getElementById('sh-zip').value.trim();
  const email = document.getElementById('sh-email').value.trim();

  // Robust form input validations
  if (!name || !phone || !address || !city || !zip || !email) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  // Validate phone format
  if (!/^[+\d\s-]{10,15}$/.test(phone)) {
    showToast('Please enter a valid phone number', 'error');
    return;
  }

  // Validate zip format
  if (!/^\d{5,6}$/.test(zip)) {
    showToast('Please enter a valid PIN/Zip code', 'error');
    return;
  }

  const user = getUser();
  const items = window._checkoutItems || [];
  const total = window._checkoutTotal || 0;

  if (items.length === 0 || total === 0) {
    showToast('Transaction invalid. Empty cart.', 'error');
    return;
  }

  // Construct payload formatted for POST /api/orders in server.js
  const orderData = {
    userId: user.id,
    items: items.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      price: i.product.price
    })),
    total: total,
    paymentMethod: selectedPayment,
    shippingAddress: {
      name: name,
      phone: phone,
      street: address,
      city: city,
      state: state,
      zip: zip,
      email: email
    }
  };

  // Select place order button to disable and provide visual saving state
  const btn = document.querySelector('.checkout-layout .btn-primary');
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processing Transaction... 🔒';

  try {
    // 1. Submit Order to database via Server endpoint
    const res = await authFetch(`${API}/orders`, {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Backend failed to place order');
    }

    const order = await res.json();

    // 2. Automatically synchronize address and phone updates to database users table
    const profileUpdates = {
      name: name,
      phone: phone,
      address: { street: address, city, state, zip }
    };

    try {
      const profRes = await authFetch(`${API}/auth/profile/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(profileUpdates)
      });
      if (profRes.ok) {
        const updatedProfile = await profRes.json();
        // Update frontend auth cookie/localStorage payload
        setAuth(getToken(), updatedProfile);
      }
    } catch (profErr) {
      console.warn("Failed to synchronize used shipping address to customer profile:", profErr);
    }

    // 3. Clear local cart states and badge totals
    saveLocalCart([]);
    updateCartBadge();

    // Show high-end premium confirmation receipt page
    document.getElementById('checkout-layout').style.display = 'none';
    document.getElementById('order-result').style.display = '';
    
    // Animate view transition elegantly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('order-result').innerHTML = `
      <div class="order-success">
        <div class="success-icon">🎉</div>
        <h2 style="font-family:var(--font-display); font-weight:800; color:var(--text-primary)">Order Placed Successfully!</h2>
        <p style="color:var(--text-secondary); margin-top:6px; font-size:1.05rem">Thank you for shopping at Electronic World</p>
        
        <div class="order-id-badge">Order Reference: ${order.id}</div>
        
        <div class="receipt-details">
          <h4>Receipt Details</h4>
          <div class="receipt-row"><span>Date</span><span>${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></div>
          <div class="receipt-row"><span>Customer</span><span>${name}</span></div>
          <div class="receipt-row"><span>Email</span><span>${email}</span></div>
          <div class="receipt-row"><span>Phone Number</span><span>${phone}</span></div>
          <div class="receipt-row"><span>Shipping Address</span><span style="text-align:right">${address}, ${city}, ${state} - ${zip}</span></div>
          <div class="receipt-row"><span>Payment Method</span><span>${selectedPayment}</span></div>
          
          <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border)">
            <h5 style="font-family:var(--font-primary); font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px">Purchased Items</h5>
            ${items.map(i => {
              return `
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-secondary); margin-bottom:6px">
                  <span>${i.product.name} (x${i.quantity})</span>
                  <span>${formatPrice(i.product.price * i.quantity)}</span>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="receipt-row total"><span>Total Amount Paid</span><span>${formatPrice(total)}</span></div>
        </div>
        
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:32px">A confirmation and dispatch notification will be sent to your account profile shortly.</p>
        
        <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap">
          <a href="/account.html" class="btn btn-primary">📦 Track Order</a>
          <a href="/products.html" class="btn btn-secondary">🛒 Continue Shopping</a>
        </div>
      </div>
    `;
    
    showToast('Your order was placed successfully!', 'success');
  } catch (err) {
    console.error("Order submission failure:", err);
    showToast('Order Placement Failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
};
