import React, { useState } from 'react';
import { Order, OrderItem } from '../types';
import { createOrder, parseOrderChatText, updateOrderStatus } from '../lib/api';
import { PrintLabelModal } from './PrintLabelModal';
import {
  Plus,
  Search,
  Copy,
  Check,
  Printer,
  QrCode,
  Volume2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  MessageSquare,
  ArrowRight,
  Package,
  ExternalLink,
} from 'lucide-react';

interface MerchantDashboardProps {
  orders: Order[];
  onOrderCreated: (order: Order) => void;
  onOrderUpdated: (order: Order) => void;
  isNewOrderModalOpen: boolean;
  setIsNewOrderModalOpen: (open: boolean) => void;
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({
  orders,
  onOrderCreated,
  onOrderUpdated,
  isNewOrderModalOpen,
  setIsNewOrderModalOpen,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activePrintOrder, setActivePrintOrder] = useState<Order | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // New Order Form State
  const [rawChatText, setRawChatText] = useState('');
  const [isParsingAI, setIsParsingAI] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [city, setCity] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [currency, setCurrency] = useState('PKR');
  const [chatPlatform, setChatPlatform] = useState<Order['chatPlatform']>('WhatsApp');
  const [items, setItems] = useState<OrderItem[]>([{ name: '', quantity: 1, price: 0 }]);
  const [merchantNotes, setMerchantNotes] = useState('');

  // AI Chat Extraction
  const handleExtractWithAI = async () => {
    if (!rawChatText.trim()) return;
    setIsParsingAI(true);
    try {
      const response = await parseOrderChatText(rawChatText);
      if (response && response.parsed) {
        const p = response.parsed;
        if (p.customerName) setCustomerName(p.customerName);
        if (p.customerPhone) setCustomerPhone(p.customerPhone);
        if (p.deliveryAddress) setDeliveryAddress(p.deliveryAddress);
        if (p.city) setCity(p.city);
        if (p.totalAmount) setTotalAmount(p.totalAmount);
        if (p.currency) setCurrency(p.currency);
        if (p.chatPlatform) setChatPlatform(p.chatPlatform);
        if (Array.isArray(p.items) && p.items.length > 0) {
          setItems(p.items);
        }
      }
    } catch (err) {
      console.error('Parse error:', err);
    } finally {
      setIsParsingAI(false);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { name: '', quantity: 1, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);

    if (field === 'price' || field === 'quantity') {
      const sum = updated.reduce((acc, curr) => acc + (curr.price || 0) * (curr.quantity || 1), 0);
      if (sum > 0) setTotalAmount(sum);
    }
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) {
      alert('Please provide customer name and phone number.');
      return;
    }

    const validItems = items.filter((i) => i.name.trim().length > 0);
    const newOrderData: Partial<Order> = {
      customerName,
      customerPhone,
      deliveryAddress,
      city,
      totalAmount,
      currency,
      chatPlatform,
      rawOrderText: rawChatText,
      items: validItems.length > 0 ? validItems : [{ name: 'Parcel item', quantity: 1 }],
      merchantNotes,
    };

    const created = await createOrder(newOrderData);
    onOrderCreated(created);
    setIsNewOrderModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setRawChatText('');
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setCity('');
    setTotalAmount(0);
    setItems([{ name: '', quantity: 1, price: 0 }]);
    setMerchantNotes('');
  };

  const getCustomerLink = (order: Order) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}?flow=customer&orderId=${order.id}&token=${order.assistanceToken}`;
  };

  const handleCopyCustomerLink = (order: Order) => {
    const link = getCustomerLink(order);
    navigator.clipboard.writeText(link);
    setCopiedOrderId(order.id);
    setTimeout(() => setCopiedOrderId(null), 2500);
  };

  const handleOpenCustomerWhatsApp = (order: Order) => {
    const link = getCustomerLink(order);
    const cleanPhone = order.customerPhone.replace(/[^0-9+]/g, '');
    const whatsAppPhone = cleanPhone.startsWith('+')
      ? cleanPhone.replace('+', '')
      : cleanPhone.startsWith('03')
      ? '92' + cleanPhone.substring(1)
      : cleanPhone;

    const msg = encodeURIComponent(
      `Salam ${order.customerName}! Thank you for your order #${order.orderNumber}.
To make sure your courier rider finds your exact door without delays, please drop a pin on the map and record a quick voice note here:
${link}`
    );

    window.open(`https://wa.me/${whatsAppPhone}?text=${msg}`, '_blank');
  };

  const handleMarkDispatched = async (order: Order) => {
    const nextStatus = order.status === 'DISPATCHED' ? 'CONFIRMED' : 'DISPATCHED';
    const updated = await updateOrderStatus(order.id, nextStatus);
    onOrderUpdated(updated);
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerPhone.includes(searchTerm) ||
      o.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.items.some((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return o.status === statusFilter;
  });

  const pendingCount = orders.filter((o) => o.status === 'PENDING_CONFIRMATION').length;
  const qrReadyCount = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'DISPATCHED' || o.status === 'DELIVERED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-slate-900">Orders</h1>
          <span className="text-xs text-slate-500 font-mono">({orders.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewOrderModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-3.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Order
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-2.5 rounded border border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search orders by number, customer, phone, city..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'ALL', label: `All (${orders.length})` },
            { id: 'PENDING_CONFIRMATION', label: `Awaiting Input (${pendingCount})` },
            { id: 'CONFIRMED', label: `QR Ready (${qrReadyCount})` },
            { id: 'DISPATCHED', label: 'Dispatched' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div>
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded border border-slate-300 p-12 text-center space-y-3">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-800">No orders found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {orders.length === 0
                  ? "Click '+ New Order' to enter an order manually or paste a customer's WhatsApp chat to extract fields."
                  : 'No orders match your search criteria.'}
              </p>
            </div>
            {orders.length === 0 && (
              <button
                onClick={() => setIsNewOrderModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Order
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const isConfirmed = order.status === 'CONFIRMED' || order.status === 'DISPATCHED' || order.status === 'DELIVERED';
              const customerLink = getCustomerLink(order);

              return (
                <div
                  key={order.id}
                  className="bg-white rounded border border-slate-300 hover:border-slate-400 p-4 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left Column: Order details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900">
                        {order.orderNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                        {order.chatPlatform}
                      </span>

                      {/* Status Badges */}
                      {isConfirmed ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          QR Ready (Pin and Voice Verified)
                        </span>
                      ) : order.status === 'INVALID_AUDIO' ? (
                        <span className="text-[10px] font-bold text-red-800 bg-red-50 border border-red-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-red-700" />
                          Unclear Voice Note (Re-record Prompted)
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          Awaiting Customer Confirmation
                        </span>
                      )}

                      {order.status === 'DISPATCHED' && (
                        <span className="text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Truck className="w-3 h-3 text-blue-700" />
                          Dispatched with Courier
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <h3 className="text-xs font-bold text-slate-900">{order.customerName}</h3>
                      <span className="text-xs font-mono text-slate-600">{order.customerPhone}</span>
                      <span className="text-xs text-slate-500">{order.city}</span>
                    </div>

                    <p className="text-xs text-slate-600">
                      {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>

                    <p className="text-[11px] text-slate-500 truncate max-w-lg">
                      {order.deliveryAddress}
                    </p>

                    {/* Confirmed Directions Snapshot */}
                    {order.voiceNote && (
                      <div className="p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 space-y-1 mt-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-emerald-700" /> Door Directions:
                          </span>
                          <span className="font-mono text-slate-500 text-[10px]">
                            {order.voiceNote.durationSeconds}s &bull; GPS: {order.pin?.lat?.toFixed(4)}, {order.pin?.lng?.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-slate-600 italic text-[11px]">
                          "{order.voiceNote.transcript}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Middle Column: Amount */}
                  <div className="text-left lg:text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400 block uppercase font-mono">Amount</span>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {order.currency} {order.totalAmount.toLocaleString()}
                    </span>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex flex-wrap lg:flex-col items-stretch gap-2 flex-shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                    {/* QR Button: Enabled when confirmed, disabled when awaiting customer */}
                    {isConfirmed ? (
                      <button
                        onClick={() => setActivePrintOrder(order)}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Generate QR
                      </button>
                    ) : (
                      <button
                        disabled
                        className="bg-slate-100 text-slate-400 text-xs font-medium px-3 py-1.5 rounded flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-200"
                        title="Enables once the customer drops a map pin and records door directions"
                      >
                        <QrCode className="w-3.5 h-3.5 opacity-40" />
                        Generate QR (Awaiting Input)
                      </button>
                    )}

                    {/* WhatsApp Forwarding & Copy */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenCustomerWhatsApp(order)}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium px-2.5 py-1.5 rounded border border-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Send confirmation link over WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                        Send Link
                      </button>

                      <button
                        onClick={() => handleCopyCustomerLink(order)}
                        className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-2.5 py-1.5 rounded border border-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Copy confirmation link to clipboard"
                      >
                        {copiedOrderId === order.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy Link
                          </>
                        )}
                      </button>
                    </div>

                    {/* Direct link preview for testing */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <a
                        href={customerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-slate-800 underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Customer Link
                      </a>

                      {isConfirmed && (
                        <>
                          <span className="text-slate-300">&bull;</span>
                          <button
                            onClick={() => handleMarkDispatched(order)}
                            className="text-blue-700 hover:text-blue-900 underline cursor-pointer"
                          >
                            {order.status === 'DISPATCHED' ? 'Mark Dispatched' : 'Mark Dispatched'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QR Sticker Print Modal */}
      {activePrintOrder && (
        <PrintLabelModal
          order={activePrintOrder}
          isOpen={Boolean(activePrintOrder)}
          onClose={() => setActivePrintOrder(null)}
          onOpenRiderView={() => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
            window.open(`${origin}?flow=rider&orderId=${activePrintOrder.id}`, '_blank');
          }}
        />
      )}

      {/* Modal: New Order Entry */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded border border-slate-300 shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                  P
                </span>
                <h3 className="font-semibold text-slate-900 text-sm">
                  New Order
                </h3>
              </div>
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="text-slate-500 hover:text-slate-800 p-1 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="p-5 overflow-y-auto space-y-4">
              {/* WhatsApp Message AI Parser */}
              <div className="bg-slate-50 border border-slate-300 rounded p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Paste WhatsApp Message
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Extracts items, phone, and address automatically
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={rawChatText}
                  onChange={(e) => setRawChatText(e.target.value)}
                  placeholder="Paste the customer's raw WhatsApp message here..."
                  className="w-full text-xs p-2.5 rounded border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                />

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleExtractWithAI}
                    disabled={isParsingAI || !rawChatText.trim()}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isParsingAI ? 'Extracting...' : 'Extract Fields with AI'}
                  </button>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Customer Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Written Address
                  </label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Address as given in chat"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Chat Source
                  </label>
                  <select
                    value={chatPlatform}
                    onChange={(e) => setChatPlatform(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="SMS">SMS</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Items</label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-slate-800 font-semibold hover:underline cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1 text-xs px-3 py-1.5 rounded border border-slate-300 focus:outline-none focus:border-slate-800"
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                      }
                      className="w-16 text-xs px-2 py-1.5 rounded border border-slate-300 focus:outline-none focus:border-slate-800 text-center"
                      title="Quantity"
                    />
                    <input
                      type="number"
                      min={0}
                      value={item.price || ''}
                      onChange={(e) =>
                        handleItemChange(idx, 'price', parseInt(e.target.value, 10) || 0)
                      }
                      placeholder="Price"
                      className="w-24 text-xs px-2 py-1.5 rounded border border-slate-300 focus:outline-none focus:border-slate-800 text-right"
                      title="Item Price"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-red-600 text-sm px-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-xs text-slate-600">Total Amount ({currency}):</span>
                  <input
                    type="number"
                    value={totalAmount || ''}
                    onChange={(e) => setTotalAmount(parseInt(e.target.value, 10) || 0)}
                    placeholder="0"
                    className="w-32 text-xs font-bold px-3 py-1.5 rounded border border-slate-300 text-right focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewOrderModalOpen(false)}
                  className="px-3.5 py-1.5 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  Save &amp; Generate Link
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
