"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, Lightbulb, Sparkles, HelpCircle, AlertCircle } from "lucide-react";

interface RichStudyMessageProps {
  content: string;
  className?: string;
}

/**
 * Pre-processes text to clean up raw LaTeX math arrows and syntax
 * that LLMs frequently output in clinical/academic explanations.
 */
function sanitizeAcademicSymbols(raw: string): string {
  if (!raw) return "";

  return raw
    // LaTeX arrows
    .replace(/\$\\rightarrow\$/g, " → ")
    .replace(/\\rightarrow\b/g, " → ")
    .replace(/\$\\to\$/g, " → ")
    .replace(/\\to\b/g, " → ")
    .replace(/\$\\leftarrow\$/g, " ← ")
    .replace(/\\leftarrow\b/g, " ← ")
    .replace(/\$\\uparrow\$/g, " ↑ ")
    .replace(/\\uparrow\b/g, " ↑ ")
    .replace(/\$\\downarrow\$/g, " ↓ ")
    .replace(/\\downarrow\b/g, " ↓ ")
    .replace(/\$\\leftrightarrow\$/g, " ↔ ")
    .replace(/\\leftrightarrow\b/g, " ↔ ")
    .replace(/\$\\Rightarrow\$/g, " ⇒ ")
    .replace(/\\Rightarrow\b/g, " ⇒ ")
    .replace(/\$\\le\$/g, " ≤ ")
    .replace(/\$\\ge\$/g, " ≥ ")
    .replace(/\\le\b/g, " ≤ ")
    .replace(/\\ge\b/g, " ≥ ")
    .replace(/\$\\times\$/g, " × ")
    .replace(/\\times\b/g, " × ")
    // Clean up excessive asterisks like ***"Heading"*** -> **"Heading"**
    .replace(/\*{3,}(.*?)\*{3,}/g, "**$1**")
    // Clean up standalone dollar signs used around single words
    .replace(/\$([A-Za-z0-9_+\-↑↓→]+)\$/g, "$1")
    // Normalize consecutive spaces around arrows
    .replace(/\s*([→←↑↓⇒])\s*/g, " $1 ");
}

/**
 * Renders inline text formatting: bold (**), italic (*), inline code (`), and arrows
 */
