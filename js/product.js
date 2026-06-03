/* Product Detail Logic */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = getNavbarHTML();
  document.getElementById('footer-root').innerHTML = getFooterHTML();
  initNavbar();

  // Route Handler: Supports both legacy ID-based (?id=123) and SEO friendly slug routing (/product/slug-name)
  let id = new URLSearchParams(window.location.search).get('id');
  const pathSegments = window.location.pathname.split('/');
  const productIdx = pathSegments.indexOf('product');
  let slug = '';
  
  if (productIdx !== -1 && pathSegments[productIdx + 1]) {
    slug = pathSegments[productIdx + 1];
  }

  // Load skeletons while resolving
  showSkeletonLoaders();

  if (!id && slug) {
    try {
      // Fetch all products to find matching slugified name
      const allProducts = await fetch(`${API}/products`).then(r => r.json());
      const matched = allProducts.find(p => p.slug === slug || slugify(p.name) === slug);
      if (matched) {
        id = matched.id;
      }
    } catch (err) {
      console.error("Failed to resolve slug routing:", err);
    }
  }

  if (!id) { 
    window.location.href = '/products.html'; 
    return; 
  }

  try {
    const data = await fetch(`${API}/products/${id}`).then(r => r.json());
    if (data.error) { 
      window.location.href = '/products.html'; 
      return; 
    }

    // Set page titles and metadata
    document.title = `${data.name} — ELECTRONIC WORLD`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', `Buy ${data.name} online at Electronic World. Check price, features, specs, and user reviews.`);
    }

    // Render Breadcrumbs
    const breadcrumbContainer = document.querySelector('.breadcrumb');
    if (breadcrumbContainer) {
      breadcrumbContainer.innerHTML = `
        <a href="/">Home</a> <span>›</span> 
        <a href="/products.html?category=${encodeURIComponent(data.category)}">${data.category}</a> <span>›</span> 
        <span id="breadcrumb-name">${data.name}</span>
      `;
    }

    const discPercent = data.oldPrice && data.oldPrice > data.price 
      ? Math.round(((data.oldPrice - data.price) / data.oldPrice) * 100) 
      : 0;

    let qty = 1;
    const detail = document.getElementById('product-detail');
    
    detail.innerHTML = `
      <div class="product-gallery">
        <div class="gallery-main">
          <img src="${data.images[0] || 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600&h=600&fit=crop'}" alt="${data.name}" id="main-img" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600&h=600&fit=crop'; this.onerror=null;">
        </div>
        <div class="gallery-thumbs">
          ${data.images.map((img, idx) => `
            <div class="gallery-thumb ${idx === 0 ? 'active' : ''}" onclick="switchGalleryImage(this, '${img}')">
              <img src="${img}" alt="View ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600&h=600&fit=crop'; this.onerror=null;">
            </div>
          `).join('')}
        </div>
      </div>
      <div class="product-info">
        <div class="badge-container">
          ${data.isNew || data.badge === 'Featured' ? `<span class="badge-pill featured">★ Featured</span>` : ''}
          ${discPercent > 0 ? `<span class="badge-pill discount">${discPercent}% OFF</span>` : ''}
          ${discPercent >= 15 ? `<span class="badge-pill deal">🔥 Best Deal</span>` : ''}
        </div>
        
        <div style="font-size: 0.9rem; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
          ${data.brand || 'Electronic World'}
        </div>
        <h1>${data.name}</h1>
        
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px;">
          Product ID / SKU: <span style="font-family: monospace; font-weight: 600; color: var(--text-secondary);">EW-10${data.id}</span>
        </div>

        <div class="product-meta">
          <div class="rating">
            <span class="stars" id="product-avg-stars">${getStars(data.rating)}</span> 
            <span id="product-avg-rating" style="font-weight:700;color:var(--text-primary);margin-left:4px;">${data.rating || '0.0'}</span>
          </div>
          <span class="reviews-count" id="product-reviews-count">(${data.reviews || 0} reviews)</span>
          <span class="stock ${data.stock > 5 ? 'stock-in' : data.stock > 0 ? 'stock-low' : 'stock-out'}">
            ${data.stock > 5 ? 'In Stock' : data.stock > 0 ? `Low Stock: ${data.stock} units left` : 'Out of Stock'}
          </span>
        </div>

        <div class="product-price-block">
          <div style="display: flex; flex-direction: column;">
            ${data.oldPrice ? `<span class="old-price" style="margin-bottom: 2px;">${formatPrice(data.oldPrice)}</span>` : ''}
            <span class="price">${formatPrice(data.price)}</span>
          </div>
          ${discPercent > 0 ? `
            <div style="margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span class="badge-pill discount" style="font-size: 0.85rem; padding: 6px 14px;">${discPercent}% OFF</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">You Save: ${formatPrice(data.oldPrice - data.price)}</span>
            </div>
          ` : ''}
        </div>

        <p class="product-description">${data.description}</p>
        
        ${(() => {
          const specsEntries = Object.entries(data.specs || {})
            .filter(([k, v]) => k && k.trim() !== '' && v !== null && v !== undefined && String(v).trim() !== '');
          if (specsEntries.length === 0) return '';
          return `
            <div class="product-specs" style="background: var(--bg-glass-light); padding: 24px; border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: 24px;">
              <h3 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; margin-bottom: 14px; color: var(--text-primary); letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; gap: 8px;">
                <span>📋</span> Specifications
              </h3>
              <table style="width: 100%; border-collapse: collapse;">
                ${specsEntries.map(([k, v], idx) => `
                  <tr style="border-bottom: 1px solid var(--border); ${idx === specsEntries.length - 1 ? 'border-bottom: none;' : ''}">
                    <td style="padding: 10px 0; color: var(--text-muted); font-weight: 600; width: 35%; font-size: 0.9rem;">${k}</td>
                    <td style="padding: 10px 0 10px 16px; color: var(--text-primary); font-size: 0.9rem;">${v}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          `;
        })()}

        <div class="quantity-selector">
          <label>Quantity:</label>
          <div class="qty-controls">
            <button onclick="updateQty(-1)" id="qty-minus" ${data.stock === 0 ? 'disabled' : ''}>−</button>
            <input type="number" id="qty-input" value="1" min="1" max="${data.stock}" readonly>
            <button onclick="updateQty(1)" id="qty-plus" ${data.stock === 0 ? 'disabled' : ''}>+</button>
          </div>
        </div>

        <div class="add-to-cart-group" style="display: flex; gap: 12px; align-items: center; width: 100%;">
          <button class="btn btn-primary btn-lg" onclick="addToCart(${data.id}, getQty())" id="add-to-cart-btn" ${data.stock === 0 ? 'disabled' : ''} style="flex: 1;">
            ${data.stock === 0 ? '❌ Out of Stock' : '🛒 Add to Cart'}
          </button>
          <button class="btn btn-secondary btn-lg" onclick="buyNow(${data.id})" id="buy-now-btn" ${data.stock === 0 ? 'disabled' : ''} style="flex: 1;">
            ⚡ Buy Now
          </button>
          <button class="btn-icon wishlist-btn" data-wishlist-id="${data.id}" onclick="toggleWishlist(${data.id})" title="Add to Wishlist" style="width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; background: var(--bg-glass-light); color: var(--text-primary); transition: all 0.3s ease; cursor: pointer; flex-shrink: 0;">
            ♡
          </button>
        </div>

        <div class="product-features">
          <div class="feature-item"><div class="feature-icon">🚚</div><div class="feature-text">Free Delivery</div></div>
          <div class="feature-item"><div class="feature-icon">🔄</div><div class="feature-text">7 Day Return</div></div>
          <div class="feature-item"><div class="feature-icon">🛡️</div><div class="feature-text">1 Year Warranty</div></div>
        </div>
      </div>
    `;

    // Commerce Selectors
    window.getQty = () => parseInt(document.getElementById('qty-input').value) || 1;
    window.updateQty = (delta) => {
      if (data.stock === 0) return;
      const inp = document.getElementById('qty-input');
      const val = Math.max(1, Math.min(data.stock, parseInt(inp.value) + delta));
      inp.value = val;
    };
    window.buyNow = async (pid) => {
      if (data.stock === 0) return;
      await addToCart(pid, getQty());
      window.location.href = '/cart.html';
    };

    // Render Related Products
    renderRelatedProducts(data);

    // Render Customer Reviews
    renderReviews(data, id);

    // Update active wishlist hearts
    if (typeof window.updateHeartIcons === 'function') {
      await window.updateHeartIcons();
    }

  } catch (err) {
    console.error("Failed to render product details:", err);
    document.getElementById('product-detail').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">😕</div>
        <h3>Product not found</h3>
        <p>Sorry, the product you are looking for does not exist or has been removed.</p>
        <a href="/products.html" class="btn btn-primary">Browse Products</a>
      </div>
    `;
  }
});

