import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import { LeafletMap } from './LeafletMap';
import { VoiceRecorderService, AudioRecordingResult } from '../lib/voiceRecorder';
import { verifyVoiceDirections, confirmOrderAssistance, reverseGeocodeLocation } from '../lib/api';
import { romanUrduToUrduScript } from '../lib/urduTransliterate';
import {
  MapPin,
  Mic,
  Square,
  Play,
  Pause,
  Check,
  AlertCircle,
  Navigation,
  Loader2,
  Lock,
} from 'lucide-react';

interface CustomerAssistViewProps {
  order: Order;
  onAssistanceCompleted: (updatedOrder: Order) => void;
  onBackToMerchant?: () => void;
}

const CITY_COORDS: Record<string, [number, number]> = {
  'jalalpur jattan': [32.6416, 74.2064],
  gujrat: [32.5742, 74.0754],
  kharian: [32.8142, 73.8647],
  sialkot: [32.4945, 74.5229],
  gujranwala: [32.1877, 74.1945],
  lahore: [31.5204, 74.3587],
  islamabad: [33.6844, 73.0479],
  rawalpindi: [33.5973, 73.0479],
  karachi: [24.8607, 67.0011],
  faisalabad: [31.4504, 73.135],
  multan: [30.1575, 71.5249],
  peshawar: [34.0151, 71.5249],
  quetta: [30.1798, 66.975],
  hyderabad: [25.396, 68.3578],
  sargodha: [32.0836, 72.6711],
  abbottabad: [34.1688, 73.2215],
};

