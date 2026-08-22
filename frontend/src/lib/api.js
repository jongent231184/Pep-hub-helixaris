import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

// Inject token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ghp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalize a backend product image url (relative /api/uploads/...) to absolute
export const resolveImage = (path) => {
  if (!path) return '';
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
  return path;
};

export const Auth = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }).then(r => r.data),
  adminResetPassword: (payload) =>
    api.post('/auth/admin/reset-user-password', payload).then(r => r.data),
};

export const Categories = {
  list: () => api.get('/categories').then(r => r.data),
  listAll: () => api.get('/categories/all').then(r => r.data),
  create: (data) => api.post('/categories', data).then(r => r.data),
  update: (id, data) => api.put(`/categories/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/categories/${id}`).then(r => r.data),
};

export const Products = {
  list: (params = {}) => api.get('/products', { params }).then(r => r.data),
  listAll: () => api.get('/products/all').then(r => r.data),
  get: (slug) => api.get(`/products/${slug}`).then(r => r.data),
  getById: (id) => api.get(`/products/id/${id}`).then(r => r.data),
  create: (data) => api.post('/products', data).then(r => r.data),
  update: (id, data) => api.put(`/products/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/products/${id}`).then(r => r.data),
};

export const Orders = {
  create: (data) => api.post('/orders', data).then(r => r.data),
  mine: () => api.get('/orders/mine').then(r => r.data),
  all: () => api.get('/orders/all').then(r => r.data),
  get: (id) => api.get(`/orders/${id}`).then(r => r.data),
  patch: (id, data) => api.patch(`/orders/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/orders/${id}`).then(r => r.data),
  // Paylinks
  createPaylink: (data) => api.post('/orders/paylink', data).then(r => r.data),
  listPaylinks: () => api.get('/orders/paylinks').then(r => r.data),
  getPaylink: (id) => api.get(`/orders/pay/${id}`).then(r => r.data),
  setPaylinkAddress: (id, addr) => api.put(`/orders/pay/${id}/address`, addr).then(r => r.data),
};

export const Sales = {
  summary: () => api.get('/admin/sales/summary').then(r => r.data),
  products: () => api.get('/admin/sales/products').then(r => r.data),
  productOrders: (productId, option) =>
    api.get(`/admin/sales/products/${productId}/orders`, { params: option != null ? { option } : {} }).then(r => r.data),
};

export const Uploads = {
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  uploadDocument: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};

export const Coas = {
  list: () => api.get('/coas').then(r => r.data),
  listAll: () => api.get('/coas/all').then(r => r.data),
  create: (data) => api.post('/coas', data).then(r => r.data),
  update: (id, data) => api.put(`/coas/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/coas/${id}`).then(r => r.data),
};

export const Coaching = {
  submit: (data) => api.post('/coaching/requests', data).then(r => r.data),
  adminList: () => api.get('/coaching/admin/requests').then(r => r.data),
  adminGet: (id) => api.get(`/coaching/admin/requests/${id}`).then(r => r.data),
  adminUpdate: (id, data) => api.patch(`/coaching/admin/requests/${id}`, data).then(r => r.data),
  adminRemove: (id) => api.delete(`/coaching/admin/requests/${id}`).then(r => r.data),
};

