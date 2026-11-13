import { LessonLink, LessonLinkKind, LessonSection } from "@/types/lesson-board";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutNodeSlot {
  nodeId: string;
  sectionId: string;
  sectionIndex: number;
  orderInSection: number;
  rect: Rect;
}

export interface LayoutSectionFrame {
  sectionId: string;
  sectionIndex: number;
  rect: Rect;
  headerRect: Rect;
  row: number;
  col: number;
}

export interface LayoutLinkRoute {
  from: string;
  to: string;
  kind: LessonLinkKind;
  label?: string;
  pathD: string;
  arrowHeadPoints: string;
  labelPoint: Point;
  isCrossSection: boolean;
}

export interface LayoutRouteConnector {
  fromSectionId: string;
  toSectionId: string;
  pathD: string;
  arrowHeadPoints: string;
}

export interface BoardLayout {
  worldBounds: Rect;
  headerRect: Rect;
  sections: LayoutSectionFrame[];
  nodes: Record<string, LayoutNodeSlot>;
  links: LayoutLinkRoute[];
  routeConnectors: LayoutRouteConnector[];
  sectionViewBoxes: Rect[];
  overviewViewBox: Rect;
}

export const BOARD_GEOMETRY = {
  marginX: 60,
  headerTop: 24,
  headerHeight: 116,
  topOffset: 172,
  sectionWidth: 1040,
  sectionHeight: 560,
  sectionHeaderHeight: 88,
  sectionGapX: 160,
  sectionGapY: 136,
  nodeWidth: 432,
  nodeHeight: 172,
  nodePadX: 52,
  nodeGapX: 72,
  nodeGapY: 68,
  bottomMargin: 72,
  lodZoomThreshold: 0.58,
} as const;

/**
 * Computes deterministic section frame dimensions based on node count.
 */
export function frameSize(): { width: number; height: number } {
  return {
    width: BOARD_GEOMETRY.sectionWidth,
    height: BOARD_GEOMETRY.sectionHeight,
  };
}

/**
 * Computes deterministic node slot rectangles inside a section frame using an S-flow
 * so sequential steps sit adjacent to one another without crossing edges.
 */
export function frameSlots(frameRect: Rect, nodeIds: string[]): Rect[] {
  const { nodeWidth, nodeHeight, nodePadX, nodeGapX, nodeGapY, sectionHeaderHeight } =
    BOARD_GEOMETRY;
  const contentTop = frameRect.y + sectionHeaderHeight + 24;

  if (nodeIds.length <= 1) {
    return [
      {
        x: frameRect.x + (frameRect.width - nodeWidth) / 2,
        y: contentTop + (frameRect.height - sectionHeaderHeight - 48 - nodeHeight) / 2,
        width: nodeWidth,
        height: nodeHeight,
      },
    ];
  }

  if (nodeIds.length === 2) {
    const centerY = contentTop + (frameRect.height - sectionHeaderHeight - 48 - nodeHeight) / 2;
    return [
      { x: frameRect.x + nodePadX, y: centerY, width: nodeWidth, height: nodeHeight },
      {
        x: frameRect.x + nodePadX + nodeWidth + nodeGapX,
        y: centerY,
        width: nodeWidth,
        height: nodeHeight,
      },
    ];
  }

  const row0Y = contentTop + 12;
  const row1Y = row0Y + nodeHeight + nodeGapY;
  const col0X = frameRect.x + nodePadX;
  const col1X = frameRect.x + nodePadX + nodeWidth + nodeGapX;

  if (nodeIds.length === 3) {
    return [
      { x: col0X, y: row0Y, width: nodeWidth, height: nodeHeight },
      { x: col1X, y: row0Y, width: nodeWidth, height: nodeHeight },
      {
        x: frameRect.x + (frameRect.width - nodeWidth) / 2,
        y: row1Y,
        width: nodeWidth,
        height: nodeHeight,
      },
    ];
  }

  // 4 nodes: clockwise S-flow inside the frame (top-left -> top-right -> bottom-right -> bottom-left)
  return [
    { x: col0X, y: row0Y, width: nodeWidth, height: nodeHeight },
    { x: col1X, y: row0Y, width: nodeWidth, height: nodeHeight },
    { x: col1X, y: row1Y, width: nodeWidth, height: nodeHeight },
    { x: col0X, y: row1Y, width: nodeWidth, height: nodeHeight },
  ];
}

