import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
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
  deliveredAt?: string;
  merchantNotes?: string;
}

// Persistent data store for merchant orders
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');

function loadOrdersFromDisk(): Map<string, Order> {
  const map = new Map<string, Order>();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const order of list) {
          map.set(order.id, order);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load orders from disk:', err);
  }
  return map;
}

function saveOrdersToDisk(map: Map<string, Order>) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(map.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save orders to disk:', err);
  }
}

const orders: Map<string, Order> = loadOrdersFromDisk();

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

        const aiTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timed out')), 3500)
        );

        const response: any = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          }),
          aiTimeout,
        ]);

        const parsed = JSON.parse(response.text || '{}');
        return res.json({ success: true, parsed });
      } catch (geminiError: any) {
        console.warn('Gemini parse error/timeout, falling back to heuristic parser:', geminiError?.message);
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

// Comprehensive heuristic fallback parser for Pakistani chat orders
function fallbackParseOrderText(text: string) {
  // 1. Phone number (Pakistani mobile format: 03001234567, 03xx-xxxxxxx, +92 3xx xxxxxxx)
  const phoneMatch = text.match(/(?:\+92|0092|92)?[-.\s]?(?:0)?(3\d{2})[-.\s]?(\d{7})\b/) ||
                     text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,5}/);
  let customerPhone = '';
  if (phoneMatch) {
    if (phoneMatch[1] && phoneMatch[2]) {
      customerPhone = `0${phoneMatch[1]}${phoneMatch[2]}`;
    } else {
      customerPhone = phoneMatch[0].trim();
    }
  }

  // 2. Customer Name
  let customerName = '';
  const nameLabelMatch = text.match(/(?:name|naam|customer|from|client|receiver|bhai mera naam|naam hai)[:\s=]+([a-zA-Z\s]{2,30})/i);
  if (nameLabelMatch) {
    customerName = nameLabelMatch[1].trim();
  } else {
    // Check for greeting format: "Salam bhai, Ali here" or "Mera naam Usman"
    const salamMatch = text.match(/(?:salam|hello|hi)[,\s]+(?:bhai[,\s]+)?(?:main\s+|mera naam\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (salamMatch) {
      customerName = salamMatch[1].trim();
    } else {
      // Look for first 2-word capitalized line that is not a header
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.trim();
        if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(clean) && !/(?:House|Street|Sector|Phase|Block|Road)/i.test(clean)) {
          customerName = clean;
          break;
        }
      }
    }
  }
  if (!customerName) {
    customerName = 'Customer';
  }

  // 3. City (Pakistani major cities)
  let city = 'Lahore';
  const cities = [
    'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan',
    'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Hyderabad', 'Sukkur',
    'Bahawalpur', 'Sargodha', 'Abbottabad', 'Mirpur', 'Mardan', 'Gujrat',
    'Sheikhupura', 'Jhelum', 'Wah Cantt', 'Kasur', 'Rahim Yar Khan', 'Okara',
    'Sahiwal', 'Larkana', 'Nawabshah', 'Muzaffarabad', 'Gwadar'
  ];
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
      city = c;
      break;
    }
  }

  // 4. Delivery Address
  let deliveryAddress = '';
  const addressLabelMatch = text.match(/(?:address|pata|deliver to|location|delivery address|ghar ka pata|ghar)[:\s=]+([^,\n]+(?:,[^,\n]+){0,4})/i);
  if (addressLabelMatch) {
    deliveryAddress = addressLabelMatch[1].trim();
  } else {
    // Search line containing address indicators
    const lines = text.split('\n');
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

  // 5. Total Amount
  const amountMatch = text.match(/(?:total|amount|bill|cost|cod|price|rs\.?|pkr)[:\s=]*([0-9,]+)/i) ||
                      text.match(/([0-9,]+)\s*(?:rs|pkr|\/-)/i);
  const totalAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 0;

  // 6. Items
  const items: OrderItem[] = [];
  const lines = text.split(/[\n;]/);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;
    if (/(?:total|rs\.?|pkr|name|naam|phone|address|pata|city|deliver|salam|shukriya)/i.test(cleanLine)) continue;

    // e.g. "2 cotton lawn suits", "3x black shirts", "Suit - 2 pcs"
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

  // If no structured item matched, check for item labels like "Item: Black Kurti"
  if (items.length === 0) {
    const itemLabelMatch = text.match(/(?:item|order|cheez|product)[:\s=]+([a-zA-Z0-9\s-]{3,40})/i);
    if (itemLabelMatch) {
      items.push({ name: itemLabelMatch[1].trim(), quantity: 1 });
    } else {
      items.push({ name: 'Standard Parcel Order', quantity: 1 });
    }
  }

  // Determine chat platform
  const lower = text.toLowerCase();
  const chatPlatform = lower.includes('insta') || lower.includes('ig')
    ? 'Instagram'
    : lower.includes('sms')
    ? 'SMS'
    : 'WhatsApp';

  return {
    customerName,
    customerPhone,
    items,
    deliveryAddress,
    city,
    totalAmount,
    currency: 'PKR',
    chatPlatform,
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
        const prompt = `You are the PATAH Voice Note Directions Verifier for courier riders in Pakistan.
Customers record a short voice note describing how to find their doorstep (e.g. "blue gate, behind the mosque, second house", or in Urdu "مسجد کے پیچھے گلی میں نیلا گیٹ دوسرا گھر").
The voice note is COMPULSORY and serves as concrete navigation landmarks for delivery riders.

Evaluate this voice note transcript:
"""${activeTranscript}"""

Determine:
1. Is it a VALID directional instruction? (isValid: boolean)
   - It is VALID if it mentions at least one concrete physical cue or landmark (e.g., gate color, floor, turn, mosque, shop, tree, road, corner, opposite, next to, bell, parking).
   - It is INVALID if it is pure silence, background gibberish, filler words only ("hello hello", "theek hai bhai", "ok", "haan haan"), or unrelated chatter.
2. Provide the transcript in Urdu script (نستعلیق / اردو رسم الخط e.g. "نیلا گیٹ، مسجد کے پیچھے، دوسرا گھر").
3. Provide the transcript in Roman Urdu (e.g. "Neela gate, masjid ke peechay, doosra ghar").
4. Provide an English translation.
5. Extract landmarks identified (array of strings, e.g. ["Blue gate", "Behind mosque", "Second house"]).
6. Provide constructive feedback (string) explaining why it was accepted or what specific detail is missing to prompt a re-record.

Return ONLY JSON:
{
  "isValid": boolean,
  "confidence": number,
  "urduTranscript": string,
  "romanUrduTranscript": string,
  "englishTranslation": string,
  "landmarks": string[],
  "feedback": string
}`;

        const aiTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timed out')), 3500)
        );

        const response: any = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          }),
          aiTimeout,
        ]);

        const result = JSON.parse(response.text || '{}');
        const urduTranscript = (result.urduTranscript && /[\u0600-\u06FF]/.test(result.urduTranscript))
          ? result.urduTranscript
          : transliterateToUrdu(result.urduTranscript || activeTranscript);
        const romanUrduTranscript = result.romanUrduTranscript || activeTranscript;

        return res.json({
          isValid: Boolean(result.isValid),
          confidence: result.confidence ?? (result.isValid ? 0.95 : 0.2),
          landmarks: Array.isArray(result.landmarks) ? result.landmarks : [],
          urduTranscript,
          romanUrduTranscript,
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
      urduTranscript: heuristic.urduTranscript,
      romanUrduTranscript: heuristic.romanUrduTranscript,
      englishTranslation: heuristic.englishTranslation,
      originalTranscript: activeTranscript,
      feedback: heuristic.feedback,
      fallback: true,
    });
  } catch (error: any) {
    console.error('Error verifying voice note:', error);
    res.status(500).json({ error: error.message || 'Failed to verify voice note' });
  }
});

