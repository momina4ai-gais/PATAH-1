import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import QRCode from 'qrcode';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Gemini client initialization on server with User-Agent telemetry
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

export interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
}

export interface DeliveryPin {
  lat: number;
  lng: number;
  accuracy?: number;
  landmarkLabel?: string;
  submittedAt: string;
}

export interface VoiceNoteData {
  audioBase64?: string;
  audioMimeType?: string;
  durationSeconds: number;
  transcript: string;
  englishTranslation?: string;
  isValidDirections: boolean;
  landmarks: string[];
  feedback: string;
  verifiedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  chatPlatform: 'WhatsApp' | 'Instagram' | 'SMS' | 'Other';
  rawOrderText: string;
  items: OrderItem[];
  deliveryAddress: string;
  city: string;
  totalAmount: number;
  currency: string;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'INVALID_AUDIO' | 'DISPATCHED' | 'DELIVERED';
  pin?: DeliveryPin;
  voiceNote?: VoiceNoteData;
  assistanceToken: string;
  createdAt: string;
  updatedAt: string;
  merchantNotes?: string;
}

// In-memory data store for merchant orders
const orders: Map<string, Order> = new Map();

// -------------------------------------------------------------
// AI Order Parsing API (Task 1: Raw chat message to structured fields)
// -------------------------------------------------------------
app.post('/api/parse-order', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({ error: 'Order text is required.' });
    }

    if (ai) {
      try {
        const prompt = `You are the AI Order Parser for PATAH delivery assistant.
Extract structured order information from this raw customer chat text (which may be in English, Urdu, Roman Urdu, or mixed chat style).
Return ONLY a JSON object conforming to this schema:
{
  "customerName": string,
  "customerPhone": string,
  "items": [
    { "name": string, "quantity": number, "price": number or null }
  ],
  "deliveryAddress": string,
  "city": string,
  "totalAmount": number or null,
  "currency": string (e.g. "PKR", "USD", "AED", "INR", default "PKR" if unknown),
  "chatPlatform": "WhatsApp" | "Instagram" | "SMS" | "Other"
}

If a value is not found, leave a reasonable default or empty string. Do not hallucinate fake phone numbers if none exists.
Raw Customer Message:
"""${rawText}"""`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        return res.json({ success: true, parsed });
      } catch (geminiError: any) {
        console.warn('Gemini parse error, falling back to heuristic parser:', geminiError?.message);
      }
    }

    // High quality offline heuristic fallback parser
    const fallbackParsed = fallbackParseOrderText(rawText);
    return res.json({ success: true, parsed: fallbackParsed, fallback: true });
  } catch (error: any) {
    console.error('Error parsing order:', error);
    res.status(500).json({ error: error.message || 'Failed to parse order' });
  }
});

// Heuristic fallback parser
function fallbackParseOrderText(text: string) {
  // Extract phone number (e.g. 03001234567, +92 300 1234567, 03xx-xxxxxxx)
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}|\b03\d{2}[-.\s]?\d{7}\b/);
  const customerPhone = phoneMatch ? phoneMatch[0].trim() : '';

  // Extract name: look for Name: XYZ or Salam XYZ or common patterns
  let customerName = '';
  const nameLabelMatch = text.match(/(?:name|naam|customer|from|naam hai)[:\s]+([a-zA-Z\s]{3,25})/i);
  if (nameLabelMatch) {
    customerName = nameLabelMatch[1].trim();
  } else {
    // Try to find capitalized name words
    const words = text.split(/[\n,]/);
    for (const w of words) {
      const clean = w.trim();
      if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(clean)) {
        customerName = clean;
        break;
      }
    }
    if (!customerName) customerName = 'Customer';
  }

  // Extract City
  let city = 'Lahore';
  const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Dubai', 'Abu Dhabi'];
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
      city = c;
      break;
    }
  }

  // Address
  let deliveryAddress = '';
  const addressMatch = text.match(/(?:address|pata|deliver to|location|ghar)[:\s]+([^,\n]+(?:,[^,\n]+){0,3})/i);
  if (addressMatch) {
    deliveryAddress = addressMatch[1].trim();
  } else {
    deliveryAddress = text.split('\n').find(l => /(?:house|flat|street|sector|phase|block|road|mohallah|gali)/i.test(l))?.trim() || 'Address as specified in chat';
  }

  // Items
  const items: OrderItem[] = [];
  const lines = text.split(/[\n;]/);
  for (const line of lines) {
    const qtyMatch = line.match(/(\d+)\s*(?:x|pcs|pieces|items|pair|pack)?\s+([a-zA-Z0-9\s-]{3,35})/i) ||
                     line.match(/([a-zA-Z0-9\s-]{3,35})\s*(?:x|\*)\s*(\d+)/i);
    if (qtyMatch) {
      const isQtyFirst = !isNaN(parseInt(qtyMatch[1], 10));
      const qty = parseInt(isQtyFirst ? qtyMatch[1] : qtyMatch[2], 10);
      const name = (isQtyFirst ? qtyMatch[2] : qtyMatch[1]).trim();
      if (name.length > 2 && !/(?:total|rs|pkr|call|phone|bhai|salam)/i.test(name)) {
        items.push({ name, quantity: qty > 0 ? qty : 1 });
      }
    }
  }

  if (items.length === 0) {
    items.push({ name: 'Standard Parcel Order', quantity: 1 });
  }

  // Total amount
  const amountMatch = text.match(/(?:total|rs\.?|pkr|amount)[:\s]*([0-9,]+)/i);
  const totalAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 0;

  return {
    customerName,
    customerPhone,
    items,
    deliveryAddress,
    city,
    totalAmount,
    currency: 'PKR',
    chatPlatform: text.toLowerCase().includes('insta') ? 'Instagram' : 'WhatsApp',
  };
}

