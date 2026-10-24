import React from 'react';
import Link from 'next/link';
import { Mail, Clock, Plus } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  type: 'scheduled' | 'sent' | 'search';
  query?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ type, query }) => {
  if (type === 'search') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
          <Mail className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No matching emails found</h3>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          We couldn't find any emails matching &quot;{query}&quot;. Try checking for spelling errors or searching another keyword.
        </p>
      </div>
    );
  }

  if (type === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-[#EBFBF2] flex items-center justify-center text-[#029E4D] mb-4">
          <Mail className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No sent emails yet</h3>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          When your scheduled emails are sent via Ethereal SMTP, they will show up here along with their test preview links.
        </p>
        <Link href="/dashboard/compose">
          <Button variant="outline">
            <Plus className="w-4 h-4 mr-1" /> Compose New Email
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-[#FFF3E0] flex items-center justify-center text-[#E67E22] mb-4">
        <Clock className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No scheduled emails</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        You don&apos;t have any pending emails in the schedule. Compose a campaign or upload a CSV lead list to get started.
      </p>
      <Link href="/dashboard/compose">
        <Button variant="primary">
          <Plus className="w-4 h-4 mr-1" /> Schedule an Email
        </Button>
      </Link>
    </div>
  );
};
