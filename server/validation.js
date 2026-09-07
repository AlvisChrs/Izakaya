const { v4: uuidv4 } = require('uuid');

// Validation helpers
const validate = {
  // Table ID format: table-1, table-2, etc.
  tableId: (id) => typeof id === 'string' && /^table-\d+$/.test(id),

  // Order ID: UUID v4
  orderId: (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),

  // Menu item in cart/order
  menuItem: (item) => {
    if (!item || typeof item !== 'object') return false;
    return (
      typeof item.menuId === 'string' && item.menuId.startsWith('m') &&
      typeof item.name === 'string' && item.name.length > 0 &&
      typeof item.price === 'number' && item.price > 0 &&
      typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 &&
      (item.notes === undefined || typeof item.notes === 'string')
    );
  },

  // Array of menu items (cart)
  menuItems: (items) => Array.isArray(items) && items.length > 0 && items.every(validate.menuItem),

  // Notes: optional string, max 500 chars
  notes: (notes) => notes === undefined || notes === '' || (typeof notes === 'string' && notes.length <= 500),

  // Order status
  orderStatus: (status) => ['pending', 'preparing', 'ready', 'completed'].includes(status),

  // UUID v4 generator for new orders
  generateOrderId: () => uuidv4(),
};

module.exports = { validate };