function renderInlineContent(text: string): React.ReactNode {
  // Split on bold (**...**), code (`...`), and arrows (→, ↑, ↓)
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+?`|[→↑↓⇒])/g);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**")) {
      const boldText = part.slice(2, -2).trim();
      return (
        <strong
          key={index}
          className="font-black text-[color:var(--ink)] tracking-tight"
        >
          {boldText}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      const codeText = part.slice(1, -1).trim();
      return (
        <code
          key={index}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[color:var(--ink)] border border-[color:var(--ink)]/15"
        >
          {codeText}
        </code>
      );
    }

    if (part === "→" || part === "⇒") {
      return (
        <span
          key={index}
          className="inline-flex items-center px-1 font-bold text-[#ff4c00]"
        >
          →
        </span>
      );
    }

    if (part === "↑") {
      return (
        <span
          key={index}
          className="inline-flex items-center font-black text-rose-700 px-0.5"
          title="Increased"
        >
          ↑
        </span>
      );
    }

    if (part === "↓") {
      return (
        <span
          key={index}
          className="inline-flex items-center font-black text-sky-700 px-0.5"
          title="Decreased"
        >
          ↓
        </span>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

type BlockType =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; title?: string; text: string; variant: "pearl" | "socratic" | "quote" }
  | { type: "cascade"; steps: string[] };

export default function RichStudyMessage({ content, className }: RichStudyMessageProps) {
  const blocks = useMemo(() => {
    const sanitized = sanitizeAcademicSymbols(content || "");
    const lines = sanitized.split(/\r?\n/);
    const parsedBlocks: BlockType[] = [];

    let currentList: { items: string[]; ordered: boolean } | null = null;
    let currentTable: { headers: string[]; rows: string[][] } | null = null;

    const flushList = () => {
      if (currentList && currentList.items.length > 0) {
        parsedBlocks.push({
          type: "list",
          items: currentList.items,
          ordered: currentList.ordered,
        });
        currentList = null;
      }
    };

    const flushTable = () => {
      if (currentTable && currentTable.headers.length > 0) {
        parsedBlocks.push({
          type: "table",
          headers: currentTable.headers,
          rows: currentTable.rows,
        });
        currentTable = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Empty line -> flush open lists or tables
      if (!line) {
        flushList();
        flushTable();
        continue;
      }

      // 1. Table Row Detection (| Col 1 | Col 2 |)
      if (line.startsWith("|") && line.endsWith("|")) {
        flushList();
        const cells = line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());

        // Skip divider rows like |---|---|
        if (cells.every((c) => /^[-:]+$/.test(c))) {
          continue;
        }

        if (!currentTable) {
          currentTable = { headers: cells, rows: [] };
        } else {
          currentTable.rows.push(cells);
        }
        continue;
      } else {
        flushTable();
      }

      // 2. Headings (### or #### or ##)
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        parsedBlocks.push({ type: "heading", level, text });
        continue;
      }

      // 3. Socratic Challenge or Clinical Pearl Callouts
      if (
        line.toLowerCase().startsWith("socratic challenge") ||
        line.toLowerCase().startsWith("**socratic challenge") ||
        line.toLowerCase().startsWith("clinical pearl") ||
        line.toLowerCase().startsWith("**clinical pearl") ||
        line.startsWith(">")
      ) {
        flushList();
        let calloutVariant: "pearl" | "socratic" | "quote" = "quote";
        let title: string | undefined = undefined;
        let text = line;

        if (line.toLowerCase().includes("socratic")) {
          calloutVariant = "socratic";
          title = "Socratic Challenge";
          text = line.replace(/^\*{0,2}socratic challenge:?\*{0,2}\s*/i, "");
        } else if (line.toLowerCase().includes("pearl")) {
          calloutVariant = "pearl";
          title = "Clinical Pearl";
          text = line.replace(/^\*{0,2}clinical pearl:?\*{0,2}\s*/i, "");
        } else if (line.startsWith(">")) {
          text = line.replace(/^>\s*/, "");
        }

        parsedBlocks.push({
          type: "callout",
          title,
          text,
          variant: calloutVariant,
        });
        continue;
      }

      // 4. Causal Pathway / Cascade Detection (lines with 2+ arrows: A → B → C)
      const arrowCount = (line.match(/→/g) || []).length;
      if (arrowCount >= 2 && !line.startsWith("•") && !line.startsWith("-")) {
        flushList();
        const steps = line
          .split("→")
          .map((s) => s.trim())
          .filter(Boolean);
        parsedBlocks.push({ type: "cascade", steps });
        continue;
      }

      // 5. Bullet / Numbered Lists
      const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
      const orderedMatch = line.match(/^(\d+)[.)]\s+(.*)$/);

      if (bulletMatch) {
        if (!currentList || currentList.ordered) {
          flushList();
          currentList = { items: [bulletMatch[1]], ordered: false };
        } else {
          currentList.items.push(bulletMatch[1]);
        }
        continue;
      }

      if (orderedMatch) {
        if (!currentList || !currentList.ordered) {
          flushList();
          currentList = { items: [orderedMatch[2]], ordered: true };
        } else {
          currentList.items.push(orderedMatch[2]);
        }
        continue;
      }

      // Standard paragraph line
      flushList();
      parsedBlocks.push({ type: "paragraph", text: line });
    }

    flushList();
    flushTable();

    return parsedBlocks;
  }, [content]);

  return (
    <div className={cn("flex flex-col gap-2.5 text-xs text-[color:var(--ink)] leading-relaxed", className)}>
      {blocks.map((block, bIdx) => {
        // Headings
        if (block.type === "heading") {
          const isMajor = block.level <= 3;
          return (
            <div
              key={bIdx}
              className={cn(
                "flex items-center gap-2 pt-2 pb-1 border-b border-[color:var(--ink)]/15",
                isMajor ? "mt-3.5" : "mt-2"
              )}
            >
              <span className="size-2 rounded-full bg-[#ff4c00] shrink-0" />
              <h4
                className={cn(
                  "font-black tracking-tight text-[color:var(--ink)] leading-snug",
                  isMajor ? "text-[13px] sm:text-[14px]" : "text-[12px] sm:text-[12.5px]"
                )}
              >
                {renderInlineContent(block.text)}
              </h4>
            </div>
          );
        }

        // Causal Pathway / Invariant Cascade
        if (block.type === "cascade") {
          return (
            <div
              key={bIdx}
              className="my-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-[color:var(--ink)]/20 bg-white/40 p-2.5 shadow-xs"
            >
              <div className="flex items-center gap-1 text-[10px] font-black uppercase text-[#ff4c00] w-full pb-1 border-b border-[color:var(--ink)]/10">
                <Sparkles className="size-3" />
                <span>Physiological Cascade</span>
              </div>
              {block.steps.map((step, sIdx) => (
                <React.Fragment key={sIdx}>
                  <div className="inline-flex items-center rounded-lg bg-[color:var(--ink)] px-2 py-1 text-[11px] font-bold text-[#f6d7a1] shadow-xs">
                    {renderInlineContent(step)}
                  </div>
                  {sIdx < block.steps.length - 1 && (
                    <ArrowRight className="size-3 text-[#ff4c00] shrink-0 stroke-[2.5]" />
                  )}
                </React.Fragment>
              ))}
            </div>
          );
        }

        // Tables
        if (block.type === "table") {
          return (
            <div
              key={bIdx}
              className="my-2 overflow-x-auto rounded-xl border-2 border-[color:var(--ink)]/20 bg-white/50 shadow-xs"
            >
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b-2 border-[color:var(--ink)]/20 bg-black/10">
                    {block.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-3 py-2 font-black uppercase tracking-wider text-[color:var(--ink)]"
                      >
                        {renderInlineContent(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="border-b border-[color:var(--ink)]/10 transition-colors hover:bg-black/[0.03] last:border-none"
                    >
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 leading-relaxed">
                          {renderInlineContent(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Callout / Pearl Boxes
        if (block.type === "callout") {
          const isSocratic = block.variant === "socratic";
          const isPearl = block.variant === "pearl";

          return (
            <div
              key={bIdx}
              className={cn(
                "my-2 rounded-xl border-2 p-3 text-[11.5px] leading-relaxed shadow-xs flex flex-col gap-1",
                isSocratic
                  ? "border-[#ff4c00] bg-[#ff4c00]/10 text-[color:var(--ink)]"
                  : isPearl
                  ? "border-[#43a08f] bg-[#43a08f]/10 text-[color:var(--ink)]"
                  : "border-[color:var(--ink)]/20 bg-white/40 italic"
              )}
            >
              {block.title && (
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                  {isSocratic ? (
                    <HelpCircle className="size-3.5 text-[#ff4c00]" />
                  ) : (
                    <Lightbulb className="size-3.5 text-[#43a08f]" />
                  )}
                  <span>{block.title}</span>
                </div>
              )}
              <div className="font-medium">{renderInlineContent(block.text)}</div>
            </div>
          );
        }

        // Lists
        if (block.type === "list") {
          return (
            <ul key={bIdx} className="my-1 flex flex-col gap-1.5 pl-1">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                  {block.ordered ? (
                    <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ink)] text-[9.5px] font-black text-[#f6d7a1] mt-0.5">
                      {iIdx + 1}
                    </span>
                  ) : (
                    <span className="text-[#ff4c00] font-black text-sm shrink-0 leading-none mt-1">
                      ✦
                    </span>
                  )}
                  <span className="flex-1">{renderInlineContent(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        // Regular Paragraph
        return (
          <p key={bIdx} className="leading-relaxed">
            {renderInlineContent(block.text)}
          </p>
        );
      })}
    </div>
  );
}
