# Electronic World — Application Architecture & Data Flow

This document provides a comprehensive map of the **Electronic World** e-commerce application architecture, tracing how the frontend pages, script modules, backend API endpoints, authentication mechanisms, and database structures connect.

---

## 📐 System Architecture Diagram

Below is the complete system diagram showing components grouped by tier, the data routes, and authentication flows:

```mermaid
flowchart TB
    %% Styling Definitions
    classDef page fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef script fill:#1e293b,stroke:#0ea5e9,stroke-width:1.5px,color:#cbd5e1;
    classDef backend fill:#172554,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef route fill:#1e1b4b,stroke:#6366f1,stroke-width:1px,color:#c7d2fe;
    classDef database fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff;
    classDef ext fill:#450a0a,stroke:#ef4444,stroke-width:1.5px,color:#fecaca;
    classDef arrow fill:none,stroke:#94a3b8,stroke-dasharray: 5 5;

    %% Subgraphs (Tiers)
    subgraph Frontend ["🖥️ FRONTEND TIER (Client Web Browser)"]
        direction TB
        subgraph HTML_Pages ["HTML Pages (User Interface)"]
            P_Home["index.html<br>(Store Home)"]:::page
            P_Catalog["products.html<br>(Products List)"]:::page
            P_Detail["product.html<br>(Single Product)"]:::page
            P_Cart["cart.html<br>(Shopping Cart)"]:::page
            P_Checkout["checkout.html<br>(Order Checkout)"]:::page
            P_Account["account.html<br>(Login / Profile)"]:::page
            P_Admin["admin.html<br>(Admin Panel)"]:::page
        end

        subgraph JS_Modules ["JS Modules (Logic & State)"]
            M_App["app.js<br>(Shared App module / Nav / Theme / Auth state)"]:::script
            M_Home["home.js"]:::script
            M_Products["products.js"]:::script
            M_Product["product.js"]:::script
            M_Cart["cart.js"]:::script
            M_Checkout["checkout.js"]:::script
            M_Account["account.js"]:::script
            M_Admin["admin.js"]:::script
        end
    end

    subgraph Backend ["⚙️ BACKEND API TIER (server.js Express)"]
        direction TB
        S_Express["Express App Server<br>(Running on Render)"]:::backend
        
        subgraph Middlewares ["Middlewares"]
            MW_CORS["CORS Middleware<br>(Allows Localhost & Render)"]:::route
            MW_Auth["requireAuth<br>(Bearer JWT Decryptor)"]:::route
            MW_AdminPage["requireAdminPage<br>(Cookie-based router guard)"]:::route
        end

        subgraph API_Routes ["API Endpoints"]
            R_Config["/api/config<br>(GET)"]:::route
            R_Products["/api/products/*<br>(GET/POST/PUT/DELETE)"]:::route
            R_Cart["/api/cart/*<br>(GET/POST/PUT/DELETE)"]:::route
            R_Orders["/api/orders/*<br>(GET/POST/PUT)"]:::route
            R_Profile["/api/auth/profile/*<br>(GET/PUT)"]:::route
            R_Wishlist["/api/wishlist/*<br>(GET/POST/DELETE)"]:::route
            R_Reviews["/api/reviews/*<br>(GET/POST)"]:::route
            R_Admin["/api/admin/*<br>(GET Stats / Orders / Users)"]:::route
        end
    end

    subgraph Database ["🗄️ SUPABASE TIER (Cloud Database & Services)"]
        direction TB
        Supabase_Client["Supabase SDK Connection"]:::database
        
        subgraph DB_Auth ["Identity Provider"]
            Auth_Users["GoTrue Auth Users<br>(Credentials Storage)"]:::ext
        end

        subgraph DB_Tables ["PostgreSQL Database Tables"]
            T_Users["users (Profiles & Wishlist)<br><i>Key: id (Auth UUID)</i>"]:::database
            T_Products["products (Catalog Items)<br><i>Key: id, slug</i>"]:::database
            T_Orders["orders (Header totals)<br><i>Key: id, user_id</i>"]:::database
            T_OrderItems["order_items (Line elements)<br><i>Key: order_id, product_id</i>"]:::database
            T_Reviews["reviews (Feedback scores)<br><i>Key: id, product_id, user_id</i>"]:::database
            T_Cart["cart (Synced user cart item states)<br><i>Key: user_id, product_id</i>"]:::database
        end

        subgraph DB_Storage ["Object Storage Buckets"]
            B_Images["product-images<br>(Assets bucket)"]:::database
        end
    end

    %% Component Interconnections
    P_Home <--> M_Home
    P_Catalog <--> M_Products
    P_Detail <--> M_Product
    P_Cart <--> M_Cart
    P_Checkout <--> M_Checkout
    P_Account <--> M_Account
    P_Admin <--> M_Admin

    HTML_Pages --> M_App

    %% Frontend to Backend Connection (fetch / authFetch)
    JS_Modules -- "HTTP REST Requests" --> MW_CORS
    MW_CORS --> S_Express

    %% Middleware routing
    S_Express --> R_Config
    S_Express --> R_Products
    S_Express --> R_Cart
    S_Express --> R_Orders
    S_Express --> R_Profile
    S_Express --> R_Wishlist
    S_Express --> R_Reviews
    S_Express --> R_Admin

    %% Guard triggers
    R_Profile -.-> MW_Auth
    R_Orders -.-> MW_Auth
    R_Cart -.-> MW_Auth
    R_Wishlist -.-> MW_Auth
    R_Admin -.-> MW_Auth
    P_Admin -.-> MW_AdminPage

    %% Backend to Database calls
    R_Config --> Supabase_Client
    R_Products --> Supabase_Client
    R_Cart --> Supabase_Client
    R_Orders --> Supabase_Client
    R_Profile --> Supabase_Client
    R_Wishlist --> Supabase_Client
    R_Reviews --> Supabase_Client
    R_Admin --> Supabase_Client

    Supabase_Client --> DB_Tables
    Supabase_Client --> DB_Storage

    %% Direct Client to Supabase Connection (Auth token generation)
    M_App -- "Direct Auth Call (signIn/signUp)" --> Auth_Users
    Auth_Users -- "Generates Session JWT" --> M_App
    MW_Auth -- "Verifies Session Token" --> Auth_Users
```

