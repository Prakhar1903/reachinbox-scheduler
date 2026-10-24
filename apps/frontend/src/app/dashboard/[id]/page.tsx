'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star, Trash2, Archive, ExternalLink, ChevronDown } from 'lucide-react';
import {
  useEmailDetail,
  useToggleStarEmail,
  useToggleArchiveEmail,
  useDeleteEmail,
} from '@/hooks/useEmails';
import { formatFullDate, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';

export default function EmailDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { data: email, isLoading, error } = useEmailDetail(id);

  const toggleStarMutation = useToggleStarEmail();
  const toggleArchiveMutation = useToggleArchiveEmail();
  const deleteEmailMutation = useDeleteEmail();

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#029E4D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="flex-1 p-8 text-center">
        <h2 className="text-lg font-bold text-gray-800">Email not found</h2>
        <Link href="/dashboard" className="text-sm text-[#029E4D] hover:underline mt-2 inline-block">
          ← Return to dashboard
        </Link>
      </div>
    );
  }

  const senderInitial = (email.sender?.name || email.sender?.address || 'S').charAt(0).toUpperCase();

  const handleStar = async () => {
    try {
      const res = await toggleStarMutation.mutateAsync(email.id);
      toast.success(res.isStarred ? 'Email starred' : 'Email unstarred');
    } catch {
      toast.error('Failed to update star');
    }
  };

  const handleArchive = async () => {
    try {
      const res = await toggleArchiveMutation.mutateAsync(email.id);
      toast.success(res.isArchived ? 'Email moved to archive' : 'Email restored from archive');
    } catch {
      toast.error('Failed to archive email');
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this email?')) {
      try {
        await deleteEmailMutation.mutateAsync(email.id);
        toast.success('Email deleted successfully');
        router.push('/dashboard');
      } catch {
        toast.error('Failed to delete email');
      }
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col min-h-screen">
      {/* Top Header matching Figma slide 4 */}
      <div className="h-16 px-8 border-b border-[#EBEFF2] flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-bold text-gray-900 truncate">
            {email.subject}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Star Button */}
          <button
            onClick={handleStar}
            disabled={toggleStarMutation.isPending}
            title={email.isStarred ? 'Starred' : 'Star email'}
            className={cn(
              'p-2 rounded-full hover:bg-gray-100 transition-colors',
              email.isStarred ? 'text-amber-400' : 'text-gray-400 hover:text-amber-400'
            )}
          >
            <Star className={cn('w-4 h-4', email.isStarred && 'fill-amber-400')} />
          </button>

          {/* Archive Button */}
          <button
            onClick={handleArchive}
            disabled={toggleArchiveMutation.isPending}
            title={email.isArchived ? 'Archived' : 'Archive email'}
            className={cn(
              'p-2 rounded-full hover:bg-gray-100 transition-colors',
              email.isArchived ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-700'
            )}
          >
            <Archive className="w-4 h-4" />
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={deleteEmailMutation.isPending}
            title="Delete email"
            className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {email.etherealUrl && (
            <a
              href={email.etherealUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-[#EBFBF2] text-[#029E4D] border border-[#B7E8CE] hover:bg-[#DFF8E9] transition-colors"
            >
              <span>View in Ethereal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Main Email View */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-8 py-8">
        {/* Sender Info Row */}
        <div className="flex items-start justify-between pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {/* Round Avatar */}
            <div className="w-10 h-10 rounded-full bg-[#029E4D] text-white flex items-center justify-center font-bold text-base shadow-xs">
              {senderInitial}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">
                  {email.sender?.name || 'Campaign Sender'}
                </span>
                <span className="text-xs text-gray-500">
                  &lt;{email.sender?.address || 'sender@example.com'}&gt;
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <span>to {email.toAddress}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-gray-500">
              {formatFullDate(email.sentAt || email.scheduledAt)}
            </span>
            <Badge
              status={email.status}
              date={email.status === 'SCHEDULED' ? email.scheduledAt : undefined}
            />
          </div>
        </div>

        {/* Email Body */}
        <div className="py-8 prose prose-emerald max-w-none text-gray-800 text-sm leading-relaxed">
          <div
            dangerouslySetInnerHTML={{ __html: email.body }}
            className="space-y-4"
          />
        </div>
      </div>
    </div>
  );
}