// -------------------------------------------------------------
// Voice Note Validity & Transcription Checker (Task 2)
// Evaluates whether audio transcript gives real door-finding directions
// or is silence, background noise, or unrelated speech
// -------------------------------------------------------------
app.post('/api/verify-voice', async (req, res) => {
  try {
    const { transcript, audioBase64 } = req.body;
    const cleanTranscript = (transcript || '').trim();

    if (!cleanTranscript && !audioBase64) {
      return res.status(400).json({
        isValid: false,
        feedback: 'No voice audio or transcript was received. Please record your voice note describing how to reach your door.',
      });
    }

    let activeTranscript = cleanTranscript;

    // If Gemini is available, we evaluate navigation landmarks & validity
    if (ai) {
      try {
        const prompt = `You are the PATAH Voice Note Directions Verifier for courier riders.
Customers record a short voice note describing how to find their doorstep (e.g. "blue gate, behind the mosque, second house", or in Urdu "gali number 3 mein pehla safaid darwaza").
The voice note is COMPULSORY and serves as:
1. Proof of genuine customer commitment/intent.
2. Concrete navigation landmarks for delivery riders.

Evaluate this voice note transcript:
"""${activeTranscript}"""

Determine:
1. Is it a VALID directional instruction? (isValid: boolean)
   - It is VALID if it mentions at least one concrete physical cue or landmark (e.g., gate color, floor, turn, mosque, shop, tree, road, corner, opposite, next to, bell, parking).
   - It is INVALID if it is pure silence, background gibberish, filler words only ("hello hello", "theek hai bhai", "ok", "haan haan"), or unrelated chatter.
2. Extract landmarks identified (array of strings, e.g. ["Blue gate", "Behind mosque", "Second house"]).
3. Provide an English translation if in Urdu/Hindi/other language.
4. Provide constructive feedback (string) explaining why it was accepted or what specific detail is missing to prompt a re-record.

Return ONLY JSON:
{
  "isValid": boolean,
  "confidence": number,
  "landmarks": string[],
  "englishTranslation": string,
  "feedback": string
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const result = JSON.parse(response.text || '{}');
        return res.json({
          isValid: Boolean(result.isValid),
          confidence: result.confidence ?? (result.isValid ? 0.95 : 0.2),
          landmarks: Array.isArray(result.landmarks) ? result.landmarks : [],
          englishTranslation: result.englishTranslation || activeTranscript,
          originalTranscript: activeTranscript,
          feedback: result.feedback || (result.isValid ? 'Valid doorstep directions verified!' : 'Please describe your door, gate color, or landmark.'),
        });
      } catch (geminiErr: any) {
        console.warn('Gemini verify error, falling back to heuristic direction checker:', geminiErr?.message);
      }
    }

    // Heuristic direction validation fallback
    const heuristic = evaluateDirectionsHeuristic(activeTranscript);
    return res.json({
      isValid: heuristic.isValid,
      confidence: heuristic.confidence,
      landmarks: heuristic.landmarks,
      englishTranslation: activeTranscript,
      originalTranscript: activeTranscript,
      feedback: heuristic.feedback,
      fallback: true,
    });
  } catch (error: any) {
    console.error('Error verifying voice note:', error);
    res.status(500).json({ error: error.message || 'Failed to verify voice note' });
  }
});

function evaluateDirectionsHeuristic(transcript: string) {
  const t = transcript.toLowerCase();

  // Directional and physical landmark keywords (English + Roman Urdu)
  const landmarkKeywords = [
    'gate', 'door', 'darwaza', 'masjid', 'mosque', 'gali', 'street', 'house', 'makan', 'flat', 'apartment',
    'floor', 'manzil', 'corner', 'kona', 'opposite', 'samnay', 'behind', 'peechay', 'next to', 'saath',
    'left', 'right', 'baayein', 'daayein', 'seedha', 'straight', 'shop', 'dukan', 'tree', 'darakht',
    'white', 'black', 'blue', 'green', 'safaid', 'neela', 'kala', 'peela', 'yellow', 'bell', 'ghanti',
    'park', 'school', 'hospital', 'bakery', 'chowk', 'roundabout', 'pillar', 'car', 'stairs', 'seedhiyan'
  ];

  const matched = landmarkKeywords.filter(k => t.includes(k));
  const wordCount = transcript.trim().split(/\s+/).length;

  if (wordCount < 3 || matched.length === 0) {
    return {
      isValid: false,
      confidence: 0.2,
      landmarks: [],
      feedback: 'The recording is too short or lacks specific doorstep landmarks. Please mention your gate color, nearby landmark, or street turn.',
    };
  }

  const landmarksFormatted = matched.map(m => m.charAt(0).toUpperCase() + m.slice(1));

  return {
    isValid: true,
    confidence: Math.min(0.6 + matched.length * 0.15, 0.98),
    landmarks: landmarksFormatted,
    feedback: `Doorstep landmarks verified: ${landmarksFormatted.join(', ')}.`,
  };
}

// -------------------------------------------------------------
// Orders CRUD API
// -------------------------------------------------------------
app.get('/api/orders', (req, res) => {
  const allOrders = Array.from(orders.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ orders: allOrders });
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

app.post('/api/orders', (req, res) => {
  const body = req.body;
  const id = 'ord-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const orderNumber = 'PT-' + Math.floor(1000 + Math.random() * 9000);
  const assistanceToken = 'tok-' + Math.random().toString(36).substring(2, 12);

  const newOrder: Order = {
    id,
    orderNumber,
    customerName: body.customerName || 'Customer',
    customerPhone: body.customerPhone || '',
    chatPlatform: body.chatPlatform || 'WhatsApp',
    rawOrderText: body.rawOrderText || '',
    items: Array.isArray(body.items) && body.items.length > 0 ? body.items : [{ name: 'Parcel item', quantity: 1 }],
    deliveryAddress: body.deliveryAddress || '',
    city: body.city || '',
    totalAmount: Number(body.totalAmount) || 0,
    currency: body.currency || 'PKR',
    status: 'PENDING_CONFIRMATION',
    assistanceToken,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    merchantNotes: body.merchantNotes || '',
  };

  orders.set(id, newOrder);
  res.status(201).json({ success: true, order: newOrder });
});

// Customer submits location pin and voice note directions
app.patch('/api/orders/:id/confirm', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const { pin, voiceNote } = req.body;

  if (!pin || typeof pin.lat !== 'number' || typeof pin.lng !== 'number') {
    return res.status(400).json({ error: 'Map pin coordinates are mandatory.' });
  }

  if (!voiceNote || !voiceNote.transcript || !voiceNote.isValidDirections) {
    return res.status(400).json({ error: 'A valid voice note describing door directions is mandatory to confirm.' });
  }

  order.pin = {
    lat: pin.lat,
    lng: pin.lng,
    accuracy: pin.accuracy || 10,
    landmarkLabel: pin.landmarkLabel || '',
    submittedAt: new Date().toISOString(),
  };

  order.voiceNote = {
    audioBase64: voiceNote.audioBase64 || '',
    audioMimeType: voiceNote.audioMimeType || 'audio/webm',
    durationSeconds: voiceNote.durationSeconds || 5,
    transcript: voiceNote.transcript,
    englishTranslation: voiceNote.englishTranslation || voiceNote.transcript,
    isValidDirections: Boolean(voiceNote.isValidDirections),
    landmarks: Array.isArray(voiceNote.landmarks) ? voiceNote.landmarks : [],
    feedback: voiceNote.feedback || 'Directions verified',
    verifiedAt: new Date().toISOString(),
  };

  order.status = 'CONFIRMED';
  order.updatedAt = new Date().toISOString();
  orders.set(order.id, order);

  res.json({ success: true, order });
});

// Update order status (DISPATCHED, DELIVERED, etc.)
app.patch('/api/orders/:id/status', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const { status } = req.body;
  if (['PENDING_CONFIRMATION', 'CONFIRMED', 'INVALID_AUDIO', 'DISPATCHED', 'DELIVERED'].includes(status)) {
    order.status = status;
    order.updatedAt = new Date().toISOString();
    orders.set(order.id, order);
    return res.json({ success: true, order });
  }
  res.status(400).json({ error: 'Invalid status' });
});

// QR Code generator helper API
app.get('/api/qr/:orderId', async (req, res) => {
  try {
    const order = orders.get(req.params.orderId);
    if (!order) {
      return res.status(404).send('Order not found');
    }
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol;
    const riderUrl = `${protocol}://${host}?flow=rider&orderId=${order.id}`;

    const qrDataUrl = await QRCode.toDataURL(riderUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    res.json({ qrDataUrl, riderUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Vite middleware integration for development & static for prod
// -------------------------------------------------------------
async function setupServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[PATAH Server] Listening at http://0.0.0.0:${port}`);
  });
}

setupServer().catch(err => {
  console.error('Failed to start server:', err);
});
