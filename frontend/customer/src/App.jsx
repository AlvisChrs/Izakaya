import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import './App.css'
import './theme.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

function App() {
  const [tableId] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('table') || 'table-1'
  })
  const [tableAccessToken] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('access')
  })
  const [table, setTable] = useState(null)
  const [menu, setMenu] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('Appetizer')
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
  const [notes, setNotes] = useState('')
  const [showBill, setShowBill] = useState(false)
  const [bill, setBill] = useState(null)
  const [showWaiterModal, setShowWaiterModal] = useState(false)
  const [activeWaiterRequest, setActiveWaiterRequest] = useState(null)
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashRequested, setCashRequested] = useState(false)
  const [isLightMode, setIsLightMode] = useState(() => localStorage.getItem('customerTheme') === 'light')

  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackComment, setFeedbackComment] = useState('')

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-theme');
      localStorage.setItem('customerTheme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      localStorage.setItem('customerTheme', 'dark');
    }
  }, [isLightMode]);

  // Initialize socket
  useEffect(() => {
    if (!tableId) return

    const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = newSocket

    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('join-table', { tableId, token: tableAccessToken })
    })

    newSocket.on('disconnect', () => setConnected(false))

    newSocket.on('table-state', (data) => {
      setTable(data.table)
      setMenu(data.menu)
      setCategories(data.categories)
      if (data.activeWaiterRequest) setActiveWaiterRequest(data.activeWaiterRequest)
      if (data.categories.length > 0) setActiveCategory(data.categories[0])
    })

    newSocket.on('order-placed', (order) => {
      setOrders(prev => [...prev, order])
      setCart([])
      setNotes('')
    })

    newSocket.on('order-status-updated', ({ orderId, status }) => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    })

    newSocket.on('bill-generated', (billData) => {
      setBill(billData)
      setShowBill(true)
    })

    newSocket.on('payment-confirmed', () => {
      setShowBill(false)
      setBill(null)
      setPaymentMethod(null)
      setCashRequested(false)
      setOrders(prev => prev.map(o => ({ ...o, status: 'completed' })))
      setShowFeedbackModal(true)
    })

    newSocket.on('cash-payment-requested', () => {
      setCashRequested(true)
    })

    newSocket.on('menu-updated', (data) => {
      setMenu(data.menu)
      setCategories(data.categories)
      setCart(prev => prev.filter(cItem => {
        const menuItem = data.menu.find(m => m.id === cItem.menuId)
        return menuItem && menuItem.available !== 0
      }))
    })

    newSocket.on('waiter-request-active', (request) => {
      setActiveWaiterRequest(request)
      setShowWaiterModal(false)
    })

    newSocket.on('waiter-request-resolved', () => {
      setActiveWaiterRequest(null)
    })

    newSocket.on('error', ({ message }) => alert(message))

    return () => newSocket.close()
  }, [tableId, tableAccessToken])

  const handleCallWaiter = (requestType) => {
    if (!socketRef.current || !tableId) return
    socketRef.current.emit('call-waiter', { tableId, requestType })
  }

  const handleCancelWaiterCall = () => {
    if (!socketRef.current || !tableId) return
    socketRef.current.emit('cancel-waiter-request', tableId)
  }

  const addToCart = (item) => {
    if (item.available === 0) return
    setCart(prev => {
      const existing = prev.find(i => i.menuId === item.id)
      if (existing) {
        return prev.map(i => i.menuId === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { menuId: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }]
    })
  }

  const updateQuantity = (menuId, delta) => {
    setCart(prev => {
      const item = prev.find(i => i.menuId === menuId)
      if (!item) return prev
      const newQty = item.quantity + delta
      if (newQty <= 0) return prev.filter(i => i.menuId !== menuId)
      return prev.map(i => i.menuId === menuId ? { ...i, quantity: newQty } : i)
    })
  }

  const placeOrder = () => {
    if (cart.length === 0 || !socketRef.current) return
    socketRef.current.emit('place-order', { tableId, items: cart, notes })
  }

  const requestBill = () => {
    if (!socketRef.current) return
    socketRef.current.emit('request-bill', tableId)
  }

  const payBill = (method) => {
    if (!socketRef.current) return
    socketRef.current.emit('pay-bill', { tableId, paymentMethod: method })
    if (method === 'cash') {
      setPaymentMethod('cash')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#f59e0b'
      case 'preparing': return '#3b82f6'
      case 'ready': return '#10b981'
      case 'completed': return '#6b7280'
      default: return '#6b7280'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Menunggu'
      case 'preparing': return 'Sedang Dibuat'
      case 'ready': return 'Siap Diantar'
      case 'completed': return 'Selesai'
      default: return status
    }
  }

  const filteredMenu = menu.filter(item => item.category === activeCategory)
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  if (!tableId) return <div className="loading">Memuat...</div>

  return (
    <div className="mobile-app-wrapper">
      <div className="mobile-container">
        {/* Header */}
        <header className="customer-header">
          <h1>🏮 Izakaya</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              className="theme-toggle-btn" 
              onClick={() => setIsLightMode(!isLightMode)}
              style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              {isLightMode ? '🌙' : '☀️'}
            </button>
            <span className="table-badge">Meja {table?.number || tableId.replace('table-', '')}</span>
          </div>
        </header>

        {/* Active Waiter Call Banner */}
        {activeWaiterRequest && (
          <div className="waiter-active-banner" style={{ background: 'var(--accent-secondary)', color: '#000', padding: '10px 24px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span>🔔 Pelayan menuju meja Anda</span>
            </div>
            <button onClick={handleCancelWaiterCall} style={{ background: 'rgba(0,0,0,0.1)', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
              Batal
            </button>
          </div>
        )}

        {/* Categories Bar */}
        <nav className="categories-scroll">
          {categories.map(cat => (
            <button
              key={cat}
              className={`cat-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>

        {/* Menu Container */}
        <main className="menu-container">
          {filteredMenu.map(item => (
            <div key={item.id} className="menu-card">
              <div className="menu-img">
                {item.image && (item.image.startsWith('http') || item.image.startsWith('/uploads')) ? (
                  <img src={item.image} alt={item.name} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit'}} />
                ) : (
                  item.image
                )}
              </div>
              <div className="menu-details">
                <div>
                  <h4>
                    {item.name}
                    {item.available === 0 && <span style={{fontSize: '0.7rem', background: 'var(--accent-primary)', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle'}}>HABIS</span>}
                  </h4>
                  <p className="menu-desc">{item.description}</p>
                </div>
                <div className="menu-bottom">
                  <span className="menu-price">Rp {item.price.toLocaleString('id-ID')}</span>
                  <button
                    className={`add-btn ${item.available === 0 ? 'disabled' : ''}`}
                    onClick={() => addToCart(item)}
                    disabled={item.available === 0}
                  >
                    {item.available === 0 ? '✕' : '+'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </main>

        {/* Call Waiter Floating Button */}
        <button 
          className="floating-waiter-btn" 
          onClick={() => setShowWaiterModal(true)}
          title="Panggil Pelayan"
        >
          🛎️
        </button>

        {/* Floating Cart Wrapper */}
        {cart.length > 0 && !isCartOpen && (
          <div className="floating-cart-wrapper">
            <div className="floating-cart-bar" onClick={() => setIsCartOpen(true)}>
              <div className="cart-qty">
                🛒 {cart.reduce((sum, item) => sum + item.quantity, 0)} Item
              </div>
              <div className="cart-checkout-text">
                Rp {cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString("id-ID")}
                <span>→</span>
              </div>
            </div>
          </div>
        )}

        {/* Cart Modal (Slide Up) */}
        {isCartOpen && (
          <div className="modal-overlay" onClick={() => setIsCartOpen(false)} style={{ zIndex: 200, alignItems: 'flex-end', padding: 0 }}>
            <div className="modal cart-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', borderRadius: '32px 32px 0 0', maxHeight: '80vh', overflowY: 'auto', padding: '32px 24px', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>Keranjang</h2>
                <button onClick={() => setIsCartOpen(false)} style={{ background: 'var(--bg-input)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {cart.map(item => (
                  <div key={item.menuId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0' }}>{item.name}</h4>
                      <div style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>Rp {item.price.toLocaleString('id-ID')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-input)', padding: '4px', borderRadius: '30px' }}>
                      <button onClick={() => updateQuantity(item.menuId, -1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--bg-card)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>-</button>
                      <span style={{ fontWeight: '600', width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.menuId, 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--bg-card)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              <textarea
                placeholder="Catatan untuk dapur (opsional)..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                style={{ width: '100%', marginBottom: '24px', resize: 'none' }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                <span>Total:</span>
                <span style={{ color: 'var(--accent-primary)' }}>Rp {cartTotal.toLocaleString('id-ID')}</span>
              </div>

              <button 
                onClick={() => { placeOrder(); setIsCartOpen(false); }} 
                style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-hover))', color: '#fff', border: 'none', padding: '16px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 'bold', boxShadow: 'var(--shadow-glow)', cursor: 'pointer' }}
              >
                Pesan Sekarang
              </button>
            </div>
          </div>
        )}

        {/* Orders Section */}
        {orders.length > 0 && (
          <div style={{ padding: "0 24px 120px 24px" }}>
            <h2 style={{ marginBottom: "16px" }}>Pesanan Anda</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {orders.map(order => (
                <div key={order.id} className="menu-card" style={{ flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
                    <span style={{ fontWeight: "bold" }}>Order #{order.id.slice(0, 8)}</span>
                    <span style={{ background: getStatusColor(order.status), color: "#fff", padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold" }}>{getStatusLabel(order.status)}</span>
                  </div>
                  <div>
                    {order.items.map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
                        <span>{item.name} x{item.quantity}</span>
                        <span>Rp {(item.price * item.quantity).toLocaleString("id-ID")}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", paddingTop: "8px", borderTop: "1px dashed var(--border)" }}>
                    <span>Total</span>
                    <span style={{ color: "var(--accent-primary)" }}>Rp {order.total.toLocaleString("id-ID")}</span>
                  </div>
                </div>
              ))}
            </div>
            {orders.some(o => o.status !== "completed") && (
              <button onClick={requestBill} style={{ width: "100%", marginTop: "24px", background: "var(--bg-input)", color: "var(--text-main)", border: "1px solid var(--border)", padding: "16px", borderRadius: "16px", fontWeight: "bold", cursor: 'pointer' }}>Minta Bill (Bayar)</button>
            )}
          </div>
        )}

        {/* Bill Modal */}
        {showBill && bill && (
          <div className="modal-overlay" onClick={() => { setShowBill(false); setPaymentMethod(null); setCashRequested(false); }} style={{ zIndex: 200 }}>
            <div className="modal bill-modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0 }}>🧾 Bill - Meja {bill.tableNumber}</h2>
                <button onClick={() => { setShowBill(false); setPaymentMethod(null); setCashRequested(false); }} style={{ background: 'var(--bg-input)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                {bill.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.name} x{item.quantity}</span>
                    <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Subtotal</span><span>Rp {bill.subtotal.toLocaleString('id-ID')}</span></div>
                {bill.service_charge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Service {bill.service_rate_str}%</span><span>Rp {bill.service_charge.toLocaleString("id-ID")}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>PPN {bill.tax_rate_str}%</span><span>Rp {bill.tax.toLocaleString("id-ID")}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '8px' }}><span>Total</span><span style={{ color: 'var(--accent-primary)' }}>Rp {bill.total.toLocaleString('id-ID')}</span></div>
              </div>
              
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '16px' }}>
                {!paymentMethod ? (
                  <div>
                    <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Pilih Metode Pembayaran</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <button onClick={() => setPaymentMethod('qris')} style={{ background: '#0056b3', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>📱 Bayar pakai QRIS</button>
                      <button onClick={() => payBill('cash')} style={{ background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>💵 Bayar Tunai (Panggil Kasir)</button>
                    </div>
                  </div>
                ) : paymentMethod === 'qris' ? (
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '16px' }}>Scan QRIS berikut</h3>
                    <div style={{ width: '200px', height: '200px', background: '#fff', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', border: '2px solid #ccc' }}>
                      <strong style={{ color: '#333' }}>[ QRIS CODE ]</strong>
                    </div>
                    <p style={{ marginBottom: '16px' }}>Total: <strong>Rp {bill.total.toLocaleString('id-ID')}</strong></p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => payBill('qris')} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Simulasikan Pembayaran Berhasil</button>
                      <button onClick={() => setPaymentMethod(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '8px', cursor: 'pointer' }}>Batal / Kembali</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '16px' }}>Bayar Tunai</h3>
                    <div style={{ fontSize: '3rem', margin: '20px 0' }}>💵</div>
                    {cashRequested ? (
                      <p><strong>Kasir sedang menuju ke meja Anda.</strong><br/>Silakan siapkan uang tunai sebesar <strong>Rp {bill.total.toLocaleString('id-ID')}</strong>.</p>
                    ) : (
                      <p>Memanggil kasir...</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Waiter Modal */}
        {showWaiterModal && (
          <div className="modal-overlay" onClick={() => setShowWaiterModal(false)} style={{ zIndex: 200 }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: '16px' }}>Panggil Pelayan</h2>
              <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>Ada yang bisa kami bantu?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => handleCallWaiter('Minta Menu')} style={{ background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>📖 Minta Menu / Rekomendasi</button>
                <button onClick={() => handleCallWaiter('Bersihkan Meja')} style={{ background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>🧹 Bersihkan Meja</button>
                <button onClick={() => handleCallWaiter('Lainnya')} style={{ background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>💬 Bantuan Lainnya</button>
              </div>
              <button onClick={() => setShowWaiterModal(false)} style={{ width: '100%', marginTop: '24px', background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Batal</button>
            </div>
          </div>
        )}

        {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="bill-modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="bill-modal" onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
            <h2>Terima Kasih! 🎉</h2>
            <p style={{ margin: "10px 0 20px" }}>Pesanan Anda telah selesai. Bagaimana pengalaman Anda?</p>
            <div style={{ fontSize: "2rem", marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", cursor: "pointer" }}>
              {[1, 2, 3, 4, 5].map(star => (
                <span key={star} onClick={() => setFeedbackRating(star)} style={{ color: star <= feedbackRating ? "#fbbf24" : "#e5e7eb" }}>★</span>
              ))}
            </div>
            <textarea
              rows="3"
              placeholder="Berikan saran atau kritik Anda (opsional)..."
              value={feedbackComment}
              onChange={e => setFeedbackComment(e.target.value)}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc", marginBottom: "20px" }}
            />
            <button
              className="bill-btn"
              style={{ width: "100%" }}
              onClick={async () => {
                try {
                  await fetch(`${API_URL}/api/feedbacks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tableId, rating: feedbackRating, comment: feedbackComment })
                  });
                  setShowFeedbackModal(false);
                } catch {
                  setShowFeedbackModal(false);
                }
              }}
            >
              Kirim Ulasan
            </button>
          </div>
        </div>
      )}


      {/* Call Waiter Modal */}
      {showWaiterModal && (
        <div className="waiter-modal-overlay" onClick={() => setShowWaiterModal(false)}>
          <div className="waiter-modal" onClick={e => e.stopPropagation()}>
            <div className="waiter-modal-header">
              <h2>🛎️ Panggil Pelayan</h2>
              <button className="close-btn" onClick={() => setShowWaiterModal(false)}>✕</button>
            </div>
            <p className="waiter-modal-subtitle">Pilih bantuan yang Anda butuhkan di Meja {table?.number || tableId}:</p>
            
            <div className="waiter-options-grid">
              <button className="waiter-option-btn" onClick={() => handleCallWaiter('Refill Air / Oolong Tea')}>
                <span className="option-icon">🍵</span>
                <span className="option-title">Refill Minuman</span>
                <span className="option-sub">Air putih / Teh Oolong</span>
              </button>

              <button className="waiter-option-btn" onClick={() => handleCallWaiter('Minta Sendok / Garpu / Sumpit / Tisu')}>
                <span className="option-icon">🥢</span>
                <span className="option-title">Alat Makan & Tisu</span>
                <span className="option-sub">Sumpit, sendok, mangkuk, tisu</span>
              </button>

              <button className="waiter-option-btn" onClick={() => handleCallWaiter('Panggil Kasir / Minta Bill')}>
                <span className="option-icon">🧾</span>
                <span className="option-title">Pembayaran / Bill</span>
                <span className="option-sub">Panggil kasir ke meja</span>
              </button>

              <button className="waiter-option-btn" onClick={() => handleCallWaiter('Bantuan Pelayan / Umum')}>
                <span className="option-icon">🙋</span>
                <span className="option-title">Bantuan Lainnya</span>
                <span className="option-sub">Panggil pelayan ke meja</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default App