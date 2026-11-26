import {
  BoardOp,
  BoardWashTone,
  LessonLink,
  LessonSection,
  LessonTone,
} from "@/types/lesson-board";
import {
  partialStroke,
  sketchArrow,
  sketchEllipse,
  sketchLine,
  sketchRoundedRect,
  SketchPoint,
} from "./prng-sketch";
import { synthesizeOpsFromSection } from "./validate";
import { compileMathExpr } from "./math-presets";

export const BOARD = {
  w: 1000,
  h: 625,
  m: 26,
  gap: 16,
  colGap: 24,
  minScale: 0.54,
} as const;

export const BOARD_FILL_HEX: Record<BoardWashTone, string> = {
  sky: "#E0F2FE",
  mint: "#DCFCE7",
  sand: "#FEF3C7",
  coral: "#FEE2E2",
  lilac: "#F3E8FF",
  head: "#EFF6FF",
  zebra: "#F8FAFC",
};

export function toneInkColor(tone?: LessonTone): string {
  if (tone === "pathology") return "#DC2626";
  if (tone === "normal") return "#1D4ED8";
  return "#1E3A8A";
}

export function toneNeutralInk(tone?: LessonTone): string {
  if (tone === "pathology") return "#DC2626";
  if (tone === "normal") return "#1D4ED8";
  return "#18181B";
}

export type BoardPrimitive =
  | {
      k: "fill";
      id: string;
      seq: number;
      nodeId?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      color: string;
      alpha?: number;
    }
  | {
      k: "text";
      id: string;
      seq: number;
      nodeId?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      fontSize: number;
      weight: 400 | 600 | 700;
      color: string;
      align: "left" | "center" | "right";
      fontKind: "hand" | "body" | "mono";
      rtl?: boolean;
    }
  | {
      k: "formula";
      id: string;
      seq: number;
      nodeId?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      tex: string;
      label?: string;
      color: string;
    }
  | {
      k: "stroke";
      id: string;
      seq: number;
      nodeId?: string;
      points: SketchPoint[];
      color: string;
      width: number;
      alpha?: number;
    }
  | {
      k: "badge";
      id: string;
      seq: number;
      nodeId?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      page?: number;
      quote?: string;
      inferred?: boolean;
    };

export interface BoardOpsLayout {
  width: number;
  height: number;
  primitives: BoardPrimitive[];
  totalSeq: number;
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function estimateOpHeight(op: BoardOp): number {
  switch (op.t) {
    case "title":
      return 64;
    case "write":
      return 48;
    case "bullets":
      return Math.min(200, 44 + op.items.length * 32);
    case "term":
      return 86;
    case "flow":
      return op.direction === "col" ? Math.min(340, op.steps.length * 86) : 168;
    case "compare":
      return Math.min(270, 56 + op.rows.length * 42);
    case "cycle":
      return 240;
    case "timeline":
      return 126;
    case "formula":
      return 84;
    case "function_plot":
      return 196;
    case "data_chart":
      return op.chartType === "pie"
        ? 184
        : Math.min(214, 64 + op.items.length * 26);
    case "source_figure":
      return Math.min(184, 92 + (op.callouts?.length || 0) * 22);
    case "pointer":
      return 0;
    default:
      return 56;
  }
}

/**
 * Pure deterministic layout compiler turning structured BoardOp[] into flat
 * 1000x625 primitives (`fill`, `text`, `formula`, `stroke`, `badge`).
 * Guarantees all elements stay strictly inside the 1000x625 paper bounds.
 */
export function layoutBoardOps(params: {
  lessonId: string;
  section: LessonSection;
  sectionIndex: number;
  links: LessonLink[];
  rtl?: boolean;
}): BoardOpsLayout {
  const { lessonId, section, sectionIndex, links, rtl = false } = params;
  const rawOps: BoardOp[] =
    section.ops && section.ops.length > 0
      ? section.ops
      : synthesizeOpsFromSection(section, links);

  // Ensure a title op is always first so every board page feels grounded
  const ops: BoardOp[] =
    rawOps[0]?.t === "title"
      ? rawOps
      : [
          {
            t: "title",
            text: section.title,
            subtitle: `STEP ${String(sectionIndex + 1).padStart(2, "0")} · ${section.kind.toUpperCase()}`,
          },
          ...rawOps,
        ];

  const primitives: BoardPrimitive[] = [];
  let seq = 0;
  let idCounter = 0;
  const nextId = (prefix: string) =>
    `${lessonId}:s${sectionIndex}:${prefix}:${++idCounter}`;

  const innerX = BOARD.m;
  const innerW = BOARD.w - BOARD.m * 2; // 948
  const maxContentY = BOARD.h - BOARD.m - 12; // 587

  // Compute vertical scaling if total op height exceeds available canvas height
  const totalEstimated = ops.reduce(
    (sum, o) => sum + estimateOpHeight(o) + (o.t === "pointer" ? 0 : BOARD.gap),
    0
  );
  const availH = maxContentY - BOARD.m;
  const yScale =
    totalEstimated > availH ? Math.max(0.68, availH / totalEstimated) : 1;

  let cursorY = BOARD.m;
  const nodeRects = new Map<string, { x: number; y: number; w: number; h: number }>();
  const nodePageMap = new Map(section.nodes.map((n) => [n.id, n.source]));

  const pushFill = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: string,
    nodeId?: string,
    alpha = 0.85
  ) => {
    primitives.push({
      k: "fill",
      id: nextId("fill"),
      seq,
      nodeId,
      x: Math.max(BOARD.m, x),
      y: Math.max(BOARD.m, y),
      w: Math.min(w, BOARD.w - BOARD.m - Math.max(BOARD.m, x)),
      h: Math.min(h, maxContentY - Math.max(BOARD.m, y)),
      r,
      color,
      alpha,
    });
  };

