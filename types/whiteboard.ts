export type GenerativeWidgetType =
  | "physiology_simulator"
  | "differential_matrix"
  | "clinical_algorithm"
  | "source_pinboard";

export type MedicalPrimitiveType =
  | "brain_territories"
  | "vessel_normal"
  | "vessel_plaque"
  | "vessel_occlusion"
  | "vessel_rupture"
  | "heart_coronary"
  | "lungs_alveoli"
  | "kidney_nephron"
  | "cell_receptor"
  | "action_potential"
  | "ecg_waveform"
  | "patient_droop"
  | "syringe_tpa"
  | "ct_scan"
  | "warning_stamp"
  | "curved_arrow"
  | "rx_pill"
  | "custom_svg";

export interface ChalkNode {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label: string;
  subtext?: string;
  type?: "trigger" | "mediator" | "outcome" | "organ" | "drug" | "trap";
  accentColor?: string; // hex or CSS variable
  revealedInStep?: number; // step index when this node appears (0-indexed)
  sketchType?: MedicalPrimitiveType;
  customPath?: string;
  colorVariant?: "red" | "blue" | "dark" | "green" | "amber";
}

export interface ChalkEdge {
  id: string;
  from: string; // ChalkNode id
  to: string; // ChalkNode id
  label?: string;
  style?: "arrow" | "inhibition" | "dotted" | "curved";
  revealedInStep?: number;
}

export interface ChalkIllustrationSpec {
  title: string;
  nodes: ChalkNode[];
  edges: ChalkEdge[];
  chalkNotes?: string[];
  totalSteps: number;
  illustrationStyle?: "videoscribe" | "chalk";
}

// 1. Physiology / Pharmacology Simulator Widget
export interface SimulatorParameter {
  id: string;
  name: string;
  unit?: string;
  baseValue: number;
  currentValue: number;
  min: number;
  max: number;
  normalRange?: [number, number];
  direction?: "up" | "down" | "stable";
  clinicalSignificance?: string;
}

export interface SimulatorIntervention {
  id: string;
  label: string;
  active: boolean;
  effectDescription: string;
  parameterImpacts: Record<string, number>; // parameterId -> delta
}

export interface PhysiologySimulatorSpec {
  title: string;
  organSystem: string;
  parameters: SimulatorParameter[];
  interventions: SimulatorIntervention[];
  clinicalTakeaway: string;
}

// 2. Differential Matrix Widget
export interface DifferentialItem {
  id: string;
  conditionName: string;
  probability: "High" | "Moderate" | "Low" | "Rule Out";
  hallmarkFeatures: string[];
  pathognomonicSign?: string;
  redFlags?: string[];
  treatmentClue?: string;
}

export interface DifferentialMatrixSpec {
  title: string;
  clinicalPresentation: string;
  keyDifferentiators: string[];
  conditions: DifferentialItem[];
}

// 3. Clinical Algorithm Widget
export interface AlgorithmStep {
  id: string;
  stepNumber: number;
  stageName: string; // e.g. "Initial Assessment", "First-Line Diagnostic", "Urgent Intervention"
  actionText: string;
  decisionQuestion?: string;
  branches?: {
    choiceLabel: string;
    nextStepId: string;
    isUrgent?: boolean;
  }[];
  contraindications?: string[];
  evidenceLevel?: "Class I" | "Class IIa" | "Class III (Harm)";
}

export interface ClinicalAlgorithmSpec {
  title: string;
  chiefComplaintOrScenario: string;
  firstStepId: string;
  steps: AlgorithmStep[];
}

// 4. Source / Anatomical Pinboard Widget
export interface PinboardAnnotation {
  id: string;
  pinNumber: number;
  label: string;
  explanation: string;
  clinicalPearl?: string;
  xPercent: number;
  yPercent: number;
}

export interface SourcePinboardSpec {
  title: string;
  caption: string;
  referenceExcerpt?: string;
  imageUrl?: string;
  annotations: PinboardAnnotation[];
}

export interface GenerativeWidgetSpec {
  type: GenerativeWidgetType;
  physiologySimulator?: PhysiologySimulatorSpec;
  differentialMatrix?: DifferentialMatrixSpec;
  clinicalAlgorithm?: ClinicalAlgorithmSpec;
  sourcePinboard?: SourcePinboardSpec;
}

export interface WhiteboardScene {
  id: string;
  sceneNumber: number;
  title: string;
  durationSecondsEstimate?: number;
  spokenScriptHint: string;
  illustration: ChalkIllustrationSpec;
  widget: GenerativeWidgetSpec;
}

export interface WhiteboardDeck {
  id: string;
  bookTitle: string;
  pageNumber: number;
  topicTitle: string;
  language: "en" | "ar" | "mixed";
  scenes: WhiteboardScene[];
  createdAt?: string;
}

// Real-time choreography event sent by Gemini Live tool calls
export interface WhiteboardChoreographEvent {
  sceneId?: string;
  sceneIndex?: number;
  revealStepIndex?: number;
  laserTargetId?: string; // id of ChalkNode or PinboardAnnotation to point laser at
  laserPosition?: { x: number; y: number }; // optional explicit coordinates
  chalkAnnotation?: string; // handwritten note callout popping up on the board
  highlightBadge?: string;
}

export interface WhiteboardWidgetControlEvent {
  widgetId?: string;
  activeInterventionId?: string;
  toggleIntervention?: boolean;
  activeConditionId?: string;
  activeStepId?: string;
  parameterPatch?: Record<string, number>;
}
