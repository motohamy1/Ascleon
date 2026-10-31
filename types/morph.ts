export type MorphBlockType =
  | "roadmap_cards"
  | "animated_simulator"
  | "mind_map"
  | "spatial_illustration"
  | "comparison_matrix"
  | "interactive_diagram"
  | "concept_flow_map";

export interface ContextLink {
  targetPageOrSegment: number;
  label: string;
  rationale: string;
}

export interface RoadmapCardItem {
  id: string;
  badge: string;
  badgeType: "accent-orange" | "accent-magenta" | "accent-teal" | "accent-cream";
  title: string;
  subtitle: string;
  bulletPoints: string[];
  contextLink?: ContextLink;
}

export interface SimulatorPreset {
  id: string;
  label: string;
  caption: string;
  waveformOffsets?: {
    a2Offset: number;
    p2Offset: number;
  };
}

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  category: "input" | "process" | "decision" | "output" | "danger" | "safe";
  color?: string;
  x?: number;
  y?: number;
  details?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

export interface SpatialLandmark {
  id: string;
  name: string;
  location: string;
  color: string;
  notes: string;
  svgCoords?: { x: number; y: number };
}

export interface ComparisonColumn {
  title: string;
  badge: string;
  badgeType: "accent-orange" | "accent-magenta" | "accent-teal" | "accent-cream";
  characteristics: { label: string; value: string; isPositive?: boolean }[];
  visualSnippet?: string;
}

export interface MorphBlock {
  id: string;
  type: MorphBlockType;
  title: string;
  subtitle?: string;
  badge?: string;
  roadmapCards?: RoadmapCardItem[];
  simulatorData?: {
    type: "s2_split" | "murmur_timing" | "pressure_volume" | "generic_cycle";
    presets: SimulatorPreset[];
    defaultPresetId: string;
  };
  mindMapNodes?: {
    id: string;
    label: string;
    parent?: string;
    color: string;
    detail: string;
  }[];
  spatialLandmarks?: SpatialLandmark[];
  diagramData?: {
    nodes: DiagramNode[];
    edges: DiagramEdge[];
  };
  comparisonData?: {
    left: ComparisonColumn;
    right: ComparisonColumn;
  };
}

export interface MorphArtifactData {
  bookId: string;
  segmentIndex: number;
  selectionHash?: string;
  focalConcept: string;
  contextSummary: {
    precedingBridge?: string;
    subsequentBridge?: string;
  };
  blocks: MorphBlock[];
  createdAt?: string;
}

export interface ContextEnvelope {
  bookId: string;
  bookTitle: string;
  bookTopic?: string;
  segmentIndex: number;
  pageNumber: number;
  focalText: string;
  selectedText?: string;
  precedingSegments: {
    segmentIndex: number;
    pageNumber: number;
    content: string;
  }[];
  subsequentSegments: {
    segmentIndex: number;
    pageNumber: number;
    content: string;
  }[];
}
