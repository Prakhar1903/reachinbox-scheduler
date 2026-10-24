import React from 'react';
import { Clock } from 'lucide-react';
import { cn, formatEmailDate } from '@/lib/utils';
import { EmailStatus } from '@/types';

interface BadgeProps {
  status: EmailStatus;
  date?: string | Date;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, date, className }) => {
  if (status === 'SCHEDULED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFF3E0] text-[#E67E22] border border-[#FFE0B2]',
          className
        )}
      >
        <Clock className="w-3.5 h-3.5 text-[#E67E22]" />
        {date ? formatEmailDate(date) : 'Scheduled'}
      </span>
    );
  }

  if (status === 'RATE_LIMITED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]',
          className
        )}
      >
        <Clock className="w-3.5 h-3.5 text-[#D97706]" />
        Rate Limited (Queued)
      </span>
    );
  }

  if (status === 'SENDING') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 animate-pulse',
          className
        )}
      >
        Sending...
      </span>
    );
  }

  if (status === 'FAILED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200',
          className
        )}
      >
        Failed
      </span>
    );
  }

  // SENT status
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F2F5] text-[#5A6A85]',
        className
      )}
    >
      Sent
    </span>
  );
};
