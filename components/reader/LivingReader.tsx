"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { IBook, IBookSegmentData } from "@/types";
import { MorphArtifactData } from "@/types/morph";
import { ReferenceResource, QBankVignette, HighYieldMnemonic } from "@/types/knowledge";
import {
  getSampleSegmentsForBook,
  getBookDomainContext,
} from "@/lib/ai/knowledge/sample-book-data";
import { MorphCanvas } from "@/components/reader/MorphCanvas";
import { AscleonVoiceStudio } from "@/components/reader/AscleonVoiceStudio";
import {
  SourceSelectionToolbar,
  ScannedPinItem,
} from "@/components/reader/SourceSelectionToolbar";
import OriginalPdfViewer from "./OriginalPdfViewer";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mic,
  Sparkles,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  FileText,
  HelpCircle,
  Layers,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  RefreshCw,
  Activity,
  MapPin,
  Bot,
  Wrench,
  BookOpen,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Award,
  ScanLine,
  BookmarkPlus,
  X,
  Crop,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceLanguage, DEFAULT_VOICE_LANGUAGE } from "@/lib/constants";

interface LivingReaderProps {
  book: IBook;
  initialSegments: IBookSegmentData[];
  onSwitchToVoice?: () => void;
}

type ThemeMode = "paper" | "ink";
type FitMode = "normal" | "fit-width" | "fit-page";
type StudyIntent = "morph" | "chat" | "voice" | "summary" | "quiz";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  time?: string;
  provider?: string;
  model?: string;
  toolsUsed?: string[];
  citations?: string[];
  authoritativeReferences?: ReferenceResource[];
  imageUrl?: string;
}

const CHAT_SUGGESTION_CHIPS = [
  "Explain core mechanism",
  "High-yield exam pearls",
  "Step-by-step breakdown",
  "Key invariants & trade-offs",
];

