"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  Loader2,
  Crop,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  Camera,
  X,
  Check,
  Sparkles,
  MessageSquare,
  HelpCircle,
  Trash2,
  ArrowDownUp,
  ArrowLeftRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { getCachedPdfBuffer, cachePdfBuffer } from "@/lib/storage/pdf-local-cache";

interface OriginalPdfViewerProps {
  fileURL: string;
  currentPage: number;
  onPageChange?: (page: number, pageText?: string) => void;
  onTotalPagesLoaded?: (totalPages: number) => void;
  onTextSelection?: (
    text: string,
    position: { x: number; y: number } | null
  ) => void;
  onClearSelection?: () => void;
  onSnipDiagram?: (imageDataUrl: string, pageNumber: number, targetFeature?: "morph" | "chat" | "qbank") => void;
  zoomLevel?: number;
  fitMode?: "normal" | "fit-width" | "fit-page";
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitWidth?: () => void;
  onFitPage?: () => void;
  onZoomReset?: () => void;
  scrollOrientation?: "vertical" | "horizontal";
  onScrollOrientationChange?: (orientation: "vertical" | "horizontal") => void;
  theme?: "paper" | "ink";
  className?: string;
}

interface ConfirmedSnip {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

// ============================================================================
// SINGLE PAGE COMPONENT (Zero-Flicker Canvas & TextLayer Lifecycle)
// ============================================================================
interface PdfPageItemProps {
  pageNum: number;
  pdfDoc: any;
  scale: number;
  fitMode: "normal" | "fit-width" | "fit-page";
  scrollOrientation?: "vertical" | "horizontal";
  defaultPageSize: { width: number; height: number };
  isSnipActive: boolean;
  onSnipMouseDown: (e: React.MouseEvent, pageNum: number) => void;
  onSnipMouseMove: (e: React.MouseEvent, pageNum: number) => void;
  onSnipMouseUp: () => void;
  renderSnipOverlay: (pageNum: number) => React.ReactNode;
  onVisibleChange: (pageNum: number, isIntersecting: boolean, ratio: number) => void;
  onRegisterCanvas: (pageNum: number, canvas: HTMLCanvasElement | null) => void;
}

const PdfPageItem = React.memo(function PdfPageItem({
  pageNum,
  pdfDoc,
  scale,
  fitMode,
  scrollOrientation = "vertical",
  defaultPageSize,
  isSnipActive,
  onSnipMouseDown,
  onSnipMouseMove,
  onSnipMouseUp,
  renderSnipOverlay,
  onVisibleChange,
  onRegisterCanvas,
}: PdfPageItemProps) {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [isRendered, setIsRendered] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [shouldRender, setShouldRender] = useState(pageNum <= 3);

  const activeRenderTask = useRef<any>(null);
  const renderedScaleRef = useRef<number>(0);

  // 1. Viewport-based lazy rendering observer (Stable across parent renders)
  useEffect(() => {
    const el = pageContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          onVisibleChange(pageNum, entry.isIntersecting, entry.intersectionRatio);
          setShouldRender(entry.isIntersecting);
          if (!entry.isIntersecting && canvasRef.current) {
            // Free canvas GPU memory when scrolled far away to prevent browser black screens
            canvasRef.current.width = 0;
            canvasRef.current.height = 0;
            setIsRendered(false);
          }
        }
      },
      {
        root: null,
        rootMargin:
          scrollOrientation === "horizontal"
            ? "0px 1200px 0px 1200px"
            : "1200px 0px 1200px 0px",
        threshold: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNum, onVisibleChange, scrollOrientation]);

  // 2. Register canvas ref with parent for diagram snip tool
  useEffect(() => {
    onRegisterCanvas(pageNum, canvasRef.current);
    return () => onRegisterCanvas(pageNum, null);
  }, [pageNum, onRegisterCanvas]);

  // 3. Render Canvas and TextLayer with scale caching
  useEffect(() => {
    if (!pdfDoc) return;

    if (!shouldRender) {
      if (activeRenderTask.current) {
        try {
          activeRenderTask.current.cancel();
        } catch { }
        activeRenderTask.current = null;
      }
      // Keep already-rendered canvases in memory to prevent scroll flickering and layout jumps
      setIsRendering(false);
      return;
    }

    // Avoid redundant renders if already rendered at this exact scale
    if (isRendered && Math.abs(renderedScaleRef.current - scale) < 0.01) {
      return;
    }

    let isCancelled = false;

    async function executePageRender() {
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas) return;

      setIsRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });

        if (activeRenderTask.current) {
          try {
            activeRenderTask.current.cancel();
          } catch { }
        }

        const outputScale =
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2.0)
            : 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.style.backgroundColor = "#ffffff";

        const context = canvas.getContext("2d", { alpha: true });
        if (!context) return;

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : null;

