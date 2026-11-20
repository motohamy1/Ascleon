import {
  ANATOMY_RIG_MODELS,
  AnatomyRigModelId,
  LabSceneDescriptor,
  LessonSection,
  PROCEDURAL_3D_BLUEPRINTS,
  Procedural3DBlueprintId,
} from "@/types/lesson-board";

// =============================================================================
// SAFE DETERMINISTIC MATH EXPRESSION COMPILER (Zero eval / Zero Function)
// =============================================================================

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
};

const MATH_FUNCS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(Math.max(-1, Math.min(1, x))),
  acos: (x) => Math.acos(Math.max(-1, Math.min(1, x))),
  atan: (x) => Math.atan(x),
  sinh: (x) => Math.sinh(x),
  cosh: (x) => Math.cosh(x),
  tanh: (x) => Math.tanh(x),
  exp: (x) => Math.exp(Math.max(-40, Math.min(40, x))),
  log: (x) => Math.log(Math.max(1e-9, x)),
  ln: (x) => Math.log(Math.max(1e-9, x)),
  log10: (x) => Math.log10(Math.max(1e-9, x)),
  sqrt: (x) => Math.sqrt(Math.max(0, x)),
  abs: (x) => Math.abs(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (a, b) => Math.pow(a, b),
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  sigmoid: (x) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x)))),
};

export type CompiledMathFn = (vars: Record<string, number>) => number;

