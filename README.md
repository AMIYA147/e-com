# 🌐 ELECTRONIC WORLD — E-commerce Web Application

Electronic World is a modern full-stack e-commerce platform specializing in consumer electronics. The application is built using a decoupled architecture with a static frontend hosted on Vercel, an Express.js backend hosted on Render, and Supabase for authentication and database services. The platform includes product catalog management, user authentication, reviews, wishlists, shopping cart functionality, and an administrative dashboard.

---

## ✨ Features

### 🛒 Client & Shopping Experience
- **Responsive Layout**: Designed for layout consistency across mobile, tablet, and desktop screens.
- **Dynamic SEO Slug Routing**: Clean, SEO-friendly URLs (`/product/:slug`) mapped transparently via Vercel edge rewrite rules.
- **Dynamic Search & Autocomplete**: Search bar featuring debounced autocomplete suggestions, cache matching, and category filtering.
- **Interactive Review System**: Users can submit star ratings and detailed comments; live update loops instantly recalculate average product ratings.
- **Persistent Wishlist**: Fully synchronized with Supabase database for logged-in accounts, with automatic fallback to local storage for guests.
- **Shopping Cart & Simulated Checkout**: Interactive cart sidebars, item quantity selectors, and simulated checkout flow. *Note: Payment gateway integration is not included in the current release. The checkout workflow is implemented for demonstration and testing purposes. Razorpay integration and real payment processing are planned for a future release.*

### 🛡️ User Authentication & Accounts
- **Supabase Auth Integration**: Secure registration, login, token-based session recovery, and automated redirection to initial destination paths on login.
- **Session Resiliency**: Session auto-cleanup intercepts `401 Unauthorized` responses from the backend, clears expired local tokens, and redirects safely.

### ⚙️ Admin Dashboard
- **Comprehensive Analytics**: Dashboard reporting sales, active inventory, and registration metrics.
- **Dynamic Catalog Management**: Create, edit, and archive products. Features automated dynamic SEO slug generation.
- **Dynamic Photo Uploads**: Drag-and-drop image uploading for inventory updates.
- **Order Management**: View customer orders and change order statuses using standard selectors synced with customer order timelines.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System with CSS variables), Vanilla JavaScript.
- **Backend API**: Node.js, Express.js.
- **Database / Auth**: Supabase (PostgreSQL, Realtime, Supabase Auth).
- **Hosting**:
  - **Frontend**: Vercel (Static Hosting with Rewrite Router rules)
  - **Backend**: Render (Web Service API)

---

## 🗺️ Roadmap & Future Enhancements

Planned features and enhancements for future releases include:

- **Razorpay Payment Gateway Integration**:
  - Secure checkouts supporting **Credit/Debit Card Payments**
  - Instant and seamless **UPI Payments**
  - **Net Banking** options with top financial institutions
  - Webhook handlers for robust backend **Payment Verification**
- **Customer Communications**:
  - Automatic **Order Confirmation Emails** sent upon successful transaction validation
  - Automated dynamic **Invoice Generation** with downloadable PDF receipts

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- A [Supabase](https://supabase.com/) account & project

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/AMIYA147/e-com.git
   cd e-com
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environmental variables. Create a `.env` file in the root directory:
   ```env
   PORT=3000
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Seed your Supabase database:
   ```bash
   npm run seed-db
   ```

5. Run the local development server:
   ```bash
   node server.js
   ```
   Open your browser to `http://localhost:3000`.

---

## 🌐 Production Deployment Configuration

### Frontend (Vercel)
To accommodate dynamic product slug page routes on a static server, the repository includes a custom Vercel configuration:
- **[vercel.json](file:///d:/patra%20trail/vercel.json)**:
  ```json
  {
    "rewrites": [
      {
        "source": "/product/:path*",
        "destination": "/product.html"
      }
    ]
  }
  ```
Vercel hosts the static HTML/CSS/JS frontend files and routes all dynamic requests matching `/product/<slug>` internally to `/product.html`, which handles path parameter parsing via client-side scripts.

### Backend (Render)
The Express backend is hosted on Render and serves API endpoints dynamically. CORS configuration in `server.js` automatically allows requests matching local development environments as well as all production `.vercel.app` subdomains.
