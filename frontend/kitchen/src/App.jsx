import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const KITCHEN_TOKEN_KEY = 'izakaya_kitchen_token'

function LoginPage({ onLogin }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Test the token by connecting to socket
      const { io } = await import('socket.io-client')
      const testSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: { token: token.trim() }
      })

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)
        testSocket.on('connect', () => {
          clearTimeout(timeout)
          // Try to join kitchen to validate token
          testSocket.emit('join-kitchen', token.trim())
        })
        testSocket.on('error', ({ message }) => {
          clearTimeout(timeout)
          testSocket.close()
          if (message.includes('Unauthorized')) {
            reject(new Error('Token kitchen tidak valid'))
          } else {
            reject(new Error(message))
          }
        })
        testSocket.on('kitchen-orders', () => {
          clearTimeout(timeout)
          testSocket.close()
          resolve()
        })
      })

      localStorage.setItem(KITCHEN_TOKEN_KEY, token.trim())
      onLogin(token.trim())
    } catch (err) {
      setError(err.message || 'Gagal menghubungi server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🍳 Dapur Izakaya</h1>
          <p>Masukkan token kitchen untuk mengakses panel</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <div className="form-group">
            <label htmlFor="token">Kitchen Token</label>
            <input
              id="token"
              type="password"
              placeholder="Masukkan kitchen token"
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
          <small>Token default development: <code>kitchen-dev-token-change-in-production</code></small>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [orders, setOrders] = useState([])
  const [waiterRequests, setWaiterRequests] = useState([])
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [kitchenToken, setKitchenToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem(KITCHEN_TOKEN_KEY)
    if (stored) {
      setKitchenToken(stored)
    }
  }, [])

  // Initialize socket for real-time updates (requires kitchen token)
  useEffect(() => {
    if (!kitchenToken) return

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: kitchenToken }
    })
    setSocket(newSocket)

    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('join-kitchen', kitchenToken)
    })

    newSocket.on('disconnect', () => setConnected(false))

    newSocket.on('kitchen-orders', (orderList) => {
      setOrders(orderList)
      if (orderList.length > 0 && soundEnabled) playNotification()
    })

    newSocket.on('new-order', (order) => {
      setOrders(prev => [...prev, order].sort((a, b) => a.timestamp - b.timestamp))
      if (soundEnabled) playNotification()
    })

    newSocket.on('order-status-updated', ({ orderId, status }) => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    })

    newSocket.on('orders-completed', ({ tableId }) => {
      setOrders(prev => prev.filter(o => o.tableId !== tableId || o.status !== 'completed'))
    })

    newSocket.on('waiter-requests-updated', (requests) => {
      setWaiterRequests(requests)
    })

    newSocket.on('waiter-called', (request) => {
      setWaiterRequests(prev => [...prev.filter(r => r.tableId !== request.tableId), request])
      if (soundEnabled) playNotification()
    })

    newSocket.on('error', ({ message }) => {
      if (message.includes('Unauthorized')) {
        handleLogout()
      }
    })

    return () => newSocket.close()
  }, [kitchenToken, soundEnabled])

  const handleLogout = () => {
    localStorage.removeItem(KITCHEN_TOKEN_KEY)
    setKitchenToken(null)
    setSocket(null)
    setConnected(false)
    setOrders([])
    setWaiterRequests([])
  }

  const handleResolveWaiterRequest = (requestId) => {
    if (!socket || !kitchenToken) return
    socket.emit('resolve-waiter-request', { requestId, token: kitchenToken })
  }

  const playNotification = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 800
      gain.gain.value = 0.1
      osc.start()
      setTimeout(() => { osc.stop(); ctx.close() }, 200)
    } catch (e) {
      // Ignore audio errors
    }
  }

  const updateStatus = (orderId, newStatus) => {
    if (!socket || !kitchenToken) return
    socket.emit('update-order-status', { orderId, status: newStatus, token: kitchenToken })
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
      case 'pending': return 'MENUNGGU'
      case 'preparing': return 'MEMASAK'
      case 'ready': return 'SIAP'
      case 'completed': return 'SELESAI'
      default: return status.toUpperCase()
    }
  }

  const getNextStatus = (status) => {
    switch (status) {
      case 'pending': return 'preparing'
      case 'preparing': return 'ready'
      case 'ready': return 'completed'
      default: return null
    }
  }

  const filteredOrders = orders.filter(o =>
    filterStatus === 'all' || o.status === filterStatus
  ).sort((a, b) => {
    const statusPriority = { pending: 0, preparing: 1, ready: 2, completed: 3 }
    const aPri = statusPriority[a.status] ?? 99
    const bPri = statusPriority[b.status] ?? 99
    if (aPri !== bPri) return aPri - bPri
    return a.timestamp - b.timestamp
  })

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})

  if (!kitchenToken) {
    return <LoginPage onLogin={setKitchenToken} />
  }

  if (loading) {
    return <div className="loading">Memuat data...</div>
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>🍳 Dapur Izakaya</h1>
          <span className={connected ? 'connected' : 'disconnected'}>
            {connected ? '🟢 Online' : '🔴 Offline'}
          </span>
        </div>
        <div className="header-right">
          <label className="sound-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={e => setSoundEnabled(e.target.checked)}
            />
            <span>🔊 Notifikasi</span>
          </label>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Active Waiter Calls Banner in Kitchen */}
      {waiterRequests.length > 0 && (
        <div className="kitchen-waiter-banner">
          <div className="kitchen-waiter-title">
            <span>🔔 Panggilan Pelayan ({waiterRequests.length})</span>
          </div>
          <div className="kitchen-waiter-list">
            {waiterRequests.map(req => (
              <div key={req.id} className="kitchen-waiter-item">
                <span className="kw-badge">Meja {req.tableNumber}</span>
                <span className="kw-desc">{req.requestType}</span>
                <button onClick={() => handleResolveWaiterRequest(req.id)}>✅ Selesai</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-bar">
        <div className="stat all">Total: {orders.length}</div>
        <div className="stat pending">Menunggu: {statusCounts.pending || 0}</div>
        <div className="stat preparing">Memasak: {statusCounts.preparing || 0}</div>
        <div className="stat ready">Siap: {statusCounts.ready || 0}</div>
      </div>

      <nav className="filter-tabs">
        <button className={filterStatus === 'all' ? 'active' : ''} onClick={() => setFilterStatus('all')}>
          Semua
        </button>
        <button className={filterStatus === 'pending' ? 'active' : ''} onClick={() => setFilterStatus('pending')}>
          Menunggu
        </button>
        <button className={filterStatus === 'preparing' ? 'active' : ''} onClick={() => setFilterStatus('preparing')}>
          Memasak
        </button>
        <button className={filterStatus === 'ready' ? 'active' : ''} onClick={() => setFilterStatus('ready')}>
          Siap
        </button>
      </nav>

      <main className="orders-grid">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🍽️</div>
            <p>Tidak ada pesanan {filterStatus !== 'all' ? `(${getStatusLabel(filterStatus).toLowerCase()})` : ''}</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={updateStatus}
              getNextStatus={getNextStatus}
              getStatusColor={getStatusColor}
              getStatusLabel={getStatusLabel}
            />
          ))
        )}
      </main>
    </div>
  )
}