export const CustomerAssistView: React.FC<CustomerAssistViewProps> = ({
  order,
  onAssistanceCompleted,
}) => {
  const fallbackCoords = CITY_COORDS[(order.city || '').toLowerCase()] || [31.5204, 74.3587];
  const initialLat = order.pin?.lat || fallbackCoords[0];
  const initialLng = order.pin?.lng || fallbackCoords[1];

  // Pin state
  const [pinLat, setPinLat] = useState<number>(initialLat);
  const [pinLng, setPinLng] = useState<number>(initialLng);
  const [hasDroppedPin, setHasDroppedPin] = useState<boolean>(Boolean(order.pin?.lat));
  const userHasMovedPinRef = React.useRef<boolean>(Boolean(order.pin?.lat));
  const [droppedAddress, setDroppedAddress] = useState<string>('');
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordTimer, setRecordTimer] = useState<number>(0);
  const [audioResult, setAudioResult] = useState<AudioRecordingResult | null>(null);
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [recorderService] = useState<VoiceRecorderService>(() => new VoiceRecorderService());
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Transcripts
  const [urduTranscript, setUrduTranscript] = useState<string>(
    order.voiceNote?.urduTranscript || ''
  );
  const [romanUrduTranscript, setRomanUrduTranscript] = useState<string>(
    order.voiceNote?.romanUrduTranscript || order.voiceNote?.transcript || ''
  );

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(order.status === 'CONFIRMED');

  // Center map on order city if no existing pin
  useEffect(() => {
    if (order.pin?.lat && order.pin?.lng) return;
    if (userHasMovedPinRef.current) return;
    let isCancelled = false;

    async function centerCity() {
      try {
        const queries = order.deliveryAddress
          ? [`${order.deliveryAddress}, ${order.city}, Pakistan`, `${order.city}, Pakistan`]
          : [`${order.city}, Pakistan`];
        for (const query of queries) {
          if (isCancelled || userHasMovedPinRef.current) return;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=pk&limit=1`
          );
          if (res.ok) {
            const results = await res.json();
            if (!isCancelled && !userHasMovedPinRef.current && results?.[0]) {
              const lat = parseFloat(results[0].lat);
              const lng = parseFloat(results[0].lon);
              if (!isNaN(lat) && !isNaN(lng)) {
                setPinLat(lat);
                setPinLng(lng);
                return;
              }
            }
          }
        }
      } catch {
        // Keep fallback coordinates
      }
    }

    centerCity();
    return () => {
      isCancelled = true;
    };
  }, [order.id, order.city, order.deliveryAddress, order.pin]);

  // Reverse geocode whenever user drops or moves the pin
  useEffect(() => {
    if (!hasDroppedPin) return;
    let isCancelled = false;

    async function fetchLocationName() {
      setIsResolvingAddress(true);
      const res = await reverseGeocodeLocation(pinLat, pinLng);
      if (!isCancelled) {
        setDroppedAddress(res.displayName || `${pinLat.toFixed(5)}, ${pinLng.toFixed(5)}`);
        setIsResolvingAddress(false);
      }
    }

    fetchLocationName();
    return () => {
      isCancelled = true;
    };
  }, [pinLat, pinLng, hasDroppedPin]);

  // Recording timer
  useEffect(() => {
    if (!isRecording) {
      setRecordTimer(0);
      return;
    }
    const interval = setInterval(() => setRecordTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioElement?.pause();
    };
  }, [audioElement]);

  const handleMapSelect = (lat: number, lng: number) => {
    userHasMovedPinRef.current = true;
    setPinLat(lat);
    setPinLng(lng);
    setHasDroppedPin(true);
    setIsConfirmed(false);
    setErrorMessage(null);
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setErrorMessage('GPS is not supported on this browser. Tap on the map to drop a pin.');
      return;
    }
    setIsLocating(true);
    setErrorMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleMapSelect(pos.coords.latitude, pos.coords.longitude);
        setIsLocating(false);
      },
      () => {
        setErrorMessage('Could not access GPS. Tap directly on the map to place your pin.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleStartRecording = async () => {
    setErrorMessage(null);
    setIsConfirmed(false);

    const started = await recorderService.startRecording((liveText) => {
      setRomanUrduTranscript(liveText);
      setUrduTranscript(romanUrduToUrduScript(liveText));
    });

    if (started) {
      setIsRecording(true);
    } else {
      const fallbackText = prompt('Microphone unavailable. Type directions in Roman Urdu:');
      if (fallbackText?.trim()) {
        const clean = fallbackText.trim();
        setRomanUrduTranscript(clean);
        setUrduTranscript(romanUrduToUrduScript(clean));
      }
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    const result = await recorderService.stopRecording();
    setAudioResult(result);

    const captured = recorderService.transcriptSoFar || romanUrduTranscript;
    if (captured) {
      setRomanUrduTranscript(captured);
      setUrduTranscript(romanUrduToUrduScript(captured));
    }

    if (result.audioUrl) {
      const audio = new Audio(result.audioUrl);
      audio.onended = () => setAudioPlaying(false);
      setAudioElement(audio);
    }
  };

  const handleRomanUrduChange = (val: string) => {
    setRomanUrduTranscript(val);
    setUrduTranscript(romanUrduToUrduScript(val));
    setIsConfirmed(false);
  };

  const handleTogglePlayback = () => {
    if (!audioElement) return;
    if (audioPlaying) {
      audioElement.pause();
      setAudioPlaying(false);
    } else {
      audioElement.play();
      setAudioPlaying(true);
    }
  };

  const handleConfirm = async () => {
    if (!hasDroppedPin) {
      setErrorMessage('Please tap on the map to drop your location pin.');
      return;
    }

    const activeText = urduTranscript.trim() || romanUrduTranscript.trim();
    if (!activeText) {
      setErrorMessage('Please record a voice note with directions to your door.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const verifyRes = await verifyVoiceDirections(activeText, audioResult?.base64);

      const finalUrdu =
        verifyRes.urduTranscript && /[\u0600-\u06FF]/.test(verifyRes.urduTranscript)
          ? verifyRes.urduTranscript
          : romanUrduToUrduScript(verifyRes.romanUrduTranscript || activeText) || activeText;
      const finalRoman = verifyRes.romanUrduTranscript || romanUrduTranscript || activeText;

      setUrduTranscript(finalUrdu);
      setRomanUrduTranscript(finalRoman);

      if (!verifyRes.isValid) {
        setErrorMessage(
          verifyRes.feedback ||
            'Please mention a nearby landmark, street name, or gate color to help the rider.'
        );
        setIsSubmitting(false);
        return;
      }

      const updatedOrder = await confirmOrderAssistance(order.id, {
        orderSnapshot: order,
        pin: {
          lat: pinLat,
          lng: pinLng,
          accuracy: 8,
          landmarkLabel: droppedAddress || 'Customer Doorstep',
        },
        voiceNote: {
          audioBase64: audioResult?.base64,
          audioUrl: audioResult?.audioUrl,
          audioMimeType: 'audio/webm',
          durationSeconds: audioResult?.durationSeconds || 6,
          transcript: finalRoman,
          urduTranscript: finalUrdu,
          romanUrduTranscript: finalRoman,
          englishTranslation: verifyRes.englishTranslation,
          isValidDirections: true,
          landmarks: verifyRes.landmarks,
          feedback: verifyRes.feedback,
        },
      });

      setIsConfirmed(true);
      onAssistanceCompleted(updatedOrder);
    } catch {
      setErrorMessage('Could not save your details. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (order.status === 'DELIVERED') {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex justify-center py-10 px-4">
        <div className="w-full max-w-md space-y-6">
          <header className="border-b border-slate-200 pb-4 flex items-baseline justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                Delivery Completed
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Order #{order.orderNumber}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">Delivered</span>
          </header>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center space-y-3">
            <div className="w-11 h-11 rounded bg-slate-200 text-slate-700 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Confirmation link closed
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              This parcel has already been marked as delivered. Location pinning and voice instructions are no longer needed.
            </p>
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
              Confirm Delivery Location
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Order #{order.orderNumber} &middot; {order.customerName}
            </p>
          </div>
          <span className="text-xs font-medium text-[#01411C]">{order.city}</span>
        </header>

        {/* Step 1: Drop Pin on Map */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-900">
              1. Drop a pin at your doorstep
            </label>
            <button
              type="button"
              onClick={handleUseGPS}
              disabled={isLocating}
              className="text-xs font-medium text-[#01411C] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Navigation className="w-3 h-3" />
              {isLocating ? 'Locating...' : 'Use current GPS'}
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <LeafletMap
              center={[pinLat, pinLng]}
              markerPosition={[pinLat, pinLng]}
              onLocationSelect={handleMapSelect}
              className="h-64 w-full cursor-crosshair"
              markerLabel="Delivery Pin"
              showLayerToggle={true}
            />
          </div>

          {hasDroppedPin ? (
            <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
              <MapPin className="w-4 h-4 text-[#01411C] shrink-0 mt-0.5" />
              <div className="leading-snug space-y-0.5">
                <div>
                  <span className="font-medium text-slate-900">Your dropped pin location: </span>
                  {isResolvingAddress ? (
                    <span className="text-slate-400">Finding street name...</span>
                  ) : (
                    <span>{droppedAddress}</span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-500">
                  Pin coordinates: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Tap anywhere on the map above to drop your pin.
            </p>
          )}
        </section>

        {/* Step 2: Voice Note for Guidance */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-sm font-medium text-slate-900 block">
              2. Enter a voice note for guidance
            </label>
            <p className="text-xs text-slate-500 mt-0.5">
              Mention a nearby landmark, street, or gate color in Urdu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isRecording ? (
              <button
                type="button"
                onClick={handleStartRecording}
                className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 hover:border-[#01411C] hover:bg-emerald-50/40 text-sm font-medium text-slate-900 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4 text-[#01411C]" />
                {audioResult ? 'Record Again' : 'Record Voice Note'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopRecording}
                className="flex-1 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Recording ({recordTimer}s)
              </button>
            )}

            {audioElement && !isRecording && (
              <button
                type="button"
                onClick={handleTogglePlayback}
                className="p-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
                aria-label="Play voice note"
              >
                {audioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Transcriptions in Urdu & Roman Urdu */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Urdu Transcript (اردو)
              </label>
              <textarea
                rows={2}
                dir="rtl"
                value={urduTranscript}
                onChange={(e) => setUrduTranscript(e.target.value)}
                placeholder="جامع مسجد کے پیچھے، سبز گیٹ والا گھر..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-[#01411C] focus:outline-none font-serif leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Roman Urdu Transcript
              </label>
              <textarea
                rows={2}
                value={romanUrduTranscript}
                onChange={(e) => handleRomanUrduChange(e.target.value)}
                placeholder="Jamia masjid ke peechay, sabz gate wala ghar..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-[#01411C] focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 px-3 py-2.5 rounded-lg border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isConfirmed && !errorMessage && (
          <div className="flex items-center gap-2 text-xs font-medium text-[#01411C] bg-emerald-50 px-3 py-2.5 rounded-lg border border-emerald-200">
            <Check className="w-4 h-4 shrink-0" />
            <span>Location and voice guidance confirmed for the rider.</span>
          </div>
        )}

        {/* Confirm Button */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || isRecording}
          className="w-full py-3 px-4 rounded-lg bg-[#01411C] hover:bg-[#013215] text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming...
            </>
          ) : isConfirmed ? (
            'Confirmed'
          ) : (
            'Confirm'
          )}
        </button>
      </div>
    </div>
  );
};