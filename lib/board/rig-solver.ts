import {
  AnatomyRigModelId,
  LabParamControl,
  LessonTone,
} from "@/types/lesson-board";
import { evalMathExprSafe } from "./math-presets";

export interface SolvedLandmark {
  id: string;
  label: string;
  pos: [number, number, number];
  tone: LessonTone;
}

export interface SolvedBoneSegment {
  id: string;
  label: string;
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  context?: boolean;
}

export interface SolvedMuscleBand {
  id: string;
  label: string;
  path: [number, number, number][];
  tension: number; // 0..1
  baseRadius: number;
  active: boolean;
  tone: LessonTone;
}

export interface SolvedRigPose {
  model: AnatomyRigModelId;
  angleDeg: number;
  angleLabel: string;
  bones: SolvedBoneSegment[];
  bands: SolvedMuscleBand[];
  landmarks: SolvedLandmark[];
  goniometer?: {
    vertex: [number, number, number];
    armA: [number, number, number];
    armB: [number, number, number];
    degrees: number;
  };
  defaultControls: LabParamControl[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function rotateAroundZ(
  origin: [number, number, number],
  length: number,
  angleDeg: number
): [number, number, number] {
  const r = degToRad(angleDeg);
  return [
    origin[0] + Math.sin(r) * length,
    origin[1] - Math.cos(r) * length,
    origin[2],
  ];
}

export function bandRatio(
  currentLen: number,
  restLen: number
): { ratio: number; status: "slack" | "normal" | "taut" | "tight" } {
  const ratio = restLen > 0 ? currentLen / restLen : 1;
  if (ratio < 0.88) return { ratio, status: "slack" };
  if (ratio <= 1.08) return { ratio, status: "normal" };
  if (ratio <= 1.22) return { ratio, status: "taut" };
  return { ratio, status: "tight" };
}

export function goniometerReading(
  a: [number, number, number],
  vertex: [number, number, number],
  b: [number, number, number]
): number {
  const v1 = [a[0] - vertex[0], a[1] - vertex[1], a[2] - vertex[2]];
  const v2 = [b[0] - vertex[0], b[1] - vertex[1], b[2] - vertex[2]];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]) || 1;
  const m2 = Math.hypot(v2[0], v2[1], v2[2]) || 1;
  const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (m1 * m2);
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.round((Math.acos(clamped) * 180) / Math.PI);
}

/**
 * Pure deterministic solver mapping an anatomy model + DOF slider values into
 * 3D bone segments, muscle/ligament band paths, tension ratios, and goniometer points.
 */
