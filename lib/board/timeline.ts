import {
  LessonBoardData,
  LessonCue,
  LessonLink,
  LessonVoiceTrack,
} from "@/types/lesson-board";
import { WhiteboardInkColor } from "@/types/whiteboard-video";
import { BoardLayout } from "./layout";

export interface ActiveBoardPenTarget {
  x: number;
  y: number;
  color: WhiteboardInkColor;
  active: boolean;
}

export interface BoardTimelineState {
  activeSectionIndex: number;
  activeCue: LessonCue | null;
  activeCueProgress: number;
  activeNodeId: string | null;
  sectionProgress: Record<string, number>;
  nodeProgress: Record<string, number>;
  nodeEmphasis: Record<string, number>;
  linkProgress: Record<string, number>;
  connectorProgress: Record<string, number>;
  penTarget: ActiveBoardPenTarget | null;
}

function toneToInk(tone?: string): WhiteboardInkColor {
  if (tone === "pathology") return "#DC2626";
  if (tone === "normal") return "#2563EB";
  return "#18181B";
}

export function linkKey(link: Pick<LessonLink, "from" | "to" | "kind">): string {
  return `${link.from}->${link.to}:${link.kind}`;
}

/**
 * Computes exact progressive draw states for every section, node, link, and pen tip
 * from the active audio section index and elapsed milliseconds.
 */
