import React, { useState } from 'react';
import {
  Info,
  X,
  Plus,
} from 'lucide-react';

interface NavbarProps {
  orderCount: number;
  onNewOrder: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  orderCount,
  onNewOrder,
}) => {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  return (
    <>
      <header className="bg-slate-950 border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm">
                P
              </div>
              <span className="font-bold text-sm tracking-wider text-white">PATAH</span>
            </div>
          </div>

          {/* Right Controls: New Order and Info */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline-block">
              {orderCount} {orderCount === 1 ? 'order' : 'orders'}
            </span>

            <button
              onClick={onNewOrder}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Order
            </button>

            <button
              onClick={() => setIsHowItWorksOpen(true)}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
              title="How PATAH Works"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* How PATAH Works Modal */}
      {isHowItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded border border-slate-300 shadow-xl max-w-xl w-full overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                  P
                </span>
                <h3 className="font-semibold text-slate-900 text-sm">PATAH Workflow</h3>
              </div>
              <button
                onClick={() => setIsHowItWorksOpen(false)}
                className="text-slate-500 hover:text-slate-800 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700 overflow-y-auto max-h-[80vh]">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-800">
                <p className="font-semibold text-xs mb-0.5">Non-Blocking Delivery Assistance:</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  PATAH only ever adds assistance and never blocks your courier shipment. You book parcels with your courier as normal; customer confirmation adds exact doorstep pin and voice directions for the rider.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex gap-2.5">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-900">Parse or Enter Order</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Paste the customer's raw WhatsApp message to automatically extract item, quantity, address, and phone number, or enter them manually.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-900">Forward Link on WhatsApp</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Send the generated unique link to the customer over WhatsApp. The customer drops a pin on the map and records a voice note with doorstep directions.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-900">Generate and Print QR Sticker</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      When the customer confirms with valid directions, click "Generate QR", print the sticker, and affix it alongside your courier's shipping label.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-900">Rider Phone Camera Scan</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      If the rider cannot find the door, they scan the QR code with their ordinary phone camera to see the pinned location, listen to the voice note, and open one-tap navigation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsHowItWorksOpen(false)}
                className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
