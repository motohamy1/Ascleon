import { StudyLanguage } from "@/lib/language";
import { WhiteboardPacing, WhiteboardScopePayload } from "./whiteboard-video";

export const ALLOWED_LESSON_ICONS = [
  "heart-pulse",
  "brain",
  "bone",
  "pill",
  "syringe",
  "droplet",
  "microscope",
  "activity",
  "stethoscope",
  "thermometer",
  "dna",
  "wind",
  "eye",
  "shield-check",
  "alert-triangle",
  "zap",
  "flame",
  "flask-conical",
  "git-branch",
  "check-circle",
  "circle-dot",
  "book-open",
] as const;

export type LessonIconId = (typeof ALLOWED_LESSON_ICONS)[number];

export type LessonSectionKind =
  | "concept"
  | "mechanism"
  | "clinical"
  | "diagnosis"
  | "management"
  | "recap";

export type LessonNodeKind =
  | "structure"
  | "step"
  | "cause"
  | "effect"
  | "sign"
  | "test"
  | "treatment"
  | "pearl";

export type LessonTone = "neutral" | "normal" | "pathology";

export type LessonLinkKind = "leads_to" | "causes" | "contrasts" | "treats";

export type LessonStatus = "planning" | "rendering" | "completed" | "partial" | "failed";
export type LessonSectionAudioStatus = "planned" | "generating" | "ready" | "failed";

// =============================================================================
// RICH 2D HANDWRITTEN OPS VOCABULARY (1000 x 625 Virtual Paper Space)
// =============================================================================

export type BoardWashTone =
  | "sky"
  | "mint"
  | "sand"
  | "coral"
  | "lilac"
  | "head"
  | "zebra";

export type BoardOp =
  | {
      t: "title";
      text: string;
      subtitle?: string;
      tone?: LessonTone;
      nodeId?: string;
    }
  | {
      t: "write";
      text: string;
      tone?: LessonTone;
      wash?: BoardWashTone;
      emphasis?: "underline" | "box" | "highlight" | "none";
      nodeId?: string;
    }
  | {
      t: "bullets";
      heading?: string;
      items: string[];
      tone?: LessonTone;
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "term";
      term: string;
      definition: string;
      tone?: LessonTone;
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "flow";
      steps: Array<{ label: string; sub?: string; tone?: LessonTone; nodeId?: string }>;
      direction?: "row" | "col";
    }
  | {
      t: "compare";
      leftTitle: string;
      rightTitle: string;
      rows: Array<{ left: string; right: string }>;
      leftTone?: LessonTone;
      rightTone?: LessonTone;
    }
  | {
      t: "cycle";
      title?: string;
      nodes: Array<{ label: string; tone?: LessonTone; nodeId?: string }>;
    }
  | {
      t: "timeline";
      events: Array<{ time: string; label: string; tone?: LessonTone; nodeId?: string }>;
    }
  | {
      t: "formula";
      tex: string;
      label?: string;
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "function_plot";
      title?: string;
      expr: string;
      xRange?: [number, number];
      yRange?: [number, number];
      xLabel?: string;
      yLabel?: string;
      highlightPoints?: Array<{ x: number; label: string }>;
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "data_chart";
      title?: string;
      chartType: "bar" | "pie";
      items: Array<{
        label: string;
        value: number;
        tone?: LessonTone;
      }>;
      unit?: string;
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "source_figure";
      caption: string;
      page: number;
      callouts?: string[];
      wash?: BoardWashTone;
      nodeId?: string;
    }
  | {
      t: "pointer";
      targetNodeId?: string;
      label?: string;
      style?: "circle" | "underline" | "arrow";
    };

// =============================================================================
// 4-TIER NEVER-BLANK 3D & INTERACTIVE LAB SCENE DESCRIPTORS
// =============================================================================

export const ANATOMY_RIG_MODELS = [
  "shoulder",
  "elbow",
  "knee",
  "spine",
  "hip",
  "heart",
  "lung",
  "brain",
  "nephron",
  "eye",
] as const;

export type AnatomyRigModelId = (typeof ANATOMY_RIG_MODELS)[number];

export const PROCEDURAL_3D_BLUEPRINTS = [
  "glandular-acinus",
  "tumor-architecture",
  "immune-cascade",
  "vessel-flow",
  "receptor-membrane",
  "compartment-exchange",
  "molecular-lattice",
  "3d-surface-field",
  "vector-force-rig",
  "action-potential-axon",
] as const;

export type Procedural3DBlueprintId = (typeof PROCEDURAL_3D_BLUEPRINTS)[number];

export interface LabParamControl {
  name: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
}

export interface LabCurveSpec {
  fx: string;
  label: string;
  color?: string;
}

export interface LabLabelPoint {
  id: string;
  label: string;
  labelAr?: string;
  tone?: LessonTone;
  /** Normalized hint [-1..1] for procedural placement if not a rigged landmark */
  pos?: [number, number, number];
}

export type LabCameraPreset = "front" | "side" | "iso" | "top";

