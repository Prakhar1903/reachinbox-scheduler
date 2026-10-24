'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  RotateCw,
  Check,
  Star,
  Archive,
  ArrowDownUp,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type EmailFilter = 'all' | 'starred' | 'archived';
export type SortOrder = 'newest' | 'oldest';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isSearching?: boolean;
  filter?: EmailFilter;
  onFilterChange?: (filter: EmailFilter) => void;
  sortOrder?: SortOrder;
  onSortChange?: (sort: SortOrder) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  isSearching,
  filter = 'all',
  onFilterChange,
  sortOrder = 'newest',
  onSortChange,
}) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['emails'] }),
        queryClient.refetchQueries({ queryKey: ['searchEmails'] }),
      ]);
      toast.success('Emails updated');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      // Ensure spinner visible for tactile feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const isFilterActive = filter !== 'all' || sortOrder !== 'newest';

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

        {/* Filter Popover Button */}
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            title="Filter & Sort Options"
            className={cn(
              'relative p-2 rounded-full transition-colors cursor-pointer',
              isFilterOpen || isFilterActive
                ? 'bg-emerald-50 text-[#029E4D]'
                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {isFilterActive && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#029E4D]" />
            )}
          </button>

          {/* Filter Dropdown Menu */}
          {isFilterOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-30 animate-in fade-in-50 zoom-in-95">
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Filter & Sort
                </span>
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterChange?.('all');
                      onSortChange?.('newest');
                    }}
                    className="text-[11px] text-[#029E4D] hover:underline font-medium flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>

              {/* Filter By Section */}
              <div className="p-2 border-b border-gray-100">
                <div className="text-[11px] font-semibold text-gray-400 px-2 py-1 uppercase">
                  Show
                </div>
                <button
                  type="button"
                  onClick={() => onFilterChange?.('all')}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filter === 'all'
                      ? 'bg-emerald-50 text-[#029E4D]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span>All Emails</span>
                  {filter === 'all' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onFilterChange?.('starred')}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filter === 'starred'
                      ? 'bg-emerald-50 text-[#029E4D]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    Starred Only
                  </span>
                  {filter === 'starred' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onFilterChange?.('archived')}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filter === 'archived'
                      ? 'bg-emerald-50 text-[#029E4D]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Archive className="w-3.5 h-3.5 text-emerald-600" />
                    Archived Only
                  </span>
                  {filter === 'archived' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Sort Order Section */}
              <div className="p-2">
                <div className="text-[11px] font-semibold text-gray-400 px-2 py-1 uppercase flex items-center gap-1">
                  <ArrowDownUp className="w-3 h-3" />
                  Sort By Date
                </div>
                <button
                  type="button"
                  onClick={() => onSortChange?.('newest')}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    sortOrder === 'newest'
                      ? 'bg-emerald-50 text-[#029E4D]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span>Newest First</span>
                  {sortOrder === 'newest' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onSortChange?.('oldest')}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    sortOrder === 'oldest'
                      ? 'bg-emerald-50 text-[#029E4D]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span>Oldest First</span>
                  {sortOrder === 'oldest' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Icon Button with Live Animation */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh Queues & Emails"
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
        >
          <RotateCw
            className={cn('w-4 h-4 transition-transform', isRefreshing && 'animate-spin text-[#029E4D]')}
          />
        </button>
      </div>
    </header>
  );
};
