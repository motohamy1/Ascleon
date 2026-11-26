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
  onNavigateToPage?: (page: number) => void;
}

function extractPlainText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractPlainText(node.props?.children);
  }
  return "";
}

function getBlockDir(children: React.ReactNode, fallback: "rtl" | "ltr"): "rtl" | "ltr" {
  const plain = extractPlainText(children).trim();
  return plain ? resolveTextDirection(plain) : fallback;
}

const HTML_BR_RE = /<br\s*\/?>/gi;
const CITATION_RE =
  /\[(?:p\.?|pp\.?|page|pages|ص|صفحة)\s*(\d+)(?:\s*[-–—]\s*(\d+))?\]/gi;

function renderTextWithCitations(
  text: string,
  keyPrefix: string,
  onNavigateToPage?: (page: number) => void
): React.ReactNode {
  CITATION_RE.lastIndex = 0;
  if (!CITATION_RE.test(text)) {
    return renderBidiNodes(text, keyPrefix);
  }
  CITATION_RE.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        renderBidiNodes(text.slice(lastIndex, match.index), `${keyPrefix}-txt-${idx}`)
      );
    }
    const startPage = Number(match[1]);
    const endPage = match[2] ? Number(match[2]) : null;
    const label = endPage ? `↗ p.${startPage}–${endPage}` : `↗ p.${startPage}`;
    if (onNavigateToPage && Number.isFinite(startPage) && startPage >= 1) {
      parts.push(
        <button
          key={`${keyPrefix}-cit-${idx}`}
          type="button"
          dir="ltr"
          onClick={() => onNavigateToPage(startPage)}
          title={`Jump to Page ${startPage}`}
          className="ascleon-pill cursor-pointer rounded-full border border-[#0f0e10]/25 bg-[#ff4c00]/15 px-1.5 py-0 text-[10.5px] font-mono font-bold text-[#0f0e10] hover:bg-[#ff4c00] transition-colors"
        >
          {label}
        </button>
      );
    } else {
      parts.push(
        <span
          key={`${keyPrefix}-cit-${idx}`}
          dir="ltr"
          className="ascleon-pill rounded-full border border-[#0f0e10]/20 bg-[#ff4c00]/12 px-1.5 py-0 text-[10.5px] font-mono font-bold text-[#0f0e10]"
        >
          {label}
        </span>
      );
    }
    idx++;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(renderBidiNodes(text.slice(lastIndex), `${keyPrefix}-tail`));
  }
  return parts;
}

function renderStringWithBreaks(
  text: string,
  keyPrefix: string,
  onNavigateToPage?: (page: number) => void
): React.ReactNode {
  if (!HTML_BR_RE.test(text)) {
    return renderTextWithCitations(text, keyPrefix, onNavigateToPage);
  }
  HTML_BR_RE.lastIndex = 0;
  const segments = text.split(HTML_BR_RE);
  return segments.map((seg, i) => (
    <React.Fragment key={`${keyPrefix}-br-${i}`}>
      {i > 0 && <br />}
      {renderTextWithCitations(seg, `${keyPrefix}-seg-${i}`, onNavigateToPage)}
    </React.Fragment>
  ));
}

