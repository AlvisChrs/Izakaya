import { useEffect, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
const KITCHEN_TOKEN_KEY = 'izakaya_kitchen_token'

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || window.location.origin}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      
      const data = await res.json()
      
      if (res.ok && data.role === 'kitchen') {
        localStorage.setItem(KITCHEN_TOKEN_KEY, data.token)
        onLogin(data.token)
      } else {
        setError(data.error || 'Akses ditolak: Anda bukan staff dapur')
      }
    } catch (err) {
      console.error(err)
      setError('Gagal menghubungi server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🍳 Dapur Izakaya</h1>
          <p>Login ke Panel Dapur</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error" style={{ color: '#ef4444', marginBottom: 16 }}>{error}</div>}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Misal: kitchen"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  const [orders, setOrders] = useState([])
  const [waiterRequests, setWaiterRequests] = useState([])
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [kitchenToken, setKitchenToken] = useState(() => localStorage.getItem(KITCHEN_TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  const handleLogout = useCallback(() => {
    localStorage.removeItem(KITCHEN_TOKEN_KEY)
    setKitchenToken(null)
    setSocket(null)
    setConnected(false)
    setOrders([])
    setWaiterRequests([])
  }, [])

  // Audio chime for new orders
  const playNotification = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      osc.start()
      setTimeout(() => { osc.stop(); ctx.close() }, 200)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (!kitchenToken) {
      // eslint-disable-next-line react/set-state-in-effect
      setLoading(false)
      return
    }

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: kitchenToken }
    })
    // eslint-disable-next-line react/set-state-in-effect
    setSocket(newSocket)

    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('join-kitchen')
    })

    newSocket.on('error', ({ message }) => {
      if (message && message.includes('Unauthorized')) {
        handleLogout()
      }
    })

    newSocket.on('disconnect', () => setConnected(false))

    newSocket.on('kitchen-orders', (orderList) => {
      setOrders(orderList)
      setLoading(false)
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

    return () => newSocket.close()
  }, [kitchenToken, soundEnabled, handleLogout, playNotification])

  const handleResolveWaiterRequest = (requestId) => {
    if (!socket || !kitchenToken) return
    socket.emit('resolve-waiter-request', { requestId })
  }

  const updateStatus = (orderId, newStatus) => {
    if (!socket || !kitchenToken) return
    socket.emit('update-order-status', { orderId, status: newStatus })
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

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})

  if (!kitchenToken) {
    return <LoginPage onLogin={setKitchenToken} />
  }

  if (loading) {
    return (
      <div className="kitchen-app-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        Memuat data dapur...
      </div>
    )
  }

  return (
    <div className="kitchen-app-wrapper">
      <header className="kitchen-header">
        <div className="kitchen-header-left">
          <h1>🍳 Dapur Izakaya</h1>
          <span className={`kitchen-connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 ONLINE' : '🔴 OFFLINE'}
          </span>
        </div>
        
        {/* Active Waiter Calls Banner in Kitchen */}
        {waiterRequests.length > 0 && (
          <div className="kitchen-waiter-alerts">
            <span className="waiter-alert-icon">🔔</span>
            <div className="waiter-alert-scroll">
              {waiterRequests.map(req => (
                <div key={req.id} className="waiter-alert-pill">
                  <strong>Meja {req.tableNumber}</strong>: {req.requestType}
                  <button onClick={() => handleResolveWaiterRequest(req.id)}>✓</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="kitchen-header-right">
          <label className="kitchen-sound-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={e => setSoundEnabled(e.target.checked)}
            />
            <span className="sound-toggle-slider"></span>
            <span className="sound-label">🔊 Suara</span>
          </label>
          <button className="kitchen-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="kanban-board">
        {/* PENDING COLUMN */}
        <section className="kanban-col col-pending">
          <div className="kanban-col-header">
            <h2>🔥 Menunggu ({statusCounts.pending || 0})</h2>
          </div>
          <div className="kanban-cards-container">
            {orders.filter(o => o.status === 'pending').sort((a, b) => a.timestamp - b.timestamp).map(order => (
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusLabel={getStatusLabel} />
            ))}
          </div>
        </section>

        {/* PREPARING COLUMN */}
        <section className="kanban-col col-preparing">
          <div className="kanban-col-header">
            <h2>🍳 Memasak ({statusCounts.preparing || 0})</h2>
          </div>
          <div className="kanban-cards-container">
            {orders.filter(o => o.status === 'preparing').sort((a, b) => a.timestamp - b.timestamp).map(order => (
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusLabel={getStatusLabel} />
            ))}
          </div>
        </section>

        {/* READY COLUMN */}
        <section className="kanban-col col-ready">
          <div className="kanban-col-header">
            <h2>✅ Siap Diantar ({statusCounts.ready || 0})</h2>
          </div>
          <div className="kanban-cards-container">
            {orders.filter(o => o.status === 'ready').sort((a, b) => b.timestamp - a.timestamp).map(order => (
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusLabel={getStatusLabel} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function OrderCard({ order, onUpdateStatus, getNextStatus, getStatusLabel }) {
  const nextStatus = getNextStatus(order.status)
  const canProgress = nextStatus !== null

  return (
    <div className={`kanban-card card-${order.status}`}>
      <div className="kc-header">
        <span className="kc-table">Meja {order.tableNumber}</span>
        <span className="kc-time">
          {new Date(order.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="kc-items">
        {order.items.map((item, i) => (
          <div key={i} className="kc-item">
            <div className="kc-item-main">
              <span className="kc-qty">{item.quantity}x</span>
              <span className="kc-name">{item.name}</span>
            </div>
            {item.notes && <div className="kc-item-notes">📝 {item.notes}</div>}
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="kc-global-notes">
          <strong>Catatan:</strong> {order.notes}
        </div>
      )}

      {canProgress && (
        <button
          className={`kc-action-btn action-${nextStatus}`}
          onClick={() => onUpdateStatus(order.id, nextStatus)}
        >
          {getStatusLabel(nextStatus)}
        </button>
      )}
    </div>
  )
}

export default App