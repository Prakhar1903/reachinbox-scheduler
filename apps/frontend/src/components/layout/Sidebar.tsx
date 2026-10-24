'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Clock, Send, ChevronDown, Plus, ExternalLink, Slack, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmails } from '@/hooks/useEmails';
import { SlackModal } from './SlackModal';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { data: emailsData } = useEmails('SCHEDULED');
  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);

  const scheduledCount = emailsData?.stats.scheduled ?? 0;
  const sentCount = emailsData?.stats.sent ?? 0;

  const isScheduled = pathname.includes('/dashboard/scheduled') || pathname === '/dashboard';
  const isSent = pathname.includes('/dashboard/sent');

  return (
    <aside className="w-64 bg-white border-r border-[#EBEFF2] flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="px-6 py-5 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-mono font-black text-2xl tracking-tighter text-black">
            ONB
          </span>
        </Link>
      </div>

      {/* User Card */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between p-2 rounded-xl bg-[#F8FAFC] border border-[#EBEFF2] hover:bg-gray-100 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-gray-200 shrink-0">
              {user?.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name || 'User'}
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-gray-600 bg-emerald-100 text-sm">
                  {user?.name?.charAt(0) || 'O'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.name || 'Oliver Brown'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || 'oliver.brown@domain.io'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        </div>
      </div>

      {/* Primary Compose Action Button */}
      <div className="px-4 pt-3 pb-2">
        <Link
          href="/dashboard/compose"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border border-[#029E4D] text-[#029E4D] font-medium text-sm hover:bg-[#EBFBF2] transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Compose</span>
        </Link>
      </div>

      {/* Navigation section */}
      <div className="px-4 py-4 flex-1 overflow-y-auto">
        <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2 px-3">
          Core
        </div>

        <nav className="space-y-1">
          {/* Scheduled Nav Item */}
          <Link
            href="/dashboard/scheduled"
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm font-medium transition-colors ${
              isScheduled
                ? 'bg-[#EBFBF2] text-gray-900 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className={`w-4 h-4 ${isScheduled ? 'text-[#029E4D]' : 'text-gray-500'}`} />
              <span>Scheduled</span>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isScheduled ? 'text-gray-800' : 'text-gray-500'
              }`}
            >
              {scheduledCount}
            </span>
          </Link>

          {/* Sent Nav Item */}
          <Link
            href="/dashboard/sent"
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm font-medium transition-colors ${
              isSent
                ? 'bg-[#EBFBF2] text-gray-900 font-semibold'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <Send className={`w-4 h-4 ${isSent ? 'text-[#029E4D]' : 'text-gray-500'}`} />
              <span>Sent</span>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isSent ? 'text-gray-800' : 'text-gray-500'
              }`}
            >
              {sentCount}
            </span>
          </Link>
        </nav>

        {/* System & Utilities */}
        <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mt-8 mb-2 px-3">
          Integrations & Ops
        </div>

        <div className="space-y-1">
          {/* Live BullMQ Queue Dashboard */}
          <a
            href="http://localhost:4000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3.5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>BullMQ Board</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>

          {/* Slack Integration */}
          <div className="px-3.5 py-2">
            {user?.hasSlackConnected ? (
              <button
                type="button"
                onClick={() => setIsSlackModalOpen(true)}
                title="Manage Slack Integration"
                className="w-full flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md border border-emerald-200 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Slack Connected
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold uppercase">Manage</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSlackModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-2 rounded-md font-medium transition-colors cursor-pointer"
              >
                <Slack className="w-3.5 h-3.5 text-purple-600" />
                <span>Connect Slack</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-[#EBEFF2]">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>

      {/* Slack Connection & Testing Modal */}
      <SlackModal
        isOpen={isSlackModalOpen}
        onClose={() => setIsSlackModalOpen(false)}
      />
    </aside>
  );
};