function tokenizeMath(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = raw.trim();

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      let dotCount = 0;
      while (i < s.length && (/[0-9]/.test(s[i]) || (s[i] === "." && dotCount === 0))) {
        if (s[i] === ".") dotCount++;
        numStr += s[i++];
      }
      const value = Number(numStr);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${numStr}"`);
      tokens.push({ type: "num", value });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        id += s[i++];
      }
      tokens.push({ type: "id", value: id });
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unsupported character "${ch}" in math expression`);
  }
  return tokens;
}

/**
 * Compiles an algebraic expression string (e.g. "vmax * x / (km + x)") into a safe
 * deterministic evaluator function. Supports implicit multiplication (e.g. "2x").
 */
export function compileMathExpr(expr: string): CompiledMathFn {
  const normalized = expr.replace(/\*\*/g, "^").trim();
  if (!normalized || normalized.length > 240) {
    throw new Error("Math expression is empty or too long.");
  }

  const rawTokens = tokenizeMath(normalized);
  // Insert implicit '*' between (num | rparen | non-func id) and (id | lparen | num)
  const tokens: Token[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const cur = rawTokens[i];
    const prev = tokens[tokens.length - 1];
    if (prev) {
      const prevCanEndValue =
        prev.type === "num" ||
        prev.type === "rparen" ||
        (prev.type === "id" && !(prev.value in MATH_FUNCS && cur.type === "lparen"));
      const curCanStartValue =
        cur.type === "num" || cur.type === "id" || cur.type === "lparen";
      if (prevCanEndValue && curCanStartValue) {
        tokens.push({ type: "op", value: "*" });
      }
    }
    tokens.push(cur);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): CompiledMathFn {
    let left = parseTerm();
    while (peek()?.type === "op" && (peek() as { value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { value: "+" | "-" }).value;
      const right = parseTerm();
      const prevLeft = left;
      left =
        op === "+"
          ? (v) => prevLeft(v) + right(v)
          : (v) => prevLeft(v) - right(v);
    }
    return left;
  }

  function parseTerm(): CompiledMathFn {
    let left = parsePower();
    while (peek()?.type === "op" && (peek() as { value: string }).value.match(/^[*/]$/)) {
      const op = (consume() as { value: "*" | "/" }).value;
      const right = parsePower();
      const prevLeft = left;
      left =
        op === "*"
          ? (v) => prevLeft(v) * right(v)
          : (v) => {
              const denom = right(v);
              return Math.abs(denom) < 1e-9 ? prevLeft(v) / (denom >= 0 ? 1e-9 : -1e-9) : prevLeft(v) / denom;
            };
    }
    return left;
  }

  function parsePower(): CompiledMathFn {
    const base = parseUnary();
    if (peek()?.type === "op" && (peek() as { value: string }).value === "^") {
      consume();
      const exp = parsePower();
      return (v) => Math.pow(base(v), exp(v));
    }
    return base;
  }

  function parseUnary(): CompiledMathFn {
    const tok = peek();
    if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
      consume();
      const inner = parseUnary();
      return tok.value === "-" ? (v) => -inner(v) : inner;
    }
    return parsePrimary();
  }

  function parsePrimary(): CompiledMathFn {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of math expression.");

    if (tok.type === "num") {
      consume();
      const val = tok.value;
      return () => val;
    }

    if (tok.type === "lparen") {
      consume();
      const inner = parseExpression();
      if (peek()?.type !== "rparen") {
        throw new Error("Missing closing parenthesis in math expression.");
      }
      consume();
      return inner;
    }

    if (tok.type === "id") {
      consume();
      const name = tok.value;
      if (peek()?.type === "lparen") {
        consume(); // '('
        const args: CompiledMathFn[] = [];
        if (peek()?.type !== "rparen") {
          args.push(parseExpression());
          while (peek()?.type === "comma") {
            consume();
            args.push(parseExpression());
          }
        }
        if (peek()?.type !== "rparen") {
          throw new Error(`Missing ')' after function ${name}(...)`);
        }
        consume();
        const fn = MATH_FUNCS[name.toLowerCase()];
        if (!fn) throw new Error(`Unknown math function "${name}"`);
        return (v) => fn(...args.map((a) => a(v)));
      }
      if (name in MATH_CONSTANTS) {
        const c = MATH_CONSTANTS[name];
        return () => c;
      }
      return (v) => {
        const val = v[name] ?? v[name.toLowerCase()];
        return typeof val === "number" && Number.isFinite(val) ? val : 0;
      };
    }

    throw new Error(`Unexpected token in math expression: ${JSON.stringify(tok)}`);
  }

  const ast = parseExpression();
  if (pos < tokens.length) {
    throw new Error("Trailing tokens in math expression.");
  }

  return (vars) => {
    const out = ast(vars);
    return Number.isFinite(out) ? out : 0;
  };
}

export function isValidMathExpr(
  expr: string,
  sampleVars: Record<string, number> = { x: 1, y: 1 }
): boolean {
  try {
    const fn = compileMathExpr(expr);
    const val = fn(sampleVars);
    return Number.isFinite(val);
  } catch {
    return false;
  }
}

export function evalMathExprSafe(
  expr: string,
  vars: Record<string, number>,
  fallback = 0
): number {
  try {
    const fn = compileMathExpr(expr);
    const val = fn(vars);
    return Number.isFinite(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

// =============================================================================
// CANONICAL CLINICAL & SCIENTIFIC LAB PRESETS (Zero-Failure Guarantees)
// =============================================================================

export type SimPresetScene = Extract<LabSceneDescriptor, { tier: "interactive-sim" }>;

export const CANONICAL_SIM_PRESETS: Record<string, SimPresetScene> = {
  frank_starling: {
    tier: "interactive-sim",
    presetId: "frank_starling",
    title: "Frank-Starling Cardiac Output Curve",
    xLabel: "LVEDP / Preload (mmHg)",
    yLabel: "Stroke Volume (mL)",
    xRange: [0, 28],
    yRange: [0, 140],
    curves: [
      { fx: "maxSv * (1 - exp(-k * x)) * inotropy", label: "Active Patient Curve", color: "#2563EB" },
      { fx: "110 * (1 - exp(-0.14 * x))", label: "Normal Baseline", color: "#94A3B8" },
    ],
    params: [
      { name: "inotropy", label: "Contractility (Inotropy)", min: 0.4, max: 1.5, step: 0.05, value: 1.0, unit: "×" },
      { name: "maxSv", label: "Max Stroke Volume", min: 70, max: 135, step: 5, value: 110, unit: "mL" },
      { name: "k", label: "Ventricular Compliance", min: 0.06, max: 0.24, step: 0.01, value: 0.14, unit: "" },
    ],
    readoutLabel: "Peak SV computed live from preload & contractility",
  },
  michaelis_menten: {
    tier: "interactive-sim",
    presetId: "michaelis_menten",
    title: "Enzyme / Clearance Saturation Kinetics",
    xLabel: "Substrate / Drug [S] (μM)",
    yLabel: "Reaction Velocity V (μmol/min)",
    xRange: [0, 100],
    yRange: [0, 120],
    curves: [
      { fx: "vmax * x / (km + x)", label: "Reaction Velocity V", color: "#2563EB" },
      { fx: "vmax / 2", label: "Half-Max (Vmax / 2)", color: "#DC2626" },
    ],
    params: [
      { name: "vmax", label: "Vmax (Max Capacity)", min: 30, max: 115, step: 5, value: 95, unit: "U" },
      { name: "km", label: "Km (Affinity Constant)", min: 5, max: 60, step: 1, value: 20, unit: "μM" },
    ],
    readoutLabel: "Zero-order saturation occurs when [S] >> Km",
  },
  dose_response: {
    tier: "interactive-sim",
    presetId: "dose_response",
    title: "Pharmacodynamic Dose-Response (Hill Curve)",
    xLabel: "Agonist Dose (mg)",
    yLabel: "Receptor Response (%)",
    xRange: [0, 100],
    yRange: [0, 110],
    curves: [
      { fx: "emax * (x^n) / (ec50^n + x^n)", label: "Patient Response", color: "#2563EB" },
      { fx: "100 * (x^1.5) / (25^1.5 + x^1.5)", label: "Normal Reference", color: "#94A3B8" },
    ],
    params: [
      { name: "emax", label: "Emax (Efficacy)", min: 40, max: 100, step: 5, value: 100, unit: "%" },
      { name: "ec50", label: "EC50 (Potency Shift)", min: 8, max: 70, step: 2, value: 25, unit: "mg" },
      { name: "n", label: "Hill Slope", min: 0.8, max: 3.0, step: 0.1, value: 1.5, unit: "" },
    ],
    readoutLabel: "Competitive antagonists shift EC50 right; noncompetitive drop Emax",
  },
  oxyhemoglobin: {
    tier: "interactive-sim",
    presetId: "oxyhemoglobin",
    title: "Oxyhemoglobin Dissociation (Bohr Shift)",
    xLabel: "PaO2 (mmHg)",
    yLabel: "SaO2 (%)",
    xRange: [0, 100],
    yRange: [0, 105],
    curves: [
      { fx: "100 * (x^2.7) / (p50^2.7 + x^2.7)", label: "Active O2 Saturation", color: "#DC2626" },
      { fx: "100 * (x^2.7) / (27^2.7 + x^2.7)", label: "Normal (pH 7.4, 37°C)", color: "#2563EB" },
    ],
    params: [
      { name: "p50", label: "P50 (Right Shift = O2 Unload)", min: 18, max: 42, step: 1, value: 27, unit: "mmHg" },
    ],
    readoutLabel: "Acidosis, fever, and 2,3-BPG raise P50 to offload O2 to tissues",
  },
  pk_washout: {
    tier: "interactive-sim",
    presetId: "pk_washout",
    title: "First-Order Drug Elimination",
    xLabel: "Time (hours)",
    yLabel: "Plasma Concentration (mg/L)",
    xRange: [0, 24],
    yRange: [0, 110],
    curves: [
      { fx: "c0 * exp(-0.693 * x / thalf)", label: "Plasma [Drug]", color: "#2563EB" },
      { fx: "mec", label: "Min Effective Threshold", color: "#16A34A" },
    ],
    params: [
      { name: "c0", label: "Initial Dose C0", min: 30, max: 100, step: 5, value: 85, unit: "mg/L" },
      { name: "thalf", label: "Half-Life (t½)", min: 1.5, max: 12, step: 0.5, value: 4.5, unit: "h" },
      { name: "mec", label: "Therapeutic Floor", min: 10, max: 40, step: 2, value: 20, unit: "mg/L" },
    ],
    readoutLabel: "Steady state / clearance takes ~4–5 half-lives",
  },
  action_potential: {
    tier: "interactive-sim",
    presetId: "action_potential",
    title: "Membrane Action Potential Dynamics",
    xLabel: "Time (ms)",
    yLabel: "Membrane Potential (mV)",
    xRange: [0, 10],
    yRange: [-95, 50],
    curves: [
      {
        fx: "-70 + amp * exp(-((x - 2.2)^2) / (0.35 * width)) - hyper * exp(-((x - 4.4)^2) / 1.2)",
        label: "Vm(t) Potential",
        color: "#2563EB",
      },
      { fx: "-55", label: "Threshold (-55 mV)", color: "#DC2626" },
    ],
    params: [
      { name: "amp", label: "Na+ Depolarization Drive", min: 40, max: 115, step: 5, value: 105, unit: "mV" },
      { name: "width", label: "Channel Open Duration", min: 0.5, max: 2.5, step: 0.1, value: 1.0, unit: "×" },
      { name: "hyper", label: "K+ Hyperpolarization", min: 0, max: 22, step: 2, value: 14, unit: "mV" },
    ],
    readoutLabel: "All-or-nothing spike triggered once Vm crosses -55 mV",
  },
};

const ANATOMY_KEYWORDS: Array<{ model: AnatomyRigModelId; re: RegExp }> = [
  { model: "elbow", re: /\b(elbow|biceps|brachial\w*|triceps|ulna\w*|radius|radial|olecranon|c5|humerus|humeral|forearm)\b/i },
  { model: "shoulder", re: /\b(shoulder|rotator cuff|supraspinatus|deltoid|glenohumeral|acromion|clavicle|clavicular|scapula\w*)\b/i },
  { model: "knee", re: /\b(knee|acl|pcl|menisc\w*|patella\w*|quadriceps|hamstring\w*|tibia\w*|femur|femoral|valgus|varus)\b/i },
  { model: "spine", re: /\b(spine|vertebra\w*|cervical|lumbar|sciatic\w*|disc|radiculopath\w*|spinal|myotome|dermatome)\b/i },
  { model: "hip", re: /\b(hip|acetabul\w*|femoral head|gluteus|gluteal|trendelenburg|iliopsoas)\b/i },
  { model: "heart", re: /\b(heart|cardiac|myocard\w*|coronary|ventric\w*|atri(?:um|al)|valve\w*|aort\w*|ecg|ischemi\w*|infarct\w*|preload|afterload)\b/i },
  { model: "lung", re: /\b(lung\w*|alveol\w*|pulmonary|bronch\w*|respirat\w*|pleura\w*|pneumothorax|hypoxi\w*|ventilation)\b/i },
  { model: "brain", re: /\b(brain|cerebr\w*|cortic\w*|cortex|stroke|cranial nerve\w*|thalam\w*|basal ganglia|hippocamp\w*|seizure\w*)\b/i },
  { model: "nephron", re: /\b(kidney\w*|renal|nephron\w*|glomerul\w*|tubul\w*|loop of henle|filtration|gfr|aldosterone)\b/i },
  { model: "eye", re: /\b(eye|retina\w*|optic|cornea\w*|pupil\w*|glaucoma|lens|macula\w*|visual)\b/i },
];

const PROCEDURAL_KEYWORDS: Array<{
  blueprint: Procedural3DBlueprintId;
  re: RegExp;
  intensityLabel: string;
  severityLabel: string;
  statusNote: string;
}> = [
  {
    blueprint: "glandular-acinus",
    re: /\b(salivar\w*|parotid\w*|submandib\w*|sublingual|lacrimal\w*|sjogren\w*|mikulicz|xerostomia|sicca|exocrine|acin\w*|ductal|sialaden\w*|sialolith\w*|gland\w*)\b/i,
    intensityLabel: "Secretory Drive",
    severityLabel: "Ductal / Autoimmune Injury",
    statusNote: "Drag sliders to compare healthy acinar secretion vs. lymphocytic infiltrate & ductal obstruction",
  },
  {
    blueprint: "tumor-architecture",
    re: /\b(neoplas\w*|tumor\w*|tumour\w*|carcinoma\w*|adenoma\w*|sarcoma\w*|metasta\w*|malignan\w*|benign|oncogen\w*|biopsy|nodule\w*|mass\b|pleomorphic|warthin|mucoepidermoid|adenoid cystic)\b/i,
    intensityLabel: "Angiogenic Supply",
    severityLabel: "Capsular Invasion",
    statusNote: "Slide Capsular Invasion to compare encapsulated benign growth (<45%) vs. infiltrative carcinoma",
  },
  {
    blueprint: "immune-cascade",
    re: /\b(inflamm\w*|autoimmun\w*|cytokine\w*|lymphocyt\w*|neutrophil\w*|macrophage\w*|complement|igg4|immune\w*|suppurative|abscess|rheumatoid|leukocyt\w*)\b/i,
    intensityLabel: "Chemotactic Flow",
    severityLabel: "Vascular Permeability",
    statusNote: "Adjust permeability to visualize leukocyte margination, diapedesis, and cytokine signaling",
  },
  {
    blueprint: "vessel-flow",
    re: /\b(arter\w*|vein\w*|venous|vessel\w*|thromb\w*|plaque\w*|stenos\w*|embol\w*|blood flow|pressure|perfusion|atheroscler\w*)\b/i,
    intensityLabel: "Flow Velocity",
    severityLabel: "Luminal Stenosis",
    statusNote: "Slide stenosis to inspect laminar flow acceleration across narrowed vascular lumen",
  },
  {
    blueprint: "receptor-membrane",
    re: /\b(receptor\w*|channel\w*|membrane\w*|ligand\w*|agonist\w*|antagonist\w*|pump|atpase|g-protein|transporter\w*)\b/i,
    intensityLabel: "Channel Conductance",
    severityLabel: "Blockade / Desensitization",
    statusNote: "Adjust conductance to see transmembrane ion flux across the lipid bilayer",
  },
  {
    blueprint: "action-potential-axon",
    re: /\b(axon\w*|neuron\w*|synap\w*|action potential|depolariz\w*|myelin\w*|neurotransmitter\w*|sodium|potassium)\b/i,
    intensityLabel: "Conduction Velocity",
    severityLabel: "Demyelination",
    statusNote: "Slide velocity to track saltatory depolarization across myelin sheaths and Nodes of Ranvier",
  },
  {
    blueprint: "compartment-exchange",
    re: /\b(diffus\w*|osmos\w*|osmotic|exchange|gradient\w*|capillar\w*|clearance|filtration|compartment\w*|half-life)\b/i,
    intensityLabel: "Gradient Drive",
    severityLabel: "Barrier Resistance",
    statusNote: "Adjust gradient drive to observe solute equilibration across compartments",
  },
  {
    blueprint: "molecular-lattice",
    re: /\b(enzyme\w*|substrate\w*|molecul\w*|protein\w*|dna|rna|bond\w*|antibod\w*|antigen\w*|inhibitor\w*)\b/i,
    intensityLabel: "Binding Affinity",
    severityLabel: "Competitive Inhibition",
    statusNote: "Explore 3D molecular interaction & complex formation",
  },
  {
    blueprint: "3d-surface-field",
    re: /\b(loss|gradient|surface|optimiz\w*|distribution\w*|function|matrix|eigen\w*|neural net\w*|regression)\b/i,
    intensityLabel: "Field Curvature",
    severityLabel: "Perturbation",
    statusNote: "Orbit the 3D response surface across parameter space",
  },
  {
    blueprint: "vector-force-rig",
    re: /\b(force\w*|torque|lever|vector\w*|gravity|moment|biomechanic\w*|angle|tension)\b/i,
    intensityLabel: "Applied Force",
    severityLabel: "Resistance Load",
    statusNote: "Explore mechanical force balance and compartment vectors",
  },
];

const SIM_KEYWORDS: Array<{ presetId: keyof typeof CANONICAL_SIM_PRESETS; re: RegExp }> = [
  { presetId: "frank_starling", re: /\b(frank.?starling|stroke volume|cardiac output|preload|contractility|inotropy)\b/i },
  { presetId: "michaelis_menten", re: /\b(michaelis|menten|vmax|km|enzyme kinetics|saturation)\b/i },
  { presetId: "dose_response", re: /\b(dose.?response|ec50|emax|potency|efficacy|agonist|antagonist)\b/i },
  { presetId: "oxyhemoglobin", re: /\b(bohr|dissociation|hemoglobin|sao2|p50|oxygen affinity)\b/i },
  { presetId: "pk_washout", re: /\b(half.?life|clearance|pharmacokinetic\w*|elimination|first.?order)\b/i },
  { presetId: "action_potential", re: /\b(action potential|depolariz\w*|repolariz\w*|threshold|nernst|membrane potential)\b/i },
];

export function isKnownAnatomyModel(id: string): id is AnatomyRigModelId {
  return (ANATOMY_RIG_MODELS as readonly string[]).includes(id);
}

export function isKnownProceduralBlueprint(id: string): id is Procedural3DBlueprintId {
  return (PROCEDURAL_3D_BLUEPRINTS as readonly string[]).includes(id);
}

/**
 * Guarantees that ANY section (even from a legacy V1 lesson or an invalid LLM labScene)
 * resolves to a valid, visually rich, non-blank 3D or Interactive Simulation scene.
 */
export function resolveGuaranteedLabScene(
  section: Pick<LessonSection, "id" | "title" | "kind" | "nodes" | "labScene">,
  lessonTitle = ""
): LabSceneDescriptor {
  // 1. Validate caller-provided high-tier labScene if present
  // Note: If the saved candidate is only a generic "smart-diagram-3d", allow deterministic
  // domain inference below to upgrade it to a specialized Tier 1/2/3 model when keywords match!
  const candidate = section.labScene;
  if (candidate) {
    if (candidate.tier === "anatomy-rig" && isKnownAnatomyModel(candidate.model)) {
      return candidate;
    }
    if (
      candidate.tier === "procedural-3d" &&
      isKnownProceduralBlueprint(candidate.blueprint)
    ) {
      if (candidate.fxy && !isValidMathExpr(candidate.fxy, { x: 0.5, y: 0.5 })) {
        return { ...candidate, fxy: "(x^2 + y^2) * 0.4" };
      }
      return candidate;
    }
    if (candidate.tier === "interactive-sim") {
      const sampleVars: Record<string, number> = { x: 10 };
      for (const p of candidate.params || []) {
        sampleVars[p.name] = p.value;
      }
      const validCurves = (candidate.curves || []).filter((c) =>
        isValidMathExpr(c.fx, sampleVars)
      );
      if (validCurves.length > 0 && (candidate.params?.length ?? 0) > 0) {
        return { ...candidate, curves: validCurves };
      }
      if (candidate.presetId && CANONICAL_SIM_PRESETS[candidate.presetId]) {
        return CANONICAL_SIM_PRESETS[candidate.presetId];
      }
    }
  }

  // 2. Deterministic keyword inference from section content + nodes + title
  const sectionCorpus = [
    section.title,
    ...section.nodes.map((n) => `${n.text} ${n.detail || ""}`),
  ].join(" ");
  const fullCorpus = `${lessonTitle} ${sectionCorpus}`;

  // Check if a curve simulator fits best for mechanism/diagnosis math concepts
  for (const sim of SIM_KEYWORDS) {
    if (sim.re.test(sectionCorpus) || sim.re.test(fullCorpus)) {
      return CANONICAL_SIM_PRESETS[sim.presetId];
    }
  }

  // Check Tier 1 anatomy rigs
  for (const item of ANATOMY_KEYWORDS) {
    if (item.re.test(sectionCorpus) || item.re.test(fullCorpus)) {
      const nodeLabels = section.nodes.slice(0, 4).map((n, idx) => ({
        id: n.id,
        label: n.text,
        tone: n.tone,
        pos: [
          idx % 2 === 0 ? -0.68 : 0.68,
          0.55 - idx * 0.36,
          idx % 2 === 0 ? 0.28 : -0.22,
        ] as [number, number, number],
      }));
      return {
        tier: "anatomy-rig",
        title: `${section.title} — 3D Anatomy`,
        model: item.model,
        cam: "iso",
        labels: nodeLabels,
      };
    }
  }

  // Check Tier 2 procedural 3D blueprints (prefer section-specific keywords first, then full corpus)
  const matchedProc =
    PROCEDURAL_KEYWORDS.find((proc) => proc.re.test(sectionCorpus)) ||
    PROCEDURAL_KEYWORDS.find((proc) => proc.re.test(fullCorpus));

  if (matchedProc) {
    const labelAnchors: [number, number, number][] = [
      [-0.78, 0.56, 0.36],
      [0.78, 0.42, 0.28],
      [-0.74, -0.34, 0.22],
      [0.76, -0.28, -0.26],
    ];
    const nodeLabels = section.nodes.slice(0, 4).map((n, idx) => ({
      id: n.id,
      label: n.text,
      tone: n.tone,
      pos: labelAnchors[idx % labelAnchors.length],
    }));
    const hasPathology = section.nodes.some((n) => n.tone === "pathology");
    return {
      tier: "procedural-3d",
      title: `${section.title} — 3D Pathophysiology`,
      blueprint: matchedProc.blueprint,
      cam: "iso",
      statusNote: matchedProc.statusNote,
      params: [
        {
          name: "intensity",
          label: matchedProc.intensityLabel,
          min: 0.2,
          max: 2.0,
          step: 0.1,
          value: 1.0,
          unit: "×",
        },
        {
          name: "severity",
          label: matchedProc.severityLabel,
          min: 0,
          max: 1,
          step: 0.05,
          value: hasPathology ? 0.65 : 0.25,
          unit: "",
        },
      ],
      labels: nodeLabels,
    };
  }

  // Preserve valid explicit smart-diagram-3d if no domain model applied
  if (candidate && candidate.tier === "smart-diagram-3d") {
    return candidate;
  }

  // 3. Guaranteed Tier 4 fallback: depth-layered 3D parallax concept rig from section nodes
  return {
    tier: "smart-diagram-3d",
    title: `${section.title} — 3D Concept Map`,
    cam: "iso",
    subtitle: `${section.nodes.length} connected clinical steps`,
    focusNodeIds: section.nodes.map((n) => n.id),
  };
}