---

## 🔒 Authentication Flow

Below is a detailed sequence of how users are authenticated and how roles (such as Admin privileges) are checked securely on both the client and the server:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant AppJS as js/app.js (Client)
    participant AccountJS as js/account.js (Client)
    participant Express as server.js (Express API)
    participant GoTrue as Supabase Auth (Service)
    participant DBUsers as users Table (DB)

    %% Session Sign-in Phase
    User->>AccountJS: Fills Email & Password, clicks Login
    AccountJS->>GoTrue: supabase.auth.signInWithPassword({ email, password })
    alt Credentials Invalid
        GoTrue-->>AccountJS: Returns 401 Unauthorized / Error
        AccountJS-->>User: Displays error Toast ("Invalid login credentials")
    else Credentials Valid
        GoTrue-->>AccountJS: Returns Session (Access Token JWT + User Metadata)
        AccountJS->>AppJS: Native Event: onAuthStateChange triggers
        AppJS->>AppJS: Saves Access Token to LocalStorage (pe_token) & Cookie (pe_token)
        AppJS->>Express: fetch profile details (/api/auth/profile/:id) with Bearer Token
        Express->>GoTrue: Validate Token (supabase.auth.getUser)
        GoTrue-->>Express: Returns Valid Auth User details
        Express->>DBUsers: Fetch Profile Metadata from database (Role/Phone/Address)
        DBUsers-->>Express: Return user profile row
        Express-->>AppJS: Return unified user profile details
        AppJS->>AppJS: Saves Profile metadata to LocalStorage (pe_user)
        AppJS-->>User: Redirects to dashboard/checkout (Welcome toast!)
    end

    %% Authenticated REST Request Phase
    note over User, DBUsers: User executes an Authenticated Request (e.g., Post Order)
    User->>AccountJS: Clicks "Submit Order" / Checkout
    AccountJS->>Express: authFetch(/api/orders) with Bearer token in Headers
    Express->>Express: Hits requireAuth middleware
    Express->>GoTrue: Decode & verify token authenticity
    GoTrue-->>Express: Token Verified! Returns user UUID
    Express->>DBUsers: Query Role and Address from database for profile confirmation
    DBUsers-->>Express: Returns profile details (e.g., role: 'customer')
    Express->>Express: Attaches confirmed user to request (req.user)
    Express->>Express: Processes API route logic (inserts records)
    Express-->>User: Returns 201 Created (Success order response)
```

---

## 🔄 Data Lifecycle & Flow Map

### 1. Catalog Browsing & Live Autocomplete Search
* **Trigger**: A visitor types in the navigation bar search input ([js/app.js](file:///d:/patra%20trail/js/app.js)).
* **Flow**:
  1. Input event triggers a debounced HTTP request to `/api/products?search=<query>` on the Express backend.
  2. The Express server executes a query against the Supabase `products` table using `.or()` filters (matching on name, category, or brand).
  3. PostgreSQL returns matching records. The backend enriches the products (calculating discounts and stock statuses) and returns JSON.
  4. The frontend renders matching cards dynamically inside a floating autocomplete dropdown.
  5. The visitor clicks a card, transforming the name slug, and redirects to `/product/<slug>`.

### 2. Wishlist Management (Embedded Address Field)
* **Design Decision**: Instead of creating a separate relational table for Wishlists, items are saved inside a sub-array inside the stringified `address` JSON field in the `users` profile table.
* **Add to Wishlist**:
  1. User clicks the heart button on a product card.
  2. Frontend sends a `POST` request to `/api/wishlist/:userId` with the `productId`.
  3. Express loads the user's profile from the `users` table, parses the `address` JSON string, appends the new `productId` to `address.wishlist` array, stringifies it back, updates the row, and returns the updated ID array to the client.

### 3. Shopping Cart Sync
* **Design Decision**: Carts are synced locally for guest accounts using `localStorage` (`pe_cart`), and synchronized on the database when logged in.
* **Database Cart Operations**:
  1. User adds/updates items in the cart.
  2. Frontend fires `POST` / `PUT` / `DELETE` requests to `/api/cart/:userId/*`.
  3. Express performs database inserts/updates/deletions on the `cart` table in Supabase.
  4. Live cart counts are updated on the navbar badge.

### 4. Checkout and Ordering Process
* **Trigger**: User completes checkout form on [checkout.html](file:///d:/patra%20trail/checkout.html).
* **Flow**:
  1. Frontend submits order details to `POST /api/orders`.
  2. **RequireAuth** middleware confirms session.
  3. Express starts the transaction sequence:
     - Inserts order header details into the `orders` table.
     - Maps and inserts line items into the `order_items` table.
     - Clears the user's synced database cart items in the `cart` table.
  4. Response is returned to the client, which clears local cart storage and redirects to the account page to track the new order delivery.
