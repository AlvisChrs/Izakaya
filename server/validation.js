const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

const schemas = {
  tableId: z.string().regex(/^table-\d+$/),
  orderId: z.string().uuid(),
  menuItem: z.object({
    menuId: z.string().startsWith('m'),
    quantity: z.number().int().positive(),
    notes: z.string().optional()
  }),
  menuItems: z.array(z.object({
    menuId: z.string().startsWith('m'),
    quantity: z.number().int().positive(),
    notes: z.string().optional()
  })).min(1),
  notes: z.string().max(500).optional(),
  orderStatus: z.enum(['pending', 'preparing', 'ready', 'completed']),
  menuInput: z.object({
    name: z.string().trim().min(1).max(100),
    price: z.number().positive(),
    category: z.string().trim().min(1).max(50),
    image: z.string().optional(),
    description: z.string().optional()
  }),
  waiterRequest: z.object({
    tableId: z.string().regex(/^table-\d+$/),
    requestType: z.string().trim().min(1).max(100)
  })
};

// Backward compatible validation helpers that use Zod under the hood
const validate = {
  tableId: (id) => schemas.tableId.safeParse(id).success,
  orderId: (id) => schemas.orderId.safeParse(id).success,
  menuItem: (item) => schemas.menuItem.safeParse(item).success,
  menuItems: (items) => schemas.menuItems.safeParse(items).success,
  notes: (n) => {
    if (n === undefined || n === null || n === '') return true;
    return schemas.notes.safeParse(n).success;
  },
  orderStatus: (status) => schemas.orderStatus.safeParse(status).success,
  menuInput: (data) => schemas.menuInput.safeParse(data).success,
  waiterRequest: (data) => schemas.waiterRequest.safeParse(data).success,
  generateOrderId: () => uuidv4(),
};

module.exports = { validate, schemas };