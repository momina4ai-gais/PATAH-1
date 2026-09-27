import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Order } from '../types';
import {
  Printer,
  Download,
  ExternalLink,
  X,
  Volume2,
  MapPin,
  CheckCircle2,
  Package,
  Sparkles,
} from 'lucide-react';

interface PrintLabelModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onOpenRiderView: (orderId: string) => void;
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  order,
  isOpen,
  onClose,
  onOpenRiderView,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [riderUrl, setRiderUrl] = useState<string>('');
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const targetUrl = `${origin}?flow=rider&orderId=${order.id}`;
    setRiderUrl(targetUrl);

    QRCode.toDataURL(targetUrl, {
      width: 450,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [isOpen, order.id]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `PATAH-QR-${order.orderNumber}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 print:bg-white print:p-0">
      <div className="bg-white rounded border border-slate-300 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] print:border-none print:shadow-none print:max-w-none">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-100 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
              P
            </span>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Print Parcel QR Sticker</h3>
              <p className="text-[11px] text-slate-500">
                Affix next to courier air-waybill for doorstep voice navigation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Printable Area */}
        <div className="p-6 overflow-y-auto print:p-0 flex flex-col items-center">
          <div
            ref={labelRef}
            id="printable-parcel-label"
            className="w-full max-w-sm bg-white border-2 border-slate-900 rounded p-4 text-slate-900 print:border-2 print:border-solid"
          >
            {/* Header of label */}
            <div className="border-b-2 border-slate-900 pb-2 mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold text-xs tracking-wider">
                    PATAH
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-tight bg-emerald-100 px-1 rounded border border-emerald-300">
                    Doorstep Verified
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                  REF: {order.orderNumber}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold block text-slate-800">PARCEL STICKER</span>
                <span className="text-[9px] text-slate-500">STICK BESIDE COURIER LABEL</span>
              </div>
            </div>

            {/* Rider instruction banner */}
            <div className="bg-amber-50 border border-amber-300 rounded p-2 mb-3 text-center">
              <p className="text-[11px] font-bold text-amber-950 uppercase tracking-tight flex items-center justify-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-amber-800" />
                Rider: Cannot find door? Scan QR
              </p>
              <p className="text-[10px] text-amber-900">
                Customer recorded voice directions and exact door pin
              </p>
            </div>

            {/* QR Code and basic info */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded border border-slate-200">
              <div className="w-28 h-28 bg-white p-1 rounded border border-slate-300 flex-shrink-0 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Rider scan QR code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-200 rounded" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-slate-900 truncate">{order.customerName}</p>
                <p className="text-[11px] font-mono text-slate-700">{order.customerPhone}</p>
                <p className="text-[10px] text-slate-600 line-clamp-2 mt-1">
                  {order.deliveryAddress}, {order.city}
                </p>

                {order.voiceNote?.landmarks && order.voiceNote.landmarks.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {order.voiceNote.landmarks.slice(0, 2).map((lm, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 px-1 py-0.5 rounded"
                      >
                        {lm}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer barcode graphic simulation */}
            <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-500">
              <div className="flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Pin and Voice Confirmed
              </div>
              <span className="font-mono">{order.id}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-3 text-center max-w-sm print:hidden">
            Couriers scan this QR code using a phone camera to play voice directions and launch one-tap map navigation.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            onClick={() => onOpenRiderView(order.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Rider View
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download QR
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 rounded transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Sticker
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