        const renderContext = {
          canvasContext: context,
          transform: transform as any,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        activeRenderTask.current = renderTask;

        await renderTask.promise;
        activeRenderTask.current = null;

        if (isCancelled) return;
        renderedScaleRef.current = scale;
        setIsRendered(true);
        setIsRendering(false);

        // Render interactive TextLayer for selection
        if (textLayerDiv) {
          textLayerDiv.innerHTML = "";
          textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
          textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
          textLayerDiv.style.setProperty("--total-scale-factor", `${scale}`);

          try {
            const pdfjsLib = await import("pdfjs-dist");
            const textContent = await page.getTextContent();
            if (isCancelled) return;

            const textLayer = new pdfjsLib.TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport,
            });

            await textLayer.render();
          } catch (tlErr) {
            console.warn(`TextLayer warning on page ${pageNum}:`, tlErr);
          }
        }
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`Page ${pageNum} render error:`, err);
        }
        if (!isCancelled) {
          setIsRendering(false);
        }
      }
    }

    executePageRender();

    return () => {
      isCancelled = true;
      if (activeRenderTask.current) {
        try {
          activeRenderTask.current.cancel();
        } catch { }
      }
    };
  }, [pdfDoc, pageNum, scale, shouldRender, isRendered]);

  const estimatedWidth = Math.round(defaultPageSize.width * scale);
  const estimatedHeight = Math.round(defaultPageSize.height * scale);

  return (
    <div
      ref={pageContainerRef}
      id={`pdf-page-container-${pageNum}`}
      data-page-number={pageNum}
      className={cn(
        "pdf-page-wrapper relative overflow-visible rounded-md bg-white shadow-2xl select-text",
        scrollOrientation === "horizontal"
          ? "mx-2.5 my-auto shrink-0 snap-center self-center overflow-visible"
          : "mx-auto my-2 sm:my-3 max-w-full",
        fitMode === "fit-width" && "max-w-full overflow-hidden",
        isSnipActive && "cursor-crosshair"
      )}
      style={{
        width: `${estimatedWidth}px`,
        height: `${estimatedHeight}px`,
        maxWidth: fitMode === "fit-width" ? "100%" : undefined,
      }}
      onMouseDown={(e) => onSnipMouseDown(e, pageNum)}
      onMouseMove={(e) => onSnipMouseMove(e, pageNum)}
      onMouseUp={onSnipMouseUp}
    >
      {/* Page Number Pill */}
      <div className="absolute top-2 left-2 z-30 pointer-events-none rounded-md bg-black/75 px-2 py-0.5 font-mono text-[9.5px] font-bold text-white shadow-sm backdrop-blur-sm">
        Page {pageNum}
      </div>

      {/* Loading Indicator */}
      {isRendering && !isRendered && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/90">
          <Loader2 className="size-6 animate-spin text-[color:var(--orange)]" />
          <span className="text-[11px] font-bold text-[#16151a]/70">
            Rendering Page {pageNum}...
          </span>
        </div>
      )}

      {/* Snip Diagram Overlay & Confirmation */}
      {renderSnipOverlay(pageNum)}

      {/* Canvas */}
      <canvas ref={canvasRef} className="block max-w-full h-auto" />

      {/* TextLayer */}
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 overflow-hidden pointer-events-auto"
      />
    </div>
  );
});