function OrderCard({ order, onUpdateStatus, getNextStatus, getStatusColor, getStatusLabel }) {
  const nextStatus = getNextStatus(order.status)
  const canProgress = nextStatus !== null

  return (
    <div className="order-card" style={{ borderLeftColor: getStatusColor(order.status) }}>
      <div className="order-header">
        <div>
          <span className="order-id">Order #{order.id.slice(0, 8)}</span>
          <span className="table-badge">Meja {order.tableNumber}</span>
        </div>
        <span
          className="status-badge"
          style={{ backgroundColor: getStatusColor(order.status) }}
        >
          {getStatusLabel(order.status)}
        </span>
      </div>

      <div className="order-time">
        {new Date(order.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      </div>

      <div className="order-items">
        {order.items.map((item, i) => (
          <div key={i} className="order-item">
            <span className="item-name">{item.name}</span>
            <span className="item-qty">x{item.quantity}</span>
            {item.notes && <span className="item-notes">📝 {item.notes}</span>}
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="order-notes">
          📝 Catatan: {order.notes}
        </div>
      )}

      {canProgress && (
        <button
          className="progress-btn"
          onClick={() => onUpdateStatus(order.id, nextStatus)}
          style={{ backgroundColor: getStatusColor(nextStatus) }}
        >
          {getStatusLabel(nextStatus)}
        </button>
      )}

      {!canProgress && (
        <div className="completed-tag">Pesanan selesai</div>
      )}
    </div>
  )
}

export default App