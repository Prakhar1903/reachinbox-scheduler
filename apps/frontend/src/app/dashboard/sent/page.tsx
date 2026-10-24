'use client';

import React, { useState, useMemo } from 'react';
import { useEmails, useSearchEmails } from '@/hooks/useEmails';
import { TopBar, EmailFilter, SortOrder } from '@/components/layout/TopBar';
import { EmailRow } from '@/components/email/EmailRow';
import { EmptyState } from '@/components/ui/EmptyState';

export default function SentEmailsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<EmailFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const { data: regularData, isLoading: regularLoading } = useEmails('SENT');
  const { data: searchResults, isLoading: searchLoading } = useSearchEmails(
    searchQuery,
    'SENT'
  );

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);
  const isLoading = isSearching ? searchLoading : regularLoading;

  const displayedEmails = useMemo(() => {
    let list = isSearching
      ? [...(searchResults?.emails || [])]
      : [...(regularData?.emails || [])];

    // Filter
    if (filter === 'starred') {
      list = list.filter((e) => e.isStarred);
    } else if (filter === 'archived') {
      list = list.filter((e) => e.isArchived);
    }

    // Sort
    list.sort((a, b) => {
      const timeA = new Date(a.sentAt || a.scheduledAt || a.createdAt).getTime();
      const timeB = new Date(b.sentAt || b.scheduledAt || b.createdAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [isSearching, searchResults, regularData, filter, sortOrder]);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-white">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={searchLoading}
        filter={filter}
        onFilterChange={setFilter}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
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
            type={isSearching ? 'search' : 'sent'}
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
