# Izakaya QR Ordering System

Sistem pemesanan QR code untuk restoran dengan real-time WebSocket sync antara Customer, Kitchen, dan Admin.

## Tech Stack

- **Backend**: Node.js + Express + Socket.io + better-sqlite3
- **Frontend**: React 19 + Vite + socket.io-client (3 apps: Customer, Kitchen, Admin)
- **Database**: SQLite (WAL mode) dengan seed data otomatis

## Struktur Project

```
izakaya/
├── server/
│   ├── index.js      # Express + Socket.io server
│   ├── db.js         # SQLite setup, schema, seed, prepared statements
│   └── izakaya.db    # SQLite database (auto-generated)
├── frontend/
│   ├── customer/     # Customer React app (Vite)
│   ├── kitchen/      # Kitchen React app (Vite)
│   └── admin/        # Admin React app (Vite)
├── public/           # Built frontend assets (served by Express)
│   ├── customer/
│   ├── kitchen/
│   └── admin/
├── .env.example      # Environment variables template
└── package.json      # Root scripts & dependencies
```

## Quick Start

### 1. Install Dependencies

```bash
# Root dependencies (backend)
npm install

# Frontend dependencies (each app)
cd frontend/customer && npm install
cd ../kitchen && npm install
cd ../admin && npm install
cd ../..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env jika perlu (PORT, BASE_URL, DB_PATH, VITE_SOCKET_URL, VITE_API_URL)
```

### 3. Build Frontend (Production)

```bash
cd frontend/customer && npm run build
cd ../kitchen && npm run build
cd ../admin && npm run build
cd ../..
```

### 4. Run Server

```bash
# Development
npm run dev

# Production (after build)
npm start
```

Server berjalan di `http://localhost:3000` (default).

## Akses Aplikasi

| Role | URL | Deskripsi |
|------|-----|-----------|
| Customer | `http://localhost:3000/customer.html?table=table-1` | Scan QR meja, pilih menu, pesan, minta bill, bayar |
| Kitchen | `http://localhost:3000/kitchen.html` | Lihat pesanan masuk, update status (pending → preparing → ready → completed), notifikasi audio |
| Admin | `http://localhost:3000/admin.html` | Dashboard meja, monitor pesanan real-time, lihat QR code per meja, revenue tracking |

## API Endpoints

### REST

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/menu` | List menu + kategori |
| GET | `/api/tables` | List semua meja |
| GET | `/api/tables/:tableId` | Detail meja + orders + menu |
| GET | `/health` | Health check |

### WebSocket Events

**Client → Server**
- `join-table` (tableId) — Customer join room meja
- `join-kitchen` — Kitchen staff join room kitchen
- `place-order` ({ tableId, items[], notes }) — Customer buat pesanan
- `update-order-status` ({ orderId, status }) — Kitchen update status
- `request-bill` (tableId) — Customer minta bill
- `pay-bill` (tableId) — Customer bayar (mark completed)

**Server → Client**
- `table-state` ({ table, menu, categories }) — Initial state customer
- `order-placed` (order) — Konfirmasi pesanan ke customer
- `new-order` (order + tableNumber, tableId) — Notifikasi ke kitchen
- `order-status-updated` ({ orderId, status, tableNumber, tableId }) — Status change broadcast
- `kitchen-orders` (orders[]) — Initial load kitchen
- `bill-generated` (bill) — Bill detail ke customer
- `payment-confirmed` — Konfirmasi pembayaran ke customer
- `orders-completed` ({ tableId, tableNumber }) — Meja selesai ke kitchen

## Database Schema

```sql
tables (id, number, qr_code)
menu (id, name, price, category, image, description)
orders (id, table_id, items(JSON), notes, status, timestamp, total)
```

Status order: `pending` → `preparing` → `ready` → `completed`

## Development

### Run Frontend Dev Servers (with HMR)

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Customer frontend (port 5173)
cd frontend/customer && npm run dev

# Terminal 3: Kitchen frontend (port 5174)
cd frontend/kitchen && npm run dev

# Terminal 4: Admin frontend (port 5175)
cd frontend/admin && npm run dev
```

Vite proxy dikonfigurasi ke `http://localhost:3000` untuk `/api` dan `/socket.io`.

### Lint

```bash
cd frontend/customer && npm run lint
cd ../kitchen && npm run lint
cd ../admin && npm run lint
```

## Production Deployment

1. Build frontend: `npm run build` di tiap folder frontend
2. Set `NODE_ENV=production` dan env vars production di `.env`
3. Run: `npm start` (atau pakai PM2: `pm2 start server/index.js --name izakaya`)
4. Reverse proxy (Nginx) ke port 3000 + WebSocket upgrade

## Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| PORT | 3000 | Server port |
| BASE_URL | http://localhost:3000 | Base URL untuk generate QR code |
| DB_PATH | ./server/izakaya.db | Path SQLite database |
| VITE_SOCKET_URL | http://localhost:3000 | Socket.io server URL (client) |
| VITE_API_URL | http://localhost:3000 | REST API base URL (client) |

## Fitur Utama

- ✅ Real-time sync via Socket.io (customer ↔ kitchen ↔ admin)
- ✅ QR code per meja (auto-generate on startup)
- ✅ Menu kategorisasi (Appetizer, Sashimi, Main, Soup, Dessert, Drink)
- ✅ Keranjang dengan quantity & catatan per item
- ✅ Order status flow: pending → preparing → ready → completed
- ✅ Bill dengan PPN 11% otomatis
- ✅ Kitchen audio notification
- ✅ Admin dashboard: meja status, revenue, QR modal
- ✅ SQLite WAL mode untuk concurrency
- ✅ Responsive UI (mobile-friendly)

## Roadmap / TODO

- [ ] Admin CRUD menu & meja
- [ ] Autentikasi (JWT) untuk kitchen/admin
- [ ] Unit/Integration tests
- [ ] Dockerfile & docker-compose
- [ ] Persist keranjang ke localStorage
- [ ] Graceful shutdown handler
- [ ] Input validation middleware
- [ ] Error logging ke file

## License

MIT