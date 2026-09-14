import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ADMIN_TOKEN_KEY = 'izakaya_admin_token';

function LoginPage({ onLogin }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/menu`, {
        headers: { 'Authorization': `Bearer ${token.trim()}` }
      });
      if (res.ok) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
        onLogin(token.trim());
      } else {
        setError('Token admin tidak valid');
      }
    } catch (err) {
      setError('Gagal menghubungi server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>📊 Admin Izakaya</h1>
          <p>Masukkan token admin untuk mengakses panel</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <div className="form-group">
            <label htmlFor="token">Admin Token</label>
            <input
              id="token"
              type="password"
              placeholder="Masukkan admin token"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Memverifikasi...' : 'Masuk'}
          </button>
        </form>
        <div className="login-hint">
          <small>Gunakan token yang dikonfigurasi oleh administrator server.</small>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [waiterRequests, setWaiterRequests] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(null);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [menuForm, setMenuForm] = useState({
    name: '',
    price: '',
    category: 'Appetizer',
    image: '🍱',
    description: ''
  });
  const [customCategory, setCustomCategory] = useState('');
  const [adminBillData, setAdminBillData] = useState(null);

  // Audio chime for waiter call
  const playChimeSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close() }, 400);
    } catch (e) {}
  };

  // Check for stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (stored) {
      setAdminToken(stored);
    }
  }, []);

  // Fetch initial data via REST (requires admin token)
  useEffect(() => {
    if (!adminToken) return;

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${adminToken}` };
        const [menuRes, tablesRes] = await Promise.all([
          fetch(`${API_URL}/api/menu`, { headers }),
          fetch(`${API_URL}/api/tables`, { headers })
        ]);
        if (menuRes.ok) {
          const data = await menuRes.json();
          setMenu(data.menu);
          setCategories(data.categories);
        }
        if (tablesRes.ok) {
          const data = await tablesRes.json();
          setTables(data);
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [adminToken]);

  // Initialize socket for real-time updates (requires admin token)
  useEffect(() => {
    if (!adminToken) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: adminToken }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join-kitchen'); // Admin also joins kitchen room to get orders
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('kitchen-orders', (orderList) => {
      setOrders(orderList);
    });

    newSocket.on('new-order', (order) => {
      setOrders(prev => [...prev, order].sort((a, b) => a.timestamp - b.timestamp));
    });

    newSocket.on('order-status-updated', ({ orderId, status }) => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    });

    newSocket.on('orders-completed', ({ tableId }) => {
      setOrders(prev => prev.filter(o => o.tableId !== tableId || o.status !== 'completed'));
    });

    newSocket.on('menu-updated', (data) => {
      setMenu(data.menu);
      setCategories(data.categories);
    });

    newSocket.on('admin-bill-data', (data) => {
      setAdminBillData(data);
    });

    newSocket.on('payment-confirmed', () => {
      setAdminBillData(null);
    });

    newSocket.on('waiter-requests-updated', (requests) => {
      setWaiterRequests(requests);
    });

    newSocket.on('waiter-called', (request) => {
      setWaiterRequests(prev => [...prev.filter(r => r.tableId !== request.tableId), request]);
      playChimeSound();
    });

    newSocket.on('error', ({ message }) => {
      if (message.includes('Unauthorized')) {
        handleLogout();
      }
    });

    return () => newSocket.close();
  }, [adminToken]);

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setSocket(null);
    setConnected(false);
    setTables([]);
    setMenu([]);
    setCategories([]);
    setOrders([]);
    setWaiterRequests([]);
    setAdminBillData(null);
  };

  const handleRequestAdminBill = (tableId) => {
    if (!socket || !adminToken) return;
    socket.emit('admin-request-bill', tableId);
  };

  const handleConfirmAdminPayment = (tableId) => {
    if (!socket || !adminToken) return;
    socket.emit('admin-confirm-payment', tableId);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleResolveWaiterRequest = (requestId) => {
    if (!socket || !adminToken) return;
    socket.emit('resolve-waiter-request', { requestId });
  };

  const showQR = (table) => {
    setSelectedTable(table);
    setQrCodeData(table.qrCode);
    setShowQRModal(true);
  };

  const openAddMenuModal = () => {
    setEditingMenu(null);
    setMenuForm({
      name: '',
      price: '',
      category: categories.length > 0 ? categories[0] : 'Appetizer',
      image: '🍱',
      description: ''
    });
    setCustomCategory('');
    setShowMenuModal(true);
  };

  const openEditMenuModal = (item) => {
    setEditingMenu(item);
    setMenuForm({
      name: item.name,
      price: item.price,
      category: item.category,
      image: item.image || '🍱',
      description: item.description || ''
    });
    setCustomCategory('');
    setShowMenuModal(true);
  };

  const handleToggleAvailable = async (item) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_URL}/api/menu/${item.id}/toggle-available`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal mengedit status stok');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMenu = async (item) => {
    if (!adminToken) return;
    if (!window.confirm(`Yakin ingin menghapus menu "${item.name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/menu/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal menghapus menu');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    
    const targetCategory = menuForm.category === 'NEW' ? customCategory.trim() : menuForm.category;
    if (!menuForm.name.trim() || !menuForm.price || !targetCategory) {
      alert('Mohon isi nama, harga, dan kategori menu!');
      return;
    }

    const payload = {
      name: menuForm.name.trim(),
      price: Number(menuForm.price),
      category: targetCategory,
      image: menuForm.image.trim() || '🍱',
      description: menuForm.description.trim()
    };

    try {
      const url = editingMenu ? `${API_URL}/api/menu/${editingMenu.id}` : `${API_URL}/api/menu`;
      const method = editingMenu ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal menyimpan menu');
      }
      setShowMenuModal(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const getTableOrders = (tableId) => {
    return orders.filter(o => o.tableId === tableId && o.status !== 'completed');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'preparing': return '#3b82f6';
      case 'ready': return '#10b981';
      case 'completed': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'preparing': return 'Memasak';
      case 'ready': return 'Siap';
      case 'completed': return 'Selesai';
      default: return status;
    }
  };

  if (!adminToken) {
    return <LoginPage onLogin={setAdminToken} />;
  }

  if (loading) {
    return <div className="loading">Memuat data...</div>;
  }

  const activeOrdersCount = orders.filter(o => o.status !== 'completed').length;
  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>📊 Admin Izakaya</h1>
          <span className={connected ? 'connected' : 'disconnected'}>
            {connected ? '🟢 Real-time' : '🔴 Offline'}
          </span>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{tables.length}</span>
            <span className="stat-label">Meja</span>
          </div>
          <div className="stat">
            <span className="stat-value">{activeOrdersCount}</span>
            <span className="stat-label">Aktif</span>
          </div>
          <div className="stat revenue">
            <span className="stat-value">Rp {totalRevenue.toLocaleString('id-ID')}</span>
            <span className="stat-label">Pendapatan</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="main">
        {/* Active Waiter Calls Section */}
        {waiterRequests.length > 0 && (
          <section className="waiter-calls-section">
            <div className="section-title-row">
              <h2>🛎️ Panggilan Pelayan Aktif ({waiterRequests.length})</h2>
            </div>
            <div className="waiter-calls-grid">
              {waiterRequests.map(req => (
                <div key={req.id} className="waiter-call-card">
                  <div className="waiter-call-header">
                    <span className="waiter-table-badge">Meja {req.tableNumber}</span>
                    <span className="waiter-call-time">
                      {new Date(req.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="waiter-call-type">
                    📌 <strong>{req.requestType}</strong>
                  </div>
                  <button
                    className="resolve-waiter-btn"
                    onClick={() => handleResolveWaiterRequest(req.id)}
                  >
                    ✅ Selesai / Dilayani
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tables Grid */}
        <section className="tables-section">
          <h2>Manajemen Meja</h2>
          <div className="tables-grid">
            {tables.map(table => {
              const tableOrders = getTableOrders(table.id);
              const activeWaitReq = waiterRequests.find(r => r.tableId === table.id);
              const pendingCount = tableOrders.filter(o => o.status === 'pending').length;
              const preparingCount = tableOrders.filter(o => o.status === 'preparing').length;
              const readyCount = tableOrders.filter(o => o.status === 'ready').length;

              return (
                <div key={table.id} className={`table-card ${activeWaitReq ? 'table-card-waiter-calling' : ''}`}>
                  <div className="table-header">
                    <span className="table-number">Meja {table.number}</span>
                    <button className="qr-btn" onClick={() => showQR(table)}>📱 QR</button>
                  </div>

                  {activeWaitReq && (
                    <div className="waiter-call-mini-badge">
                      <span>🔔 Memanggil: <strong>{activeWaitReq.requestType}</strong></span>
                      <button onClick={() => handleResolveWaiterRequest(activeWaitReq.id)}>✓</button>
                    </div>
                  )}

                  <div className="table-status">
                    {tableOrders.length === 0 ? (
                      <span className="status-empty">Kosong</span>
                    ) : (
                      <div className="status-badges">
                        {pendingCount > 0 && (
                          <span className="badge pending">{pendingCount} Menunggu</span>
                        )}
                        {preparingCount > 0 && (
                          <span className="badge preparing">{preparingCount} Memasak</span>
                        )}
                        {readyCount > 0 && (
                          <span className="badge ready">{readyCount} Siap</span>
                        )}
                      </div>
                    )}
                  </div>

                  {tableOrders.length > 0 && (
                    <div className="table-orders">
                      {tableOrders.map(order => (
                        <div key={order.id} className="mini-order">
                          <span>#{order.id.slice(0, 6)}</span>
                          <span className="mini-status" style={{ backgroundColor: getStatusColor(order.status) }}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="table-actions">
                    {tableOrders.length > 0 && (
                      <button className="billing-btn" onClick={() => handleRequestAdminBill(table.id)}>
                        💳 Pembayaran
                      </button>
                    )}
                    <a
                      href={`${window.location.origin}/customer.html?table=${table.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-btn"
                    >
                      Lihat Customer
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Menu Overview & CRUD */}
        <section className="menu-section">
          <div className="section-header-flex">
            <h2>Manajemen Menu ({menu.length} item)</h2>
            <button className="add-menu-btn" onClick={openAddMenuModal}>
              ➕ Tambah Menu Baru
            </button>
          </div>

          <div className="menu-grid">
            {categories.map(cat => (
              <div key={cat} className="category-card">
                <h3>{cat}</h3>
                {menu.filter(m => m.category === cat).map(item => (
                  <div key={item.id} className={`menu-item-admin ${item.available === 0 ? 'out-of-stock-item' : ''}`}>
                    <span className="item-emoji">{item.image}</span>
                    <div className="item-details">
                      <div className="item-title-row">
                        <span className="item-name">{item.name}</span>
                        {item.available === 0 && <span className="stock-badge">Habis</span>}
                      </div>
                      <span className="item-desc">{item.description}</span>
                      <span className="item-price">Rp {item.price.toLocaleString('id-ID')}</span>
                    </div>

                    <div className="menu-item-actions">
                      <button
                        className={`toggle-stock-btn ${item.available === 1 ? 'in-stock' : 'no-stock'}`}
                        onClick={() => handleToggleAvailable(item)}
                        title={item.available === 1 ? 'Tandai Stok Habis' : 'Tandai Tersedia'}
                      >
                        {item.available === 1 ? '🟢 Tersedia' : '🔴 Stok Habis'}
                      </button>
                      <button className="edit-btn" onClick={() => openEditMenuModal(item)} title="Edit Menu">
                        ✏️
                      </button>
                      <button className="delete-btn" onClick={() => handleDeleteMenu(item)} title="Hapus Menu">
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Add / Edit Menu Modal */}
      {showMenuModal && (
        <div className="modal-overlay" onClick={() => setShowMenuModal(false)}>
          <div className="modal form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingMenu ? '✏️ Edit Menu' : '➕ Tambah Menu Baru'}</h2>
              <button className="close-btn" onClick={() => setShowMenuModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveMenu} className="modal-form">
              <div className="form-group">
                <label>Nama Menu *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Ramen Shoyu"
                  value={menuForm.name}
                  onChange={e => setMenuForm({ ...menuForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Harga (Rp) *</label>
                <input
                  type="number"
                  required
                  min="1000"
                  step="500"
                  placeholder="Misal: 45000"
                  value={menuForm.price}
                  onChange={e => setMenuForm({ ...menuForm, price: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Kategori *</label>
                <select
                  value={menuForm.category}
                  onChange={e => setMenuForm({ ...menuForm, category: e.target.value })}
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="NEW">+ Kategori Baru...</option>
                </select>
              </div>

              {menuForm.category === 'NEW' && (
                <div className="form-group">
                  <label>Nama Kategori Baru *</label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: Special Yakitori"
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Emoji / Ikon</label>
                <input
                  type="text"
                  placeholder="Misal: 🍜, 🍣, 🍱"
                  value={menuForm.image}
                  onChange={e => setMenuForm({ ...menuForm, image: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Deskripsi</label>
                <textarea
                  rows={2}
                  placeholder="Deskripsi singkat makanan/minuman..."
                  value={menuForm.description}
                  onChange={e => setMenuForm({ ...menuForm, description: e.target.value })}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowMenuModal(false)}>
                  Batal
                </button>
                <button type="submit" className="save-btn">
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="modal qr-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📱 QR Code Meja {selectedTable.number}</h2>
              <button className="close-btn" onClick={() => setShowQRModal(false)}>✕</button>
            </div>
            <div className="qr-content">
              {qrCodeData ? (
                <img src={qrCodeData} alt={`QR Code Meja ${selectedTable.number}`} />
              ) : (
                <p>QR Code belum digenerate</p>
              )}
              <p className="qr-hint">Scan untuk membuka menu customer</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Bill & Receipt Modal */}
      {adminBillData && (
        <div className="modal-overlay no-print" onClick={() => setAdminBillData(null)}>
          <div className="modal admin-bill-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💳 Pembayaran Meja {adminBillData.bill.tableNumber}</h2>
              <button className="close-btn" onClick={() => setAdminBillData(null)}>✕</button>
            </div>
            
            <div className="admin-bill-content">
              {adminBillData.bill.items.length === 0 ? (
                <p>Belum ada pesanan yang Selesai (Completed) untuk dibayar.</p>
              ) : (
                <>
                  <div className="bill-items">
                    {adminBillData.bill.items.map((item, i) => (
                      <div key={i} className="bill-item">
                        <span>{item.name} x{item.quantity}</span>
                        <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bill-summary">
                    <div><span>Subtotal</span><span>Rp {adminBillData.bill.subtotal.toLocaleString('id-ID')}</span></div>
                    <div><span>PPN 11%</span><span>Rp {adminBillData.bill.tax.toLocaleString('id-ID')}</span></div>
                    <div className="bill-total"><span>Total</span><span>Rp {adminBillData.bill.total.toLocaleString('id-ID')}</span></div>
                  </div>
                  
                  <div className="admin-bill-actions">
                    <button className="print-btn" onClick={handlePrintReceipt}>
                      🖨️ Cetak Struk
                    </button>
                    <button className="confirm-pay-btn" onClick={() => handleConfirmAdminPayment(adminBillData.tableId)}>
                      ✅ Tandai Lunas
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print-only receipt layout */}
      {adminBillData && (
        <div className="print-receipt-layout print-only">
          <div className="receipt-header">
            <h2>🏮 Izakaya</h2>
            <p>Meja {adminBillData.bill.tableNumber}</p>
            <p>{new Date().toLocaleString('id-ID')}</p>
          </div>
          <div className="receipt-divider">--------------------------------</div>
          <div className="receipt-items">
            {adminBillData.bill.items.map((item, i) => (
              <div key={i} className="receipt-item">
                <div>{item.name}</div>
                <div className="receipt-item-row">
                  <span>{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</span>
                  <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="receipt-divider">--------------------------------</div>
          <div className="receipt-summary">
            <div className="receipt-row">
              <span>Subtotal</span>
              <span>Rp {adminBillData.bill.subtotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="receipt-row">
              <span>PPN 11%</span>
              <span>Rp {adminBillData.bill.tax.toLocaleString('id-ID')}</span>
            </div>
            <div className="receipt-row receipt-total">
              <span>TOTAL</span>
              <span>Rp {adminBillData.bill.total.toLocaleString('id-ID')}</span>
            </div>
          </div>
          <div className="receipt-divider">================================</div>
          <div className="receipt-footer">
            <p>Terima kasih atas kunjungan Anda!</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;