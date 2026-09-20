import React, { useState } from 'react';
import { X, Download, Copy, Check, ShieldCheck, FileArchive, FileText } from 'lucide-react';
import { Song } from '../types';
import { printEvidencePackage } from '../lib/printExport';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song;
  exportData: any;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  song,
  exportData,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const jsonString = JSON.stringify(exportData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ospreyn_Evidence_Package_${song.title.replace(/\s+/g, '_')}_v${song.currentVersionNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    printEvidencePackage(exportData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-[#1d222d] pb-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-[#ffffff]" />
              Rights Record Evidence Package
            </h3>
            <p className="text-xs text-[#798394] mt-0.5 font-mono">
              Immutable dossier for labels, publishers, legal counsel, and CMO registrations
            </p>
          </div>
          <button onClick={onClose} className="text-[#5e6675] hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Evidence Highlights */}
        <div className="grid grid-cols-3 gap-2 py-1 shrink-0 text-center">
          <div className="rounded bg-[#131720] border border-[#202633] p-2.5">
            <div className="text-[10px] uppercase font-mono text-[#798394]">Status</div>
            <div className="text-xs font-semibold text-emerald-400 capitalize mt-0.5">{song.status}</div>
          </div>
          <div className="rounded bg-[#131720] border border-[#202633] p-2.5">
            <div className="text-[10px] uppercase font-mono text-[#798394]">Version</div>
            <div className="text-xs font-semibold text-white font-mono mt-0.5">v{song.currentVersionNumber}.0</div>
          </div>
          <div className="rounded bg-[#131720] border border-[#202633] p-2.5">
            <div className="text-[10px] uppercase font-mono text-[#798394]">Evidence Items</div>
            <div className="text-xs font-semibold text-[#ffffff] mt-0.5">
              {(exportData?.ownershipSplits?.length || 0) + (exportData?.confirmationsRecord?.length || 0) + (exportData?.documentVault?.length || 0)} sealed
            </div>
          </div>
        </div>

        {/* JSON Preview */}
        <div className="grow overflow-y-auto rounded bg-[#090b0e] border border-[#1b2029] p-4 font-mono text-[11px] text-[#9aa3b2] leading-relaxed">
          <pre>{jsonString}</pre>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#1d222d] shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded border border-[#282f3d] bg-[#141820] px-3 py-1.5 text-xs text-[#c5cbd4] hover:text-white"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy JSON'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded border border-[#282f3d] bg-transparent px-3.5 py-1.5 text-xs text-[#8c94a0] hover:text-white"
            >
              Close
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 rounded border border-[#282f3d] bg-[#141820] px-3.5 py-1.5 text-xs text-[#c5cbd4] hover:text-white"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Save as PDF</span>
            </button>
            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 rounded bg-[#ffffff] hover:bg-[#e2e2e2] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Evidence Package</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
