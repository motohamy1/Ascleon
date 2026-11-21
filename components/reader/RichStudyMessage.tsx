"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { normalizeScientificNotation } from "@/lib/formatting/scientific-text";
import { renderBidiNodes, resolveTextDirection } from "@/components/ui/BiDiText";

interface RichStudyMessageProps {
  content: string;
  className?: string;
}

function wrapBidiChildren(children: React.ReactNode, prefix = "md"): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      return renderBidiNodes(child, `${prefix}-${idx}`);
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props?.children) {
      // Do not rewrite code blocks or explicit LTR elements
      const propsAny = child.props as Record<string, unknown>;
      if (child.type === "code" || child.type === "pre" || propsAny.dir === "ltr") {
        return child;
      }
      return React.cloneElement(child, {
        ...child.props,
        children: wrapBidiChildren(child.props.children, `${prefix}-${idx}`),
      });
    }
    return child;
  });
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
  const baseDir = useMemo(() => resolveTextDirection(processed), [processed]);

  return (
    <div dir={baseDir} className={cn("rich-study-message ascleon-bidi text-[12.5px] leading-relaxed text-[#1a191b] text-start", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 dir={baseDir} className="mt-3.5 mb-2 font-black text-base text-[#1a191b] tracking-tight border-b-2 border-[#1a191b]/15 pb-1 text-start">
              {wrapBidiChildren(children, "h1")}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 dir={baseDir} className="mt-3 mb-1.5 font-extrabold text-[14px] text-[#1a191b] tracking-tight flex items-center gap-1.5 text-start">
              <span className="size-2 rounded-full bg-[#ff4c00] inline-block shrink-0" />
              <span>{wrapBidiChildren(children, "h2")}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 dir={baseDir} className="mt-2.5 mb-1 font-bold text-[13px] text-[#ff4c00] tracking-tight uppercase text-start">
              {wrapBidiChildren(children, "h3")}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 dir={baseDir} className="mt-2 mb-1 font-bold text-[12.5px] text-[#1a191b]/90 underline decoration-[#ff4c00]/40 underline-offset-2 text-start">
              {wrapBidiChildren(children, "h4")}
            </h4>
          ),
          p: ({ children }) => (
            <p dir={baseDir} className="my-1.5 leading-[1.75] text-[#1a191b]/95 last:mb-0 text-start">
              {wrapBidiChildren(children, "p")}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-[#1a191b] bg-[#ff4c00]/10 px-1 py-0.5 rounded text-[12px] inline-block [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "strong")}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#1a191b]/85 [unicode-bidi:isolate]">{wrapBidiChildren(children, "em")}</em>
          ),
          ul: ({ children }) => (
            <ul dir={baseDir} className="my-2 space-y-1 ps-5 list-disc marker:text-[#ff4c00] text-start">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir={baseDir} className="my-2 space-y-1 ps-5 list-decimal marker:font-bold marker:text-[#ff4c00] text-start">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li dir={baseDir} className="leading-relaxed text-[#1a191b]/95 text-start">
              {wrapBidiChildren(children, "li")}
            </li>
          ),
          table: ({ children }) => (
            <div dir={baseDir} className="my-3 overflow-x-auto rounded-xl border-2 border-[#1a191b] bg-white/95 shadow-sm">
              <table className="w-full text-start text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1a191b] text-white uppercase text-[10.5px] tracking-wider font-black select-none border-b border-white/20 [&_*]:text-white">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#1a191b]/15 bg-white/95">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#ff4c00]/10 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th dir={baseDir} className="px-3.5 py-2.5 font-black border-e border-white/20 last:border-e-0 text-white text-[11px] tracking-wide text-start [&_*]:text-white [&_strong]:text-[#f6d7a1] [&_strong]:bg-transparent [&_strong]:p-0 [&_strong]:font-black">
              {wrapBidiChildren(children, "th")}
            </th>
          ),
          td: ({ children }) => (
            <td dir={baseDir} className="px-3.5 py-2.5 text-[#1a191b] border-e border-[#1a191b]/10 last:border-e-0 align-top leading-relaxed text-xs text-start">
              {wrapBidiChildren(children, "td")}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote dir={baseDir} className="my-2.5 rounded-xl border-s-4 border-[#ff4c00] bg-[#ff4c00]/10 ps-3.5 pe-2 py-2 font-medium text-[#1a191b] italic text-start">
              {wrapBidiChildren(children, "bq")}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code dir="ltr" className="rounded bg-[#1a191b]/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#1a191b] inline-block [unicode-bidi:isolate]">
                  {children}
                </code>
              );
            }
            return (
              <pre dir="ltr" className="my-2 overflow-x-auto rounded-xl bg-[#1a191b] p-3 text-[11px] font-mono text-[#f6d7a1] text-left">
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