export function solveAnatomyRigPose(
  model: AnatomyRigModelId,
  poseOverrides: Record<string, number> = {},
  highlight: string[] = []
): SolvedRigPose {
  const hiSet = new Set(highlight.map((h) => h.toLowerCase()));
  const isHi = (id: string, label: string) =>
    hiSet.size === 0 || hiSet.has(id.toLowerCase()) || hiSet.has(label.toLowerCase());

  if (model === "elbow") {
    const flexion = poseOverrides.flexion ?? 65;
    const shoulder: [number, number, number] = [-0.25, 0.95, 0];
    const elbow: [number, number, number] = [-0.15, 0.02, 0];
    const wrist = rotateAroundZ(elbow, 0.85, flexion);
    const radiusWrist: [number, number, number] = [wrist[0] + 0.06, wrist[1] + 0.02, 0.09];
    const bicepsOrigin: [number, number, number] = [-0.15, 0.88, 0.09];
    const bicepsIns: [number, number, number] = [
      elbow[0] + (wrist[0] - elbow[0]) * 0.28,
      elbow[1] + (wrist[1] - elbow[1]) * 0.28 + 0.06,
      0.07,
    ];
    const bLen = Math.hypot(
      bicepsIns[0] - bicepsOrigin[0],
      bicepsIns[1] - bicepsOrigin[1],
      bicepsIns[2] - bicepsOrigin[2]
    );
    const tension = Math.max(0.15, Math.min(1, 1.15 - bLen * 0.85));

    return {
      model,
      angleDeg: goniometerReading(shoulder, elbow, wrist),
      angleLabel: "Elbow Flexion",
      bones: [
        { id: "humerus", label: "Humerus", start: shoulder, end: elbow, radius: 0.085 },
        { id: "ulna", label: "Ulna", start: elbow, end: wrist, radius: 0.062 },
        { id: "radius", label: "Radius", start: [elbow[0] + 0.05, elbow[1], 0.08], end: radiusWrist, radius: 0.054 },
      ],
      bands: [
        {
          id: "biceps",
          label: "Biceps brachii",
          path: [bicepsOrigin, [-0.08, 0.42, 0.12], bicepsIns],
          tension,
          baseRadius: 0.055,
          active: isHi("biceps", "Biceps brachii"),
          tone: "normal",
        },
        {
          id: "triceps",
          label: "Triceps brachii",
          path: [[-0.32, 0.82, -0.06], [-0.26, 0.4, -0.08], [elbow[0] - 0.07, elbow[1] - 0.04, -0.04]],
          tension: 1 - tension * 0.7,
          baseRadius: 0.048,
          active: isHi("triceps", "Triceps brachii"),
          tone: "neutral",
        },
      ],
      landmarks: [
        { id: "hum_head", label: "Humerus", pos: [-0.24, 0.65, 0.08], tone: "neutral" },
        { id: "biceps_lbl", label: "Biceps brachii", pos: [-0.04, 0.45, 0.18], tone: "normal" },
        { id: "olecranon", label: "Elbow Axis (C5)", pos: [elbow[0] - 0.1, elbow[1], 0.12], tone: "pathology" },
        { id: "radius_lbl", label: "Radius / Forearm", pos: [wrist[0], wrist[1], 0.15], tone: "neutral" },
      ],
      goniometer: { vertex: elbow, armA: shoulder, armB: wrist, degrees: Math.round(flexion) },
      defaultControls: [
        { name: "flexion", label: "Elbow Flexion", min: 10, max: 145, step: 5, value: flexion, unit: "°" },
      ],
    };
  }

  if (model === "knee") {
    const flexion = poseOverrides.flexion ?? 35;
    const hip: [number, number, number] = [0, 0.98, 0];
    const knee: [number, number, number] = [0, 0.05, 0];
    const ankle = rotateAroundZ(knee, 0.9, -flexion);
    return {
      model,
      angleDeg: Math.round(flexion),
      angleLabel: "Knee Flexion",
      bones: [
        { id: "femur", label: "Femur", start: hip, end: knee, radius: 0.095 },
        { id: "tibia", label: "Tibia", start: knee, end: ankle, radius: 0.078 },
        { id: "fibula", label: "Fibula", start: [-0.11, -0.02, -0.05], end: [ankle[0] - 0.09, ankle[1] + 0.05, -0.05], radius: 0.036, context: true },
      ],
      bands: [
        {
          id: "acl",
          label: "ACL",
          path: [[0.03, 0.12, -0.04], [0, 0.05, 0], [-0.03, -0.04, 0.05]],
          tension: Math.min(1, 0.45 + flexion / 160),
          baseRadius: 0.028,
          active: isHi("acl", "ACL"),
          tone: "pathology",
        },
        {
          id: "quadriceps",
          label: "Quadriceps & Patellar Tendon",
          path: [[0, 0.78, 0.11], [0, 0.12, 0.14], [ankle[0] * 0.25, -0.14, 0.1]],
          tension: Math.min(1, 0.35 + flexion / 140),
          baseRadius: 0.052,
          active: isHi("quadriceps", "Quadriceps"),
          tone: "normal",
        },
      ],
      landmarks: [
        { id: "femur_lbl", label: "Femur", pos: [0.1, 0.58, 0.12], tone: "neutral" },
        { id: "acl_lbl", label: "ACL / Joint Line", pos: [0.14, 0.06, 0.14], tone: "pathology" },
        { id: "quad_lbl", label: "Patellar Tendon", pos: [-0.14, 0.24, 0.18], tone: "normal" },
        { id: "tibia_lbl", label: "Tibia", pos: [ankle[0] + 0.1, ankle[1] * 0.6, 0.12], tone: "neutral" },
      ],
      goniometer: { vertex: knee, armA: hip, armB: ankle, degrees: Math.round(flexion) },
      defaultControls: [
        { name: "flexion", label: "Knee Flexion", min: 0, max: 130, step: 5, value: flexion, unit: "°" },
      ],
    };
  }

  if (model === "shoulder" || model === "hip") {
    const abduction = poseOverrides.abduction ?? 55;
    const isShoulder = model === "shoulder";
    const joint: [number, number, number] = [-0.25, 0.35, 0];
    const distal = rotateAroundZ(joint, 0.88, abduction);
    return {
      model,
      angleDeg: Math.round(abduction),
      angleLabel: isShoulder ? "Glenohumeral Abduction" : "Hip Abduction",
      bones: [
        {
          id: isShoulder ? "scapula" : "pelvis",
          label: isShoulder ? "Scapula / Clavicle" : "Pelvis / Acetabulum",
          start: [-0.75, 0.45, -0.05],
          end: joint,
          radius: 0.11,
          context: true,
        },
        {
          id: isShoulder ? "humerus" : "femur",
          label: isShoulder ? "Humerus" : "Femur",
          start: joint,
          end: distal,
          radius: 0.085,
        },
      ],
      bands: [
        {
          id: isShoulder ? "supraspinatus" : "gluteus_medius",
          label: isShoulder ? "Supraspinatus" : "Gluteus Medius",
          path: [[-0.65, 0.52, 0.03], [-0.32, 0.48, 0.05], [joint[0] + (distal[0] - joint[0]) * 0.22, joint[1] + (distal[1] - joint[1]) * 0.22 + 0.07, 0.04]],
          tension: Math.min(1, 0.3 + abduction / 140),
          baseRadius: 0.046,
          active: true,
          tone: "normal",
        },
        {
          id: isShoulder ? "deltoid" : "iliopsoas",
          label: isShoulder ? "Deltoid" : "Hip Capsule",
          path: [[-0.45, 0.54, 0.09], [joint[0] + (distal[0] - joint[0]) * 0.42, joint[1] + (distal[1] - joint[1]) * 0.42, 0.08]],
          tension: Math.min(1, 0.4 + abduction / 120),
          baseRadius: 0.052,
          active: true,
          tone: "pathology",
        },
      ],
      landmarks: [
        { id: "prox", label: isShoulder ? "Glenoid / Acromion" : "Acetabulum", pos: [-0.35, 0.52, 0.14], tone: "neutral" },
        { id: "tendon", label: isShoulder ? "Rotator Cuff" : "Abductors", pos: [0.05, 0.45, 0.16], tone: "pathology" },
        { id: "shaft", label: isShoulder ? "Humerus Shaft" : "Femoral Shaft", pos: [distal[0], distal[1] + 0.15, 0.14], tone: "normal" },
      ],
      goniometer: {
        vertex: joint,
        armA: [joint[0], joint[1] - 0.7, 0],
        armB: distal,
        degrees: Math.round(abduction),
      },
      defaultControls: [
        { name: "abduction", label: isShoulder ? "Abduction Angle" : "Hip Abduction", min: 5, max: 150, step: 5, value: abduction, unit: "°" },
      ],
    };
  }

  // Spine or visceral organ rigs (heart, lung, brain, nephron, eye)
  const load = poseOverrides.load ?? 50;
  return {
    model,
    angleDeg: Math.round(load),
    angleLabel: "Physiological Load",
    bones: [],
    bands: [],
    landmarks: [
      { id: "primary", label: `${model.toUpperCase()} Core`, pos: [0, 0.45, 0.35], tone: "normal" },
      { id: "focus", label: "Active Clinical Zone", pos: [0.42, 0.05, 0.35], tone: "pathology" },
    ],
    defaultControls: [
      { name: "load", label: "Physiological Activity", min: 10, max: 100, step: 5, value: load, unit: "%" },
    ],
  };
}

export interface SampledSimCurve {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

/**
 * Samples interactive-sim math curves deterministically in code (never AI-computed numbers).
 */
export function sampleSimCurves(
  curves: Array<{ fx: string; label: string; color?: string }>,
  xRange: [number, number],
  vars: Record<string, number>,
  samples = 72
): SampledSimCurve[] {
  const [xMin, xMax] = xRange;
  const span = Math.max(0.001, xMax - xMin);
  return curves.map((c, idx) => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= samples; i++) {
      const x = xMin + (span * i) / samples;
      const y = evalMathExprSafe(c.fx, { ...vars, x }, 0);
      pts.push({ x, y });
    }
    return {
      label: c.label,
      color: c.color || (idx === 0 ? "#2563EB" : "#DC2626"),
      points: pts,
    };
  });
}