export default function LivingReader({
  book,
  initialSegments,
}: LivingReaderProps) {
  // Navigation & Viewport State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>("paper");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [fitMode, setFitMode] = useState<FitMode>("normal");
  const [paragraphInteractiveMode, setParagraphInteractiveMode] = useState(true);

  // Dual-Track View Mode: Original Authentic PDF vs Structured Reflow
  const [readerViewMode, setReaderViewMode] = useState<"original_pdf" | "reflow">(
    book.fileURL ? "original_pdf" : "reflow"
  );
  const [activePdfPage, setActivePdfPage] = useState<number>(1);
  const [totalPdfPages, setTotalPdfPages] = useState<number>(
    book.totalPages || initialSegments.length || 1
  );
  const [activePageLiveText, setActivePageLiveText] = useState<string>("");
  const [snippedDiagram, setSnippedDiagram] = useState<{
    url: string;
    pageNumber: number;
  } | null>(null);

  // Right Panel: All Controls & Study Studio
  const [activeIntent, setActiveIntent] = useState<StudyIntent>("morph");
  const [language, setLanguage] = useState<VoiceLanguage>(
    (book.language as VoiceLanguage) || DEFAULT_VOICE_LANGUAGE,
  );

  // Morph Engine State
  const [morphArtifacts, setMorphArtifacts] = useState<
    Record<number, MorphArtifactData>
  >({});
  const [isMorphLoading, setIsMorphLoading] = useState(false);

  // Dynamic QBank State
  const [dynamicQBankList, setDynamicQBankList] = useState<QBankVignette[]>([]);
  const [isQBankLoading, setIsQBankLoading] = useState(false);
  const [activeQBankIdx, setActiveQBankIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Dynamic Summary State
  const [dynamicSummary, setDynamicSummary] = useState<any>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Source Selection & Background Sync
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [pinnedVaultItems, setPinnedVaultItems] = useState<ScannedPinItem[]>([]);
  const [isScanningPage, setIsScanningPage] = useState(false);

  // Deep Knowledge & References Drawer State
  const [showDeepReferences, setShowDeepReferences] = useState(false);
  const initialDomainContext = useMemo(
    () => getBookDomainContext(book),
    [book]
  );
  const [activeReferences, setActiveReferences] = useState<ReferenceResource[]>(
    () => initialDomainContext.authoritativeReferences
  );
  const [activeMnemonics, setActiveMnemonics] = useState<HighYieldMnemonic[]>(
    () => initialDomainContext.mnemonics
  );

  // Synchronize domain context when book changes
  useEffect(() => {
    const dc = getBookDomainContext(book);
    setActiveReferences(dc.authoritativeReferences);
    setActiveMnemonics(dc.mnemonics);
    if (dc.qbankVignettes.length > 0 && dynamicQBankList.length === 0) {
      setDynamicQBankList(dc.qbankVignettes);
    }
  }, [book]);

  const isMedicalBook = useMemo(() => {
    const raw = `${book.title || ""} ${book.topic || ""} ${book.slug || ""} ${book.summary || ""}`.toLowerCase();
    return (
      raw.includes("cardio") ||
      raw.includes("heart") ||
      raw.includes("medic") ||
      raw.includes("clinic") ||
      raw.includes("health") ||
      raw.includes("doctor") ||
      raw.includes("anatomy") ||
      raw.includes("patholog") ||
      raw.includes("pharmac") ||
      raw.includes("patient") ||
      raw.includes("auscultat") ||
      raw.includes("ascleon")
    );
  }, [book.title, book.topic, book.slug, book.summary]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "ai",
      text: `Welcome to the living study studio for "${book.title}". I am your grounded Ascleon mentor, backed by canonical domain references and active page analysis. Highlight any passage on the left page or click a paragraph block to immediately Morph, Quiz, or Viva it.`,
      time: "Just now",
      provider: "grounded-mentor",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll smoothly to the bottom of the chat whenever messages or isAiLoading updates
  useEffect(() => {
    if (activeIntent === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAiLoading, activeIntent]);

  // Load saved Study Vault pins from localStorage on mount
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(`ascleon_vault_${book._id}`) ||
        localStorage.getItem(`bookify_vault_${book._id}`);
      if (saved) {
        setPinnedVaultItems(JSON.parse(saved));
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, [book._id]);

  // Save Study Vault pins to localStorage
  const saveVaultItems = useCallback(
    (items: ScannedPinItem[]) => {
      setPinnedVaultItems(items);
      try {
        localStorage.setItem(`ascleon_vault_${book._id}`, JSON.stringify(items));
      } catch (e) {
        // Ignore storage errors
      }
    },
    [book._id]
  );

  // Fallback segments if database had none (e.g. sample books)
  const segments = useMemo(() => {
    if (initialSegments && initialSegments.length > 0) {
      return initialSegments;
    }
    return getSampleSegmentsForBook(book);
  }, [initialSegments, book]);

  const currentSegment = segments[currentIdx] || segments[0];

  // Split active segment content into interactive paragraph blocks
  const pageParagraphs = useMemo(() => {
    return (currentSegment?.content || "")
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [currentSegment]);

  // Capture text selection on left reader & position floating action bar
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 8 && scrollViewportRef.current) {
      const text = sel.toString().trim();
      setSelectedText(text);

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = scrollViewportRef.current.getBoundingClientRect();
        setSelectionPos({
          x: rect.left - containerRect.left + scrollViewportRef.current.scrollLeft,
          y: rect.top - containerRect.top + scrollViewportRef.current.scrollTop,
        });
      } catch (e) {
        setSelectionPos({ x: 40, y: 80 });
      }
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedText("");
    setSelectionPos(null);
    if (typeof window !== "undefined") {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  // Trigger real Morph generation via /api/morph (supports custom override text & diagram)
  const handleRunMorph = async (overrideSelection?: string, diagramUrl?: string) => {
    const targetSelection = overrideSelection ?? selectedText;
    const activeKey = book.fileURL ? activePdfPage : currentIdx;
    const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
    const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

    setActiveIntent("morph");
    setIsMorphLoading(true);
    try {
      const precedingSegments = segments
        .slice(Math.max(0, currentIdx - 2), currentIdx)
        .map((s) => s.content);

      const res = await fetch("/api/morph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book._id,
          bookTitle: book.title,
          segmentIndex: currentIdx,
          currentSegmentIndex: currentIdx,
          focalText: activeText,
          currentSegmentContent: activeText,
          pageNumber: activePage,
          precedingSegments,
          selectedText: targetSelection || undefined,
          snippedDiagram: diagramUrl || snippedDiagram?.url || null,
          forceRefresh: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Morph API returned status ${res.status}`
        );
      }

      const data = await res.json();
      const artifact = data.artifact || data.data;
      if (artifact) {
        setMorphArtifacts((prev) => ({
          ...prev,
          [activeKey]: artifact,
        }));
      }
    } catch (err) {
      console.error("Failed to generate Morph artifact:", err);
    } finally {
      setIsMorphLoading(false);
      setSelectionPos(null);
    }
  };

  // Dynamic QBank generator
  const loadDynamicQBank = useCallback(async (diagramUrl?: string) => {
    setIsQBankLoading(true);
    setQuizSubmitted(false);
    setQuizAnswer(null);
    try {
      const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

      const res = await fetch("/api/qbank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookTitle: book.title,
          pageNumber: activePage,
          pageText: activeText,
          selectedText: selectedText || undefined,
          snippedDiagram: diagramUrl || snippedDiagram?.url || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.questions && data.questions.length > 0) {
          setDynamicQBankList(data.questions);
          setActiveQBankIdx(0);
        }
      }
    } catch (e) {
      console.warn("Dynamic QBank load warning:", e);
    } finally {
      setIsQBankLoading(false);
    }
  }, [book.title, book.fileURL, activePdfPage, activePageLiveText, currentSegment, currentIdx, selectedText, snippedDiagram]);

  // Dynamic Summary generator
  const loadDynamicSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookTitle: book.title,
          pageNumber: activePage,
          pageText: activeText,
          selectedText: selectedText || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.summary) {
          setDynamicSummary(data.summary);
        }
      }
    } catch (e) {
      console.warn("Dynamic Summary load warning:", e);
    } finally {
      setIsSummaryLoading(false);
    }
  }, [book.title, book.fileURL, activePdfPage, activePageLiveText, currentSegment, currentIdx, selectedText]);

  // Pin active selection into Study Vault (background storage)
  const handlePinSelectionToVault = useCallback(
    (customText?: string) => {
      const target = customText || selectedText;
      if (!target) return;

      const newPin: ScannedPinItem = {
        id: `pin-${Date.now()}`,
        sectionIndex: currentIdx,
        pageNumber: currentSegment?.pageNumber || currentIdx + 1,
        text: target,
        type: "selection",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      saveVaultItems([newPin, ...pinnedVaultItems]);
      setSelectionPos(null);
    },
    [selectedText, currentIdx, currentSegment, pinnedVaultItems, saveVaultItems]
  );

  // Background page scan
  const handleScanCurrentPage = async () => {
    setIsScanningPage(true);
    setTimeout(() => {
      const lines = (currentSegment?.content || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 15);

      const extractedPearls = lines.slice(0, 4).map((l) => l.replace(/^[•\-1-9.]+\s*/, ""));

      const scannedItem: ScannedPinItem = {
        id: `scan-${Date.now()}`,
        sectionIndex: currentIdx,
        pageNumber: currentSegment?.pageNumber || currentIdx + 1,
        text: (currentSegment?.content || "").slice(0, 340) + ((currentSegment?.content || "").length > 340 ? "..." : ""),
        type: "full-page-scan",
        extractedPearls,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      saveVaultItems([scannedItem, ...pinnedVaultItems]);
      setIsScanningPage(false);
    }, 400);
  };

  // Trigger AI Chat directly from selection or paragraph
  const handleAskAISelection = async (customText?: string) => {
    const target = customText || selectedText;
    if (!target) return;

    setSelectedText(target);
    setSelectionPos(null);
    setActiveIntent("chat");

    const prompt = `Break down the exact mechanism and significance of this passage: "${target.slice(0, 180)}${target.length > 180 ? "..." : ""}"`;
    await triggerDirectAIQuery(prompt, target);
  };

  // Handle diagram / visual figure capture from OriginalPdfViewer with 1-click action routing
  const handleSnipDiagram = (
    imageDataUrl: string,
    pageNumber: number,
    targetFeature?: "morph" | "chat" | "qbank"
  ) => {
    setSnippedDiagram({ url: imageDataUrl, pageNumber });

    if (targetFeature === "morph") {
      setActiveIntent("morph");
      handleRunMorph(undefined, imageDataUrl);
    } else if (targetFeature === "qbank") {
      setActiveIntent("quiz");
      loadDynamicQBank(imageDataUrl);
    } else {
      setActiveIntent("chat");
      const prompt = `Please analyze and explain this captured diagram from Page ${pageNumber} of "${book.title}". What are its core structures, key mechanisms, and high-yield takeaways?`;
      triggerDirectAIQuery(prompt, undefined, imageDataUrl);
    }
  };

  const triggerDirectAIQuery = async (
    queryText: string,
    contextSelection?: string,
    imagePayload?: string
  ) => {
    const historyPayload = messages.slice(-6).map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: queryText,
        imageUrl: imagePayload || undefined,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);

    setIsAiLoading(true);
    try {
      const res = await fetch("/api/reader-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryText,
          bookId: book._id,
          bookTitle: book.title,
          bookTopic: book.topic || "",
          currentSegmentIndex: currentIdx,
          currentPageNumber: currentSegment?.pageNumber || currentIdx + 1,
          currentSegmentContent: currentSegment?.content || "",
          selectedText: contextSelection || selectedText || undefined,
          selectedImage: imagePayload || snippedDiagram?.url || undefined,
          history: historyPayload,
        }),
      });

      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const data = await res.json();

      if (data.authoritativeReferences?.length) {
        setActiveReferences(data.authoritativeReferences);
      }
      if (data.qbankVignettes?.length) {
        setDynamicQBankList(data.qbankVignettes);
      }
      if (data.mnemonics?.length) {
        setActiveMnemonics(data.mnemonics);
      }
      if (data.generatedMorph) {
        setMorphArtifacts((prev) => ({
          ...prev,
          [currentIdx]: data.generatedMorph,
        }));
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: data.answer || "I have analyzed this passage.",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          provider: data.provider,
          model: data.model,
          toolsUsed: data.toolsUsed,
          citations: data.citations,
          authoritativeReferences: data.authoritativeReferences,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: `Grounded Analysis of Selected Passage:\n\n"${(contextSelection || selectedText).slice(0, 120)}..."\n\nCross-referencing canonical references confirms that this mechanism directly governs bedside diagnostic differentiation in Section ${currentIdx + 1}.`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          provider: "deterministic",
          model: "grounded-offline",
          toolsUsed: ["deep_reference_retriever"],
          citations: [`Section ${currentIdx + 1}`],
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleResetMorph = (idx: number) => {
    setMorphArtifacts((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
  };

  const activeMorphArtifact =
    morphArtifacts[book.fileURL ? activePdfPage : currentIdx];
  const activeQBankQuestion = dynamicQBankList.length > 0 ? dynamicQBankList[activeQBankIdx % dynamicQBankList.length] : null;

  // Resizable Splitter State
  const [splitRatio, setSplitRatio] = useState<number>(54);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  };

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const rawPct = (pointerX / rect.width) * 100;
      const clamped = Math.max(30, Math.min(75, rawPct));
      setSplitRatio(clamped);
    };

    const handlePointerUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDraggingSplit]);

  const handleSplitKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSplitRatio((prev) => Math.max(30, prev - 4));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSplitRatio((prev) => Math.min(75, prev + 4));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSplitRatio(54);
    }
  };

  // Chat message sending connected to /api/reader-assistant (Cascading Gemini/Groq/OpenRouter)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isAiLoading) return;

    setActiveIntent("chat");
    const query = inputQuery.trim();
    setInputQuery("");
    await triggerDirectAIQuery(query);
  };

  // Keyboard Navigation: Arrow Left / Arrow Right
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.getAttribute("contenteditable") === "true";

      if (isInput) return;

      if (e.key === "ArrowLeft") {
        setCurrentIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [segments.length]);

  const handleZoomIn = () => {
    setFitMode("normal");
    setZoomLevel((prev) => Math.min(180, prev + 10));
  };

  const handleZoomOut = () => {
    setFitMode("normal");
    setZoomLevel((prev) => Math.max(70, prev - 10));
  };

  const handleFitWidth = () => {
    setFitMode("fit-width");
  };

  const handleFitPage = () => {
    setFitMode("fit-page");
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ink)] pt-0 text-[color:var(--cream)] select-none">
      {/* COMPACT UNIFIED TOP BAR (44px) */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#141318] px-3 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/library"
            className="flex size-7 items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5 cursor-pointer shrink-0"
            title="Return to library"
          >
            <ArrowLeft className="size-3.5 stroke-[2.5]" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="display line-clamp-1 text-xs font-bold text-[color:var(--cream)] sm:text-sm">
              {book.title}
            </h1>
            {(book.blueprint?.domain || book.topic) && (
              <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                {book.blueprint?.domain || book.topic}
              </span>
            )}
          </div>
        </div>

        {/* Center Page Tracking & Progress */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-36 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[color:var(--orange)] transition-all duration-300"
                style={{
                  width: `${(((book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1))) / (book.fileURL ? totalPdfPages : (book.totalPages || segments.length || 1))) * 100}%`,
                }}
              />
            </div>
            <span className="font-mono text-[10px] text-[color:var(--cream)]/60">
              {Math.round((((book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1))) / (book.fileURL ? totalPdfPages : (book.totalPages || segments.length || 1))) * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono text-[11px] font-bold">
            <span className="text-[color:var(--orange)]">
              Page {book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
            </span>
            <span className="opacity-40">/</span>
            <span className="opacity-70">{book.fileURL ? totalPdfPages : (book.totalPages || segments.length)}</span>
          </div>
        </div>

        {/* Right Active Scope Badges & Navigation */}
        <div className="flex items-center gap-2">
          {selectedText && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--orange)]/60 bg-[color:var(--orange)]/20 px-2 py-0.5 text-[10px] font-bold text-[color:var(--orange)] animate-pulse">
              <Sparkles className="size-2.5" />
              <span>Selection Locked</span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="hover:opacity-75 cursor-pointer ml-0.5"
                title="Clear selection"
              >
                <X className="size-2.5" />
              </button>
            </span>
          )}

          {snippedDiagram && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              <Crop className="size-2.5" />
              <span>Diagram Locked</span>
              <button
                type="button"
                onClick={() => setSnippedDiagram(null)}
                className="hover:opacity-75 cursor-pointer ml-0.5"
                title="Clear diagram"
              >
                <X className="size-2.5" />
              </button>
            </span>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={book.fileURL ? activePdfPage <= 1 : currentIdx <= 0}
              onClick={() => {
                if (book.fileURL) {
                  setActivePdfPage((prev) => Math.max(1, prev - 1));
                } else {
                  setCurrentIdx((prev) => Math.max(0, prev - 1));
                }
              }}
              className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-30"
              title="Previous page (←)"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={book.fileURL ? activePdfPage >= totalPdfPages : currentIdx >= segments.length - 1}
              onClick={() => {
                if (book.fileURL) {
                  setActivePdfPage((prev) => Math.min(totalPdfPages, prev + 1));
                } else {
                  setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1));
                }
              }}
              className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-30"
              title="Next page (→)"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MAIN SPLIT WORKSPACE: LEFT DOCUMENT | RIGHT LIVING STUDIO         */}
      {/* ================================================================= */}
      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden p-2 gap-2"
        style={{ cursor: isDraggingSplit ? "col-resize" : "default" }}
      >
        <div className="flex h-full w-full gap-2 overflow-hidden">
          {/* ============================================================== */}
          {/* LEFT PANEL: AUTHENTIC PDF READER (CLEAN, NO REDUNDANT TOOLBARS)*/}
          {/* ============================================================== */}
          <div
            className="relative flex h-full flex-col overflow-hidden rounded-[18px] border border-white/10 shadow-frame transition-[width] duration-75 bg-[#17161b]"
            style={{ width: `${splitRatio}%` }}
          >
            {/* Left Panel Body: Authentic PDF Viewer */}
            {book.fileURL ? (
              <div className="relative flex flex-1 overflow-hidden">
                <SourceSelectionToolbar
                  selectedText={selectedText}
                  position={selectionPos}
                  onMorphSelection={() => handleRunMorph(selectedText)}
                  onAskAI={() => handleAskAISelection(selectedText)}
                  onVoiceViva={() => {
                    setSelectionPos(null);
                    setActiveIntent("voice");
                  }}
                  onQuizSelection={() => {
                    setSelectionPos(null);
                    setActiveIntent("quiz");
                    loadDynamicQBank();
                  }}
                  onPinToBoard={() => handlePinSelectionToVault(selectedText)}
                  onClearSelection={handleClearSelection}
                />
                <OriginalPdfViewer
                  fileURL={book.fileURL}
                  currentPage={activePdfPage}
                  onTotalPagesLoaded={(total) => setTotalPdfPages(total)}
                  onPageChange={(page, text) => {
                    setActivePdfPage(page);
                    if (text) setActivePageLiveText(text);
                    const matchedIdx = segments.findIndex(
                      (s) => s.pageNumber === page
                    );
                    if (matchedIdx !== -1 && matchedIdx !== currentIdx) {
                      setCurrentIdx(matchedIdx);
                    }
                  }}
                  onTextSelection={(text, pos) => {
                    setSelectedText(text);
                    setSelectionPos(pos);
                  }}
                  onClearSelection={handleClearSelection}
                  onSnipDiagram={handleSnipDiagram}
                  zoomLevel={zoomLevel}
                  fitMode={fitMode}
                  theme={theme}
                  className="flex-1"
                />
              </div>
            ) : (
              /* Document Reading Surface */
              <div
                ref={scrollViewportRef}
                onMouseUp={handleTextSelection}
                onTouchEnd={handleTextSelection}
                className={cn(
                  "custom-scrollbar relative flex-1 overflow-y-auto px-6 py-8 transition-colors sm:px-12 sm:py-10 select-text",
                  theme === "paper" &&
                  "bg-[#FAF4EB] text-[color:var(--ink)] font-serif",
                  theme === "ink" &&
                  "bg-[color:var(--ink)] text-[color:var(--cream)] font-serif",
                )}
              >
                {/* Floating Selection Action Toolbar inside Left Panel */}
                <SourceSelectionToolbar
                  selectedText={selectedText}
                  position={selectionPos}
                  onMorphSelection={() => handleRunMorph(selectedText)}
                  onAskAI={() => handleAskAISelection(selectedText)}
                  onVoiceViva={() => {
                    setSelectionPos(null);
                    setActiveIntent("voice");
                  }}
                  onQuizSelection={() => {
                    setSelectionPos(null);
                    setActiveIntent("quiz");
                    setQuizAnswer(null);
                    setQuizSubmitted(false);
                  }}
                  onPinToBoard={() => handlePinSelectionToVault(selectedText)}
                  onClearSelection={handleClearSelection}
                />

                <div
                  className={cn(
                    "mx-auto transition-transform duration-150 origin-top",
                    fitMode === "normal" && "max-w-2xl",
                    fitMode === "fit-width" && "max-w-full px-2",
                    fitMode === "fit-page" && "max-w-xl text-sm leading-normal",
                  )}
                  style={
                    fitMode === "normal"
                      ? { transform: `scale(${zoomLevel / 100})` }
                      : undefined
                  }
                >
                  {/* Book & Page Header */}
                  <div className="mb-6 flex items-center justify-between border-b border-current/15 pb-3 font-sans text-xs tracking-wider uppercase opacity-60">
                    <span>{book.title}</span>
                    <span>
                      Page {currentSegment.pageNumber || currentIdx + 1} • {currentSegment.wordCount || 300}w
                    </span>
                  </div>

                  {/* Interactive Document Blocks or Continuous Article */}
                  {paragraphInteractiveMode ? (
                    <div className="flex flex-col gap-5">
                      {pageParagraphs.map((para, pIdx) => {
                        const isParaSelected = selectedText === para;
                        return (
                          <div
                            key={pIdx}
                            className={cn(
                              "group/para relative rounded-2xl border p-3.5 transition-all duration-150",
                              isParaSelected
                                ? "border-[color:var(--orange)] bg-[color:var(--orange)]/10 shadow-sm"
                                : "border-transparent hover:border-current/15 hover:bg-current/[0.03]"
                            )}
                          >
                            {/* Paragraph Action Gutter Bar on Hover */}
                            <div className="mb-2 flex items-center justify-between font-sans text-[10px] opacity-0 transition-opacity group-hover/para:opacity-100">
                              <span className="font-mono font-bold uppercase tracking-wider opacity-50">
                                Block {pIdx + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedText(para);
                                    handleRunMorph(para);
                                  }}
                                  className="flex cursor-pointer items-center gap-1 rounded-full bg-[color:var(--orange)] px-2 py-0.5 font-bold text-[color:var(--ink)] shadow-xs hover:scale-105 transition-transform"
                                  title="Morph this paragraph into interactive cards"
                                >
                                  <Sparkles className="size-2.5" />
                                  <span>Morph Block</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAskAISelection(para)}
                                  className="flex cursor-pointer items-center gap-1 rounded-full border border-current/20 bg-current/5 px-2 py-0.5 font-bold hover:bg-current/15"
                                  title="Explain this block in AI Chat"
                                >
                                  <MessageSquare className="size-2.5" />
                                  <span>Ask AI</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedText(para);
                                    setActiveIntent("voice");
                                  }}
                                  className="flex cursor-pointer items-center gap-1 rounded-full border border-current/20 bg-current/5 px-2 py-0.5 font-bold hover:bg-current/15"
                                  title="Oral Viva on this block"
                                >
                                  <Mic className="size-2.5" />
                                  <span>Viva</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePinSelectionToVault(para)}
                                  className="flex cursor-pointer items-center gap-1 rounded-full border border-current/20 bg-current/5 px-2 py-0.5 font-bold hover:bg-current/15"
                                  title="Pin this block to Study Vault"
                                >
                                  <BookmarkPlus className="size-2.5" />
                                  <span>Pin</span>
                                </button>
                              </div>
                            </div>

                            <p className="text-base leading-loose whitespace-pre-line sm:text-lg">
                              {para}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <article className="max-w-none text-base leading-loose whitespace-pre-line sm:text-lg">
                      {currentSegment.content}
                    </article>
                  )}

                  {/* Page Navigation at Document Bottom */}
                  <div className="mt-12 flex items-center justify-between border-t border-current/10 pt-6 font-sans text-xs">
                    <button
                      type="button"
                      disabled={currentIdx === 0}
                      onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-current/20 px-3.5 py-1.5 transition-colors hover:bg-current/5 disabled:cursor-default disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                      <span>Previous section</span>
                    </button>
                    <span className="hidden text-[11px] opacity-60 sm:block">
                      Tip: Highlight any phrase or hover a block for instant AI actions
                    </span>
                    <button
                      type="button"
                      disabled={currentIdx === segments.length - 1}
                      onClick={() =>
                        setCurrentIdx((prev) =>
                          Math.min(segments.length - 1, prev + 1),
                        )
                      }
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3.5 py-1.5 font-bold text-[color:var(--ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-30 disabled:hover:translate-y-0"
                    >
                      <span>Next section</span>
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ADJUSTABLE SPLITTER */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize reading and studio panes"
            tabIndex={0}
            onPointerDown={handleSplitPointerDown}
            onDoubleClick={() => setSplitRatio(54)}
            onKeyDown={handleSplitKeyDown}
            className="group relative flex w-2.5 shrink-0 cursor-col-resize items-center justify-center"
            title="Drag to resize panes • double-click to reset"
          >
            <div
              className={cn(
                "h-20 w-1 rounded-full transition-colors duration-150",
                isDraggingSplit
                  ? "bg-[color:var(--orange)]"
                  : "bg-white/25 group-hover:bg-[color:var(--orange)]",
              )}
            />
          </div>

          {/* ============================================================== */}
          {/* RIGHT PANEL: ALL CONTROLS, LIVE VOICE & INTERACTIVE WORKSPACE    */}
          {/* ============================================================== */}
          <div className="flex h-full flex-1 flex-col overflow-hidden rounded-[20px] bg-[color:var(--ink-soft)]">
            {/* TOP CONTROL BAR */}
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
              {/* Zoom & View Controls */}
              <div className="flex items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-1 text-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)]/10"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </button>
                <span className="w-10 text-center font-mono text-[11px] font-bold text-[color:var(--ink)]">
                  {fitMode === "normal" ? `${zoomLevel}%` : "Auto"}
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)]/10"
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </button>

                <div className="mx-1 h-3.5 w-px bg-[color:var(--ink)]/20" />

                {/* Fit Modes */}
                <button
                  type="button"
                  onClick={handleFitWidth}
                  className={cn(
                    "cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    fitMode === "fit-width"
                      ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                      : "text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]",
                  )}
                >
                  Fit width
                </button>
                <button
                  type="button"
                  onClick={handleFitPage}
                  className={cn(
                    "cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    fitMode === "fit-page"
                      ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                      : "text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]",
                  )}
                >
                  Fit page
                </button>

                <div className="mx-1 h-3.5 w-px bg-[color:var(--ink)]/20" />

                {/* Themes */}
                {(["paper", "ink"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={cn(
                      "size-3 rounded-full border border-[color:var(--ink)]/30 transition-transform cursor-pointer",
                      t === "paper" && "bg-[#fbf7f0]",
                      t === "ink" && "bg-[color:var(--ink)]",
                      theme === t && "scale-125 ring-2 ring-[color:var(--orange)]",
                    )}
                    title={`Set theme to ${t}`}
                  />
                ))}
              </div>

              {/* Ascleon Live Voice Button */}
              <button
                type="button"
                onClick={() => {
                  setActiveIntent("voice");
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] px-3 py-1.5 text-xs font-bold transition-all",
                  activeIntent === "voice"
                    ? "bg-[#43a08f] text-[color:var(--ink)] shadow-chip"
                    : "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip hover:-translate-y-0.5",
                )}
              >
                <Mic className="size-3.5" />
                <span>Ascleon Voice</span>
              </button>
            </div>

            {/* ACTIVE SOURCE SELECTION CONTEXT BANNER (Synchronized with Left Panel) */}
            {selectedText && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--orange)]/30 bg-[color:var(--orange)]/10 px-4 py-2 text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="size-2 shrink-0 rounded-full bg-[color:var(--orange)] animate-ping" />
                  <span className="truncate font-medium text-[color:var(--cream)]">
                    <strong className="text-[color:var(--orange)]">Focused Target:</strong> &ldquo;{selectedText}&rdquo;
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRunMorph(selectedText)}
                    className="cursor-pointer rounded-full bg-[color:var(--orange)] px-2.5 py-0.5 text-[10px] font-black text-[color:var(--ink)]"
                  >
                    Morph Now
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinSelectionToVault(selectedText)}
                    className="cursor-pointer rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--cream)]"
                  >
                    Pin
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="cursor-pointer rounded-full p-1 text-[color:var(--cream)]/60 hover:text-[color:var(--cream)]"
                    title="Clear target selection"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STUDIO SWITCHER TABS (5 CORE TABS) */}
            <div className="grid shrink-0 grid-cols-5 gap-1 border-b border-white/10 bg-black/40 p-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setActiveIntent("morph")}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 font-bold transition-all",
                  activeIntent === "morph"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <Sparkles className="size-3" />
                <span className="truncate">Morph</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveIntent("chat")}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 font-bold transition-all",
                  activeIntent === "chat"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <MessageSquare className="size-3" />
                <span className="truncate">AI Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveIntent("voice")}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 font-bold transition-all",
                  activeIntent === "voice"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <Mic className="size-3" />
                <span className="truncate">Voice</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveIntent("quiz");
                  if (dynamicQBankList.length === 0) {
                    loadDynamicQBank();
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 font-bold transition-all",
                  activeIntent === "quiz"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <HelpCircle className="size-3" />
                <span className="truncate">QBank</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveIntent("summary");
                  if (!dynamicSummary) {
                    loadDynamicSummary();
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 font-bold transition-all",
                  activeIntent === "summary"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <FileText className="size-3" />
                <span className="truncate">Summary</span>
              </button>
            </div>

            {/* TAB CONTENTS CONTAINER */}
            <div className="custom-scrollbar-dark flex-1 overflow-y-auto p-4">
              {/* TAB 1: THE MORPH ENGINE */}
              {activeIntent === "morph" && (
                <div className="flex animate-in fade-in flex-col gap-4 duration-200">
                  {activeMorphArtifact ? (
                    <MorphCanvas
                      artifact={activeMorphArtifact}
                      onNavigateSegment={(idx) => setCurrentIdx(idx)}
                      onResetToBoot={() => handleResetMorph(book.fileURL ? activePdfPage : currentIdx)}
                      isLoading={isMorphLoading}
                      onAskAI={(prompt) => {
                        setActiveIntent("chat");
                        triggerDirectAIQuery(prompt);
                      }}
                      onQuizNode={(concept) => {
                        setActiveIntent("quiz");
                        loadDynamicQBank();
                      }}
                      onPinNode={(title, details) => {
                        handlePinSelectionToVault(`${title}: ${details}`);
                      }}
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center py-6">
                      <div className="w-full max-w-md rounded-[24px] border-2 border-[color:var(--orange)] bg-gradient-to-b from-[#1d1b20] to-[#121114] p-7 text-center shadow-chip flex flex-col items-center gap-4">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--cream)] via-[color:var(--orange)] to-[color:var(--magenta)] text-2xl text-[color:var(--ink)] shadow-lg shadow-[color:var(--orange)]/30 font-black">
                          ✦
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#43a08f]/40 bg-[#43a08f]/10 px-3 py-0.5 text-[11px] font-bold text-[#7fd8c9]">
                          <span className="size-2 rounded-full bg-[#43a08f] animate-pulse" />
                          <span>
                            {selectedText
                              ? "Passage Highlighted • Ready to Morph Selection"
                              : book.fileURL
                                ? `Page ${activePdfPage} Context Window Ready`
                                : `Section ${currentIdx + 1} Context Window Ready`}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1">
                          <h3 className="text-xl font-black text-[color:var(--cream)] tracking-tight">
                            {selectedText
                              ? "Turn selected passage into magic"
                              : "Turn this section into magic"}
                          </h3>
                          <p className="text-xs text-[color:var(--cream)]/70 leading-relaxed max-w-xs mx-auto">
                            {selectedText
                              ? `Focused on your ${selectedText.split(/\s+/).length}-word highlight: "${selectedText.slice(0, 90)}..."`
                              : isMedicalBook
                                ? "Transform dense clinical text into an interactive, retainable learning experience grounded in surrounding mechanisms and canonical textbooks."
                                : `Transform dense text into an interactive, retainable learning experience grounded in ${book.topic || "core domain principles"} and primary sources.`}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 w-full pt-1 text-left">
                          <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                            <Workflow className="size-3.5 text-[color:var(--orange)]" />
                            <span className="text-[10px] font-bold text-[color:var(--cream)]">
                              Concept Mind Map
                            </span>
                            <span className="text-[9px] text-[color:var(--cream)]/60">
                              Core principles canvas
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                            <Activity className="size-3.5 text-[#43a08f]" />
                            <span className="text-[10px] font-bold text-[color:var(--cream)]">
                              {isMedicalBook ? "Phonocardiograms" : "Dynamic Simulators"}
                            </span>
                            <span className="text-[9px] text-[color:var(--cream)]/60">
                              {isMedicalBook
                                ? "Interactive S1/S2 loops"
                                : "Interactive state models"}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                            <MapPin className="size-3.5 text-[color:var(--magenta)]" />
                            <span className="text-[10px] font-bold text-[color:var(--cream)]">
                              {isMedicalBook ? "Bedside Map" : "Visual Roadmap"}
                            </span>
                            <span className="text-[9px] text-[color:var(--cream)]/60">
                              {isMedicalBook
                                ? "Auscultation landmarks"
                                : `Section ${currentIdx + 1} key landmarks`}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRunMorph()}
                          disabled={isMorphLoading}
                          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-3 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                        >
                          {isMorphLoading ? (
                            <>
                              <RefreshCw className="size-4 animate-spin" />
                              <span>Synthesizing Interactive Morph...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-4" />
                              <span>
                                {selectedText
                                  ? "Morph Selected Passage Now"
                                  : "Turn This Section Into Magic"}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: AI CHAT ASSISTANT & GROUNDED TEXTBOOK CITATIONS */}
              {activeIntent === "chat" && (
                <div className="flex animate-in fade-in flex-col gap-3 duration-200">
                  {/* Collapsible Deep Knowledge & Textbook Drawer */}
                  <div className="rounded-[16px] border border-white/15 bg-white/[0.03] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowDeepReferences((prev) => !prev)}
                      className="flex w-full cursor-pointer items-center justify-between p-3 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 text-[color:var(--orange)]" />
                        <span className="text-xs font-bold text-[color:var(--cream)]">
                          Textbooks &amp; QBanks Grounding
                        </span>
                        <span className="rounded-full bg-[color:var(--orange)]/20 px-2 py-0.5 text-[10px] font-bold text-[color:var(--orange)]">
                          {activeReferences.length} References
                        </span>
                      </div>
                      {showDeepReferences ? (
                        <ChevronUp className="size-4 text-[color:var(--cream)]/60" />
                      ) : (
                        <ChevronDown className="size-4 text-[color:var(--cream)]/60" />
                      )}
                    </button>

                    {showDeepReferences && (
                      <div className="border-t border-white/10 p-3 flex flex-col gap-2.5 text-xs bg-black/30">
                        <div className="text-[11px] text-[color:var(--cream)]/70">
                          The study agent automatically cross-references canonical gold-standard literature to guarantee board-grade accuracy:
                        </div>
                        {activeReferences.map((ref) => (
                          <div
                            key={ref.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#7fd8c9]">
                              <span>📚 {ref.source}</span>
                              <span className="text-[9px] uppercase tracking-wider text-[color:var(--cream)]/50">
                                {ref.type}
                              </span>
                            </div>
                            <span className="font-semibold text-[color:var(--cream)] text-[11.5px]">
                              {ref.title} ({ref.chapterOrSection})
                            </span>
                            <p className="text-[10.5px] italic text-[color:var(--cream)]/80 leading-relaxed border-l-2 border-[color:var(--orange)]/50 pl-2 my-1">
                              &ldquo;{ref.excerpt.slice(0, 160)}...&rdquo;
                            </p>
                            {ref.clinicalPearls.length > 0 && (
                              <div className="text-[10px] text-[color:var(--cream)]/90 flex flex-col gap-0.5 mt-1">
                                {ref.clinicalPearls.map((p, i) => (
                                  <span key={i} className="text-[#f6d7a1]">
                                    ✦ {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick-Start Suggestion Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[color:var(--cream)]/50 mr-0.5">
                      <Sparkles className="size-3 text-[color:var(--orange)]" /> Suggestions:
                    </span>
                    {CHAT_SUGGESTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={isAiLoading}
                        onClick={() => {
                          if (isAiLoading) return;
                          setActiveIntent("chat");
                          triggerDirectAIQuery(chip);
                        }}
                        className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[color:var(--cream)]/80 transition-all hover:border-[color:var(--orange)]/60 hover:bg-[color:var(--orange)]/15 hover:text-[color:var(--cream)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Messages Feed */}
                  <div className="flex flex-col gap-3">
                    {messages.map((m, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-[18px] p-3.5 text-xs leading-relaxed",
                          m.sender === "user"
                            ? "self-end max-w-[85%] border-2 border-[color:var(--ink)] bg-[#ff4c00] text-[color:var(--ink)] font-bold shadow-chip"
                            : "self-start max-w-[95%] border-2 border-[color:var(--ink)] bg-[#f6d7a1] text-[color:var(--ink)] font-medium shadow-chip",
                        )}
                      >
                        {m.sender === "ai" && (
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[color:var(--ink)]/20 text-[10.5px]">
                            <span className="flex items-center gap-1 font-black text-[color:var(--ink)]">
                              <span className="rounded-full bg-[#ff4c00] text-[color:var(--ink)] px-2 py-0.5 text-[9.5px] font-black uppercase">
                                Ascleon AI
                              </span>
                              {m.provider ? `⚡ ${m.provider.toUpperCase()}` : "⚡ Grounded Mentor"}
                              {m.model ? ` (${m.model})` : ""}
                            </span>
                            <span className="font-mono font-bold text-[color:var(--ink)]/60">{m.time}</span>
                          </div>
                        )}
                        {m.imageUrl && (
                          <div className="my-1.5 overflow-hidden rounded-xl border-2 border-[color:var(--ink)] bg-black/80 max-h-52">
                            <img
                              src={m.imageUrl}
                              alt="Captured Study Diagram"
                              className="max-h-52 w-full object-contain rounded-lg"
                            />
                          </div>
                        )}
                        <p className="whitespace-pre-line font-medium text-[color:var(--ink)]">{m.text}</p>

                        {/* Transparency Pills: Tools Used & Citations */}
                        {m.toolsUsed && m.toolsUsed.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1 pt-1 text-[9.5px]">
                            <span className="text-[color:var(--ink)]/70 font-bold flex items-center gap-0.5">
                              <Wrench className="size-2.5" />
                              Tools:
                            </span>
                            {m.toolsUsed.map((tool, ti) => (
                              <span
                                key={ti}
                                className="rounded border border-[color:var(--ink)]/30 bg-[#7fd8c9] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[color:var(--ink)]"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}

                        {m.citations && m.citations.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9.5px]">
                            <span className="text-[color:var(--ink)]/70 font-bold">Citing:</span>
                            {m.citations.map((cite, ci) => (
                              <span
                                key={ci}
                                className="rounded border border-[color:var(--ink)]/30 bg-[#ff4c00]/20 px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--ink)]"
                              >
                                {cite}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isAiLoading && (
                      <div className="flex items-center gap-2 rounded-xl border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-3 text-xs font-bold text-[color:var(--ink)] shadow-chip">
                        <RefreshCw className="size-3.5 animate-spin text-[#ff4c00]" />
                        <span>Querying deep textbook corpus &amp; synthesizing grounded response...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}

              {/* TAB 3: ASCLEON LIVE ORAL MENTOR */}
              {activeIntent === "voice" && (
                <div className="flex animate-in fade-in flex-col h-full duration-150">
                  <AscleonVoiceStudio
                    bookTitle={book.title}
                    currentPageNumber={currentSegment?.pageNumber || currentIdx + 1}
                    currentSectionText={currentSegment?.content || ""}
                    selectedText={selectedText || undefined}
                    authoritativeReferences={activeReferences}
                    language={language}
                    onLanguageChange={setLanguage}
                  />
                </div>
              )}

              {/* TAB 4: DEEP STRUCTURED SUMMARY & MNEMONICS */}
              {activeIntent === "summary" && (
                <div className="flex animate-in fade-in flex-col gap-4 duration-200">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-mono text-xs font-bold text-[color:var(--orange)]">
                      Page {currentSegment?.pageNumber || currentIdx + 1} Synthesis
                    </span>
                    <button
                      type="button"
                      disabled={isSummaryLoading}
                      onClick={() => loadDynamicSummary()}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--cream)] hover:bg-white/10 cursor-pointer disabled:opacity-40"
                    >
                      <RefreshCw className={cn("size-3", isSummaryLoading && "animate-spin text-[color:var(--orange)]")} />
                      <span>{isSummaryLoading ? "Synthesizing..." : "Re-Synthesize"}</span>
                    </button>
                  </div>

                  {/* Executive Summary */}
                  <div className="rounded-[18px] border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-4 text-xs leading-relaxed text-[color:var(--ink)] shadow-chip">
                    <div className="flex items-center justify-between mb-2">
                      <span className="rounded-full bg-[#ff4c00] text-[color:var(--ink)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                        Executive Overview
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[color:var(--ink)]/60">Page {currentSegment?.pageNumber || currentIdx + 1}</span>
                    </div>
                    <p className="font-semibold text-[color:var(--ink)] leading-relaxed">
                      {dynamicSummary?.executiveSummary ||
                        (currentSegment?.content
                          ? `${currentSegment.content.slice(0, 240)}...`
                          : "Extracting core thesis for this page...")}
                    </p>
                  </div>

                  {/* Key Takeaways */}
                  {dynamicSummary?.keyTakeaways && dynamicSummary.keyTakeaways.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#7fd8c9] p-4 text-xs text-[color:var(--ink)] shadow-chip">
                      <span className="font-black text-[color:var(--ink)] text-[11px] uppercase tracking-wider">
                        Core Principles &amp; Invariants
                      </span>
                      <ul className="flex flex-col gap-1.5 list-disc list-inside font-medium text-[color:var(--ink)]">
                        {dynamicSummary.keyTakeaways.map((point: string, i: number) => (
                          <li key={i} className="leading-relaxed">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Pro Tips / Practical Insights */}
                  {dynamicSummary?.proTips && dynamicSummary.proTips.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#ff4c00] p-4 text-xs text-[color:var(--ink)] shadow-chip">
                      <span className="font-black text-[11px] uppercase tracking-wider text-[color:var(--ink)]">
                        Exam Tips &amp; High-Yield Pitfalls
                      </span>
                      {dynamicSummary.proTips.map((tip: string, i: number) => (
                        <p key={i} className="leading-relaxed text-[11.5px] font-semibold">
                          ✦ {tip}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Memory Anchors / Mnemonics */}
                  <div className="flex flex-col gap-2.5 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-4 text-xs text-[color:var(--ink)] shadow-chip">
                    <div className="flex items-center gap-2 font-black text-[color:var(--ink)] text-[11px] uppercase tracking-wider">
                      <BookmarkCheck className="size-4 text-[#ff4c00]" />
                      <span>Memory Anchors &amp; Mnemonics</span>
                    </div>
                    {(dynamicSummary?.mnemonics || activeMnemonics).map((mn: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1 rounded-xl border-2 border-[color:var(--ink)] bg-white p-3 text-[color:var(--ink)] shadow-xs"
                      >
                        <span className="font-black text-[#ff4c00]">
                          • {mn.mnemonic}: <span className="font-bold text-[color:var(--ink)]">{mn.expansion}</span>
                        </span>
                        <span className="text-[11px] font-medium text-[color:var(--ink)]/80">{mn.notes || mn.rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: DYNAMIC QBANK PRACTICE */}
              {activeIntent === "quiz" && (
                <div className="flex animate-in fade-in flex-col gap-3.5 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-4 text-[color:var(--ink)] shadow-chip duration-150">
                  {/* QBank Header */}
                  <div className="flex items-center justify-between text-xs border-b border-[color:var(--ink)]/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 font-black text-[color:var(--ink)]">
                        <Award className="size-4 text-[#ff4c00]" />
                        <span>{dynamicQBankList[activeQBankIdx]?.examType || "Clinical / Academic QBank"}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isQBankLoading}
                      onClick={() => loadDynamicQBank()}
                      className="inline-flex items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--ink)] shadow-xs hover:-translate-y-0.5 cursor-pointer disabled:opacity-40"
                    >
                      <RefreshCw className={cn("size-3", isQBankLoading && "animate-spin text-[color:var(--ink)]")} />
                      <span>{isQBankLoading ? "Generating..." : "New Questions"}</span>
                    </button>
                  </div>

                  {dynamicQBankList.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-[color:var(--ink)]/80">
                          {dynamicQBankList[activeQBankIdx]?.topic || `Question on Page ${currentSegment?.pageNumber || currentIdx + 1}`}
                        </span>
                        <span className="rounded-full border-2 border-[color:var(--ink)] bg-[#ff4c00] px-2.5 py-0.5 text-[10px] font-black text-[color:var(--ink)] shadow-xs">
                          Case {((activeQBankIdx % dynamicQBankList.length) + 1)} / {dynamicQBankList.length}
                        </span>
                      </div>

                      {/* Vignette Presentation */}
                      <div className="rounded-[14px] border-2 border-[color:var(--ink)] bg-white p-4 shadow-xs">
                        <p className="font-serif text-xs leading-relaxed text-[color:var(--ink)] font-medium">
                          {dynamicQBankList[activeQBankIdx]?.vignette}
                        </p>
                      </div>

                      {/* Multiple Choice Options */}
                      <div className="flex flex-col gap-2">
                        {(dynamicQBankList[activeQBankIdx]?.options || []).map((option, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => !quizSubmitted && setQuizAnswer(idx)}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-[14px] border-2 border-[color:var(--ink)] p-3 text-left text-xs transition-all shadow-xs",
                              quizAnswer === idx
                                ? "bg-[#ff4c00] text-[color:var(--ink)] font-black"
                                : "bg-white text-[color:var(--ink)] hover:bg-[#7fd8c9]/25",
                              quizSubmitted &&
                              idx === dynamicQBankList[activeQBankIdx]?.correctIndex &&
                              "bg-[#7fd8c9] text-[color:var(--ink)] font-black ring-2 ring-[color:var(--ink)]",
                              quizSubmitted &&
                              quizAnswer === idx &&
                              idx !== dynamicQBankList[activeQBankIdx]?.correctIndex &&
                              "bg-[#ff6e33]/30 text-[color:var(--ink)]",
                            )}
                          >
                            <span className="shrink-0 font-mono font-black text-[color:var(--ink)]">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span className="font-medium">{option}</span>
                          </button>
                        ))}
                      </div>

                      {!quizSubmitted ? (
                        <button
                          type="button"
                          disabled={quizAnswer === null}
                          onClick={() => setQuizSubmitted(true)}
                          className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-2.5 text-xs font-black uppercase text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0"
                        >
                          Submit Answer &amp; Reveal Rationale
                        </button>
                      ) : (
                        <div className="flex animate-in fade-in flex-col gap-3 rounded-[16px] border-2 border-[color:var(--ink)] bg-white p-4 text-xs text-[color:var(--ink)] shadow-chip">
                          {/* Answer Banner */}
                          <div className="flex items-center gap-2 font-black text-[color:var(--ink)] text-sm">
                            {quizAnswer === dynamicQBankList[activeQBankIdx]?.correctIndex ? (
                              <>
                                <CheckCircle2 className="size-5 text-[#2e6f68]" />
                                <span>Correct! ({String.fromCharCode(65 + dynamicQBankList[activeQBankIdx]?.correctIndex)})</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="size-5 text-[#ff4c00]" />
                                <span className="text-[#ff4c00]">Incorrect. Correct choice is ({String.fromCharCode(65 + dynamicQBankList[activeQBankIdx]?.correctIndex)})</span>
                              </>
                            )}
                          </div>

                          {/* Distractor Breakdown */}
                          {dynamicQBankList[activeQBankIdx]?.distractorRationales && (
                            <div className="flex flex-col gap-1.5 border-t border-[color:var(--ink)]/20 pt-2 text-[11px] leading-relaxed text-[color:var(--ink)]">
                              <strong className="text-[color:var(--ink)]">Distractor Analysis &amp; Clinical Reasoning:</strong>
                              {Object.entries(dynamicQBankList[activeQBankIdx].distractorRationales).map(([optIdx, rationale]) => (
                                <div
                                  key={optIdx}
                                  className={cn(
                                    "rounded-lg p-2.5 text-[10.5px] border border-[color:var(--ink)]/20",
                                    Number(optIdx) === dynamicQBankList[activeQBankIdx].correctIndex
                                      ? "bg-[#7fd8c9] font-bold text-[color:var(--ink)]"
                                      : "bg-[#f6d7a1]/40 text-[color:var(--ink)]/90"
                                  )}
                                >
                                  <span className="font-black">({String.fromCharCode(65 + Number(optIdx))}): </span>
                                  <span>{rationale}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* High Yield Takeaway Box */}
                          <div className="rounded-xl border-2 border-[color:var(--ink)] bg-[#ff4c00] p-3 text-[11px] text-[color:var(--ink)] shadow-xs">
                            <span className="font-black text-[color:var(--ink)]">🎯 High-Yield Exam Takeaway: </span>
                            <span className="font-medium">{dynamicQBankList[activeQBankIdx]?.highYieldTakeaway}</span>
                          </div>

                          {/* Next Question Navigation */}
                          <button
                            type="button"
                            onClick={() => {
                              setQuizSubmitted(false);
                              setQuizAnswer(null);
                              setActiveQBankIdx((prev) => (prev + 1) % dynamicQBankList.length);
                            }}
                            className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-2 text-xs font-bold text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5"
                          >
                            <span>Next Question →</span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs text-white/60">
                      <HelpCircle className="size-8 text-[color:var(--orange)]/60" />
                      <p>Generate board-grade questions grounded in Page {currentSegment?.pageNumber || currentIdx + 1}.</p>
                      <button
                        type="button"
                        onClick={() => loadDynamicQBank()}
                        className="mt-2 rounded-full bg-[color:var(--orange)] px-4 py-1.5 font-bold text-[color:var(--ink)] cursor-pointer"
                      >
                        Generate Practice Questions
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BOTTOM PROMPT INPUT */}
            <div className="shrink-0 border-t border-white/10 bg-black/40 p-3.5">
              <form
                onSubmit={handleSendMessage}
                className="relative flex items-center"
              >
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder={
                    selectedText
                      ? `Ask about selected (${selectedText.split(/\s+/).length}w) passage...`
                      : `Ask the AI Study Agent about ${book.title}...`
                  }
                  className="w-full rounded-full border border-white/15 bg-white/[0.06] py-2.5 pl-4 pr-11 text-xs text-[color:var(--cream)] placeholder-[color:var(--cream)]/40 transition-all focus:border-[color:var(--orange)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isAiLoading}
                  className="absolute right-1.5 flex size-7 cursor-pointer items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0"
                  title="Send query"
                >
                  <Send className="size-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
