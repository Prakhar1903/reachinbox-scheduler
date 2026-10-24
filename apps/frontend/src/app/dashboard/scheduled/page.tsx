'use client';

import React, { useState } from 'react';
import { useEmails, useSearchEmails } from '@/hooks/useEmails';
import { TopBar } from '@/components/layout/TopBar';
import { EmailRow } from '@/components/email/EmailRow';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ScheduledEmailsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: regularData, isLoading: regularLoading } = useEmails('SCHEDULED');
  const { data: searchResults, isLoading: searchLoading } = useSearchEmails(
    searchQuery,
    'SCHEDULED'
  );

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);
  const isLoading = isSearching ? searchLoading : regularLoading;

  const displayedEmails = isSearching
    ? searchResults?.emails || []
    : regularData?.emails || [];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-white">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={searchLoading}
      />

      <main className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-12 bg-gray-100 rounded-lg animate-pulse w-full"
              />
            ))}
          </div>
        ) : displayedEmails.length === 0 ? (
          <EmptyState
            type={isSearching ? 'search' : 'scheduled'}
            query={searchQuery}
          />
        ) : (
          <div className="divide-y divide-[#F0F2F5]">
            {displayedEmails.map((email: any) => (
              <EmailRow key={email.id} email={email} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