/* Premium Dynamic Image Gallery Switcher */
window.switchGalleryImage = (thumbEl, newSrc) => {
  const mainImg = document.getElementById('main-img');
  if (!mainImg || mainImg.src === newSrc) return;
  
  // Update active state of thumbnails
  document.querySelectorAll('.gallery-thumb').forEach(el => el.classList.remove('active'));
  thumbEl.classList.add('active');
  
  // Apply premium smooth opacity & transform scale transition
  mainImg.style.transition = 'opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
  mainImg.style.opacity = '0';
  mainImg.style.transform = 'scale(0.96)';
  
  setTimeout(() => {
    mainImg.src = newSrc;
    mainImg.onload = () => {
      mainImg.style.opacity = '1';
      mainImg.style.transform = 'scale(1)';
    };
    // fallback if onload fails or is instantaneous from cache
    setTimeout(() => {
      mainImg.style.opacity = '1';
      mainImg.style.transform = 'scale(1)';
    }, 120);
  }, 220);
};

/* Skeleton Loaders Generator */
function showSkeletonLoaders() {
  document.getElementById('product-detail').innerHTML = `
    <div class="product-gallery">
      <div class="gallery-main skeleton" style="aspect-ratio: 1; border-radius: var(--radius);"></div>
      <div class="gallery-thumbs">
        <div class="skeleton" style="width: 80px; height: 80px; border-radius: var(--radius-sm);"></div>
        <div class="skeleton" style="width: 80px; height: 80px; border-radius: var(--radius-sm);"></div>
        <div class="skeleton" style="width: 80px; height: 80px; border-radius: var(--radius-sm);"></div>
      </div>
    </div>
    <div class="product-info">
      <div class="skeleton" style="width: 120px; height: 24px; margin-bottom: 12px; border-radius: 100px;"></div>
      <div class="skeleton" style="width: 80%; height: 38px; margin-bottom: 16px; border-radius: var(--radius-sm);"></div>
      <div class="skeleton" style="width: 250px; height: 20px; margin-bottom: 24px; border-radius: var(--radius-sm);"></div>
      <div class="skeleton" style="width: 100%; height: 80px; margin-bottom: 24px; border-radius: var(--radius-sm);"></div>
      <div class="skeleton" style="width: 100%; height: 120px; margin-bottom: 24px; border-radius: var(--radius-sm);"></div>
      <div class="skeleton" style="width: 200px; height: 40px; border-radius: var(--radius-sm);"></div>
    </div>
  `;
}