function wrapBidiChildren(
  children: React.ReactNode,
  prefix = "md",
  onNavigateToPage?: (page: number) => void
): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      return renderStringWithBreaks(child, `${prefix}-${idx}`, onNavigateToPage);
    }
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.props?.children &&
      typeof child.type === "string"
    ) {
      // Do not rewrite code blocks, existing <bdi> nodes, or explicit LTR elements
      const propsAny = child.props as Record<string, unknown>;
      if (
        child.type === "code" ||
        child.type === "pre" ||
        child.type === "bdi" ||
        propsAny.dir === "ltr"
      ) {
        return child;
      }
      return React.cloneElement(child, {
        ...child.props,
        children: wrapBidiChildren(child.props.children, `${prefix}-${idx}`, onNavigateToPage),
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

export default function RichStudyMessage({
  content,
  className,
  onNavigateToPage,
}: RichStudyMessageProps) {
  const processed = useMemo(() => cleanClinicalLatex(content), [content]);
  const baseDir = useMemo(() => resolveTextDirection(processed), [processed]);

  return (
    <div dir={baseDir} className={cn("rich-study-message ascleon-bidi text-[12.5px] leading-relaxed text-[#1a191b] text-start", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 dir={getBlockDir(children, baseDir)} className="mt-3.5 mb-2 font-black text-base text-[#1a191b] tracking-tight border-b-2 border-[#1a191b]/15 pb-1 text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "h1", onNavigateToPage)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 dir={getBlockDir(children, baseDir)} className="mt-3 mb-1.5 font-extrabold text-[14px] text-[#1a191b] tracking-tight flex items-start gap-1.5 text-start [unicode-bidi:isolate]">
              <span className="mt-2 size-2 rounded-full bg-[#ff4c00] inline-block shrink-0" />
              <span className="min-w-0 flex-1">{wrapBidiChildren(children, "h2", onNavigateToPage)}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 dir={getBlockDir(children, baseDir)} className="mt-2.5 mb-1 font-bold text-[13px] text-[#ff4c00] tracking-tight uppercase text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "h3", onNavigateToPage)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 dir={getBlockDir(children, baseDir)} className="mt-2 mb-1 font-bold text-[12.5px] text-[#1a191b]/90 underline decoration-[#ff4c00]/40 underline-offset-2 text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "h4", onNavigateToPage)}
            </h4>
          ),
          p: ({ children }) => (
            <p dir={getBlockDir(children, baseDir)} className="my-1.5 leading-[1.82] text-[#1a191b]/95 last:mb-0 text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "p", onNavigateToPage)}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-[#0f0e10] decoration-[#ff4c00]/45 underline decoration-2 underline-offset-2">
              {wrapBidiChildren(children, "strong", onNavigateToPage)}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#1a191b]/85">
              {wrapBidiChildren(children, "em", onNavigateToPage)}
            </em>
          ),
          ul: ({ children }) => (
            <ul dir={baseDir} className="my-2 space-y-1.5 ps-5 list-disc marker:text-[#ff4c00] text-start">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir={baseDir} className="my-2 space-y-1.5 ps-5 list-decimal marker:font-bold marker:text-[#ff4c00] text-start">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li dir={getBlockDir(children, baseDir)} className="leading-[1.82] text-[#1a191b]/95 text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "li", onNavigateToPage)}
            </li>
          ),
          table: ({ children }) => (
            <div dir={baseDir} className="my-3 overflow-x-auto max-w-full rounded-xl border-2 border-[#1a191b] bg-white/95 shadow-sm">
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
            <th dir={getBlockDir(children, baseDir)} className="min-w-[105px] break-words px-3.5 py-2.5 font-black border-e border-white/20 last:border-e-0 text-white text-[11px] tracking-wide text-start [unicode-bidi:isolate] [&_*]:text-white [&_strong]:text-[#f6d7a1] [&_strong]:bg-transparent [&_strong]:no-underline [&_strong]:p-0 [&_strong]:font-black">
              {wrapBidiChildren(children, "th", onNavigateToPage)}
            </th>
          ),
          td: ({ children }) => (
            <td dir={getBlockDir(children, baseDir)} className="min-w-[105px] break-words px-3.5 py-2.5 text-[#1a191b] border-e border-[#1a191b]/10 last:border-e-0 align-top leading-[1.75] text-xs text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "td", onNavigateToPage)}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote dir={getBlockDir(children, baseDir)} className="my-2.5 rounded-xl border-s-4 border-[#ff4c00] bg-[#ff4c00]/10 ps-3.5 pe-2.5 py-2 font-medium text-[#1a191b] italic text-start [unicode-bidi:isolate]">
              {wrapBidiChildren(children, "bq", onNavigateToPage)}
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
