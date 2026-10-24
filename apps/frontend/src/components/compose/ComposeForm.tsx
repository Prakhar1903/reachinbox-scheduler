'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  AlignCenter,
  AlignRight,
  ChevronsUpDown,
  ListOrdered,
  List,
  Indent,
  Outdent,
  Quote,
  Code,
  Strikethrough,
  FileText,
} from 'lucide-react';
import { useSenders } from '@/hooks/useSenders';
import { useScheduleEmails } from '@/hooks/useEmails';
import { CsvUploader } from './CsvUploader';
import { SendLaterPopover } from './SendLaterPopover';
import { Button } from '../ui/Button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Attachment } from '@/types';

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
  const [hasCustomSchedule, setHasCustomSchedule] = useState(false);
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Active toolbar formatting states
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    orderedList: false,
    unorderedList: false,
  });
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [currentBlock, setCurrentBlock] = useState('Normal');

  const updateActiveFormats = () => {
    if (!editorRef.current) return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough'),
        orderedList: document.queryCommandState('insertOrderedList'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
      });

      const block = document.queryCommandValue('formatBlock');
      if (block === 'h1') setCurrentBlock('H1');
      else if (block === 'h2') setCurrentBlock('H2');
      else if (block === 'h3') setCurrentBlock('H3');
      else if (block === 'blockquote') setCurrentBlock('Quote');
      else if (block === 'pre') setCurrentBlock('Code');
      else setCurrentBlock('Normal');
    } catch {
      // Ignore if document query is not supported
    }
  };

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
    updateActiveFormats();
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      // If it's just <br> or empty, treat as empty
      if (html === '<br>' || html === '<div><br></div>' || !editorRef.current.innerText.trim()) {
        setBody('');
      } else {
        setBody(html);
      }
    }
    updateActiveFormats();
  };

  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('left');

  const cycleAlignment = () => {
    if (alignment === 'left') {
      executeCommand('justifyCenter');
      setAlignment('center');
    } else if (alignment === 'center') {
      executeCommand('justifyRight');
      setAlignment('right');
    } else {
      executeCommand('justifyLeft');
      setAlignment('left');
    }
  };

  const setBlockType = (tag: string, label: string) => {
    executeCommand('formatBlock', tag);
    setCurrentBlock(label);
    setShowTypeMenu(false);
  };

  // Auto-select first sender when loaded
  useEffect(() => {
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
    if (recipientInput.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const tokens = recipientInput.split(/[,;\s\n]+/).map((t) => t.trim()).filter(Boolean);
      tokens.forEach((token) => {
        if (emailRegex.test(token) && !finalRecipients.includes(token)) {
          finalRecipients.push(token);
        }
      });
      setRecipients(finalRecipients);
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
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : body;
    const plainText = editorRef.current
      ? editorRef.current.innerText.trim()
      : body.replace(/<[^>]*>/g, '').trim();

    if (!plainText) {
      toast.error('Email body content is required');
      return;
    }

    // 1. Validate Delay Range: 1s to 3600s
    if (Number(delaySeconds) < 1 || Number(delaySeconds) > 3600) {
      toast.error('Delay between emails must be between 1 and 3,600 seconds (max 1 hour).');
      return;
    }

    // 2. Validate Hourly Limit Range: 1 to 2000 emails/hour
    if (Number(hourlyLimit) < 1 || Number(hourlyLimit) > 2000) {
      toast.error('Hourly limit must be between 1 and 2,000 emails per hour.');
      return;
    }

    // 3. Validate Scheduled Time
    const now = Date.now();
    let effectiveScheduledDate = scheduledDate;
    if (!hasCustomSchedule) {
      // If user did not manually pick a custom schedule and the initial 2-minute default elapsed while writing
      if (effectiveScheduledDate.getTime() <= now) {
        effectiveScheduledDate = new Date(now + 2 * 60 * 1000);
        setScheduledDate(effectiveScheduledDate);
      }
    } else {
      // Custom schedule explicitly chosen: enforce future time (allowing 15s transit buffer)
      if (effectiveScheduledDate.getTime() < now - 15000) {
        toast.error('Selected scheduled time has already passed. Please select a future time via "Send Later".');
        setIsSendLaterOpen(true);
        return;
      }
    }

    try {
      await scheduleMutation.mutateAsync({
        senderId: selectedSenderId,
        toAddresses: finalRecipients,
        subject: subject.trim(),
        body: currentHtml.trim(),
        scheduledAt: effectiveScheduledDate.toISOString(),
        delaySeconds: Math.max(1, Math.min(3600, Math.floor(Number(delaySeconds) || 2))),
        hourlyLimit: Math.max(1, Math.min(2000, Math.floor(Number(hourlyLimit) || 100))),
        attachments: attachments.map((a) => ({
          filename: a.filename,
          size: a.size,
          contentType: a.contentType,
          dataUrl: a.dataUrl,
        })),
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
          {/* Real attachment file picker */}
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                const maxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
                const maxTotalBytes = 10 * 1024 * 1024; // 10 MB

                // Filter files that exceed single limit
                const validFiles: File[] = [];
                for (const file of files) {
                  if (file.size > maxFileSizeBytes) {
                    toast.error(`File "${file.name}" exceeds the 5MB attachment limit and was skipped.`);
                  } else {
                    validFiles.push(file);
                  }
                }

                if (validFiles.length === 0) {
                  e.target.value = '';
                  return;
                }

                // Check total size
                const currentTotalSize = attachments.reduce((acc, att) => {
                  const sizeStr = att.size || '0 KB';
                  const num = parseFloat(sizeStr) || 0;
                  return acc + (sizeStr.includes('MB') ? num * 1024 * 1024 : num * 1024);
                }, 0);
                const incomingTotalSize = validFiles.reduce((acc, f) => acc + f.size, 0);

                if (currentTotalSize + incomingTotalSize > maxTotalBytes) {
                  toast.error('Total attachments exceed the 10MB limit. Please remove some files.');
                  e.target.value = '';
                  return;
                }

                const loaded = await Promise.all(
                  validFiles.map((file) => {
                    return new Promise<Attachment>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        resolve({
                          id: `${file.name}-${Date.now()}-${Math.random()}`,
                          filename: file.name,
                          size:
                            file.size > 1024 * 1024
                              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                              : `${Math.round(file.size / 1024)} KB`,
                          contentType: file.type || 'application/octet-stream',
                          dataUrl: reader.result as string,
                        });
                      };
                      reader.readAsDataURL(file);
                    });
                  })
                );
                setAttachments((prev) => [...prev, ...loaded]);
                toast.success(`Attached ${validFiles.length} file(s)`);
                // Clear input so same file can be selected again if needed
                e.target.value = '';
              }
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            title="Attach files"
            className="relative p-1.5 text-gray-500 hover:text-gray-900 cursor-pointer rounded-full hover:bg-gray-100 transition-colors"
          >
            <Paperclip className="w-5 h-5" />
            {attachments.length > 0 && (
              <span className="absolute -top-1 -right-1 text-[10px] bg-emerald-600 text-white font-bold rounded-full w-4 h-4 flex items-center justify-center animate-in zoom-in-50">
                {attachments.length}
              </span>
            )}
          </button>

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
          <div className="relative inline-block">
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
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* To Row with Tag Chips & CSV Upload */}
        <div className="flex items-center py-2.5 border-b border-gray-100 gap-2">
          <label className="w-20 text-sm font-medium text-gray-500">To</label>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[36px]">
            {(recipients.length > 20 ? recipients.slice(0, 15) : recipients).map((email, index) => (
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
            {recipients.length > 20 && (
              <div className="inline-flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                  + {recipients.length - 15} more leads
                </span>
                <button
                  type="button"
                  onClick={() => setRecipients([])}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium px-1 cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}
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
                min="1"
                max="3600"
                value={delaySeconds}
                onKeyDown={(e) => {
                  if (['-', '+', 'e', 'E', '.'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val)) {
                    setDelaySeconds(1);
                  } else {
                    setDelaySeconds(Math.max(1, Math.min(3600, val)));
                  }
                }}
                className="w-16 text-center text-sm font-medium bg-[#F4F5F7] border border-gray-200 rounded-md py-1 focus:bg-white focus:outline-none focus:border-[#029E4D]"
              />
              <span className="text-xs text-gray-400">sec (1-3600)</span>
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
                max="2000"
                value={hourlyLimit}
                onKeyDown={(e) => {
                  if (['-', '+', 'e', 'E', '.'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val)) {
                    setHourlyLimit(1);
                  } else {
                    setHourlyLimit(Math.max(1, Math.min(2000, val)));
                  }
                }}
                className="w-16 text-center text-sm font-medium bg-[#F4F5F7] border border-gray-200 rounded-md py-1 focus:bg-white focus:outline-none focus:border-[#029E4D]"
              />
              <span className="text-xs text-gray-400">emails/hr (1-2000)</span>
            </div>
          </div>
        </div>

        {/* Formatting Toolbar matching Figma */}
        <div className="bg-[#F8FAFC] border border-gray-200 rounded-xl p-2 mt-4 flex flex-wrap items-center gap-1 text-gray-600 relative select-none">
          {/* Undo */}
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('undo');
            }}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo */}
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('redo');
            }}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-gray-300 mx-1" />

          {/* Typography / Headings Dropdown */}
          <div className="relative">
            <button
              type="button"
              title="Text Format / Heading"
              onClick={() => setShowTypeMenu((prev) => !prev)}
              className={cn(
                'p-1.5 hover:bg-gray-200 rounded flex items-center gap-1 transition-colors text-xs font-semibold px-2',
                showTypeMenu || currentBlock !== 'Normal' ? 'bg-gray-200 text-gray-900' : ''
              )}
            >
              <Type className="w-4 h-4" />
              <span className="text-[11px]">{currentBlock}</span>
              <ChevronsUpDown className="w-3 h-3 text-gray-400" />
            </button>

            {showTypeMenu && (
              <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-30">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setBlockType('p', 'Normal');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-normal"
                >
                  Normal text
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setBlockType('h1', 'H1');
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 font-bold"
                >
                  Heading 1
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setBlockType('h2', 'H2');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-bold"
                >
                  Heading 2
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setBlockType('h3', 'H3');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 font-semibold"
                >
                  Heading 3
                </button>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-gray-300 mx-1" />

          {/* Bold */}
          <button
            type="button"
            title="Bold (Ctrl+B)"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('bold');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.bold ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Bold className="w-4 h-4" />
          </button>

          {/* Italic */}
          <button
            type="button"
            title="Italic (Ctrl+I)"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('italic');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.italic ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Italic className="w-4 h-4" />
          </button>

          {/* Underline */}
          <button
            type="button"
            title="Underline (Ctrl+U)"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('underline');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.underline ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Underline className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-gray-300 mx-1" />

          {/* Alignment Toggle / Cycle */}
          <button
            type="button"
            title={`Text Alignment (${alignment})`}
            onMouseDown={(e) => {
              e.preventDefault();
              cycleAlignment();
            }}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            {alignment === 'left' && <AlignLeft className="w-4 h-4" />}
            {alignment === 'center' && <AlignCenter className="w-4 h-4" />}
            {alignment === 'right' && <AlignRight className="w-4 h-4" />}
          </button>

          <div className="w-[1px] h-4 bg-gray-300 mx-1" />

          {/* Ordered List */}
          <button
            type="button"
            title="Numbered list"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('insertOrderedList');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.orderedList ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          {/* Unordered List */}
          <button
            type="button"
            title="Bullet list"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('insertUnorderedList');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.unorderedList ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <List className="w-4 h-4" />
          </button>

          {/* Outdent */}
          <button
            type="button"
            title="Decrease indent"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('outdent');
            }}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            <Outdent className="w-4 h-4" />
          </button>

          {/* Indent */}
          <button
            type="button"
            title="Increase indent"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('indent');
            }}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            <Indent className="w-4 h-4" />
          </button>

          {/* Quote */}
          <button
            type="button"
            title="Quote block"
            onMouseDown={(e) => {
              e.preventDefault();
              if (currentBlock === 'Quote') {
                setBlockType('p', 'Normal');
              } else {
                setBlockType('blockquote', 'Quote');
              }
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              currentBlock === 'Quote' ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Quote className="w-4 h-4" />
          </button>

          {/* Code */}
          <button
            type="button"
            title="Code block"
            onMouseDown={(e) => {
              e.preventDefault();
              if (currentBlock === 'Code') {
                setBlockType('p', 'Normal');
              } else {
                setBlockType('pre', 'Code');
              }
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              currentBlock === 'Code' ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Code className="w-4 h-4" />
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            title="Strikethrough"
            onMouseDown={(e) => {
              e.preventDefault();
              executeCommand('strikeThrough');
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              activeFormats.strikethrough ? 'bg-[#EBFBF2] text-[#029E4D]' : 'hover:bg-gray-200'
            )}
          >
            <Strikethrough className="w-4 h-4" />
          </button>
        </div>

        {/* Email Body Rich Text Editor Area */}
        <div className="mt-4 flex-1 flex flex-col relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyUp={updateActiveFormats}
            onMouseUp={updateActiveFormats}
            onSelect={updateActiveFormats}
            role="textbox"
            aria-multiline="true"
            className="w-full min-h-[260px] flex-1 p-4 text-sm text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:border-[#029E4D] resize-none font-sans overflow-y-auto leading-relaxed prose prose-sm max-w-none [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:my-2 [&_pre]:bg-gray-100 [&_pre]:p-2.5 [&_pre]:rounded [&_pre]:font-mono [&_pre]:text-xs [&_pre]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:my-1.5"
          />

          {/* Floating Placeholder when empty */}
          {!body && (
            <div
              onClick={() => editorRef.current?.focus()}
              className="absolute top-4 left-4 text-sm text-gray-400 pointer-events-none select-none"
            >
              Type Your Reply...
            </div>
          )}

          {/* Attached Files List - Figma Card Style */}
          {attachments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                <span>Attachments ({attachments.length})</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {attachments.map((file) => {
                  const isImage = file.contentType?.startsWith('image/') || file.dataUrl?.startsWith('data:image/');
                  return (
                    <div
                      key={file.id || file.filename}
                      className="w-44 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs group relative flex flex-col"
                    >
                      {/* Thumbnail Header */}
                      <div className="h-28 bg-[#F8FAFC] flex items-center justify-center overflow-hidden relative">
                        {isImage && file.dataUrl ? (
                          <img
                            src={file.dataUrl}
                            alt={file.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-400">
                            <FileText className="w-8 h-8 text-gray-400" />
                            <span className="text-[10px] uppercase font-semibold">
                              {file.filename.split('.').pop() || 'FILE'}
                            </span>
                          </div>
                        )}

                        {/* Remove Button on Hover */}
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) => prev.filter((f) => f.id !== file.id))
                          }
                          title="Remove attachment"
                          className="absolute top-1.5 right-1.5 p-1 bg-white/90 hover:bg-red-500 hover:text-white text-gray-600 rounded-full shadow-xs transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* File Details */}
                      <div className="p-2.5 bg-white border-t border-gray-100 flex flex-col">
                        <span className="text-xs font-semibold text-gray-800 truncate" title={file.filename}>
                          {file.filename}
                        </span>
                        <span className="text-[11px] text-gray-400 mt-0.5">
                          {file.size || 'Attachment'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Send Later Modal */}
      <SendLaterPopover
        isOpen={isSendLaterOpen}
        onClose={() => setIsSendLaterOpen(false)}
        selectedDate={scheduledDate}
        onConfirm={(newDate) => {
          setScheduledDate(newDate);
          setHasCustomSchedule(true);
          toast.info(`Scheduling time updated to: ${newDate.toLocaleString()}`);
        }}
      />
    </div>
  );
};