/* Render Related Products Section */
function renderRelatedProducts(data) {
  const relatedSection = document.getElementById('related-section');
  const relatedProductsContainer = document.getElementById('related-products');
  
  if (data.related && data.related.length > 0) {
    relatedSection.style.display = '';
    
    // Filter out the current product itself to be completely robust
    const filteredRelated = data.related.filter(p => p.id !== data.id);
    
    if (filteredRelated.length > 0) {
      relatedProductsContainer.innerHTML = filteredRelated.map(renderProductCard).join('');
    } else {
      relatedSection.style.display = 'none';
    }
  } else {
    relatedSection.style.display = 'none';
  }
}

/* Render Reviews List and Submission Form */
function renderReviews(data, productId) {
  const reviewsSection = document.getElementById('reviews-section');
  const revs = data.reviews || [];
  const reviewCards = Array.isArray(revs) ? revs : [];
  
  const currentUser = getUser();
  
  let averageRatingHTML = '';
  if (reviewCards.length > 0) {
    averageRatingHTML = `
      <div style="display:flex; align-items:center; gap:24px; background:var(--bg-glass-light); border:1px solid var(--border); border-radius:var(--radius); padding:24px; margin-bottom:32px; flex-wrap:wrap;">
        <div style="text-align:center; padding-right:24px; border-right:1px solid var(--border);">
          <div style="font-family:var(--font-display); font-size:3.5rem; font-weight:800; line-height:1; color:var(--text-primary);">${data.rating || '0.0'}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">out of 5.0</div>
        </div>
        <div>
          <div style="display:flex; align-items:center; gap:8px; color:var(--accent-2); font-size:1.25rem;">
            ${getStars(data.rating)}
          </div>
          <div style="font-size:0.9rem; color:var(--text-secondary); margin-top:4px; font-weight:500;">Based on ${reviewCards.length} customer ratings</div>
        </div>
      </div>
    `;
  }

  reviewsSection.innerHTML = `
    <div class="section-header"><h2>Customer Reviews</h2><div class="section-line"></div></div>
    
    ${averageRatingHTML}
    
    <div id="reviews-list-container" style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
      ${reviewCards.length > 0 ? reviewCards.map(r => `
        <div class="review-card">
          <div class="review-header">
            <div class="review-author">
              <div class="review-avatar">${(r.name || 'U')[0].toUpperCase()}</div>
              <div>
                <div class="review-name" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span>${r.name || 'Anonymous User'}</span>
                  ${r.verifiedPurchase ? `<span class="verified-badge" title="Verified Purchase" style="color: #10b981; font-size: 0.72rem; font-weight: 700; background: rgba(16, 185, 129, 0.12); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">✔ Verified Purchase</span>` : ''}
                </div>
                <div class="review-date">${r.date}</div>
              </div>
            </div>
            <div class="review-stars">${getStars(r.rating)}</div>
          </div>
          <p class="review-text">${r.comment}</p>
        </div>
      `).join('') : '<p id="no-reviews-msg" style="color:var(--text-muted);text-align:center;padding:32px;background:var(--bg-glass-light);border-radius:var(--radius);border:1px solid var(--border);">No reviews yet. Be the first to share your thoughts!</p>'}
    </div>

    <!-- Review Form Section -->
    <div class="review-form-container">
      ${currentUser ? `
        <h3>Write a Review</h3>
        <p>Share your experience with this product to help others make informed decisions.</p>
        
        <form id="review-submission-form" onsubmit="handleReviewSubmit(event, ${productId})">
          <label style="display:block; font-weight:600; margin-bottom:8px; font-size:0.9rem; color:var(--text-secondary);">Your Rating:</label>
          <div class="review-stars-interactive" id="interactive-stars">
            <span data-val="1">☆</span>
            <span data-val="2">☆</span>
            <span data-val="3">☆</span>
            <span data-val="4">☆</span>
            <span data-val="5">☆</span>
          </div>
          
          <div class="form-group" style="margin-bottom: 20px;">
            <label for="review-comment" style="display:block; font-weight:600; margin-bottom:8px; font-size:0.9rem; color:var(--text-secondary);">Your Review:</label>
            <textarea id="review-comment" rows="4" placeholder="What did you like or dislike? Write your review here..." required style="width:100%; resize:vertical;"></textarea>
          </div>
          
          <button type="submit" class="btn btn-primary" id="submit-review-btn" style="min-width:160px;">Submit Review</button>
        </form>
      ` : `
        <div style="text-align:center; padding:12px 0;">
          <h3 style="font-size:1.15rem; margin-bottom:8px;">Want to write a review?</h3>
          <p style="margin-bottom:0;">Please <a href="/account.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}" style="color:var(--accent); font-weight:600; text-decoration:underline;">log in to your account</a> to write a review for this product.</p>
        </div>
      `}
    </div>
  `;

  // Wire up interactive stars if elements exist
  if (currentUser) {
    setupInteractiveStars();
  }
}

