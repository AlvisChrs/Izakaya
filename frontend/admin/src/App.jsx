import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [tables, setTables] = useState([])
  const [menu, setMenu] = useState([])
  const [categories, setCategories] = useState([])
  const [orders, setOrders] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrCodeData, setQrCodeData] = useState(null)
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch initial data via REST
  useEffect(() => {
    fetch(`${API_URL}/api/menu`)
      .then(r => r.json())
      .then(data => { setMenu(data.menu); setCategories(data.categories) })
      .catch(console.error)

    fetch(`${API_URL}/api/tables`)
      .then(r => r.json())
      .then(data => { setTables(data); setLoading(false) })
      .catch(console.error)
  }, [])

  // Initialize socket for real-time updates
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
    })

    newSocket.on('new-order', (order) => {
      setOrders(prev => [...prev, order].sort((a, b) => a.timestamp - b.timestamp))
    })

    newSocket.on('order-status-updated', ({ orderId, status }) => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    })

    newSocket.on('orders-completed', ({ tableId }) => {
      setOrders(prev => prev.filter(o => o.tableId !== tableId || o.status !== 'completed'))
    })

    return () => newSocket.close()
  }, [])

  const showQR = (table) => {
    setSelectedTable(table)
    setQrCodeData(table.qrCode)
    setShowQRModal(true)
  }

  const getTableOrders = (tableId) => {
    return orders.filter(o => o.tableId === tableId && o.status !== 'completed')
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
      case 'preparing': return 'Memasak'
      case 'ready': return 'Siap'
      case 'completed': return 'Selesai'
      default: return status
    }
  }

  if (loading) {
    return <div className="loading">Memuat data...</div>
  }

  const activeOrdersCount = orders.filter(o => o.status !== 'completed').length
  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0)

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
        </div>
      </header>

      <main className="main">
        {/* Tables Grid */}
        <section className="tables-section">
          <h2>Manajemen Meja</h2>
          <div className="tables-grid">
            {tables.map(table => {
              const tableOrders = getTableOrders(table.id)
              const pendingCount = tableOrders.filter(o => o.status === 'pending').length
              const preparingCount = tableOrders.filter(o => o.status === 'preparing').length
              const readyCount = tableOrders.filter(o => o.status === 'ready').length

              return (
                <div key={table.id} className="table-card">
                  <div className="table-header">
                    <span className="table-number">Meja {table.number}</span>
                    <button className="qr-btn" onClick={() => showQR(table)}>📱 QR</button>
                  </div>
                  
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
              )
            })}
          </div>
        </section>

        {/* Menu Overview */}
        <section className="menu-section">
          <h2>Menu ({menu.length} item)</h2>
          <div className="menu-grid">
            {categories.map(cat => (
              <div key={cat} className="category-card">
                <h3>{cat}</h3>
                {menu.filter(m => m.category === cat).map(item => (
                  <div key={item.id} className="menu-item-admin">
                    <span className="item-emoji">{item.image}</span>
                    <div className="item-details">
                      <span className="item-name">{item.name}</span>
                      <span className="item-desc">{item.description}</span>
                    </div>
                    <span className="item-price">Rp {item.price.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* QR Modal */}
      {showQRModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>QR Code - Meja {selectedTable.number}</h2>
              <button className="close-btn" onClick={() => setShowQRModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {qrCodeData && (
                <img src={qrCodeData} alt={`QR Meja ${selectedTable.number}`} className="qr-image" />
              )}
              <p className="qr-url">
                {window.location.origin}/customer.html?table={selectedTable.id}
              </p>
              <button className="copy-btn" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/customer.html?table=${selectedTable.id}`)
                alert('Link disalin!')
              }}>
                📋 Salin Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App