'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  ChevronDown,
  X,
  Undo2,
  Redo2,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  ChevronsUpDown,
  ListOrdered,
  List,
  Indent,
  Outdent,
  Quote,
  Code,
  Strikethrough,
} from 'lucide-react';
import { useSenders } from '@/hooks/useSenders';
import { useScheduleEmails } from '@/hooks/useEmails';
import { CsvUploader } from './CsvUploader';
import { SendLaterPopover } from './SendLaterPopover';
import { Button } from '../ui/Button';
import { toast } from 'sonner';

export const ComposeForm: React.FC = () => {
  const router = useRouter();
  const { data: senders } = useSenders();
  const scheduleMutation = useScheduleEmails();

  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(100);
  const [body, setBody] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(Date.now() + 2 * 60 * 1000));
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);

  // Auto-select first sender when loaded
  React.useEffect(() => {
    if (senders && senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id);
    }
  }, [senders, selectedSenderId]);

  const addEmailsFromText = (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Split by comma, semicolon, space, or newline
    const tokens = text.split(/[,;\s\n]+/).map((t) => t.trim()).filter(Boolean);
    const validEmails: string[] = [];

    tokens.forEach((token) => {
      if (emailRegex.test(token)) {
        if (!recipients.includes(token) && !validEmails.includes(token)) {
          validEmails.push(token);
        }
      }
    });

    if (validEmails.length > 0) {
      setRecipients((prev) => [...prev, ...validEmails]);
      setRecipientInput('');
      return true;
    }
    return false;
  };

  const handleKeyDownRecipient = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (recipientInput.trim()) {
        const added = addEmailsFromText(recipientInput);
        if (!added && recipientInput.trim()) {
          toast.error('Please enter a valid email address (e.g. name@example.com)');
        }
      }
    } else if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
      // Remove last recipient on backspace
      setRecipients((prev) => prev.slice(0, prev.length - 1));
    }
  };

  const handleBlurRecipient = () => {
    if (recipientInput.trim()) {
      addEmailsFromText(recipientInput);
    }
  };

  const handlePasteRecipient = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      const added = addEmailsFromText(pasted);
      if (added) {
        e.preventDefault();
      }
    }
  };

  const removeRecipient = (indexToRemove: number) => {
    setRecipients(recipients.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUploadExtracted = (emails: string[]) => {
    setRecipients((prev) => Array.from(new Set([...prev, ...emails])));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Check if there is any uncommitted text in recipientInput
    let finalRecipients = [...recipients];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedInput = recipientInput.trim().replace(/[,;\s]/g, '');
    if (trimmedInput && emailRegex.test(trimmedInput)) {
      if (!finalRecipients.includes(trimmedInput)) {
        finalRecipients.push(trimmedInput);
        setRecipients(finalRecipients);
      }
      setRecipientInput('');
    }

    if (!selectedSenderId) {
      toast.error('Please select a sender');
      return;
    }
    if (finalRecipients.length === 0) {
      toast.error('Please add at least one recipient email');
      return;
    }
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Email body content is required');
      return;
    }

    try {
      await scheduleMutation.mutateAsync({
        senderId: selectedSenderId,
        toAddresses: finalRecipients,
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt: scheduledDate.toISOString(),
        delaySeconds: Number(delaySeconds) || 2,
        hourlyLimit: Number(hourlyLimit) || 100,
      });

      toast.success(`Scheduled ${finalRecipients.length} email(s) successfully!`);
      router.push('/dashboard/scheduled');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to schedule email');
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col min-h-screen">
      {/* Top Header matching Figma */}
      <div className="h-16 px-8 border-b border-[#EBEFF2] flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Compose New Email</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Attachment counter */}
          <div className="relative p-1.5 text-gray-500 hover:text-gray-900 cursor-pointer">
            <Paperclip className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 text-[10px] bg-emerald-600 text-white font-bold rounded-full w-4 h-4 flex items-center justify-center">
              1
            </span>
          </div>

          {/* Clock trigger for Send Later */}
          <button
            type="button"
            onClick={() => setIsSendLaterOpen(true)}
            className="p-1.5 text-gray-500 hover:text-[#029E4D] rounded-full hover:bg-emerald-50 transition-colors"
            title="Configure Scheduled Date & Time"
          >
            <Clock className="w-5 h-5" />
          </button>

          {/* Send Later action button */}
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={scheduleMutation.isPending}
            variant="outline"
            className="rounded-full px-6 py-2 border-[#029E4D] text-[#029E4D] hover:bg-[#EBFBF2] font-semibold text-sm"
          >
            Send Later
          </Button>
        </div>
      </div>

      {/* Main Compose Form Fields */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-8 py-6 max-w-5xl mx-auto w-full">
        {/* From Row */}
        <div className="flex items-center py-2.5 border-b border-gray-100">
          <label className="w-20 text-sm font-medium text-gray-500">From</label>
          <div className="relative flex-1">
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              className="appearance-none bg-gray-50 border border-gray-200 text-gray-900 text-sm font-medium rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-[#029E4D] cursor-pointer"
            >
              {senders?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.address} ({s.name || 'Ethereal SMTP'})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute left-52 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* To Row with Tag Chips & CSV Upload */}
        <div className="flex items-center py-2.5 border-b border-gray-100 gap-2">
          <label className="w-20 text-sm font-medium text-gray-500">To</label>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[36px]">
            {recipients.map((email, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#EBFBF2] text-[#029E4D] border border-[#B7E8CE]"
              >
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => removeRecipient(index)}
                  className="hover:text-red-500 p-0.5 rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={handleKeyDownRecipient}
              onBlur={handleBlurRecipient}
              onPaste={handlePasteRecipient}
              placeholder={recipients.length === 0 ? 'recipient@example.com (Type and press Enter or comma)' : 'Add more...'}
              className="flex-1 min-w-[220px] text-sm text-gray-800 placeholder-gray-400 focus:outline-none py-1"
            />
          </div>

          <div className="shrink-0">
            <CsvUploader onEmailsExtracted={handleUploadExtracted} />
          </div>
        </div>

        {/* Subject Row */}
        <div className="flex items-center py-2.5 border-b border-gray-100">
          <label className="w-20 text-sm font-medium text-gray-500">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none py-1 font-medium"
          />
        </div>

        {/* Rate Limiting & Interval Settings Row */}
        <div className="flex items-center gap-8 py-3 border-b border-gray-100 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-gray-600 font-medium text-xs">
              Delay between 2 emails:
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="3600"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-16 text-center text-sm font-medium bg-[#F4F5F7] border border-gray-200 rounded-md py-1 focus:bg-white focus:outline-none focus:border-[#029E4D]"
              />
              <span className="text-xs text-gray-400">sec</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-600 font-medium text-xs">
              Hourly Limit:
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="5000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-16 text-center text-sm font-medium bg-[#F4F5F7] border border-gray-200 rounded-md py-1 focus:bg-white focus:outline-none focus:border-[#029E4D]"
              />
              <span className="text-xs text-gray-400">emails/hr</span>
            </div>
          </div>
        </div>

        {/* Formatting Toolbar matching Figma */}
        <div className="bg-[#F8FAFC] border border-gray-200 rounded-xl p-2 mt-4 flex flex-wrap items-center gap-1 text-gray-600">
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-gray-300 mx-1" />
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded flex items-center gap-0.5">
            <Type className="w-4 h-4" />
            <ChevronsUpDown className="w-3 h-3 text-gray-400" />
          </button>
          <div className="w-[1px] h-4 bg-gray-300 mx-1" />
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded font-bold">
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded italic">
            <Italic className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded underline">
            <Underline className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-gray-300 mx-1" />
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <AlignLeft className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-gray-300 mx-1" />
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <ListOrdered className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <List className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Outdent className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Indent className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Quote className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Code className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded">
            <Strikethrough className="w-4 h-4" />
          </button>
        </div>

        {/* Email Body Text Area */}
        <div className="mt-4 flex-1 flex flex-col">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Type Your Reply..."
            className="w-full flex-1 p-4 text-sm text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:border-[#029E4D] placeholder-gray-400 resize-none font-sans"
          />
        </div>
      </form>

      {/* Send Later Modal */}
      <SendLaterPopover
        isOpen={isSendLaterOpen}
        onClose={() => setIsSendLaterOpen(false)}
        selectedDate={scheduledDate}
        onConfirm={(newDate) => {
          setScheduledDate(newDate);
          toast.info(`Scheduling time updated to: ${newDate.toLocaleString()}`);
        }}
      />
    </div>
  );
};
