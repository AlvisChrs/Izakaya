const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// In-memory data store
const tables = new Map(); // tableId -> { id, number, qrCode, orders: [] }
const menu = [
  { id: 'm1', name: 'Edamame', price: 35000, category: 'Appetizer', image: '🫛', description: 'Rebus kacang edamame dengan garam laut' },
  { id: 'm2', name: 'Gyoza (5 pcs)', price: 55000, category: 'Appetizer', image: '🥟', description: 'Dumpling goreng isi ayam sayur' },
  { id: 'm3', name: 'Karaage', price: 65000, category: 'Appetizer', image: '🍗', description: 'Ayam goreng khas Jepang crispy' },
  { id: 'm4', name: 'Salmon Sashimi (6 pcs)', price: 120000, category: 'Sashimi', image: '🍣', description: 'Salmon segar dipotong tipis' },
  { id: 'm5', name: 'Tuna Sashimi (6 pcs)', price: 110000, category: 'Sashimi', image: '🍣', description: 'Tuna segar dipotong tipis' },
  { id: 'm6', name: 'Chicken Teriyaki', price: 85000, category: 'Main', image: '🍗', description: 'Ayam panggang saus teriyaki manis' },
  { id: 'm7', name: 'Salmon Teriyaki', price: 110000, category: 'Main', image: '🐟', description: 'Salmon panggang saus teriyaki' },
  { id: 'm8', name: 'Yakisoba', price: 75000, category: 'Main', image: '🍜', description: 'Mie goreng khas Jepang sayur & ayam' },
  { id: 'm9', name: 'Gyudon', price: 80000, category: 'Main', image: '🍚', description: 'Nasi dengan irisan daging sapi manis' },
  { id: 'm10', name: 'Miso Soup', price: 25000, category: 'Soup', image: '🍲', description: 'Sup miso tradisional dengan tofu & wakame' },
  { id: 'm11', name: 'Green Tea Ice Cream', price: 35000, category: 'Dessert', image: '🍵', description: 'Es krim matcha premium' },
  { id: 'm12', name: 'Mochi Ice Cream (3 pcs)', price: 45000, category: 'Dessert', image: '🍡', description: 'Mochi isi es krim rasa vanilla, strawberry, matcha' },
  { id: 'm13', name: 'Oolong Tea (Hot/Iced)', price: 20000, category: 'Drink', image: '🍵', description: 'Teh oolong premium' },
  { id: 'm14', name: 'Ramune Soda', price: 30000, category: 'Drink', image: '🥤', description: 'Minuman soda khas Jepang botol kaca' },
  { id: 'm15', name: 'Asahi Super Dry', price: 55000, category: 'Drink', image: '🍺', description: 'Bira Jepang ringan & segar' },
];

const categories = [...new Set(menu.map(m => m.category))];

// Initialize 10 tables
for (let i = 1; i <= 10; i++) {
  const tableId = `table-${i}`;
  tables.set(tableId, { id: tableId, number: i, qrCode: null, orders: [] });
}

// Generate QR codes for tables
async function generateQRCodes() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  for (const [tableId, table] of tables) {
    const url = `${baseUrl}/customer.html?table=${tableId}`;
    table.qrCode = await QRCode.toDataURL(url);
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Customer joins table room
  socket.on('join-table', (tableId) => {
    const table = tables.get(tableId);
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
    // Send all pending orders
    const allOrders = [];
    for (const [tableId, table] of tables) {
      for (const order of table.orders) {
        if (order.status !== 'completed') {
          allOrders.push({ ...order, tableNumber: table.number, tableId });
        }
      }
    }
    socket.emit('kitchen-orders', allOrders.sort((a, b) => a.timestamp - b.timestamp));
    console.log('Kitchen staff joined');
  });

  // Customer places order
  socket.on('place-order', ({ tableId, items, notes }) => {
    const table = tables.get(tableId);
    if (!table) return;

    const orderId = uuidv4();
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
      status: 'pending', // pending, preparing, ready, completed
      timestamp: Date.now(),
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    };

    table.orders.push(order);

    // Notify customer
    io.to(`table-${tableId}`).emit('order-placed', order);
    // Notify kitchen
    io.to('kitchen').emit('new-order', { ...order, tableNumber: table.number, tableId });
    
    console.log(`New order ${orderId} from table ${table.number}`);
  });

  // Kitchen updates order status
  socket.on('update-order-status', ({ orderId, status }) => {
    for (const [tableId, table] of tables) {
      const order = table.orders.find(o => o.id === orderId);
      if (order) {
        order.status = status;
        // Notify customer
        io.to(`table-${tableId}`).emit('order-status-updated', { orderId, status });
        // Notify kitchen
        io.to('kitchen').emit('order-status-updated', { orderId, status, tableNumber: table.number, tableId });
        console.log(`Order ${orderId} status: ${status}`);
        break;
      }
    }
  });

  // Customer requests bill
  socket.on('request-bill', (tableId) => {
    const table = tables.get(tableId);
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
    const table = tables.get(tableId);
    if (!table) return;

    for (const order of table.orders) {
      if (order.status !== 'completed') {
        order.status = 'completed';
      }
    }
    io.to(`table-${tableId}`).emit('payment-confirmed');
    io.to('kitchen').emit('orders-completed', { tableId, tableNumber: table.number });
    console.log(`Payment confirmed for table ${table.number}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST endpoints
app.get('/api/menu', (req, res) => res.json({ menu, categories }));
app.get('/api/tables', (req, res) => {
  const tableList = Array.from(tables.values()).map(t => ({ id: t.id, number: t.number, qrCode: t.qrCode }));
  res.json(tableList);
});
app.get('/api/tables/:tableId', (req, res) => {
  const table = tables.get(req.params.tableId);
  if (table) res.json({ table, menu, categories });
  else res.status(404).json({ error: 'Table not found' });
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
  await generateQRCodes();
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Customer: http://localhost:${PORT}/customer.html?table=table-1`);
  console.log(`Kitchen: http://localhost:${PORT}/kitchen.html`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});