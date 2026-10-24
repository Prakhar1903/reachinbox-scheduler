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

    Papa.parse(file, {
      complete: (results) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const extracted: string[] = [];

        results.data.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (typeof cell === 'string') {
                const cleaned = cell.trim();
                if (emailRegex.test(cleaned)) {
                  extracted.push(cleaned);
                }
              }
            });
          } else if (typeof row === 'object' && row !== null) {
            Object.values(row).forEach((val: any) => {
              if (typeof val === 'string') {
                const cleaned = val.trim();
                if (emailRegex.test(cleaned)) {
                  extracted.push(cleaned);
                }
              }
            });
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
