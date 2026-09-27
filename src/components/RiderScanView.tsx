import React, { useState } from 'react';
import { Order } from '../types';
import { LeafletMap } from './LeafletMap';
import { updateOrderStatus } from '../lib/api';
import {
  Navigation,
  Phone,
  MessageSquare,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Volume2,
  ExternalLink,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
} from 'lucide-react';

interface RiderScanViewProps {
  order: Order;
  onStatusUpdated?: (updatedOrder: Order) => void;
  onBackToMerchant?: () => void;
}

export const RiderScanView: React.FC<RiderScanViewProps> = ({
  order,
  onStatusUpdated,
  onBackToMerchant,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioPlaybackSpeed, setAudioPlaybackSpeed] = useState<number>(1);
  const [isDelivered, setIsDelivered] = useState<boolean>(order.status === 'DELIVERED');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Pin coordinates (or fallback to city coords)
  const pinLat = order.pin?.lat || 33.6938;
  const pinLng = order.pin?.lng || 73.0315;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pinLat},${pinLng}`;
  const appleMapsUrl = `https://maps.apple.com/?daddr=${pinLat},${pinLng}`;

  const cleanPhone = order.customerPhone.replace(/[^0-9+]/g, '');
  const whatsAppPhone = cleanPhone.startsWith('+')
    ? cleanPhone.replace('+', '')
    : cleanPhone.startsWith('03')
    ? '92' + cleanPhone.substring(1)
    : cleanPhone;

  const whatsAppRiderMessage = encodeURIComponent(
    `Salam ${order.customerName}, this is your delivery rider for parcel #${order.orderNumber}. I am nearby!`
  );
  const whatsAppUrl = `https://wa.me/${whatsAppPhone}?text=${whatsAppRiderMessage}`;

  // Voice playback simulation or real audio
  const handlePlayVoice = () => {
    if ('speechSynthesis' in window && !order.voiceNote?.audioUrl) {
      if (isPlayingAudio) {
        window.speechSynthesis.cancel();
        setIsPlayingAudio(false);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        order.voiceNote?.transcript || 'Blue gate, right behind the mosque, second house on the left.'
      );
      utterance.rate = audioPlaybackSpeed;
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    } else if (order.voiceNote?.audioUrl) {
      // Real audio playback
      const audio = new Audio(order.voiceNote.audioUrl);
      audio.playbackRate = audioPlaybackSpeed;
      audio.play();
      setIsPlayingAudio(true);
      audio.onended = () => setIsPlayingAudio(false);
    } else {
      setIsPlayingAudio(!isPlayingAudio);
    }
  };

  const handleMarkDelivered = async () => {
    setIsUpdatingStatus(true);
    try {
      const updated = await updateOrderStatus(order.id, 'DELIVERED');
      setIsDelivered(true);
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (e) {
      console.error('Failed to update status:', e);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/60 py-4 px-3 sm:px-6 flex justify-center">
      <div className="w-full max-w-lg bg-white rounded border border-slate-300 shadow-xl overflow-hidden flex flex-col">
        {/* Top Rider Bar */}
        <div className="bg-slate-950 text-white p-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                P
              </span>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">
                  Courier Doorstep Assistance
                </span>
                <h1 className="font-bold text-xs text-white">Browser Scan &bull; No App Required</h1>
              </div>
            </div>

            {onBackToMerchant && (
              <button
                onClick={onBackToMerchant}
                className="text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700 cursor-pointer"
              >
                &larr; Merchant Hub
              </button>
            )}
          </div>
        </div>

        {/* Big Action: One-Tap Navigation */}
        <div className="p-4 bg-emerald-50 border-b border-emerald-200 flex flex-col gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm py-3 px-4 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Navigation className="w-4 h-4 fill-current" />
            Start One-Tap Navigation (Google Maps)
            <ExternalLink className="w-4 h-4 ml-auto opacity-70" />
          </a>

          <div className="flex items-center justify-between text-[11px] text-emerald-900 px-1">
            <span>Coordinates: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}</span>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-emerald-950"
            >
              Apple Maps
            </a>
          </div>
        </div>

        {/* Scrollable Details */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Status Alert */}
          {isDelivered && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded p-3 flex items-center gap-2.5 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              Parcel marked as Delivered
            </div>
          )}

          {/* Customer Voice Note Card */}
          <div className="bg-amber-50 border border-amber-300 rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-amber-700 text-white flex items-center justify-center">
                  <Volume2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                    Customer Voice Directions
                  </h3>
                  <p className="text-[11px] text-amber-900">
                    Spoken instructions to find the exact door
                  </p>
                </div>
              </div>

              {/* Speed toggle */}
              <button
                type="button"
                onClick={() => setAudioPlaybackSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 1.5 : 1))}
                className="text-[10px] font-mono font-bold bg-white text-slate-700 border border-slate-300 px-2 py-0.5 rounded cursor-pointer"
              >
                {audioPlaybackSpeed}x Speed
              </button>
            </div>

            {/* Play audio button */}
            <div className="my-2.5">
              <button
                type="button"
                onClick={handlePlayVoice}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2.5 px-4 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="w-4 h-4 text-emerald-400" />
                    Pause Voice Note
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 text-emerald-400 fill-current ml-0.5" />
                    Listen to Door Directions ({order.voiceNote?.durationSeconds || 7}s)
                  </>
                )}
              </button>
            </div>

            {/* Key Landmarks */}
            {order.voiceNote?.landmarks && order.voiceNote.landmarks.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                  Key Doorstep Landmarks:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {order.voiceNote.landmarks.map((lm, i) => (
                    <span
                      key={i}
                      className="text-xs font-semibold bg-white text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1"
                    >
                      {lm}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Voice Transcription */}
            <div className="bg-white rounded p-3 border border-amber-200 text-xs text-slate-800 space-y-1.5 mt-2">
              <p className="font-medium text-slate-900">
                "{order.voiceNote?.transcript || 'Blue gate, right behind the mosque, second house.'}"
              </p>
              {order.voiceNote?.englishTranslation &&
                order.voiceNote.englishTranslation !== order.voiceNote.transcript && (
                  <p className="text-[11px] text-slate-600 italic border-t border-slate-100 pt-1">
                    Translation: "{order.voiceNote.englishTranslation}"
                  </p>
                )}
            </div>
          </div>

          {/* Interactive OpenStreetMap Pin */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-700" />
                Customer Dropped Pin (OpenStreetMap)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {order.pin?.landmarkLabel || 'Door entrance'}
              </span>
            </div>

            <LeafletMap
              center={[pinLat, pinLng]}
              markerPosition={[pinLat, pinLng]}
              interactive={false}
              zoom={17}
              className="h-56 w-full rounded border border-slate-300 overflow-hidden shadow-xs"
              markerLabel={order.pin?.landmarkLabel || order.customerName}
            />
          </div>

          {/* Customer Contact & Order Meta */}
          <div className="bg-slate-50 rounded p-4 border border-slate-200 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">{order.customerName}</h4>
                <p className="text-xs text-slate-700 font-mono mt-0.5">{order.customerPhone}</p>
                <p className="text-xs text-slate-600 mt-1">
                  {order.deliveryAddress}, {order.city}
                </p>
              </div>

              <span className="text-xs font-bold font-mono text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded">
                {order.currency} {order.totalAmount.toLocaleString()}
              </span>
            </div>

            {/* Rider quick call / whatsapp buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <a
                href={`tel:${cleanPhone}`}
                className="flex-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-700" />
                Call Customer
              </a>

              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp Rider Note
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Delivery Status update */}
        <div className="p-4 bg-slate-100 border-t border-slate-200">
          {!isDelivered ? (
            <button
              type="button"
              onClick={handleMarkDelivered}
              disabled={isUpdatingStatus}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {isUpdatingStatus ? 'Updating...' : 'Arrived and Mark Parcel Delivered'}
            </button>
          ) : (
            <div className="text-center text-xs text-emerald-800 font-semibold py-1">
              Delivery Completed
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
