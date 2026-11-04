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

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_TOKEN_REGEX = /([a-zA-Z0-9_\-\.\/]+(?:[\s\-\/][a-zA-Z0-9_\-\.\/]+)*)/g;

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

  const parsedContent = useMemo(() => {
    if (!rawString) return null;

    // Apply scientific and medical normalizations first (e.g. CO2 -> CO₂, \sqrt -> √)
    const normalized = normalizeScientificNotation(rawString);

    const hasArabic = ARABIC_REGEX.test(normalized);

    // If pure English or no Arabic characters, return clean normalized string
    if (!hasArabic) {
      return normalized;
    }

    // When Arabic is detected, split and wrap distinct Latin/number tokens in <bdi dir="ltr">
    // We match continuous Latin words, formulas, numbers, and hyphenated terms
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    const tokenRegex = /([a-zA-Z0-9\+\-\*\/%²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉\.\:]{2,}(?:\s+[a-zA-Z0-9\+\-\*\/%²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉\.\:]+)*)/g;

    let match: RegExpExecArray | null;
    let keyIdx = 0;

    while ((match = tokenRegex.exec(normalized)) !== null) {
      if (match.index > lastIndex) {
        segments.push(normalized.substring(lastIndex, match.index));
      }
      segments.push(
        <bdi
          key={`bdi-${keyIdx++}`}
          dir="ltr"
          className="inline-block mx-0.5 font-sans"
        >
          {match[0]}
        </bdi>
      );
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < normalized.length) {
      segments.push(normalized.substring(lastIndex));
    }

    return segments;
  }, [rawString]);

  // If complex children was passed (not a raw string), fallback to rendering children with dir
  if (typeof children !== 'string' && children) {
    return (
      <Component dir={dir} className={className}>
        {children}
      </Component>
    );
  }

  return (
    <Component dir={dir} className={className}>
      {parsedContent}
    </Component>
  );
}