  const pushStroke = (
    points: SketchPoint[],
    color: string,
    width: number,
    nodeId?: string,
    alpha = 1
  ) => {
    primitives.push({
      k: "stroke",
      id: nextId("stroke"),
      seq,
      nodeId,
      points,
      color,
      width,
      alpha,
    });
  };

  const pushText = (opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontSize: number;
    weight?: 400 | 600 | 700;
    color?: string;
    align?: "left" | "center" | "right";
    fontKind?: "hand" | "body" | "mono";
    nodeId?: string;
  }) => {
    const isRtlText = rtl || ARABIC_RE.test(opts.text);
    primitives.push({
      k: "text",
      id: nextId("text"),
      seq,
      nodeId: opts.nodeId,
      x: opts.x,
      y: opts.y,
      w: Math.max(24, opts.w),
      h: Math.max(18, opts.h),
      text: opts.text,
      fontSize: opts.fontSize,
      weight: opts.weight ?? 600,
      color: opts.color ?? "#1E3A8A",
      align: opts.align ?? (isRtlText ? "right" : "left"),
      fontKind: opts.fontKind ?? "hand",
      rtl: isRtlText,
    });
  };

  const pushNodeBadge = (
    nodeId: string | undefined,
    boxX: number,
    boxY: number,
    boxW: number,
    placeOnLeft = false
  ) => {
    if (!nodeId) return;
    const src = nodePageMap.get(nodeId);
    if (!src) return;
    const badgeW = 48;
    const badgeH = 20;
    const badgeX = placeOnLeft
      ? Math.max(BOARD.m, boxX + 8)
      : Math.min(BOARD.w - BOARD.m - badgeW, boxX + boxW - badgeW - 8);
    primitives.push({
      k: "badge",
      id: nextId("badge"),
      seq,
      nodeId,
      x: badgeX,
      y: boxY + 6,
      w: badgeW,
      h: badgeH,
      label: `p.${src.page}`,
      page: src.page,
      quote: src.quote,
      inferred: src.inferred,
    });
  };

  for (const op of ops) {
    if (cursorY >= maxContentY - 24 && op.t !== "pointer") break;

    if (op.t === "title") {
      seq++;
      const h = Math.round(54 * yScale);
      const badgeW = 54;
      const isRtlTitle = rtl || ARABIC_RE.test(op.text);
      const badgeBoxX = isRtlTitle ? innerX + innerW - badgeW : innerX;
      pushFill(badgeBoxX, cursorY + 4, badgeW, 34, 10, "#FF4C00", op.nodeId, 0.22);
      pushStroke(
        sketchRoundedRect(badgeBoxX, cursorY + 4, badgeW, 34, 10, nextId("tbadge")),
        "#18181B",
        2.4,
        op.nodeId
      );
      pushText({
        x: badgeBoxX,
        y: cursorY + 4,
        w: badgeW,
        h: 34,
        text: String(sectionIndex + 1).padStart(2, "0"),
        fontSize: 18,
        weight: 700,
        color: "#18181B",
        align: "center",
        fontKind: "mono",
        nodeId: op.nodeId,
      });

      const subtitleW = op.subtitle ? 215 : 0;
      const titleColor = toneInkColor(op.tone);
      const titleX = isRtlTitle
        ? innerX + (op.subtitle ? subtitleW + 12 : 0)
        : innerX + badgeW + 14;
      const titleW = innerW - badgeW - 14 - (op.subtitle ? subtitleW + 14 : 0);
      pushText({
        x: titleX,
        y: cursorY,
        w: Math.max(120, titleW),
        h: 38,
        text: op.text,
        fontSize: Math.round(28 * Math.max(0.85, yScale)),
        weight: 700,
        color: titleColor,
        align: isRtlTitle ? "right" : "left",
        fontKind: "hand",
        nodeId: op.nodeId,
      });

      if (op.subtitle) {
        pushText({
          x: isRtlTitle ? innerX : innerX + innerW - subtitleW,
          y: cursorY + 8,
          w: subtitleW,
          h: 24,
          text: op.subtitle,
          fontSize: 12,
          weight: 700,
          color: "#475569",
          align: isRtlTitle ? "left" : "right",
          fontKind: "mono",
          nodeId: op.nodeId,
        });
      }

      const lineY = cursorY + h - 6;
      pushStroke(
        sketchLine(innerX, lineY, innerX + innerW, lineY, nextId("tline"), 1.3),
        "#1E3A8A",
        2.4,
        op.nodeId,
        0.55
      );
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "write") {
      seq++;
      const isRtlWrite = rtl || ARABIC_RE.test(op.text);
      const h = Math.round((isRtlWrite ? 52 : 46) * yScale);
      const ink = toneNeutralInk(op.tone);
      const washHex = op.wash ? BOARD_FILL_HEX[op.wash] : BOARD_FILL_HEX.sand;
      if (op.emphasis === "box" || op.wash) {
        pushFill(innerX, cursorY, innerW, h, 12, washHex, op.nodeId, 0.72);
      }
      if (op.emphasis === "box") {
        pushStroke(
          sketchRoundedRect(innerX, cursorY, innerW, h, 12, nextId("wbox")),
          ink,
          2.2,
          op.nodeId
        );
      }
      pushText({
        x: isRtlWrite ? innerX + 68 : innerX + 16,
        y: cursorY + 4,
        w: innerW - 84,
        h: h - 8,
        text: op.text,
        fontSize: Math.round(20 * Math.max(0.84, yScale)),
        weight: 700,
        color: ink,
        align: isRtlWrite ? "right" : "left",
        fontKind: "hand",
        nodeId: op.nodeId,
      });
      if (op.emphasis === "underline") {
        const ulLen = Math.min(innerW - 80, Math.max(220, op.text.length * 11));
        const ulX1 = isRtlWrite ? innerX + innerW - 16 - ulLen : innerX + 16;
        const ulX2 = isRtlWrite ? innerX + innerW - 16 : innerX + ulLen;
        pushStroke(
          sketchLine(
            ulX1,
            cursorY + h - 6,
            ulX2,
            cursorY + h - 6,
            nextId("wul")
          ),
          ink,
          2.6,
          op.nodeId,
          0.75
        );
      }
      pushNodeBadge(op.nodeId, innerX, cursorY, innerW, isRtlWrite);
      if (op.nodeId) nodeRects.set(op.nodeId, { x: innerX, y: cursorY, w: innerW, h });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "term") {
      seq++;
      const isRtlTerm = rtl || ARABIC_RE.test(op.term) || ARABIC_RE.test(op.definition);
      const h = Math.round((isRtlTerm ? 92 : 82) * yScale);
      const ink = toneNeutralInk(op.tone);
      const wash = BOARD_FILL_HEX[op.wash || "sky"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.72);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("termbox")),
        ink,
        2.3,
        op.nodeId
      );
      pushText({
        x: isRtlTerm ? innerX + 70 : innerX + 18,
        y: cursorY + 7,
        w: innerW - 92,
        h: 32,
        text: op.term,
        fontSize: 21,
        weight: 700,
        color: ink,
        align: isRtlTerm ? "right" : "left",
        fontKind: "hand",
        nodeId: op.nodeId,
      });
      pushText({
        x: innerX + 18,
        y: cursorY + (isRtlTerm ? 43 : 40),
        w: innerW - 36,
        h: Math.max(30, h - (isRtlTerm ? 48 : 44)),
        text: op.definition,
        fontSize: 16,
        weight: 600,
        color: "#334155",
        align: isRtlTerm ? "right" : "left",
        fontKind: "body",
        nodeId: op.nodeId,
      });
      pushNodeBadge(op.nodeId, innerX, cursorY, innerW, isRtlTerm);
      if (op.nodeId) nodeRects.set(op.nodeId, { x: innerX, y: cursorY, w: innerW, h });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "bullets") {
      seq++;
      const isRtlBullets =
        rtl ||
        (op.heading ? ARABIC_RE.test(op.heading) : false) ||
        op.items.some((it) => ARABIC_RE.test(it));
      const rowH = Math.round((isRtlBullets ? 34 : 30) * yScale);
      const headH = op.heading ? 34 : 8;
      const h = Math.min(maxContentY - cursorY, headH + op.items.length * rowH + 14);
      const ink = toneNeutralInk(op.tone);
      const wash = BOARD_FILL_HEX[op.wash || "mint"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.65);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("bulbox")),
        ink,
        2.0,
        op.nodeId,
        0.75
      );
      let curRowY = cursorY + 10;
      if (op.heading) {
        pushText({
          x: innerX + 18,
          y: curRowY,
          w: innerW - 36,
          h: 28,
          text: op.heading,
          fontSize: 20,
          weight: 700,
          color: ink,
          align: isRtlBullets ? "right" : "left",
          fontKind: "hand",
          nodeId: op.nodeId,
        });
        curRowY += 30;
      }
      op.items.slice(0, 5).forEach((item, idx) => {
        if (idx > 0) seq++;
        const dotX = isRtlBullets ? innerX + innerW - 24 : innerX + 26;
        pushStroke(
          sketchEllipse(dotX, curRowY + 14, 4.5, 4.5, nextId("bdot")),
          ink,
          2.6,
          op.nodeId
        );
        pushText({
          x: isRtlBullets ? innerX + 16 : innerX + 40,
          y: curRowY,
          w: innerW - 56,
          h: rowH - 2,
          text: item,
          fontSize: 17,
          weight: 600,
          color: "#1E293B",
          align: isRtlBullets ? "right" : "left",
          fontKind: "hand",
          nodeId: op.nodeId,
        });
        curRowY += rowH;
      });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "flow") {
      const steps = op.steps.slice(0, 4);
      const n = steps.length;
      if (n === 0) continue;

      const useVertical = op.direction === "col" && n > 3;
      if (!useVertical) {
        const arrowGap = 36;
        const boxW = Math.floor((innerW - arrowGap * Math.max(0, n - 1)) / n);
        const boxH = Math.round(Math.min(194, Math.max(128, (maxContentY - cursorY) * 0.56)) * yScale);

        steps.forEach((st, idx) => {
          seq++;
          const isRtlStep = rtl || ARABIC_RE.test(st.label) || (st.sub ? ARABIC_RE.test(st.sub) : false);
          const bx = innerX + idx * (boxW + arrowGap);
          const by = cursorY;
          const ink = toneNeutralInk(st.tone);
          const wash =
            st.tone === "pathology"
              ? BOARD_FILL_HEX.coral
              : st.tone === "normal"
              ? BOARD_FILL_HEX.sky
              : BOARD_FILL_HEX.zebra;

          pushFill(bx, by, boxW, boxH, 16, wash, st.nodeId, 0.9);
          pushStroke(
            sketchRoundedRect(bx, by, boxW, boxH, 16, nextId(`fbox_${idx}`)),
            ink,
            2.6,
            st.nodeId
          );

          // Step index circle mirrored cleanly on RTL steps so badge stays on opposite corner
          const numCenterX = isRtlStep ? bx + boxW - 24 : bx + 24;
          pushStroke(
            sketchEllipse(numCenterX, by + 24, 13, 13, nextId(`fnum_${idx}`)),
            ink,
            2.2,
            st.nodeId
          );
          pushText({
            x: numCenterX - 13,
            y: by + 13,
            w: 26,
            h: 22,
            text: String(idx + 1),
            fontSize: 14,
            weight: 700,
            color: ink,
            align: "center",
            fontKind: "mono",
            nodeId: st.nodeId,
          });

          pushText({
            x: bx + 14,
            y: by + 44,
            w: boxW - 28,
            h: st.sub ? Math.max(54, boxH - 96) : boxH - 64,
            text: st.label,
            fontSize: n >= 4 ? 16 : 19,
            weight: 700,
            color: "#0F172A",
            align: isRtlStep ? "right" : "left",
            fontKind: "hand",
            nodeId: st.nodeId,
          });

          if (st.sub) {
            pushText({
              x: bx + 14,
              y: by + boxH - 46,
              w: boxW - 28,
              h: 34,
              text: st.sub,
              fontSize: 13,
              weight: 600,
              color: "#475569",
              align: isRtlStep ? "right" : "left",
              fontKind: "body",
              nodeId: st.nodeId,
            });
          }

          pushNodeBadge(st.nodeId, bx, by, boxW, isRtlStep);
          if (st.nodeId) nodeRects.set(st.nodeId, { x: bx, y: by, w: boxW, h: boxH });

          if (idx < n - 1) {
            const ax1 = bx + boxW + 4;
            const ax2 = bx + boxW + arrowGap - 4;
            const ay = by + boxH / 2;
            const [shaft, head] = sketchArrow(ax1, ay, ax2, ay, nextId(`farr_${idx}`), 10);
            pushStroke(shaft, "#FF4C00", 3.2, st.nodeId);
            pushStroke(head, "#FF4C00", 3.0, st.nodeId);
          }
        });

        cursorY += boxH + Math.round(BOARD.gap * yScale);
      } else {
        // 2x2 grid S-flow for 4 steps so text stays large and readable
        const colGap = 40;
        const rowGap = 28;
        const boxW = Math.floor((innerW - colGap) / 2);
        const boxH = Math.round(Math.min(130, (maxContentY - cursorY - rowGap) / 2) * yScale);
        const positions = [
          { x: innerX, y: cursorY },
          { x: innerX + boxW + colGap, y: cursorY },
          { x: innerX + boxW + colGap, y: cursorY + boxH + rowGap },
          { x: innerX, y: cursorY + boxH + rowGap },
        ];

        steps.forEach((st, idx) => {
          seq++;
          const pos = positions[idx];
          const isRtlStep =
            rtl || ARABIC_RE.test(st.label) || (st.sub ? ARABIC_RE.test(st.sub) : false);
          const ink = toneNeutralInk(st.tone);
          const wash =
            st.tone === "pathology"
              ? BOARD_FILL_HEX.coral
              : st.tone === "normal"
              ? BOARD_FILL_HEX.sky
              : BOARD_FILL_HEX.zebra;

          pushFill(pos.x, pos.y, boxW, boxH, 16, wash, st.nodeId, 0.9);
          pushStroke(
            sketchRoundedRect(pos.x, pos.y, boxW, boxH, 16, nextId(`gbox_${idx}`)),
            ink,
            2.5,
            st.nodeId
          );

          pushText({
            x: isRtlStep ? pos.x + 62 : pos.x + 16,
            y: pos.y + 12,
            w: boxW - 78,
            h: 44,
            text: `${idx + 1}. ${st.label}`,
            fontSize: 19,
            weight: 700,
            color: ink,
            align: isRtlStep ? "right" : "left",
            fontKind: "hand",
            nodeId: st.nodeId,
          });
          if (st.sub) {
            pushText({
              x: pos.x + 16,
              y: pos.y + 58,
              w: boxW - 32,
              h: Math.max(24, boxH - 68),
              text: st.sub,
              fontSize: 14,
              weight: 600,
              color: "#334155",
              align: isRtlStep ? "right" : "left",
              fontKind: "body",
              nodeId: st.nodeId,
            });
          }
          pushNodeBadge(st.nodeId, pos.x, pos.y, boxW, isRtlStep);
          if (st.nodeId) nodeRects.set(st.nodeId, { x: pos.x, y: pos.y, w: boxW, h: boxH });

          if (idx === 0) {
            const [s1, h1] = sketchArrow(
              pos.x + boxW + 4,
              pos.y + boxH / 2,
              positions[1].x - 4,
              positions[1].y + boxH / 2,
              nextId("garr0")
            );
            pushStroke(s1, "#FF4C00", 3.0, st.nodeId);
            pushStroke(h1, "#FF4C00", 2.8, st.nodeId);
          } else if (idx === 1) {
            const [s2, h2] = sketchArrow(
              pos.x + boxW / 2,
              pos.y + boxH + 4,
              positions[2].x + boxW / 2,
              positions[2].y - 4,
              nextId("garr1")
            );
            pushStroke(s2, "#FF4C00", 3.0, st.nodeId);
            pushStroke(h2, "#FF4C00", 2.8, st.nodeId);
          } else if (idx === 2) {
            const [s3, h3] = sketchArrow(
              pos.x - 4,
              pos.y + boxH / 2,
              positions[3].x + boxW + 4,
              positions[3].y + boxH / 2,
              nextId("garr2")
            );
            pushStroke(s3, "#FF4C00", 3.0, st.nodeId);
            pushStroke(h3, "#FF4C00", 2.8, st.nodeId);
          }
        });

        cursorY += boxH * 2 + rowGap + Math.round(BOARD.gap * yScale);
      }
      continue;
    }

    if (op.t === "compare") {
      seq++;
      const rows = op.rows.slice(0, 4);
      const colW = Math.floor((innerW - 18) / 2);
      const headH = 38;
      const rowH = Math.round(36 * yScale);
      const totalH = headH + rows.length * rowH + 10;

      const leftInk = toneNeutralInk(op.leftTone || "normal");
      const rightInk = toneNeutralInk(op.rightTone || "pathology");

      pushFill(innerX, cursorY, colW, headH, 10, BOARD_FILL_HEX.sky, undefined, 0.85);
      pushFill(innerX + colW + 18, cursorY, colW, headH, 10, BOARD_FILL_HEX.coral, undefined, 0.85);
      pushStroke(sketchRoundedRect(innerX, cursorY, innerW, totalH, 14, nextId("cmpbox")), "#18181B", 2.2);
      pushStroke(
        sketchLine(innerX + colW + 9, cursorY + 6, innerX + colW + 9, cursorY + totalH - 6, nextId("cmpdiv")),
        "#64748B",
        2.0
      );

      pushText({
        x: innerX + 12,
        y: cursorY + 4,
        w: colW - 24,
        h: 30,
        text: op.leftTitle,
        fontSize: 19,
        weight: 700,
        color: leftInk,
        align: "center",
        fontKind: "hand",
      });
      pushText({
        x: innerX + colW + 30,
        y: cursorY + 4,
        w: colW - 24,
        h: 30,
        text: op.rightTitle,
        fontSize: 19,
        weight: 700,
        color: rightInk,
        align: "center",
        fontKind: "hand",
      });

      rows.forEach((r, idx) => {
        seq++;
        const ry = cursorY + headH + idx * rowH + 4;
        if (idx % 2 === 1) {
          pushFill(innerX + 4, ry, innerW - 8, rowH - 2, 6, BOARD_FILL_HEX.zebra, undefined, 0.8);
        }
        pushText({
          x: innerX + 14,
          y: ry + 2,
          w: colW - 24,
          h: rowH - 4,
          text: r.left,
          fontSize: 16,
          weight: 600,
          color: "#0F172A",
          fontKind: "hand",
        });
        pushText({
          x: innerX + colW + 28,
          y: ry + 2,
          w: colW - 24,
          h: rowH - 4,
          text: r.right,
          fontSize: 16,
          weight: 600,
          color: "#0F172A",
          fontKind: "hand",
        });
      });

      cursorY += totalH + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "cycle") {
      const nodes = op.nodes.slice(0, 5);
      const count = nodes.length;
      if (count === 0) continue;
      const areaH = Math.round(Math.min(230, maxContentY - cursorY - 12));
      const cx = BOARD.w / 2;
      const cy = cursorY + areaH / 2;
      const rx = Math.min(310, innerW * 0.34);
      const ry = Math.max(58, areaH * 0.33);

      if (op.title) {
        seq++;
        pushText({
          x: cx - 120,
          y: cy - 18,
          w: 240,
          h: 36,
          text: op.title,
          fontSize: 18,
          weight: 700,
          color: "#1E3A8A",
          align: "center",
          fontKind: "hand",
        });
      }

      nodes.forEach((cn, idx) => {
        seq++;
        const ang = (idx / count) * Math.PI * 2 - Math.PI / 2;
        const nextAng = (((idx + 1) % count) / count) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(ang) * rx;
        const ny = cy + Math.sin(ang) * ry;
        const boxW = 190;
        const boxH = 48;
        const bx = Math.max(BOARD.m, Math.min(BOARD.w - BOARD.m - boxW, nx - boxW / 2));
        const by = Math.max(BOARD.m, Math.min(maxContentY - boxH, ny - boxH / 2));
        const ink = toneNeutralInk(cn.tone);
        const wash =
          cn.tone === "pathology" ? BOARD_FILL_HEX.coral : BOARD_FILL_HEX.mint;

        pushFill(bx, by, boxW, boxH, 12, wash, cn.nodeId, 0.88);
        pushStroke(
          sketchRoundedRect(bx, by, boxW, boxH, 12, nextId(`cyc_${idx}`)),
          ink,
          2.2,
          cn.nodeId
        );
        pushText({
          x: bx + 10,
          y: by + 6,
          w: boxW - 20,
          h: boxH - 12,
          text: cn.label,
          fontSize: 16,
          weight: 700,
          color: ink,
          align: "center",
          fontKind: "hand",
          nodeId: cn.nodeId,
        });

        const ax1 = cx + Math.cos(ang + 0.28) * (rx * 0.86);
        const ay1 = cy + Math.sin(ang + 0.28) * (ry * 0.86);
        const ax2 = cx + Math.cos(nextAng - 0.28) * (rx * 0.86);
        const ay2 = cy + Math.sin(nextAng - 0.28) * (ry * 0.86);
        const [shaft, head] = sketchArrow(ax1, ay1, ax2, ay2, nextId(`carr_${idx}`), 8);
        pushStroke(shaft, "#FF4C00", 2.4, cn.nodeId);
        pushStroke(head, "#FF4C00", 2.2, cn.nodeId);
      });

      cursorY += areaH + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "timeline") {
      seq++;
      const evs = op.events.slice(0, 4);
      const h = Math.round(112 * yScale);
      const lineY = cursorY + 34;
      pushStroke(
        sketchLine(innerX + 20, lineY, innerX + innerW - 20, lineY, nextId("tlline")),
        "#1E3A8A",
        2.8
      );
      const stepW = Math.floor(innerW / Math.max(1, evs.length));
      evs.forEach((ev, idx) => {
        if (idx > 0) seq++;
        const ex = innerX + idx * stepW + stepW / 2;
        const ink = toneNeutralInk(ev.tone);
        pushStroke(sketchEllipse(ex, lineY, 7, 7, nextId(`tldot_${idx}`)), ink, 3.0, ev.nodeId);
        pushText({
          x: innerX + idx * stepW + 6,
          y: cursorY + 2,
          w: stepW - 12,
          h: 22,
          text: ev.time,
          fontSize: 13,
          weight: 700,
          color: "#FF4C00",
          align: "center",
          fontKind: "mono",
          nodeId: ev.nodeId,
        });
        pushText({
          x: innerX + idx * stepW + 8,
          y: lineY + 14,
          w: stepW - 16,
          h: 52,
          text: ev.label,
          fontSize: 16,
          weight: 700,
          color: ink,
          align: "center",
          fontKind: "hand",
          nodeId: ev.nodeId,
        });
      });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "formula") {
      seq++;
      const h = Math.round(74 * yScale);
      const wash = BOARD_FILL_HEX[op.wash || "lilac"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.72);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("fmsub")),
        "#1E3A8A",
        2.0,
        op.nodeId
      );
      if (op.label) {
        pushText({
          x: innerX + 16,
          y: cursorY + 12,
          w: 230,
          h: h - 24,
          text: op.label,
          fontSize: 17,
          weight: 700,
          color: "#1E3A8A",
          fontKind: "hand",
          nodeId: op.nodeId,
        });
      }
      primitives.push({
        k: "formula",
        id: nextId("katex"),
        seq,
        nodeId: op.nodeId,
        x: op.label ? innerX + 250 : innerX + 20,
        y: cursorY + 8,
        w: op.label ? innerW - 270 : innerW - 40,
        h: h - 16,
        tex: op.tex,
        label: op.label,
        color: "#0F172A",
      });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "function_plot") {
      seq++;
      const h = Math.round(188 * yScale);
      const wash = BOARD_FILL_HEX[op.wash || "sky"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.52);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("fnbox")),
        "#18181B",
        2.0,
        op.nodeId
      );
      pushText({
        x: innerX + 16,
        y: cursorY + 8,
        w: innerW - 260,
        h: 24,
        text: op.title || "Quantitative Plot",
        fontSize: 17,
        weight: 700,
        color: "#18181B",
        fontKind: "hand",
        nodeId: op.nodeId,
      });
      pushText({
        x: innerX + innerW - 245,
        y: cursorY + 8,
        w: 229,
        h: 22,
        text: `y = ${op.expr}`,
        fontSize: 13,
        weight: 600,
        color: "#1E3A8A",
        align: "right",
        fontKind: "mono",
        nodeId: op.nodeId,
      });

      const px = innerX + 68;
      const py = cursorY + 38;
      const pw = innerW - 108;
      const ph = Math.max(78, h - 72);
      const [xMin, xMax] =
        op.xRange && op.xRange[0] < op.xRange[1] ? op.xRange : [0, 10];
      let fn: ((v: Record<string, number>) => number) | null = null;
      try {
        fn = compileMathExpr(op.expr);
      } catch {
        fn = null;
      }

      const samples: Array<{ x: number; y: number }> = [];
      if (fn) {
        const steps = 44;
        for (let i = 0; i <= steps; i++) {
          const x = xMin + ((xMax - xMin) * i) / steps;
          const y = fn({ x });
          if (Number.isFinite(y) && Math.abs(y) < 1e6) {
            samples.push({ x, y });
          }
        }
      }

      let yMin = op.yRange && op.yRange[0] < op.yRange[1] ? op.yRange[0] : -10;
      let yMax = op.yRange && op.yRange[0] < op.yRange[1] ? op.yRange[1] : 10;
      if (!op.yRange && samples.length > 0) {
        let minS = Infinity;
        let maxS = -Infinity;
        for (const pt of samples) {
          if (pt.y < minS) minS = pt.y;
          if (pt.y > maxS) maxS = pt.y;
        }
        const pad = Math.max(0.5, (maxS - minS) * 0.14);
        yMin = minS - pad;
        yMax = maxS + pad;
      }
      if (yMax <= yMin) yMax = yMin + 1;

      const mapX = (vx: number) =>
        px + Math.max(0, Math.min(1, (vx - xMin) / (xMax - xMin))) * pw;
      const mapY = (vy: number) =>
        py + ph - Math.max(0, Math.min(1, (vy - yMin) / (yMax - yMin))) * ph;

      const xAxisY = yMin <= 0 && yMax >= 0 ? mapY(0) : py + ph;
      const yAxisX = xMin <= 0 && xMax >= 0 ? mapX(0) : px;
      pushStroke(
        sketchLine(px, xAxisY, px + pw, xAxisY, nextId("fnax"), 0.8),
        "#64748B",
        1.6,
        op.nodeId
      );
      pushStroke(
        sketchLine(yAxisX, py, yAxisX, py + ph, nextId("fnay"), 0.8),
        "#64748B",
        1.6,
        op.nodeId
      );

      if (samples.length >= 2) {
        const curvePts: SketchPoint[] = samples.map((pt) => ({
          x: mapX(pt.x),
          y: mapY(pt.y),
          p: 1,
        }));
        pushStroke(curvePts, "#FF4C00", 2.8, op.nodeId);
      }

      if (fn && op.highlightPoints) {
        for (const hp of op.highlightPoints.slice(0, 4)) {
          const hyVal = fn({ x: hp.x });
          if (!Number.isFinite(hyVal)) continue;
          const hx = mapX(hp.x);
          const hy = mapY(hyVal);
          pushStroke(
            sketchEllipse(hx, hy, 5.5, 5.5, nextId("fnhp")),
            "#1D4ED8",
            2.6,
            op.nodeId
          );
          pushText({
            x: Math.min(px + pw - 90, hx + 8),
            y: Math.max(py, hy - 14),
            w: 96,
            h: 20,
            text: hp.label,
            fontSize: 12,
            weight: 700,
            color: "#1D4ED8",
            fontKind: "body",
            nodeId: op.nodeId,
          });
        }
      }

      pushText({
        x: innerX + 10,
        y: py,
        w: 54,
        h: 18,
        text: Number.isInteger(yMax) ? String(yMax) : yMax.toFixed(1),
        fontSize: 11,
        weight: 600,
        color: "#475569",
        align: "right",
        fontKind: "mono",
      });
      pushText({
        x: innerX + 10,
        y: py + ph - 16,
        w: 54,
        h: 18,
        text: Number.isInteger(yMin) ? String(yMin) : yMin.toFixed(1),
        fontSize: 11,
        weight: 600,
        color: "#475569",
        align: "right",
        fontKind: "mono",
      });
      pushText({
        x: px,
        y: py + ph + 4,
        w: pw,
        h: 20,
        text: `${op.xLabel || "x"}: [${xMin} .. ${xMax}]${op.yLabel ? `  |  ${op.yLabel}` : ""}`,
        fontSize: 12,
        weight: 600,
        color: "#475569",
        align: "center",
        fontKind: "body",
      });
      pushNodeBadge(op.nodeId, innerX, cursorY, innerW);
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "data_chart") {
      seq++;
      const items = op.items.slice(0, 6);
      const isPie = op.chartType === "pie";
      const h = Math.round((isPie ? 178 : Math.min(206, 58 + items.length * 26)) * yScale);
      const wash = BOARD_FILL_HEX[op.wash || "sand"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.52);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("dcbox")),
        "#18181B",
        2.0,
        op.nodeId
      );
      pushText({
        x: innerX + 16,
        y: cursorY + 8,
        w: innerW - 96,
        h: 24,
        text: op.title || "Clinical Breakdown",
        fontSize: 17,
        weight: 700,
        color: "#18181B",
        fontKind: "hand",
        nodeId: op.nodeId,
      });

      const palette = ["#2563EB", "#FF4C00", "#10B981", "#7C3AED", "#D97706", "#DC2626"];
      const unitStr = op.unit ? op.unit : "";

      if (isPie) {
        const total = Math.max(
          1e-6,
          items.reduce((acc, it) => acc + Math.max(0, it.value), 0)
        );
        const cx = innerX + 126;
        const cy = cursorY + 34 + (h - 42) / 2;
        const radius = Math.max(30, Math.min(50, (h - 56) * 0.42));
        let startAngle = -Math.PI / 2;
        items.forEach((it, idx) => {
          const sliceColor =
            it.tone === "pathology" ? "#DC2626" : palette[idx % palette.length];
          const sweep = (Math.max(0, it.value) / total) * Math.PI * 2;
          if (sweep > 0.01) {
            const steps = Math.max(6, Math.round(sweep * 10));
            const arcPts: SketchPoint[] = [];
            for (let s = 0; s <= steps; s++) {
              const a = startAngle + (sweep * s) / steps;
              arcPts.push({
                x: cx + Math.cos(a) * radius,
                y: cy + Math.sin(a) * radius,
                p: 1,
              });
            }
            pushStroke(arcPts, sliceColor, 18, op.nodeId, 0.88);
          }
          startAngle += sweep;

          const ly = cursorY + 38 + idx * Math.min(24, Math.floor((h - 46) / Math.max(1, items.length)));
          const pct = Math.round((Math.max(0, it.value) / total) * 100);
          pushFill(innerX + 230, ly + 4, 12, 12, 3, sliceColor, op.nodeId, 0.95);
          pushText({
            x: innerX + 250,
            y: ly,
            w: innerW - 270,
            h: 22,
            text: `${it.label}: ${it.value}${unitStr} (${pct}%)`,
            fontSize: 14,
            weight: 600,
            color: "#18181B",
            fontKind: "body",
            nodeId: op.nodeId,
          });
        });
      } else {
        const maxVal = Math.max(1e-6, ...items.map((it) => it.value));
        const rowH = Math.min(26, Math.floor((h - 42) / Math.max(1, items.length)));
        const barX = innerX + 210;
        const maxBarW = innerW - 320;
        items.forEach((it, idx) => {
          const ry = cursorY + 38 + idx * rowH;
          const barColor =
            it.tone === "pathology" ? "#DC2626" : palette[idx % palette.length];
          const bw = Math.max(10, Math.round((it.value / maxVal) * maxBarW));
          pushText({
            x: innerX + 16,
            y: ry,
            w: 186,
            h: rowH - 2,
            text: it.label,
            fontSize: 14,
            weight: 600,
            color: "#18181B",
            fontKind: "body",
            nodeId: op.nodeId,
          });
          pushFill(barX, ry + 3, bw, Math.max(14, rowH - 8), 5, barColor, op.nodeId, 0.82);
          pushStroke(
            sketchRoundedRect(barX, ry + 3, bw, Math.max(14, rowH - 8), 5, nextId(`dbar_${idx}`)),
            "#18181B",
            1.4,
            op.nodeId
          );
          pushText({
            x: barX + bw + 8,
            y: ry,
            w: 96,
            h: rowH - 2,
            text: `${it.value}${unitStr}`,
            fontSize: 13,
            weight: 700,
            color: barColor,
            fontKind: "mono",
            nodeId: op.nodeId,
          });
        });
      }
      pushNodeBadge(op.nodeId, innerX, cursorY, innerW);
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "source_figure") {
      seq++;
      const callouts = (op.callouts || []).slice(0, 4);
      const h = Math.round(Math.min(178, 92 + callouts.length * 22) * yScale);
      const wash = BOARD_FILL_HEX[op.wash || "head"];
      pushFill(innerX, cursorY, innerW, h, 14, wash, op.nodeId, 0.72);
      pushStroke(
        sketchRoundedRect(innerX, cursorY, innerW, h, 14, nextId("figbox")),
        "#1D4ED8",
        2.2,
        op.nodeId
      );
      const figRtl = rtl || ARABIC_RE.test(op.caption);
      primitives.push({
        k: "badge",
        id: nextId("figpage"),
        seq,
        nodeId: op.nodeId,
        x: figRtl ? innerX + 14 : innerX + innerW - 88,
        y: cursorY + 10,
        w: 74,
        h: 22,
        label: `Fig p.${op.page}`,
        page: op.page,
        quote: op.caption,
      });
      pushText({
        x: figRtl ? innerX + 96 : innerX + 16,
        y: cursorY + 10,
        w: innerW - 118,
        h: 42,
        text: `Source Figure (p.${op.page}): ${op.caption}`,
        fontSize: 16,
        weight: 700,
        color: "#1E3A8A",
        align: figRtl ? "right" : "left",
        fontKind: "hand",
        nodeId: op.nodeId,
      });
      callouts.forEach((callout, idx) => {
        const cy = cursorY + 56 + idx * 22;
        pushStroke(
          sketchEllipse(innerX + 26, cy + 10, 4.5, 4.5, nextId(`figdot_${idx}`)),
          "#FF4C00",
          2.2,
          op.nodeId
        );
        pushText({
          x: innerX + 40,
          y: cy,
          w: innerW - 60,
          h: 20,
          text: `${idx + 1}. ${callout}`,
          fontSize: 14,
          weight: 600,
          color: "#18181B",
          fontKind: "body",
          nodeId: op.nodeId,
        });
      });
      cursorY += h + Math.round(BOARD.gap * yScale);
      continue;
    }

    if (op.t === "pointer" && op.targetNodeId) {
      const target = nodeRects.get(op.targetNodeId);
      if (target) {
        seq++;
        pushStroke(
          sketchEllipse(
            target.x + target.w / 2,
            target.y + target.h / 2,
            target.w * 0.52,
            target.h * 0.55,
            nextId("ptcircle")
          ),
          "#FF4C00",
          2.8,
          op.targetNodeId,
          0.75
        );
      }
    }
  }

  return {
    width: BOARD.w,
    height: BOARD.h,
    primitives,
    totalSeq: Math.max(1, seq),
  };
}