export const Coaches = {
  // Admin
  adminList: () => api.get('/coaching/admin/coaches').then(r => r.data),
  adminCreate: (data) => api.post('/coaching/admin/coaches', data).then(r => r.data),
  adminUpdate: (id, data) => api.put(`/coaching/admin/coaches/${id}`, data).then(r => r.data),
  adminRemove: (id) => api.delete(`/coaching/admin/coaches/${id}`).then(r => r.data),
  // Coach self-service
  me: () => api.get('/coaching/coach/me').then(r => r.data),
  requests: () => api.get('/coaching/coach/requests').then(r => r.data),
  updateRequest: (id, data) => api.patch(`/coaching/coach/requests/${id}`, data).then(r => r.data),
  clients: () => api.get('/coaching/coach/clients').then(r => r.data),
  deactivateClient: (id) => api.delete(`/coaching/coach/clients/${id}`).then(r => r.data),
  // Protocol builder
  clientDetail: (id) => api.get(`/coaching/coach/clients/${id}`).then(r => r.data),
  createProtocol: (clientId, data) => api.post(`/coaching/coach/clients/${clientId}/protocol`, data).then(r => r.data),
  updateProtocol: (id, data) => api.put(`/coaching/coach/protocols/${id}`, data).then(r => r.data),
  deleteProtocol: (id) => api.delete(`/coaching/coach/protocols/${id}`).then(r => r.data),
  addItem: (protoId, data) => api.post(`/coaching/coach/protocols/${protoId}/items`, data).then(r => r.data),
  removeItem: (protoId, itemId) => api.delete(`/coaching/coach/protocols/${protoId}/items/${itemId}`).then(r => r.data),
  addCalendar: (protoId, data) => api.post(`/coaching/coach/protocols/${protoId}/calendar`, data).then(r => r.data),
  removeCalendar: (protoId, entryId) => api.delete(`/coaching/coach/protocols/${protoId}/calendar/${entryId}`).then(r => r.data),
  createPaylink: (protoId, price) => api.post(`/coaching/coach/protocols/${protoId}/paylink`, price != null ? { price } : {}).then(r => r.data),
  vialCalc: (protoId, itemId) => api.get(`/coaching/coach/protocols/${protoId}/items/${itemId}/vial-calc`).then(r => r.data),
  toggleEntryCoach: (protoId, entryId, done) => api.patch(`/coaching/coach/protocols/${protoId}/calendar/${entryId}?done=${done}`).then(r => r.data),
  pushToCart: (protoId, itemId) => api.post(`/coaching/coach/protocols/${protoId}/items/${itemId}/push-to-cart`).then(r => r.data),
  atRisk: () => api.get('/coaching/coach/at-risk').then(r => r.data),
  clientMessages: (clientId) => api.get(`/coaching/coach/clients/${clientId}/messages`).then(r => r.data),
  sendMessage: (clientId, body) => api.post(`/coaching/coach/clients/${clientId}/messages`, { body }).then(r => r.data),
  // Customer self-view
  myProtocol: () => api.get('/coaching/my/protocol').then(r => r.data),
  toggleEntry: (entryId, done) => api.patch(`/coaching/my/calendar/${entryId}?done=${done}`).then(r => r.data),
  myMessages: () => api.get('/coaching/my/messages').then(r => r.data),
  sendMyMessage: (body) => api.post('/coaching/my/messages', { body }).then(r => r.data),
  myPrescribedCart: () => api.get('/coaching/my/prescribed-cart').then(r => r.data),
  consumePrescribedCart: (ids) => api.post('/coaching/my/prescribed-cart/consume', { ids: ids || null }).then(r => r.data),
  // Weigh-ins
  myWeighIns: () => api.get('/coaching/my/weigh-ins').then(r => r.data),
  addMyWeighIn: (date, weight_kg) => api.post('/coaching/my/weigh-ins', { date, weight_kg }).then(r => r.data),
  deleteMyWeighIn: (id) => api.delete(`/coaching/my/weigh-ins/${id}`).then(r => r.data),
  setMyTarget: (target_weight_kg) => api.patch('/coaching/my/target-weight', { target_weight_kg }).then(r => r.data),
  coachWeighIns: (clientId) => api.get(`/coaching/coach/clients/${clientId}/weigh-ins`).then(r => r.data),
  coachSetTarget: (clientId, target_weight_kg) => api.patch(`/coaching/coach/clients/${clientId}/target-weight`, { target_weight_kg }).then(r => r.data),
};

export const PayPal = {
  config: () => api.get('/paypal/config').then(r => r.data),
  createOrder: (orderId) => api.post('/paypal/create-order', { order_id: orderId }).then(r => r.data),
  captureOrder: (orderId, paypalOrderId) => api.post('/paypal/capture-order', { order_id: orderId, paypal_order_id: paypalOrderId }).then(r => r.data),
};

export const Wallid = {
  config: () => api.get('/wallid/config').then(r => r.data),
  createPayment: (orderId) => api.post('/wallid/create-payment', { order_id: orderId }).then(r => r.data),
  verifyStatus: (orderId) => api.get(`/wallid/verify-status/${orderId}`).then(r => r.data),
  syncPending: () => api.post('/wallid/sync-pending').then(r => r.data),
};

export const DosePlans = {
  mine: () => api.get('/dose-plans/mine').then(r => r.data),
  create: (data) => api.post('/dose-plans', data).then(r => r.data),
  remove: (id) => api.delete(`/dose-plans/${id}`).then(r => r.data),
};

export const Ambassadors = {
  // Admin
  adminList: () => api.get('/ambassadors/admin').then(r => r.data),
  adminGet: (id) => api.get(`/ambassadors/admin/${id}`).then(r => r.data),
  adminCreate: (data) => api.post('/ambassadors/admin', data).then(r => r.data),
  adminUpdate: (id, data) => api.put(`/ambassadors/admin/${id}`, data).then(r => r.data),
  adminRemove: (id) => api.delete(`/ambassadors/admin/${id}`).then(r => r.data),
  adminCreatePayout: (id, data) => api.post(`/ambassadors/admin/${id}/payouts`, data).then(r => r.data),  adminDeletePayout: (id, payoutId) => api.delete(`/ambassadors/admin/${id}/payouts/${payoutId}`).then(r => r.data),
  // Ambassador self-service
  me: () => api.get('/ambassadors/me').then(r => r.data),
  orders: () => api.get('/ambassadors/orders').then(r => r.data),
  order: (id) => api.get(`/ambassadors/orders/${id}`).then(r => r.data),
  payouts: () => api.get('/ambassadors/payouts').then(r => r.data),
};

export const Settings = {
  get: () => api.get('/settings').then(r => r.data),
  update: (data) => api.put('/settings', data).then(r => r.data),
};

export const Admin = {
  stats: () => api.get('/admin/stats').then(r => r.data),
  customers: () => api.get('/admin/customers').then(r => r.data),
};

export const Promos = {
  list: () => api.get('/promos').then(r => r.data),
  create: (data) => api.post('/promos', data).then(r => r.data),
  update: (id, data) => api.put(`/promos/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/promos/${id}`).then(r => r.data),
  validate: (code, subtotal, shipping) =>
    api.post('/promos/validate', { code, subtotal, shipping }).then(r => r.data),
};

export const Addresses = {
  mine: () => api.get('/addresses/mine').then(r => r.data),
  create: (data) => api.post('/addresses', data).then(r => r.data),
  update: (id, data) => api.put(`/addresses/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/addresses/${id}`).then(r => r.data),
};

export default api;
