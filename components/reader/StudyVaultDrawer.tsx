"use client";

import React, { useState } from "react";
import {
  ScanLine,
  Sparkles,
  BookmarkCheck,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  Download,
  Layers,
  Mic,
  MessageSquare,
} from "lucide-react";
import { ScannedPinItem } from "@/components/reader/SourceSelectionToolbar";
import { cn } from "@/lib/utils";

interface StudyVaultDrawerProps {
  bookTitle: string;
  pins: ScannedPinItem[];
  onRemovePin: (id: string) => void;
  onJumpToSection: (sectionIdx: number) => void;
  onMorphPin: (pin: ScannedPinItem) => void;
  onDiscussPin: (pin: ScannedPinItem) => void;
  onVoicePin: (pin: ScannedPinItem) => void;
  onScanCurrentPage: () => void;
  isScanningPage: boolean;
}

export function StudyVaultDrawer({
  bookTitle,
  pins,
  onRemovePin,
  onJumpToSection,
  onMorphPin,
  onDiscussPin,
  onVoicePin,
  onScanCurrentPage,
  isScanningPage,
}: StudyVaultDrawerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportedAll, setExportedAll] = useState(false);

  const handleCopyPin = (pin: ScannedPinItem) => {
    const content = `[${bookTitle} - Section ${pin.sectionIndex + 1} (Page ${pin.pageNumber})]\n${pin.text}${
      pin.extractedPearls && pin.extractedPearls.length > 0
        ? "\n\nExtracted Pearls:\n" + pin.extractedPearls.map((p) => `• ${p}`).join("\n")
        : ""
    }`;
    navigator.clipboard.writeText(content);
    setCopiedId(pin.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExportAllMarkdown = () => {
    const md = [
      `# Study Vault & Extracted Scans: ${bookTitle}`,
      `Generated on ${new Date().toLocaleDateString()}`,
      "",
      ...pins.map(
        (p, i) =>
          `## ${i + 1}. Section ${p.sectionIndex + 1} (Page ${p.pageNumber}) — ${
            p.type === "full-page-scan" ? "Full Page Smart Scan" : "Pinned Excerpt"
          }\n> ${p.text}\n${
            p.extractedPearls?.length
              ? "\n**Key Clinical / Structural Entities:**\n" +
                p.extractedPearls.map((item) => `- ${item}`).join("\n")
              : ""
          }\n`
      ),
    ].join("\n");

    navigator.clipboard.writeText(md);
    setExportedAll(true);
    setTimeout(() => setExportedAll(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* TOP ACTION CARD: SCAN & EXTRACT CURRENT PAGE */}
      <div className="flex flex-col gap-2.5 rounded-[18px] border border-[#43a08f]/40 bg-gradient-to-br from-[#192524] to-[#121618] p-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#43a08f]/20 text-[#7fd8c9]">
              <ScanLine className="size-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-[color:var(--cream)]">
                Smart Page Scanner &amp; Study Vault
              </h4>
              <p className="text-[10.5px] text-[color:var(--cream)]/65">
                Scan the left page or highlight any passage to transfer it here or export to Notion/Anki.
              </p>
            </div>
          </div>

          {pins.length > 0 && (
            <button
              type="button"
              onClick={handleExportAllMarkdown}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-[color:var(--cream)] transition-colors hover:bg-white/20"
              title="Copy entire Study Vault as Markdown"
            >
              {exportedAll ? (
                <>
                  <Check className="size-3 text-[#43a08f]" />
                  <span>Copied Markdown!</span>
                </>
              ) : (
                <>
                  <Download className="size-3" />
                  <span>Export All ({pins.length})</span>
                </>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onScanCurrentPage}
          disabled={isScanningPage}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ink)] bg-[#43a08f] py-2 text-xs font-black text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          <ScanLine className={cn("size-4", isScanningPage && "animate-spin")} />
          <span>
            {isScanningPage
              ? "Scanning Page Structure & Extracting Entities..."
              : "Scan & Extract Current Page into Vault"}
          </span>
        </button>
      </div>

      {/* PINNED & SCANNED ITEMS LIST */}
      {pins.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/15 bg-white/[0.02] py-10 text-center text-xs text-[color:var(--cream)]/50">
          <BookmarkCheck className="size-6 opacity-40" />
          <p className="max-w-xs text-[11px] leading-relaxed">
            No scanned pages or pinned passages yet. Select any text on the left page or click{" "}
            <strong className="text-[color:var(--cream)]">Scan &amp; Extract Current Page</strong> above.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="flex flex-col gap-2 rounded-[16px] border border-white/12 bg-white/[0.04] p-3.5 text-xs transition-colors hover:border-white/25"
            >
              {/* Item Header */}
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                      pin.type === "full-page-scan"
                        ? "bg-[#43a08f]/20 text-[#7fd8c9]"
                        : "bg-[color:var(--orange)]/20 text-[color:var(--orange)]"
                    )}
                  >
                    {pin.type === "full-page-scan" ? "Full Page Scan" : "Selected Clip"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToSection(pin.sectionIndex)}
                    className="cursor-pointer font-mono text-[10px] text-[color:var(--cream)]/70 underline-offset-2 hover:text-[color:var(--cream)] hover:underline"
                  >
                    Section {pin.sectionIndex + 1} (p.{pin.pageNumber})
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[9.5px] text-[color:var(--cream)]/40">{pin.timestamp}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPin(pin)}
                    className="rounded p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)]"
                    title="Copy to clipboard"
                  >
                    {copiedId === pin.id ? (
                      <Check className="size-3.5 text-[#43a08f]" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePin(pin.id)}
                    className="rounded p-1 text-[color:var(--cream)]/50 hover:bg-[#ff4c00]/20 hover:text-[#ff6e33]"
                    title="Remove from vault"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Excerpt Text */}
              <p className="line-clamp-4 font-serif text-[11.5px] leading-relaxed text-[color:var(--cream)]/90 italic border-l-2 border-[color:var(--orange)] pl-2.5">
                &ldquo;{pin.text}&rdquo;
              </p>

              {/* Extracted Pearls if Page Scan */}
              {pin.extractedPearls && pin.extractedPearls.length > 0 && (
                <div className="rounded-xl bg-black/40 p-2.5 flex flex-col gap-1">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#7fd8c9]">
                    Scanned Key Entities &amp; Takeaways:
                  </span>
                  {pin.extractedPearls.map((pearl, idx) => (
                    <span key={idx} className="text-[10.5px] text-[color:var(--cream)]/85">
                      • {pearl}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons to route this clip into AI tools */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onMorphPin(pin)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-[color:var(--orange)]/40 bg-[color:var(--orange)]/15 px-2.5 py-1 text-[10px] font-bold text-[color:var(--orange)] hover:bg-[color:var(--orange)]/25"
                >
                  <Sparkles className="size-3" />
                  <span>Morph Clip</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDiscussPin(pin)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--cream)]/85 hover:bg-white/10"
                >
                  <MessageSquare className="size-3 text-[#7fd8c9]" />
                  <span>Send to AI Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => onVoicePin(pin)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--cream)]/85 hover:bg-white/10"
                >
                  <Mic className="size-3 text-[color:var(--magenta)]" />
                  <span>Oral Viva on Clip</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