export function boundsOf(rects: Rect[], padX = 48, padY = 40): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 1200, height: 720 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return {
    x: minX - padX,
    y: minY - padY,
    width: maxX - minX + padX * 2,
    height: maxY - minY + padY * 2,
  };
}

function edgeMidpoints(r: Rect): {
  top: Point;
  right: Point;
  bottom: Point;
  left: Point;
} {
  return {
    top: { x: r.x + r.width / 2, y: r.y },
    right: { x: r.x + r.width, y: r.y + r.height / 2 },
    bottom: { x: r.x + r.width / 2, y: r.y + r.height },
    left: { x: r.x, y: r.y + r.height / 2 },
  };
}

function buildArrowHead(tip: Point, fromAnglePoint: Point, size = 14): string {
  const angle = Math.atan2(tip.y - fromAnglePoint.y, tip.x - fromAnglePoint.x);
  const spread = Math.PI / 6.5;
  const p1x = tip.x - size * Math.cos(angle - spread);
  const p1y = tip.y - size * Math.sin(angle - spread);
  const p2x = tip.x - size * Math.cos(angle + spread);
  const p2y = tip.y - size * Math.sin(angle + spread);
  return `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}`;
}

function routeCurveBetweenRects(
  fromRect: Rect,
  toRect: Rect
): { pathD: string; arrowHeadPoints: string; labelPoint: Point } {
  const fromEdges = edgeMidpoints(fromRect);
  const toEdges = edgeMidpoints(toRect);

  const fromCx = fromRect.x + fromRect.width / 2;
  const fromCy = fromRect.y + fromRect.height / 2;
  const toCx = toRect.x + toRect.width / 2;
  const toCy = toRect.y + toRect.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  let start: Point;
  let end: Point;
  let c1: Point;
  let c2: Point;

  if (Math.abs(dx) >= Math.abs(dy) * 1.15) {
    // Primarily horizontal link
    if (dx >= 0) {
      start = fromEdges.right;
      end = toEdges.left;
    } else {
      start = fromEdges.left;
      end = toEdges.right;
    }
    const pull = Math.max(40, Math.abs(end.x - start.x) * 0.45);
    const dir = dx >= 0 ? 1 : -1;
    c1 = { x: start.x + pull * dir, y: start.y };
    c2 = { x: end.x - pull * dir, y: end.y };
  } else {
    // Primarily vertical link
    if (dy >= 0) {
      start = fromEdges.bottom;
      end = toEdges.top;
    } else {
      start = fromEdges.top;
      end = toEdges.bottom;
    }
    const pull = Math.max(36, Math.abs(end.y - start.y) * 0.48);
    const dir = dy >= 0 ? 1 : -1;
    c1 = { x: start.x, y: start.y + pull * dir };
    c2 = { x: end.x, y: end.y - pull * dir };
  }

  const pathD = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  const arrowHeadPoints = buildArrowHead(end, c2);

  // Bezier midpoint at t = 0.5
  const midX = 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x;
  const midY = 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y;

  return {
    pathD,
    arrowHeadPoints,
    labelPoint: { x: midX, y: midY },
  };
}

/**
 * Deterministic S-route layout for an entire LessonBoard.
 * Same input always yields identical coordinates, link routes, and camera keyframes.
 */
