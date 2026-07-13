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

export const Uploads = {
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};

export const PayPal = {
  config: () => api.get('/paypal/config').then(r => r.data),
  createOrder: (orderId) => api.post('/paypal/create-order', { order_id: orderId }).then(r => r.data),
  captureOrder: (orderId, paypalOrderId) => api.post('/paypal/capture-order', { order_id: orderId, paypal_order_id: paypalOrderId }).then(r => r.data),
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