let activeRatingSelection = 0;
function setupInteractiveStars() {
  const stars = document.querySelectorAll('#interactive-stars span');
  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.getAttribute('data-val'));
      stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-val'));
        if (sVal <= val) {
          s.textContent = '★';
          s.classList.add('hovered');
        } else {
          s.textContent = '☆';
          s.classList.remove('hovered');
        }
      });
    });

    star.addEventListener('mouseout', () => {
      stars.forEach(s => {
        s.classList.remove('hovered');
        const sVal = parseInt(s.getAttribute('data-val'));
        if (sVal <= activeRatingSelection) {
          s.textContent = '★';
          s.classList.add('active');
        } else {
          s.textContent = '☆';
          s.classList.remove('active');
        }
      });
    });

    star.addEventListener('click', () => {
      activeRatingSelection = parseInt(star.getAttribute('data-val'));
      stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-val'));
        if (sVal <= activeRatingSelection) {
          s.textContent = '★';
          s.classList.add('active');
        } else {
          s.textContent = '☆';
          s.classList.remove('active');
        }
      });
    });
  });
}

/* Submit Review Handler */
window.handleReviewSubmit = async (event, productId) => {
  event.preventDefault();
  
  const submitBtn = document.getElementById('submit-review-btn');
  const commentInput = document.getElementById('review-comment');
  
  if (activeRatingSelection === 0) {
    showToast('Please select a star rating first!', 'error');
    return;
  }
  
  const commentText = commentInput.value.trim();
  if (!commentText) {
    showToast('Please enter a review comment!', 'error');
    return;
  }
  
  const user = getUser();
  if (!user) {
    showToast('You must be logged in to submit a review.', 'error');
    return;
  }
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    const response = await authFetch(`${API}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        productId,
        userId: user.id,
        rating: activeRatingSelection,
        comment: commentText
      })
    });
    
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to submit review');
    }
    
    showToast('Review submitted successfully!', 'success');
    
    // Remove "No reviews yet" message if present
    const noReviewsMsg = document.getElementById('no-reviews-msg');
    if (noReviewsMsg) {
      noReviewsMsg.remove();
    }
    
    // Prepend the new review to the container dynamically
    const listContainer = document.getElementById('reviews-list-container');
    const newCard = document.createElement('div');
    newCard.className = 'review-card';
    newCard.innerHTML = `
      <div class="review-header">
        <div class="review-author">
          <div class="review-avatar">${(result.name || user.name || 'U')[0].toUpperCase()}</div>
          <div>
            <div class="review-name" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>${result.name || user.name || 'Anonymous User'}</span>
              <span class="verified-badge" title="Verified Purchase" style="color: #10b981; font-size: 0.72rem; font-weight: 700; background: rgba(16, 185, 129, 0.12); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">✔ Verified Purchase</span>
            </div>
            <div class="review-date">${result.date || new Date().toISOString().split('T')[0]}</div>
          </div>
        </div>
        <div class="review-stars">${getStars(result.rating)}</div>
      </div>
      <p class="review-text">${result.comment}</p>
    `;
    listContainer.insertBefore(newCard, listContainer.firstChild);
    
    // Update live aggregates on the frontend instantly
    const reviews = listContainer.querySelectorAll('.review-card');
    const totalCount = reviews.length;
    
    let totalStars = 0;
    reviews.forEach(card => {
      const activeStars = card.querySelectorAll('.review-stars span').length; // Check how many stars rendered
      // Wait, let's use the actual star string characters or calculate it
      // Let's parse the stars from the actual card or recalculate mathematically
    });
    
    // Fetch updated product from backend to get perfect calculated average rating
    const updatedProd = await fetch(`${API}/products/${productId}`).then(r => r.json());
    if (updatedProd && !updatedProd.error) {
      // Update top product page aggregates
      document.getElementById('product-avg-stars').innerHTML = getStars(updatedProd.rating);
      document.getElementById('product-avg-rating').textContent = updatedProd.rating || '0.0';
      document.getElementById('product-reviews-count').textContent = `(${totalCount} reviews)`;
      
      // Update reviews section header / average review card aggregates
      renderReviews(updatedProd, productId);
    }
    
    // Reset selection and form
    activeRatingSelection = 0;
    if (commentInput) commentInput.value = '';
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
    }
  }
};
