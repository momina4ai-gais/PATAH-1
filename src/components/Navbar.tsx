import React, { useState } from 'react';
import { MerchantUser } from '../types';
import {
  Info,
  X,
  Plus,
  LogOut,
  Store,
  User,
} from 'lucide-react';

interface NavbarProps {
  orderCount: number;
  currentUser?: MerchantUser | null;
  onNewOrder: () => void;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  orderCount,
  currentUser,
  onNewOrder,
  onSignOut,
}) => {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  return (
    <>
      <header className="bg-[#01411C] border-b-2 border-white text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo & Brand with Pakistan Green + White Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-white text-[#01411C] flex items-center justify-center font-black text-sm tracking-tighter shadow-xs">
                P
              </div>
              <div>
                <span className="font-black text-sm tracking-wider text-white block leading-none">
                  PATAH
                </span>
                <span className="text-[10px] uppercase font-bold text-emerald-200 tracking-wider">
                  Pakistan Merchant Hub
                </span>
              </div>
            </div>

            {currentUser && (
              <div className="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-emerald-800 text-xs">
                <Store className="w-3.5 h-3.5 text-emerald-300" />
                <span className="font-semibold text-white">{currentUser.storeName}</span>
                <span className="text-emerald-300 text-[11px]">({currentUser.name})</span>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-emerald-100 hidden sm:inline-block font-mono bg-[#002d13] px-2 py-0.5 rounded border border-emerald-800">
              {orderCount} {orderCount === 1 ? 'order' : 'orders'}
            </span>

            <button
              onClick={onNewOrder}
              className="bg-white hover:bg-emerald-50 text-[#01411C] text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#01411C]" />
              New Order
            </button>

            <button
              onClick={() => setIsHowItWorksOpen(true)}
              className="p-1.5 rounded text-emerald-100 hover:text-white hover:bg-[#002d13] transition-colors cursor-pointer"
              title="How PATAH Works"
            >
              <Info className="w-4 h-4" />
            </button>

            {onSignOut && (
              <button
                onClick={onSignOut}
                className="p-1.5 rounded text-emerald-200 hover:text-white hover:bg-[#002d13] transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* How PATAH Works Modal */}
      {isHowItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded border border-slate-300 shadow-xl max-w-xl w-full overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-[#01411C] text-white">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-white text-[#01411C] font-bold text-xs flex items-center justify-center">
                  P
                </span>
                <h3 className="font-semibold text-white text-sm">PATAH Workflow</h3>
              </div>
              <button
                onClick={() => setIsHowItWorksOpen(false)}
                className="text-emerald-100 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700 overflow-y-auto max-h-[80vh]">
              <div className="p-3 bg-emerald-50 rounded border border-emerald-300 text-slate-800">
                <p className="font-semibold text-xs text-[#01411C] mb-0.5">Non-Blocking Delivery Assistance:</p>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  PATAH never blocks your courier shipment. Book parcels with your courier as normal; customer confirmation adds exact doorstep pin and voice directions for the rider.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex gap-2.5">
                  <span className="w-5 h-5 rounded bg-[#01411C] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
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
                  <span className="w-5 h-5 rounded bg-[#01411C] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
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
                  <span className="w-5 h-5 rounded bg-[#01411C] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
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
                  <span className="w-5 h-5 rounded bg-[#01411C] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-900">Rider Phone Camera Scan</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      If the rider cannot find the door, they scan the QR code with their phone camera to see the pinned location, listen to the voice note in Urdu / Roman Urdu, and launch one-tap navigation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsHowItWorksOpen(false)}
                className="bg-[#01411C] text-white text-xs font-semibold px-3 py-1.5 rounded cursor-pointer"
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