export type LabSceneDescriptor =
  | {
      tier: "anatomy-rig";
      title: string;
      model: AnatomyRigModelId;
      cam?: LabCameraPreset;
      pose?: Record<string, number>;
      highlight?: string[];
      testOverlay?: {
        kind: "resist" | "palpate" | "stabilize" | "goniometer" | "auscultate";
        target: string;
        angleDeg?: number;
        note?: string;
      };
      labels?: LabLabelPoint[];
      controls?: LabParamControl[];
    }
  | {
      tier: "procedural-3d";
      title: string;
      blueprint: Procedural3DBlueprintId;
      cam?: LabCameraPreset;
      highlight?: string[];
      params?: LabParamControl[];
      fxy?: string;
      labels?: LabLabelPoint[];
      statusNote?: string;
    }
  | {
      tier: "interactive-sim";
      title: string;
      presetId?: string;
      xLabel: string;
      yLabel: string;
      xRange: [number, number];
      yRange: [number, number];
      curves: LabCurveSpec[];
      params: LabParamControl[];
      readoutLabel?: string;
    }
  | {
      tier: "glb-anatomy";
      title: string;
      packId: string;
      glbUrl: string;
      cam?: LabCameraPreset;
      highlightMeshes?: string[];
      labels?: LabLabelPoint[];
      attribution?: string;
    }
  | {
      tier: "molecule-3d";
      title: string;
      compoundName: string;
      cid?: number;
      cam?: LabCameraPreset;
      labels?: LabLabelPoint[];
    }
  | {
      tier: "smart-diagram-3d";
      title: string;
      cam?: LabCameraPreset;
      subtitle?: string;
      focusNodeIds?: string[];
    }
  | {
      tier: "none";
      title: string;
      reason?: string;
    };

// =============================================================================
// INTERACTIVE ON-BOARD CHALLENGE MODE
// =============================================================================

export type BoardChallenge =
  | {
      kind: "order-steps";
      prompt: string;
      items: Array<{ id: string; label: string }>;
      correctOrder: string[];
      explanation: string;
    }
  | {
      kind: "clinical-choice";
      prompt: string;
      options: Array<{ id: string; label: string }>;
      correctId: string;
      explanation: string;
    }
  | {
      kind: "predict-slider";
      prompt: string;
      paramName: string;
      paramLabel: string;
      min: number;
      max: number;
      unit?: string;
      targetMin: number;
      targetMax: number;
      explanation: string;
    };

export interface BoardLimits {
  minSections: number;
  maxSections: number;
  minNodesPerSection: number;
  maxNodesPerSection: number;
  minSegmentsPerSection: number;
  maxSegmentsPerSection: number;
  maxTitleWords: number;
  maxObjectiveWords: number;
  maxSectionTitleWords: number;
  maxNodeTextWords: number;
  maxSegmentWords: number;
  maxLinks: number;
}

export const DEFAULT_BOARD_LIMITS: BoardLimits = {
  minSections: 3,
  maxSections: 5,
  minNodesPerSection: 2,
  maxNodesPerSection: 4,
  minSegmentsPerSection: 2,
  maxSegmentsPerSection: 6,
  maxTitleWords: 10,
  maxObjectiveWords: 20,
  maxSectionTitleWords: 6,
  maxNodeTextWords: 9,
  maxSegmentWords: 45,
  maxLinks: 18,
};

/**
 * Single source of truth for board limits shared by prompt generation, Zod validation, and sanitization.
 */
export function getBoardLimits(
  scopeType: WhiteboardScopePayload["type"],
  wordCount: number,
  pacing: WhiteboardPacing = "auto"
): BoardLimits {
  let minSections = 3;
  let maxSections = 5;

  if (scopeType === "selection" && wordCount < 150) {
    minSections = 2;
    maxSections = 3;
  } else if (pacing === "concise") {
    minSections = 3;
    maxSections = 4;
  } else if (pacing === "deep") {
    minSections = 4;
    maxSections = 5;
  }

  return {
    ...DEFAULT_BOARD_LIMITS,
    minSections,
    maxSections,
  };
}

export interface LessonNodeSource {
  page: number;
  quote: string;
  inferred?: boolean;
}

export interface LessonNode {
  id: string;
  text: string;
  detail?: string;
  kind: LessonNodeKind;
  tone: LessonTone;
  icon?: LessonIconId;
  trend?: "up" | "down" | "none";
  source: LessonNodeSource;
}

export interface LessonSegment {
  id: string;
  nodeId: string | null;
  text: string;
}

export interface LessonSection {
  id: string;
  title: string;
  kind: LessonSectionKind;
  nodes: LessonNode[];
  script: LessonSegment[];
  /** Rich handwritten ops for the 1000x625 paper renderer */
  ops?: BoardOp[];
  /** Guaranteed 4-tier 3D / Interactive Lab descriptor */
  labScene?: LabSceneDescriptor;
  /** Optional interactive challenge for Active Recall mode */
  challenge?: BoardChallenge;
}

export interface LessonLink {
  from: string;
  to: string;
  kind: LessonLinkKind;
  label?: string;
}

export interface DroppedFactNotice {
  text: string;
  reason: string;
}

export interface LessonCue {
  segmentId: string;
  nodeId: string | null;
  text: string;
  startMs: number;
  endMs: number;
}

export interface LessonVoiceSectionTrack {
  status: LessonSectionAudioStatus;
  audioUrl?: string;
  audioDurationMs?: number;
  cues: LessonCue[];
  error?: string;
}

export interface LessonVoiceTrack {
  voiceId: string;
  pinnedModel?: string;
  style: string;
  status: "pending" | "rendering" | "ready" | "partial" | "failed";
  sections: LessonVoiceSectionTrack[];
  totalDurationMs: number;
}

export interface LessonBoardData {
  id: string;
  bookId: string;
  bookTitle: string;
  scopeHash: string;
  pipelineVersion: number;
  scope: WhiteboardScopePayload;
  language: StudyLanguage;
  pacing: WhiteboardPacing;
  title: string;
  objective: string;
  sections: LessonSection[];
  links: LessonLink[];
  droppedFacts: DroppedFactNotice[];
  status: LessonStatus;
  voiceTracks: Record<string, LessonVoiceTrack>;
  activeVoiceId: string;
  createdAt: string;
  updatedAt: string;
}
