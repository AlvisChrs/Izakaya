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
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusColor={getStatusColor} getStatusLabel={getStatusLabel} />
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
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusColor={getStatusColor} getStatusLabel={getStatusLabel} />
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
              <OrderCard key={order.id} order={order} onUpdateStatus={updateStatus} getNextStatus={getNextStatus} getStatusColor={getStatusColor} getStatusLabel={getStatusLabel} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function OrderCard({ order, onUpdateStatus, getNextStatus, getStatusColor, getStatusLabel }) {
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