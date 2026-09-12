const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'izakaya.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize tables and create prepared statements
function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      number INTEGER UNIQUE NOT NULL,
      qr_code TEXT,
      access_token TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS menu (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      category TEXT NOT NULL,
      image TEXT,
      description TEXT,
      available INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON array
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, preparing, ready, completed
      timestamp INTEGER NOT NULL,
      total INTEGER NOT NULL,
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp);
  `);

  // Column migration for existing DB
  try {
    db.exec(`ALTER TABLE menu ADD COLUMN available INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE tables ADD COLUMN access_token TEXT`);
  } catch (e) {
    // Column already exists
  }

  const tablesWithoutTokens = db.prepare('SELECT id FROM tables WHERE access_token IS NULL').all();
  const setTableAccessToken = db.prepare('UPDATE tables SET access_token = ? WHERE id = ?');
  for (const table of tablesWithoutTokens) {
    setTableAccessToken.run(uuidv4() + uuidv4(), table.id);
  }

  // Seed tables if empty
  const tableCount = db.prepare('SELECT COUNT(*) as c FROM tables').get().c;
  if (tableCount === 0) {
    const insertTable = db.prepare('INSERT INTO tables (id, number) VALUES (?, ?)');
    const insertMany = db.transaction((tables) => {
      for (const t of tables) insertTable.run(t.id, t.number);
    });
    insertMany(Array.from({ length: 10 }, (_, i) => ({ id: `table-${i + 1}`, number: i + 1 })));
  }

  // Seed menu if empty
  const menuCount = db.prepare('SELECT COUNT(*) as c FROM menu').get().c;
  if (menuCount === 0) {
    const defaultMenu = [
      { id: 'm1', name: 'Edamame', price: 35000, category: 'Appetizer', image: '🫛', description: 'Rebus kacang edamame dengan garam laut', available: 1 },
      { id: 'm2', name: 'Gyoza (5 pcs)', price: 55000, category: 'Appetizer', image: '🥟', description: 'Dumpling goreng isi ayam sayur', available: 1 },
      { id: 'm3', name: 'Karaage', price: 65000, category: 'Appetizer', image: '🍗', description: 'Ayam goreng khas Jepang crispy', available: 1 },
      { id: 'm4', name: 'Salmon Sashimi (6 pcs)', price: 120000, category: 'Sashimi', image: '🍣', description: 'Salmon segar dipotong tipis', available: 1 },
      { id: 'm5', name: 'Tuna Sashimi (6 pcs)', price: 110000, category: 'Sashimi', image: '🍣', description: 'Tuna segar dipotong tipis', available: 1 },
      { id: 'm6', name: 'Chicken Teriyaki', price: 85000, category: 'Main', image: '🍗', description: 'Ayam panggang saus teriyaki manis', available: 1 },
      { id: 'm7', name: 'Salmon Teriyaki', price: 110000, category: 'Main', image: '🐟', description: 'Salmon panggang saus teriyaki', available: 1 },
      { id: 'm8', name: 'Yakisoba', price: 75000, category: 'Main', image: '🍜', description: 'Mie goreng khas Jepang sayur & ayam', available: 1 },
      { id: 'm9', name: 'Gyudon', price: 80000, category: 'Main', image: '🍚', description: 'Nasi dengan irisan daging sapi manis', available: 1 },
      { id: 'm10', name: 'Miso Soup', price: 25000, category: 'Soup', image: '🍲', description: 'Sup miso tradisional dengan tofu & wakame', available: 1 },
      { id: 'm11', name: 'Green Tea Ice Cream', price: 35000, category: 'Dessert', image: '🍵', description: 'Es krim matcha premium', available: 1 },
      { id: 'm12', name: 'Mochi Ice Cream (3 pcs)', price: 45000, category: 'Dessert', image: '🍡', description: 'Mochi isi es krim rasa vanilla, strawberry, matcha', available: 1 },
      { id: 'm13', name: 'Oolong Tea (Hot/Iced)', price: 20000, category: 'Drink', image: '🍵', description: 'Teh oolong premium', available: 1 },
      { id: 'm14', name: 'Ramune Soda', price: 30000, category: 'Drink', image: '🥤', description: 'Minuman soda khas Jepang botol kaca', available: 1 },
      { id: 'm15', name: 'Asahi Super Dry', price: 55000, category: 'Drink', image: '🍺', description: 'Bira Jepang ringan & segar', available: 1 },
    ];
    const insertMenu = db.prepare('INSERT INTO menu (id, name, price, category, image, description, available) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const m of items) insertMenu.run(m.id, m.name, m.price, m.category, m.image, m.description, m.available);
    });
    insertMany(defaultMenu);
  }
}

// Prepared statements (created after init)
let statements = null;

function getStatements() {
  if (!statements) {
    statements = {
      // Tables
      getAllTables: db.prepare('SELECT id, number, qr_code as qrCode FROM tables'),
      getTable: db.prepare('SELECT id, number, qr_code as qrCode FROM tables WHERE id = ?'),
      getTableAccessToken: db.prepare('SELECT access_token as accessToken FROM tables WHERE id = ?'),
      updateTableQrCode: db.prepare('UPDATE tables SET qr_code = ? WHERE id = ?'),

      // Menu
      getAllMenu: db.prepare('SELECT id, name, price, category, image, description, available FROM menu'),
      getMenuItemById: db.prepare('SELECT id, name, price, category, image, description, available FROM menu WHERE id = ?'),
      getMenuCategories: db.prepare('SELECT DISTINCT category FROM menu ORDER BY category'),
      createMenuItem: db.prepare('INSERT INTO menu (id, name, price, category, image, description, available) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      updateMenuItem: db.prepare('UPDATE menu SET name = ?, price = ?, category = ?, image = ?, description = ? WHERE id = ?'),
      deleteMenuItem: db.prepare('DELETE FROM menu WHERE id = ?'),
      toggleMenuAvailability: db.prepare('UPDATE menu SET available = ? WHERE id = ?'),

      // Orders
      createOrder: db.prepare('INSERT INTO orders (id, table_id, items, notes, status, timestamp, total) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      getOrdersByTable: db.prepare('SELECT * FROM orders WHERE table_id = ? ORDER BY timestamp'),
      getPendingOrders: db.prepare("SELECT * FROM orders WHERE status != 'completed' ORDER BY timestamp"),
      getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
      updateOrderStatus: db.prepare('UPDATE orders SET status = ? WHERE id = ?'),
      markTableOrdersCompleted: db.prepare("UPDATE orders SET status = 'completed' WHERE table_id = ? AND status != 'completed'"),
    };
  }
  return statements;
}

function getTableWithOrders(tableId) {
  const s = getStatements();
  const table = s.getTable.get(tableId);
  if (!table) return null;
  const orders = s.getOrdersByTable.all(tableId).map(o => ({
    ...o,
    items: JSON.parse(o.items)
  }));
  return { ...table, orders };
}

function getAllPendingOrdersWithTable() {
  const s = getStatements();
  const orders = s.getPendingOrders.all();
  return orders.map(o => {
    const table = s.getTable.get(o.table_id);
    return { ...o, tableNumber: table?.number, tableId: o.table_id, items: JSON.parse(o.items) };
  });
}

module.exports = {
  init,
  getTableWithOrders,
  getAllPendingOrdersWithTable,
  getStatements,
};