// ============================================================================
// MAIN VIEWER COMPONENT
// ============================================================================
export default function OriginalPdfViewer({
  fileURL,
  currentPage,
  onPageChange,
  onTotalPagesLoaded,
  onTextSelection,
  onClearSelection,
  onSnipDiagram,
  zoomLevel = 100,
  fitMode = "fit-width",
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  onZoomReset,
  scrollOrientation: initialScrollOrientation = "vertical",
  onScrollOrientationChange,
  theme = "paper",
  className,
}: OriginalPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Local fallback state if parent does not provide callbacks
  const [internalFitMode, setInternalFitMode] = useState<"normal" | "fit-width" | "fit-page">(fitMode || "fit-width");
  const [internalZoomLevel, setInternalZoomLevel] = useState<number>(zoomLevel || 100);

  useEffect(() => {
    if (fitMode) setInternalFitMode(fitMode);
  }, [fitMode]);

  useEffect(() => {
    if (zoomLevel) setInternalZoomLevel(zoomLevel);
  }, [zoomLevel]);

  const activeFitMode = fitMode || internalFitMode;
  const activeZoomLevel = zoomLevel || internalZoomLevel;

  const handleTriggerFitWidth = () => {
    if (onFitWidth) onFitWidth();
    else setInternalFitMode("fit-width");
  };

  const handleTriggerFitPage = () => {
    if (onFitPage) onFitPage();
    else setInternalFitMode("fit-page");
  };

  const handleTriggerZoomIn = () => {
    if (onZoomIn) onZoomIn();
    else setInternalZoomLevel((prev) => Math.min(250, prev + 15));
  };

  const handleTriggerZoomOut = () => {
    if (onZoomOut) onZoomOut();
    else setInternalZoomLevel((prev) => Math.max(50, prev - 15));
  };

  const handleTriggerZoomReset = () => {
    if (onZoomReset) onZoomReset();
    else {
      setInternalFitMode("normal");
      setInternalZoomLevel(100);
    }
  };

  // Scroll Orientation State (Vertical or Horizontal carousel/slide)
  const [scrollOrientation, setScrollOrientation] = useState<"vertical" | "horizontal">(
    initialScrollOrientation
  );

  // Keep latest callbacks in ref to eliminate parent re-render dependencies
  const callbacksRef = useRef({
    onPageChange,
    onTotalPagesLoaded,
    onTextSelection,
    onClearSelection,
    onSnipDiagram,
    onScrollOrientationChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      onPageChange,
      onTotalPagesLoaded,
      onTextSelection,
      onClearSelection,
      onSnipDiagram,
      onScrollOrientationChange,
    };
  });

  // PDF Document State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const pdfDocRef = useRef<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Intrinsic Page Size
  const [docPageSize, setDocPageSize] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });

  // Dynamic Container Dimensions
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Page Tracking
  const [activeVisiblePage, setActiveVisiblePage] = useState<number>(
    currentPage || 1
  );
  const activeVisiblePageRef = useRef<number>(currentPage || 1);
  const lastReportedPageRef = useRef<number>(currentPage || 1);
  const visiblePageRatios = useRef<Map<number, number>>(new Map());
  const isInternalScrollRef = useRef<boolean>(Boolean(currentPage && currentPage > 1));
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User manual scroll detection to completely prevent scroll fighting & rollbacks
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pageNotifyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable toggle handler for orientation that freezes visibility detection during DOM reflow
  const handleToggleScrollOrientation = useCallback(() => {
    const next = scrollOrientation === "vertical" ? "horizontal" : "vertical";

    // 1. Lock internal scroll immediately to suppress observer callbacks during reflow
    isInternalScrollRef.current = true;
    if (pageNotifyTimerRef.current) {
      clearTimeout(pageNotifyTimerRef.current);
      pageNotifyTimerRef.current = null;
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    const targetPage = activeVisiblePageRef.current || currentPage || 1;
    visiblePageRatios.current.clear();
    visiblePageRatios.current.set(targetPage, 1.0);

    setScrollOrientation(next);
    callbacksRef.current.onScrollOrientationChange?.(next);

    // 2. Wait two animation frames for DOM layout reflow to settle, then align to targetPage
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const pageEl = document.getElementById(`pdf-page-container-${targetPage}`);
        if (pageEl && containerRef.current) {
          pageEl.scrollIntoView({
            behavior: "auto",
            block: next === "horizontal" ? "nearest" : "start",
            inline: next === "horizontal" ? "center" : "nearest",
          });
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isInternalScrollRef.current = false;
        }, 400);
      });
    });
  }, [scrollOrientation, currentPage]);

  // Sync external changes to initialScrollOrientation
  const prevOrientationRef = useRef<"vertical" | "horizontal">(initialScrollOrientation);
  useEffect(() => {
    if (initialScrollOrientation && initialScrollOrientation !== prevOrientationRef.current) {
      prevOrientationRef.current = initialScrollOrientation;
      if (initialScrollOrientation !== scrollOrientation) {
        const targetPage = activeVisiblePageRef.current || currentPage || 1;
        isInternalScrollRef.current = true;
        if (pageNotifyTimerRef.current) clearTimeout(pageNotifyTimerRef.current);
        visiblePageRatios.current.clear();
        visiblePageRatios.current.set(targetPage, 1.0);
        setScrollOrientation(initialScrollOrientation);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const pageEl = document.getElementById(`pdf-page-container-${targetPage}`);
            if (pageEl && containerRef.current) {
              pageEl.scrollIntoView({
                behavior: "auto",
                block: initialScrollOrientation === "horizontal" ? "nearest" : "start",
                inline: initialScrollOrientation === "horizontal" ? "center" : "nearest",
              });
            }
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = setTimeout(() => {
              isInternalScrollRef.current = false;
            }, 400);
          });
        });
      }
    }
  }, [initialScrollOrientation, scrollOrientation, currentPage]);

  // Jump Input State
  const [isEditingPage, setIsEditingPage] = useState<boolean>(false);
  const [pageInputValue, setPageInputValue] = useState<string>("");
  const pageInputRef = useRef<HTMLInputElement>(null);

  // Canvas registry for snipping
  const canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Snip Tool State
  const [isSnipActive, setIsSnipActive] = useState<boolean>(false);
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [snipCurrent, setSnipCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [activeSnipPage, setActiveSnipPage] = useState<number>(1);
  const [confirmedSnip, setConfirmedSnip] = useState<ConfirmedSnip | null>(null);

  // 1. Debounced ResizeObserver to prevent continuous canvas invalidation during splitter drags
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let resizeTimer: NodeJS.Timeout | null = null;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }, 120);
      }
    });

    ro.observe(el);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, []);

  // 2. Initialize and Load Document
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadPdf() {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        if (typeof window !== "undefined") {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        // Resolve URL: proxy private Vercel blobs via local streaming route
        const effectiveUrl = fileURL.includes(".private.blob.vercel-storage.com")
          ? `/api/storage/file?url=${encodeURIComponent(fileURL)}`
          : fileURL;

        // Check local IndexedDB cache first for instant <100ms loading
        const cachedBuffer = await getCachedPdfBuffer(fileURL);

        const loadingTask = pdfjsLib.getDocument(
          cachedBuffer
            ? { data: cachedBuffer }
            : {
                url: effectiveUrl,
                withCredentials: false,
                disableAutoFetch: true,
                disableStream: false,
                rangeChunkSize: 65536,
              }
        );

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        // Cache for all future reader sessions if not cached yet
        if (!cachedBuffer) {
          doc.getData().then((u8) => cachePdfBuffer(fileURL, u8.buffer as ArrayBuffer)).catch(() => {});
        }

        try {
          const firstPage = await doc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1.0 });
          setDocPageSize({ width: vp.width, height: vp.height });
        } catch { }

        setPdfDoc(doc);
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        callbacksRef.current.onTotalPagesLoaded?.(doc.numPages);
        setLoading(false);

        // Extract active page text in background without delaying visual canvas paint
        doc.getPage(currentPage || 1)
          .then((initP) => initP.getTextContent())
          .then((txtContent) => {
            if (!isMounted) return;
            const initStr = txtContent.items.map((it: any) => it.str).join(" ");
            callbacksRef.current.onPageChange?.(currentPage || 1, initStr);
          })
          .catch(() => {});
      } catch (err: any) {
        console.warn("Local worker load issue, trying unpkg worker fallback:", err);
        try {
          const pdfjsLib = await import("pdfjs-dist");
          const workerVer = pdfjsLib.version || "5.5.207";
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${workerVer}/build/pdf.worker.min.mjs`;

          const effectiveUrl = fileURL.includes(".private.blob.vercel-storage.com")
            ? `/api/storage/file?url=${encodeURIComponent(fileURL)}`
            : fileURL;

          const fallbackTask = pdfjsLib.getDocument({
            url: effectiveUrl,
            withCredentials: false,
            disableAutoFetch: true,
            disableStream: false,
            rangeChunkSize: 65536,
          });

          const doc = await fallbackTask.promise;
          if (!isMounted) return;

          try {
            const firstPage = await doc.getPage(1);
            const vp = firstPage.getViewport({ scale: 1.0 });
            setDocPageSize({ width: vp.width, height: vp.height });
          } catch { }

          setPdfDoc(doc);
          pdfDocRef.current = doc;
          setTotalPages(doc.numPages);
          callbacksRef.current.onTotalPagesLoaded?.(doc.numPages);
          setLoading(false);

          doc.getPage(currentPage || 1)
            .then((initP) => initP.getTextContent())
            .then((txtContent) => {
              if (!isMounted) return;
              const initStr = txtContent.items.map((it: any) => it.str).join(" ");
              callbacksRef.current.onPageChange?.(currentPage || 1, initStr);
            })
            .catch(() => {});
        } catch (fallbackErr: any) {
          console.error("Critical PDF load error:", fallbackErr);
          if (!isMounted) return;
          setError(
            fallbackErr?.message ||
            "Unable to load original PDF file. Please verify file availability."
          );
          setLoading(false);
        }
      }
    }

    if (fileURL) {
      loadPdf();
    } else {
      setError("No document URL provided for this source.");
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [fileURL]);

  // 3. Compute Scale with Width/Height Fitting (Responsive on Mobile & Desktop)
  const computedScale = useMemo(() => {
    const windowW = typeof window !== "undefined" ? window.innerWidth : 375;
    const windowH = typeof window !== "undefined" ? window.innerHeight : 667;
    const defaultW = Math.max(280, Math.min(windowW - 16, 760));
    const defaultH = Math.max(300, windowH - 120);

    const w = containerSize.width || containerRef.current?.clientWidth || defaultW;
    const h = containerSize.height || containerRef.current?.clientHeight || defaultH;

    const pageWidth = docPageSize.width || 595;
    const pageHeight = docPageSize.height || 842;

    const padX = w < 480 ? 8 : 20;
    const padY = h < 600 ? 16 : 30;

    if (scrollOrientation === "horizontal") {
      const availableH = Math.max(100, h - padY);
      const scaleH = availableH / pageHeight;
      return Math.max(0.15, Math.min(3.2, scaleH * (activeZoomLevel / 100)));
    }

    if (activeFitMode === "fit-width") {
      const availableW = Math.max(100, w - padX);
      const scaleW = availableW / pageWidth;
      return Math.max(0.15, Math.min(3.2, scaleW * (activeZoomLevel / 100)));
    }

    if (activeFitMode === "fit-page") {
      const availableW = Math.max(100, w - padX);
      const availableH = Math.max(100, h - padY);
      const scaleW = availableW / pageWidth;
      const scaleH = availableH / pageHeight;
      return Math.max(0.15, Math.min(3.2, Math.min(scaleW, scaleH) * (activeZoomLevel / 100)));
    }

    // Normal mode: proportional to container width ratio
    const availableW = Math.max(100, w - padX);
    const widthRatio = availableW / pageWidth;
    return Math.max(0.15, Math.min(3.2, widthRatio * (activeZoomLevel / 100)));
  }, [activeZoomLevel, activeFitMode, containerSize, docPageSize, scrollOrientation]);

  // 4. Register Canvas Callback for Page Items (stable reference)
  const handleRegisterCanvas = useCallback(
    (pageNum: number, canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        canvasMap.current.set(pageNum, canvas);
      } else {
        canvasMap.current.delete(pageNum);
      }
    },
    []
  );

  // User manual scroll handler to set scrolling flag and prevent scroll-fighting
  const handleContainerScroll = useCallback(() => {
    if (isInternalScrollRef.current) return;
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 400);
  }, []);

  // 5. Track Most Visible Page with stable reference, debounce, and loop guard
  const handleVisibleChange = useCallback(
    (pageNum: number, isIntersecting: boolean, ratio: number) => {
      if (isIntersecting) {
        visiblePageRatios.current.set(pageNum, ratio);
      } else {
        visiblePageRatios.current.delete(pageNum);
      }

      if (isInternalScrollRef.current) return;

      let maxRatio = 0;
      let mostVisible = activeVisiblePageRef.current;
      visiblePageRatios.current.forEach((r, p) => {
        if (r > maxRatio) {
          maxRatio = r;
          mostVisible = p;
        }
      });

      if (mostVisible && mostVisible !== activeVisiblePageRef.current) {
        activeVisiblePageRef.current = mostVisible;
        lastReportedPageRef.current = mostVisible;
        setActiveVisiblePage(mostVisible);

        // Debounce text extraction and parent notification so rapid scrollbar dragging doesn't flood React
        if (pageNotifyTimerRef.current) clearTimeout(pageNotifyTimerRef.current);
        pageNotifyTimerRef.current = setTimeout(() => {
          if (isInternalScrollRef.current) return;
          const doc = pdfDocRef.current;
          if (doc) {
            doc.getPage(mostVisible).then(async (pageObj: any) => {
              try {
                const textContent = await pageObj.getTextContent();
                const pageString = textContent.items
                  .map((item: any) => item.str)
                  .join(" ");
                callbacksRef.current.onPageChange?.(mostVisible, pageString);
              } catch {
                callbacksRef.current.onPageChange?.(mostVisible);
              }
            }).catch(() => {
              callbacksRef.current.onPageChange?.(mostVisible);
            });
          } else {
            callbacksRef.current.onPageChange?.(mostVisible);
          }
        }, 120);
      }
    },
    []
  );

  // Initial scroll when pdfDoc finishes loading and currentPage > 1
  const initialScrollDoneRef = useRef<boolean>(false);
  useEffect(() => {
    if (!loading && pdfDoc && currentPage > 1 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      isInternalScrollRef.current = true;
      visiblePageRatios.current.clear();
      visiblePageRatios.current.set(currentPage, 1.0);
      activeVisiblePageRef.current = currentPage;
      lastReportedPageRef.current = currentPage;
      setActiveVisiblePage(currentPage);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const pageEl = document.getElementById(`pdf-page-container-${currentPage}`);
          if (pageEl && containerRef.current) {
            pageEl.scrollIntoView({
              behavior: "auto",
              block: scrollOrientation === "horizontal" ? "nearest" : "start",
              inline: scrollOrientation === "horizontal" ? "center" : "nearest",
            });
            pageEl.classList.add("ring-4", "ring-[color:var(--orange)]", "shadow-xl", "transition-all", "duration-1000");
            setTimeout(() => {
              pageEl.classList.remove("ring-4", "ring-[color:var(--orange)]", "shadow-xl");
            }, 2000);
          }
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            isInternalScrollRef.current = false;
          }, 800);
        });
      });
    }
  }, [loading, pdfDoc, currentPage, scrollOrientation]);

  // 6. External Jump to Page (with strict loop guard against scroll fighting)
  useEffect(() => {
    // If invalid, already at page, just reported by our own scroll, or user is currently scrolling: DO NOT scroll!
    if (
      !currentPage ||
      currentPage === activeVisiblePageRef.current ||
      currentPage === lastReportedPageRef.current ||
      isUserScrollingRef.current
    ) {
      return;
    }

    activeVisiblePageRef.current = currentPage;
    lastReportedPageRef.current = currentPage;
    setActiveVisiblePage(currentPage);

    const doc = pdfDocRef.current;
    if (doc) {
      doc.getPage(currentPage).then(async (pageObj: any) => {
        try {
          const textContent = await pageObj.getTextContent();
          const pageString = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          callbacksRef.current.onPageChange?.(currentPage, pageString);
        } catch { }
      }).catch(() => { });
    }

    const pageEl = document.getElementById(`pdf-page-container-${currentPage}`);
    if (pageEl && containerRef.current) {
      isInternalScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      pageEl.scrollIntoView({
        behavior: "smooth",
        block: scrollOrientation === "horizontal" ? "nearest" : "start",
        inline: scrollOrientation === "horizontal" ? "center" : "nearest",
      });

      scrollTimeoutRef.current = setTimeout(() => {
        isInternalScrollRef.current = false;
      }, 700);
    }
  }, [currentPage, scrollOrientation]);

  // 7. Handle Native Text Selection on the TextLayer
  const handleSelectionCheck = useCallback(() => {
    if (isSnipActive) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = sel.toString().trim();
    if (text.length > 3 && containerRef.current) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        const x =
          rect.left - containerRect.left + containerRef.current.scrollLeft;
        const y =
          rect.top - containerRect.top + containerRef.current.scrollTop;

        callbacksRef.current.onTextSelection?.(text, { x, y });
      } catch {
        callbacksRef.current.onTextSelection?.(text, { x: 50, y: 100 });
      }
    }
  }, [isSnipActive]);

  // 8. Snip Diagram Mouse Handlers
  const handleSnipMouseDown = (e: React.MouseEvent, pageNum: number) => {
    if (!isSnipActive) return;
    const pageEl = document.getElementById(`pdf-page-container-${pageNum}`);
    if (!pageEl) return;

    const rect = pageEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setActiveSnipPage(pageNum);
    setSnipStart({ x, y });
    setSnipCurrent({ x, y });
  };

  const handleSnipMouseMove = (e: React.MouseEvent, pageNum: number) => {
    if (!isSnipActive || !snipStart || activeSnipPage !== pageNum) return;
    const pageEl = document.getElementById(`pdf-page-container-${pageNum}`);
    if (!pageEl) return;

    const rect = pageEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setSnipCurrent({ x, y });
  };

  const handleSnipMouseUp = () => {
    if (!isSnipActive || !snipStart || !snipCurrent) {
      setSnipStart(null);
      setSnipCurrent(null);
      return;
    }

    const canvas = canvasMap.current.get(activeSnipPage);
    if (!canvas) {
      setSnipStart(null);
      setSnipCurrent(null);
      return;
    }

    const x1 = Math.min(snipStart.x, snipCurrent.x);
    const y1 = Math.min(snipStart.y, snipCurrent.y);
    const x2 = Math.max(snipStart.x, snipCurrent.x);
    const y2 = Math.max(snipStart.y, snipCurrent.y);

    const width = x2 - x1;
    const height = y2 - y1;

    if (width > 20 && height > 20) {
      const pageEl = document.getElementById(
        `pdf-page-container-${activeSnipPage}`
      );
      if (pageEl) {
        const displayedWidth = pageEl.clientWidth;
        const displayedHeight = pageEl.clientHeight;
        const scaleX = canvas.width / displayedWidth;
        const scaleY = canvas.height / displayedHeight;

        const sourceX = x1 * scaleX;
        const sourceY = y1 * scaleY;
        const sourceW = width * scaleX;
        const sourceH = height * scaleY;

        const snippetCanvas = document.createElement("canvas");
        snippetCanvas.width = sourceW;
        snippetCanvas.height = sourceH;
        const ctx = snippetCanvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(
            canvas,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            0,
            0,
            sourceW,
            sourceH
          );

          const dataUrl = snippetCanvas.toDataURL("image/png");

          // Keep selection box visibly confirmed on canvas!
          setConfirmedSnip({
            pageNum: activeSnipPage,
            x: x1,
            y: y1,
            width,
            height,
            dataUrl,
          });

          // Trigger snip callback
          callbacksRef.current.onSnipDiagram?.(dataUrl, activeSnipPage);
        }
      }
    }

    setSnipStart(null);
    setSnipCurrent(null);
    setIsSnipActive(false);
  };

  const handleSnipAction = (action: "morph" | "chat" | "qbank") => {
    if (!confirmedSnip) return;
    callbacksRef.current.onSnipDiagram?.(confirmedSnip.dataUrl, confirmedSnip.pageNum, action);
  };

  const clearConfirmedSnip = () => {
    setConfirmedSnip(null);
  };

  // Render Dragging Box + Confirmed Box with Action Toolbar
  const renderSnipOverlay = (pageNum: number) => {
    const isActivelyDragging =
      isSnipActive && snipStart && snipCurrent && activeSnipPage === pageNum;
    const hasConfirmedSnipOnThisPage =
      confirmedSnip && confirmedSnip.pageNum === pageNum;

    return (
      <>
        {/* Active dragging box */}
        {isActivelyDragging && (
          <div
            className="pointer-events-none absolute z-40 rounded border-2 border-dashed border-amber-400 bg-amber-400/25 shadow-xl"
            style={{
              left: Math.min(snipStart.x, snipCurrent.x),
              top: Math.min(snipStart.y, snipCurrent.y),
              width: Math.abs(snipCurrent.x - snipStart.x),
              height: Math.abs(snipCurrent.y - snipStart.y),
            }}
          >
            <span className="absolute -top-6 left-0 rounded bg-[color:var(--ink)] px-2 py-0.5 text-[9.5px] font-bold text-[color:var(--orange)] shadow">
              Select Area ({Math.round(Math.abs(snipCurrent.x - snipStart.x))}×
              {Math.round(Math.abs(snipCurrent.y - snipStart.y))}px)
            </span>
          </div>
        )}

        {/* Confirmed visible selection box with floating action buttons */}
        {hasConfirmedSnipOnThisPage && confirmedSnip && (
          <div
            className="absolute z-40 rounded border-2 border-amber-500 bg-amber-500/15 shadow-xl ring-2 ring-amber-400/50"
            style={{
              left: confirmedSnip.x,
              top: confirmedSnip.y,
              width: confirmedSnip.width,
              height: confirmedSnip.height,
            }}
          >
            {/* Top pill: Confirmed badge */}
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 rounded-full bg-[color:var(--ink)] px-2.5 py-0.5 text-[10px] font-bold text-[color:var(--orange)] shadow-md">
              <Check className="size-3 text-emerald-400" />
              <span>Diagram Selected</span>
            </div>

            {/* Bottom floating action bar */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#16151a] p-1 rounded-full border border-amber-400/60 shadow-2xl backdrop-blur-md z-50">
              <button
                type="button"
                onClick={() => handleSnipAction("morph")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-[color:var(--orange)] text-[color:var(--ink)] hover:opacity-90 cursor-pointer shadow-xs"
                title="Morph this diagram into interactive causal flow and simulator"
              >
                <Sparkles className="size-3" />
                <span>Morph</span>
              </button>
              <button
                type="button"
                onClick={() => handleSnipAction("chat")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-white/10 text-[color:var(--cream)] hover:bg-white/20 cursor-pointer"
                title="Ask AI mentor about this specific diagram"
              >
                <MessageSquare className="size-3" />
                <span>Ask AI</span>
              </button>
              <button
                type="button"
                onClick={() => handleSnipAction("qbank")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-white/10 text-[color:var(--cream)] hover:bg-white/20 cursor-pointer"
                title="Generate clinical practice vignette from this diagram"
              >
                <HelpCircle className="size-3" />
                <span>QBank</span>
              </button>
              <button
                type="button"
                onClick={clearConfirmedSnip}
                className="p-1 rounded-full text-white/60 hover:text-rose-400 hover:bg-white/10 cursor-pointer ml-1"
                title="Clear selected area"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const handleJumpToPage = (newPage: number) => {
    const clamped = Math.max(1, Math.min(newPage, totalPages));
    isInternalScrollRef.current = true;
    visiblePageRatios.current.clear();
    visiblePageRatios.current.set(clamped, 1.0);
    activeVisiblePageRef.current = clamped;
    lastReportedPageRef.current = clamped;
    isUserScrollingRef.current = false;
    setActiveVisiblePage(clamped);

    const doc = pdfDocRef.current;
    if (doc) {
      doc.getPage(clamped).then(async (pageObj: any) => {
        try {
          const textContent = await pageObj.getTextContent();
          const pageString = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          callbacksRef.current.onPageChange?.(clamped, pageString);
        } catch {
          callbacksRef.current.onPageChange?.(clamped);
        }
      }).catch(() => {
        callbacksRef.current.onPageChange?.(clamped);
      });
    } else {
      callbacksRef.current.onPageChange?.(clamped);
    }

    const pageEl = document.getElementById(`pdf-page-container-${clamped}`);
    if (pageEl) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      pageEl.scrollIntoView({
        behavior: "smooth",
        block: scrollOrientation === "horizontal" ? "nearest" : "start",
        inline: scrollOrientation === "horizontal" ? "center" : "nearest",
      });

      scrollTimeoutRef.current = setTimeout(() => {
        isInternalScrollRef.current = false;
      }, 700);
    } else {
      isInternalScrollRef.current = false;
    }
  };

  // Keyboard arrow navigation for horizontal reading
  useEffect(() => {
    if (scrollOrientation !== "horizontal") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleJumpToPage(activeVisiblePageRef.current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleJumpToPage(activeVisiblePageRef.current + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scrollOrientation, totalPages]);

  // =========================================================================
  // VIEW RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center bg-[#1c1b21] text-[color:var(--cream)]">
        <div className="flex size-14 items-center justify-center rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip animate-pulse">
          <FileText className="size-7" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="display text-base text-[color:var(--cream)]">
            Loading Study Source PDF
          </h4>
          <p className="text-xs text-[color:var(--cream)]/65">
            Synchronizing document engine and preparing interactive canvas...
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-[color:var(--orange)]">
          <Loader2 className="size-4 animate-spin" />
          <span>Synchronizing pages</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center bg-[#1c1b21]">
        <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/30">
          <AlertCircle className="size-6" />
        </div>
        <h4 className="display text-base text-[color:var(--cream)]">
          Document Preview Unavailable
        </h4>
        <p className="max-w-md text-xs leading-relaxed text-[color:var(--cream)]/70">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden", className)}>
      {/* ================================================================= */}
      {/* COMPACT TOOLBAR: PAGE SYNC & SNIP TOOL                             */}
      {/* ================================================================= */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-black/20 bg-[#16151a] px-2 sm:px-3 text-xs text-[color:var(--cream)] z-30 gap-1 sm:gap-2 overflow-x-auto no-scrollbar flex-nowrap">
        {/* Page Jumper */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleJumpToPage(activeVisiblePage - 1)}
            disabled={activeVisiblePage <= 1}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-[color:var(--cream)] transition-colors hover:bg-white/15 disabled:opacity-30"
            title="Previous Page"
          >
            <ChevronLeft className="size-3.5" />
          </button>

          {isEditingPage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = parseInt(pageInputValue, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                  handleJumpToPage(p);
                }
                setIsEditingPage(false);
              }}
              className="flex items-center gap-1 font-mono text-[11px]"
            >
              <input
                ref={pageInputRef}
                autoFocus
                type="number"
                min={1}
                max={totalPages}
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onBlur={() => {
                  const p = parseInt(pageInputValue, 10);
                  if (!isNaN(p) && p >= 1 && p <= totalPages) {
                    handleJumpToPage(p);
                  }
                  setIsEditingPage(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingPage(false);
                  }
                }}
                className="w-12 rounded border border-[color:var(--orange)] bg-[color:var(--ink)] px-1 py-0.5 text-center font-bold text-[color:var(--orange)] outline-none shadow-inner"
              />
              <span className="opacity-40">/</span>
              <span className="opacity-70">{totalPages}</span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPageInputValue(String(activeVisiblePage));
                setIsEditingPage(true);
              }}
              className="group flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-white/10 hover:ring-1 hover:ring-[color:var(--orange)]/50"
              title="Click to jump to a page number"
            >
              <span className="font-bold text-[color:var(--orange)] underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                {activeVisiblePage}
              </span>
              <span className="opacity-40">/</span>
              <span className="opacity-70">{totalPages}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleJumpToPage(activeVisiblePage + 1)}
            disabled={activeVisiblePage >= totalPages}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-[color:var(--cream)] transition-colors hover:bg-white/15 disabled:opacity-30"
            title="Next Page"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        {/* View Mode & Fit Options (Mobile & Desktop Responsive) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Fit Width / Fit Page Controls */}
          <div className="flex items-center rounded-full border border-white/20 bg-white/5 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={handleTriggerFitWidth}
              className={cn(
                "cursor-pointer rounded-full px-1.5 sm:px-2 py-0.5 font-bold transition-all whitespace-nowrap",
                activeFitMode === "fit-width"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                  : "text-[color:var(--cream)]/70 hover:text-white"
              )}
              title="Fit to Screen Width (No Horizontal Overflow)"
            >
              <span className="sm:hidden">Width</span>
              <span className="hidden sm:inline">Fit Width</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerFitPage}
              className={cn(
                "cursor-pointer rounded-full px-1.5 sm:px-2 py-0.5 font-bold transition-all whitespace-nowrap",
                activeFitMode === "fit-page"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                  : "text-[color:var(--cream)]/70 hover:text-white"
              )}
              title="Fit Full Page to Screen"
            >
              <span className="sm:hidden">Page</span>
              <span className="hidden sm:inline">Fit Page</span>
            </button>
          </div>

          {/* Zoom In/Out Pill */}
          <div className="flex items-center rounded-full border border-white/20 bg-white/5 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={handleTriggerZoomOut}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full text-[color:var(--cream)]/80 hover:bg-white/10 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="size-2.5 sm:size-3" />
            </button>
            <button
              type="button"
              onClick={handleTriggerZoomReset}
              className="px-1 text-[9.5px] sm:text-[10px] font-mono font-bold text-[color:var(--cream)] hover:text-[color:var(--orange)] cursor-pointer"
              title="Click to reset zoom"
            >
              {activeFitMode === "normal" ? `${activeZoomLevel}%` : "Auto"}
            </button>
            <button
              type="button"
              onClick={handleTriggerZoomIn}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full text-[color:var(--cream)]/80 hover:bg-white/10 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="size-2.5 sm:size-3" />
            </button>
          </div>
        </div>

        {/* Tools: Scroll Orientation & Snip Diagram */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Scroll Orientation Toggle: Vertical vs Horizontal */}
          <button
            type="button"
            onClick={handleToggleScrollOrientation}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-bold transition-all shadow-sm",
              scrollOrientation === "horizontal"
                ? "border-[#43a08f] bg-[#43a08f]/20 text-[#7fd8c9]"
                : "border-white/15 bg-white/5 text-[color:var(--cream)] hover:border-white/30 hover:bg-white/10"
            )}
            title={`Switch to ${scrollOrientation === "vertical" ? "Horizontal" : "Vertical"
              } page scroll`}
          >
            {scrollOrientation === "horizontal" ? (
              <>
                <ArrowLeftRight className="size-3 text-[#7fd8c9]" />
                <span className="hidden sm:inline">Horizontal</span>
              </>
            ) : (
              <>
                <ArrowDownUp className="size-3 text-[color:var(--cream)]/70" />
                <span className="hidden sm:inline">Vertical</span>
              </>
            )}
          </button>

          {confirmedSnip && (
            <button
              type="button"
              onClick={clearConfirmedSnip}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer"
            >
              <Check className="size-2.5 text-amber-300" />
              <span>Diagram Selected</span>
              <X className="size-2.5 ml-0.5 opacity-70" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsSnipActive((prev) => !prev);
              setSnipStart(null);
              setSnipCurrent(null);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition-all shadow-sm",
              isSnipActive
                ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-[color:var(--ink)] animate-pulse"
                : "border-white/15 bg-white/5 text-[color:var(--cream)] hover:border-[color:var(--orange)] hover:bg-white/10"
            )}
            title="Drag a box to capture an anatomical diagram, ECG, or chart for AI analysis"
          >
            <Crop className="size-3" />
            <span>{isSnipActive ? "Cancel Snip" : "Snip Diagram"}</span>
          </button>
        </div>
      </div>

      {/* SNIP ACTIVE BANNER */}
      {isSnipActive && (
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--orange)]/40 bg-[color:var(--orange)]/15 px-3 py-1.5 text-[11px] text-[color:var(--cream)] z-30">
          <span className="flex items-center gap-1.5 font-medium">
            <Camera className="size-3 text-[color:var(--orange)]" />
            <span>Click and drag a box over any diagram, equation, or figure on the page</span>
          </span>
          <button
            type="button"
            onClick={() => setIsSnipActive(false)}
            className="rounded p-0.5 hover:bg-black/20 cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* SCROLL CONTAINER FOR PAGES                                        */}
      {/* ================================================================= */}
      <div
        ref={containerRef}
        onScroll={handleContainerScroll}
        onMouseUp={handleSelectionCheck}
        onTouchEnd={handleSelectionCheck}
        className={cn(
          "custom-scrollbar relative flex-1 transition-colors select-text",
          scrollOrientation === "horizontal"
            ? "overflow-x-auto overflow-y-hidden overscroll-x-contain p-1.5 sm:p-4 flex items-center snap-x snap-mandatory"
            : "p-1 sm:p-4 overflow-y-auto overflow-x-auto overscroll-y-contain w-full max-w-full",
          theme === "paper" && "bg-[#2b2a31]",
          theme === "ink" && "bg-[#111014]",
          isSnipActive && "cursor-crosshair select-none"
        )}
      >
        <div
          className={cn(
            "flex items-center",
            scrollOrientation === "horizontal"
              ? "flex-row flex-nowrap gap-4 h-full min-w-max px-4 py-2"
              : "flex-col w-full"
          )}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageItem
              key={pageNum}
              pageNum={pageNum}
              pdfDoc={pdfDoc}
              scale={computedScale}
              fitMode={fitMode}
              scrollOrientation={scrollOrientation}
              defaultPageSize={docPageSize}
              isSnipActive={isSnipActive}
              onSnipMouseDown={handleSnipMouseDown}
              onSnipMouseMove={handleSnipMouseMove}
              onSnipMouseUp={handleSnipMouseUp}
              renderSnipOverlay={renderSnipOverlay}
              onVisibleChange={handleVisibleChange}
              onRegisterCanvas={handleRegisterCanvas}
            />
          ))}
        </div>
      </div>

      {/* HORIZONTAL PAGE NAVIGATION ARROWS (Borders of Left Panel / Over Book) */}
      {scrollOrientation === "horizontal" && totalPages > 1 && (
        <>
          {/* Previous Page (Left Arrow) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleJumpToPage(activeVisiblePage - 1);
            }}
            disabled={activeVisiblePage <= 1}
            className={cn(
              "group/arrow absolute left-3 top-1/2 -translate-y-1/2 z-30 flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-frame transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
              activeVisiblePage <= 1 ? "opacity-0 pointer-events-none" : "opacity-90 hover:opacity-100"
            )}
            title={`Previous Page (${activeVisiblePage - 1})`}
            aria-label="Previous Page"
          >
            <ChevronLeft className="size-6 stroke-[3] transition-transform group-hover/arrow:-translate-x-0.5" />
          </button>

          {/* Next Page (Right Arrow) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleJumpToPage(activeVisiblePage + 1);
            }}
            disabled={activeVisiblePage >= totalPages}
            className={cn(
              "group/arrow absolute right-3 top-1/2 -translate-y-1/2 z-30 flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-frame transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
              activeVisiblePage >= totalPages ? "opacity-0 pointer-events-none" : "opacity-90 hover:opacity-100"
            )}
            title={`Next Page (${activeVisiblePage + 1})`}
            aria-label="Next Page"
          >
            <ChevronRight className="size-6 stroke-[3] transition-transform group-hover/arrow:translate-x-0.5" />
          </button>
        </>
      )}
    </div>
  );
}
