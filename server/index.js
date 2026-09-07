require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const db = require('./db');
const { validate } = require('./validation');

db.init();
const s = db.getStatements();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Customer joins table room
  socket.on('join-table', (tableId) => {
    if (!validate.tableId(tableId)) {
      socket.emit('error', { message: 'Invalid table ID' });
      return;
    }
    const table = db.getTableWithOrders(tableId);
    const menu = s.getAllMenu.all();
    const categories = s.getMenuCategories.all().map(c => c.category);
    if (table) {
      socket.join(`table-${tableId}`);
      socket.emit('table-state', { table, menu, categories });
      console.log(`Customer joined table ${table.number}`);
    } else {
      socket.emit('error', { message: 'Meja tidak ditemukan' });
    }
  });

  // Kitchen staff joins kitchen room
  socket.on('join-kitchen', () => {
    socket.join('kitchen');
    const allOrders = db.getAllPendingOrdersWithTable();
    socket.emit('kitchen-orders', allOrders);
    console.log('Kitchen staff joined');
  });

  // Customer places order
  socket.on('place-order', ({ tableId, items, notes }) => {
    if (!validate.tableId(tableId)) {
      socket.emit('error', { message: 'Invalid table ID' });
      return;
    }
    if (!validate.menuItems(items)) {
      socket.emit('error', { message: 'Invalid order items' });
      return;
    }
    if (!validate.notes(notes)) {
      socket.emit('error', { message: 'Invalid notes (max 500 characters)' });
      return;
    }

    const table = s.getTable.get(tableId);
    if (!table) return;

    const orderId = validate.generateOrderId();
    const order = {
      id: orderId,
      tableId,
      tableNumber: table.number,
      items: items.map(item => ({
        menuId: item.menuId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        notes: item.notes || ''
      })),
      notes: notes || '',
      status: 'pending',
      timestamp: Date.now(),
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    };

    s.createOrder.run(orderId, tableId, JSON.stringify(order.items), order.notes, order.status, order.timestamp, order.total);

    // Notify customer
    io.to(`table-${tableId}`).emit('order-placed', order);
    // Notify kitchen
    io.to('kitchen').emit('new-order', { ...order, tableNumber: table.number, tableId });

    console.log(`New order ${orderId} from table ${table.number}`);
  });

  // Kitchen updates order status
  socket.on('update-order-status', ({ orderId, status }) => {
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
    if (!validate.tableId(tableId)) {
      socket.emit('error', { message: 'Invalid table ID' });
      return;
    }
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

  // Customer pays (marks orders as completed)
  socket.on('pay-bill', (tableId) => {
    if (!validate.tableId(tableId)) {
      socket.emit('error', { message: 'Invalid table ID' });
      return;
    }
    const table = s.getTable.get(tableId);
    if (!table) return;

    s.markTableOrdersCompleted.run(tableId);
    io.to(`table-${tableId}`).emit('payment-confirmed');
    io.to('kitchen').emit('orders-completed', { tableId, tableNumber: table.number });
    console.log(`Payment confirmed for table ${table.number}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST endpoints
app.get('/api/menu', (req, res) => {
  const menu = s.getAllMenu.all();
  const categories = s.getMenuCategories.all().map(c => c.category);
  res.json({ menu, categories });
});

app.get('/api/tables', (req, res) => {
  const tableList = s.getAllTables.all();
  res.json(tableList);
});

app.get('/api/tables/:tableId', (req, res) => {
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
server.listen(PORT, async () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const tables = s.getAllTables.all();
  for (const table of tables) {
    const url = `${baseUrl}/customer.html?table=${table.id}`;
    const qrCode = await QRCode.toDataURL(url);
    s.updateTableQrCode.run(qrCode, table.id);
  }
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Customer: http://localhost:${PORT}/customer.html?table=table-1`);
  console.log(`Kitchen: http://localhost:${PORT}/kitchen.html`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
  console.log(`Health: http://localhost:${PORT}/health`);
});