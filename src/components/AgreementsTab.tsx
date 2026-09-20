import React, { useState } from 'react';
import {
  FileText,
  Download,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  Song,
  RightsRecordVersion,
  Agreement,
  RightsValidationSummary,
  OwnershipAllocation,
  ContributorConfirmation,
  Contributor,
} from '../types';
import { downloadSplitAgreementPdf } from '../lib/pdfGenerator';

interface AgreementsTabProps {
  song: Song;
  currentVersion: RightsRecordVersion;
  agreements: Agreement[];
  validation: RightsValidationSummary | null;
  onGenerateAgreement: () => Promise<void>;
  allocations?: OwnershipAllocation[];
  confirmations?: ContributorConfirmation[];
  contributors?: Contributor[];
}

export const AgreementsTab: React.FC<AgreementsTabProps> = ({
  song,
  currentVersion,
  agreements,
  validation,
  onGenerateAgreement,
  allocations = [],
  confirmations = [],
  contributors = [],
}) => {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [selectedAgrId, setSelectedAgrId] = useState<string | null>(
    agreements.length > 0 ? agreements[agreements.length - 1].id : null
  );

  const activeAgreement =
    agreements.find((a) => a.id === selectedAgrId) || agreements[agreements.length - 1];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerateAgreement();
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!activeAgreement) return;
    navigator.clipboard.writeText(activeAgreement.documentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    if (!activeAgreement) return;
    setDownloadingPdf(true);
    try {
      downloadSplitAgreementPdf({
        song,
        agreement: activeAgreement,
        allocations,
        contributors,
        confirmations,
      });
    } catch (err) {
      console.error('Failed to generate agreement PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadMd = () => {
    if (!activeAgreement) return;
    const blob = new Blob([activeAgreement.documentContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.title.replace(/\s+/g, '_')}_Split_Agreement_v${activeAgreement.agreementVersion}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Generation Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#11141b] border border-[#1e232d] p-4 rounded">
        <div>
          <h3 className="text-sm font-semibold text-white">Structured Split Agreements</h3>
          <p className="text-xs text-[#798394] mt-0.5">
            Compiled deterministically from underlying Rights Record data and contributor confirmations.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || !validation?.isCompositionComplete || !validation?.isMasterComplete}
          className="flex items-center gap-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-colors disabled:opacity-40 cursor-pointer"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{generating ? 'Compiling Agreement...' : 'Generate Split Agreement'}</span>
        </button>
      </div>

      {/* Mandatory Legal Review Banner (Requirement #4) */}
      <div className="rounded border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 text-xs text-[#b8c0cc]">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">Notice for Legal Review:</strong> Ospreyn provides independent rights-documentation and workflow infrastructure. It does not provide legal advice or make claims regarding the statutory enforceability of private confirmations. Agreement terms and confirmation mechanisms should be reviewed by qualified South African legal counsel before formal execution.
        </div>
      </div>

      {agreements.length === 0 ? (
        <div className="rounded border border-[#1f242e] bg-[#0e1116] p-12 text-center space-y-3">
          <FileText className="h-8 w-8 text-[#4a5363] mx-auto" />
          <h4 className="text-sm font-medium text-white">No Agreement Generated Yet</h4>
          <p className="text-xs text-[#798394] max-w-md mx-auto">
            Once Composition and Master splits are defined and participants confirm their shares, click "Generate Split Agreement" to produce a structured split sheet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Agreement Version Selector */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#8c94a0]">Generated Versions</h4>
            <div className="space-y-1.5">
              {agreements.map((agr) => (
                <button
                  key={agr.id}
                  onClick={() => setSelectedAgrId(agr.id)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    activeAgreement?.id === agr.id
                      ? 'bg-[#181d26] border-[#e6b359]/40 text-white'
                      : 'bg-[#0e1116] border-[#1f242e] text-[#8c94a0] hover:bg-[#141820]'
                  }`}
                >
                  <div className="text-xs font-semibold">Version {agr.agreementVersion}.0</div>
                  <div className="text-[10px] text-[#6b7585] mt-1 font-mono">
                    {new Date(agr.generatedAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="mt-1.5">
                    <span
                      className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                        agr.status === 'fully_confirmed'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-950 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {agr.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Agreement Document Display */}
          <div className="lg:col-span-3 rounded border border-[#1f242e] bg-[#0c0e12] overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-[#1b2029] bg-[#101318] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#e6b359]" />
                <span className="text-xs font-semibold text-white truncate max-w-sm sm:max-w-md">
                  {activeAgreement?.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded bg-[#161a22] hover:bg-[#1e2430] px-2.5 py-1 text-[11px] text-[#c5cbd4] hover:text-white transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="flex items-center gap-1.5 rounded bg-[#e6b359] hover:bg-[#d9a444] text-[#0c0e12] px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                  title="Generate certified PDF split sheet"
                >
                  <Download className="h-3 w-3" />
                  <span>{downloadingPdf ? 'Generating PDF...' : 'Download Agreement (PDF)'}</span>
                </button>
                <button
                  onClick={handleDownloadMd}
                  className="flex items-center gap-1 rounded border border-[#252b36] bg-[#161a22] hover:bg-[#1e2430] px-2.5 py-1 text-[11px] text-[#9aa3b2] hover:text-white transition-colors cursor-pointer"
                  title="Download raw Markdown format"
                >
                  <span>.md</span>
                </button>
              </div>
            </div>

            <div className="p-6 font-mono text-xs text-[#c5cbd4] whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto bg-[#090b0e]">
              {activeAgreement?.documentContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
