import React from 'react';
import Header from './Header';
import Footer from './Footer';
import WholesaleBanner from './WholesaleBanner';
import AgeModal from './AgeModal';

const Layout = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-white text-slate-900">
    <AgeModal />
    <Header />
    <WholesaleBanner />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

export default Layout;
