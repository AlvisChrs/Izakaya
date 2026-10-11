import { useState, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';
import './theme.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
const ADMIN_TOKEN_KEY = 'izakaya_admin_token';

/* =========================================================
   LOGIN COMPONENT (Japanese Modern Izakaya Theme)
   ========================================================= */
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        localStorage.setItem('ADMIN_ROLE', data.role);
        onLogin({ token: data.token, role: data.role });
      } else {
        setError(data.error || 'Akses ditolak, username atau password salah.');
      }
    } catch (err) {
      console.error(err);
      setError('Gagal menghubungi server restoran.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-backdrop-decor"></div>
      <div className="login-card-container">
        <div className="login-header-block">
          <div className="login-seal">居</div>
          <h1>IZAKAYA ADMIN</h1>
          <p>Control Center & POS Restoran Modern</p>
        </div>

        {error && (
          <div className="login-error-alert">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              className="login-input"
              type="text"
              placeholder="Contoh: admin, kasir, dapur"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="login-form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
          </button>
        </form>

        <div className="demo-credentials-section">
          <div className="demo-credentials-title">Pilih Akun Demo (Klik untuk Isi):</div>
          <div className="demo-chips">
            <button
              type="button"
              className="demo-chip"
              onClick={() => handleQuickFill('admin', 'admin123')}
            >
              👑 Superadmin
            </button>
            <button
              type="button"
              className="demo-chip"
              onClick={() => handleQuickFill('kasir', 'kasir123')}
            >
              💳 Kasir
            </button>
            <button
              type="button"
              className="demo-chip"
              onClick={() => handleQuickFill('dapur', 'dapur123')}
            >
              👨‍🍳 Dapur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ORDER HISTORY COMPONENT
   ========================================================= */
function OrderHistoryTab({ adminToken }) {
  const [historyOrders, setHistoryOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/orders/history?page=${page}&limit=20`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        setHistoryOrders(data.orders || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [page, adminToken]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return historyOrders;
    const term = searchTerm.toLowerCase();
    return historyOrders.filter(o => 
      o.id.toLowerCase().includes(term) ||
      String(o.tableNumber).toLowerCase().includes(term)
    );
  }, [historyOrders, searchTerm]);

  return (
    <div className="report-subcard" style={{ padding: '24px' }}>
      <div className="section-header-row">
        <div>
          <h2>📜 Riwayat Transaksi & Pesanan</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Daftar lengkap transaksi yang telah dicatat sistem
          </p>
        </div>
        <input
          type="text"
          placeholder="Cari ID / Meja..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pos-search-input"
          style={{ width: '240px' }}
        />
      </div>

      {loading ? (
        <p style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data riwayat...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="clean-table">
              <thead>
                <tr>
                  <th>ID Pesanan</th>
                  <th>Waktu</th>
                  <th>Nomor Meja</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total Pembayaran</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      Belum ada riwayat pesanan yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>#{o.id.substring(0, 8)}</td>
                      <td>{new Date(o.timestamp).toLocaleString('id-ID')}</td>
                      <td>
                        <span style={{ fontWeight: '600' }}>Meja {o.tableNumber}</span>
                      </td>
                      <td>
                        <span className={`order-chip-status ${o.status}`}>
                          {o.status === 'completed' ? 'Selesai' : o.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--accent-crimson)' }}>
                        Rp {o.total.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="action-btn"
                style={{ padding: '8px 16px' }}
              >
                ← Sebelumnya
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Halaman {page} dari {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="action-btn"
                style={{ padding: '8px 16px' }}
              >
                Selanjutnya →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* =========================================================
   SALES REPORT & ANALYTICS COMPONENT
   ========================================================= */
function SalesReportTab({ adminToken }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState('all');

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/reports`;
      if (dateRange !== 'all') {
        const now = new Date();
        let start = now;
        if (dateRange === 'today') {
          start = new Date(now.setHours(0, 0, 0, 0));
        } else if (dateRange === 'week') {
          start = new Date(now.setDate(now.getDate() - 7));
        } else if (dateRange === 'month') {
          start = new Date(now.setMonth(now.getMonth() - 1));
        }
        url += `?start=${start.getTime()}&end=${Date.now()}`;
      }

      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${adminToken}` } });
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const exportToCSV = () => {
    if (!reportData || !reportData.orders) return;
    const headers = ['ID Pesanan,Tanggal,Metode Pembayaran,Total'];
    const rows = reportData.orders.map(o => `${o.id},${new Date(o.timestamp).toLocaleString('id-ID')},${o.payment_method || 'Tunai'},${o.total}`);
    const csvContent = 'data:text/csv;charset=utf-8,' + headers.concat(rows).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laporan_penjualan_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !reportData) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat laporan penjualan...</div>;
  }

  const sortedItems = Object.entries(reportData.itemsCount || {})
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  const totalQtySold = Object.values(reportData.itemsCount || {}).reduce((acc, cur) => acc + cur.qty, 0);
  const avgOrderValue = reportData.orders.length > 0 
    ? Math.round(reportData.totalRevenue / reportData.orders.length) 
    : 0;

  // Prepare chart data from payment methods
  const chartData = Object.entries(reportData.paymentMethods || {}).map(([method, amount]) => ({
    name: method,
    omzet: amount
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header & Filter Controls */}
      <div className="section-header-row" style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
        <div>
          <h2>📈 Analitik & Laporan Penjualan</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
            Pantau performa pendapatan dan menu restoran secara komprehensif
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="pos-cat-tab"
            style={{ padding: '8px 16px', outline: 'none' }}
          >
            <option value="all">Semua Waktu</option>
            <option value="today">Hari Ini</option>
            <option value="week">7 Hari Terakhir</option>
            <option value="month">30 Hari Terakhir</option>
          </select>
          <button
            onClick={exportToCSV}
            className="table-btn-primary"
            style={{ width: 'auto', padding: '9px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="reports-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Total Omzet</span>
          <span className="kpi-value gold">Rp {reportData.totalRevenue.toLocaleString('id-ID')}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Total Pesanan</span>
          <span className="kpi-value">{reportData.orders.length} Transaksi</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Rata-Rata Transaksi (AOV)</span>
          <span className="kpi-value">Rp {avgOrderValue.toLocaleString('id-ID')}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Menu Terjual</span>
          <span className="kpi-value">{totalQtySold} Porsi</span>
        </div>
      </div>

      {/* Recharts Chart Visualization */}
      <div className="reports-chart-card">
        <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.15rem', marginBottom: '20px', color: 'var(--text-primary)' }}>
          📊 Distribusi Omzet Berdasarkan Metode Pembayaran
        </h3>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={val => `Rp ${(val/1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(val) => [`Rp ${Number(val).toLocaleString('id-ID')}`, 'Omzet']}
                contentStyle={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)' }}
              />
              <Bar dataKey="omzet" fill="var(--accent-crimson)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dual Column: Top Selling Items & Payment Methods */}
      <div className="reports-dual-column">
        <div className="report-subcard">
          <h3>🍱 10 Menu Paling Laris</h3>
          <table className="clean-table">
            <thead>
              <tr>
                <th>Peringkat</th>
                <th>Nama Menu</th>
                <th style={{ textAlign: 'center' }}>Porsi</th>
                <th style={{ textAlign: 'right' }}>Total Omzet</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(([name, data], idx) => (
                <tr key={name}>
                  <td style={{ fontWeight: '700', width: '60px' }}>
                    {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                  </td>
                  <td style={{ fontWeight: '600' }}>{name}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{data.qty}</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--accent-crimson)' }}>
                    Rp {data.revenue.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-subcard">
          <h3>💳 Rincian Pembayaran</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            {Object.entries(reportData.paymentMethods || {}).map(([method, amount]) => (
              <div 
                key={method}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>
                    {method === 'Tunai' ? '💵' : method.includes('QRIS') ? '📱' : '💳'}
                  </span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{method}</span>
                </div>
                <span style={{ fontWeight: '700', color: 'var(--accent-gold)' }}>
                  Rp {amount.toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CUSTOMER FEEDBACK COMPONENT
   ========================================================= */
function FeedbacksTab({ adminToken }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/feedbacks`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
      .then(res => res.json())
      .then(data => setFeedbacks(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [adminToken]);

  const renderStars = (rating) => {
    return '⭐'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
  };

  return (
    <div className="report-subcard" style={{ padding: '24px' }}>
      <div className="section-header-row">
        <div>
          <h2>💬 Ulasan & Kepuasan Pelanggan</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Masukan langsung dari tamu yang menikmati hidangan Izakaya
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat ulasan pelanggan...</p>
      ) : feedbacks.length === 0 ? (
        <div className="ticket-empty" style={{ padding: '40px' }}>
          <span style={{ fontSize: '2rem' }}>🍵</span>
          <p>Belum ada ulasan yang ditinggalkan pelanggan.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {feedbacks.map(f => (
            <div
              key={f.id}
              style={{
                background: 'var(--bg-surface-elevated)',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                  Meja {String(f.table_id || '').replace('table-', '')}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {new Date(f.created_at).toLocaleString('id-ID')}
                </span>
              </div>
              <div style={{ fontSize: '1.15rem' }}>{renderStars(f.rating)}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontStyle: f.comment ? 'normal' : 'italic', lineHeight: 1.4 }}>
                &ldquo;{f.comment || 'Pelanggan tidak meninggalkan catatan khusus.'}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   POS / CASHIER MODE COMPONENT (Dual-Panel Split Screen)
   ========================================================= */
function POSTab({ adminToken, menu, categories, tables }) {
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(categories[0] || 'Semua');
  const [selectedTable, setSelectedTable] = useState('Walk-in / Takeaway');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allCategories = useMemo(() => ['Semua', ...categories], [categories]);

  const addToCart = (item) => {
    if (item.available === 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.menuId === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menuId === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        { menuId: item.id, name: item.name, price: item.price, quantity: 1, notes: '' },
      ];
    });
  };

  const updateQuantity = (menuId, delta) => {
    setCart((prev) => {
      const item = prev.find((i) => i.menuId === menuId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((i) => i.menuId !== menuId);
      return prev.map((i) =>
        i.menuId === menuId ? { ...i, quantity: newQty } : i
      );
    });
  };

  const clearCart = () => setCart([]);

  const filteredMenu = useMemo(() => {
    return menu.filter((m) => {
      const matchCat = activeCategory === 'Semua' || m.category === activeCategory;
      const matchSearch = !searchFilter || m.name.toLowerCase().includes(searchFilter.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menu, activeCategory, searchFilter]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const submitOrder = async () => {
    if (cart.length === 0) {
      alert('Keranjang kasir masih kosong!');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const isTable = selectedTable.startsWith('Meja ');
      const tableId = isTable ? `table-${selectedTable.replace('Meja ', '')}` : `pos-${Date.now()}`;

      const res = await fetch(`${API_URL}/api/pos/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          tableId,
          tableName: selectedTable,
          items: cart,
          notes: 'POS Kasir Order'
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Gagal membuat pesanan di kasir');
      }

      alert(`Pesanan berhasil dicatat untuk ${selectedTable}!`);
      clearCart();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pos-container">
      {/* Left: Menu Explorer (65%) */}
      <div className="pos-menu-panel">
        <div className="pos-panel-header">
          <input
            type="text"
            className="pos-search-input"
            placeholder="🔍 Cari menu hidangan (contoh: Ramen, Sushi, Ocha)..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
          />
          <div className="pos-category-tabs">
            {allCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`pos-cat-tab ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="pos-items-grid">
          {filteredMenu.map((item) => {
            const inCartItem = cart.find(c => c.menuId === item.id);
            return (
              <div
                key={item.id}
                className={`pos-item-card ${item.available === 0 ? 'out-of-stock' : ''}`}
                onClick={() => addToCart(item)}
              >
                <div className="pos-item-visual">
                  {item.image && (item.image.startsWith('http') || item.image.startsWith('/uploads')) ? (
                    <img src={item.image} alt={item.name} />
                  ) : (
                    <span>{item.image || '🍱'}</span>
                  )}
                </div>
                <div className="pos-item-name">{item.name}</div>
                <div className="pos-item-price">Rp {item.price.toLocaleString('id-ID')}</div>
                <div className="pos-item-stock-tag">
                  {item.available === 0 ? '❌ Habis' : `Stok: ${item.available || 'Tersedia'}`}
                </div>
                {inCartItem && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'var(--accent-crimson)',
                    color: '#FFF',
                    fontSize: '0.72rem',
                    fontWeight: '800',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {inCartItem.quantity}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Cart & Ticket Summary (35%) */}
      <div className="pos-ticket-panel">
        <div className="ticket-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>🛒 Tiket Kasir</h3>
            {cart.length > 0 && (
              <button onClick={clearCart} style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600' }}>
                Kosongkan
              </button>
            )}
          </div>
          <select
            className="ticket-table-select"
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
          >
            <option value="Walk-in / Takeaway">Walk-in / Bawa Pulang (Takeaway)</option>
            {tables.map(t => (
              <option key={t.id} value={`Meja ${t.number}`}>Meja {t.number}</option>
            ))}
          </select>
        </div>

        <div className="ticket-items-list">
          {cart.length === 0 ? (
            <div className="ticket-empty">
              <span>🍱</span>
              <p>Belum ada item dipilih.</p>
              <small>Klik menu di samping untuk menambahkan.</small>
            </div>
          ) : (
            cart.map(c => (
              <div key={c.menuId} className="ticket-item-row">
                <div className="ticket-item-info">
                  <div className="ticket-item-title">{c.name}</div>
                  <div className="ticket-item-unit-price">
                    Rp {c.price.toLocaleString('id-ID')} &times; {c.quantity} = Rp {(c.price * c.quantity).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="ticket-qty-control">
                  <button className="ticket-qty-btn" onClick={() => updateQuantity(c.menuId, -1)}>-</button>
                  <span className="ticket-qty-number">{c.quantity}</span>
                  <button className="ticket-qty-btn" onClick={() => updateQuantity(c.menuId, 1)}>+</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="ticket-summary-footer">
          <div className="ticket-calc-row">
            <span>Subtotal</span>
            <span>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <div className="ticket-calc-row total">
            <span>Total Tagihan</span>
            <span style={{ color: 'var(--accent-gold)' }}>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <button
            type="button"
            className="ticket-submit-btn"
            disabled={cart.length === 0 || isSubmitting}
            onClick={submitOrder}
          >
            {isSubmitting ? 'Memproses Pesanan...' : '✅ Buat & Proses Pesanan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STAFF MANAGEMENT COMPONENT
   ========================================================= */
function StaffTab({ adminToken }) {
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'kasir' });
  const [loading, setLoading] = useState(false);

  const fetchStaff = () => {
    fetch(`${API_URL}/api/staff`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
      .then(res => res.json())
      .then(data => setStaffList(data || []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambahkan staf');
      alert('Staf baru berhasil ditambahkan!');
      setForm({ username: '', password: '', role: 'kasir' });
      fetchStaff();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, username) => {
    if (!confirm(`Hapus akun staf "${username}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal menghapus akun staf');
      fetchStaff();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
      <div className="report-subcard">
        <h3>➕ Tambah Akun Staf Baru</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
          <div className="modal-form-group">
            <label>Username</label>
            <input
              type="text"
              required
              className="modal-input"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="Misal: kasir_pagi"
            />
          </div>
          <div className="modal-form-group">
            <label>Password</label>
            <input
              type="password"
              required
              className="modal-input"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="Minimal 6 karakter"
            />
          </div>
          <div className="modal-form-group">
            <label>Peran / Role</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              className="modal-select"
            >
              <option value="kasir">Kasir</option>
              <option value="dapur">Dapur (Kitchen Display)</option>
              <option value="admin">Superadmin</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="table-btn-primary">
            {loading ? 'Menyimpan...' : 'Simpan Akun Staf'}
          </button>
        </form>
      </div>

      <div className="report-subcard">
        <h3>👥 Daftar Staf Aktif</h3>
        <table className="clean-table" style={{ marginTop: '16px' }}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: '600' }}>{s.username}</td>
                <td>
                  <span className="order-chip-status preparing" style={{ textTransform: 'capitalize' }}>
                    {s.role}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => handleDelete(s.id, s.username)}
                    className="action-btn delete"
                  >
                    🗑️ Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================
   SETTINGS & RESTAURANT CONFIG COMPONENT
   ========================================================= */
function SettingsTab({ adminToken }) {
  const [settings, setSettings] = useState({ restaurant_name: '', tax_rate: '', service_charge: '' });
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState([]);
  const [newTableNumber, setNewTableNumber] = useState('');

  const fetchSettings = () => {
    fetch(`${API_URL}/api/settings`)
      .then(res => res.json())
      .then(data => setSettings({
        restaurant_name: data.restaurant_name || '',
        tax_rate: data.tax_rate || '',
        service_charge: data.service_charge || ''
      }))
      .catch(console.error);
  };

  const fetchTables = () => {
    fetch(`${API_URL}/api/tables`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
      .then(res => res.json())
      .then(data => setTables((data || []).sort((a, b) => a.number - b.number)))
      .catch(console.error);
  };

  useEffect(() => {
    fetchSettings();
    fetchTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan');
      alert('Pengaturan restoran berhasil diperbarui!');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTable = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ number: newTableNumber })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambah meja');
      setNewTableNumber('');
      fetchTables();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTable = async (id, num) => {
    if (!confirm(`Hapus Meja ${num}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/tables/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal menghapus meja');
      fetchTables();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div className="report-subcard">
        <h3>⚙️ Pengaturan Restoran & Pajak</h3>
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <div className="modal-form-group">
            <label>Nama Restoran</label>
            <input
              type="text"
              value={settings.restaurant_name}
              onChange={e => setSettings({ ...settings, restaurant_name: e.target.value })}
              className="modal-input"
            />
          </div>
          <div className="modal-form-group">
            <label>Pajak / PPN (%)</label>
            <input
              type="number"
              value={settings.tax_rate}
              onChange={e => setSettings({ ...settings, tax_rate: e.target.value })}
              className="modal-input"
            />
          </div>
          <div className="modal-form-group">
            <label>Service Charge (%)</label>
            <input
              type="number"
              value={settings.service_charge}
              onChange={e => setSettings({ ...settings, service_charge: e.target.value })}
              className="modal-input"
            />
          </div>
          <button type="submit" disabled={loading} className="table-btn-primary">
            {loading ? 'Menyimpan...' : '💾 Simpan Perubahan'}
          </button>
        </form>
      </div>

      <div className="report-subcard">
        <h3>🪑 Manajemen Nomor Meja</h3>
        <form onSubmit={handleAddTable} style={{ display: 'flex', gap: '10px', marginTop: '16px', marginBottom: '20px' }}>
          <input
            type="number"
            placeholder="Nomor Meja Baru"
            value={newTableNumber}
            onChange={e => setNewTableNumber(e.target.value)}
            required
            className="modal-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="table-btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
            + Tambah
          </button>
        </form>

        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          <table className="clean-table">
            <thead>
              <tr>
                <th>Meja</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tables.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: '700' }}>Meja {t.number}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleDeleteTable(t.id, t.number)} className="action-btn delete">
                      🗑️ Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN APP CONTROLLER & SHELL
   ========================================================= */
function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('adminTheme') === 'dark');
  const [activeTab, setActiveTab] = useState('dashboard');
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
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [adminRole] = useState(() => localStorage.getItem('ADMIN_ROLE') || 'admin');
  
  // Menu CRUD states
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [menuForm, setMenuForm] = useState({
    name: '',
    price: '',
    category: 'Appetizer',
    image: '🍱',
    description: '',
    available: 100
  });
  const [imageFile, setImageFile] = useState(null);
  const [customCategory, setCustomCategory] = useState('');
  const [adminBillData, setAdminBillData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Tunai');

  // Audio chime for waiter call
  const playChimeSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 400);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem('ADMIN_ROLE');
    setAdminToken(null);
    setSocket(null);
    setConnected(false);
    setTables([]);
    setMenu([]);
    setCategories([]);
    setOrders([]);
    setWaiterRequests([]);
    setAdminBillData(null);
  }, []);

  // Sync theme
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('adminTheme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('adminTheme', 'light');
    }
  }, [isDarkMode]);

  // Fetch initial REST data
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
          setMenu(data.menu || []);
          setCategories(data.categories || []);
        }
        if (tablesRes.ok) {
          const data = await tablesRes.json();
          setTables((data || []).sort((a, b) => a.number - b.number));
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [adminToken]);

  // Socket Connection
  useEffect(() => {
    if (!adminToken) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: adminToken }
    });
    // eslint-disable-next-line react/set-state-in-effect
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join-kitchen');
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('kitchen-orders', (orderList) => {
      setOrders(orderList || []);
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
      setMenu(data.menu || []);
      setCategories(data.categories || []);
    });

    newSocket.on('admin-bill-data', (data) => {
      setAdminBillData(data);
    });

    newSocket.on('payment-confirmed', () => {
      setAdminBillData(null);
    });

    newSocket.on('waiter-requests-updated', (requests) => {
      setWaiterRequests(requests || []);
    });

    newSocket.on('waiter-called', (request) => {
      setWaiterRequests(prev => [...prev.filter(r => r.tableId !== request.tableId), request]);
      playChimeSound();
    });

    newSocket.on('error', ({ message }) => {
      if (message && message.includes('Unauthorized')) {
        handleLogout();
      }
    });

    return () => newSocket.close();
  }, [adminToken, handleLogout]);

  const handleRequestAdminBill = (tableId) => {
    if (!socket || !adminToken) return;
    socket.emit('admin-request-bill', tableId);
  };

  const handleConfirmAdminPayment = (tableId) => {
    if (!socket || !adminToken) return;
    socket.emit('admin-confirm-payment', { tableId, method: paymentMethod });
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
      description: '',
      available: 100
    });
    setCustomCategory('');
    setImageFile(null);
    setShowMenuModal(true);
  };

  const openEditMenuModal = (item) => {
    setEditingMenu(item);
    setMenuForm({
      name: item.name,
      price: item.price,
      category: item.category,
      image: item.image || '🍱',
      description: item.description || '',
      available: item.available !== undefined ? item.available : 100
    });
    setCustomCategory('');
    setImageFile(null);
    setShowMenuModal(true);
  };

  const handleToggleAvailable = async (item) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_URL}/api/menu/${item.id}/toggle-available`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal mengedit status ketersediaan');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMenu = async (item) => {
    if (!adminToken) return;
    if (!window.confirm(`Yakin ingin menghapus hidangan "${item.name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/menu/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Gagal menghapus hidangan');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const targetCategory = menuForm.category === 'NEW' ? customCategory.trim() : menuForm.category;
    if (!menuForm.name.trim() || !menuForm.price || !targetCategory) {
      alert('Mohon lengkapi nama, harga, dan kategori hidangan!');
      return;
    }

    let finalImageUrl = menuForm.image.trim() || '🍱';
    if (imageFile) {
      const formData = new FormData();
      formData.append('image', imageFile);
      try {
        const uploadRes = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` },
          body: formData
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          throw new Error(errData.error || 'Gagal mengunggah foto');
        }
        const uploadData = await uploadRes.json();
        finalImageUrl = API_URL + uploadData.url;
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    const payload = {
      name: menuForm.name.trim(),
      price: Number(menuForm.price),
      category: targetCategory,
      image: finalImageUrl,
      description: menuForm.description.trim(),
      available: Number(menuForm.available)
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
        throw new Error(errData.error || 'Gagal menyimpan hidangan');
      }
      setShowMenuModal(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const getTableOrders = (tableId) => {
    return orders.filter(o => o.tableId === tableId && o.status !== 'completed');
  };

  if (!adminToken) {
    return <LoginPage onLogin={(data) => setAdminToken(data.token)} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)', color: 'var(--text-muted)' }}>
        Memuat kontrol panel Izakaya...
      </div>
    );
  }

  const activeOrdersCount = orders.filter(o => o.status !== 'completed').length;
  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="admin-layout">
      {/* --------------------------------------------------
          FIXED LEFT SIDEBAR NAVIGATION
          -------------------------------------------------- */}
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-emblem">居</div>
          <div className="brand-text">
            <span className="brand-title">IZAKAYA</span>
            <span className="brand-subtitle">Control Center</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Dashboard & Meja</span>
            {activeOrdersCount > 0 && <span className="nav-badge">{activeOrdersCount}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            <span className="nav-icon">🍱</span>
            <span className="nav-label">Manajemen Menu</span>
            <span className="nav-badge">{menu.length}</span>
          </button>

          {adminRole !== 'dapur' && (
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'pos' ? 'active' : ''}`}
              onClick={() => setActiveTab('pos')}
            >
              <span className="nav-icon">🛒</span>
              <span className="nav-label">Kasir (POS)</span>
            </button>
          )}

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="nav-icon">📜</span>
            <span className="nav-label">Riwayat Pesanan</span>
          </button>

          {adminRole !== 'dapur' && adminRole !== 'kasir' && (
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <span className="nav-icon">📈</span>
              <span className="nav-label">Laporan Penjualan</span>
            </button>
          )}

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'feedbacks' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedbacks')}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-label">Ulasan Pelanggan</span>
          </button>

          {adminRole === 'admin' && (
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'staff' ? 'active' : ''}`}
              onClick={() => setActiveTab('staff')}
            >
              <span className="nav-icon">👥</span>
              <span className="nav-label">Manajemen Staf</span>
            </button>
          )}

          {adminRole === 'admin' && (
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <span className="nav-icon">⚙️</span>
              <span className="nav-label">Pengaturan</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-status-card">
            <div className="user-info">
              <span className="user-role-tag">
                <span>👤</span>
                <span>{adminRole}</span>
              </span>
              <span className={`user-conn-status ${connected ? 'online' : 'offline'}`}>
                {connected ? '🟢 Real-time Sockets' : '🔴 Server Offline'}
              </span>
            </div>
          </div>

          <button type="button" className="sidebar-logout-btn" onClick={handleLogout}>
            <span>🚪</span>
            <span>Keluar (Logout)</span>
          </button>
        </div>
      </aside>

      {/* --------------------------------------------------
          MAIN WORKSPACE
          -------------------------------------------------- */}
      <div className="admin-main">
        {/* Top Header */}
        <header className="admin-topbar">
          <div className="topbar-title-group">
            <h1>
              {activeTab === 'dashboard' && 'Dashboard Operasional'}
              {activeTab === 'menu' && 'Katalog Menu & Ketersediaan'}
              {activeTab === 'pos' && 'Point of Sale (Kasir)'}
              {activeTab === 'history' && 'Riwayat Transaksi'}
              {activeTab === 'reports' && 'Laporan & Analitik Restoran'}
              {activeTab === 'feedbacks' && 'Ulasan & Kepuasan Pelanggan'}
              {activeTab === 'staff' && 'Manajemen Pengguna Staf'}
              {activeTab === 'settings' && 'Pengaturan & Konfigurasi Restoran'}
            </h1>
            <p>
              {activeTab === 'dashboard' && 'Pantau status meja makan, antrean dapur, dan panggilan tamu'}
              {activeTab === 'menu' && 'Kelola daftar makanan, minuman, dan status ketersediaan porsi'}
              {activeTab === 'pos' && 'Buat pesanan langsung meja & walk-in takeaway dengan cepat'}
              {activeTab === 'history' && 'Log seluruh pesanan dan pembayaran selesai'}
              {activeTab === 'reports' && 'Rekap pendapatan, metode bayar, dan menu terlaris'}
              {activeTab === 'feedbacks' && 'Evaluasi pengalaman makan tamu melalui ulasan bintang'}
              {activeTab === 'staff' && 'Kelola akun kasir, staf dapur, dan superadmin'}
              {activeTab === 'settings' && 'Atur nama restoran, persentase pajak, service charge, dan meja'}
            </p>
          </div>

          <div className="topbar-right">
            <div className="topbar-metrics">
              <div className="metric-pill">
                <span className="metric-pill-label">Meja:</span>
                <span className="metric-pill-value">{tables.length}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-pill-label">Aktif:</span>
                <span className="metric-pill-value">{activeOrdersCount}</span>
              </div>
              <div className="metric-pill revenue">
                <span className="metric-pill-label">Omzet:</span>
                <span className="metric-pill-value">Rp {totalRevenue.toLocaleString('id-ID')}</span>
              </div>
              {waiterRequests.length > 0 && (
                <div className="metric-pill alerts">
                  <span className="metric-pill-value">🛎️ {waiterRequests.length} Panggilan</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Ganti Mode Tema"
            >
              {isDarkMode ? '☀️ Terang' : '🌙 Gelap'}
            </button>
          </div>
        </header>

        {/* Content View */}
        <main className="admin-content">
          {/* Active Waiter Calls Banner */}
          {waiterRequests.length > 0 && (
            <div className="waiter-banner-container">
              {waiterRequests.map(req => (
                <div key={req.id} className="waiter-banner-card">
                  <div className="waiter-banner-left">
                    <span className="waiter-bell-icon">🛎️</span>
                    <div className="waiter-banner-info">
                      <h3>Panggilan Pelayan: Meja {req.tableNumber}</h3>
                      <p>
                        Keperluan: <strong>{req.requestType}</strong> &bull;{' '}
                        {new Date(req.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="waiter-resolve-btn"
                    onClick={() => handleResolveWaiterRequest(req.id)}
                  >
                    ✓ Tandai Selesai Dilayani
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* TAB 1: DASHBOARD & TABLES */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="section-header-row">
                <h2>🪑 Denah & Status Meja Restoran</h2>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {tables.length} Total Meja Terdaftar
                </span>
              </div>

              <div className="tables-grid">
                {tables.map(table => {
                  const tableOrders = getTableOrders(table.id);
                  const activeWaitReq = waiterRequests.find(r => r.tableId === table.id);
                  const pendingCount = tableOrders.filter(o => o.status === 'pending').length;
                  const preparingCount = tableOrders.filter(o => o.status === 'preparing').length;
                  const readyCount = tableOrders.filter(o => o.status === 'ready').length;

                  return (
                    <div key={table.id} className={`table-card ${activeWaitReq ? 'calling' : ''}`}>
                      <div className="table-card-top">
                        <div className="table-title-area">
                          <span className="table-number-label">Meja {table.number}</span>
                          <button
                            type="button"
                            className="table-qr-badge-btn"
                            onClick={() => showQR(table)}
                          >
                            📱 QR
                          </button>
                        </div>
                        <span className={`table-status-pill ${tableOrders.length > 0 ? 'occupied' : 'empty'}`}>
                          {tableOrders.length > 0 ? `● ${tableOrders.length} Pesanan` : '○ Kosong'}
                        </span>
                      </div>

                      {activeWaitReq && (
                        <div style={{
                          background: 'rgba(224, 49, 49, 0.12)',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.78rem',
                          color: 'var(--accent-crimson)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '10px'
                        }}>
                          <span>🔔 Memanggil: {activeWaitReq.requestType}</span>
                          <button
                            onClick={() => handleResolveWaiterRequest(activeWaitReq.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-crimson)', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ✓
                          </button>
                        </div>
                      )}

                      <div className="table-orders-summary">
                        {tableOrders.length === 0 ? (
                          <div className="table-empty-notice">Meja siap ditempati tamu</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              {pendingCount > 0 && <span className="order-chip-status pending">{pendingCount} Menunggu</span>}
                              {preparingCount > 0 && <span className="order-chip-status preparing">{preparingCount} Memasak</span>}
                              {readyCount > 0 && <span className="order-chip-status ready">{readyCount} Siap</span>}
                            </div>
                            {tableOrders.map(order => (
                              <div key={order.id} className="table-order-chip-row">
                                <span className="order-chip-id">#{order.id.slice(0, 6)}</span>
                                <span className={`order-chip-status ${order.status}`}>{order.status}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>

                      <div className="table-card-actions">
                        {tableOrders.length > 0 && (
                          <button
                            type="button"
                            className="table-btn-primary"
                            onClick={() => handleRequestAdminBill(table.id)}
                          >
                            💳 Pembayaran Kasir
                          </button>
                        )}
                        <div className="table-action-row">
                          {adminRole !== 'kasir' && tableOrders.length > 0 && (
                            <button
                              type="button"
                              className="table-btn-secondary"
                              onClick={() => {
                                const pendingItems = tableOrders.flatMap(o => {
                                  try {
                                    return typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
                                  } catch {
                                    return [];
                                  }
                                });
                                setAdminBillData({
                                  isKitchen: true,
                                  bill: { tableNumber: table.number, items: pendingItems, timestamp: Date.now() }
                                });
                                setTimeout(() => window.print(), 200);
                              }}
                            >
                              👨‍🍳 Tiket Dapur
                            </button>
                          )}
                          <a
                            href={`${window.location.origin}/customer.html?table=${table.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="table-btn-secondary"
                          >
                            🔗 Buka Tamu
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: MENU MANAGEMENT */}
          {activeTab === 'menu' && (
            <div>
              <div className="section-header-row">
                <div>
                  <h2>🍱 Manajemen Katalog Menu Restoran</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                    Total {menu.length} item hidangan dalam {categories.length} kategori
                  </p>
                </div>
                <button type="button" className="table-btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={openAddMenuModal}>
                  ➕ Tambah Hidangan Baru
                </button>
              </div>

              {categories.map(cat => (
                <div key={cat} className="menu-category-section">
                  <h3 className="menu-cat-title">{cat}</h3>
                  <div className="menu-items-admin-grid">
                    {menu.filter(m => m.category === cat).map(item => (
                      <div key={item.id} className={`menu-admin-card ${item.available === 0 ? 'out-of-stock' : ''}`}>
                        <div className="menu-admin-media">
                          {item.image && (item.image.startsWith('http') || item.image.startsWith('/uploads')) ? (
                            <img src={item.image} alt={item.name} />
                          ) : (
                            <span>{item.image || '🍱'}</span>
                          )}
                        </div>
                        <div className="menu-admin-details">
                          <div className="menu-admin-title">{item.name}</div>
                          <div className="menu-admin-desc">{item.description || 'Tidak ada deskripsi hidangan.'}</div>
                          <div className="menu-admin-price">Rp {item.price.toLocaleString('id-ID')}</div>
                          <div className="menu-admin-actions">
                            <button
                              type="button"
                              className={`action-btn toggle-stock ${item.available === 0 ? 'no-stock' : ''}`}
                              onClick={() => handleToggleAvailable(item)}
                            >
                              {item.available === 0 ? '🔴 Habis' : '🟢 Tersedia'}
                            </button>
                            <button
                              type="button"
                              className="action-btn edit"
                              onClick={() => openEditMenuModal(item)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="action-btn delete"
                              onClick={() => handleDeleteMenu(item)}
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: POS CASHIER */}
          {activeTab === 'pos' && (
            <POSTab adminToken={adminToken} menu={menu} categories={categories} tables={tables} />
          )}

          {/* TAB 4: ORDER HISTORY */}
          {activeTab === 'history' && <OrderHistoryTab adminToken={adminToken} />}

          {/* TAB 5: SALES REPORTS */}
          {activeTab === 'reports' && <SalesReportTab adminToken={adminToken} />}

          {/* TAB 6: FEEDBACKS */}
          {activeTab === 'feedbacks' && <FeedbacksTab adminToken={adminToken} />}

          {/* TAB 7: STAFF MANAGEMENT */}
          {activeTab === 'staff' && <StaffTab adminToken={adminToken} />}

          {/* TAB 8: SETTINGS */}
          {activeTab === 'settings' && <SettingsTab adminToken={adminToken} />}
        </main>
      </div>

      {/* --------------------------------------------------
          MODAL: ADD / EDIT MENU
          -------------------------------------------------- */}
      {showMenuModal && (
        <div className="modal-overlay" onClick={() => setShowMenuModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingMenu ? '✏️ Edit Hidangan Menu' : '➕ Tambah Menu Baru'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowMenuModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveMenu}>
              <div className="modal-form-group">
                <label>Nama Hidangan *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Tori Paitan Ramen"
                  className="modal-input"
                  value={menuForm.name}
                  onChange={e => setMenuForm({ ...menuForm, name: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label>Harga Satuan (Rp) *</label>
                <input
                  type="number"
                  required
                  min="500"
                  step="500"
                  placeholder="Misal: 45000"
                  className="modal-input"
                  value={menuForm.price}
                  onChange={e => setMenuForm({ ...menuForm, price: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label>Kategori Menu *</label>
                <select
                  className="modal-select"
                  value={menuForm.category}
                  onChange={e => setMenuForm({ ...menuForm, category: e.target.value })}
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="NEW">+ Tambah Kategori Baru...</option>
                </select>
              </div>

              {menuForm.category === 'NEW' && (
                <div className="modal-form-group">
                  <label>Nama Kategori Baru *</label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: Yakitori & Kushiyaki"
                    className="modal-input"
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                  />
                </div>
              )}

              <div className="modal-form-group">
                <label>Unggah Gambar Makanan (Opsional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="modal-input"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setImageFile(e.target.files[0]);
                    }
                  }}
                />
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                  Atau masukkan Emoji / Simbol representatif:
                </small>
                <input
                  type="text"
                  placeholder="Misal: 🍜, 🍣, 🍱, 🍵"
                  className="modal-input"
                  style={{ marginTop: '4px' }}
                  value={menuForm.image}
                  onChange={e => setMenuForm({ ...menuForm, image: e.target.value })}
                  disabled={!!imageFile}
                />
              </div>

              <div className="modal-form-group">
                <label>Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  placeholder="Penjelasan bahan, rasa, atau rempah..."
                  className="modal-textarea"
                  value={menuForm.description}
                  onChange={e => setMenuForm({ ...menuForm, description: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label>Stok Tersedia (Porsi)</label>
                <input
                  type="number"
                  min="0"
                  className="modal-input"
                  value={menuForm.available}
                  onChange={e => setMenuForm({ ...menuForm, available: e.target.value })}
                />
              </div>

              <div className="modal-actions-row">
                <button type="button" className="modal-cancel-btn" onClick={() => setShowMenuModal(false)}>
                  Batal
                </button>
                <button type="submit" className="modal-save-btn">
                  Simpan Hidangan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          MODAL: QR CODE MEJA
          -------------------------------------------------- */}
      {showQRModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="modal-card" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📱 QR Code Meja {selectedTable.number}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowQRModal(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 0' }}>
              {qrCodeData ? (
                <img
                  src={qrCodeData}
                  alt={`QR Code Meja ${selectedTable.number}`}
                  style={{ width: '220px', height: '220px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}
                />
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>QR Code sedang diproses...</p>
              )}
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '16px' }}>
                Pelanggan dapat memindai QR ini untuk langsung memesan dari meja.
              </p>
            </div>
            <div className="modal-actions-row" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="modal-save-btn"
                onClick={() => window.print()}
              >
                🖨️ Cetak QR Meja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          MODAL: ADMIN BILLING & PAYMENT CHECKOUT
          -------------------------------------------------- */}
      {adminBillData && !adminBillData.isKitchen && (
        <div className="modal-overlay no-print" onClick={() => setAdminBillData(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💳 Pembayaran Tagihan: Meja {adminBillData.bill?.tableNumber}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setAdminBillData(null)}>✕</button>
            </div>

            {(!adminBillData.bill?.items || adminBillData.bill.items.length === 0) ? (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Belum ada pesanan selesai yang dapat ditagih untuk meja ini.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
                  {adminBillData.bill.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '6px' }}>
                      <span>{item.name} &times; {item.quantity}</span>
                      <span style={{ fontWeight: '600' }}>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>Subtotal</span>
                    <span>Rp {adminBillData.bill.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  {adminBillData.bill.service_charge > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Service Charge ({adminBillData.bill.service_rate_str}%)</span>
                      <span>Rp {adminBillData.bill.service_charge.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>PPN ({adminBillData.bill.tax_rate_str}%)</span>
                    <span>Rp {adminBillData.bill.tax.toLocaleString('id-ID')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '4px' }}>
                    <span>Total Pembayaran</span>
                    <span style={{ color: 'var(--accent-gold)' }}>Rp {adminBillData.bill.total.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="modal-form-group">
                  <label>Metode Pembayaran</label>
                  <select
                    className="modal-select"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                  >
                    <option value="Tunai">💵 Tunai / Cash</option>
                    <option value="QRIS">📱 QRIS BCA / GPN</option>
                    <option value="Debit">💳 Kartu Debit BCA</option>
                    <option value="Kredit">💳 Kartu Kredit</option>
                  </select>
                </div>

                <div className="modal-actions-row">
                  <button type="button" className="modal-cancel-btn" onClick={handlePrintReceipt}>
                    🖨️ Cetak Struk
                  </button>
                  <button
                    type="button"
                    className="modal-save-btn"
                    onClick={() => handleConfirmAdminPayment(adminBillData.tableId)}
                  >
                    ✅ Konfirmasi Lunas
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------
          PRINT THERMAL RECEIPT LAYOUT
          -------------------------------------------------- */}
      {adminBillData && (
        <div className="print-receipt-layout print-only">
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '16px', margin: '0' }}>🏮 IZAKAYA RESTAURANT</h2>
            <p style={{ margin: '2px 0' }}>Meja {adminBillData.bill?.tableNumber}</p>
            <p style={{ margin: '2px 0', fontSize: '10px' }}>{new Date().toLocaleString('id-ID')}</p>
          </div>
          <div>--------------------------------</div>
          {adminBillData.isKitchen ? (
            <div>
              <h3 style={{ textAlign: 'center', margin: '6px 0', fontSize: '14px' }}>PESANAN DAPUR / KITCHEN</h3>
              {adminBillData.bill?.items?.map((item, i) => (
                <div key={i} style={{ fontSize: '14px', fontWeight: 'bold', margin: '4px 0' }}>
                  [ {item.quantity}x ] {item.name}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                {adminBillData.bill?.items?.map((item, i) => (
                  <div key={i} style={{ margin: '4px 0' }}>
                    <div>{item.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span>{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</span>
                      <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>--------------------------------</div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>Rp {adminBillData.bill?.subtotal?.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>PPN {adminBillData.bill?.tax_rate_str}%</span>
                  <span>Rp {adminBillData.bill?.tax?.toLocaleString('id-ID')}</span>
                </div>
                {adminBillData.bill?.service_charge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>SC {adminBillData.bill?.service_rate_str}%</span>
                    <span>Rp {adminBillData.bill?.service_charge?.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '4px' }}>
                  <span>TOTAL</span>
                  <span>Rp {adminBillData.bill?.total?.toLocaleString('id-ID')}</span>
                </div>
              </div>
              <div>================================</div>
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '10px' }}>
                <p>Arigatou Gozaimasu!</p>
                <p>Terima kasih atas kunjungan Anda</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;