// Real-time voice note transliteration endpoint
app.post('/api/transcribe-voice', (req, res) => {
  const { text } = req.body;
  const roman = (text || '').trim();
  const urdu = transliterateToUrdu(roman);
  res.json({
    urduTranscript: urdu,
    romanUrduTranscript: roman,
  });
});

// Deterministic Roman Urdu to Urdu Script transliteration for directions & landmarks
function transliterateToUrdu(roman: string): string {
  if (!roman) return '';
  if (/[\u0600-\u06FF]/.test(roman)) return roman;

  const dictionary: Record<string, string> = {
    'kuchh meetha': 'کچھ میٹھا',
    'kuch meetha': 'کچھ میٹھا',
    'kuchh': 'کچھ',
    'kuch': 'کچھ',
    'meetha': 'میٹھا',
    'mitha': 'میٹھا',
    'neela gate': 'نیلا گیٹ',
    'blue gate': 'نیلا گیٹ',
    'peela gate': 'پیلا گیٹ',
    'yellow gate': 'پیلا گیٹ',
    'kala gate': 'کالا گیٹ',
    'black gate': 'کالا گیٹ',
    'safaid gate': 'سفید گیٹ',
    'white gate': 'سفید گیٹ',
    'sabz gate': 'سبز گیٹ',
    'green gate': 'سبز گیٹ',
    'masjid ke peechay': 'مسجد کے پیچھے',
    'masjid k peeche': 'مسجد کے پیچھے',
    'masjid ke samnay': 'مسجد کے سامنے',
    'masjid k samne': 'مسجد کے سامنے',
    'masjid ke sath': 'مسجد کے ساتھ',
    'doosra ghar': 'دوسرا گھر',
    'dusra ghar': 'دوسرا گھر',
    'teesra ghar': 'تیسرا گھر',
    'pehla ghar': 'پہلا گھر',
    'gali number': 'گلی نمبر',
    'makan number': 'مکان نمبر',
    'flat number': 'فلیٹ نمبر',
    'daayein': 'دائیں',
    'dayen': 'دائیں',
    'baayein': 'بائیں',
    'bayen': 'بائیں',
    'seedha': 'سیدھا',
    'gate': 'گیٹ',
    'darwaza': 'دروازہ',
    'masjid': 'مسجد',
    'peechay': 'پیچھے',
    'peeche': 'پیچھے',
    'samnay': 'سامنے',
    'samne': 'سامنے',
    'sath': 'ساتھ',
    'saath': 'ساتھ',
    'ghar': 'گھر',
    'makan': 'مکان',
    'makaan': 'مکان',
    'flat': 'فلیٹ',
    'gali': 'گلی',
    'street': 'اسٹریٹ',
    'road': 'روڈ',
    'chowk': 'چوک',
    'kona': 'کونا',
    'dukan': 'دکان',
    'darakht': 'درخت',
    'bell': 'گھنٹی',
    'ghanti': 'گھنٹی',
    'ke': 'کے',
    'k': 'کے',
    'ki': 'کی',
    'ka': 'کا',
    'ko': 'کو',
    'mein': 'میں',
    'me': 'میں',
    'par': 'پر',
    'pe': 'پر',
    'se': 'سے',
    'hai': 'ہے',
    'hain': 'ہیں',
    'aur': 'اور',
    'shukriya': 'شکریہ',
    'salam': 'سلام',
    'bhai': 'بھائی',
    'aana': 'آنا',
    'pata': 'پتہ',
  };

  let lower = roman.toLowerCase();
  for (const [k, v] of Object.entries(dictionary)) {
    const rx = new RegExp(`\\b${k}\\b`, 'gi');
    lower = lower.replace(rx, v);
  }

  // If words remain in Latin, convert phonetically
  const words = lower.split(/(\s+|[.,!?;:]+)/);
  const result = words.map(w => {
    if (/^[\u0600-\u06FF\s.,!?;:\d]+$/.test(w)) return w;
    let clean = w.toLowerCase();
    if (dictionary[clean]) return dictionary[clean];

    // Simple Urdu letter substitution fallback
    const charMap: Record<string, string> = {
      a: 'ا', b: 'ب', p: 'پ', t: 'ت', s: 'س', j: 'ج', c: 'ک',
      h: 'ہ', d: 'د', r: 'ر', z: 'ز', f: 'ف', q: 'ق', k: 'ک',
      g: 'گ', l: 'ل', m: 'م', n: 'ن', w: 'و', y: 'ی', u: 'و',
      i: 'ی', o: 'و', e: 'ے',
    };
    return clean.split('').map(ch => charMap[ch] || ch).join('');
  });

  return result.join('');
}

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
  const urduScript = transliterateToUrdu(transcript);

  if (wordCount < 3 || matched.length === 0) {
    return {
      isValid: false,
      confidence: 0.2,
      landmarks: [],
      urduTranscript: urduScript || transcript,
      romanUrduTranscript: transcript,
      englishTranslation: transcript,
      feedback: 'The provided note is invalid. It describes the content of the order rather than providing physical landmarks or navigational instructions. Please record a new voice note that includes details like house color, street name, landmarks, or turn-by-turn directions to help the rider find your doorstep.',
    };
  }

  const landmarksFormatted = matched.map(m => m.charAt(0).toUpperCase() + m.slice(1));

  return {
    isValid: true,
    confidence: Math.min(0.6 + matched.length * 0.15, 0.98),
    landmarks: landmarksFormatted,
    urduTranscript: urduScript,
    romanUrduTranscript: transcript,
    englishTranslation: transcript,
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
  if (req.query.qr === '1' && order.status === 'DELIVERED') {
    return res.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: '',
        customerPhone: '',
        chatPlatform: order.chatPlatform,
        rawOrderText: '',
        items: [],
        deliveryAddress: '',
        city: order.city,
        totalAmount: 0,
        currency: order.currency,
        status: 'DELIVERED',
        assistanceToken: '',
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        deliveredAt: order.deliveredAt,
      },
    });
  }
  res.json({ order });
});

