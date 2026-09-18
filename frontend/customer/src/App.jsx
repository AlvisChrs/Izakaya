import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

function App() {
  const [tableId, setTableId] = useState(null)
  const [tableAccessToken, setTableAccessToken] = useState(null)
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
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashRequested, setCashRequested] = useState(false)

  // Get tableId from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tId = params.get('table') || 'table-1'
    const accessToken = params.get('access')
    setTableId(tId)
    setTableAccessToken(accessToken)
  }, [])

  // Initialize socket
  useEffect(() => {
    if (!tableId) return

    const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    setSocket(newSocket)

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
    if (!socket || !tableId) return
    socket.emit('call-waiter', { tableId, requestType })
  }

  const handleCancelWaiterCall = () => {
    if (!socket || !tableId) return
    socket.emit('cancel-waiter-request', tableId)
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
    if (cart.length === 0 || !socket) return
    socket.emit('place-order', { tableId, items: cart, notes })
  }

  const requestBill = () => {
    if (!socket) return
    socket.emit('request-bill', tableId)
  }

  const payBill = (method) => {
    if (!socket) return
    socket.emit('pay-bill', { tableId, paymentMethod: method })
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
    <div className="app">
      <header className="header">
        <h1>🏮 Izakaya</h1>
        <div className="header-actions">
          <button className="call-waiter-header-btn" onClick={() => setShowWaiterModal(true)}>
            🛎️ <span>Panggil Pelayan</span>
          </button>
          <div className="table-info">
            <span>Meja {table?.number || tableId}</span>
            <span className={connected ? 'connected' : 'disconnected'}>
              {connected ? '🟢 Terhubung' : '🔴 Terputus'}
            </span>
          </div>
        </div>
      </header>

      {/* Active Waiter Call Banner */}
      {activeWaiterRequest && (
        <div className="waiter-active-banner">
          <div className="waiter-banner-content">
            <span className="waiter-pulse">🔔</span>
            <span>Pelayan sedang menuju meja Anda (Minta: <strong>{activeWaiterRequest.requestType}</strong>)</span>
          </div>
          <button className="cancel-waiter-btn" onClick={handleCancelWaiterCall}>
            Batal
          </button>
        </div>
      )}

      <main className="main">
        {/* Menu Sidebar */}
        <aside className="menu-sidebar">
          <nav className="categories">
            {categories.map(cat => (
              <button
                key={cat}
                className={activeCategory === cat ? 'active' : ''}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </nav>

          <div className="menu-items">
            {filteredMenu.map(item => (
              <div key={item.id} className={`menu-item ${item.available === 0 ? 'out-of-stock' : ''}`}>
                <div className="item-info">
                  <span className="item-emoji">{item.image}</span>
                  <div>
                    <h4>
                      {item.name}
                      {item.available === 0 && <span className="sold-out-tag">HABIS</span>}
                    </h4>
                    <p className="item-desc">{item.description}</p>
                    <p className="item-price">Rp {item.price.toLocaleString('id-ID')}</p>
                  </div>
                </div>
                <button
                  className="add-btn"
                  onClick={() => addToCart(item)}
                  disabled={item.available === 0}
                  title={item.available === 0 ? 'Stok Habis' : 'Tambah ke Keranjang'}
                >
                  {item.available === 0 ? '✕' : '+'}
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Cart & Orders */}
        <div className="content">
          {/* Cart */}
          <section className="cart-section">
            <h2>Keranjang {cart.length > 0 && `(${cart.reduce((s, i) => s + i.quantity, 0)})`}</h2>
            {cart.length === 0 ? (
              <p className="empty-cart">Keranjang kosong</p>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map(item => (
                    <div key={item.menuId} className="cart-item">
                      <div className="cart-item-info">
                        <h4>{item.name}</h4>
                        <p>Rp {item.price.toLocaleString('id-ID')} x {item.quantity}</p>
                      </div>
                      <div className="qty-controls">
                        <button onClick={() => updateQuantity(item.menuId, -1)}>-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.menuId, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-notes">
                  <textarea
                    placeholder="Catatan untuk dapur (opsional)..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="cart-total">
                  <span>Total: Rp {cartTotal.toLocaleString('id-ID')}</span>
                  <button className="order-btn" onClick={placeOrder} disabled={cart.length === 0}>
                    Pesan
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Orders */}
          <section className="orders-section">
            <h2>Pesanan Saya</h2>
            {orders.length === 0 ? (
              <p className="empty-orders">Belum ada pesanan</p>
            ) : (
              <div className="orders-list">
                {orders.map(order => (
                  <div key={order.id} className="order-card">
                    <div className="order-header">
                      <span>Order #{order.id.slice(0, 8)}</span>
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(order.status) }}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <div className="order-items">
                      {order.items.map((item, i) => (
                        <div key={i} className="order-item">
                          <span>{item.name} x{item.quantity}</span>
                          <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                    </div>
                    <div className="order-total">
                      Total: Rp {order.total.toLocaleString('id-ID')}
                    </div>
                    {order.notes && <p className="order-notes">Catatan: {order.notes}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Bill Modal */}
            {showBill && bill && (
              <div className="bill-modal-overlay" onClick={() => {
                setShowBill(false);
                setPaymentMethod(null);
                setCashRequested(false);
              }}>
                <div className="bill-modal" onClick={e => e.stopPropagation()}>
                  <div className="bill-modal-header">
                    <h2>🧾 Bill - Meja {bill.tableNumber}</h2>
                    <button className="close-btn" onClick={() => {
                      setShowBill(false);
                      setPaymentMethod(null);
                      setCashRequested(false);
                    }}>✕</button>
                  </div>
                  
                  <div className="bill-items">
                    {bill.items.map((item, i) => (
                      <div key={i} className="bill-item">
                        <span>{item.name} x{item.quantity}</span>
                        <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bill-summary">
                    <div><span>Subtotal</span><span>Rp {bill.subtotal.toLocaleString('id-ID')}</span></div>
                    <div><span>PPN 11%</span><span>Rp {bill.tax.toLocaleString('id-ID')}</span></div>
                    <div className="bill-total"><span>Total</span><span>Rp {bill.total.toLocaleString('id-ID')}</span></div>
                  </div>
                  
                  <div className="payment-section">
                    {!paymentMethod ? (
                      <div className="payment-methods">
                        <h3>Pilih Metode Pembayaran</h3>
                        <div className="payment-options-grid">
                          <button className="qris-btn" onClick={() => setPaymentMethod('qris')}>
                            📱 Bayar pakai QRIS
                          </button>
                          <button className="cash-btn" onClick={() => payBill('cash')}>
                            💵 Bayar Tunai (Panggil Kasir)
                          </button>
                        </div>
                      </div>
                    ) : paymentMethod === 'qris' ? (
                      <div className="qris-simulation">
                        <h3>Scan QRIS berikut</h3>
                        <div className="qris-placeholder">
                          {/* Fake QRIS representation */}
                          <div className="qris-box">
                            <span className="qris-logo">QRIS</span>
                            <div className="qr-fake-pattern"></div>
                          </div>
                        </div>
                        <p>Total: <strong>Rp {bill.total.toLocaleString('id-ID')}</strong></p>
                        <button className="simulasi-btn" onClick={() => payBill('qris')}>
                          Simulasikan Pembayaran Berhasil
                        </button>
                        <button className="kembali-btn" onClick={() => setPaymentMethod(null)}>Batal / Kembali</button>
                      </div>
                    ) : (
                      <div className="cash-simulation">
                        <h3>Bayar Tunai</h3>
                        <div className="waiter-pulse" style={{ fontSize: '3rem', textAlign: 'center', margin: '20px 0' }}>💵</div>
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

            {!showBill && orders.some(o => o.status !== 'completed') && (
              <button className="bill-btn" onClick={requestBill}>Minta Bill</button>
            )}
          </section>
        </div>
      </main>

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
  )
}

export default App