export interface BoardRevealFrame {
  /** Progress [0..1] per primitive.id */
  progressById: Record<string, number>;
  /** Sliced points per stroke primitive.id */
  visibleStrokes: Map<string, SketchPoint[]>;
  /** Live pen tip in 1000x625 board coordinates while drawing */
  penTip: { x: number; y: number; color: string; active: boolean } | null;
}

/**
 * Pure reveal function: maps normalized playback fraction [0..1] (and optional activeNodeId)
 * into per-primitive reveal progress without ever mutating layout geometry.
 */
export function revealAt(
  layout: BoardOpsLayout,
  fraction: number,
  options: { isPosterFull?: boolean; activeNodeId?: string | null } = {}
): BoardRevealFrame {
  const progressById: Record<string, number> = {};
  const visibleStrokes = new Map<string, SketchPoint[]>();
  const { isPosterFull = false } = options;

  if (isPosterFull || fraction >= 0.999) {
    for (const p of layout.primitives) {
      progressById[p.id] = 1;
      if (p.k === "stroke") visibleStrokes.set(p.id, p.points);
    }
    return { progressById, visibleStrokes, penTip: null };
  }

  const clamped = Math.max(0, Math.min(1, fraction));
  const totalSeq = Math.max(1, layout.totalSeq);
  const floatSeq = clamped * totalSeq + 0.35; // gentle lead-in so first stroke starts moving immediately

  let penTip: BoardRevealFrame["penTip"] = null;
  let latestActiveSeq = -1;

  for (const prim of layout.primitives) {
    const startSeq = prim.seq - 1;
    const rawP = (floatSeq - startSeq) / 1.0;
    const p = Math.max(0, Math.min(1, rawP));
    progressById[prim.id] = p;

    if (prim.k === "stroke" && p > 0) {
      const sliced = partialStroke(prim.points, p);
      visibleStrokes.set(prim.id, sliced);

      if (p > 0.02 && p < 0.98 && prim.seq >= latestActiveSeq && sliced.length > 0) {
        const tip = sliced[sliced.length - 1];
        latestActiveSeq = prim.seq;
        penTip = {
          x: tip.x,
          y: tip.y,
          color: prim.color,
          active: true,
        };
      }
    }
  }

  return { progressById, visibleStrokes, penTip };
}