// Stream customer's actual recorded human voice note
app.get('/api/orders/:id/audio', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order || !order.voiceNote || !order.voiceNote.audioBase64) {
    return res.status(404).send('Audio not found');
  }
  if (order.status === 'DELIVERED') {
    return res.status(410).json({ error: 'Audio expired - parcel has been marked delivered.' });
  }
  const buffer = Buffer.from(order.voiceNote.audioBase64, 'base64');
  res.setHeader('Content-Type', order.voiceNote.audioMimeType || 'audio/webm');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Accept-Ranges', 'bytes');
  res.send(buffer);
});

app.post('/api/orders', (req, res) => {
  const body = req.body;
  const id = body.id || ('ord-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6));
  const orderNumber = body.orderNumber || ('PT-' + Math.floor(1000 + Math.random() * 9000));
  const assistanceToken = body.assistanceToken || ('tok-' + Math.random().toString(36).substring(2, 12));

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
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    merchantNotes: body.merchantNotes || '',
  };

  orders.set(id, newOrder);
  saveOrdersToDisk(orders);
  res.status(201).json({ success: true, order: newOrder });
});

// Customer submits location pin and voice note directions
app.patch('/api/orders/:id/confirm', (req, res) => {
  let order = orders.get(req.params.id);
  const { pin, voiceNote, orderSnapshot } = req.body;

  if (!order && orderSnapshot && orderSnapshot.id === req.params.id) {
    order = {
      id: orderSnapshot.id,
      orderNumber: orderSnapshot.orderNumber || 'PT-' + Math.floor(1000 + Math.random() * 9000),
      customerName: orderSnapshot.customerName || 'Customer',
      customerPhone: orderSnapshot.customerPhone || '',
      chatPlatform: orderSnapshot.chatPlatform || 'WhatsApp',
      rawOrderText: orderSnapshot.rawOrderText || '',
      items: Array.isArray(orderSnapshot.items) && orderSnapshot.items.length > 0 ? orderSnapshot.items : [{ name: 'Parcel item', quantity: 1 }],
      deliveryAddress: orderSnapshot.deliveryAddress || '',
      city: orderSnapshot.city || '',
      totalAmount: Number(orderSnapshot.totalAmount) || 0,
      currency: orderSnapshot.currency || 'PKR',
      status: 'PENDING_CONFIRMATION',
      assistanceToken: orderSnapshot.assistanceToken || '',
      createdAt: orderSnapshot.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      merchantNotes: orderSnapshot.merchantNotes || '',
    };
  }

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (order.status === 'DELIVERED') {
    return res.status(410).json({ error: 'This order has already been delivered. Confirmation is closed.' });
  }

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
    audioUrl: voiceNote.audioBase64 ? `/api/orders/${order.id}/audio` : (voiceNote.audioUrl || ''),
    audioMimeType: voiceNote.audioMimeType || 'audio/webm',
    durationSeconds: voiceNote.durationSeconds || 5,
    transcript: voiceNote.transcript,
    urduTranscript: voiceNote.urduTranscript || voiceNote.transcript,
    romanUrduTranscript: voiceNote.romanUrduTranscript || voiceNote.transcript,
    englishTranslation: voiceNote.englishTranslation || voiceNote.transcript,
    isValidDirections: Boolean(voiceNote.isValidDirections),
    landmarks: Array.isArray(voiceNote.landmarks) ? voiceNote.landmarks : [],
    feedback: voiceNote.feedback || 'Directions verified',
    verifiedAt: new Date().toISOString(),
  };

  order.status = 'CONFIRMED';
  order.updatedAt = new Date().toISOString();
  orders.set(order.id, order);
  saveOrdersToDisk(orders);

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
    if (status === 'DELIVERED') {
      order.deliveredAt = new Date().toISOString();
    } else {
      delete order.deliveredAt;
    }
    orders.set(order.id, order);
    saveOrdersToDisk(orders);
    return res.json({ success: true, order });
  }
  res.status(400).json({ error: 'Invalid status' });
});

