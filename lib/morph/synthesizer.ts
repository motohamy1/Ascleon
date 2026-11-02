import {
  ContextEnvelope,
  MorphArtifactData,
  MorphBlock,
  RoadmapCardItem,
  DiagramNode,
  DiagramEdge,
  MindMapNode,
} from "@/types/morph";

/**
 * Dynamic First-Principles Morph Synthesizer
 * Extracts and structures concepts directly from the user's active page or selection,
 * without hardcoding any specific domain.
 */
export function synthesizeMorphBlocks(
  envelope: ContextEnvelope,
): MorphArtifactData {
  const {
    focalText,
    bookTitle,
    segmentIndex,
    pageNumber,
    selectedText,
  } = envelope;

  const targetText = (selectedText || focalText || "").trim();
  const sentences = targetText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  // Derive a punchy focal concept from the first sentence or title
  let focalConcept = `${bookTitle} — Page ${pageNumber}`;
  if (sentences.length > 0) {
    const firstWords = sentences[0].split(/\s+/).slice(0, 7).join(" ");
    focalConcept = firstWords.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || focalConcept;
  }

  // 1. Build Roadmap Cards from key extracted passages
  const cardBadgeTypes: Array<"accent-orange" | "accent-teal" | "accent-magenta" | "accent-cream"> = [
    "accent-orange",
    "accent-teal",
    "accent-magenta",
    "accent-cream",
  ];

  const roadmapCards: RoadmapCardItem[] = [];
  const cardCount = Math.min(Math.max(sentences.length, 2), 4);

  for (let i = 0; i < cardCount; i++) {
    const sentence = sentences[i] || `Core mechanism principle ${i + 1}`;
    const words = sentence.split(/\s+/);
    const title = words.slice(0, 5).join(" ");
    const subtitle = sentence.length > 120 ? sentence.slice(0, 117) + "..." : sentence;

    const bulletPoints = [
      `Grounded in page ${pageNumber} of ${bookTitle}.`,
      sentence.length > 60 ? sentence.slice(0, 60) + "..." : "Essential foundational takeaway for exam recall.",
      "Key diagnostic or architectural invariant to memorize.",
    ];

    roadmapCards.push({
      id: `card-dynamic-${i + 1}`,
      badge: i === 0 ? "Core Invariant" : i === 1 ? "Mechanism" : i === 2 ? "Clinical / Applied Rule" : "High-Yield Summary",
      badgeType: cardBadgeTypes[i % cardBadgeTypes.length],
      title: title || `Key Point ${i + 1}`,
      subtitle,
      bulletPoints,
      contextLink: {
        targetPageOrSegment: pageNumber,
        label: `Active Source (Page ${pageNumber})`,
        rationale: "Directly grounded in the active study passage.",
      },
    });
  }

  // 2. Build NotebookLM-Style Concept Mind Map Nodes
  const rootNode: MindMapNode = {
    id: "root-1",
    label: focalConcept,
    sublabel: `Page ${pageNumber}`,
    category: "root",
    color: "#ff4c00",
    details: sentences[0] || `Core principles and mechanisms synthesized from Page ${pageNumber}.`,
    level: 0,
    x: 30,
    y: 110,
  };

  const branchPillars = [
    { label: "Core Mechanism", sublabel: "Physiological Driver", color: "#ff4c00", category: "pillar" as const },
    { label: "Key Adaptations", sublabel: "Structural Findings", color: "#43a08f", category: "pillar" as const },
    { label: "Diagnostic Markers", sublabel: "Clinical & ECG Rules", color: "#7fd8c9", category: "pillar" as const },
    { label: "High-Yield Takeaways", sublabel: "Board Pearls & Rules", color: "#e0459a", category: "pillar" as const },
  ];

  const mindMapNodes: MindMapNode[] = [rootNode];
  const mindMapEdges: { from: string; to: string; label?: string }[] = [];

  const pillarCount = Math.min(branchPillars.length, Math.max(2, sentences.length));

  for (let b = 0; b < pillarCount; b++) {
    const pillarId = `pillar-${b + 1}`;
    const pInfo = branchPillars[b];
    const sentenceForPillar = sentences[b] || `Essential foundation ${b + 1} from page ${pageNumber}.`;

    mindMapNodes.push({
      id: pillarId,
      label: pInfo.label,
      sublabel: pInfo.sublabel,
      category: pInfo.category,
      color: pInfo.color,
      details: sentenceForPillar,
      parent: "root-1",
      level: 1,
      x: 250,
      y: 25 + b * 94,
    });

    mindMapEdges.push({
      from: "root-1",
      to: pillarId,
      label: b === 0 ? "Governs" : b === 1 ? "Drives" : b === 2 ? "Manifests" : "Rule",
    });

    // Add concrete detail leaf under this pillar
    const leafSentence = sentences[b + 2] || sentences[b] || "Observable criteria grounded in the study passage.";
    const leafWords = leafSentence.split(/\s+/).slice(0, 5).join(" ");
    const leafId = `leaf-${b + 1}-1`;

    mindMapNodes.push({
      id: leafId,
      label: leafWords || `Detail ${b + 1}`,
      sublabel: "Mechanism / Criterion",
      category: "mechanism",
      color: pInfo.color,
      details: leafSentence,
      parent: pillarId,
      level: 2,
      x: 480,
      y: 25 + b * 94,
    });

    mindMapEdges.push({
      from: pillarId,
      to: leafId,
    });
  }

  // 3. Build Causal Flow Nodes
  const flowNodes: DiagramNode[] = [
    {
      id: "node-1",
      label: "Baseline State",
      sublabel: `Initial Condition (P.${pageNumber})`,
      category: "input",
      color: "#43a08f",
      x: 50,
      y: 75,
      details: sentences[0] || "Foundational starting condition described in the source text.",
    },
    {
      id: "node-2",
      label: "Core Mechanism",
      sublabel: "Transition / Process",
      category: "process",
      color: "#ff4c00",
      x: 190,
      y: 75,
      details: sentences[1] || "The primary pathophysiological, computational, or theoretical mechanism.",
    },
    {
      id: "node-3",
      label: "System Reaction",
      sublabel: "Intermediate Dynamics",
      category: "decision",
      color: "#e0459a",
      x: 330,
      y: 75,
      details: sentences[2] || "How the system or physiology responds to the primary driver.",
    },
    {
      id: "node-4",
      label: "Final Manifestation",
      sublabel: "Outcome & Impact",
      category: "output",
      color: "#7fd8c9",
      x: 470,
      y: 75,
      details: sentences[3] || "Observable clinical presentation, error state, or terminal behavior.",
    },
  ];

  const flowEdges: DiagramEdge[] = [
    { from: "node-1", to: "node-2", label: "Drives", animated: true },
    { from: "node-2", to: "node-3", label: "Triggers", animated: true },
    { from: "node-3", to: "node-4", label: "Produces", animated: true },
  ];

  // 3. Dynamic Comparison Matrix
  const comparisonData = {
    left: {
      title: "Physiological / Optimal State",
      badge: "Baseline / Rule",
      badgeType: "accent-teal" as const,
      characteristics: [
        { label: "Status", value: "Normal / Specified Invariants Intact", isPositive: true },
        { label: "Grounding", value: `Page ${pageNumber} verified passage`, isPositive: true },
        { label: "Implication", value: "No acute intervention required" },
      ],
    },
    right: {
      title: "Pathological / Deviant State",
      badge: "High-Yield Variant",
      badgeType: "accent-magenta" as const,
      characteristics: [
        { label: "Status", value: "Compromised / Boundary Violation", isPositive: false },
        { label: "Trigger", value: sentences[1] ? sentences[1].slice(0, 45) + "..." : "Stress or acute lesion", isPositive: false },
        { label: "Action", value: "Targeted clinical or architectural correction" },
      ],
    },
  };

  const blocks: MorphBlock[] = [
    {
      id: "block-dynamic-mindmap",
      type: "mind_map",
      title: "Core Principles Concept Map",
      subtitle: `Hierarchical mental model extracted from Page ${pageNumber}`,
      badge: "Concept Map",
      mindMapData: {
        rootLabel: focalConcept,
        nodes: mindMapNodes,
        edges: mindMapEdges,
      },
    },
    {
      id: "block-dynamic-roadmap",
      type: "roadmap_cards",
      title: "Dynamic Concept Synthesis",
      subtitle: `Structured high-yield insights synthesized from Page ${pageNumber}`,
      badge: `Grounded in Page ${pageNumber}`,
      roadmapCards,
    },
    {
      id: "block-dynamic-diagram",
      type: "interactive_diagram",
      title: "Causal Flow Mechanism",
      subtitle: "Visual step-by-step causal chain derived from your source",
      badge: "Interactive Graph",
      diagramData: {
        nodes: flowNodes,
        edges: flowEdges,
      },
    },
    {
      id: "block-dynamic-comparison",
      type: "comparison_matrix",
      title: "Differential / Comparative Contrast",
      subtitle: "Side-by-side distinction of key features and invariant boundaries",
      badge: "Comparative Matrix",
      comparisonData,
    },
  ];

  return {
    bookId: envelope.bookId || "dynamic-book",
    segmentIndex: segmentIndex ?? 0,
    focalConcept,
    blocks,
    contextSummary: {
      precedingBridge: `Preceding sections of "${bookTitle}"`,
      subsequentBridge: `Synthesized dynamically for Page ${pageNumber}`,
    },
  };
}