export function computeBoardTimeline(params: {
  lesson: LessonBoardData;
  layout: BoardLayout;
  voiceTrack?: LessonVoiceTrack;
  activeSectionIndex: number;
  sectionElapsedMs: number;
  isPlaying: boolean;
  isOverview: boolean;
}): BoardTimelineState {
  const {
    lesson,
    layout,
    voiceTrack,
    activeSectionIndex,
    sectionElapsedMs,
    isPlaying,
    isOverview,
  } = params;

  const sectionProgress: Record<string, number> = {};
  const nodeProgress: Record<string, number> = {};
  const nodeEmphasis: Record<string, number> = {};
  const linkProgress: Record<string, number> = {};
  const connectorProgress: Record<string, number> = {};

  if (isOverview) {
    for (const sec of lesson.sections) {
      sectionProgress[sec.id] = 1;
      for (const n of sec.nodes) {
        nodeProgress[n.id] = 1;
        nodeEmphasis[n.id] = 0;
      }
    }
    for (const l of lesson.links) {
      linkProgress[linkKey(l)] = 1;
    }
    for (const c of layout.routeConnectors) {
      connectorProgress[`${c.fromSectionId}->${c.toSectionId}`] = 1;
    }
    return {
      activeSectionIndex,
      activeCue: null,
      activeCueProgress: 1,
      activeNodeId: null,
      sectionProgress,
      nodeProgress,
      nodeEmphasis,
      linkProgress,
      connectorProgress,
      penTarget: null,
    };
  }

  const activeSec = lesson.sections[activeSectionIndex];
  const secTrack = voiceTrack?.sections?.[activeSectionIndex];
  const cues = secTrack?.cues || [];
  const totalSecMs =
    secTrack?.audioDurationMs ||
    (cues.length > 0 ? cues[cues.length - 1].endMs : 8000);
  const clampedElapsed = Math.max(0, Math.min(totalSecMs, sectionElapsedMs));

  let activeCue: LessonCue | null = null;
  let activeCueIdx = -1;
  let activeCueProgress = 0;

  if (cues.length > 0) {
    activeCueIdx = cues.findIndex(
      (c) => clampedElapsed >= c.startMs && clampedElapsed <= c.endMs
    );
    if (activeCueIdx === -1) {
      activeCueIdx = clampedElapsed <= cues[0].startMs ? 0 : cues.length - 1;
    }
    activeCue = cues[activeCueIdx];
    const span = Math.max(1, activeCue.endMs - activeCue.startMs);
    activeCueProgress = Math.max(
      0,
      Math.min(1, (clampedElapsed - activeCue.startMs) / span)
    );
  }

  const activeNodeId = activeCue?.nodeId || null;

  // Determine which nodes in the active section have already had a cue start
  const firstCueIndexByNode = new Map<string, number>();
  cues.forEach((c, idx) => {
    if (c.nodeId && !firstCueIndexByNode.has(c.nodeId)) {
      firstCueIndexByNode.set(c.nodeId, idx);
    }
  });

  // Poster preview: when paused cleanly at t=0 on a ready section, reveal the section fully so board isn't blank
  const isPosterAtStart = !isPlaying && clampedElapsed <= 40;

  lesson.sections.forEach((sec, sIdx) => {
    if (sIdx < activeSectionIndex) {
      sectionProgress[sec.id] = 1;
      sec.nodes.forEach((n) => {
        nodeProgress[n.id] = 1;
        nodeEmphasis[n.id] = 0;
      });
    } else if (sIdx > activeSectionIndex) {
      sectionProgress[sec.id] = 0;
      sec.nodes.forEach((n) => {
        nodeProgress[n.id] = 0;
        nodeEmphasis[n.id] = 0;
      });
    } else {
      // Active section
      if (isPosterAtStart) {
        sectionProgress[sec.id] = 1;
        sec.nodes.forEach((n) => {
          nodeProgress[n.id] = 1;
          nodeEmphasis[n.id] = 0;
        });
      } else {
        const secNorm = Math.max(0, Math.min(1, clampedElapsed / Math.max(1, totalSecMs)));
        sectionProgress[sec.id] = Math.min(1, Math.max(0.18, secNorm / 0.14));

        sec.nodes.forEach((n, nIdx) => {
          const cueIdx = firstCueIndexByNode.get(n.id);
          if (cueIdx === undefined) {
            // Node wasn't explicitly mapped to a cue; reveal smoothly alongside section order
            const sliceStart = (nIdx / Math.max(1, sec.nodes.length)) * 0.7;
            nodeProgress[n.id] = Math.max(0, Math.min(1, (secNorm - sliceStart) / 0.22));
            nodeEmphasis[n.id] = 0;
          } else if (activeCueIdx > cueIdx) {
            nodeProgress[n.id] = 1;
            nodeEmphasis[n.id] = n.id === activeNodeId ? Math.min(1, activeCueProgress * 1.4) : 0;
          } else if (activeCueIdx === cueIdx) {
            nodeProgress[n.id] = Math.min(1, activeCueProgress / 0.58);
            nodeEmphasis[n.id] =
              activeCueProgress > 0.45
                ? Math.min(1, (activeCueProgress - 0.45) / 0.4)
                : 0;
          } else {
            nodeProgress[n.id] = 0;
            nodeEmphasis[n.id] = 0;
          }
        });
      }
    }
  });

  // Links reveal once their source node is mostly visible and target node begins appearing
  for (const link of lesson.links) {
    const k = linkKey(link);
    const fromP = nodeProgress[link.from] ?? 0;
    const toP = nodeProgress[link.to] ?? 0;
    if (fromP >= 0.8 && toP > 0.02) {
      linkProgress[k] = Math.min(1, toP / 0.55);
    } else if (fromP >= 1 && toP >= 1) {
      linkProgress[k] = 1;
    } else {
      linkProgress[k] = 0;
    }
  }

  for (const conn of layout.routeConnectors) {
    const key = `${conn.fromSectionId}->${conn.toSectionId}`;
    const toIdx = lesson.sections.findIndex((s) => s.id === conn.toSectionId);
    if (toIdx !== -1 && toIdx <= activeSectionIndex) {
      connectorProgress[key] = 1;
    } else {
      connectorProgress[key] = 0;
    }
  }

  // Compute live PenHand coordinate on active node or active section header
  let penTarget: ActiveBoardPenTarget | null = null;
  if (isPlaying && activeSec) {
    const secFrame = layout.sections[activeSectionIndex];
    if (activeNodeId && layout.nodes[activeNodeId]) {
      const slot = layout.nodes[activeNodeId];
      const nodeObj = activeSec.nodes.find((n) => n.id === activeNodeId);
      const color = toneToInk(nodeObj?.tone);
      const p = activeCueProgress;

      if (p < 0.58) {
        // Drawing node frame perimeter/content left -> right
        const local = p / 0.58;
        penTarget = {
          x: slot.rect.x + 28 + (slot.rect.width - 56) * local,
          y: slot.rect.y + 42 + Math.sin(local * Math.PI * 6) * 10,
          color,
          active: true,
        };
      } else if (p < 0.92) {
        // Drawing teacher underline emphasis across bottom of node title
        const local = (p - 0.58) / 0.34;
        penTarget = {
          x: slot.rect.x + 76 + (slot.rect.width - 120) * local,
          y: slot.rect.y + slot.rect.height - 32 + Math.sin(local * Math.PI * 3) * 3,
          color,
          active: true,
        };
      }
    } else if (secFrame && activeCueProgress < 0.85) {
      // Sweeping section header or recap pointer
      const local = activeCueProgress / 0.85;
      penTarget = {
        x: secFrame.headerRect.x + 60 + Math.min(480, secFrame.headerRect.width * 0.55) * local,
        y: secFrame.headerRect.y + 46 + Math.sin(local * Math.PI * 4) * 5,
        color: "#18181B",
        active: true,
      };
    }
  }

  return {
    activeSectionIndex,
    activeCue,
    activeCueProgress,
    activeNodeId,
    sectionProgress,
    nodeProgress,
    nodeEmphasis,
    linkProgress,
    connectorProgress,
    penTarget,
  };
}