// Server configuration route
app.get('/api/config', (req, res) => {
  res.json({
    appUrl: process.env.APP_URL || '',
  });
});

// Reverse geocode coordinates via Nominatim with proper zoom=18 & User-Agent
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = parseFloat(String(req.query.lat || ''));
  const lon = parseFloat(String(req.query.lon || ''));
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Valid lat and lon required' });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'PATAH-Delivery-App/1.0',
      },
    });
    if (r.ok) {
      const data: any = await r.json();
      const addr = data?.address || {};
      const streetParts = [addr.house_number, addr.road || addr.street || addr.pedestrian || addr.footway || addr.path].filter(Boolean).join(' ');
      const specific =
        addr.amenity ||
        addr.building ||
        addr.shop ||
        streetParts ||
        (data?.name && data.name !== addr.town && data.name !== addr.city ? data.name : '') ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.suburb ||
        addr.residential ||
        addr.hamlet ||
        '';
      const area = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || addr.county || '';
      const district = addr.city || addr.town || addr.state_district || addr.county || '';
      const compactParts = [specific, area, district].filter(
        (v, i, arr) => Boolean(v) && arr.indexOf(v) === i
      );
      const baseName = compactParts.length > 0 ? compactParts.join(', ') : (data?.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      const displayName = specific
        ? baseName
        : `${baseName} (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      return res.json({
        displayName,
        road: addr.road || addr.street || addr.pedestrian || '',
        suburb: addr.suburb || addr.neighbourhood || '',
        city: district,
      });
    }
  } catch (err) {
    // fallback below
  }
  res.json({
    displayName: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  });
});

// Helper to create compact base64 payload for self-contained offline QR code
function buildCompactOrderPayload(order: Order): string {
  const compact = {
    id: order.id,
    nr: order.orderNumber,
    name: order.customerName,
    ph: order.customerPhone,
    addr: order.deliveryAddress,
    city: order.city,
    amt: order.totalAmount,
    cur: order.currency,
    lat: order.pin?.lat,
    lng: order.pin?.lng,
    lbl: order.pin?.landmarkLabel,
    vc: order.voiceNote?.transcript,
    ur: order.voiceNote?.urduTranscript,
    ru: order.voiceNote?.romanUrduTranscript,
    en: order.voiceNote?.englishTranslation,
    lm: order.voiceNote?.landmarks,
    dur: order.voiceNote?.durationSeconds,
  };
  return Buffer.from(JSON.stringify(compact), 'utf-8').toString('base64url');
}

// QR Code generator helper API
app.get('/api/qr/:orderId', async (req, res) => {
  try {
    const order = orders.get(req.params.orderId);
    if (!order) {
      return res.status(404).send('Order not found');
    }
    if (order.status === 'DELIVERED') {
      return res.status(410).json({ error: 'QR code deactivated. This parcel has been marked as delivered.' });
    }
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol;
    const base = process.env.APP_URL || `${protocol}://${host}`;
    const payload = buildCompactOrderPayload(order);
    const riderUrl = `${base}?flow=rider&orderId=${order.id}&d=${payload}`;

    const qrDataUrl = await QRCode.toDataURL(riderUrl, {
      errorCorrectionLevel: 'M',
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
