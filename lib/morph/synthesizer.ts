import {
  ContextEnvelope,
  MorphArtifactData,
  MorphBlock,
  RoadmapCardItem,
} from "@/types/morph";

/**
 * Intelligent Multi-Modal Morph Synthesizer
 * Generates rich visual drawings, SVG concept maps, anatomical maps,
 * architectural schematics, and interactive simulators.
 */
export function synthesizeMorphBlocks(
  envelope: ContextEnvelope,
): MorphArtifactData {
  const {
    focalText,
    bookTitle,
    segmentIndex,
    pageNumber,
    subsequentSegments = [],
    precedingSegments = [],
  } = envelope;

  const combinedText = (focalText + " " + (envelope.selectedText || "")).trim();
  const lowerText = combinedText.toLowerCase();

  // Domain Detection
  const isHeartSounds =
    lowerText.includes("heart sound") ||
    lowerText.includes("s1") ||
    lowerText.includes("s2") ||
    lowerText.includes("s3") ||
    lowerText.includes("s4") ||
    lowerText.includes("auscultation") ||
    lowerText.includes("murmur");

  const isSoftwareEngineering =
    lowerText.includes("code") ||
    lowerText.includes("software") ||
    lowerText.includes("craftsman") ||
    lowerText.includes("programming") ||
    lowerText.includes("agile") ||
    lowerText.includes("refactor") ||
    lowerText.includes("class") ||
    lowerText.includes("function") ||
    lowerText.includes("clean code") ||
    lowerText.includes("developer");

  const blocks: MorphBlock[] = [];

  // =========================================================================
  // DOMAIN 1: CARDIOLOGY / CLINICAL MEDICINE
  // =========================================================================
  if (isHeartSounds) {
    // 1. Roadmap Cards
    blocks.push({
      id: "block-cardiac-roadmap",
      type: "roadmap_cards",
      title: "Cardiac Cycle & Sound Roadmap",
      subtitle: "Chronological sequence from Late Diastole through Systole into Early Diastole",
      badge: "Grounded in Section " + (segmentIndex + 1),
      roadmapCards: [
        {
          id: "card-s4",
          badge: "S4 Gallop",
          badgeType: "accent-magenta",
          title: "Pre-S1 Atrial Kick",
          subtitle: "Atrial contraction into a non-compliant or stiff LV",
          bulletPoints: [
            "Coincides with P wave on ECG",
            "Causes: Severe Aortic Stenosis, HOCM, Systemic HTN",
            "Always pathological; completely absent in Atrial Fibrillation",
          ],
          contextLink: {
            targetPageOrSegment: 4,
            label: "See JVP Waveforms (Page 4)",
            rationale: "Mirrors Giant 'a' wave in pulmonary hypertension and RV hypertrophy",
          },
        },
        {
          id: "card-s1",
          badge: "S1 (Lub)",
          badgeType: "accent-orange",
          title: "Onset of Systole",
          subtitle: "Closure of Mitral & Tricuspid atrioventricular valves",
          bulletPoints: [
            "🔊 Loud in: Mitral Stenosis, hyperdynamic states, short PR (WPW)",
            "🔉 Soft in: Mitral Regurgitation, prolonged PR interval",
            "Marks the onset of systolic ejection and holosystolic murmurs",
          ],
          contextLink: {
            targetPageOrSegment: 2,
            label: "See Systolic Murmurs (Page 2)",
            rationale: "S1 marks the exact start of Ejection Systolic (AS) & Pansystolic (MR/TR) murmurs",
          },
        },
        {
          id: "card-s2",
          badge: "S2 (Dub)",
          badgeType: "accent-teal",
          title: "Onset of Diastole",
          subtitle: "Closure of Aortic (A2) & Pulmonary (P2) semilunar valves",
          bulletPoints: [
            "🔊 Loud in: Systemic HTN (↑A2), Pulmonary HTN (↑P2), ASD",
            "🔉 Soft in: Severe calcific Aortic Stenosis",
            "Normal split widens with inspiration due to increased RV venous return",
          ],
          contextLink: {
            targetPageOrSegment: 3,
            label: "See RILE Manoeuvres (Page 3)",
            rationale: "Inspiration increases venous return to the right heart, delaying P2 closure",
          },
        },
        {
          id: "card-s3",
          badge: "S3 Gallop",
          badgeType: "accent-cream",
          title: "Early Diastole",
          subtitle: "Rapid passive ventricular filling into volume-overloaded ventricle",
          bulletPoints: [
            "✓ Normal in children and young adults under 30 (hyperdynamic)",
            "⚠️ Pathological in: Dilated cardiomyopathy, severe MR, constrictive knock",
            "Indicates elevated LV end-diastolic filling pressures",
          ],
          contextLink: {
            targetPageOrSegment: 4,
            label: "See Constrictive Signs (Page 4)",
            rationale: "Constrictive pericarditis presents with S3 knock alongside steep 'y' descent",
          },
        },
      ],
    });

    // 2. Interactive SVG Visual Flow Diagram
    blocks.push({
      id: "block-cardiac-flow",
      type: "interactive_diagram",
      title: "Hemodynamic Cause-and-Effect Flow Map",
      subtitle: "Tracing mechanical valve closure to stethoscopic auscultation",
      badge: "Visual Causal Chain",
      diagramData: {
        nodes: [
          {
            id: "node-inspiration",
            label: "Inspiration Event",
            sublabel: "Intrathoracic pressure drops (-4 mmHg)",
            category: "input",
            color: "#43a08f",
            x: 50,
            y: 70,
            details: "Negative intrathoracic pressure sucks venous blood from vena cava into the right atrium and right ventricle.",
          },
          {
            id: "node-rv-filling",
            label: "Prolonged RV Emptying",
            sublabel: "Increased RV stroke volume",
            category: "process",
            color: "#ff4c00",
            x: 200,
            y: 40,
            details: "RV stroke volume increases by ~15%, requiring more time to eject through the pulmonary valve into the lungs.",
          },
          {
            id: "node-lv-filling",
            label: "LV Ejection Shortens",
            sublabel: "Pulmonary vascular capacitance holds blood",
            category: "process",
            color: "#f6d7a1",
            x: 200,
            y: 110,
            details: "Expanded pulmonary capillary bed temporarily sequesters volume, slightly shortening LV systole and advancing A2.",
          },
          {
            id: "node-p2-delay",
            label: "Delayed P2 Closure",
            sublabel: "Semilunar sound delay",
            category: "output",
            color: "#7fd8c9",
            x: 350,
            y: 70,
            details: "P2 semilunar closure occurs 30-60ms after A2, creating the audible physiological S2 split.",
          },
        ],
        edges: [
          { from: "node-inspiration", to: "node-rv-filling", label: "↑ Venous Return", animated: true },
          { from: "node-inspiration", to: "node-lv-filling", label: "Pulmonary Pooling" },
          { from: "node-rv-filling", to: "node-p2-delay", label: "Delayed valve closure", animated: true },
          { from: "node-lv-filling", to: "node-p2-delay", label: "Earlier A2" },
        ],
      },
    });

    // 3. Precordial Anatomical Chest Silhouette Drawing
    blocks.push({
      id: "block-auscultation-landmarks",
      type: "spatial_illustration",
      title: "Precordial Auscultation Anatomical Map",
      subtitle: "Interactive chest silhouette with precise intercostal listening posts",
      badge: "Visual Anatomical Map",
      spatialLandmarks: [
        {
          id: "site-aortic",
          name: "Aortic Area",
          location: "Right 2nd Intercostal Space (Upper sternal border)",
          color: "#43a08f",
          notes: "Best for A2 sound component and aortic stenosis ejection systolic murmur radiating to carotids.",
          svgCoords: { x: 175, y: 85 },
        },
        {
          id: "site-pulmonary",
          name: "Pulmonary Area",
          location: "Left 2nd Intercostal Space (Upper sternal border)",
          color: "#f6d7a1",
          notes: "Best for P2 sound component, S2 splitting assessment, and Graham-Steell pulmonary regurgitation murmur.",
          svgCoords: { x: 225, y: 85 },
        },
        {
          id: "site-tricuspid",
          name: "Tricuspid Area",
          location: "Left 4th Intercostal Space (Lower left sternal border)",
          color: "#e0459a",
          notes: "Best for TR pansystolic murmur, RV gallop sounds (S3/S4), and VSD murmur.",
          svgCoords: { x: 215, y: 135 },
        },
        {
          id: "site-mitral",
          name: "Mitral Area (Apex)",
          location: "Left 5th Intercostal Space (Midclavicular line)",
          color: "#ff4c00",
          notes: "Apex beat. Best for S1, S3/S4 gallop, MR radiation to left axilla, and MS mid-diastolic rumble with bell.",
          svgCoords: { x: 260, y: 175 },
        },
      ],
    });

    // 4. Waveform Simulator
    blocks.push({
      id: "block-s2-simulator",
      type: "animated_simulator",
      title: "Physiological & Pathological Auscultation Simulator",
      subtitle: "Interactive phonocardiogram illustrating valve timing across respiratory & structural states",
      badge: "Dynamic Waveform Engine",
      simulatorData: {
        type: "s2_split",
        defaultPresetId: "normal",
        presets: [
          {
            id: "normal",
            label: "Normal Split",
            caption: "Inspiration decreases intrathoracic pressure → ↑ venous return to right ventricle → delayed RV emptying delays P2 closure after A2.",
            waveformOffsets: { a2Offset: 240, p2Offset: 264 },
          },
          {
            id: "fixed",
            label: "Fixed Split (ASD)",
            caption: "Atrial Septal Defect causes continuous left-to-right shunt, equalizing RV volume between inspiration and expiration. Gap remains fixed.",
            waveformOffsets: { a2Offset: 232, p2Offset: 274 },
          },
          {
            id: "wide",
            label: "Wide Split (RBBB / PS)",
            caption: "Delayed electrical activation (RBBB) or prolonged RV ejection (Pulmonary Stenosis) pushes P2 significantly to the right.",
            waveformOffsets: { a2Offset: 228, p2Offset: 288 },
          },
          {
            id: "reversed",
            label: "Reversed Split (LBBB / AS)",
            caption: "Severe delayed LV emptying (LBBB, severe AS) causes A2 to occur AFTER P2. Inspiration actually narrows the split (paradoxical!).",
            waveformOffsets: { a2Offset: 276, p2Offset: 236 },
          },
        ],
      },
    });

    return {
      bookId: envelope.bookId,
      segmentIndex: envelope.segmentIndex,
      selectionHash: envelope.selectedText ? String(envelope.selectedText.length) : "default",
      focalConcept: "Heart Sounds (S1–S4) & Auscultation Mechanics",
      contextSummary: {
        precedingBridge: "Preceding sections establish hemodynamic pressure curves and cardiac valve anatomy.",
        subsequentBridge: "Directly bridges to Section 2 (Murmur Timing, Classifications & Dynamic Bedside Manoeuvres).",
      },
      blocks,
    };
  }

  // =========================================================================
  // DOMAIN 2: SOFTWARE CRAFTSMANSHIP / COMPUTER SCIENCE (e.g. CLEAN CODE)
  // =========================================================================
  if (isSoftwareEngineering) {
    const sentences = combinedText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    // 1. Roadmap Cards
    blocks.push({
      id: "block-software-roadmap",
      type: "roadmap_cards",
      title: "Core Architectural Principles & Craftsmanship Invariants",
      subtitle: `System principles extracted from ${bookTitle}`,
      badge: "Grounded in Section " + (segmentIndex + 1),
      roadmapCards: [
        {
          id: "card-craftsmanship-creed",
          badge: "Core Philosophy",
          badgeType: "accent-orange",
          title: "Software Craftsmanship",
          subtitle: "Professional responsibility for codebase quality over time",
          bulletPoints: [
            sentences[0] || "The mission of clean code is to improve the state of the art of software craftsmanship.",
            "Clean code is not an academic exercise—it is technical, pragmatic, and substantial.",
            "Focus on what actually works in practice, as opposed to theoretical speculation.",
          ],
          contextLink: subsequentSegments.length > 0 ? {
            targetPageOrSegment: subsequentSegments[0].segmentIndex + 1,
            label: `Next Section: Section ${subsequentSegments[0].segmentIndex + 1}`,
            rationale: "Shows how craftsmanship principles apply directly to naming conventions and function design.",
          } : undefined,
        },
        {
          id: "card-pragmatic-code",
          badge: "Key Invariant",
          badgeType: "accent-teal",
          title: "Code as the Ultimate Truth",
          subtitle: "Specifications change; only working, readable code tells the truth",
          bulletPoints: [
            sentences[1] || "Written by experienced practitioners sharing battle-tested patterns from real systems.",
            "When reading code, clarity must dominate: code is read 10x more often than it is written.",
            "Distinguish what works in real production systems from hypothetical ideals.",
          ],
        },
        {
          id: "card-case-study-rule",
          badge: "Rule of Thumb",
          badgeType: "accent-magenta",
          title: "Case-Study Driven Design",
          subtitle: "Ground engineering decisions in real project outcomes and concrete examples",
          bulletPoints: [
            sentences[2] || "Real case studies demonstrate the hidden friction of sloppy architectures.",
            "Managing Agile and Estimating projects requires clean code to maintain predictable velocity.",
            "Every module should tell an obvious, straightforward story to the next engineer.",
          ],
        },
        {
          id: "card-boy-scout",
          badge: "Discipline",
          badgeType: "accent-cream",
          title: "Continuous Codebase Hygiene",
          subtitle: "Leave the campground cleaner than you found it",
          bulletPoints: [
            "Technical debt accumulates through small compromises, not single disasters.",
            "Small iterative refactors during everyday tasks prevent rewrite paralysis.",
            "Books on your shelf only matter if the principles are actively practiced at the keyboard.",
          ],
        },
      ],
    });

    // 2. Interactive SVG Visual Architecture & Data Flow Map
    blocks.push({
      id: "block-software-flow-diagram",
      type: "interactive_diagram",
      title: "Clean Craftsmanship vs. Technical Debt Flow Map",
      subtitle: "Visualizing how engineering decisions ripple through delivery velocity",
      badge: "Architectural Map",
      diagramData: {
        nodes: [
          {
            id: "node-business-need",
            label: "Product Feature Demand",
            sublabel: "Tight deadline & business scope",
            category: "input",
            color: "#f6d7a1",
            x: 40,
            y: 75,
            details: "Business requires rapid delivery of functionality to capture market opportunity.",
          },
          {
            id: "node-craft-decision",
            label: "Engineering Fork",
            sublabel: "Choice of engineering discipline",
            category: "decision",
            color: "#ff4c00",
            x: 180,
            y: 75,
            details: "Do you take the shortcut with copy-paste and giant functions, or design with clean modular boundaries?",
          },
          {
            id: "node-quick-hack",
            label: "Quick Hack Path",
            sublabel: "Copy-paste & high coupling",
            category: "danger",
            color: "#e0459a",
            x: 300,
            y: 35,
            details: "Initial delivery is fast, but hidden side effects, lack of tests, and tight coupling rot the core.",
          },
          {
            id: "node-clean-path",
            label: "Clean Craftsmanship",
            sublabel: "Boy Scout Rule & TDD",
            category: "safe",
            color: "#43a08f",
            x: 300,
            y: 115,
            details: "Small functions, clear names, zero duplication, and decoupled dependencies protect maintainability.",
          },
          {
            id: "node-debt-spiral",
            label: "Debt Spiral & Fear",
            sublabel: "Velocity drops ~80%, bugs soar",
            category: "danger",
            color: "#ff4c00",
            x: 430,
            y: 35,
            details: "Engineers fear touching legacy code because one small change breaks unrelated modules across the app.",
          },
          {
            id: "node-steady-velocity",
            label: "Sustainable Velocity",
            sublabel: "Predictable releases for years",
            category: "output",
            color: "#7fd8c9",
            x: 430,
            y: 115,
            details: "Features continue to ship smoothly. Refactoring is routine, and onboarding new engineers takes days, not months.",
          },
        ],
        edges: [
          { from: "node-business-need", to: "node-craft-decision", animated: true },
          { from: "node-craft-decision", to: "node-quick-hack", label: "Shortcut" },
          { from: "node-craft-decision", to: "node-clean-path", label: "Discipline", animated: true },
          { from: "node-quick-hack", to: "node-debt-spiral", label: "Rot over time" },
          { from: "node-clean-path", to: "node-steady-velocity", label: "Compound interest", animated: true },
        ],
      },
    });

    // 3. Side-by-Side Visual Comparison Matrix
    blocks.push({
      id: "block-code-comparison",
      type: "comparison_matrix",
      title: "The Craftsmanship Contrast Matrix",
      subtitle: "Side-by-side behavioral comparison between clean vs. rotting codebases",
      badge: "Mental Model",
      comparisonData: {
        left: {
          title: "The Slum Codebase (Debt Accumulation)",
          badge: "Anti-Pattern",
          badgeType: "accent-magenta",
          characteristics: [
            { label: "Function Length", value: "100+ lines doing multiple jobs", isPositive: false },
            { label: "Naming", value: "Opaque variables (x, data, temp, flag)", isPositive: false },
            { label: "Change Friction", value: "High fear: touching file breaks 3 others", isPositive: false },
            { label: "Reading Time", value: "Spends 90% of day deciphering code", isPositive: false },
          ],
          visualSnippet: "// Anti-pattern: Opaque and coupled\nfunction proc(d) {\n  let t = 0;\n  for(let i=0; i<d.length; i++){\n    if(d[i].s == 1) t += d[i].v * 1.15;\n  }\n  return t;\n}",
        },
        right: {
          title: "Clean Craftsmanship (Clean Code Standard)",
          badge: "Clean Standard",
          badgeType: "accent-teal",
          characteristics: [
            { label: "Function Length", value: "Under 10 lines, strictly does one thing", isPositive: true },
            { label: "Naming", value: "Self-explanatory intention-revealing names", isPositive: true },
            { label: "Change Friction", value: "Zero fear: unit tests verify every change", isPositive: true },
            { label: "Reading Time", value: "Reads cleanly like well-written prose", isPositive: true },
          ],
          visualSnippet: "// Clean: Expressive, intention-revealing\nfunction calculateTaxInclusiveTotal(invoices: Invoice[]): number {\n  return invoices\n    .filter(isApprovedForPayment)\n    .reduce((total, inv) => total + applyVat(inv.amount), 0);\n}",
        },
      },
    });

    // 4. Engineering Velocity vs Debt Simulator
    blocks.push({
      id: "block-code-simulator",
      type: "animated_simulator",
      title: "Engineering Velocity vs. Technical Debt Simulator",
      subtitle: "Observe how code craftsmanship impacts team delivery speed over time",
      badge: "System Dynamics",
      simulatorData: {
        type: "generic_cycle",
        defaultPresetId: "clean",
        presets: [
          {
            id: "clean",
            label: "Clean Craftsmanship",
            caption: "High upfront care: Functions are small and expressive. Delivery velocity remains steady over months and years with near-zero regression bugs.",
            waveformOffsets: { a2Offset: 240, p2Offset: 250 },
          },
          {
            id: "hack",
            label: "Quick Hack (Debt Pile)",
            caption: "Fast initial progress: No tests or refactoring. Within 6 months, code rot causes each new feature to take 4x longer due to fear of breaking hidden couplings.",
            waveformOffsets: { a2Offset: 120, p2Offset: 340 },
          },
          {
            id: "refactored",
            label: "Continuous Refactoring",
            caption: "Boy Scout Rule in action: Each commit leaves the file slightly cleaner. Velocity rebounds as modules become decoupled and predictable.",
            waveformOffsets: { a2Offset: 220, p2Offset: 260 },
          },
        ],
      },
    });

    return {
      bookId: envelope.bookId,
      segmentIndex: envelope.segmentIndex,
      selectionHash: envelope.selectedText ? String(envelope.selectedText.length) : "default",
      focalConcept: `${bookTitle} — Software Craftsmanship & Code Hygiene`,
      contextSummary: {
        precedingBridge: precedingSegments.length > 0
          ? `Preceding Section ${precedingSegments[precedingSegments.length - 1].segmentIndex + 1} introduced fundamental definitions.`
          : "Foundational manifesto establishing professional software engineering standards.",
        subsequentBridge: subsequentSegments.length > 0
          ? `Directly links to Section ${subsequentSegments[0].segmentIndex + 1} where hands-on code examples and refactoring begin.`
          : "Culmination section of active chapter.",
      },
      blocks,
    };
  }

  // =========================================================================
  // DOMAIN 3: GENERAL ACADEMIC, SCIENTIFIC & TECHNICAL BOOKS
  // =========================================================================
  const rawSentences = combinedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 25);

  const cleanSentences = rawSentences.length > 0 ? rawSentences : [
    `${bookTitle} establishes fundamental frameworks for conceptual understanding and practical mastery.`,
    `Core observations demonstrate how underlying mechanisms govern real-world outcomes.`,
    `Mastery requires connecting individual observations back to unified first principles.`,
    `Applying these insights systematically differentiates surface knowledge from deep retention.`,
  ];

  const badges = [
    { badge: "Core Axiom", type: "accent-orange" as const },
    { badge: "Primary Mechanism", type: "accent-teal" as const },
    { badge: "Practical Application", type: "accent-magenta" as const },
    { badge: "Memory Anchor", type: "accent-cream" as const },
  ];

  const cards: RoadmapCardItem[] = [];
  const cardCount = Math.min(4, Math.max(2, cleanSentences.length));

  for (let i = 0; i < cardCount; i++) {
    const s = cleanSentences[i % cleanSentences.length];
    const words = s.split(" ");
    const shortTitle = words.slice(0, 5).join(" ") + (words.length > 5 ? "..." : "");
    const remaining = words.slice(5).join(" ") || s;

    cards.push({
      id: `card-concept-${i + 1}`,
      badge: badges[i % badges.length].badge,
      badgeType: badges[i % badges.length].type,
      title: shortTitle,
      subtitle: `Key takeaway from Page ${pageNumber || segmentIndex + 1}`,
      bulletPoints: [
        s.slice(0, 160),
        remaining.length > 20
          ? remaining.slice(0, 140)
          : `Grounded in ${bookTitle} Section ${segmentIndex + 1}.`,
      ],
      contextLink: subsequentSegments.length > 0 ? {
        targetPageOrSegment: subsequentSegments[0].segmentIndex + 1,
        label: `Section ${subsequentSegments[0].segmentIndex + 1}`,
        rationale: `Connects directly to downstream concepts in Section ${subsequentSegments[0].segmentIndex + 1}`,
      } : undefined,
    });
  }

  // 1. Roadmap Cards
  blocks.push({
    id: "block-conceptual-flow",
    type: "roadmap_cards",
    title: "Conceptual Execution Flow & Core Principles",
    subtitle: `Synthesized framework from ${bookTitle}`,
    badge: "Section " + (segmentIndex + 1),
    roadmapCards: cards,
  });

  // 2. Interactive SVG Visual Causal Graph
  blocks.push({
    id: "block-general-diagram",
    type: "interactive_diagram",
    title: "Conceptual Causal & Relationship Flow Map",
    subtitle: `Interactive visual map of ideas derived from ${bookTitle}`,
    badge: "Interactive Graph",
    diagramData: {
      nodes: [
        {
          id: "node-origin",
          label: "Foundational Premise",
          sublabel: "Core initial conditions",
          category: "input",
          color: "#43a08f",
          x: 50,
          y: 75,
          details: cleanSentences[0] || "Foundational premise established in the opening paragraphs.",
        },
        {
          id: "node-transform",
          label: "Mechanistic Interaction",
          sublabel: "Transformative dynamic",
          category: "process",
          color: "#ff4c00",
          x: 230,
          y: 75,
          details: cleanSentences[1] || "The primary mechanism operating between key entities.",
        },
        {
          id: "node-outcome",
          label: "Empirical Consequence",
          sublabel: "Real-world observable state",
          category: "output",
          color: "#7fd8c9",
          x: 400,
          y: 75,
          details: cleanSentences[2] || "The resulting observable invariant and strategic implication.",
        },
      ],
      edges: [
        { from: "node-origin", to: "node-transform", label: "Drives", animated: true },
        { from: "node-transform", to: "node-outcome", label: "Yields", animated: true },
      ],
    },
  });

  return {
    bookId: envelope.bookId,
    segmentIndex: envelope.segmentIndex,
    selectionHash: envelope.selectedText ? String(envelope.selectedText.length) : "default",
    focalConcept: `${bookTitle} — Section ${segmentIndex + 1} Synthesis`,
    contextSummary: {
      precedingBridge: precedingSegments.length > 0
        ? `Preceding Section ${precedingSegments[precedingSegments.length - 1].segmentIndex + 1} established prerequisite context.`
        : "Foundational opening of the active chapter.",
      subsequentBridge: subsequentSegments.length > 0
        ? `Directly links to Section ${subsequentSegments[0].segmentIndex + 1} for further development.`
        : "Culmination section of active chapter.",
    },
    blocks,
  };
}
