import React, { useState, useEffect, useCallback } from 'react';
import { Order, MerchantUser } from './types';
import { fetchOrders, fetchOrderById, decodeOrderFromQR, saveLocalOrders, getLocalOrders } from './lib/api';
import { Navbar } from './components/Navbar';
import { AuthScreen } from './components/AuthScreen';
import { MerchantDashboard } from './components/MerchantDashboard';
import { CustomerAssistView } from './components/CustomerAssistView';
import { RiderScanView } from './components/RiderScanView';
import { Search, ArrowLeft } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<MerchantUser | null>(() => {
    try {
      const stored = localStorage.getItem('patah_merchant_user');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'merchant' | 'customer' | 'rider'>('merchant');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [activeCustomerOrder, setActiveCustomerOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState<boolean>(false);
  const [manualLookupId, setManualLookupId] = useState<string>('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Initialize from URL query parameters (e.g. customer clicking link, or rider scanning QR code)
  useEffect(() => {
    async function initApp() {
      setIsLoading(true);
      const fetchedOrders = await fetchOrders();
      setOrders(fetchedOrders);

      const params = new URLSearchParams(window.location.search);
      const flow = params.get('flow');
      const orderId = params.get('orderId');
      const compactData = params.get('d');

      let resolvedOrder: Order | null = null;

      // 1. Try decoding self-contained compact data payload first (guaranteed offline/cross-device)
      if (compactData) {
        const decoded = decodeOrderFromQR(compactData);
        if (decoded) {
          resolvedOrder = decoded;
          // Merge into local list
          const local = getLocalOrders();
          const merged = [decoded, ...local.filter((o) => o.id !== decoded.id)];
          saveLocalOrders(merged);
          setOrders(merged);
        }
      }

      const targetId = orderId || resolvedOrder?.id;
      if (targetId) {
        // Always query server for latest live status (e.g. if merchant marked DELIVERED)
        const isRiderQr = flow === 'rider';
        const serverOrder =
          (await fetchOrderById(targetId, isRiderQr)) ||
          fetchedOrders.find((o) => o.id === targetId) ||
          null;
        if (serverOrder) {
          if (serverOrder.status === 'DELIVERED' && isRiderQr) {
            resolvedOrder = serverOrder;
          } else {
            resolvedOrder = resolvedOrder
              ? { ...resolvedOrder, ...serverOrder }
              : serverOrder;
          }
          const local = getLocalOrders();
          saveLocalOrders([resolvedOrder, ...local.filter((o) => o.id !== resolvedOrder!.id)]);
        }
      }

      if (resolvedOrder) {
        setSelectedOrderId(resolvedOrder.id);
        setActiveCustomerOrder(resolvedOrder);
      } else if (orderId) {
        setSelectedOrderId(orderId);
      }

      if (flow === 'customer') {
        setCurrentView('customer');
      } else if (flow === 'rider') {
        setCurrentView('rider');
      } else {
        setCurrentView('merchant');
      }

      setIsLoading(false);
    }

    initApp();
  }, []);

  const refreshOrders = useCallback(async () => {
    const latest = await fetchOrders();
    setOrders(latest);
  }, []);

  // Automatically sync Merchant Dashboard when orders are confirmed in another tab or device
  useEffect(() => {
    if (currentView !== 'merchant' || !currentUser || isLoading) return;

    refreshOrders();

    const intervalId = setInterval(() => {
      refreshOrders();
    }, 3000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState !== 'hidden') {
        refreshOrders();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'patah_local_orders') {
        setOrders(getLocalOrders());
        refreshOrders();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('storage', handleStorage);
    };
  }, [currentView, currentUser, isLoading, refreshOrders]);

  const handleOrderCreated = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    setSelectedOrderId(newOrder.id);
  };

  const handleOrderUpdated = (updatedOrder: Order) => {
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === updatedOrder.id);
      const next = exists
        ? prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
        : [updatedOrder, ...prev];
      saveLocalOrders(next);
      return next;
    });
    if (activeCustomerOrder?.id === updatedOrder.id) {
      setActiveCustomerOrder(updatedOrder);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('patah_merchant_user');
    setCurrentUser(null);
  };

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    const query = manualLookupId.trim().toLowerCase();
    if (!query) return;

    const found = orders.find(
      (o) =>
        o.id.toLowerCase() === query ||
        o.orderNumber.toLowerCase() === query ||
        o.customerPhone.includes(query)
    );

    if (found) {
      setActiveCustomerOrder(found);
      setSelectedOrderId(found.id);
    } else {
      setLookupError('Order not found. Please verify the order number or phone number.');
    }
  };

  const activeOrder =
    (currentView === 'customer' || currentView === 'rider') && activeCustomerOrder
      ? activeCustomerOrder
      : orders.find((o) => o.id === selectedOrderId) || (currentView === 'merchant' ? orders[0] : null);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased selection:bg-[#01411C] selection:text-white">
      {/* Navbar for logged-in merchant */}
      {currentView === 'merchant' && currentUser && (
        <Navbar
          orderCount={orders.length}
          currentUser={currentUser}
          onNewOrder={() => setIsNewOrderModalOpen(true)}
          onSignOut={handleSignOut}
        />
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-2">
              <span className="w-8 h-8 rounded bg-[#01411C] text-white font-black text-sm flex items-center justify-center shadow-xs">
                P
              </span>
              <p className="text-xs font-mono text-slate-600">Loading PATAH...</p>
            </div>
          </div>
        ) : currentView === 'customer' && activeOrder ? (
          <CustomerAssistView
            order={activeOrder}
            onAssistanceCompleted={(updated) => {
              handleOrderUpdated(updated);
            }}
            onBackToMerchant={() => {
              setCurrentView('merchant');
              window.history.pushState({}, '', window.location.pathname);
            }}
          />
        ) : currentView === 'customer' && !activeOrder ? (
          /* Customer lookup fallback if link is opened without embedded order data */
          <div className="min-h-screen bg-white py-8 px-4 flex justify-center items-center">
            <div className="w-full max-w-md bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">Confirm Delivery Location</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your order number (e.g. PT-1001) or phone number to open your doorstep confirmation form.
                </p>
              </div>

              <form onSubmit={handleManualLookup} className="space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualLookupId}
                    onChange={(e) => setManualLookupId(e.target.value)}
                    placeholder="Order # (e.g. PT-1001) or Phone"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>

                {lookupError && (
                  <p className="text-xs text-red-700 bg-red-50 px-2.5 py-1.5 rounded border border-red-200">
                    {lookupError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-[#01411C] hover:bg-[#013215] text-white text-xs font-semibold py-2.5 rounded transition-colors cursor-pointer"
                >
                  Open Delivery Form
                </button>
              </form>
            </div>
          </div>
        ) : currentView === 'rider' && activeOrder ? (
          <RiderScanView
            order={activeOrder}
            onStatusUpdated={(updated) => {
              handleOrderUpdated(updated);
            }}
            onBackToMerchant={() => {
              setCurrentView('merchant');
              window.history.pushState({}, '', window.location.pathname);
            }}
          />
        ) : currentView === 'rider' && !activeOrder ? (
          /* Rider scan lookup if order is missing or scanning an older barcode */
          <div className="min-h-screen bg-slate-100 py-8 px-4 flex justify-center items-center">
            <div className="w-full max-w-md bg-white rounded border border-slate-300 p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-[#01411C] text-white font-black text-xs flex items-center justify-center">
                  P
                </span>
                <h2 className="text-sm font-bold text-slate-900">Rider Delivery Assistance</h2>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-[#01411C] space-y-1">
                <p className="font-bold">Lookup Doorstep Directions</p>
                <p className="text-[11px] text-slate-600">
                  Enter the order reference printed on the parcel sticker (e.g. PT-1001) or customer phone number:
                </p>
              </div>

              <form onSubmit={handleManualLookup} className="space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualLookupId}
                    onChange={(e) => setManualLookupId(e.target.value)}
                    placeholder="Enter Order # (e.g. PT-1001) or Phone"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded border border-slate-300 focus:outline-none focus:border-[#01411C] bg-white"
                  />
                </div>

                {lookupError && (
                  <p className="text-xs text-red-700 bg-red-50 px-2.5 py-1.5 rounded border border-red-200">
                    {lookupError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-[#01411C] hover:bg-[#002d13] text-white text-xs font-bold py-2 rounded transition-colors cursor-pointer"
                >
                  Lookup Parcel Directions
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200 text-center">
                <button
                  onClick={() => {
                    setCurrentView('merchant');
                    window.history.pushState({}, '', window.location.pathname);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Go to Merchant Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : !currentUser ? (
          /* Merchant is not logged in: Show Login / Signup Screen */
          <AuthScreen onLogin={(user) => setCurrentUser(user)} />
        ) : (
          /* Merchant is logged in: Show Merchant Dashboard */
          <MerchantDashboard
            orders={orders}
            onOrderCreated={handleOrderCreated}
            onOrderUpdated={handleOrderUpdated}
            onRefresh={refreshOrders}
            isNewOrderModalOpen={isNewOrderModalOpen}
            setIsNewOrderModalOpen={setIsNewOrderModalOpen}
          />
        )}
      </main>
    </div>
  );
}
