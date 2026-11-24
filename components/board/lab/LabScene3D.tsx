"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { BookOpen, Box, Eye, Layers, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import {
  LabCameraPreset,
  LabParamControl,
  LabSceneDescriptor,
  LessonLink,
  LessonNode,
  LessonSection,
  LessonTone,
} from "@/types/lesson-board";
import { evalMathExprSafe } from "@/lib/board/math-presets";
import { solveAnatomyRigPose } from "@/lib/board/rig-solver";
import { InteractiveSimChart, SimSliderBar } from "./InteractiveSimControls";
import { cn } from "@/lib/utils";

export interface LabScene3DHandle {
  captureSnapshotDataUrl: () => string | null;
}

interface LabScene3DProps {
  scene: LabSceneDescriptor;
  section: LessonSection;
  links: LessonLink[];
  activeNodeId?: string | null;
  timelineFraction?: number;
  language?: "en" | "ar" | "mixed";
  onSelectStructure?: (id: string, label: string) => void;
  onNavigateToPage?: (page: number) => void;
  className?: string;
}

interface ProjectedLabel {
  id: string;
  label: string;
  tone: LessonTone;
  xPct: number;
  yPct: number;
  visible: boolean;
  worldPos: THREE.Vector3;
}

interface InspectorInfo {
  id: string;
  title: string;
  badge: string;
  tone: LessonTone;
  detail: string;
  quote?: string;
  page?: number;
  inferred?: boolean;
}

function buildStructureInsight(
  structId: string,
  structLabel: string,
  scene: LabSceneDescriptor,
  section: LessonSection,
  paramValues: Record<string, number>
): InspectorInfo {
  const matchedNode: LessonNode | undefined =
    section.nodes.find((n) => n.id === structId) ||
    section.nodes.find((n) => n.text.toLowerCase() === structLabel.toLowerCase());

  if (matchedNode) {
    return {
      id: matchedNode.id,
      title: matchedNode.text,
      badge: `${matchedNode.kind.toUpperCase()} · ${matchedNode.tone.toUpperCase()}`,
      tone: matchedNode.tone,
      detail:
        matchedNode.detail ||
        `Linked to Step: ${section.title}. Orbit or adjust parameters to inspect spatial relationships.`,
      quote: matchedNode.source.quote,
      page: matchedNode.source.page,
      inferred: matchedNode.source.inferred,
    };
  }

  const severity = paramValues.severity ?? 0.55;
  const intensity = paramValues.intensity ?? 1.0;

  if (scene.tier === "procedural-3d") {
    if (scene.blueprint === "glandular-acinus") {
      const reservePct = Math.max(12, Math.round((1 - severity * 0.78) * 100));
      if (structId === "acini") {
        return {
          id: structId,
          title: "Secretory Acinar Lobules",
          badge: severity > 0.5 ? "ATROPHIC · PATHOLOGY" : "SECRETORY · NORMAL",
          tone: severity > 0.5 ? "pathology" : "normal",
          detail: `Functional acinar reserve: ${reservePct}%. Serous & mucous acini synthesize primary saliva before ductal modification.`,
        };
      }
      if (structId === "duct") {
        return {
          id: structId,
          title: "Intercalated & Striated Collecting Duct",
          badge: "EXOCRINE CONDUIT",
          tone: "normal",
          detail: `Secretory flow rate ${(intensity * (reservePct / 100)).toFixed(2)}×. Ductal epithelium modifies electrolyte composition and carries saliva to the oral cavity.`,
        };
      }
      if (structId === "infiltrate") {
        return {
          id: structId,
          title: "Periductal Lymphocytic Infiltrate",
          badge: "AUTOIMMUNE · PATHOLOGY",
          tone: "pathology",
          detail: `Infiltration burden ${Math.round(severity * 100)}%. Focal CD4+ T/B lymphocyte aggregates compress ducts and trigger xerostomia & keratoconjunctivitis sicca.`,
        };
      }
    }

    if (scene.blueprint === "tumor-architecture") {
      const malignant = severity >= 0.45;
      return {
        id: structId,
        title: structLabel,
        badge: malignant ? "INFILTRATIVE · PATHOLOGY" : "ENCAPSULATED · BENIGN",
        tone: malignant ? "pathology" : "normal",
        detail: malignant
          ? `Capsular invasion ${Math.round(severity * 100)}%: irregular neoplastic nests breach the fibrous capsule and basement membrane with angiogenic sprouting.`
          : `Well-circumscribed mass (${Math.round(severity * 100)}%): intact fibrous capsule and preserved basement membrane boundary.`,
      };
    }

    if (scene.blueprint === "immune-cascade") {
      return {
        id: structId,
        title: structLabel,
        badge: "INFLAMMATORY CASCADE",
        tone: severity > 0.45 ? "pathology" : "normal",
        detail: `Vascular permeability ${Math.round(severity * 100)}% · Chemotactic drive ${intensity.toFixed(1)}×. Endothelial gaps permit leukocyte margination and extravasation.`,
      };
    }
  }

  return {
    id: structId,
    title: structLabel,
    badge: section.kind.toUpperCase(),
    tone: "neutral",
    detail: `Active focus within "${section.title}". Drag to orbit 360° or tap adjacent landmarks to compare.`,
  };
}

function getToneBadgeClass(tone: LessonTone, selected: boolean): string {
  if (selected) {
    return "border-[#FF4C00] bg-[#FF4C00] text-white shadow-md scale-105 z-20";
  }
  if (tone === "pathology") {
    return "border-red-400/80 bg-[#1A090B]/95 text-red-50 hover:border-red-300";
  }
  if (tone === "normal") {
    return "border-sky-400/80 bg-[#0D0D10]/95 text-sky-50 hover:border-sky-300";
  }
  return "border-white/30 bg-[#0D0D10]/95 text-zinc-100 hover:border-white/70";
}

function setCameraToPreset(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  preset: LabCameraPreset
) {
  const dist = 2.65;
  if (preset === "front") camera.position.set(0, 0.15, dist);
  else if (preset === "side") camera.position.set(dist, 0.15, 0.05);
  else if (preset === "top") camera.position.set(0, dist, 0.35);
  else camera.position.set(1.75, 1.05, 1.95);
  controls.target.set(0, 0.08, 0);
  controls.update();
}

