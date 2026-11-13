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

export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'INVALID_AUDIO'
  | 'DISPATCHED'
  | 'DELIVERED';

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
  status: OrderStatus;
  pin?: DeliveryPin;
  voiceNote?: VoiceNoteData;
  assistanceToken: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  merchantNotes?: string;
}

export interface ParseOrderResponse {
  success: boolean;
  parsed: {
    customerName: string;
    customerPhone: string;
    items: OrderItem[];
    deliveryAddress: string;
    city: string;
    totalAmount: number;
    currency: string;
    chatPlatform: 'WhatsApp' | 'Instagram' | 'SMS' | 'Other';
  };
  fallback?: boolean;
}

export interface VerifyVoiceResponse {
  isValid: boolean;
  confidence: number;
  landmarks: string[];
  urduTranscript?: string;
  romanUrduTranscript?: string;
  englishTranslation: string;
  originalTranscript: string;
  feedback: string;
  fallback?: boolean;
}

export interface MerchantUser {
  id: string;
  name: string;
  storeName: string;
  emailOrPhone: string;
  city?: string;
}
