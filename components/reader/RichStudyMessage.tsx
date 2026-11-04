"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { normalizeScientificNotation } from "@/lib/formatting/scientific-text";

interface RichStudyMessageProps {
  content: string;
  className?: string;
}

/**
 * Normalizes raw LaTeX arrows, roots, fractions, and clinical/chemical notations to clean Unicode
 */
function cleanClinicalLatex(raw: string): string {
  if (!raw) return "";

  // Run full scientific & chemical normalizer first
  let cleaned = normalizeScientificNotation(raw);

  return cleaned
    // Multi-spaces
    .replace(/[ \t]{2,}/g, " ");
}

export default function RichStudyMessage({ content, className }: RichStudyMessageProps) {
  const processed = useMemo(() => cleanClinicalLatex(content), [content]);

  return (
    <div dir="auto" className={cn("rich-study-message ascleon-bidi text-[12.5px] leading-relaxed text-[#1a191b]", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-3.5 mb-2 font-black text-base text-[#1a191b] tracking-tight border-b-2 border-[#1a191b]/15 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1.5 font-extrabold text-[14px] text-[#1a191b] tracking-tight flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#ff4c00] inline-block" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 mb-1 font-bold text-[13px] text-[#ff4c00] tracking-tight uppercase">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 mb-1 font-bold text-[12.5px] text-[#1a191b]/90 underline decoration-[#ff4c00]/40 underline-offset-2">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-1.5 leading-[1.65] text-[#1a191b]/95 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-[#1a191b] bg-[#ff4c00]/10 px-1 py-0.5 rounded text-[12px]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#1a191b]/85">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2 space-y-1 pl-4 list-disc marker:text-[#ff4c00]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1 pl-4 list-decimal marker:font-bold marker:text-[#ff4c00]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5 text-[#1a191b]/95">
              {children}
            </li>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border-2 border-[#1a191b] bg-white/80 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1a191b] text-[#f6d7a1] uppercase text-[10.5px] tracking-wider font-black">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#1a191b]/15">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#ff4c00]/5 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-black border-r border-white/10 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#1a191b] border-r border-[#1a191b]/10 last:border-r-0 align-top">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 rounded-xl border-l-4 border-[#ff4c00] bg-[#ff4c00]/10 px-3.5 py-2 font-medium text-[#1a191b] italic">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="rounded bg-[#1a191b]/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#1a191b]">
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-2 overflow-x-auto rounded-xl bg-[#1a191b] p-3 text-[11px] font-mono text-[#f6d7a1]">
                <code>{children}</code>
              </pre>
            );
          },
          hr: () => (
            <hr className="my-3 border-t-2 border-[#1a191b]/15" />
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
