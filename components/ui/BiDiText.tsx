'use client';

import React, { useMemo } from 'react';
import { normalizeScientificNotation } from '@/lib/formatting/scientific-text';

interface BiDiTextProps {
  children?: React.ReactNode;
  text?: string;
  className?: string;
  as?: React.ElementType;
  dir?: 'ltr' | 'rtl' | 'auto';
}

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_CHAR_REGEX = /[A-Za-z]/g;

/**
 * Determines the true paragraph base direction.
 * Unlike HTML dir="auto" (which uses only the first strong character and flips an
 * Arabic sentence to LTR whenever it starts with an English acronym like "ECG" or "LV"),
 * this checks whether Arabic is the prose script and returns "rtl" when appropriate.
 */
export function resolveTextDirection(raw: string): 'rtl' | 'ltr' {
  if (!raw) return 'ltr';
  const arabicMatches = raw.match(ARABIC_CHAR_REGEX);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  if (arabicCount === 0) return 'ltr';

  const latinMatches = raw.match(LATIN_CHAR_REGEX);
  const latinCount = latinMatches ? latinMatches.length : 0;

  // If Arabic has at least 4 characters and isn't a tiny isolated citation inside long English prose,
  // treat the paragraph as RTL (covers both pure Arabic and Egyptian Arabic + English medical mix).
  if (arabicCount >= 4 || arabicCount >= latinCount) {
    return 'rtl';
  }
  return 'ltr';
}

/**
 * Regex matching continuous LTR runs inside Arabic prose:
 * - Latin words, medical acronyms, numbers, units (e.g. 37.2°C, 140/85 mmHg, 95 bpm)
 * - Comma/slash-separated lists of Latin/number tokens (e.g. II, III, aVF or S1, S2)
 * - Trailing sentence punctuation (. ,) is intentionally excluded so it stays in the RTL stream.
 */
const LTR_RUN_REGEX =
  /[A-Za-z0-9][A-Za-z0-9+\-*/%°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉.:_()]*?(?:(?:\s+|,\s*)[A-Za-z0-9][A-Za-z0-9+\-*/%°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉.:_()]*)*?(?=[A-Za-z0-9%°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉)]|$|[\s\u0600-\u06FF.,،؛؟!?:])/;

const LTR_GLOBAL_REGEX =
  /[A-Za-z0-9][A-Za-z0-9+\-*/%°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉.:_()]*?(?:(?:\s+|,\s*)[A-Za-z0-9+\-*/%°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉.:_()]*)*/g;

function trimTrailingPunctuation(token: string): { core: string; trailing: string } {
  let end = token.length;
  while (end > 0) {
    const ch = token[end - 1];
    if (ch === '.' || ch === ',' || ch === ':' || ch === ' ') {
      end--;
    } else {
      break;
    }
  }
  return {
    core: token.slice(0, end),
    trailing: token.slice(end),
  };
}

/**
 * Splits a mixed Arabic/English string into React nodes with `<bdi dir="ltr">`
 * isolation around Latin, numeric, and unit runs.
 */
export function renderBidiNodes(rawString: string, keyPrefix = 'bdi'): React.ReactNode {
  if (!rawString) return null;

  const normalized = normalizeScientificNotation(rawString);
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    normalized
  );

  if (!hasArabic) {
    return normalized;
  }

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyIdx = 0;

  LTR_GLOBAL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LTR_GLOBAL_REGEX.exec(normalized)) !== null) {
    const { core, trailing } = trimTrailingPunctuation(match[0]);
    if (!core) continue;

    if (match.index > lastIndex) {
      segments.push(normalized.substring(lastIndex, match.index));
    }

    segments.push(
      <bdi
        key={`${keyPrefix}-${keyIdx++}`}
        dir="ltr"
        className="inline-block mx-[0.12em] font-sans [unicode-bidi:isolate]"
      >
        {core}
      </bdi>
    );

    if (trailing) {
      segments.push(trailing);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    segments.push(normalized.substring(lastIndex));
  }

  return segments;
}

/**
 * BiDiText renders mixed Arabic and English/Latin text with proper Unicode BiDi isolation.
 * Embedded Latin tokens, numbers, and medical terms are wrapped in `<bdi dir="ltr">`
 * to prevent inline text scrambled reading order.
 */
export function BiDiText({
  children,
  text,
  className = '',
  as: Component = 'span',
  dir = 'auto',
}: BiDiTextProps) {
  const rawString = typeof children === 'string' ? children : text || '';

  const effectiveDir = useMemo(() => {
    if (dir !== 'auto') return dir;
    return rawString ? resolveTextDirection(rawString) : 'auto';
  }, [dir, rawString]);

  const parsedContent = useMemo(() => {
    if (!rawString) return null;
    return renderBidiNodes(rawString);
  }, [rawString]);

  const isInlineSpan = Component === 'span';
  const alignmentClass = !isInlineSpan ? 'text-start' : '';

  if (typeof children !== 'string' && children) {
    return (
      <Component
        dir={effectiveDir}
        className={`${alignmentClass} ${className}`.trim()}
      >
        {children}
      </Component>
    );
  }

  return (
    <Component
      dir={effectiveDir}
      className={`${alignmentClass} ${className}`.trim()}
    >
      {parsedContent}
    </Component>
  );
}
