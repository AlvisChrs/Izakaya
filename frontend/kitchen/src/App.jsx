import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

function App() {
  const [orders, setOrders] = useState([])
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioRef = useState(new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'))

  // Initialize socket
  useEffect(() => {
    const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    setSocket(newSocket)

    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('join-kitchen')
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

    return () => newSocket.close()
  }, [soundEnabled])

  const playNotification = () => {
    // Simple beep using Web Audio API
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
    if (!socket) return
    socket.emit('update-order-status', { orderId, status: newStatus })
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
    // Sort by status priority then timestamp
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
        </div>
      </header>

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