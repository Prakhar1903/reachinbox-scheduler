'use client';

import React from 'react';
import Link from 'next/link';
import { Star, ExternalLink } from 'lucide-react';
import { EmailItem } from '@/types';
import { Badge } from '../ui/Badge';
import { useToggleStarEmail } from '@/hooks/useEmails';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EmailRowProps {
  email: EmailItem;
}

/** Extract a short display name from an email address like "John Doe <john@example.com>" or "john@example.com" */
function parseRecipientName(toAddress: string): string {
  // "John Doe <john@example.com>" → "John Doe"
  const angleMatch = toAddress.match(/^([^<]+)<[^>]+>$/);
  if (angleMatch) return angleMatch[1].trim();
  // "john.doe@example.com" → "John Doe"
  const localPart = toAddress.split('@')[0];
  return localPart
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const EmailRow: React.FC<EmailRowProps> = ({ email }) => {
  const toggleStarMutation = useToggleStarEmail();

  const plainBodyExcerpt = (email.body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const recipientName = parseRecipientName(email.toAddress);

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const res = await toggleStarMutation.mutateAsync(email.id);
      toast.success(res.isStarred ? 'Email starred' : 'Email unstarred');
    } catch {
      toast.error('Failed to toggle star');
    }
  };

  return (
    <div className="group border-b border-[#F0F2F5] hover:bg-[#F8FAFB] transition-colors flex items-center px-8 py-5 gap-6 cursor-pointer">
      {/* Recipient column — fixed width, bold, Figma "To: Sarah Wilson" style */}
      <Link
        href={`/dashboard/${email.id}`}
        className="w-44 shrink-0 text-sm font-semibold text-gray-900 truncate"
      >
        To: {recipientName}
      </Link>

      {/* Badge + Subject + Body excerpt — single flowing line */}
      <Link
        href={`/dashboard/${email.id}`}
        className="flex-1 flex items-center gap-3 min-w-0 text-sm"
      >
        <Badge
          status={email.status}
          date={email.status === 'SCHEDULED' ? email.scheduledAt : undefined}
          className="shrink-0"
        />

        <div className="flex-1 min-w-0 truncate">
          <span className="font-semibold text-gray-900">
            {email.subject}
          </span>
          <span className="text-gray-400 font-normal ml-2">
            -{' '}
            {plainBodyExcerpt.length > 0
              ? plainBodyExcerpt.slice(0, 100)
              : 'No preview available'}
            {plainBodyExcerpt.length > 100 ? '...' : ''}
          </span>
        </div>
      </Link>

      {/* Ethereal preview link — only visible when sent */}
      {email.etherealUrl && (
        <a
          href={email.etherealUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="View email in Ethereal SMTP preview"
          className="shrink-0 text-xs text-[#029E4D] hover:underline flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span>Preview</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {/* Star toggle — appears on hover or when starred */}
      <button
        type="button"
        onClick={handleToggleStar}
        disabled={toggleStarMutation.isPending}
        className={cn(
          'p-1 shrink-0 transition-all',
          email.isStarred
            ? 'text-amber-400 opacity-100'
            : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'
        )}
      >
        <Star className={cn('w-4 h-4', email.isStarred && 'fill-amber-400')} />
      </button>
    </div>
  );
};
