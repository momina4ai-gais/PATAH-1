import React, { useState, useEffect } from 'react';
import { Order } from './types';
import { fetchOrders, fetchOrderById } from './lib/api';
import { Navbar } from './components/Navbar';
import { MerchantDashboard } from './components/MerchantDashboard';
import { CustomerAssistView } from './components/CustomerAssistView';
import { RiderScanView } from './components/RiderScanView';

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'merchant' | 'customer' | 'rider'>('merchant');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [activeCustomerOrder, setActiveCustomerOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState<boolean>(false);

  // Initialize from URL query parameters (e.g. customer clicking link, or rider scanning QR code)
  useEffect(() => {
    async function initApp() {
      setIsLoading(true);
      const fetchedOrders = await fetchOrders();
      setOrders(fetchedOrders);

      const params = new URLSearchParams(window.location.search);
      const flow = params.get('flow');
      const orderId = params.get('orderId');

      if (orderId) {
        setSelectedOrderId(orderId);
        // Find in loaded list or fetch directly
        const targetOrder = fetchedOrders.find((o) => o.id === orderId);
        if (targetOrder) {
          setActiveCustomerOrder(targetOrder);
        } else {
          const directFetch = await fetchOrderById(orderId);
          if (directFetch) setActiveCustomerOrder(directFetch);
        }
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

  const handleOrderCreated = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    setSelectedOrderId(newOrder.id);
  };

  const handleOrderUpdated = (updatedOrder: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    if (activeCustomerOrder?.id === updatedOrder.id) {
      setActiveCustomerOrder(updatedOrder);
    }
  };

  const activeOrder =
    (currentView === 'customer' || currentView === 'rider') && activeCustomerOrder
      ? activeCustomerOrder
      : orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased selection:bg-slate-900 selection:text-white">
      {/* Navbar is strictly the clean Merchant header */}
      {currentView === 'merchant' && (
        <Navbar
          orderCount={orders.length}
          onNewOrder={() => setIsNewOrderModalOpen(true)}
        />
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-2">
              <span className="w-6 h-6 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                P
              </span>
              <p className="text-xs font-mono text-slate-500">Loading PATAH...</p>
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
        ) : (
          <MerchantDashboard
            orders={orders}
            onOrderCreated={handleOrderCreated}
            onOrderUpdated={handleOrderUpdated}
            isNewOrderModalOpen={isNewOrderModalOpen}
            setIsNewOrderModalOpen={setIsNewOrderModalOpen}
          />
        )}
      </main>
    </div>
  );
}
