import React, { useState, useRef, useEffect } from 'react';
import { Order } from '../types';
import { LeafletMap } from './LeafletMap';
import { updateOrderStatus, fetchOrderById } from '../lib/api';
import { romanUrduToUrduScript } from '../lib/urduTransliterate';
import {
  Navigation,
  Play,
  Pause,
  Check,
  MapPin,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react';

interface RiderScanViewProps {
  order: Order;
  onStatusUpdated?: (updatedOrder: Order) => void;
  onBackToMerchant?: () => void;
}

export const RiderScanView: React.FC<RiderScanViewProps> = ({
  order,
  onStatusUpdated,
}) => {
  const [liveOrder, setLiveOrder] = useState<Order>(order);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioPlaybackSpeed, setAudioPlaybackSpeed] = useState<number>(1);
  const [isDelivered, setIsDelivered] = useState<boolean>(order.status === 'DELIVERED');
  const [justMarkedByRider, setJustMarkedByRider] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generatedBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setLiveOrder(order);
    setIsDelivered(order.status === 'DELIVERED');
  }, [order]);

  // Verify live order status from server so QR immediately stops working after merchant marks delivered
  useEffect(() => {
    let cancelled = false;
    async function verifyLiveStatus() {
      const fresh = await fetchOrderById(order.id, true);
      if (!cancelled && fresh) {
        setLiveOrder((prev) =>
          fresh.status === 'DELIVERED' ? fresh : { ...prev, ...fresh }
        );
        if (fresh.status === 'DELIVERED') {
          setIsDelivered(true);
          audioRef.current?.pause();
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          setIsPlayingAudio(false);
        }
      }
    }
    verifyLiveStatus();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const pinLat = liveOrder.pin?.lat;
  const pinLng = liveOrder.pin?.lng;
  const hasPin = typeof pinLat === 'number' && typeof pinLng === 'number';

  const googleMapsUrl = hasPin
    ? `https://www.google.com/maps/dir/?api=1&destination=${pinLat},${pinLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${liveOrder.deliveryAddress}, ${liveOrder.city}`)}`;

  const appleMapsUrl = hasPin
    ? `https://maps.apple.com/?daddr=${pinLat},${pinLng}`
    : `https://maps.apple.com/?q=${encodeURIComponent(`${liveOrder.deliveryAddress}, ${liveOrder.city}`)}`;

  const romanUrduText = (
    liveOrder.voiceNote?.romanUrduTranscript ||
    liveOrder.voiceNote?.transcript ||
    ''
  ).trim();

  const urduText = (
    liveOrder.voiceNote?.urduTranscript && /[\u0600-\u06FF]/.test(liveOrder.voiceNote.urduTranscript)
      ? liveOrder.voiceNote.urduTranscript
      : romanUrduToUrduScript(romanUrduText)
  ).trim();

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (generatedBlobUrlRef.current) {
        URL.revokeObjectURL(generatedBlobUrlRef.current);
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Convert base64 audio string into a playable Blob URL
  const createPlayableBlobFromBase64 = (base64Data: string, mimeType = 'audio/webm'): string | null => {
    try {
      const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const byteChars = atob(cleaned);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      if (generatedBlobUrlRef.current) {
        URL.revokeObjectURL(generatedBlobUrlRef.current);
      }
      generatedBlobUrlRef.current = url;
      return url;
    } catch {
      return null;
    }
  };

  // Fallback: read directions aloud via browser speech synthesis if audio file wasn't in QR payload
  const speakDirectionsFallback = () => {
    const textToSpeak = urduText || romanUrduText;
    if (!textToSpeak || !('speechSynthesis' in window)) {
      setAudioNotice('Voice recording not attached to QR code. Please read the directions below.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = urduText ? 'ur-PK' : 'en-US';
    utterance.rate = audioPlaybackSpeed;

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => {
      setIsPlayingAudio(false);
      setAudioNotice('Could not play audio. Read the written directions below.');
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePlayVoice = () => {
    setAudioNotice(null);

    // Stop if currently playing
    if (isPlayingAudio) {
      audioRef.current?.pause();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    // Build ordered list of candidate audio sources
    const candidates: string[] = [];

    // 1. Base64 audio embedded in order (most reliable across tabs/devices)
    if (liveOrder.voiceNote?.audioBase64) {
      const blobUrl = createPlayableBlobFromBase64(
        liveOrder.voiceNote.audioBase64,
        liveOrder.voiceNote.audioMimeType || 'audio/webm'
      );
      if (blobUrl) candidates.push(blobUrl);
    }

    // 2. HTTP(S) audioUrl (skip dead blob: URLs from another session/device)
    if (liveOrder.voiceNote?.audioUrl && !liveOrder.voiceNote.audioUrl.startsWith('blob:')) {
      candidates.push(liveOrder.voiceNote.audioUrl);
    }

    // 3. Backend API audio endpoint
    if (liveOrder.id) {
      candidates.push(`/api/orders/${liveOrder.id}/audio`);
    }

    const tryPlaySource = (index: number) => {
      if (index >= candidates.length) {
        // All audio file sources failed (e.g., QR-only stateless order) -> use speech fallback
        speakDirectionsFallback();
        return;
      }

      const audio = new Audio(candidates[index]);
      audio.playbackRate = audioPlaybackSpeed;
      audioRef.current = audio;

      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => tryPlaySource(index + 1);

      audio
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => tryPlaySource(index + 1));
    };

    tryPlaySource(0);
  };

  const handleCycleSpeed = () => {
    const nextSpeed = audioPlaybackSpeed === 1 ? 1.25 : audioPlaybackSpeed === 1.25 ? 1.5 : 1;
    setAudioPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleMarkDelivered = async () => {
    setIsUpdatingStatus(true);
    try {
      const updated = await updateOrderStatus(liveOrder.id, 'DELIVERED');
      setJustMarkedByRider(true);
      setIsDelivered(true);
      setLiveOrder(updated);
      onStatusUpdated?.(updated);
    } catch {
      // Allow retry if request fails
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isDelivered && !justMarkedByRider) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex justify-center py-10 px-4">
        <div className="w-full max-w-md space-y-6">
          <header className="border-b border-slate-200 pb-4 flex items-baseline justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                QR Code Inactive
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Order #{liveOrder.orderNumber}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">Delivered</span>
          </header>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center space-y-3">
            <div className="w-11 h-11 rounded bg-slate-200 text-slate-700 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-slate-900">
                This QR code no longer works
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                This parcel has already been marked as delivered by the merchant. The doorstep pin, navigation link, and customer voice directions are deactivated for privacy.
              </p>
            </div>
            {liveOrder.deliveredAt && (
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                Marked delivered on {new Date(liveOrder.deliveredAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 flex justify-center py-8 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <header className="border-b border-slate-200 pb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Delivery Navigation
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Order #{liveOrder.orderNumber} &middot; {liveOrder.customerName}
            </p>
          </div>
          <span className="text-xs font-medium text-[#01411C]">{liveOrder.city}</span>
        </header>

        {/* Step 1: Map & Navigation */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">1. Customer Pin</span>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-slate-900 underline"
            >
              Apple Maps
            </a>
          </div>

          {hasPin && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <LeafletMap
                center={[pinLat!, pinLng!]}
                markerPosition={[pinLat!, pinLng!]}
                interactive={true}
                zoom={17}
                className="h-56 w-full"
                markerLabel={liveOrder.pin?.landmarkLabel || liveOrder.customerName}
              />
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
            <MapPin className="w-4 h-4 text-[#01411C] shrink-0 mt-0.5" />
            <span className="leading-snug">
              {liveOrder.pin?.landmarkLabel || liveOrder.deliveryAddress}
            </span>
          </div>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-lg bg-[#01411C] hover:bg-[#013215] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Navigation className="w-4 h-4" />
            <span>Open in Google Maps</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-75" />
          </a>
        </section>

        {/* Step 2: Customer Voice Guidance & Transcripts */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">2. Doorstep Guidance</span>
            <button
              type="button"
              onClick={handleCycleSpeed}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
            >
              {audioPlaybackSpeed}x
            </button>
          </div>

          <button
            type="button"
            onClick={handlePlayVoice}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 hover:border-[#01411C] hover:bg-emerald-50/40 text-sm font-medium text-slate-900 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isPlayingAudio ? (
              <>
                <Pause className="w-4 h-4 text-[#01411C]" />
                <span>Pause Voice Note</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-[#01411C]" />
                <span>Play Voice Note ({liveOrder.voiceNote?.durationSeconds || 7}s)</span>
              </>
            )}
          </button>

          {audioNotice && (
            <p className="text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
              {audioNotice}
            </p>
          )}

          {/* Transcripts */}
          <div className="space-y-3 pt-1">
            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">
                Urdu (اردو)
              </span>
              <p
                dir="rtl"
                className="text-base text-slate-900 font-serif leading-relaxed bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 min-h-[44px]"
              >
                {urduText || <span className="text-slate-400 font-sans text-xs">No transcript</span>}
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">
                Roman Urdu
              </span>
              <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 min-h-[40px]">
                {romanUrduText || <span className="text-slate-400 text-xs">No transcript</span>}
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Delivery Action */}
        <div className="pt-2 border-t border-slate-100">
          {!isDelivered ? (
            <button
              type="button"
              onClick={handleMarkDelivered}
              disabled={isUpdatingStatus}
              className="w-full py-3 px-4 rounded-lg bg-[#01411C] hover:bg-[#013215] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUpdatingStatus ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Mark Parcel Delivered</span>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#01411C] bg-emerald-50 py-3 px-4 rounded-lg border border-emerald-200">
              <Check className="w-4 h-4" />
              <span>Parcel Delivered</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};