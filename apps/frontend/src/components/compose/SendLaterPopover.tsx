'use client';

import React, { useState, useEffect } from 'react';
import { Clock, X, AlertCircle } from 'lucide-react';
import { format, addDays, setHours, setMinutes, setSeconds, addMinutes } from 'date-fns';
import { Button } from '../ui/Button';
import { toast } from 'sonner';

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
  const getSafeInitialDate = (date: Date) => {
    if (date instanceof Date && !isNaN(date.getTime()) && date.getTime() > Date.now()) {
      return date;
    }
    return addMinutes(new Date(), 2);
  };

  const [tempDate, setTempDate] = useState<Date>(() => getSafeInitialDate(selectedDate));

  // Sync tempDate whenever the popover is opened or selectedDate changes
  useEffect(() => {
    if (isOpen) {
      setTempDate(getSafeInitialDate(selectedDate));
    }
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const now = new Date();
  const isValidDate = tempDate instanceof Date && !isNaN(tempDate.getTime());
  const isPast = !isValidDate || tempDate.getTime() <= now.getTime();

  const handlePreset = (presetFn: () => Date) => {
    setTempDate(presetFn());
  };

  const getTomorrow10am = () => {
    const tomorrow = addDays(new Date(), 1);
    return setSeconds(setMinutes(setHours(tomorrow, 10), 0), 0);
  };
  const getTomorrow11am = () => {
    const tomorrow = addDays(new Date(), 1);
    return setSeconds(setMinutes(setHours(tomorrow, 11), 0), 0);
  };
  const getTomorrow3pm = () => {
    const tomorrow = addDays(new Date(), 1);
    return setSeconds(setMinutes(setHours(tomorrow, 15), 0), 0);
  };
  const getTestIn2Minutes = () => addMinutes(new Date(), 2);

  // Format for HTML datetime-local input safely
  const formattedInputValue = isValidDate ? format(tempDate, "yyyy-MM-dd'T'HH:mm") : '';
  const minAllowedDateTime = format(now, "yyyy-MM-dd'T'HH:mm");

  const handleDone = () => {
    const currentNow = Date.now();
    if (!isValidDate || tempDate.getTime() <= currentNow) {
      toast.error('Scheduled time cannot be in the past. Please pick a future date and time.');
      return;
    }
    onConfirm(tempDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs">
      <div className="w-[380px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Send Later</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-full p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom date & time picker */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
            Pick future date & time
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              value={formattedInputValue}
              min={minAllowedDateTime}
              onChange={(e) => {
                if (e.target.value) {
                  const chosen = new Date(e.target.value);
                  if (!isNaN(chosen.getTime())) {
                    setTempDate(chosen);
                  }
                }
              }}
              className={`w-full bg-[#F4F5F7] border rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:bg-white focus:outline-none transition-colors ${
                isPast
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-gray-200 focus:border-[#029E4D]'
              }`}
            />
          </div>
          {isPast && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium mt-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Selected time is in the past. Please choose a future time.
            </p>
          )}
        </div>

        {/* Quick Presets matching Figma */}
        <div className="mt-4 space-y-1">
          <button
            type="button"
            onClick={() => handlePreset(getTestIn2Minutes)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#029E4D] font-medium hover:bg-emerald-50 transition-colors flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#029E4D]" /> In 2 Minutes (Fast Test)
            </span>
            <span className="text-xs text-emerald-600">
              {format(getTestIn2Minutes(), 'h:mm a')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(getTomorrow10am)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>Tomorrow, 10:00 AM</span>
            <span className="text-xs text-gray-400">10:00 AM</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(getTomorrow11am)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>Tomorrow, 11:00 AM</span>
            <span className="text-xs text-gray-400">11:00 AM</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset(getTomorrow3pm)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer"
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
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 cursor-pointer"
          >
            Cancel
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isPast}
            onClick={handleDone}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
