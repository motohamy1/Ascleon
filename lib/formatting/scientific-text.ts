/**
 * Normalizes clinical, chemical, mathematical, and pharmacological notation into clean,
 * readable Unicode glyphs (subscripts, superscripts, roots, fractions, and Greek letters)
 * to ensure AI responses never display broken LaTeX artifacts or malformed scientific strings.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'h': 'ₕ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ',
  's': 'ₛ', 't': 'ₜ',
};

export function toSuperscript(str: string): string {
  return str.split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
}

export function toSubscript(str: string): string {
  return str.split('').map(c => SUBSCRIPT_MAP[c] || c).join('');
}

/**
 * Common clinical, blood gas, and electrolyte formulas mapped to standard typography
 */
const CANONICAL_CHEMICAL_REPLACEMENTS: [RegExp, string][] = [
  // Blood gases and physiological terms
  [/\bPaO_?2\b/gi, 'PaO₂'],
  [/\bPaCO_?2\b/gi, 'PaCO₂'],
  [/\bPvO_?2\b/gi, 'PvO₂'],
  [/\bPvCO_?2\b/gi, 'PvCO₂'],
  [/\bSaO_?2\b/gi, 'SaO₂'],
  [/\bSpO_?2\b/gi, 'SpO₂'],
  [/\bFiO_?2\b/gi, 'FiO₂'],
  [/\bEtCO_?2\b/gi, 'EtCO₂'],
  [/\bVO_?2\b/g, 'VO₂'],
  [/\bVCO_?2\b/g, 'VCO₂'],

  // Chemical and electrolyte compounds
  [/\bCO_?2\b/g, 'CO₂'],
  [/\bH_?2O\b/g, 'H₂O'],
  [/\bH_?2O_?2\b/g, 'H₂O₂'],
  [/\bO_?2\b/g, 'O₂'],
  [/\bN_?2O\b/g, 'N₂O'],
  [/\bNO_?2\b/g, 'NO₂'],
  [/\bSO_?2\b/g, 'SO₂'],
  [/\bSO_?4\b/g, 'SO₄'],
  [/\bPO_?4\b/g, 'PO₄'],
  [/\bNH_?3\b/g, 'NH₃'],
  [/\bNH_?4\+?\b/g, 'NH₄⁺'],

  // Charged ions (LaTeX or ASCII)
  [/\bHCO_?3\s*(\^?-|\^\{-\})(?!\w)|\bHCO3-(?!\w)/g, 'HCO₃⁻'],
  [/\bCa\s*(\^?2\+|\^\{2\+\}|\^?\+\+)(?!\w)|\bCa2\+(?!\w)/g, 'Ca²⁺'],
  [/\bMg\s*(\^?2\+|\^\{2\+\}|\^?\+\+)(?!\w)|\bMg2\+(?!\w)/g, 'Mg²⁺'],
  [/\bNa\s*(\^?\+|\^\{\+\})(?!\w)/g, 'Na⁺'],
  [/\bK\s*(\^?\+|\^\{\+\})(?!\w)/g, 'K⁺'],
  [/\bCl\s*(\^?-|\^\{-\})(?!\w)/g, 'Cl⁻'],
  [/\bFe\^?\{?2\+?\}?(?!\w)|\bFe2\+(?!\w)/g, 'Fe²⁺'],
  [/\bFe\^?\{?3\+?\}?(?!\w)|\bFe3\+(?!\w)/g, 'Fe³⁺'],
  [/\bH\s*(\^?\+|\^\{\+\})(?!\w)/g, 'H⁺'],

  // Vitamins and Hormones
  [/\bB_?12\b/g, 'B₁₂'],
  [/\bT_?3\b/g, 'T₃'],
  [/\bT_?4\b/g, 'T₄'],
  [/\bfT_?3\b/gi, 'fT₃'],
  [/\bfT_?4\b/gi, 'fT₄'],
  [/\bHbA_?1c\b/gi, 'HbA1c'],
];

type ReplacementFn = (substring: string, ...args: any[]) => string;
type ReplacementRule = [RegExp, string | ReplacementFn];

/**
 * LaTeX and mathematical symbols cleanup
 */
const MATH_AND_LATEX_REPLACEMENTS: ReplacementRule[] = [
  // LaTeX square roots: \sqrt{expression} -> √(expression)
  [/\\sqrt\[(\d+)\]\{([^}]+)\}/g, 'ⁿ√($2)'],
  [/\\sqrt\{([^}]+)\}/g, '√($1)'],
  [/\\sqrt\s*([a-zA-Z0-9]+)/g, '√$1'],

  // LaTeX fractions: \frac{a}{b} -> (a / b)
  [/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)'],

  // Comparison & operational operators
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\cdot/g, '·'],
  [/\\leq/g, '≤'],
  [/\\le\b/g, '≤'],
  [/\\geq/g, '≥'],
  [/\\ge\b/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\ne\b/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\equiv/g, '≡'],
  [/\\propto/g, '∝'],
  [/\\sim\b/g, '~'],
  [/\\infty/g, '∞'],
  [/\\degree|\\circ\b/g, '°'],

  // Arrows
  [/\\rightarrow|\\to\b/g, '→'],
  [/\\leftarrow/g, '←'],
  [/\\leftrightarrow/g, '↔'],
  [/\\Rightarrow/g, '⇒'],
  [/\\Leftarrow/g, '⇐'],
  [/\\uparrow/g, '↑'],
  [/\\downarrow/g, '↓'],

  // Greek letters
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\Gamma/g, 'Γ'],
  [/\\delta/g, 'δ'],
  [/\\Delta/g, 'Δ'],
  [/\\epsilon/g, 'ε'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\Lambda/g, 'Λ'],
  [/\\mu|\\micro\b/g, 'μ'],
  [/\\pi\b/g, 'π'],
  [/\\sigma/g, 'σ'],
  [/\\Sigma/g, 'Σ'],
  [/\\omega/g, 'ω'],
  [/\\Omega/g, 'Ω'],

  // Units with powers
  [/([a-zA-Z]+)\^2\b/g, '$1²'],
  [/([a-zA-Z]+)\^3\b/g, '$1³'],
  [/10\^(-?\d+)/g, (_: string, exp: string) => `10${toSuperscript(exp)}`],
  [/10\^\{(-?\d+)\}/g, (_: string, exp: string) => `10${toSuperscript(exp)}`],

  // Raw LaTeX braces cleanup like {Ca}^{2+} or x_{1}
  [/_\{(\w+)\}/g, (_: string, sub: string) => toSubscript(sub)],
  [/\^\{(\w+)\}/g, (_: string, sup: string) => toSuperscript(sup)],
];

/**
 * Master normalizer for raw text strings from AI models, OCR, or book segments
 */
export function normalizeScientificNotation(rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText;

  // 1. First pass: Apply canonical chemical, gas and electrolyte replacements
  for (const [pattern, replacement] of CANONICAL_CHEMICAL_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 2. Second pass: Apply LaTeX and mathematical cleanups
  for (const [pattern, replacement] of MATH_AND_LATEX_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement as any);
  }

  // 3. Remove stray inline LaTeX delimiters if text doesn't need KaTeX rendering:
  // e.g. `$CO_2$` -> `CO₂` or `$\sqrt{x}$` -> `√(x)`
  cleaned = cleaned.replace(/\$([^\$\n]+)\$/g, (match, inner) => {
    // If it contains simple text, strip $
    if (!inner.includes('\\begin') && !inner.includes('\\end')) {
      return inner;
    }
    return match;
  });

  return cleaned;
}
