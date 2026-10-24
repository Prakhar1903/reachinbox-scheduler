'use client';

import React, { useRef } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

interface CsvUploaderProps {
  onEmailsExtracted: (emails: string[]) => void;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({ onEmailsExtracted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('CSV file exceeds 5MB size limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    Papa.parse(file, {
      complete: (results) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const extracted: string[] = [];

        const processCell = (raw: any) => {
          if (typeof raw !== 'string') return;
          let cell = raw.trim().replace(/^["']|["']$/g, '');
          const angleMatch = cell.match(/<([^>]+)>/);
          if (angleMatch) {
            cell = angleMatch[1].trim();
          }
          if (emailRegex.test(cell)) {
            extracted.push(cell.toLowerCase());
          }
        };

        results.data.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach(processCell);
          } else if (typeof row === 'object' && row !== null) {
            Object.values(row).forEach(processCell);
          }
        });

        // Deduplicate
        const uniqueEmails = Array.from(new Set(extracted));

        if (uniqueEmails.length === 0) {
          toast.error('No valid email addresses found in the file.');
          return;
        }

        onEmailsExtracted(uniqueEmails);
        toast.success(`Successfully detected ${uniqueEmails.length} lead email address(es)!`);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        toast.error('Failed to parse file: ' + error.message);
      },
    });
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.tsv"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#029E4D] hover:text-[#028540] hover:underline transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        <span>Upload List</span>
      </button>
    </div>
  );
};
