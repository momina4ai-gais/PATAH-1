import React, { useState } from 'react';
import { MerchantUser } from '../types';
import { Lock, Store, Phone, Mail, User, ArrowRight, ShieldCheck } from 'lucide-react';

interface AuthScreenProps {
  onLogin: (user: MerchantUser) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  
  // Login fields
  const [loginEmailOrPhone, setLoginEmailOrPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup fields
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmailOrPhone || !loginPassword) {
      setError('Please provide your phone/email and password.');
      return;
    }

    const user: MerchantUser = {
      id: 'mch-' + Date.now().toString(36),
      name: loginEmailOrPhone.includes('@') ? loginEmailOrPhone.split('@')[0] : 'Merchant Partner',
      storeName: 'Merchant Store',
      emailOrPhone: loginEmailOrPhone,
      city: 'Pakistan',
    };

    localStorage.setItem('patah_merchant_user', JSON.stringify(user));
    onLogin(user);
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !storeName.trim() || !phone.trim() || !password) {
      setError('Please complete all required fields.');
      return;
    }

    const user: MerchantUser = {
      id: 'mch-' + Date.now().toString(36),
      name: name.trim(),
      storeName: storeName.trim(),
      emailOrPhone: phone.trim(),
      city: city.trim(),
    };

    localStorage.setItem('patah_merchant_user', JSON.stringify(user));
    onLogin(user);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-300 shadow-xl rounded overflow-hidden">
        {/* Pakistan Flag Theme Top Header */}
        <div className="bg-[#01411C] text-white p-6 border-b-4 border-white flex flex-col items-center text-center relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded bg-white text-[#01411C] font-black text-sm flex items-center justify-center tracking-tight shadow-sm">
              P
            </span>
            <div className="text-left">
              <span className="text-lg font-black tracking-wider text-white block leading-none">
                PATAH
              </span>
              <span className="text-[10px] uppercase font-bold text-emerald-200 tracking-widest">
                Pakistan Merchant Portal
              </span>
            </div>
          </div>
          <p className="text-xs text-emerald-100 max-w-xs mt-1">
            Doorstep location pins &amp; voice direction confirmation for couriers
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold text-center transition-colors cursor-pointer ${
              tab === 'login'
                ? 'bg-white text-[#01411C] border-b-2 border-[#01411C]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Merchant Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold text-center transition-colors cursor-pointer ${
              tab === 'signup'
                ? 'bg-white text-[#01411C] border-b-2 border-[#01411C]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register Store (Sign Up)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded p-2.5">
              {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Mobile Number or Email
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={loginEmailOrPhone}
                    onChange={(e) => setLoginEmailOrPhone(e.target.value)}
                    placeholder="e.g. 0300 1234567 or shop@domain.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#01411C] hover:bg-[#002d13] text-white text-xs font-bold py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                Sign In to Merchant Hub
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Owner / Merchant Name *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Tariq Mehmood"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Business / Brand Name *
                </label>
                <div className="relative">
                  <Store className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g. Royal Apparel &amp; Leather"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    WhatsApp / Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0300 1234567"
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lahore / Karachi"
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Create Password *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#01411C] hover:bg-[#002d13] text-white text-xs font-bold py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                Create Merchant Account
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
