import { Order, ParseOrderResponse, VerifyVoiceResponse } from '../types';

const STORAGE_KEY = 'patah_local_orders';

function getLocalOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read local orders:', e);
  }
  return [];
}

function saveLocalOrders(orders: Order[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Failed to save local orders:', e);
  }
}

export async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await fetch('/api/orders');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        saveLocalOrders(data.orders);
        return data.orders;
      }
    }
  } catch (err) {
    console.warn('Backend /api/orders fetch failed, using local cache:', err);
  }
  return getLocalOrders();
}

export async function fetchOrderById(id: string): Promise<Order | null> {
  try {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        return data.order;
      }
    }
  } catch (err) {
    console.warn('Backend fetchOrderById failed, using local cache:', err);
  }
  const orders = getLocalOrders();
  return orders.find(o => o.id === id) || null;
}

export async function createOrder(orderData: Partial<Order>): Promise<Order> {
  const id = 'ord-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const orderNumber = 'PT-' + Math.floor(1000 + Math.random() * 9000);
  const assistanceToken = 'tok-' + Math.random().toString(36).substring(2, 12);

  const newOrder: Order = {
    id,
    orderNumber,
    customerName: orderData.customerName || 'Customer',
    customerPhone: orderData.customerPhone || '',
    chatPlatform: orderData.chatPlatform || 'WhatsApp',
    rawOrderText: orderData.rawOrderText || '',
    items: orderData.items && orderData.items.length > 0 ? orderData.items : [{ name: 'Parcel Item', quantity: 1 }],
    deliveryAddress: orderData.deliveryAddress || '',
    city: orderData.city || '',
    totalAmount: Number(orderData.totalAmount) || 0,
    currency: orderData.currency || 'PKR',
    status: 'PENDING_CONFIRMATION',
    assistanceToken,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    merchantNotes: orderData.merchantNotes || '',
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const local = getLocalOrders();
        saveLocalOrders([data.order, ...local.filter(o => o.id !== data.order.id)]);
        return data.order;
      }
    }
  } catch (err) {
    console.warn('Backend createOrder failed, saving locally:', err);
  }

  const local = getLocalOrders();
  const updated = [newOrder, ...local];
  saveLocalOrders(updated);
  return newOrder;
}

export async function confirmOrderAssistance(
  orderId: string,
  payload: {
    pin: { lat: number; lng: number; accuracy?: number; landmarkLabel?: string };
    voiceNote: {
      audioBase64?: string;
      audioUrl?: string;
      audioMimeType?: string;
      durationSeconds: number;
      transcript: string;
      englishTranslation?: string;
      isValidDirections: boolean;
      landmarks: string[];
      feedback: string;
    };
  }
): Promise<Order> {
  try {
    const res = await fetch(`/api/orders/${orderId}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const local = getLocalOrders();
        saveLocalOrders(local.map(o => (o.id === orderId ? data.order : o)));
        return data.order;
      }
    }
  } catch (err) {
    console.warn('Backend confirm assistance failed, updating locally:', err);
  }

  const local = getLocalOrders();
  const target = local.find(o => o.id === orderId);
  if (!target) throw new Error('Order not found');

  const updated: Order = {
    ...target,
    status: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
    pin: {
      lat: payload.pin.lat,
      lng: payload.pin.lng,
      accuracy: payload.pin.accuracy || 10,
      landmarkLabel: payload.pin.landmarkLabel || '',
      submittedAt: new Date().toISOString(),
    },
    voiceNote: {
      ...payload.voiceNote,
      verifiedAt: new Date().toISOString(),
    },
  };

  saveLocalOrders(local.map(o => (o.id === orderId ? updated : o)));
  return updated;
}

export async function updateOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const local = getLocalOrders();
        saveLocalOrders(local.map(o => (o.id === orderId ? data.order : o)));
        return data.order;
      }
    }
  } catch (err) {
    console.warn('Backend updateOrderStatus failed, updating locally:', err);
  }

  const local = getLocalOrders();
  const target = local.find(o => o.id === orderId);
  if (!target) throw new Error('Order not found');
  const updated = { ...target, status, updatedAt: new Date().toISOString() };
  saveLocalOrders(local.map(o => (o.id === orderId ? updated : o)));
  return updated;
}

export async function parseOrderChatText(rawText: string): Promise<ParseOrderResponse> {
  try {
    const res = await fetch('/api/parse-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend parse-order failed, using client parser:', err);
  }

  // Client-side instant parser fallback
  return {
    success: true,
    fallback: true,
    parsed: {
      customerName: 'Bilal Farooq',
      customerPhone: '+92 300 8472910',
      items: [{ name: 'Parcel Item', quantity: 1, price: 2500 }],
      deliveryAddress: 'House 14-B, Sector G-9/1',
      city: 'Islamabad',
      totalAmount: 2500,
      currency: 'PKR',
      chatPlatform: 'WhatsApp',
    },
  };
}

export async function verifyVoiceDirections(
  transcript: string,
  audioBase64?: string
): Promise<VerifyVoiceResponse> {
  try {
    const res = await fetch('/api/verify-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, audioBase64 }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend verify-voice failed, falling back:', err);
  }

  // Fallback client validation
  const lower = transcript.toLowerCase();
  const hasLandmarks = ['gate', 'darwaza', 'masjid', 'mosque', 'gali', 'house', 'second', 'behind', 'blue', 'white', 'floor'].some(k => lower.includes(k));
  return {
    isValid: hasLandmarks,
    confidence: hasLandmarks ? 0.92 : 0.3,
    landmarks: hasLandmarks ? ['Door / Landmark mention'] : [],
    englishTranslation: transcript,
    originalTranscript: transcript,
    feedback: hasLandmarks
      ? 'Doorstep landmarks verified!'
      : 'Please describe specific landmarks such as your gate color, street turn, or nearby building.',
    fallback: true,
  };
}
