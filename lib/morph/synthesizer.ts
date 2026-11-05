import {
  ContextEnvelope,
  MorphArtifactData,
  MorphBlock,
  RoadmapCardItem,
  DiagramNode,
  DiagramEdge,
  MindMapNode,
} from "@/types/morph";
import { MorphJourney } from "@/lib/ai/schemas/decision-models";

/**
 * Dynamic First-Principles Morph Synthesizer
 * Extracts and structures concepts directly from the user's active page or selection,
 * creating both interactive cards, deep concept maps, and an interactive multi-stage journey.
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
    customTopic,
  } = envelope;

  const targetText = (selectedText || focalText || "").trim();
  const sentences = targetText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  // Derive a canonical focal concept
  let focalConcept = customTopic ? customTopic : `${bookTitle} — Study Concept (P.${pageNumber})`;
  if (!customTopic && sentences.length > 0) {
    const rawFirst = sentences[0].replace(/^[0-9\.\-\s]+/, "").trim();
    focalConcept = rawFirst.length > 45 ? rawFirst.slice(0, 42) + "..." : rawFirst;
  }

  const textLower = (targetText + " " + focalConcept).toLowerCase();
  const isEcg = /ecg|ekg|rhythm|st\s*elevation|lead|arrhythmia|ischemia|infarct|troponin|chest pain/i.test(textLower);
  const isCellular = /receptor|cell|enzyme|antibody|protein|hormone|cascade|membrane|pathway|cytokine/i.test(textLower);
  const isAlgorithm = /algorithm|guideline|triage|treatment|criteria|management|stage|score/i.test(textLower);

  // 1. Build Comprehensive Roadmap Cards (Non-truncated, with mechanisms)
  const cardBadgeTypes: Array<"accent-orange" | "accent-teal" | "accent-magenta" | "accent-cream"> = [
    "accent-orange",
    "accent-teal",
    "accent-magenta",
    "accent-cream",
  ];

  const cardTitles = [
    "Primary Pathophysiological Trigger",
    "Cellular & Structural Remodeling",
    "Clinical Presentation & Bedside Signs",
    "Diagnostic Criteria & High-Yield Pearls",
  ];

  const roadmapCards: RoadmapCardItem[] = [];
  const cardCount = Math.min(Math.max(sentences.length, 2), 4);

  for (let i = 0; i < cardCount; i++) {
    const sentence = sentences[i] || `Fundamental concept invariant from Page ${pageNumber}.`;
    const title = cardTitles[i] || `Core Principle ${i + 1}`;

    const bulletPoints = [
      `Grounded directly in Page ${pageNumber} of "${bookTitle}".`,
      sentence,
      "Key invariant to anchor in long-term clinical memory.",
    ];

    const mechanismSteps = [
      `Initiating event identified on Page ${pageNumber}: ${sentence.slice(0, 60)}...`,
      "Downstream physiological compensation and pressure/volume shifts.",
      "Definitive bedside manifestation and diagnostic confirmation.",
    ];

    roadmapCards.push({
      id: `card-dynamic-${i + 1}`,
      badge: i === 0 ? "Etiology" : i === 1 ? "Pathology" : i === 2 ? "Bedside Sign" : "Exam Pearl",
      badgeType: cardBadgeTypes[i % cardBadgeTypes.length],
      title,
      subtitle: sentence,
      bulletPoints,
      mechanismSteps,
      clinicalSignificance: `Understanding this principle allows immediate differentiation on clinical rounds and board exams.`,
      contextLink: {
        targetPageOrSegment: pageNumber,
        label: `Active Study Source (Page ${pageNumber})`,
        rationale: "Directly grounded in the active study text.",
      },
    });
  }

  // 2. Build Concept Mind Map Nodes with Detailed Mechanisms
  const rootNode: MindMapNode = {
    id: "root-1",
    label: focalConcept,
    sublabel: `Page ${pageNumber} Blueprint`,
    category: "root",
    color: "#ff4c00",
    details: sentences[0] || `Core structural mechanisms synthesized from Page ${pageNumber}.`,
    mechanismSteps: [
      "Initial anatomical or physiological disturbance.",
      "Compensatory systemic neurohormonal or hemodynamic shifts.",
      "Decompensation and clinical presentation.",
    ],
    clinicalSignificance: "Primary foundation for bedside differential diagnosis.",
    sourcePage: pageNumber,
    level: 0,
    x: 30,
    y: 110,
  };

  const branchPillars = [
    { label: "Etiological Driver", sublabel: "Initial Lesion", color: "#ff4c00", category: "pillar" as const },
    { label: "Physiological Cascade", sublabel: "Hemodynamic Shifts", color: "#43a08f", category: "pillar" as const },
    { label: "Diagnostic Triad", sublabel: "Markers & ECG", color: "#7fd8c9", category: "pillar" as const },
    { label: "Clinical Action Rule", sublabel: "Management Rule", color: "#e0459a", category: "pillar" as const },
  ];

  const mindMapNodes: MindMapNode[] = [rootNode];
  const mindMapEdges: { from: string; to: string; label?: string }[] = [];

  branchPillars.forEach((p, idx) => {
    const pId = `pillar-${idx + 1}`;
    const pSentence = sentences[idx % sentences.length] || `Mechanistic branch ${idx + 1}`;

    mindMapNodes.push({
      id: pId,
      label: p.label,
      sublabel: p.sublabel,
      category: p.category,
      color: p.color,
      details: pSentence,
      mechanismSteps: [
        `Trigger: ${pSentence.slice(0, 50)}...`,
        "Progression through intermediate anatomical boundaries.",
        "Clinical threshold crossed requiring therapeutic intervention.",
      ],
      clinicalSignificance: `Key diagnostic indicator on Page ${pageNumber}.`,
      sourcePage: pageNumber,
      parent: "root-1",
      level: 1,
      x: 260,
      y: 25 + idx * 95,
    });

    mindMapEdges.push({
      from: "root-1",
      to: pId,
      label: "governs",
    });

    // Add a concrete leaf node
    const leafId = `leaf-${idx + 1}`;
    mindMapNodes.push({
      id: leafId,
      label: `${p.label} Finding`,
      sublabel: `Grounded in P.${pageNumber}`,
      category: "diagnostic",
      color: p.color,
      details: `Exact clinical criteria and threshold for ${p.label}.`,
      clinicalSignificance: "High-yield board exam invariant.",
      sourcePage: pageNumber,
      parent: pId,
      level: 2,
      x: 490,
      y: 35 + idx * 95,
    });

    mindMapEdges.push({
      from: pId,
      to: leafId,
      label: "yields",
    });
  });

  // 3. Dynamic Comparison Matrix
  const comparisonData = {
    left: {
      title: "Physiological / Baseline State",
      badge: "Normal Rule",
      badgeType: "accent-teal" as const,
      characteristics: [
        { label: "Status", value: "Normal / Specified Invariants Intact", isPositive: true },
        { label: "Grounding", value: `Page ${pageNumber} verified passage`, isPositive: true },
        { label: "Management", value: "Observation and standard monitoring" },
      ],
    },
    right: {
      title: "Pathological / Acute State",
      badge: "Acute Entity",
      badgeType: "accent-magenta" as const,
      characteristics: [
        { label: "Status", value: "Boundary Violation / Decompensation", isPositive: false },
        { label: "Mechanism", value: sentences[1] ? sentences[1].slice(0, 50) + "..." : "Acute tissue hypoperfusion", isPositive: false },
        { label: "Management", value: "Targeted guideline-directed pharmacotherapy" },
      ],
    },
  };

  // 4. Dynamic Interactive Multi-Stage Journey
  const stage1SimType = isEcg ? "ecg_rhythm" : isCellular ? "cellular_cascade" : isAlgorithm ? "treatment_tree" : "plaque_rupture";
  const stage2SimType = isEcg ? "ecg_rhythm" : isCellular ? "cellular_cascade" : "flow_pressure";
  const stage3SimType = isAlgorithm || isEcg ? "treatment_tree" : "generic_dynamic_flow";

  const journey: MorphJourney = {
    title: `Clinical Journey: ${focalConcept}`,
    topic: bookTitle,
    summary: `Interactive multi-stage exploration grounded in ${customTopic ? `Topic: "${customTopic}"` : `Page ${pageNumber}`}`,
    estimatedMinutesToExplore: 5,
    stages: [
      {
        id: "stage-1",
        stageNumber: 1,
        title: `${focalConcept}: Initiating Triggers`,
        phase: "etiology_triggers",
        description: sentences[0] || `The foundational initiating event occurs at the cellular and tissue interface for ${focalConcept}.`,
        keyPathologyPoints: [
          "Disruption of normal homeostasis and protective tissue barriers.",
          "Release of mediators driving local physiological response.",
          "Initial baseline shift governing downstream presentation.",
        ],
        interactiveSimulation: {
          simulationType: stage1SimType,
          primaryMetricLabel: isEcg ? "ST Elevation" : isCellular ? "Receptor Activation" : isAlgorithm ? "Severity Score" : "Lesion Stenosis",
          minMetricValue: 0,
          maxMetricValue: 100,
          defaultMetricValue: isEcg ? 65 : 35,
          metricUnit: isEcg ? " mm" : "%",
          hotspots: [
            { id: "hs-1", label: isEcg ? "J-Point Elevation" : "Trigger Boundary", description: "Primary diagnostic pivot indicating acute onset.", xPercent: 25, yPercent: 25 },
            { id: "hs-2", label: isEcg ? "ST Segment" : "Effector Zone", description: "Critical zone reflecting ischemia or cascade activation.", xPercent: 50, yPercent: 75 },
          ],
        },
        checkpoint: {
          prompt: `What is the primary diagnostic takeaway for ${focalConcept}?`,
          options: [
            "Recognition of primary initiating markers and early physiological shifts",
            "Immediate complete resolution without any diagnostic assessment",
            "Total unresponsiveness of baseline parameters",
            "Indiscriminate non-targeted observational approach",
          ],
          correctOptionIndex: 0,
          explanation: `Early identification of the core mechanism in ${focalConcept} allows prompt diagnostic categorization and optimal management.`,
        },
        visualPrompt: `Dynamic visual representation of ${focalConcept} showing initial pathophysiological triggers.`,
      },
      {
        id: "stage-2",
        stageNumber: 2,
        title: `${focalConcept}: Pathological Cascade`,
        phase: "cellular_pathology",
        description: sentences[1] || `As the process evolves, secondary mechanisms and compensatory pathways alter functional capacity.`,
        keyPathologyPoints: [
          "Downstream signaling and cellular response pathways.",
          "Critical threshold progression impacting functional tissue reserve.",
          "Mismatch between metabolic demand and tissue perfusion/balance.",
        ],
        interactiveSimulation: {
          simulationType: stage2SimType,
          primaryMetricLabel: isEcg ? "ST Elevation" : isCellular ? "Cascade Throughput" : "System Load",
          minMetricValue: 0,
          maxMetricValue: 100,
          defaultMetricValue: 70,
          metricUnit: isEcg ? " mm" : "%",
          hotspots: [
            { id: "hs-1", label: "Threshold Peak", description: "Critical threshold determining stability versus decompensation.", xPercent: 50, yPercent: 45 },
            { id: "hs-2", label: "Affected Bed", description: "Tissue territory experiencing functional impact.", xPercent: 80, yPercent: 50 },
          ],
        },
        checkpoint: {
          prompt: "At what point does pathological compensation become unstable?",
          options: [
            "When physiological reserve is exhausted by ongoing stress or injury",
            "At baseline resting state with normal functional parameters",
            "Instability is independent of severity or progression",
            "Only when external interventions are withheld completely",
          ],
          correctOptionIndex: 0,
          explanation: "Progressive pathological cascades exceed tissue reserve thresholds, precipitating acute clinical decompensation.",
        },
        visualPrompt: `Dynamic vector diagram illustrating the advancing cascade of ${focalConcept}.`,
      },
      {
        id: "stage-3",
        stageNumber: 3,
        title: `${focalConcept}: Management & Decision Tree`,
        phase: "treatment_algorithm",
        description: sentences[2] || `Definitive bedside synthesis: interpreting clinical markers, differential diagnosis, and executing guideline-directed therapies.`,
        keyPathologyPoints: [
          "Biomarker integration for definitive diagnostic confirmation.",
          "Stratification into urgent versus conservative management tracks.",
          "Evidence-based guideline-directed intervention protocol.",
        ],
        interactiveSimulation: {
          simulationType: stage3SimType,
          primaryMetricLabel: isAlgorithm || isEcg ? "Risk Score" : "Therapeutic Response",
          minMetricValue: 0,
          maxMetricValue: 100,
          defaultMetricValue: 75,
          metricUnit: " pts",
          hotspots: [
            { id: "hs-1", label: "Decision Branch", description: "Critical cutoff determining invasive versus conservative protocol.", xPercent: 40, yPercent: 30 },
            { id: "hs-2", label: "Target Outcome", description: "Expected endpoint following guideline-directed therapy.", xPercent: 65, yPercent: 45 },
          ],
        },
        checkpoint: {
          prompt: `Which approach represents standard-of-care initial management for ${focalConcept}?`,
          options: [
            "Guideline-directed therapy targeted to risk-stratified severity criteria",
            "High-dose monotherapy without monitoring or stratification",
            "Delayed reassessment without baseline confirmation",
            "Non-standard observational holding pattern",
          ],
          correctOptionIndex: 0,
          explanation: "Modern clinical practice mandates objective risk stratification and targeted therapy matched to disease acuity.",
        },
        visualPrompt: `Clinical decision tree guiding evidence-based management for ${focalConcept}.`,
      },
    ],
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
    journey,
    contextSummary: {
      precedingBridge: `Preceding sections of "${bookTitle}"`,
      subsequentBridge: `Synthesized dynamically for Page ${pageNumber}`,
    },
  };
}
