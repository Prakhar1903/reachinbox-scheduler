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

export const EmailRow: React.FC<EmailRowProps> = ({ email }) => {
  const toggleStarMutation = useToggleStarEmail();

  const plainBodyExcerpt = (email.body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
    <div className="group border-b border-[#F0F2F5] hover:bg-[#F9FAFB] transition-colors flex items-center px-6 py-3.5 gap-4 cursor-pointer text-sm">
      {/* Recipient column */}
      <Link
        href={`/dashboard/${email.id}`}
        className="w-48 shrink-0 font-medium text-gray-900 truncate"
      >
        To: {email.toAddress}
      </Link>

      {/* Status Badge + Subject + Body Excerpt */}
      <Link
        href={`/dashboard/${email.id}`}
        className="flex-1 flex items-center gap-3 min-w-0"
      >
        <Badge
          status={email.status}
          date={email.status === 'SCHEDULED' ? email.scheduledAt : undefined}
          className="shrink-0"
        />

        <div className="flex-1 truncate">
          <span className="font-semibold text-gray-900 mr-2">
            {email.subject}
          </span>
          <span className="text-gray-500 font-normal">
            - {plainBodyExcerpt.slice(0, 90)}...
          </span>
        </div>
      </Link>

      {/* Ethereal preview link if sent */}
      {email.etherealUrl && (
        <a
          href={email.etherealUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in Ethereal Fake SMTP Preview"
          className="text-xs text-[#029E4D] hover:underline flex items-center gap-1 shrink-0 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200"
        >
          <span>Preview Ethereal</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {/* Star button */}
      <button
        type="button"
        onClick={handleToggleStar}
        disabled={toggleStarMutation.isPending}
        className={cn(
          'p-1 shrink-0 transition-colors',
          email.isStarred ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'
        )}
      >
        <Star className={cn('w-4 h-4', email.isStarred && 'fill-amber-400')} />
      </button>
    </div>
  );
};
