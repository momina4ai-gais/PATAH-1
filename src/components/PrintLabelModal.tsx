import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Order } from '../types';
import { encodeOrderForQR, copyTextToClipboard } from '../lib/api';
import {
  Printer,
  Download,
  ExternalLink,
  X,
  Volume2,
  CheckCircle2,
  Copy,
  Check,
  Smartphone,
  Settings,
  HelpCircle,
  Lock,
} from 'lucide-react';

interface PrintLabelModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [riderUrl, setRiderUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [customOrigin, setCustomOrigin] = useState<string>('');
  const labelRef = useRef<HTMLDivElement>(null);

  // Determine current origin or server configured URL
  useEffect(() => {
    if (!isOpen) return;

    let defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    if (!customOrigin) {
      setCustomOrigin(defaultOrigin);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || order.status === 'DELIVERED') return;

    const base = customOrigin.trim() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    const compactData = encodeOrderForQR(order);
    const targetUrl = `${base.replace(/\/$/, '')}?flow=rider&orderId=${order.id}${compactData ? `&d=${compactData}` : ''}`;
    setRiderUrl(targetUrl);

    QRCode.toDataURL(targetUrl, {
      width: 450,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [isOpen, order, customOrigin]);

  if (!isOpen) return null;

  const isOrderDelivered = order.status === 'DELIVERED';

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

  const handleCopyUrl = async () => {
    const ok = await copyTextToClipboard(riderUrl);
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    customOrigin.includes('localhost') ||
    customOrigin.includes('127.0.0.1')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 print:bg-white print:p-0">
      <div className="bg-white rounded border border-slate-300 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[94vh] print:border-none print:shadow-none print:max-w-none">
        {/* Header */}
        <div className="px-5 py-3 border-b-2 border-white flex items-center justify-between bg-[#01411C] text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-white text-[#01411C] flex items-center justify-center font-black text-xs">
              P
            </span>
            <div>
              <h3 className="font-semibold text-white text-sm">Print Parcel QR Sticker</h3>
              <p className="text-[11px] text-emerald-200">
                Self-contained QR with verified doorstep pin and Urdu voice directions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-emerald-100 hover:text-white hover:bg-[#002d13] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Printable Area */}
        <div className="p-5 overflow-y-auto print:p-0 flex flex-col items-center space-y-4">
          {isOrderDelivered ? (
            <div className="w-full max-w-sm bg-slate-50 border border-slate-300 rounded p-6 text-center space-y-2">
              <Lock className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900">QR Code Deactivated</p>
              <p className="text-xs text-slate-600">
                Order #{order.orderNumber} has been marked as delivered. Parcel QR labels cannot be generated or scanned after delivery.
              </p>
            </div>
          ) : (
          <>
          <div
            ref={labelRef}
            id="printable-parcel-label"
            className="w-full max-w-sm bg-white border-2 border-[#01411C] rounded p-4 text-slate-900 print:border-2 print:border-solid"
          >
            {/* Header of label */}
            <div className="border-b-2 border-[#01411C] pb-2 mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-[#01411C] text-white font-bold text-xs tracking-wider">
                    PATAH
                  </span>
                  <span className="text-[10px] font-bold text-[#01411C] uppercase tracking-tight bg-emerald-100 px-1 rounded border border-emerald-300">
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

          {/* QR Destination & Mobile Diagnostics (Print Hidden) */}
          <div className="w-full max-w-sm bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-2 print:hidden">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                QR Target URL
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer font-medium"
              >
                <Settings className="w-3 h-3" />
                {showConfig ? 'Hide Settings' : 'Network Settings'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={riderUrl}
                className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-[11px] font-mono text-slate-600 truncate focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="bg-white hover:bg-slate-100 border border-slate-300 rounded px-2 py-1 text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedUrl ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Explanation of phone scanning issues */}
            {isLocalhost && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-amber-700" />
                  Why phone scanning fails on localhost:
                </p>
                <p>
                  A physical phone camera scanning <span className="font-mono">localhost</span> connects to the phone itself, not this computer.
                </p>
                <p>
                  <strong>Quick fix:</strong> Click <strong>"Simulate Rider Scan"</strong> below to test in browser, or enter your computer's local Wi-Fi IP (e.g. <span className="font-mono">http://192.168.1.50:3000</span>) in Network Settings.
                </p>
              </div>
            )}

            {showConfig && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  QR Base Host (For phone scanning over Wi-Fi or custom domain)
                </label>
                <input
                  type="text"
                  value={customOrigin}
                  onChange={(e) => setCustomOrigin(e.target.value)}
                  placeholder="e.g. http://192.168.1.50:3000 or https://yourdomain.com"
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-slate-800"
                />
                <p className="text-[10px] text-slate-500">
                  Self-contained data payload is embedded in the QR code, ensuring the rider page works even if server state is disconnected.
                </p>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-1.5 rounded transition-colors cursor-pointer"
          >
            Close
          </button>

          {!isOrderDelivered && (
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
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#01411C] hover:bg-[#002d13] px-3.5 py-1.5 rounded transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Sticker
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
