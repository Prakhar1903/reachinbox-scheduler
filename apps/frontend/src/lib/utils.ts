import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEmailDate(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '';

  if (isToday(date)) {
    return format(date, 'h:mm:ss a');
  }
  if (isTomorrow(date)) {
    return `Tomorrow ${format(date, 'h:mm:ss a')}`;
  }
  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm:ss a')}`;
  }
  return format(date, 'EEE h:mm:ss a');
}

export function formatFullDate(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '';
  return format(date, 'MMM d, h:mm a');
}
