import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, User, ShoppingBag, Menu, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BRAND from '../config/brand';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/about-us', label: 'About Us' },
  { to: '/nasals', label: 'Nasals' },
  { to: '/pens', label: 'Pens' },
  { to: '/vials', label: 'Vials' },
  { to: '/oral-peptides', label: 'Oral Peptides' },
  { to: '/syringes-and-wipes', label: 'Syringes & Wipes' },
  { to: '/bundles', label: 'Bundles' },
  { to: '/peptide-calculator', label: 'Calculator' },
  { to: '/coa', label: 'COAs' },
  { to: '/coaching', label: 'Coaching' },
];

const Header = () => {
  const navigate = useNavigate();
  const { totalItems, subtotal } = useCart();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <header className="bg-white sticky top-0 z-40 shadow-sm">
      {/* Top section with logo, search, account, cart */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <img
            src={BRAND.logo}
            alt={BRAND.fullName}
            className="h-20 md:h-24 w-auto rounded-lg shadow-md"
          />
        </Link>

        {/* Search bar (desktop) */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg mx-auto relative">
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Products..."
            className="pr-12 h-11 rounded-md border-slate-300"
          />
          <button type="submit" aria-label="Search" className="absolute right-0 top-0 h-11 w-11 grid place-items-center text-slate-600 hover:text-sky-600">
            <Search className="h-5 w-5" />
          </button>
        </form>

        {/* Account & Cart */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            to={user ? '/account' : '/login'}
            className="flex flex-col items-center text-slate-700 hover:text-sky-600 transition-colors"
            data-testid="header-account-link"
          >
            <User className="h-6 w-6" />
            <span className="hidden sm:block text-[11px] mt-0.5">
              {user ? 'My Account' : 'Log In'}
            </span>
          </Link>
          <Link to="/cart" className="flex flex-col items-center text-slate-700 hover:text-sky-600 transition-colors relative">
            <div className="relative">
              <ShoppingBag className="h-6 w-6" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-sky-500 text-white text-[10px] font-bold rounded-full h-5 w-5 grid place-items-center">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="hidden sm:block text-[11px] mt-0.5">My Bag</span>
          </Link>
          <button onClick={() => setMobileOpen(true)} className="md:hidden p-2" aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile search */}
      <form onSubmit={handleSearch} className="md:hidden px-4 pb-3 relative">
        <Input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search Products..."
          className="pr-10 h-10"
        />
        <button type="submit" aria-label="Search" className="absolute right-4 top-0 h-10 w-10 grid place-items-center text-slate-600">
          <Search className="h-4 w-4" />
        </button>
      </form>

      {/* Navigation */}
      <nav className="hidden md:block bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <ul className="flex items-center">
            {NAV.map(item => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block px-5 py-4 text-sm font-bold uppercase tracking-wider text-slate-800 hover:text-sky-600 hover:bg-slate-50 transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/contact"
            className="bg-slate-900 text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-sky-600 transition-colors"
          >
            Contact
          </Link>
        </div>
      </nav>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 text-white md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="p-4 flex justify-end">
            <button aria-label="Close menu" className="p-2"><X className="h-6 w-6" /></button>
          </div>
          <div onClick={e => e.stopPropagation()} className="px-6">
            <Link
              to={user ? '/account' : '/login'}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 bg-sky-500 hover:bg-sky-600 rounded-lg px-5 py-4 mb-6 font-bold uppercase tracking-wider text-sm transition-colors"
              data-testid="mobile-account-link"
            >
              <User className="h-5 w-5" />
              {user ? `Hi, ${user.first_name || 'account'}` : 'Log in / Register'}
            </Link>
            <ul className="flex flex-col items-center gap-2">
              {[...NAV, { to: '/contact', label: 'Contact' }].map(item => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-6 py-3 text-base font-bold uppercase tracking-wider hover:text-sky-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