function createSegmentCylinder(
  a: [number, number, number],
  b: [number, number, number],
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = Math.max(0.01, dir.length());
  const geom = new THREE.CylinderGeometry(radius * 0.9, radius, len, 18);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function createBandTube(
  points: [number, number, number][],
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const vecs = points.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(vecs);
  const geom = new THREE.TubeGeometry(curve, 24, radius, 12, false);
  return new THREE.Mesh(geom, material);
}

export const LabScene3D = forwardRef<LabScene3DHandle, LabScene3DProps>(
  function LabScene3D(
    {
      scene,
      section,
      activeNodeId = null,
      timelineFraction = 0.5,
      language = "en",
      onSelectStructure,
      onNavigateToPage,
      className,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const labelRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const projectedListRef = useRef<ProjectedLabel[]>([]);
    const animatedGroupRef = useRef<{
      particles: Array<{ mesh: THREE.Mesh; phase: number; speed: number; customMode?: string }>;
      pulseTarget?: THREE.Object3D;
      spinTarget?: THREE.Object3D;
      waveRing?: THREE.Mesh;
    }>({ particles: [] });
    const glbRootRef = useRef<THREE.Group | null>(null);
    const xrayOpacityRef = useRef<number>(1.0);

    const [camPreset, setCamPreset] = useState<LabCameraPreset>(
      scene.tier !== "interactive-sim" && scene.tier !== "none" ? scene.cam || "iso" : "iso"
    );
    const [selectedStruct, setSelectedStruct] = useState<{ id: string; label: string } | null>(null);
    const selectedStructId = selectedStruct?.id ?? null;
    const [webglFailed, setWebglFailed] = useState(false);
    const [xrayOpacity, setXrayOpacity] = useState<number>(1.0);
    const [assetLoading, setAssetLoading] = useState<boolean>(false);
    const [assetError, setAssetError] = useState<string | null>(null);

    // Build initial parameter state from scene controls or anatomy rig defaults
    const initialParams = useMemo(() => {
      const map: Record<string, number> = {};
      if (scene.tier === "interactive-sim") {
        for (const p of scene.params) map[p.name] = p.value;
      } else if (scene.tier === "procedural-3d" && scene.params) {
        for (const p of scene.params) map[p.name] = p.value;
      } else if (scene.tier === "anatomy-rig") {
        const solved = solveAnatomyRigPose(scene.model, scene.pose || {}, scene.highlight);
        for (const p of scene.controls || solved.defaultControls) {
          map[p.name] = p.value;
        }
      }
      return map;
    }, [scene]);

    const [prevScene, setPrevScene] = useState(scene);
    const [paramValues, setParamValues] = useState<Record<string, number>>(initialParams);

    if (scene !== prevScene) {
      setPrevScene(scene);
      setParamValues(initialParams);
      setSelectedStruct(null);
      setWebglFailed(false);
      setAssetError(null);
      setAssetLoading(false);
      setXrayOpacity(1.0);
      if (scene.tier !== "interactive-sim" && scene.tier !== "none" && scene.cam) {
        setCamPreset(scene.cam);
      }
    }

    useEffect(() => {
      xrayOpacityRef.current = xrayOpacity;
      const root = glbRootRef.current;
      if (!root) return;
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const isHighlighted = Boolean(mesh.userData?.highlighted);
          const targetOpacity = isHighlighted
            ? Math.max(0.85, xrayOpacity)
            : xrayOpacity;
          for (const mat of mats) {
            if (!mat) continue;
            mat.transparent = targetOpacity < 0.98;
            mat.opacity = targetOpacity;
            mat.depthWrite = targetOpacity >= 0.98;
            mat.needsUpdate = true;
          }
        }
      });
    }, [xrayOpacity, scene]);

    const handleParamChange = useCallback((name: string, val: number) => {
      setParamValues((prev) => ({ ...prev, [name]: val }));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        captureSnapshotDataUrl: () => {
          if (rendererRef.current) {
            try {
              return rendererRef.current.domElement.toDataURL("image/webp", 0.9);
            } catch {
              return null;
            }
          }
          return null;
        },
      }),
      []
    );

    const activeControls: LabParamControl[] = useMemo(() => {
      if (scene.tier === "anatomy-rig") {
        const solved = solveAnatomyRigPose(scene.model, paramValues, scene.highlight);
        return scene.controls || solved.defaultControls;
      }
      if (scene.tier === "procedural-3d") {
        return scene.params || [];
      }
      return [];
    }, [scene, paramValues]);

    // Three.js WebGL setup & scene builder for 3D Tiers
    useEffect(() => {
      if (scene.tier === "interactive-sim" || scene.tier === "none") return;
      let cancelled = false;
      glbRootRef.current = null;
      const container = mountRef.current;
      if (!container) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: typeof window !== "undefined" ? window.devicePixelRatio < 2 : true,
          alpha: true,
          powerPreference: "default",
          preserveDrawingBuffer: true,
        });
      } catch {
        queueMicrotask(() => setWebglFailed(true));
        return;
      }

      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      renderer.setPixelRatio(dpr);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(
        Math.max(240, container.clientWidth),
        Math.max(200, container.clientHeight)
      );
      container.innerHTML = "";
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const threeScene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        38,
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        0.05,
        30
      );
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 1.1;
      controls.maxDistance = 5.5;
      controlsRef.current = controls;
      setCameraToPreset(camera, controls, camPreset);

      // Pure neutral studio lighting (zero gray-blue tint)
      const hemi = new THREE.HemisphereLight(0xffffff, 0x18181b, 2.05);
      threeScene.add(hemi);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
      keyLight.position.set(1.2, 2.2, 2.4);
      threeScene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xf5f5f4, 0.65);
      rimLight.position.set(-1.6, 0.8, -1.8);
      threeScene.add(rimLight);

      // Subtle pure-obsidian studio stage disc + crisp perimeter ring
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(1.35, 48),
        new THREE.MeshStandardMaterial({
          color: 0x121214,
          roughness: 0.94,
          metalness: 0.04,
          transparent: true,
          opacity: 0.52,
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.95;
      threeScene.add(floor);

      const floorRim = new THREE.Mesh(
        new THREE.RingGeometry(1.335, 1.35, 64),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
        })
      );
      floorRim.rotation.x = -Math.PI / 2;
      floorRim.position.y = -0.948;
      threeScene.add(floorRim);

      const pickables: THREE.Object3D[] = [];
      const labels: ProjectedLabel[] = [];
      animatedGroupRef.current = { particles: [] };

      const boneMat = new THREE.MeshStandardMaterial({
        color: 0xf1e8d9,
        roughness: 0.78,
        metalness: 0.02,
      });
      const contextBoneMat = new THREE.MeshStandardMaterial({
        color: 0xdbe4ee,
        roughness: 0.85,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      });

      const registerPickable = (
        obj: THREE.Object3D,
        id: string,
        label: string,
        tone: LessonTone,
        pos: [number, number, number]
      ) => {
        obj.userData = { id, label };
        pickables.push(obj);
        labels.push({
          id,
          label,
          tone,
          xPct: 50,
          yPct: 50,
          visible: true,
          worldPos: new THREE.Vector3(...pos),
        });
      };

      // =====================================================================
      // BUILD TIER 1: ANATOMY RIG
      // =====================================================================
      if (scene.tier === "anatomy-rig") {
        const pose = solveAnatomyRigPose(scene.model, paramValues, scene.highlight);

        if (pose.bones.length > 0) {
          for (const b of pose.bones) {
            const mat = b.context ? contextBoneMat : boneMat;
            const cyl = createSegmentCylinder(b.start, b.end, b.radius, mat);
            threeScene.add(cyl);
            const capStart = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 1.18, 16, 16), mat);
            capStart.position.set(...b.start);
            threeScene.add(capStart);
            const capEnd = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 1.15, 16, 16), mat);
            capEnd.position.set(...b.end);
            threeScene.add(capEnd);
            cyl.userData = { id: b.id, label: b.label };
            pickables.push(cyl);
          }

          for (const band of pose.bands) {
            const color =
              band.id === selectedStructId
                ? 0xff4c00
                : band.tone === "pathology"
                ? 0xef4444
                : band.tension > 0.72
                ? 0xf59e0b
                : 0x3b82f6;
            const bandMat = new THREE.MeshStandardMaterial({
              color,
              emissive: band.active ? color : 0x000000,
              emissiveIntensity: band.active ? 0.28 : 0,
              roughness: 0.45,
              transparent: !band.active,
              opacity: band.active ? 0.96 : 0.48,
            });
            const tube = createBandTube(band.path, band.baseRadius, bandMat);
            threeScene.add(tube);
            tube.userData = { id: band.id, label: band.label };
            pickables.push(tube);
          }

          if (pose.goniometer) {
            const { vertex, armA, armB } = pose.goniometer;
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(...armA).lerp(new THREE.Vector3(...vertex), 0.55),
              new THREE.Vector3(...vertex),
              new THREE.Vector3(...armB).lerp(new THREE.Vector3(...vertex), 0.55),
            ]);
            const line = new THREE.Line(
              lineGeom,
              new THREE.LineBasicMaterial({ color: 0x38bdf8 })
            );
            threeScene.add(line);
          }
        } else {
          // Visceral Organ Models (heart, lung, brain, nephron, spine, eye)
          const organGroup = new THREE.Group();
          const load = (paramValues.load ?? 55) / 100;

          if (scene.model === "heart") {
            const muscle = new THREE.MeshStandardMaterial({
              color: 0xdc2626,
              roughness: 0.42,
              metalness: 0.05,
            });
            const lv = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 28), muscle);
            lv.scale.set(0.85, 1.25, 0.8);
            lv.position.set(0.1, -0.05, 0);
            const rv = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), muscle);
            rv.scale.set(0.85, 1.1, 0.75);
            rv.position.set(-0.22, -0.02, 0.08);
            const aorta = createBandTube(
              [[0.05, 0.35, 0], [0.05, 0.72, -0.05], [-0.18, 0.78, -0.18], [-0.22, 0.1, -0.28]],
              0.085,
              new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 })
            );
            const lad = createBandTube(
              [[0.02, 0.32, 0.32], [0.08, 0.05, 0.39], [0.14, -0.35, 0.25]],
              0.028,
              new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.35 })
            );
            organGroup.add(lv, rv, aorta, lad);
            animatedGroupRef.current.pulseTarget = organGroup;
            registerPickable(lv, "lv", "Left Ventricle", "normal", [0.22, -0.05, 0.36]);
            registerPickable(lad, "lad", "Coronary Perfusion", "pathology", [0.15, 0.15, 0.42]);
          } else if (scene.model === "lung") {
            const lungMat = new THREE.MeshStandardMaterial({
              color: 0xf472b6,
              roughness: 0.55,
              transparent: true,
              opacity: 0.84,
            });
            const rLung = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), lungMat);
            rLung.scale.set(0.75, 1.35, 0.72);
            rLung.position.set(-0.36, 0, 0);
            const lLung = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 24), lungMat);
            lLung.scale.set(0.72, 1.3, 0.7);
            lLung.position.set(0.36, 0, 0);
            const trachea = createSegmentCylinder(
              [0, 0.85, 0],
              [0, 0.22, 0],
              0.07,
              new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.5 })
            );
            organGroup.add(rLung, lLung, trachea);
            animatedGroupRef.current.pulseTarget = organGroup;
            registerPickable(trachea, "trachea", "Tracheobronchial Tree", "normal", [0, 0.65, 0.15]);
            registerPickable(lLung, "alveoli", `Alveolar Expansion (${Math.round(load * 100)}%)`, "pathology", [0.42, 0.05, 0.3]);
          } else if (scene.model === "brain") {
            const brainMat = new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.6 });
            const leftH = new THREE.Mesh(new THREE.SphereGeometry(0.44, 26, 26), brainMat);
            leftH.scale.set(0.72, 0.95, 1.25);
            leftH.position.set(-0.22, 0.1, 0);
            const rightH = new THREE.Mesh(new THREE.SphereGeometry(0.44, 26, 26), brainMat);
            rightH.scale.set(0.72, 0.95, 1.25);
            rightH.position.set(0.22, 0.1, 0);
            const stem = createSegmentCylinder([0, -0.05, -0.08], [0, -0.68, -0.15], 0.11, brainMat);
            organGroup.add(leftH, rightH, stem);
            registerPickable(leftH, "cortex", "Cerebral Cortex", "normal", [-0.32, 0.35, 0.25]);
            registerPickable(stem, "brainstem", "Brainstem / Cranial Outflow", "pathology", [0.1, -0.45, 0.15]);
          } else if (scene.model === "spine") {
            for (let i = -3; i <= 3; i++) {
              const disc = new THREE.Mesh(
                new THREE.CylinderGeometry(0.22, 0.22, 0.13, 20),
                i === 0
                  ? new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.35 })
                  : boneMat
              );
              disc.position.set(0, i * 0.21, Math.sin(i * 0.35) * 0.08);
              organGroup.add(disc);
              if (i === 0) registerPickable(disc, "disc", "Target Intervertebral Level", "pathology", [0.28, 0, 0.15]);
            }
          } else {
            // Nephron / Eye clean multi-part representation
            const core = new THREE.Mesh(
              new THREE.TorusKnotGeometry(0.36, 0.1, 72, 14),
              new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.38 })
            );
            organGroup.add(core);
            registerPickable(core, "core", `${scene.model.toUpperCase()} Complex`, "normal", [0, 0.45, 0.25]);
          }
          threeScene.add(organGroup);
        }

        // Append custom landmarks from scene/pose
        const labelSource = scene.labels && scene.labels.length > 0 ? scene.labels : pose.landmarks;
        for (const lm of labelSource) {
          if (!labels.some((l) => l.id === lm.id)) {
            labels.push({
              id: lm.id,
              label: language === "ar" && "labelAr" in lm && lm.labelAr ? lm.labelAr : lm.label,
              tone: lm.tone || "neutral",
              xPct: 50,
              yPct: 50,
              visible: true,
              worldPos: new THREE.Vector3(...(lm.pos || [0, 0.2, 0.2])),
            });
          }
        }
      }

      // =====================================================================
      // BUILD TIER 2: UNIVERSAL PROCEDURAL 3D BLUEPRINTS
      // =====================================================================
      if (scene.tier === "procedural-3d") {
        const intensity = paramValues.intensity ?? 1.0;
        const severity = paramValues.severity ?? 0.55;

        if (scene.blueprint === "glandular-acinus") {
          // Exocrine Salivary / Lacrimal Gland Lobule Cross-Section (e.g., Sjogren's / Mikulicz / Parotitis)
          const reserveFactor = Math.max(0.45, 1 - severity * 0.45);
          const acinusHealthyColor = severity > 0.55 ? 0xfb7185 : 0xf472b6;
          const acinusMat = new THREE.MeshStandardMaterial({
            color: acinusHealthyColor,
            emissive: severity > 0.55 ? 0x9f1239 : 0x831843,
            emissiveIntensity: 0.16,
            roughness: 0.35,
            transparent: true,
            opacity: 0.86,
          });
          const ductMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.22,
            roughness: 0.38,
            transparent: true,
            opacity: 0.72,
          });

          // Main excretory + bilateral intercalated ducts
          const mainDuct = createSegmentCylinder([0, 0.08, 0], [0.98, 0.08, 0], 0.11, ductMat);
          const upperBranch = createSegmentCylinder([-0.55, 0.38, 0.12], [0.05, 0.08, 0], 0.068, ductMat);
          const lowerBranch = createSegmentCylinder([-0.55, -0.32, -0.12], [0.05, 0.08, 0], 0.068, ductMat);
          threeScene.add(mainDuct, upperBranch, lowerBranch);
          registerPickable(mainDuct, "duct", "Collecting Salivary Duct", "normal", [0.62, 0.28, 0.12]);

          // Secretory acinar berry clusters
          const aciniCoords: [number, number, number][] = [
            [-0.78, 0.48, 0.16],
            [-0.58, 0.58, -0.05],
            [-0.86, 0.26, -0.06],
            [-0.76, -0.44, -0.14],
            [-0.56, -0.52, 0.08],
            [-0.84, -0.22, 0.12],
          ];
          aciniCoords.forEach((pos, idx) => {
            const berry = new THREE.Mesh(
              new THREE.SphereGeometry(0.18 * reserveFactor, 22, 22),
              acinusMat
            );
            berry.position.set(...pos);
            threeScene.add(berry);
            if (idx === 0) {
              registerPickable(berry, "acini", "Secretory Acinar Lobules", severity > 0.5 ? "pathology" : "normal", [-0.72, 0.66, 0.2]);
            } else {
              berry.userData = { id: "acini", label: "Secretory Acinar Lobules" };
              pickables.push(berry);
            }
          });

          // Periductal CD4+ lymphocytic infiltrate nodules (scales with severity)
          if (severity > 0.12) {
            const lymphMat = new THREE.MeshStandardMaterial({
              color: 0xa855f7,
              emissive: 0x7e22ce,
              emissiveIntensity: 0.38,
              roughness: 0.32,
            });
            const lymphCount = Math.max(4, Math.round(severity * 16));
            for (let i = 0; i < lymphCount; i++) {
              const ang = (i / lymphCount) * Math.PI * 2;
              const ringR = 0.21 + (i % 2) * 0.06;
              const lymph = new THREE.Mesh(
                new THREE.SphereGeometry(0.052 + severity * 0.028, 14, 14),
                lymphMat
              );
              lymph.position.set(
                -0.1 + (i % 3) * 0.12,
                0.08 + Math.sin(ang) * ringR,
                Math.cos(ang) * ringR
              );
              threeScene.add(lymph);
              if (i === 0) {
                registerPickable(lymph, "infiltrate", "Periductal Lymphocytic Infiltrate", "pathology", [-0.08, -0.34, 0.25]);
              } else {
                lymph.userData = { id: "infiltrate", label: "Periductal Lymphocytic Infiltrate" };
                pickables.push(lymph);
              }
            }
          }

          // Animated saliva droplets moving from acini along the excretory duct
          const salivaMat = new THREE.MeshStandardMaterial({
            color: 0x5eead4,
            emissive: 0x14b8a6,
            emissiveIntensity: 0.55,
          });
          const flowSpeed = Math.max(0.06, 0.32 * intensity * (1 - severity * 0.72));
          for (let i = 0; i < 12; i++) {
            const drop = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), salivaMat);
            threeScene.add(drop);
            animatedGroupRef.current.particles.push({
              mesh: drop,
              phase: i / 12,
              speed: flowSpeed,
              customMode: "gland-duct",
            });
          }
        } else if (scene.blueprint === "tumor-architecture") {
          // Neoplastic Architecture: Benign Encapsulated Adenoma vs. Infiltrative Carcinoma
          const malignant = severity >= 0.45;

          // Basement Membrane / Stromal Border Plane
          const bmPlane = new THREE.Mesh(
            new THREE.BoxGeometry(2.05, 0.04, 1.35),
            new THREE.MeshStandardMaterial({
              color: malignant ? 0xf59e0b : 0x38bdf8,
              transparent: true,
              opacity: 0.45,
              roughness: 0.5,
            })
          );
          bmPlane.position.set(0, -0.22, 0);
          threeScene.add(bmPlane);
          registerPickable(bmPlane, "basement", "Basement Membrane Boundary", malignant ? "pathology" : "normal", [0.75, -0.24, 0.35]);

          // Sub-epithelial vascular stroma
          const neoVesselMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xb91c1c,
            emissiveIntensity: malignant ? 0.38 : 0.12,
            roughness: 0.4,
          });
          const vesselPath = createBandTube(
            [[-0.95, -0.52, 0.15], [-0.3, -0.42, 0.05], [0.25, malignant ? -0.1 : -0.45, -0.05], [0.95, -0.52, -0.15]],
            0.036,
            neoVesselMat
          );
          threeScene.add(vesselPath);
          registerPickable(vesselPath, "vessels", malignant ? "Tumor Angiogenesis" : "Stromal Microvessels", malignant ? "pathology" : "normal", [-0.65, -0.52, 0.25]);

          // Fibrous Capsule Dome (intact emerald shell when benign, fragmented amber/red when invasive)
          const capsule = new THREE.Mesh(
            new THREE.SphereGeometry(0.56, 26, 26),
            new THREE.MeshStandardMaterial({
              color: malignant ? 0xf97316 : 0x10b981,
              transparent: true,
              opacity: malignant ? 0.18 : 0.34,
              wireframe: malignant,
              depthWrite: false,
            })
          );
          capsule.position.set(0, 0.24, 0);
          threeScene.add(capsule);
          registerPickable(capsule, "capsule", malignant ? "Breached Fibrous Capsule" : "Intact Fibrous Capsule", malignant ? "pathology" : "normal", [-0.55, 0.56, 0.22]);

          // Primary Neoplasm Core
          const mass = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.42, malignant ? 1 : 2),
            new THREE.MeshStandardMaterial({
              color: malignant ? 0xe11d48 : 0x3b82f6,
              emissive: malignant ? 0x881337 : 0x1d4ed8,
              emissiveIntensity: 0.26,
              roughness: 0.38,
            })
          );
          mass.position.set(0, 0.22, 0);
          if (malignant) mass.scale.set(1.12, 0.96, 1.05);
          threeScene.add(mass);
          registerPickable(mass, "mass", malignant ? "Infiltrative Carcinoma Mass" : "Circumscribed Benign Adenoma", malignant ? "pathology" : "normal", [0.42, 0.58, 0.18]);

          // Invasive nests breaching basement membrane when severity >= 0.45
          if (malignant) {
            const nestMat = new THREE.MeshStandardMaterial({
              color: 0xf43f5e,
              emissive: 0x9f1239,
              emissiveIntensity: 0.42,
              roughness: 0.35,
            });
            const nestOffsets: [number, number, number][] = [
              [-0.25, -0.28, 0.14],
              [0.18, -0.35, -0.12],
              [0.02, -0.45, 0.08],
            ];
            nestOffsets.forEach((p) => {
              const nest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 * (0.6 + severity * 0.6), 1), nestMat);
              nest.position.set(...p);
              nest.userData = { id: "mass", label: "Infiltrative Tumor Nest" };
              pickables.push(nest);
              threeScene.add(nest);
            });
          }

          // Flowing nutrient/proliferative particles inside neo-vessels
          const nutMat = new THREE.MeshStandardMaterial({ color: 0xfca5a5, emissive: 0xef4444, emissiveIntensity: 0.4 });
          for (let i = 0; i < 10; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), nutMat);
            threeScene.add(p);
            animatedGroupRef.current.particles.push({
              mesh: p,
              phase: i / 10,
              speed: 0.24 * intensity,
              customMode: "tumor-vessel",
            });
          }
        } else if (scene.blueprint === "immune-cascade") {
          // Vascular Endothelium + Leukocyte Margination / Diapedesis + Chemokine Rings
          const lumen = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.32, 2.1, 28, 1, true),
            new THREE.MeshStandardMaterial({
              color: 0xf87171,
              transparent: true,
              opacity: 0.28,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          lumen.rotation.z = Math.PI / 2;
          lumen.position.y = 0.26;
          threeScene.add(lumen);
          registerPickable(lumen, "lumen", "Endothelial Capillary Wall", "normal", [-0.62, 0.56, 0.15]);

          // Interstitial target zone + cytokine ring
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.45 + severity * 0.25, 0.03, 12, 36),
            new THREE.MeshStandardMaterial({
              color: 0xf59e0b,
              emissive: 0xd97706,
              emissiveIntensity: 0.45,
              transparent: true,
              opacity: 0.72,
            })
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0.15, -0.45, 0);
          threeScene.add(ring);
          animatedGroupRef.current.waveRing = ring;
          registerPickable(ring, "cytokines", "Cytokine & Chemotactic Focus", "pathology", [0.45, -0.42, 0.24]);

          // Rolling & extravasating leukocytes
          const wbcMat = new THREE.MeshStandardMaterial({
            color: 0xe0f2fe,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.35,
            roughness: 0.3,
          });
          for (let i = 0; i < 14; i++) {
            const wbc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.068, 1), wbcMat);
            threeScene.add(wbc);
            if (i === 0) {
              registerPickable(wbc, "leukocytes", "Leukocyte Margination & Diapedesis", "pathology", [0, 0.02, 0.22]);
            }
            animatedGroupRef.current.particles.push({
              mesh: wbc,
              phase: i / 14,
              speed: 0.18 * intensity,
              customMode: i % 3 === 0 && severity > 0.25 ? "diapedesis" : "margination",
            });
          }
        } else if (scene.blueprint === "vessel-flow") {
          const wall = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.42, 2.2, 32, 1, true),
            new THREE.MeshStandardMaterial({
              color: 0xf87171,
              transparent: true,
              opacity: 0.32,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          wall.rotation.z = Math.PI / 2;
          threeScene.add(wall);

          // Atherosclerotic plaque bulge scaled by severity
          if (severity > 0.05) {
            const plaque = new THREE.Mesh(
              new THREE.SphereGeometry(0.28 * (0.4 + severity), 24, 24),
              new THREE.MeshStandardMaterial({
                color: 0xfbbf24,
                emissive: 0xd97706,
                emissiveIntensity: 0.25,
                roughness: 0.45,
              })
            );
            plaque.scale.set(1.6, 0.75, 0.95);
            plaque.position.set(0, -0.26, 0);
            threeScene.add(plaque);
            registerPickable(plaque, "plaque", `Luminal Stenosis (${Math.round(severity * 85)}%)`, "pathology", [0, -0.3, 0.25]);
          }

          const rbcMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
          for (let i = 0; i < 20; i++) {
            const rbc = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), rbcMat);
            rbc.scale.set(1.2, 0.65, 1.2);
            rbc.position.set(-1 + (i / 20) * 2, Math.sin(i * 1.9) * 0.14, Math.cos(i * 2.3) * 0.14);
            threeScene.add(rbc);
            animatedGroupRef.current.particles.push({
              mesh: rbc,
              phase: i / 20,
              speed: 0.22 * intensity,
            });
          }
          registerPickable(wall, "lumen", "Vascular Lumen & Flow", "normal", [-0.55, 0.45, 0.1]);
        } else if (scene.blueprint === "receptor-membrane") {
          const lipidMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.5 });
          for (let ix = -5; ix <= 5; ix++) {
            for (let iz = -3; iz <= 3; iz++) {
              if (Math.abs(ix) <= 1 && Math.abs(iz) <= 1) continue;
              const topHead = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), lipidMat);
              topHead.position.set(ix * 0.18, 0.18, iz * 0.18);
              const botHead = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), lipidMat);
              botHead.position.set(ix * 0.18, -0.18, iz * 0.18);
              threeScene.add(topHead, botHead);
            }
          }
          const poreRadius = 0.16 + intensity * 0.08;
          const channel = new THREE.Mesh(
            new THREE.CylinderGeometry(poreRadius + 0.12, poreRadius + 0.12, 0.68, 24, 1, true),
            new THREE.MeshStandardMaterial({
              color: 0x3b82f6,
              emissive: 0x1d4ed8,
              emissiveIntensity: 0.25,
              side: THREE.DoubleSide,
              roughness: 0.35,
            })
          );
          threeScene.add(channel);
          registerPickable(channel, "channel", "Transmembrane Channel / Receptor", "normal", [0, 0.42, 0.25]);

          const ionMat = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 0.4 });
          for (let i = 0; i < 10; i++) {
            const ion = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), ionMat);
            threeScene.add(ion);
            animatedGroupRef.current.particles.push({ mesh: ion, phase: i / 10, speed: 0.35 * intensity });
          }
        } else if (scene.blueprint === "action-potential-axon") {
          const axon = createSegmentCylinder(
            [-1.15, 0, 0],
            [1.15, 0, 0],
            0.14,
            new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 })
          );
          threeScene.add(axon);
          const sheathMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.72, roughness: 0.35 });
          for (const sx of [-0.75, 0, 0.75]) {
            const sheath = createSegmentCylinder([sx - 0.26, 0, 0], [sx + 0.26, 0, 0], 0.23, sheathMat);
            threeScene.add(sheath);
          }
          const waveRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.28, 0.045, 16, 32),
            new THREE.MeshStandardMaterial({ color: 0xff4c00, emissive: 0xff4c00, emissiveIntensity: 0.65 })
          );
          waveRing.rotation.y = Math.PI / 2;
          threeScene.add(waveRing);
          animatedGroupRef.current.waveRing = waveRing;
          registerPickable(axon, "axon", "Axon & Nodes of Ranvier", "normal", [-0.4, 0.35, 0.15]);
          registerPickable(waveRing, "wave", "Depolarization Wavefront", "pathology", [0.4, 0.35, 0.15]);
        } else if (scene.blueprint === "3d-surface-field") {
          const expr = scene.fxy || "(x^2 + y^2) * 0.35 - 0.3";
          const segs = 28;
          const geom = new THREE.PlaneGeometry(1.8, 1.8, segs, segs);
          geom.rotateX(-Math.PI / 2);
          const posAttr = geom.attributes.position;
          const colors: number[] = [];
          for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vz = posAttr.getZ(i);
            const vy = Math.max(-0.7, Math.min(0.9, evalMathExprSafe(expr, { x: vx, y: vz }, 0)));
            posAttr.setY(i, vy);
            const t = Math.max(0, Math.min(1, (vy + 0.4) / 1.1));
            colors.push(0.15 + t * 0.8, 0.35 + (1 - t) * 0.45, 0.9 - t * 0.6);
          }
          geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          geom.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geom,
            new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45 })
          );
          threeScene.add(mesh);
          registerPickable(mesh, "surface", "3D Mathematical Field", "normal", [0, 0.5, 0]);
        } else {
          // compartment-exchange, molecular-lattice, vector-force-rig
          const leftBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.75, 0.75),
            new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.38 })
          );
          leftBox.position.set(-0.52, 0, 0);
          const rightBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.75, 0.75),
            new THREE.MeshStandardMaterial({
              color: severity > 0.5 ? 0xef4444 : 0x10b981,
              transparent: true,
              opacity: 0.38,
            })
          );
          rightBox.position.set(0.52, 0, 0);
          const barrier = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.9, 0.9),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
          );
          threeScene.add(leftBox, rightBox, barrier);

          const pMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.35 });
          for (let i = 0; i < 14; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), pMat);
            threeScene.add(p);
            animatedGroupRef.current.particles.push({ mesh: p, phase: i / 14, speed: 0.25 * intensity });
          }
          registerPickable(leftBox, "comp_a", "Upstream Compartment", "normal", [-0.55, 0.5, 0.2]);
          registerPickable(rightBox, "comp_b", "Target / Downstream", "pathology", [0.55, 0.5, 0.2]);
        }

        // Add up to 3 concise non-colliding clinical node pins on outer stage perimeter
        if (scene.labels) {
          for (const lm of scene.labels) {
            if (!labels.some((l) => l.id === lm.id)) {
              labels.push({
                id: lm.id,
                label: language === "ar" && lm.labelAr ? lm.labelAr : lm.label,
                tone: lm.tone || "neutral",
                xPct: 50,
                yPct: 50,
                visible: true,
                worldPos: new THREE.Vector3(...(lm.pos || [0, 0.45, 0.25])),
              });
            }
          }
        }
      }

      // =====================================================================
      // BUILD TIER 4: ARCHITECTURAL 3D CLINICAL CONCEPT OBSERVATORY
      // =====================================================================
      if (scene.tier === "smart-diagram-3d") {
        // Illuminated radial reference rings on stage floor
        for (const r of [0.55, 1.05]) {
          const stageRing = new THREE.Mesh(
            new THREE.RingGeometry(r - 0.012, r, 48),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
          );
          stageRing.rotation.x = -Math.PI / 2;
          stageRing.position.y = -0.58;
          threeScene.add(stageRing);
        }

        const nodes = section.nodes;
        const count = Math.max(1, nodes.length);
        const nodeCoords: THREE.Vector3[] = [];

        nodes.forEach((n, idx) => {
          // Arrange nodes on a wide 3D horseshoe so spheres/plinths never visually overlap
          const angle =
            count === 1
              ? 0
              : -Math.PI * 0.65 + (idx / Math.max(1, count - 1)) * (Math.PI * 1.3);
          const radius = count <= 2 ? 0.68 : 0.92;
          const x = count === 1 ? 0 : Math.sin(angle) * radius;
          const z = count === 1 ? 0 : Math.cos(angle) * radius * 0.55 - 0.1;
          const baseY = -0.58;
          const pillarH = 0.42 + (idx % 2 === 0 ? 0.26 : 0.08);
          const y = baseY + pillarH;
          nodeCoords.push(new THREE.Vector3(x, y, z));

          const isActive = activeNodeId === n.id || selectedStructId === n.id;
          const col =
            isActive
              ? 0xff4c00
              : n.kind === "treatment"
              ? 0x10b981
              : n.tone === "pathology"
              ? 0xf43f5e
              : n.tone === "normal"
              ? 0x38bdf8
              : 0x94a3b8;

          // Architectural hexagonal glass pedestal
          const pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.2, pillarH, 6),
            new THREE.MeshStandardMaterial({
              color: 0x161618,
              emissive: col,
              emissiveIntensity: isActive ? 0.35 : 0.12,
              roughness: 0.35,
              metalness: 0.35,
              transparent: true,
              opacity: 0.9,
            })
          );
          pedestal.position.set(x, baseY + pillarH * 0.5, z);
          threeScene.add(pedestal);

          // Luminous top concept crystal
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(isActive ? 0.145 : 0.115, 0),
            new THREE.MeshStandardMaterial({
              color: col,
              emissive: col,
              emissiveIntensity: isActive ? 0.65 : 0.28,
              roughness: 0.22,
              metalness: 0.25,
            })
          );
          crystal.position.set(x, y + 0.14, z);
          threeScene.add(crystal);

          // Orbital halo ring
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.22, 0.015, 10, 32),
            new THREE.MeshStandardMaterial({
              color: col,
              emissive: col,
              emissiveIntensity: isActive ? 0.8 : 0.25,
            })
          );
          halo.rotation.x = Math.PI / 2;
          halo.position.set(x, y + 0.02, z);
          threeScene.add(halo);

          registerPickable(crystal, n.id, n.text, n.tone, [x, y + 0.32, z]);
        });

        for (let i = 0; i < nodeCoords.length - 1; i++) {
          const a = nodeCoords[i];
          const b = nodeCoords[i + 1];
          const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
          mid.y += 0.28;
          const tube = createBandTube(
            [
              [a.x, a.y + 0.06, a.z],
              [mid.x, mid.y, mid.z],
              [b.x, b.y + 0.06, b.z],
            ],
            0.016,
            new THREE.MeshStandardMaterial({
              color: 0x38bdf8,
              emissive: 0x0284c7,
              emissiveIntensity: 0.3,
              transparent: true,
              opacity: 0.72,
            })
          );
          threeScene.add(tube);

          const pulse = new THREE.Mesh(
            new THREE.SphereGeometry(0.036, 10, 10),
            new THREE.MeshStandardMaterial({ color: 0xff4c00, emissive: 0xff4c00, emissiveIntensity: 0.8 })
          );
          pulse.userData = { a: a.clone().setY(a.y + 0.06), b: b.clone().setY(b.y + 0.06), mid };
          threeScene.add(pulse);
          animatedGroupRef.current.particles.push({ mesh: pulse, phase: i * 0.28, speed: 0.42 });
        }
      }

      // =====================================================================
      // BUILD REAL 3D GLB ANATOMY PACK (Z-Anatomy / BodyParts3D via DRACO GLTF)
      // =====================================================================
      let dracoLoader: DRACOLoader | null = null;
      if (scene.tier === "glb-anatomy") {
        Promise.resolve().then(() => {
          if (!cancelled) {
            setAssetLoading(true);
            setAssetError(null);
          }
        });
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(
          "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"
        );
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const highlightTargets = (scene.highlightMeshes || []).map((m) =>
          m.toLowerCase().replace(/[^a-z0-9]/g, "")
        );

        loader.load(
          scene.glbUrl,
          (gltf) => {
            if (cancelled) return;
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 0.001);
            const scale = 1.65 / maxDim;
            model.position.copy(center).multiplyScalar(-scale);
            model.scale.setScalar(scale);

            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                const cleanName = (mesh.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                const isHighlighted =
                  Boolean(cleanName) &&
                  highlightTargets.some(
                    (t) => cleanName.includes(t) || t.includes(cleanName)
                  );
                const clonedMat = Array.isArray(mesh.material)
                  ? mesh.material.map((m) => m.clone())
                  : mesh.material.clone();
                mesh.material = clonedMat;
                const mats = Array.isArray(clonedMat) ? clonedMat : [clonedMat];
                const opacity = isHighlighted
                  ? Math.max(0.85, xrayOpacityRef.current)
                  : xrayOpacityRef.current;
                for (const m of mats) {
                  if (m instanceof THREE.MeshStandardMaterial && isHighlighted) {
                    m.emissive.setHex(0xff4c00);
                    m.emissiveIntensity = 0.42;
                  }
                  m.transparent = opacity < 0.98;
                  m.opacity = opacity;
                  m.depthWrite = opacity >= 0.98;
                }
                const label = (mesh.name || scene.title).replace(/[_-]+/g, " ").trim();
                mesh.userData = {
                  id: mesh.name || `mesh-${pickables.length}`,
                  label,
                  highlighted: isHighlighted,
                };
                pickables.push(mesh);
              }
            });

            glbRootRef.current = model;
            threeScene.add(model);
            if (scene.labels) {
              for (const lm of scene.labels) {
                if (!labels.some((l) => l.id === lm.id)) {
                  labels.push({
                    id: lm.id,
                    label: language === "ar" && lm.labelAr ? lm.labelAr : lm.label,
                    tone: lm.tone || "neutral",
                    xPct: 50,
                    yPct: 50,
                    visible: true,
                    worldPos: new THREE.Vector3(...(lm.pos || [0, 0.45, 0.25])),
                  });
                }
              }
              projectedListRef.current = labels;
            }
            setAssetLoading(false);
          },
          undefined,
          () => {
            if (cancelled) return;
            setAssetLoading(false);
            setAssetError(
              `Could not load 3D anatomy pack (${scene.packId}). Verify asset URL or inspect step notes.`
            );
          }
        );
      }

      // =====================================================================
      // BUILD REAL 3D MOLECULE (PubChem 3D Conformer CPK Ball-and-Stick)
      // =====================================================================
      if (scene.tier === "molecule-3d") {
        Promise.resolve().then(() => {
          if (!cancelled) {
            setAssetLoading(true);
            setAssetError(null);
          }
        });
        const CPK_COLOR: Record<string, number> = {
          H: 0xf8fafc,
          C: 0x334155,
          N: 0x2563eb,
          O: 0xdc2626,
          S: 0xeab308,
          P: 0xf97316,
          F: 0x22c55e,
          Cl: 0x16a34a,
          Br: 0x991b1b,
          I: 0x7e22ce,
          Fe: 0xb45309,
          Ca: 0x10b981,
          Na: 0x8b5cf6,
          K: 0xa855f7,
        };
        const CPK_RADIUS: Record<string, number> = {
          H: 0.08,
          P: 0.16,
          S: 0.16,
          Cl: 0.15,
          Br: 0.17,
          I: 0.18,
        };

        fetch(`/api/whiteboard/molecule-3d?name=${encodeURIComponent(scene.compoundName)}`)
          .then(async (res) => {
            if (!res.ok) throw new Error("Molecule lookup failed");
            return (await res.json()) as {
              cid: number;
              atoms: Array<{ aid: number; element: string; x: number; y: number; z: number }>;
              bonds: Array<{ aid1: number; aid2: number; order: number }>;
            };
          })
          .then((mol) => {
            if (cancelled || !mol.atoms?.length) return;
            const molGroup = new THREE.Group();
            let maxSpan = 1;
            for (const a of mol.atoms) {
              maxSpan = Math.max(maxSpan, Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
            }
            const scale = 0.88 / maxSpan;
            const posByAid = new Map<number, [number, number, number]>();

            for (const atom of mol.atoms) {
              const p: [number, number, number] = [
                atom.x * scale,
                atom.y * scale + 0.06,
                atom.z * scale,
              ];
              posByAid.set(atom.aid, p);
              const color = CPK_COLOR[atom.element] ?? 0x94a3b8;
              const radius = CPK_RADIUS[atom.element] ?? 0.125;
              const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 18, 18),
                new THREE.MeshStandardMaterial({
                  color,
                  roughness: 0.28,
                  metalness: 0.18,
                })
              );
              sphere.position.set(...p);
              sphere.userData = {
                id: `atom-${atom.aid}`,
                label: `${atom.element} #${atom.aid}`,
              };
              molGroup.add(sphere);
              pickables.push(sphere);
            }

            const bondMat = new THREE.MeshStandardMaterial({
              color: 0xcbd5e1,
              roughness: 0.45,
              metalness: 0.25,
            });
            for (const bond of mol.bonds || []) {
              const a = posByAid.get(bond.aid1);
              const b = posByAid.get(bond.aid2);
              if (!a || !b) continue;
              const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
              const perp = new THREE.Vector3(-dir.z, 0, dir.x);
              if (perp.lengthSq() < 1e-5) perp.set(0, 1, 0);
              perp.normalize().multiplyScalar(0.032);
              const offsets =
                bond.order >= 3 ? [-1, 0, 1] : bond.order === 2 ? [-0.65, 0.65] : [0];
              const bondRad = bond.order >= 2 ? 0.024 : 0.038;
              for (const k of offsets) {
                const pa: [number, number, number] = [
                  a[0] + perp.x * k,
                  a[1] + perp.y * k,
                  a[2] + perp.z * k,
                ];
                const pb: [number, number, number] = [
                  b[0] + perp.x * k,
                  b[1] + perp.y * k,
                  b[2] + perp.z * k,
                ];
                molGroup.add(createSegmentCylinder(pa, pb, bondRad, bondMat));
              }
            }

            threeScene.add(molGroup);
            animatedGroupRef.current.spinTarget = molGroup;
            setAssetLoading(false);
          })
          .catch(() => {
            if (cancelled) return;
            setAssetLoading(false);
            setAssetError(
              `Could not load 3D molecular conformer for "${scene.compoundName}".`
            );
          });
      }

      projectedListRef.current = labels;

      // Pointer picking with 6px drag threshold
      let downX = 0;
      let downY = 0;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const onPointerDown = (e: PointerEvent) => {
        downX = e.clientX;
        downY = e.clientY;
      };
      const onPointerUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          const { id, label } = hits[0].object.userData as { id?: string; label?: string };
          if (id) {
            const cleanLabel = label || id;
            setSelectedStruct({ id, label: cleanLabel });
            onSelectStructure?.(id, cleanLabel);
          }
        }
      };

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointerup", onPointerUp);

      const resizeObs = new ResizeObserver(() => {
        if (!container) return;
        const w = Math.max(200, container.clientWidth);
        const h = Math.max(180, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObs.observe(container);

      let rafId = 0;
      const startTime = performance.now();

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        const tSec = (performance.now() - startTime) / 1000;

        // Animate physiological motion / flowing particles / gentle molecule rotation
        if (animatedGroupRef.current.spinTarget) {
          animatedGroupRef.current.spinTarget.rotation.y = tSec * 0.35;
        }
        if (animatedGroupRef.current.pulseTarget) {
          const beat = 1 + Math.sin(tSec * 3.8) * 0.045;
          animatedGroupRef.current.pulseTarget.scale.set(beat, beat, beat);
        }
        if (animatedGroupRef.current.waveRing) {
          if (scene.tier === "procedural-3d" && scene.blueprint === "immune-cascade") {
            const s = 1 + Math.sin(tSec * 2.8) * 0.14;
            animatedGroupRef.current.waveRing.scale.set(s, s, 1);
          } else {
            const u = ((tSec * 0.55) % 1) * 2.1 - 1.05;
            animatedGroupRef.current.waveRing.position.x = u;
          }
        }
        for (const p of animatedGroupRef.current.particles) {
          const u = (p.phase + tSec * p.speed) % 1;
          if (p.mesh.userData?.a && p.mesh.userData?.b && p.mesh.userData?.mid) {
            const { a, b, mid } = p.mesh.userData as {
              a: THREE.Vector3;
              b: THREE.Vector3;
              mid: THREE.Vector3;
            };
            const inv = 1 - u;
            p.mesh.position.set(
              inv * inv * a.x + 2 * inv * u * mid.x + u * u * b.x,
              inv * inv * a.y + 2 * inv * u * mid.y + u * u * b.y,
              inv * inv * a.z + 2 * inv * u * mid.z + u * u * b.z
            );
          } else if (p.customMode === "gland-duct") {
            const branch = p.phase < 0.5 ? 1 : -1;
            if (u < 0.45) {
              const k = u / 0.45;
              p.mesh.position.set(-0.55 + k * 0.6, branch * (0.36 * (1 - k)) + 0.08, branch * (0.12 * (1 - k)));
            } else {
              const k = (u - 0.45) / 0.55;
              p.mesh.position.set(0.05 + k * 0.9, 0.08 + Math.sin(p.phase * 15) * 0.03, Math.cos(p.phase * 15) * 0.03);
            }
          } else if (p.customMode === "tumor-vessel") {
            p.mesh.position.set(
              -0.9 + u * 1.8,
              -0.46 + Math.sin(u * Math.PI) * 0.25,
              Math.cos(p.phase * 12) * 0.06
            );
          } else if (p.customMode === "diapedesis") {
            const drop = Math.max(0, (u - 0.35) / 0.65);
            p.mesh.position.set(-0.4 + u * 0.9, 0.22 - drop * 0.68, Math.sin(p.phase * 10) * 0.14);
          } else if (p.customMode === "margination") {
            p.mesh.position.set(-1.0 + u * 2.0, 0.18 + Math.sin(p.phase * 9) * 0.09, Math.cos(p.phase * 9) * 0.12);
          } else if (scene.tier === "procedural-3d" && scene.blueprint === "receptor-membrane") {
            p.mesh.position.set(
              Math.sin(p.phase * 12) * 0.08,
              0.55 - u * 1.1,
              Math.cos(p.phase * 12) * 0.08
            );
          } else {
            p.mesh.position.x = -1.0 + u * 2.0;
          }
        }

        controls.update();
        renderer.render(threeScene, camera);

        // Project 3D landmarks to 2D DOM label overlays + anti-overlap screen-space repulsion
        const projected: Array<{ id: string; x: number; y: number; visible: boolean }> = [];
        for (const lbl of projectedListRef.current) {
          const proj = lbl.worldPos.clone().project(camera);
          const visible = proj.z < 1;
          const xPct = Math.max(15, Math.min(85, (proj.x * 0.5 + 0.5) * 100));
          const yPct = Math.max(12, Math.min(82, (-proj.y * 0.5 + 0.5) * 100));
          projected.push({ id: lbl.id, x: xPct, y: yPct, visible });
        }

        // Fast iterative 2D repulsion so pills never collide or stack
        for (let pass = 0; pass < 6; pass++) {
          for (let i = 0; i < projected.length; i++) {
            if (!projected[i].visible) continue;
            for (let j = i + 1; j < projected.length; j++) {
              if (!projected[j].visible) continue;
              const dx = projected[j].x - projected[i].x;
              const dy = projected[j].y - projected[i].y;
              if (Math.abs(dx) < 26 && Math.abs(dy) < 10.5) {
                const pushY = (dy >= 0 ? 1 : -1) * ((10.5 - Math.abs(dy)) * 0.55 + 0.4);
                const pushX = (dx >= 0 ? 1 : -1) * ((26 - Math.abs(dx)) * 0.18);
                projected[i].y = Math.max(11, Math.min(82, projected[i].y - pushY));
                projected[j].y = Math.max(11, Math.min(82, projected[j].y + pushY));
                projected[i].x = Math.max(15, Math.min(85, projected[i].x - pushX));
                projected[j].x = Math.max(15, Math.min(85, projected[j].x + pushX));
              }
            }
          }
        }

        for (const p of projected) {
          const el = labelRefs.current.get(p.id);
          if (!el) continue;
          el.style.left = `${p.x.toFixed(1)}%`;
          el.style.top = `${p.y.toFixed(1)}%`;
          el.style.opacity = p.visible ? "1" : "0";
          el.style.pointerEvents = p.visible ? "auto" : "none";
        }
      };
      rafId = requestAnimationFrame(animate);

      return () => {
        cancelled = true;
        glbRootRef.current = null;
        dracoLoader?.dispose();
        cancelAnimationFrame(rafId);
        resizeObs.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        controls.dispose();
        renderer.dispose();
        rendererRef.current = null;
      };
    }, [scene, section.nodes, paramValues, activeNodeId, selectedStructId, language, camPreset, onSelectStructure]);

    // Handle live camera preset changes
    const handlePresetClick = (preset: LabCameraPreset) => {
      setCamPreset(preset);
      if (cameraRef.current && controlsRef.current) {
        setCameraToPreset(cameraRef.current, controlsRef.current, preset);
      }
    };

    // Build synchronized DOM label list matching 3D landmarks + section concepts
    const labelItems = useMemo(() => {
      const list: Array<{ id: string; label: string; tone: LessonTone }> = [];
      if (scene.tier === "anatomy-rig") {
        const src =
          scene.labels && scene.labels.length > 0
            ? scene.labels
            : solveAnatomyRigPose(scene.model, paramValues, scene.highlight).landmarks;
        for (const l of src) {
          list.push({ id: l.id, label: l.label, tone: l.tone || "neutral" });
        }
      } else if (scene.tier === "procedural-3d") {
        if (scene.blueprint === "glandular-acinus") {
          const sev = paramValues.severity ?? 0.55;
          list.push(
            { id: "acini", label: "Secretory Acinar Lobules", tone: sev > 0.5 ? "pathology" : "normal" },
            { id: "duct", label: "Collecting Salivary Duct", tone: "normal" }
          );
          if (sev > 0.12) {
            list.push({ id: "infiltrate", label: "Periductal Lymphocytic Infiltrate", tone: "pathology" });
          }
        } else if (scene.blueprint === "tumor-architecture") {
          const sev = paramValues.severity ?? 0.55;
          const malignant = sev >= 0.45;
          list.push(
            { id: "mass", label: malignant ? "Infiltrative Carcinoma Mass" : "Circumscribed Benign Adenoma", tone: malignant ? "pathology" : "normal" },
            { id: "capsule", label: malignant ? "Breached Fibrous Capsule" : "Intact Fibrous Capsule", tone: malignant ? "pathology" : "normal" },
            { id: "basement", label: "Basement Membrane Boundary", tone: malignant ? "pathology" : "normal" }
          );
        } else if (scene.blueprint === "immune-cascade") {
          list.push(
            { id: "lumen", label: "Endothelial Capillary Wall", tone: "normal" },
            { id: "leukocytes", label: "Leukocyte Margination & Diapedesis", tone: "pathology" },
            { id: "cytokines", label: "Cytokine & Chemotactic Focus", tone: "pathology" }
          );
        }
        if (scene.labels) {
          for (const l of scene.labels) {
            if (!list.some((x) => x.id === l.id)) {
              list.push({
                id: l.id,
                label: language === "ar" && l.labelAr ? l.labelAr : l.label,
                tone: l.tone || "neutral",
              });
            }
          }
        }
      } else if (scene.tier === "glb-anatomy") {
        if (scene.labels) {
          for (const l of scene.labels) {
            list.push({
              id: l.id,
              label: language === "ar" && l.labelAr ? l.labelAr : l.label,
              tone: l.tone || "neutral",
            });
          }
        }
      } else if (scene.tier === "smart-diagram-3d") {
        section.nodes.forEach((n, idx) => {
          list.push({
            id: n.id,
            label: `${idx + 1} · ${n.text}`,
            tone: n.tone,
          });
        });
      }
      return list;
    }, [scene, section.nodes, paramValues, language]);

    const inspectorInfo = useMemo(() => {
      if (!selectedStruct) return null;
      return buildStructureInsight(
        selectedStruct.id,
        selectedStruct.label,
        scene,
        section,
        paramValues
      );
    }, [selectedStruct, scene, section, paramValues]);

    if (scene.tier === "none") {
      return null;
    }

    if (scene.tier === "interactive-sim") {
      return (
        <div
          style={{ isolation: "isolate" }}
          className={cn("h-full w-full overflow-hidden rounded-[14px] border-2 border-[#18181B] bg-[#FCFBF8]", className)}
        >
          <InteractiveSimChart
            scene={scene}
            paramValues={paramValues}
            onParamChange={handleParamChange}
            onResetParams={() => setParamValues(initialParams)}
          />
        </div>
      );
    }

    return (
      <div
        style={{ isolation: "isolate" }}
        className={cn(
          "relative flex flex-col h-full w-full overflow-hidden rounded-[14px] border-2 border-[#18181B] bg-[#09090B] text-white shadow-[0_6px_24px_rgba(15,14,16,0.18)]",
          className
        )}
      >
        {/* Top 3D Lab Toolbar (no backdrop-blur to prevent corner bleed outside 14px radius) */}
        <div className="z-20 flex items-center justify-between gap-2 rounded-t-[12px] border-b border-white/12 bg-[#09090B] px-3 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Box className="size-3.5 text-[#ff4c00] shrink-0" />
            <span className="truncate font-sans text-[11px] font-black text-white">
              {scene.title}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(["iso", "front", "side", "top"] as LabCameraPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetClick(p)}
                className={cn(
                  "cursor-pointer rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase transition-colors",
                  camPreset === p
                    ? "bg-[#ff4c00] text-[#0f0e10]"
                    : "bg-white/10 text-zinc-200 hover:bg-white/20"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Dotted Solid-Black 3D Studio Viewport + Projected Labels + In-Panel Clinical Inspector */}
        <div
          className="relative flex-1 min-h-[180px] w-full overflow-hidden bg-[#09090B]"
          style={{
            backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.16) 1.1px, transparent 1.1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {webglFailed ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center text-xs text-zinc-300">
              <Layers className="size-7 text-[#ff4c00]" />
              <div className="font-bold text-white">{scene.title}</div>
              <p className="text-[11px] text-zinc-400">
                Interactive 3D fallback active — tap a structure below to inspect.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {labelItems.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setSelectedStruct({ id: l.id, label: l.label });
                      onSelectStructure?.(l.id, l.label);
                    }}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
                      getToneBadgeClass(l.tone, selectedStructId === l.id)
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div ref={mountRef} className="size-full cursor-grab active:cursor-grabbing" />

              {assetLoading && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#09090B]/60">
                  <div className="flex items-center gap-2 rounded-full border border-white/20 bg-[#0D0D10] px-3 py-1 text-[11px] font-bold text-white">
                    <Loader2 className="size-3.5 animate-spin text-[#ff4c00]" />
                    <span>Loading 3D structure...</span>
                  </div>
                </div>
              )}

              {assetError && !assetLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#09090B]/85 p-4 text-center">
                  <Layers className="size-6 text-[#ff4c00]" />
                  <p className="max-w-xs text-[11px] font-medium text-zinc-300">
                    {assetError}
                  </p>
                </div>
              )}

              {scene.tier === "glb-anatomy" && (
                <div className="absolute top-2 right-2.5 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-[#09090B]/90 px-2.5 py-1 text-[10px] font-mono text-zinc-200">
                  <span>X-Ray</span>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={xrayOpacity}
                    onChange={(e) => setXrayOpacity(Number(e.target.value))}
                    aria-label="X-Ray opacity"
                    className="h-1 w-16 cursor-pointer accent-[#ff4c00]"
                  />
                </div>
              )}

              {scene.tier === "glb-anatomy" && scene.attribution && (
                <div className="pointer-events-none absolute bottom-2 right-2.5 rounded-full border border-white/12 bg-[#09090B]/85 px-2 py-0.5 font-mono text-[8.5px] text-zinc-400">
                  {scene.attribution}
                </div>
              )}

              {/* 3D-to-2D Projected Bilingual DOM Labels (anti-collision positioned) */}
              {labelItems.map((lbl) => (
                <button
                  key={lbl.id}
                  ref={(el) => {
                    if (el) labelRefs.current.set(lbl.id, el);
                    else labelRefs.current.delete(lbl.id);
                  }}
                  type="button"
                  dir="auto"
                  onClick={() => {
                    setSelectedStruct({ id: lbl.id, label: lbl.label });
                    onSelectStructure?.(lbl.id, lbl.label);
                  }}
                  style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
                  className={cn(
                    "lab-label absolute z-10 max-w-[210px] truncate cursor-pointer rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold shadow-sm transition-transform",
                    getToneBadgeClass(lbl.tone, selectedStructId === lbl.id)
                  )}
                  title={lbl.label}
                >
                  {lbl.label}
                </button>
              ))}

              {/* In-Viewport High-Contrast Clinical Inspector Card */}
              {inspectorInfo && (
                <div className="absolute inset-x-2.5 bottom-8 z-30 rounded-xl border border-white/20 bg-[#0D0D0F]/96 p-2.5 text-white shadow-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-black uppercase",
                            inspectorInfo.tone === "pathology"
                              ? "bg-red-500/25 text-red-200 border border-red-400/40"
                              : inspectorInfo.tone === "normal"
                              ? "bg-sky-500/25 text-sky-200 border border-sky-400/40"
                              : "bg-white/15 text-zinc-200 border border-white/20"
                          )}
                        >
                          <Sparkles className="size-2.5" />
                          {inspectorInfo.badge}
                        </span>
                        {inspectorInfo.page && (
                          <button
                            type="button"
                            onClick={() => onNavigateToPage?.(inspectorInfo.page!)}
                            className="cursor-pointer inline-flex items-center gap-1 rounded-full border border-[#ff4c00]/60 bg-[#ff4c00]/20 px-1.5 py-0.5 font-mono text-[8.5px] font-black text-orange-200 hover:bg-[#ff4c00] hover:text-white transition-colors"
                          >
                            <BookOpen className="size-2.5" />
                            <span>p.{inspectorInfo.page}</span>
                          </button>
                        )}
                      </div>
                      <h4 dir="auto" className="text-[12px] font-black leading-snug text-white">
                        {inspectorInfo.title}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStruct(null)}
                      className="cursor-pointer rounded-full p-1 text-zinc-300 hover:bg-white/15 hover:text-white shrink-0"
                      aria-label="Close structure inspector"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <p dir="auto" className="mt-1 text-[10.5px] leading-relaxed text-zinc-200">
                    {inspectorInfo.detail}
                  </p>
                  {inspectorInfo.quote && (
                    <p
                      dir="auto"
                      className="mt-1 border-l-2 border-[#ff4c00] pl-2 text-[10px] italic text-zinc-300 line-clamp-2"
                    >
                      &ldquo;{inspectorInfo.quote}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* Drag hint + progress badge */}
              <div className="pointer-events-none absolute bottom-2 left-2.5 flex items-center gap-1.5 rounded-full border border-white/12 bg-[#09090B]/90 px-2 py-0.5 font-mono text-[9px] text-zinc-200">
                <RotateCw className="size-2.5 text-[#ff4c00]" />
                <span>Drag to orbit · Tap label or mesh to inspect</span>
              </div>

              {scene.tier === "anatomy-rig" && (
                <div className="pointer-events-none absolute bottom-2 right-2.5 flex items-center gap-1 rounded-full border border-sky-400/40 bg-[#09090B]/90 px-2 py-0.5 font-mono text-[9.5px] font-black text-sky-300">
                  <Eye className="size-2.5" />
                  <span>
                    {solveAnatomyRigPose(scene.model, paramValues).angleDeg}°
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Live Interactive Sliders for Tier 1 / Tier 2 */}
        {activeControls.length > 0 && (
          <div className="z-20 rounded-b-[12px] overflow-hidden text-[#18181B]">
            <SimSliderBar
              controls={activeControls}
              values={paramValues}
              onChange={handleParamChange}
              note={
                scene.tier === "procedural-3d"
                  ? scene.statusNote || `Live 3D simulation (${Math.round(timelineFraction * 100)}% step progress)`
                  : "Live pose & tension computed deterministically"
              }
            />
          </div>
        )}
      </div>
    );
  }
);
