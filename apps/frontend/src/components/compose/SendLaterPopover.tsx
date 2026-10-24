'use client';

import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { format, addDays, setHours, setMinutes, setSeconds, addMinutes } from 'date-fns';
import { Button } from '../ui/Button';

interface SendLaterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onConfirm: (date: Date) => void;
}

export const SendLaterPopover: React.FC<SendLaterPopoverProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onConfirm,
}) => {
  const [tempDate, setTempDate] = useState<Date>(selectedDate);

  if (!isOpen) return null;

  const handlePreset = (targetDate: Date) => {
    setTempDate(targetDate);
  };

  const tomorrow = addDays(new Date(), 1);
  const tomorrow10am = setSeconds(setMinutes(setHours(tomorrow, 10), 0), 0);
  const tomorrow11am = setSeconds(setMinutes(setHours(tomorrow, 11), 0), 0);
  const tomorrow3pm = setSeconds(setMinutes(setHours(tomorrow, 15), 0), 0);
  const testIn2Minutes = addMinutes(new Date(), 2);

  // Format for HTML datetime-local input
  const formattedInputValue = format(tempDate, "yyyy-MM-dd'T'HH:mm");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs">
      <div className="w-[360px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Send Later</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-full p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom date & time picker */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
            Pick date & time
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              value={formattedInputValue}
              onChange={(e) => {
                if (e.target.value) {
                  setTempDate(new Date(e.target.value));
                }
              }}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              className="w-full bg-[#F4F5F7] border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:bg-white focus:border-[#029E4D] focus:outline-none"
            />
          </div>
        </div>

        {/* Quick Presets matching Figma */}
        <div className="mt-4 space-y-1">
          <button
            type="button"
            onClick={() => handlePreset(testIn2Minutes)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#029E4D] font-medium hover:bg-emerald-50 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#029E4D]" /> In 2 Minutes (Fast Test)
            </span>
            <span className="text-xs text-emerald-600">
              {format(testIn2Minutes, 'h:mm a')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(tomorrow10am)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between"
          >
            <span>Tomorrow, 10:00 AM</span>
            <span className="text-xs text-gray-400">10:00 AM</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(tomorrow11am)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between"
          >
            <span>Tomorrow, 11:00 AM</span>
            <span className="text-xs text-gray-400">11:00 AM</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(tomorrow3pm)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between"
          >
            <span>Tomorrow, 3:00 PM</span>
            <span className="text-xs text-gray-400">3:00 PM</span>
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            Cancel
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onConfirm(tempDate);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
