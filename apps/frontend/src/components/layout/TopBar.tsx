'use client';

import React from 'react';
import { Search, SlidersHorizontal, RotateCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isSearching?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  isSearching,
}) => {
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['emails'] });
    queryClient.invalidateQueries({ queryKey: ['searchEmails'] });
  };

  return (
    <header className="h-16 border-b border-[#EBEFF2] bg-white flex items-center justify-between px-8 sticky top-0 z-20">
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        {/* Pill shaped Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search (powered by Elasticsearch)..."
            className="w-full bg-[#F4F5F7] text-sm text-gray-800 placeholder-gray-400 pl-10 pr-4 py-2 rounded-full border border-transparent focus:border-gray-300 focus:bg-white focus:outline-none transition-all"
          />
          {isSearching && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-[#029E4D] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Filter and Refresh Icons */}
        <button
          title="Filter Options"
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        <button
          onClick={handleRefresh}
          title="Refresh Queues & Emails"
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
