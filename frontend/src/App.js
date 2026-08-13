import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { Toaster } from './components/ui/toaster';
import ScrollToTop from './components/ScrollToTop';
import SitePasswordGate from './components/SitePasswordGate';

import Home from './pages/Home';
import About from './pages/About';
import CategoryPage from './pages/CategoryPage';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import PayLinkPage from './pages/PayLinkPage';
import Login from './pages/Login';
import Account from './pages/Account';
import Contact from './pages/Contact';
import Bundles from './pages/Bundles';
import Search from './pages/Search';
import Wholesale from './pages/Wholesale';
import Terms from './pages/Terms';
import PeptideCalculator from './pages/PeptideCalculator';
import Coa from './pages/Coa';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminProductForm from './pages/admin/AdminProductForm';
import AdminCategories from './pages/admin/AdminCategories';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetail from './pages/admin/AdminOrderDetail';
import AdminOrderInvoice from './pages/admin/AdminOrderInvoice';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminSettings from './pages/admin/AdminSettings';
import AdminPromos from './pages/admin/AdminPromos';
import AdminPaylinks from './pages/admin/AdminPaylinks';
import AdminAmbassadors from './pages/admin/AdminAmbassadors';
import AdminCoas from './pages/admin/AdminCoas';
import AdminCoachingRequests from './pages/admin/AdminCoachingRequests';
import AdminCoaches from './pages/admin/AdminCoaches';

import CoachLayout from './pages/coach/CoachLayout';
import CoachDashboard from './pages/coach/CoachDashboard';
import CoachRequests from './pages/coach/CoachRequests';
import CoachClients from './pages/coach/CoachClients';
import CoachClientDetail from './pages/coach/CoachClientDetail';

import Coaching from './pages/Coaching';

import AmbassadorLayout from './pages/ambassador/AmbassadorLayout';
import AmbassadorDashboard from './pages/ambassador/AmbassadorDashboard';
import AmbassadorOrders from './pages/ambassador/AmbassadorOrders';
import AmbassadorOrderDetail from './pages/ambassador/AmbassadorOrderDetail';
import AmbassadorPayouts from './pages/ambassador/AmbassadorPayouts';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <SitePasswordGate>
              <Routes>
              {/* Admin */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/new" element={<AdminProductForm />} />
                <Route path="products/:productId" element={<AdminProductForm />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:orderId" element={<AdminOrderDetail />} />
                <Route path="orders/:orderId/invoice" element={<AdminOrderInvoice />} />
                <Route path="promos" element={<AdminPromos />} />
                <Route path="paylinks" element={<AdminPaylinks />} />
                <Route path="ambassadors" element={<AdminAmbassadors />} />
                <Route path="coas" element={<AdminCoas />} />
                <Route path="coaching" element={<AdminCoachingRequests />} />
                <Route path="coaches" element={<AdminCoaches />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              {/* Ambassador portal */}
              <Route path="/ambassador" element={<AmbassadorLayout />}>
                <Route index element={<AmbassadorDashboard />} />
                <Route path="orders" element={<AmbassadorOrders />} />
                <Route path="orders/:orderId" element={<AmbassadorOrderDetail />} />
                <Route path="payouts" element={<AmbassadorPayouts />} />
              </Route>

              {/* Coach portal */}
              <Route path="/coach" element={<CoachLayout />}>
                <Route index element={<CoachDashboard />} />
                <Route path="requests" element={<CoachRequests />} />
                <Route path="clients" element={<CoachClients />} />
                <Route path="clients/:clientId" element={<CoachClientDetail />} />
              </Route>

              {/* Storefront */}
              <Route path="/" element={<Home />} />
              <Route path="/about-us" element={<About />} />
              <Route path="/bundles" element={<Bundles />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
              <Route path="/pay/:orderId" element={<PayLinkPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/account" element={<Account />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/search" element={<Search />} />
              <Route path="/wholesale" element={<Wholesale />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/peptide-calculator" element={<PeptideCalculator />} />
              <Route path="/coa" element={<Coa />} />
              <Route path="/coas" element={<Coa />} />
              <Route path="/coaching" element={<Coaching />} />
              <Route path="/:categorySlug" element={<CategoryPage />} />
              <Route path="/:categorySlug/:productSlug" element={<ProductDetail />} />
              </Routes>
            </SitePasswordGate>
            <Toaster />
          </BrowserRouter>
        </CartProvider>
      </StoreProvider>
    </AuthProvider>
  );
}

export default App;
