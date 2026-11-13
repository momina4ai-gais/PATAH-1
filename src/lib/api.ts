import { Order, ParseOrderResponse, VerifyVoiceResponse } from '../types';
import { romanUrduToUrduScript } from './urduTransliterate';

const STORAGE_KEY = 'patah_local_orders';

export function getLocalOrders(): Order[] {
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

export function saveLocalOrders(orders: Order[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Failed to save local orders:', e);
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to textarea copy below (e.g. iframe Permissions-Policy)
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function fetchServerConfig(): Promise<{ appUrl: string }> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // ignore
  }
  return { appUrl: '' };
}

export function encodeOrderForQR(order: Order): string {
  try {
    const compact = {
      id: order.id,
      no: order.orderNumber,
      nm: order.customerName,
      ph: order.customerPhone,
      ad: order.deliveryAddress,
      ct: order.city,
      am: order.totalAmount,
      cr: order.currency,
      lat: order.pin?.lat,
      lng: order.pin?.lng,
      lbl: order.pin?.landmarkLabel,
      tr: order.voiceNote?.transcript,
      ur: order.voiceNote?.urduTranscript,
      ru: order.voiceNote?.romanUrduTranscript,
      en: order.voiceNote?.englishTranslation,
      sc: order.voiceNote?.durationSeconds,
      lm: order.voiceNote?.landmarks,
      au: (order.voiceNote?.audioUrl && !order.voiceNote.audioUrl.startsWith('blob:'))
        ? order.voiceNote.audioUrl
        : `/api/orders/${order.id}/audio`,
      st: order.status,
      dlv: order.deliveredAt,
    };
    const json = JSON.stringify(compact);
    // Base64 encode for URL safety
    if (typeof window !== 'undefined' && window.btoa) {
      return encodeURIComponent(window.btoa(unescape(encodeURIComponent(json))));
    }
    return encodeURIComponent(Buffer.from(json).toString('base64'));
  } catch (e) {
    console.error('Failed to encode order for QR:', e);
    return '';
  }
}

export function decodeOrderFromQR(d: string): Order | null {
  try {
    let jsonStr = '';
    if (typeof window !== 'undefined' && window.atob) {
      jsonStr = decodeURIComponent(escape(window.atob(decodeURIComponent(d))));
    } else {
      jsonStr = Buffer.from(decodeURIComponent(d), 'base64').toString('utf-8');
    }
    const c = JSON.parse(jsonStr);
    if (!c || !c.id) return null;

    const romanText = c.ru || c.tr || '';
    const urduScript = (c.ur && /[\u0600-\u06FF]/.test(c.ur))
      ? c.ur
      : (romanText ? romanUrduToUrduScript(romanText) : '');

    const restored: Order = {
      id: c.id,
      orderNumber: c.no || 'PT-XXXX',
      customerName: c.nm || 'Customer',
      customerPhone: c.ph || '',
      chatPlatform: 'WhatsApp',
      rawOrderText: '',
      items: [{ name: 'Parcel Item', quantity: 1 }],
      deliveryAddress: c.ad || '',
      city: c.ct || '',
      totalAmount: c.am || 0,
      currency: c.cr || 'PKR',
      status: c.st || 'CONFIRMED',
      assistanceToken: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deliveredAt: c.dlv,
      pin: (c.lat && c.lng && !isNaN(Number(c.lat)) && !isNaN(Number(c.lng))) ? {
        lat: Number(c.lat),
        lng: Number(c.lng),
        accuracy: 10,
        landmarkLabel: c.lbl || 'Customer Doorstep',
        submittedAt: new Date().toISOString(),
      } : undefined,
      voiceNote: c.tr ? {
        transcript: romanText,
        urduTranscript: urduScript,
        romanUrduTranscript: romanText,
        englishTranslation: c.en,
        durationSeconds: c.sc || 7,
        landmarks: Array.isArray(c.lm) ? c.lm : [],
        audioUrl: c.au || `/api/orders/${c.id}/audio`,
        isValidDirections: true,
        feedback: 'Doorstep directions verified',
        verifiedAt: new Date().toISOString(),
      } : undefined,
    };
    return restored;
  } catch (e) {
    console.error('Failed to decode order from QR parameter:', e);
    return null;
  }
}

export async function fetchOrders(): Promise<Order[]> {
  const local = getLocalOrders();
  try {
    const res = await fetch('/api/orders', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        const serverIds = new Set(data.orders.map((o: Order) => o.id));
        const localOnly = local.filter((o) => !serverIds.has(o.id));
        const merged = [...data.orders, ...localOnly];
        saveLocalOrders(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('Backend /api/orders fetch failed, using local cache:', err);
  }
  return local;
}

export async function fetchOrderById(id: string, isQrScan = false): Promise<Order | null> {
  try {
    const res = await fetch(`/api/orders/${id}${isQrScan ? '?qr=1' : ''}`, { cache: 'no-store' });
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
    orderSnapshot?: Order;
    pin: { lat: number; lng: number; accuracy?: number; landmarkLabel?: string };
    voiceNote: {
      audioBase64?: string;
      audioUrl?: string;
      audioMimeType?: string;
      durationSeconds: number;
      transcript: string;
      urduTranscript?: string;
      romanUrduTranscript?: string;
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
        const exists = local.some(o => o.id === orderId);
        saveLocalOrders(
          exists
            ? local.map(o => (o.id === orderId ? data.order : o))
            : [data.order, ...local]
        );
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
      audioUrl: payload.voiceNote.audioBase64 ? `/api/orders/${orderId}/audio` : payload.voiceNote.audioUrl,
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
  const updated: Order = {
    ...target,
    status,
    updatedAt: new Date().toISOString(),
    deliveredAt: status === 'DELIVERED' ? new Date().toISOString() : undefined,
  };
  saveLocalOrders(local.map(o => (o.id === orderId ? updated : o)));
  return updated;
}

export async function parseOrderChatText(rawText: string): Promise<ParseOrderResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/parse-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.parsed) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend parse-order failed or timed out, using client parser:', err);
  }

  // Robust client-side regex fallback parser for Pakistani chat orders
  const phoneMatch = rawText.match(/(?:\+92|0092|92)?[-.\s]?(?:0)?(3\d{2})[-.\s]?(\d{7})\b/) ||
                     rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}/);
  let customerPhone = '';
  if (phoneMatch) {
    if (phoneMatch[1] && phoneMatch[2]) {
      customerPhone = `0${phoneMatch[1]}${phoneMatch[2]}`;
    } else {
      customerPhone = phoneMatch[0].trim();
    }
  }

  let customerName = '';
  const nameLabelMatch = rawText.match(/(?:name|naam|customer|from|client|receiver|bhai mera naam|naam hai)[:\s=]+([a-zA-Z\s]{2,30})/i);
  if (nameLabelMatch) {
    customerName = nameLabelMatch[1].trim();
  } else {
    const salamMatch = rawText.match(/(?:salam|hello|hi)[,\s]+(?:bhai[,\s]+)?(?:main\s+|mera naam\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (salamMatch) {
      customerName = salamMatch[1].trim();
    } else {
      const lines = rawText.split('\n');
      for (const line of lines) {
        const clean = line.trim();
        if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(clean) && !/(?:House|Street|Sector|Phase|Block|Road)/i.test(clean)) {
          customerName = clean;
          break;
        }
      }
    }
  }
  if (!customerName) customerName = 'Customer';

  let city = 'Lahore';
  const cities = [
    'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan',
    'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Hyderabad', 'Sukkur',
    'Bahawalpur', 'Sargodha', 'Abbottabad', 'Mirpur', 'Mardan', 'Gujrat',
    'Sheikhupura', 'Jhelum', 'Wah Cantt', 'Kasur', 'Rahim Yar Khan', 'Okara',
    'Sahiwal', 'Larkana', 'Nawabshah', 'Muzaffarabad', 'Gwadar'
  ];
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(rawText)) {
      city = c;
      break;
    }
  }

  let deliveryAddress = '';
  const addressLabelMatch = rawText.match(/(?:address|pata|deliver to|location|delivery address|ghar ka pata|ghar)[:\s=]+([^,\n]+(?:,[^,\n]+){0,4})/i);
  if (addressLabelMatch) {
    deliveryAddress = addressLabelMatch[1].trim();
  } else {
    const lines = rawText.split('\n');
    const addrLine = lines.find(l =>
      /(?:house|makan|flat|apartment|floor|street|gali|sector|phase|block|road|mohallah|colony|chak|near|behind|opposite|kareeb|chowk)/i.test(l) &&
      !/(?:total|rs\.?|pkr|call|whatsapp|phone)/i.test(l)
    );
    if (addrLine) {
      deliveryAddress = addrLine.trim();
    } else {
      deliveryAddress = 'Doorstep Address as confirmed in chat';
    }
  }

  const amountMatch = rawText.match(/(?:total|amount|bill|cost|cod|price|rs\.?|pkr)[:\s=]*([0-9,]+)/i) ||
                      rawText.match(/([0-9,]+)\s*(?:rs|pkr|\/-)/i);
  const totalAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 0;

  const items: { name: string; quantity: number; price?: number }[] = [];
  const lines = rawText.split(/[\n;]/);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;
    if (/(?:total|rs\.?|pkr|name|naam|phone|address|pata|city|deliver|salam|shukriya)/i.test(cleanLine)) continue;

    const qtyMatch = cleanLine.match(/^(\d+)\s*(?:x|pcs|pieces|items|suit|suits|pair|pack)?\s+([a-zA-Z0-9\s-]{2,40})/i) ||
                     cleanLine.match(/^([a-zA-Z0-9\s-]{2,40})\s*(?:x|\*|-)?\s*(\d+)\s*(?:pcs|pieces|items)?$/i);
    if (qtyMatch) {
      const isQtyFirst = !isNaN(parseInt(qtyMatch[1], 10));
      const qty = parseInt(isQtyFirst ? qtyMatch[1] : qtyMatch[2], 10);
      const name = (isQtyFirst ? qtyMatch[2] : qtyMatch[1]).trim();
      if (name.length > 2) {
        items.push({ name, quantity: qty > 0 ? qty : 1 });
      }
    }
  }

  if (items.length === 0) {
    const itemLabelMatch = rawText.match(/(?:item|order|cheez|product)[:\s=]+([a-zA-Z0-9\s-]{3,40})/i);
    if (itemLabelMatch) {
      items.push({ name: itemLabelMatch[1].trim(), quantity: 1 });
    } else {
      items.push({ name: 'Standard Parcel Order', quantity: 1 });
    }
  }

  const lower = rawText.toLowerCase();
  const chatPlatform = lower.includes('insta') || lower.includes('ig')
    ? 'Instagram'
    : lower.includes('sms')
    ? 'SMS'
    : 'WhatsApp';

  return {
    success: true,
    fallback: true,
    parsed: {
      customerName,
      customerPhone,
      items,
      deliveryAddress,
      city,
      totalAmount,
      currency: 'PKR',
      chatPlatform,
    },
  };
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<{
  displayName: string;
  road?: string;
  suburb?: string;
  city?: string;
}> {
  try {
    const serverRes = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lng}`);
    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data && data.displayName) {
        return data;
      }
    }
  } catch {
    // Fall back to direct Nominatim
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        const addr = data.address || {};
        const road = addr.road || addr.street || addr.neighbourhood || '';
        const suburb = addr.suburb || addr.residential || addr.city_district || '';
        const city = addr.city || addr.town || addr.county || '';
        return {
          displayName: data.display_name,
          road,
          suburb,
          city,
        };
      }
    }
  } catch (err) {
    // ignore
  }
  return {
    displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
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
  const hasLandmarks = ['gate', 'darwaza', 'masjid', 'mosque', 'gali', 'street', 'house', 'makan', 'second', 'doosra', 'behind', 'peechay', 'blue', 'neela', 'white', 'safaid', 'floor', 'manzil'].some(k => lower.includes(k));
  
  const urduTranscript = romanUrduToUrduScript(transcript);
  const romanUrduTranscript = transcript;

  return {
    isValid: hasLandmarks,
    confidence: hasLandmarks ? 0.92 : 0.3,
    landmarks: hasLandmarks ? ['Doorstep / Landmark mention'] : [],
    urduTranscript,
    romanUrduTranscript,
    englishTranslation: transcript,
    originalTranscript: transcript,
    feedback: hasLandmarks
      ? 'Doorstep landmarks verified!'
      : 'The provided note is invalid. It describes the content of the order rather than providing physical landmarks or navigational instructions. Please record a new voice note that includes details like house color, street name, landmarks, or turn-by-turn directions to help the rider find your doorstep.',
    fallback: true,
  };
}
