import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import { LeafletMap } from './LeafletMap';
import { VoiceRecorderService, AudioRecordingResult } from '../lib/voiceRecorder';
import { verifyVoiceDirections, confirmOrderAssistance } from '../lib/api';
import {
  MapPin,
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Package,
  Navigation,
  Volume2,
  Lock,
  Compass,
} from 'lucide-react';

interface CustomerAssistViewProps {
  order: Order;
  onAssistanceCompleted: (updatedOrder: Order) => void;
  onBackToMerchant?: () => void;
}

export const CustomerAssistView: React.FC<CustomerAssistViewProps> = ({
  order,
  onAssistanceCompleted,
  onBackToMerchant,
}) => {
  // Pin location state (default near city center or existing pin)
  const [pinLat, setPinLat] = useState<number>(order.pin?.lat || (order.city.toLowerCase().includes('karachi') ? 24.8607 : order.city.toLowerCase().includes('islamabad') ? 33.6844 : 31.5204));
  const [pinLng, setPinLng] = useState<number>(order.pin?.lng || (order.city.toLowerCase().includes('karachi') ? 67.0011 : order.city.toLowerCase().includes('islamabad') ? 73.0479 : 74.3587));
  const [landmarkLabel, setLandmarkLabel] = useState<string>(order.pin?.landmarkLabel || '');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordTimer, setRecordTimer] = useState<number>(0);
  const [audioResult, setAudioResult] = useState<AudioRecordingResult | null>(null);
  const [recordedTranscript, setRecordedTranscript] = useState<string>(order.voiceNote?.transcript || '');
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [recorderService] = useState<VoiceRecorderService>(() => new VoiceRecorderService());
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Verification & Submission state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationFeedback, setVerificationFeedback] = useState<{
    isValid: boolean;
    feedback: string;
    landmarks?: string[];
  } | null>(null);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState<boolean>(order.status === 'CONFIRMED');

  // Handle live timer during recording
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordTimer((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordTimer(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Clean audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, [audioElement]);

  // GPS Location handler using HTML5 Geolocation API
  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPinLat(position.coords.latitude);
        setPinLng(position.coords.longitude);
        setIsLocating(false);
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        setLocationError('Could not retrieve GPS location. Tap directly on the map to place your pin.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleStartRecording = async () => {
    setVerificationFeedback(null);
    const started = await recorderService.startRecording((liveText) => {
      setRecordedTranscript(liveText);
    });

    if (started) {
      setIsRecording(true);
    } else {
      // If microphone hardware permission is restricted, offer fallback speech prompt
      const manualDirection = prompt(
        'Microphone access is unavailable or restricted in this browser frame. Please type or speak your door directions (e.g. "Blue gate, behind the mosque, second house"):'
      );
      if (manualDirection && manualDirection.trim()) {
        setRecordedTranscript(manualDirection.trim());
        setAudioResult({
          blob: new Blob([], { type: 'audio/webm' }),
          audioUrl: '',
          base64: '',
          durationSeconds: 6,
        });
      }
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    const result = await recorderService.stopRecording();
    setAudioResult(result);

    // If transcript is still empty (e.g. Web Speech API unsupported), provide a default prompt or placeholder
    if (!recordedTranscript.trim()) {
      setRecordedTranscript(recorderService.transcriptSoFar || 'Blue gate, right behind the mosque, second house on the left.');
    }

    if (result.audioUrl) {
      const audio = new Audio(result.audioUrl);
      audio.onended = () => setAudioPlaying(false);
      setAudioElement(audio);
    }
  };

  const handleToggleAudioPlay = () => {
    if (!audioElement) return;
    if (audioPlaying) {
      audioElement.pause();
      setAudioPlaying(false);
    } else {
      audioElement.play();
      setAudioPlaying(true);
    }
  };

  // Quick preset voice notes for fast demo testing
  const handleUsePreset = (presetTranscript: string, isSilentTest = false) => {
    setRecordedTranscript(presetTranscript);
    setAudioResult({
      blob: new Blob([], { type: 'audio/webm' }),
      audioUrl: '',
      base64: '',
      durationSeconds: isSilentTest ? 2 : 8,
    });
    setVerificationFeedback(null);
  };

  // Final submission of pin + voice directions
  const handleSubmitConfirmation = async () => {
    if (!recordedTranscript.trim()) {
      setVerificationFeedback({
        isValid: false,
        feedback: 'Please record or provide door-finding voice instructions before submitting.',
      });
      return;
    }

    setIsVerifying(true);
    setVerificationFeedback(null);

    try {
      // 1. Verify voice note validity with AI
      const verifyRes = await verifyVoiceDirections(recordedTranscript, audioResult?.base64);

      if (!verifyRes.isValid) {
        setVerificationFeedback({
          isValid: false,
          feedback:
            verifyRes.feedback ||
            'Directions unclear: Please mention your gate color, nearby landmark, or street turn.',
        });
        setIsVerifying(false);
        return;
      }

      // 2. Submit pin and verified directions
      const updatedOrder = await confirmOrderAssistance(order.id, {
        pin: {
          lat: pinLat,
          lng: pinLng,
          accuracy: 8,
          landmarkLabel: landmarkLabel || 'Verified doorstep pin',
        },
        voiceNote: {
          audioBase64: audioResult?.base64,
          audioUrl: audioResult?.audioUrl,
          audioMimeType: 'audio/webm',
          durationSeconds: audioResult?.durationSeconds || 7,
          transcript: recordedTranscript,
          englishTranslation: verifyRes.englishTranslation,
          isValidDirections: true,
          landmarks: verifyRes.landmarks,
          feedback: verifyRes.feedback,
        },
      });

      setVerificationFeedback({
        isValid: true,
        feedback: verifyRes.feedback,
        landmarks: verifyRes.landmarks,
      });

      setIsSubmittedSuccess(true);
      onAssistanceCompleted(updatedOrder);
    } catch (err: any) {
      console.error('Error confirming order:', err);
      setVerificationFeedback({
        isValid: false,
        feedback: 'Failed to confirm. Please check your connection and retry.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/60 py-6 px-3 sm:px-6 flex justify-center">
      <div className="w-full max-w-lg bg-white rounded border border-slate-300 shadow-xl overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="bg-slate-950 text-white p-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                P
              </span>
              <div>
                <h1 className="font-bold text-sm tracking-tight">PATAH Delivery Assistance</h1>
                <p className="text-[11px] text-slate-400">Order Verification &bull; Doorstep Pin</p>
              </div>
            </div>

            {onBackToMerchant && (
              <button
                onClick={onBackToMerchant}
                className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700"
              >
                &larr; Merchant View
              </button>
            )}
          </div>

          {/* Real intent confirmation note */}
          <div className="mt-4 bg-slate-900 border border-slate-700 rounded p-3 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <p className="font-semibold text-slate-100">Order Confirmation Step</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Both your <strong>exact map pin</strong> and <strong>voice note</strong> are
                compulsory to unlock dispatch. This confirms you are ready to receive the parcel and
                allows the courier to locate your door directly.
              </p>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between text-xs">
          <div>
            <span className="font-mono font-semibold text-slate-800">Order #{order.orderNumber}</span>
            <p className="text-slate-500 text-[11px]">
              {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
            </p>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-900">
              {order.currency} {order.totalAmount.toLocaleString()}
            </span>
            <p className="text-emerald-700 font-medium text-[11px] flex items-center gap-1 justify-end">
              <Package className="w-3 h-3" /> Ready for dispatch
            </p>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-5 space-y-5 flex-1 overflow-y-auto">
          {/* Success Banner if already confirmed */}
          {isSubmittedSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 rounded p-4 text-center space-y-2">
              <div className="w-10 h-10 bg-emerald-600 text-white rounded flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-bold text-emerald-950">Order Verified and Confirmed</h2>
              <p className="text-xs text-emerald-800 max-w-sm mx-auto">
                Your exact doorstep pin and voice directions have been saved. The merchant can now
                print the unlocked parcel QR label for courier dispatch.
              </p>
              <div className="bg-white p-3 rounded border border-emerald-200 text-left text-xs text-slate-700 mt-2">
                <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-emerald-700" /> Doorstep directions saved:
                </p>
                <p className="text-slate-600 italic">"{recordedTranscript}"</p>
              </div>
            </div>
          )}

          {/* STEP 1: Pin on OpenStreetMap */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                  1
                </span>
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Drop Door Pin on Map
                </label>
              </div>
              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                Compulsory
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Drag the marker or tap on the map to pinpoint your exact gate or door entrance.
            </p>

            <div className="relative">
              <LeafletMap
                center={[pinLat, pinLng]}
                markerPosition={[pinLat, pinLng]}
                onLocationSelect={(lat, lng) => {
                  setPinLat(lat);
                  setPinLng(lng);
                }}
                className="h-64 w-full rounded border border-slate-300 overflow-hidden shadow-xs"
                markerLabel="Your Door Entrance"
              />

              {/* Quick Locate Button */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="absolute top-2.5 right-2.5 z-[1000] bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-300 flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-700" />
                {isLocating ? 'Finding GPS...' : 'Use My GPS'}
              </button>
            </div>

            {locationError && (
              <p className="text-[11px] text-amber-800 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {locationError}
              </p>
            )}

            <div>
              <label className="text-[11px] font-medium text-slate-700 block mb-1">
                Doorstep Landmark or Building Name (Optional note for rider):
              </label>
              <input
                type="text"
                value={landmarkLabel}
                onChange={(e) => setLandmarkLabel(e.target.value)}
                placeholder="e.g. Next to Madni Mosque, Flat 402, 2nd floor"
                className="w-full text-xs px-3 py-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
              />
            </div>
          </div>

          {/* STEP 2: Voice Note Directions */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                  2
                </span>
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Record Voice Note
                </label>
              </div>
              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                Compulsory
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Explain how to find your door from the main street in your own language (e.g. "blue gate, behind the mosque, second house").
            </p>

            {/* Recorder Card */}
            <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-sm ${
                      isRecording ? 'bg-red-600' : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-xs font-mono font-medium text-slate-800">
                    {isRecording ? `Recording: ${recordTimer}s` : 'Ready to record voice note'}
                  </span>
                </div>

                {audioResult && !isRecording && (
                  <span className="text-[11px] text-emerald-800 font-medium bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded">
                    Recorded ({audioResult.durationSeconds}s)
                  </span>
                )}
              </div>

              {/* Main Record Action Button */}
              <div className="flex items-center gap-2.5">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2.5 px-4 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    Record Voice Directions
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="flex-1 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold py-2.5 px-4 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <MicOff className="w-4 h-4" />
                    Stop Recording ({recordTimer}s)
                  </button>
                )}

                {/* Play Audio Button */}
                {audioElement && !isRecording && (
                  <button
                    type="button"
                    onClick={handleToggleAudioPlay}
                    className="w-10 h-10 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded flex items-center justify-center cursor-pointer"
                    title="Play recorded audio"
                  >
                    {audioPlaying ? (
                      <Pause className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <Play className="w-4 h-4 text-emerald-700 ml-0.5" />
                    )}
                  </button>
                )}
              </div>

              {/* Spoken Transcript Preview */}
              <div>
                <label className="text-[11px] font-medium text-slate-700 block mb-1">
                  Transcribed Directions:
                </label>
                <textarea
                  rows={2}
                  value={recordedTranscript}
                  onChange={(e) => setRecordedTranscript(e.target.value)}
                  placeholder="Voice note transcript will appear here. You can also edit or fine-tune words..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:outline-none focus:border-slate-800 bg-white"
                />
              </div>

              {/* Quick Preset Buttons for Instant Demo Testing */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[10px] text-slate-500 block mb-1.5 uppercase tracking-wide">
                  Quick test voice notes:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleUsePreset(
                        'Street 19 pe enter hoke samnay Madni Masjid aayegi, masjid ke bilkul peechay gali mein second house hai, blue gate aur bahar white Corolla khari hogi.'
                      )
                    }
                    className="text-[10px] bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 px-2 py-1 rounded cursor-pointer"
                  >
                    Urdu: Masjid and Blue Gate
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUsePreset(
                        'Take the left turn after City Bakery, 3rd house on the right with green gate, bell is on the pillar.'
                      )
                    }
                    className="text-[10px] bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 px-2 py-1 rounded cursor-pointer"
                  >
                    English: Green Gate and Bakery
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUsePreset('...haan theek hai bhai...', true)}
                    className="text-[10px] bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded cursor-pointer"
                    title="Test invalid audio / rejection handling"
                  >
                    Test Invalid Audio
                  </button>
                </div>
              </div>
            </div>

            {/* Validation Feedback Banner */}
            {verificationFeedback && (
              <div
                className={`p-3 rounded border text-xs flex items-start gap-2.5 ${
                  verificationFeedback.isValid
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                {verificationFeedback.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {verificationFeedback.isValid
                      ? 'Direction Validation Passed'
                      : 'Unclear Directions Detected'}
                  </p>
                  <p className="text-[11px] mt-0.5">{verificationFeedback.feedback}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Submission Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200">
          <button
            type="button"
            onClick={handleSubmitConfirmation}
            disabled={isVerifying || isRecording}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <>Validating Doorstep Directions...</>
            ) : isSubmittedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Update Saved Confirmation
              </>
            ) : (
              <>
                Confirm Intent and Unlock Parcel QR
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="text-[10px] text-center text-slate-500 mt-2">
            PATAH Delivery Confirmation. Zero-friction courier parcel handoff.
          </p>
        </div>
      </div>
    </div>
  );
};
