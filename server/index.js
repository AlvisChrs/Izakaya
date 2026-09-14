require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const { validate } = require('./validation');
const auth = require('./auth');

db.init();
const s = db.getStatements();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Setup logging
const fs = require('fs');
const morgan = require('morgan');
const winston = require('winston');
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

// Override console to also log to file
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { originalLog(...args); logger.info(args.join(' ')); };
console.error = (...args) => { originalError(...args); logger.error(args.join(' ')); };

// Request logging middleware
app.use(morgan('short', { stream: { write: message => logger.info(message.trim()) } }));

io.use((socket, next) => {
  const handshakeToken = socket.handshake.auth?.token || socket.handshake.query?.token;
  socket.data.staffRole = auth.getStaffRole(handshakeToken);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // limit each IP to 150 requests per windowMs
  message: { error: 'Terlalu banyak permintaan, coba lagi nanti.' }
});
app.use('/api/', apiLimiter);

// Memory store for active waiter calls
let activeWaiterRequests = [];
// Cooldown map for call-waiter to prevent spam
const callWaiterCooldown = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const requireTableSession = (tableId) => {
    if (socket.data.tableId !== tableId) {
      socket.emit('error', { message: 'Unauthorized: Invalid table session' });
      return false;
    }
    return true;
  };

  // Customer joins a table using the unguessable token embedded in its QR code.
  socket.on('join-table', ({ tableId, token } = {}) => {
    if (!validate.tableId(tableId)) {
      socket.emit('error', { message: 'Invalid table ID' });
      return;
    }
    const tableToken = s.getTableAccessToken.get(tableId)?.accessToken;
    if (!auth.validateTableToken(token, tableToken)) {
      socket.emit('error', { message: 'Unauthorized: Invalid table access token' });
      return;
    }
    const table = db.getTableWithOrders(tableId);
    const menu = s.getAllMenu.all();
    const categories = s.getMenuCategories.all().map(c => c.category);
    if (table) {
      if (socket.data.tableId) socket.leave(`table-${socket.data.tableId}`);
      socket.data.tableId = tableId;
      socket.data.tableToken = token;
      socket.join(`table-${tableId}`);
      const activeReq = activeWaiterRequests.find(r => r.tableId === tableId);
      socket.emit('table-state', { table, menu, categories, activeWaiterRequest: activeReq || null });
      console.log(`Customer joined table ${table.number}`);
    } else {
      socket.emit('error', { message: 'Meja tidak ditemukan' });
    }
  });

  // Kitchen staff joins kitchen room (requires kitchen token)
  socket.on('join-kitchen', () => {
    if (socket.data.staffRole !== 'admin' && socket.data.staffRole !== 'kitchen') {
      socket.emit('error', { message: 'Unauthorized: Kitchen token required' });
      return;
    }
    socket.join('kitchen');
    const allOrders = db.getAllPendingOrdersWithTable();
    socket.emit('kitchen-orders', allOrders);
    socket.emit('waiter-requests-updated', activeWaiterRequests);
    console.log('Kitchen staff joined');
  });

  // Customer calls waiter
  socket.on('call-waiter', ({ tableId, requestType }) => {
    if (!requireTableSession(tableId)) return;
    if (!validate.waiterRequest({ tableId, requestType })) {
      socket.emit('error', { message: 'Permintaan panggil pelayan tidak valid' });
      return;
    }

    const now = Date.now();
    const lastCall = callWaiterCooldown.get(tableId) || 0;
    if (now - lastCall < 15000) { // 15 seconds cooldown
      socket.emit('error', { message: 'Terlalu banyak panggilan, mohon tunggu sebentar.' });
      return;
    }
    callWaiterCooldown.set(tableId, now);

    const table = s.getTable.get(tableId);
    if (!table) return;

    // Replace previous active request for this table if any
    activeWaiterRequests = activeWaiterRequests.filter(r => r.tableId !== tableId);

    const request = {
      id: uuidv4(),
      tableId,
      tableNumber: table.number,
      requestType,
      timestamp: Date.now(),
      socketId: socket.id
    };

    activeWaiterRequests.push(request);

    // Notify kitchen & admin staff
    io.to('kitchen').emit('waiter-called', request);
    io.to('kitchen').emit('waiter-requests-updated', activeWaiterRequests);
    // Notify table customer
    io.to(`table-${tableId}`).emit('waiter-request-active', request);

    console.log(`Waiter called by Table ${table.number}: ${requestType}`);
  });

  // Customer cancels waiter request
  socket.on('cancel-waiter-request', (tableId) => {
    if (!validate.tableId(tableId) || !requireTableSession(tableId)) return;
    const request = activeWaiterRequests.find(r => r.tableId === tableId && r.socketId === socket.id);
    if (!request) {
      socket.emit('error', { message: 'Unauthorized: You do not own this waiter request' });
      return;
    }

    activeWaiterRequests = activeWaiterRequests.filter(r => r.id !== request.id);
    io.to('kitchen').emit('waiter-requests-updated', activeWaiterRequests);
    io.to(`table-${tableId}`).emit('waiter-request-resolved', { tableId });
    console.log(`Waiter request cancelled by tableId ${tableId}`);
  });

  // Staff resolves waiter request (requires staff token)
  socket.on('resolve-waiter-request', ({ requestId }) => {
    if (socket.data.staffRole !== 'admin' && socket.data.staffRole !== 'kitchen') {
      socket.emit('error', { message: 'Unauthorized: Staff token required' });
      return;
    }
    const reqObj = activeWaiterRequests.find(r => r.id === requestId);
    activeWaiterRequests = activeWaiterRequests.filter(r => r.id !== requestId);

    io.to('kitchen').emit('waiter-requests-updated', activeWaiterRequests);
    if (reqObj) {
      io.to(`table-${reqObj.tableId}`).emit('waiter-request-resolved', { tableId: reqObj.tableId });
      console.log(`Waiter request ${requestId} resolved for Table ${reqObj.tableNumber}`);
    }
  });

  // Customer places order
  socket.on('place-order', ({ tableId, items, notes }) => {
    if (!validate.tableId(tableId) || !requireTableSession(tableId)) return;
    if (!validate.menuItems(items)) {
      socket.emit('error', { message: 'Invalid order items' });
      return;
    }
    if (!validate.notes(notes)) {
      socket.emit('error', { message: 'Invalid notes (max 500 characters)' });
      return;
    }

    // Check menu item availability
    const allMenuItems = s.getAllMenu.all();
    const authoritativeItems = [];
    for (const item of items) {
      const dbItem = allMenuItems.find(m => m.id === item.menuId);
      if (!dbItem || dbItem.available === 0) {
        socket.emit('error', { message: `Menu "${dbItem?.name || 'Pilihan'}" sedang habis / out of stock.` });
        return;
      }
      authoritativeItems.push({
        menuId: dbItem.id,
        name: dbItem.name,
        price: dbItem.price,
        quantity: item.quantity,
        notes: item.notes || ''
      });
    }

    const table = s.getTable.get(tableId);
    if (!table) return;

    const orderId = validate.generateOrderId();
    const order = {
      id: orderId,
      tableId,
      tableNumber: table.number,
      items: authoritativeItems,
      notes: notes || '',
      status: 'pending',
      timestamp: Date.now(),
      total: authoritativeItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    };

    s.createOrder.run(orderId, tableId, JSON.stringify(order.items), order.notes, order.status, order.timestamp, order.total);

    // Notify customer
    io.to(`table-${tableId}`).emit('order-placed', order);
    // Notify kitchen
    io.to('kitchen').emit('new-order', { ...order, tableNumber: table.number, tableId });

    console.log(`New order ${orderId} from table ${table.number}`);
  });

  // Kitchen updates order status (requires kitchen token)
  socket.on('update-order-status', ({ orderId, status }) => {
    if (socket.data.staffRole !== 'kitchen') {
      socket.emit('error', { message: 'Unauthorized: Kitchen token required' });
      return;
    }
    if (!validate.orderId(orderId)) {
      socket.emit('error', { message: 'Invalid order ID' });
      return;
    }
    if (!validate.orderStatus(status)) {
      socket.emit('error', { message: 'Invalid order status' });
      return;
    }

    const order = s.getOrderById.get(orderId);
    if (!order) return;

    s.updateOrderStatus.run(status, orderId);

    // Notify customer
    io.to(`table-${order.table_id}`).emit('order-status-updated', { orderId, status });
    // Notify kitchen
    io.to('kitchen').emit('order-status-updated', { orderId, status, tableNumber: order.table_number, tableId: order.table_id });
    console.log(`Order ${orderId} status: ${status}`);
  });

  // Customer requests bill
  socket.on('request-bill', (tableId) => {
    if (!validate.tableId(tableId) || !requireTableSession(tableId)) return;
    const table = db.getTableWithOrders(tableId);
    if (!table) return;

    const completedOrders = table.orders.filter(o => o.status === 'completed');
    const bill = {
      tableNumber: table.number,
      items: completedOrders.flatMap(o => o.items),
      subtotal: completedOrders.reduce((sum, o) => sum + o.total, 0),
      tax: 0,
      total: completedOrders.reduce((sum, o) => sum + o.total, 0),
      timestamp: Date.now()
    };
    bill.tax = Math.round(bill.subtotal * 0.11); // PPN 11%
    bill.total = bill.subtotal + bill.tax;

    io.to(`table-${tableId}`).emit('bill-generated', bill);
    console.log(`Bill generated for table ${table.number}`);
  });

  // Customer pays or requests cash payment
  socket.on('pay-bill', ({ tableId, paymentMethod }) => {
    if (!validate.tableId(tableId) || !requireTableSession(tableId)) return;
    const table = s.getTable.get(tableId);
    if (!table) return;

    if (paymentMethod === 'cash') {
      activeWaiterRequests = activeWaiterRequests.filter(r => r.tableId !== tableId);
      const request = {
        id: uuidv4(),
        tableId,
        tableNumber: table.number,
        requestType: 'Kasir ke meja (Bayar Tunai)',
        timestamp: Date.now(),
        socketId: socket.id
      };
      activeWaiterRequests.push(request);
      io.to('kitchen').emit('waiter-called', request);
      io.to('kitchen').emit('waiter-requests-updated', activeWaiterRequests);
      io.to(`table-${tableId}`).emit('waiter-request-active', request);
      io.to(`table-${tableId}`).emit('cash-payment-requested');
      console.log(`Cash payment requested by Table ${table.number}`);
    } else if (paymentMethod === 'qris') {
      s.markTableOrdersCompleted.run(tableId);
      io.to(`table-${tableId}`).emit('payment-confirmed');
      io.to('kitchen').emit('orders-completed', { tableId, tableNumber: table.number });
      console.log(`QRIS Payment confirmed for table ${table.number}`);
    }
  });

  // Admin requests bill for printing
  socket.on('admin-request-bill', (tableId) => {
    if (socket.data.staffRole !== 'admin' && socket.data.staffRole !== 'kitchen') {
      socket.emit('error', { message: 'Unauthorized: Staff token required' });
      return;
    }
    if (!validate.tableId(tableId)) return;
    const table = db.getTableWithOrders(tableId);
    if (!table) return;

    const completedOrders = table.orders.filter(o => o.status === 'completed');
    const bill = {
      tableNumber: table.number,
      items: completedOrders.flatMap(o => o.items),
      subtotal: completedOrders.reduce((sum, o) => sum + o.total, 0),
      tax: 0,
      total: completedOrders.reduce((sum, o) => sum + o.total, 0),
      timestamp: Date.now()
    };
    bill.tax = Math.round(bill.subtotal * 0.11);
    bill.total = bill.subtotal + bill.tax;

    socket.emit('admin-bill-data', { tableId, bill });
  });

  // Admin manually confirms payment
  socket.on('admin-confirm-payment', (tableId) => {
    if (socket.data.staffRole !== 'admin' && socket.data.staffRole !== 'kitchen') {
      socket.emit('error', { message: 'Unauthorized: Staff token required' });
      return;
    }
    if (!validate.tableId(tableId)) return;
    const table = s.getTable.get(tableId);
    if (!table) return;

    s.markTableOrdersCompleted.run(tableId);
    io.to(`table-${tableId}`).emit('payment-confirmed');
    io.to('kitchen').emit('orders-completed', { tableId, tableNumber: table.number });
    console.log(`Manual Payment confirmed by Admin for table ${table.number}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper: Broadcast updated menu state to all clients
function broadcastMenuUpdated() {
  const menu = s.getAllMenu.all();
  const categories = s.getMenuCategories.all().map(c => c.category);
  io.emit('menu-updated', { menu, categories });
}

// REST endpoints
app.get('/api/menu', auth.requireAdmin, (req, res) => {
  const menu = s.getAllMenu.all();
  const categories = s.getMenuCategories.all().map(c => c.category);
  res.json({ menu, categories });
});

// Admin: Add new menu item
app.post('/api/menu', auth.requireAdmin, (req, res) => {
  if (!validate.menuInput(req.body)) {
    return res.status(400).json({ error: 'Input menu tidak valid' });
  }

  const { name, price, category, image, description } = req.body;
  const id = `m_${Date.now()}`;
  const img = image && image.trim() !== '' ? image.trim() : '🍱';
  const desc = description ? description.trim() : '';

  try {
    s.createMenuItem.run(id, name.trim(), price, category.trim(), img, desc, 1);
    broadcastMenuUpdated();
    const newMenu = s.getMenuItemById.get(id);
    res.status(201).json({ message: 'Menu berhasil ditambahkan', menu: newMenu });
  } catch (err) {
    console.error('Error creating menu:', err);
    res.status(500).json({ error: 'Gagal menambahkan menu' });
  }
});

// Admin: Update menu item
app.put('/api/menu/:id', auth.requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = s.getMenuItemById.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Menu tidak ditemukan' });
  }

  if (!validate.menuInput(req.body)) {
    return res.status(400).json({ error: 'Input menu tidak valid' });
  }

  const { name, price, category, image, description } = req.body;
  const img = image && image.trim() !== '' ? image.trim() : existing.image;
  const desc = description !== undefined ? description.trim() : existing.description;

  try {
    s.updateMenuItem.run(name.trim(), price, category.trim(), img, desc, id);
    broadcastMenuUpdated();
    const updatedMenu = s.getMenuItemById.get(id);
    res.json({ message: 'Menu berhasil diperbarui', menu: updatedMenu });
  } catch (err) {
    console.error('Error updating menu:', err);
    res.status(500).json({ error: 'Gagal memperbarui menu' });
  }
});

// Admin: Toggle menu availability (Out of Stock / Tersedia)
app.patch('/api/menu/:id/toggle-available', auth.requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = s.getMenuItemById.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Menu tidak ditemukan' });
  }

  const newStatus = existing.available === 1 ? 0 : 1;
  try {
    s.toggleMenuAvailability.run(newStatus, id);
    broadcastMenuUpdated();
    res.json({ message: `Status menu diubah menjadi ${newStatus === 1 ? 'Tersedia' : 'Stok Habis'}`, available: newStatus });
  } catch (err) {
    console.error('Error toggling menu availability:', err);
    res.status(500).json({ error: 'Gagal mengubah status menu' });
  }
});

// Admin: Delete menu item
app.delete('/api/menu/:id', auth.requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = s.getMenuItemById.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Menu tidak ditemukan' });
  }

  try {
    s.deleteMenuItem.run(id);
    broadcastMenuUpdated();
    res.json({ message: 'Menu berhasil dihapus' });
  } catch (err) {
    console.error('Error deleting menu:', err);
    res.status(500).json({ error: 'Gagal menghapus menu' });
  }
});

app.get('/api/tables', auth.requireAdmin, (req, res) => {
  const tableList = s.getAllTables.all();
  res.json(tableList);
});

app.get('/api/tables/:tableId', auth.requireAdmin, (req, res) => {
  const table = db.getTableWithOrders(req.params.tableId);
  if (table) {
    const menu = s.getAllMenu.all();
    const categories = s.getMenuCategories.all().map(c => c.category);
    res.json({ table, menu, categories });
  } else {
    res.status(404).json({ error: 'Table not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve customer page
app.get('/customer.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/customer/index.html'));
});

// Serve kitchen page
app.get('/kitchen.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/kitchen/index.html'));
});

// Serve admin/table management page
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const tables = s.getAllTables.all();
  for (const table of tables) {
    const accessToken = s.getTableAccessToken.get(table.id)?.accessToken;
    const url = `${baseUrl}/customer.html?table=${table.id}&access=${encodeURIComponent(accessToken)}`;
    const qrCode = await QRCode.toDataURL(url);
    s.updateTableQrCode.run(qrCode, table.id);
  }
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Customer: scan the table QR code to open the ordering page');
    console.log(`Kitchen: http://localhost:${PORT}/kitchen.html`);
    console.log(`Admin: http://localhost:${PORT}/admin.html`);
    console.log(`Health: http://localhost:${PORT}/health`);
  });
}

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');

    // Close all socket.io connections
    io.close(() => {
      console.log('Socket.io connections closed');

      // Close database
      try {
        const db = require('./db');
        if (db && db.default && typeof db.default.close === 'function') {
          db.default.close();
        } else if (db && typeof db.close === 'function') {
          db.close();
        }
        console.log('Database connection closed');
      } catch (e) {
        console.error('Error closing database:', e.message);
      }

      console.log('Graceful shutdown complete');
      process.exit(0);
    });

    // Force close after 10s if sockets don't close
    setTimeout(() => {
      console.error('Force closing after timeout');
      process.exit(1);
    }, 10000);
  });

  // If server.close takes too long, force exit
  setTimeout(() => {
    console.error('Server close timeout, forcing exit');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

startServer();