export function layoutLessonBoard(
  sectionsInput: LessonSection[],
  linksInput: LessonLink[]
): BoardLayout {
  const {
    marginX,
    headerTop,
    headerHeight,
    topOffset,
    sectionWidth,
    sectionHeight,
    sectionHeaderHeight,
    sectionGapX,
    sectionGapY,
    bottomMargin,
  } = BOARD_GEOMETRY;

  const cols = sectionsInput.length <= 1 ? 1 : 2;
  const sections: LayoutSectionFrame[] = [];
  const nodes: Record<string, LayoutNodeSlot> = {};

  for (let i = 0; i < sectionsInput.length; i++) {
    const sec = sectionsInput[i];
    const row = Math.floor(i / cols);
    const colRaw = i % cols;
    // Boustrophedon S-route: even rows go left -> right, odd rows go right -> left
    const col = row % 2 === 0 ? colRaw : cols - 1 - colRaw;

    const size = frameSize();
    const x = marginX + col * (sectionWidth + sectionGapX);
    const y = topOffset + row * (sectionHeight + sectionGapY);
    const frameRect: Rect = { x, y, width: size.width, height: size.height };

    sections.push({
      sectionId: sec.id,
      sectionIndex: i,
      rect: frameRect,
      headerRect: {
        x: x + 28,
        y: y + 18,
        width: size.width - 56,
        height: sectionHeaderHeight - 18,
      },
      row,
      col,
    });

    const slots = frameSlots(
      frameRect,
      sec.nodes.map((n) => n.id)
    );
    sec.nodes.forEach((node, nIdx) => {
      nodes[node.id] = {
        nodeId: node.id,
        sectionId: sec.id,
        sectionIndex: i,
        orderInSection: nIdx,
        rect: slots[nIdx],
      };
    });
  }

  const totalBoardWidth =
    cols === 1
      ? marginX * 2 + sectionWidth
      : marginX * 2 + sectionWidth * 2 + sectionGapX;

  const headerRect: Rect = {
    x: marginX,
    y: headerTop,
    width: totalBoardWidth - marginX * 2,
    height: headerHeight,
  };

  const links: LayoutLinkRoute[] = [];
  for (const link of linksInput) {
    const fromSlot = nodes[link.from];
    const toSlot = nodes[link.to];
    if (!fromSlot || !toSlot) continue;
    const routed = routeCurveBetweenRects(fromSlot.rect, toSlot.rect);
    links.push({
      from: link.from,
      to: link.to,
      kind: link.kind,
      label: link.label,
      pathD: routed.pathD,
      arrowHeadPoints: routed.arrowHeadPoints,
      labelPoint: routed.labelPoint,
      isCrossSection: fromSlot.sectionId !== toSlot.sectionId,
    });
  }

  const routeConnectors: LayoutRouteConnector[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const routed = routeCurveBetweenRects(a.rect, b.rect);
    routeConnectors.push({
      fromSectionId: a.sectionId,
      toSectionId: b.sectionId,
      pathD: routed.pathD,
      arrowHeadPoints: routed.arrowHeadPoints,
    });
  }

  const allRects: Rect[] = [headerRect, ...sections.map((s) => s.rect)];
  const worldBounds = boundsOf(allRects, marginX, bottomMargin);
  const overviewViewBox = { ...worldBounds };

  const sectionViewBoxes: Rect[] = sections.map((sec) => ({
    x: sec.rect.x - 44,
    y: sec.rect.y - 36,
    width: sec.rect.width + 88,
    height: sec.rect.height + 72,
  }));

  return {
    worldBounds,
    headerRect,
    sections,
    nodes,
    links,
    routeConnectors,
    sectionViewBoxes,
    overviewViewBox,
  };
}

/**
 * Computes whether a viewBox width relative to container pixel width falls below the legibility floor.
 */
export function shouldUseCompactLod(
  viewBoxWidth: number,
  containerWidthPx: number
): boolean {
  if (containerWidthPx <= 0 || viewBoxWidth <= 0) return false;
  const scale = containerWidthPx / viewBoxWidth;
  return scale < BOARD_GEOMETRY.lodZoomThreshold;
}
