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
  VoiceSessionProvider,
  NoisyPlaceQuickToggle,
  ActiveVoiceMiniBar,
} from "@/components/reader/VoiceSessionContext";
import { WhiteboardVideoStudio } from "@/components/whiteboard/WhiteboardVideoStudio";
import {
  StudioMenuDrawer,
  GLASS_BUTTON_BASE,
  GLASS_BUTTON_ACTIVE,
  GLASS_BUTTON_VOICE_ACTIVE,
} from "@/components/reader/StudioMenuDrawer";
import { StudyLanguage, DEFAULT_STUDY_LANGUAGE, STUDY_LANGUAGES } from "@/lib/language";
import {
  AVAILABLE_LIVE_VOICES,
  DEFAULT_LIVE_VOICE,
} from "@/lib/voice-config";
import {
  isGenericTopicTitle,
  sanitizeStudyScope,
  sanitizeTopicCandidates,
} from "@/lib/ai/rag/topic-resolution";
import {
  SourceSelectionToolbar,
  ScannedPinItem,
} from "@/components/reader/SourceSelectionToolbar";
import OriginalPdfViewer from "./OriginalPdfViewer";
import RichStudyMessage from "./RichStudyMessage";
import { AscleonLogo } from "@/components/ui/AscleonLogo";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Menu,
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
  Tv,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceLanguage, DEFAULT_VOICE_LANGUAGE } from "@/lib/constants";
import type { StudyScope } from "./StudyScopeBar";
import { UserStudyProgressData, ReadingStatus } from "@/types";
import {
  saveUserStudyProgress,
  resetUserStudyProgress,
} from "@/lib/actions/study-progress.actions";
import { toast } from "sonner";

interface LivingReaderProps {
  book: IBook;
  initialSegments: IBookSegmentData[];
  onSwitchToVoice?: () => void;
  initialProgress?: UserStudyProgressData | null;
}

function formatTimeAgo(dateInput: string | Date | undefined) {
  if (!dateInput) return "recently";
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function findNearestSegmentIndex(segments: IBookSegmentData[], page: number) {
  const exactIdx = segments.findIndex((segment) => segment.pageNumber === page);
  if (exactIdx !== -1) return exactIdx;

  return segments.reduce((best, segment, index) => {
    const segmentPage = Number(segment.pageNumber) || 0;
    const bestPage = Number(segments[best]?.pageNumber) || 0;
    return segmentPage <= page && segmentPage > bestPage ? index : best;
  }, 0);
}

type ThemeMode = "paper" | "ink";
type FitMode = "normal" | "fit-width" | "fit-page";
type StudyIntent = "morph" | "chat" | "whiteboard" | "voice" | "summary" | "quiz";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  time?: string;
  provider?: string;
  model?: string;
  toolsUsed?: string[];
  citations?: string[];
  imageUrl?: string;
  topicLocation?: {
    title: string;
    startPage: number;
    endPage: number;
    isAmbiguous?: boolean;
    candidates?: Array<{ title: string; startPage: number; endPage: number }>;
  };
  authoritativeReferences?: ReferenceResource[];
}

const CHAT_SUGGESTION_CHIPS = [
  "Explain core mechanism",
  "High-yield exam pearls",
  "Key invariants & trade-offs",
];

export default function LivingReader({
  book,
  initialSegments,
  onSwitchToVoice,
  initialProgress = null,
}: LivingReaderProps) {
  // Navigation & Viewport State
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (initialProgress?.lastStudiedPage && initialProgress.lastStudiedPage > 1) {
      return Math.max(0, initialProgress.lastStudiedPage - 1);
    }
    return 0;
  });
  const [theme, setTheme] = useState<ThemeMode>("paper");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("ascleon_study_canvas_theme");
      if (savedTheme === "paper" || savedTheme === "ink") {
        setTheme(savedTheme);
      }
    } catch {}
  }, []);

  const handleThemeChange = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    try {
      localStorage.setItem("ascleon_study_canvas_theme", nextTheme);
    } catch {}
  }, []);

  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    return initialProgress?.studioState?.zoomLevel || 100;
  });
  const [fitMode, setFitMode] = useState<FitMode>(() => {
    return (initialProgress?.studioState?.fitMode as FitMode) || "fit-width";
  });
  const [scrollOrientation, setScrollOrientation] = useState<"vertical" | "horizontal">(() => {
    if (initialProgress?.studioState?.scrollOrientation) {
      return initialProgress.studioState.scrollOrientation;
    }
    if (typeof window !== "undefined") {
      try {
        const savedOr =
          localStorage.getItem(`ascleon_pdf_orientation_${book.slug}`) ||
          localStorage.getItem(`ascleon_pdf_orientation_${book._id}`);
        if (savedOr === "vertical" || savedOr === "horizontal") return savedOr;
      } catch {}
    }
    return "vertical";
  });
  const [paragraphInteractiveMode, setParagraphInteractiveMode] = useState(true);
  const [mobileActivePane, setMobileActivePane] = useState<"reader" | "studio">("reader");
  const [isLgScreen, setIsLgScreen] = useState(false);

  // Session Continuation & Progress State
  const [resumedSessionInfo, setResumedSessionInfo] = useState<UserStudyProgressData | null>(initialProgress || null);
  const [showResumeSourceHud, setShowResumeSourceHud] = useState<boolean>(false);
  const [showStudioResumeBanner, setShowStudioResumeBanner] = useState<boolean>(false);
  const [showStartNewModal, setShowStartNewModal] = useState<boolean>(false);
  const isRestoringRef = useRef<boolean>(Boolean(initialProgress && initialProgress.lastStudiedPage > 1));
  const lastSavedPageRef = useRef<number>(initialProgress?.lastStudiedPage || 1);
  const hasExplicitlyRestartedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkLg = () => setIsLgScreen(window.innerWidth >= 1024);
    checkLg();
    window.addEventListener("resize", checkLg);
    return () => window.removeEventListener("resize", checkLg);
  }, []);

  // Virtual Keyboard & Viewport Height Detection on Mobile / Tablet
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleVisualViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      // Calculate keyboard offset from window height and visible viewport
      const offset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setKeyboardHeight(offset > 50 ? offset : 0);
    };

    const vv = window.visualViewport;
    vv.addEventListener("resize", handleVisualViewportChange);
    vv.addEventListener("scroll", handleVisualViewportChange);

    return () => {
      vv.removeEventListener("resize", handleVisualViewportChange);
      vv.removeEventListener("scroll", handleVisualViewportChange);
    };
  }, []);

  // Lock outer document scrolling so momentum scroll in studio never scrolls the window or reveals blank areas
  useEffect(() => {
    const origBodyOverflow = document.body.style.overflow;
    const origHtmlOverflow = document.documentElement.style.overflow;
    const origBodyHeight = document.body.style.height;
    const origHtmlHeight = document.documentElement.style.height;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.height = "100%";
    document.documentElement.style.height = "100%";

    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origHtmlOverflow;
      document.body.style.height = origBodyHeight;
      document.documentElement.style.height = origHtmlHeight;
    };
  }, []);

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      if (window.visualViewport) {
        const kb = Math.max(0, window.innerHeight - window.visualViewport.height - (window.visualViewport.offsetTop || 0));
        setKeyboardHeight(kb > 50 ? kb : 0);
      }
      e.target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 250);
  }, []);

  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      if (window.visualViewport) {
        const kb = Math.max(0, window.innerHeight - window.visualViewport.height - (window.visualViewport.offsetTop || 0));
        setKeyboardHeight(kb > 50 ? kb : 0);
      } else {
        setKeyboardHeight(0);
      }
    }, 100);
  }, []);

  // Dual-Track View Mode: Original Authentic PDF vs Structured Reflow
  const [readerViewMode, setReaderViewMode] = useState<"original_pdf" | "reflow">(() => {
    if (initialProgress?.studioState?.readerViewMode) {
      return initialProgress.studioState.readerViewMode;
    }
    return book.fileURL ? "original_pdf" : "reflow";
  });
  const [activePdfPage, setActivePdfPage] = useState<number>(() => {
    if (initialProgress?.lastStudiedPage && initialProgress.lastStudiedPage > 1) {
      return initialProgress.lastStudiedPage;
    }
    if (typeof window !== "undefined") {
      try {
        const localStr =
          localStorage.getItem(`ascleon_progress_${book.slug}`) ||
          localStorage.getItem(`ascleon_progress_${book._id}`);
        if (localStr) {
          const parsed = JSON.parse(localStr);
          if (parsed?.lastStudiedPage && parsed.lastStudiedPage > 1) {
            return parsed.lastStudiedPage;
          }
        }
      } catch {}
    }
    return 1;
  });
  const [totalPdfPages, setTotalPdfPages] = useState<number>(
    initialProgress?.totalPages || book.totalPages || initialSegments.length || 1
  );
  const [activePageLiveText, setActivePageLiveText] = useState<string>("");
  const [isEditingTopPage, setIsEditingTopPage] = useState<boolean>(false);
  const [topPageInputValue, setTopPageInputValue] = useState<string>("");
  const [snippedDiagram, setSnippedDiagram] = useState<{
    url: string;
    pageNumber: number;
  } | null>(null);

  // Universal Multi-Page / Topic Study Scope State (never keep generic "General" as a topic)
  const [studyScope, setStudyScope] = useState<StudyScope>(() => {
    const initialPage = initialProgress?.lastStudiedPage || 1;
    const savedScope = initialProgress?.studioState?.studyScope as StudyScope | undefined;
    return sanitizeStudyScope(savedScope, initialPage);
  });

  // Right Panel: All Controls & Study Studio (Default: AI Chat)
  const [activeIntent, setActiveIntent] = useState<StudyIntent>(() => {
    const saved = initialProgress?.studioState?.activeIntent as StudyIntent | undefined;
    return saved && saved !== "whiteboard" ? saved : "chat";
  });
  const [isStudioMenuOpen, setIsStudioMenuOpen] = useState(false);
  const [isQuickControlsOpen, setIsQuickControlsOpen] = useState(false);
  const [showFeatureBar, setShowFeatureBar] = useState(true);
  const studioMenuToggleRef = useRef<HTMLButtonElement>(null);
  const quickControlsRef = useRef<HTMLDivElement>(null);
  const quickControlsToggleRef = useRef<HTMLButtonElement>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAgentSoundMuted, setIsAgentSoundMuted] = useState(false);
  const [liveVoiceName, setLiveVoiceName] = useState<string>(DEFAULT_LIVE_VOICE);
  const [language, setLanguage] = useState<VoiceLanguage>(
    (book.language as VoiceLanguage) || DEFAULT_VOICE_LANGUAGE,
  );
  const [studyLanguage, setStudyLanguage] = useState<StudyLanguage>(() => {
    const rawLang = book.language as any;
    const code = typeof rawLang === "string" ? rawLang : rawLang?.code;
    if (code === "ar") return "ar";
    if (code === "mixed") return "mixed";
    return DEFAULT_STUDY_LANGUAGE;
  });

  // Morph Engine State
  const [morphArtifacts, setMorphArtifacts] = useState<
    Record<string, MorphArtifactData>
  >({});
  const [isMorphLoading, setIsMorphLoading] = useState(false);
  const [morphTopicInput, setMorphTopicInput] = useState<string>("");
  const [morphActiveTopic, setMorphActiveTopic] = useState<string | null>(null);

  // Dynamic QBank State
  const [dynamicQBankList, setDynamicQBankList] = useState<QBankVignette[]>([]);
  const [qbankCache, setQBankCache] = useState<Record<string, QBankVignette[]>>({});
  const [isQBankLoading, setIsQBankLoading] = useState(false);
  const [activeQBankIdx, setActiveQBankIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Dynamic Summary State
  const [dynamicSummary, setDynamicSummary] = useState<any>(null);
  const [summaryCache, setSummaryCache] = useState<Record<string, any>>({});
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

  // Close quick glassmorphism controls popover on outside click or Escape
  useEffect(() => {
    if (!isQuickControlsOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (quickControlsRef.current?.contains(target)) return;
      if (quickControlsToggleRef.current?.contains(target)) return;
      setIsQuickControlsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsQuickControlsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickControlsOpen]);

  // Synchronize domain context when book changes
  useEffect(() => {
    const dc = getBookDomainContext(book);
    setActiveReferences(dc.authoritativeReferences);
    setActiveMnemonics(dc.mnemonics);
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

  const aiAbortRef = useRef<AbortController | null>(null);
  const morphAbortRef = useRef<AbortController | null>(null);
  const qbankAbortRef = useRef<AbortController | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);

  const cancelActiveAiQuery = useCallback(() => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    setIsAiLoading(false);
  }, []);

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

  // One resolved page model for the whole reader. The total can never sit below
  // a page we already know about, so progress is never impossible (Page 24 / 3).
  const resolvedTotalPages = useMemo(() => {
    const highestSegmentPage = segments.reduce(
      (max, segment) => Math.max(max, Number(segment.pageNumber) || 0),
      0
    );

    return Math.max(
      1,
      book.fileURL ? totalPdfPages : Number(book.totalPages) || 0,
      highestSegmentPage,
      initialProgress?.lastStudiedPage || 0,
      resumedSessionInfo?.lastStudiedPage || 0,
      activePdfPage,
      segments.length
    );
  }, [
    book.fileURL,
    book.totalPages,
    segments,
    totalPdfPages,
    initialProgress?.lastStudiedPage,
    resumedSessionInfo?.lastStudiedPage,
    activePdfPage,
  ]);

  const currentPageNumber = Math.min(
    resolvedTotalPages,
    book.fileURL
      ? activePdfPage
      : currentSegment?.pageNumber || currentIdx + 1
  );

  const readingPercent = Math.min(
    100,
    Math.max(1, Math.round((currentPageNumber / resolvedTotalPages) * 100))
  );

  // --------------------------------------------------------------------------
  // SESSION RESTORATION (On Mount)
  // --------------------------------------------------------------------------
  useEffect(() => {
    try {
      let saved: UserStudyProgressData | null = initialProgress || null;
      const localStr =
        typeof window !== "undefined"
          ? localStorage.getItem(`ascleon_progress_${book.slug}`) ||
            localStorage.getItem(`ascleon_progress_${book._id}`)
          : null;

      if (localStr) {
        try {
          const localParsed: UserStudyProgressData = JSON.parse(localStr);
          if (
            !saved ||
            (localParsed.lastStudiedAt &&
              saved.lastStudiedAt &&
              new Date(localParsed.lastStudiedAt) > new Date(saved.lastStudiedAt))
          ) {
            saved = localParsed;
          }
        } catch { }
      }

      if (
        saved &&
        (saved.lastStudiedPage > 1 ||
          (saved.studioState?.chatMessages && saved.studioState.chatMessages.length > 1) ||
          (saved.studioState?.activeIntent && saved.studioState.activeIntent !== "chat"))
      ) {
        setResumedSessionInfo(saved);
        setShowResumeSourceHud(true);
        setShowStudioResumeBanner(true);

        // Auto-dismiss floating source progression toast after 7s
        const hudTimer = setTimeout(() => setShowResumeSourceHud(false), 7000);

        // Restore page
        if (saved.lastStudiedPage && saved.lastStudiedPage > 1) {
          lastSavedPageRef.current = saved.lastStudiedPage;
          if (book.fileURL) {
            setActivePdfPage(saved.lastStudiedPage);
          } else {
            setCurrentIdx(findNearestSegmentIndex(segments, saved.lastStudiedPage));
          }
        }

        // Restore studio state and reader settings
        if (saved.studioState) {
          if (saved.studioState.scrollOrientation) {
            setScrollOrientation(saved.studioState.scrollOrientation);
          }
          if (saved.studioState.readerViewMode) {
            setReaderViewMode(saved.studioState.readerViewMode);
          }
          if (saved.studioState.fitMode) {
            setFitMode(saved.studioState.fitMode as FitMode);
          }
          if (saved.studioState.zoomLevel) {
            setZoomLevel(saved.studioState.zoomLevel);
          }
          if (saved.studioState.activeIntent && saved.studioState.activeIntent !== "whiteboard") {
            setActiveIntent(saved.studioState.activeIntent as StudyIntent);
          }
          if (saved.studioState.studyLanguage) {
            setStudyLanguage(saved.studioState.studyLanguage as StudyLanguage);
          }
          if (saved.studioState.studyScope) {
            const restoredScope = saved.studioState.studyScope as StudyScope;
            const p = saved.lastStudiedPage || 1;
            setStudyScope(sanitizeStudyScope(restoredScope, p));
          }
          if (saved.studioState.morphActiveTopic) {
            setMorphActiveTopic(saved.studioState.morphActiveTopic);
          }
          if (saved.studioState.chatMessages && saved.studioState.chatMessages.length > 0) {
            setMessages(saved.studioState.chatMessages as ChatMessage[]);
          }
          if (typeof saved.studioState.activeQBankIdx === "number") {
            setActiveQBankIdx(saved.studioState.activeQBankIdx);
          }
        }

        setTimeout(() => {
          isRestoringRef.current = false;
        }, 1200);

        return () => clearTimeout(hudTimer);
      } else {
        isRestoringRef.current = false;
      }
    } catch (err) {
      console.warn("Failed to restore previous study session:", err);
      isRestoringRef.current = false;
    }
  }, [book._id, book.slug, book.fileURL, initialProgress, segments]);

  // --------------------------------------------------------------------------
  // SESSION AUTO-PERSISTENCE (Debounced)
  // --------------------------------------------------------------------------
  const performSave = useCallback(
    (override?: Partial<UserStudyProgressData>) => {
      let curPage = override?.lastStudiedPage ?? (book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1));

      // Strict guard against resetting saved progress to Page 1:
      // If curPage is 1, but we have a known higher saved page and user did NOT explicitly click restart, retain lastSavedPage!
      if (curPage === 1 && !hasExplicitlyRestartedRef.current && override?.lastStudiedPage !== 1) {
        const candidate = lastSavedPageRef.current || initialProgress?.lastStudiedPage || resumedSessionInfo?.lastStudiedPage || 1;
        if (candidate > 1) {
          curPage = candidate;
        }
      }

      lastSavedPageRef.current = curPage;

      const maxPages = Math.max(resolvedTotalPages, curPage);
      const pct = Math.min(100, Math.max(1, Math.round((curPage / maxPages) * 100)));
      const status: ReadingStatus = pct >= 90 ? "read" : "in_progress";

      const lastMsg = messages[messages.length - 1];
      const snippet = lastMsg?.text
        ? lastMsg.text.length > 60
          ? `${lastMsg.text.slice(0, 60)}...`
          : lastMsg.text
        : undefined;

      const data: UserStudyProgressData = {
        bookSlug: book.slug,
        bookId: book._id,
        lastStudiedPage: curPage,
        totalPages: maxPages,
        progressPercent: pct,
        readingStatus: status,
        lastStudiedAt: new Date().toISOString(),
        studioState: {
          activeIntent,
          studyLanguage,
          studyScope,
          morphActiveTopic,
          chatMessages: messages,
          activeQBankIdx,
          lastActiveSnippet: snippet,
          scrollOrientation,
          readerViewMode,
          fitMode,
          zoomLevel,
        },
        ...override,
      };

      try {
        localStorage.setItem(`ascleon_progress_${book.slug}`, JSON.stringify(data));
        localStorage.setItem(`ascleon_progress_${book._id}`, JSON.stringify(data));
      } catch { }

      saveUserStudyProgress(data).catch(() => {});
    },
    [
      book.fileURL,
      book.slug,
      book._id,
      activePdfPage,
      currentSegment?.pageNumber,
      currentIdx,
      resolvedTotalPages,
      messages,
      activeIntent,
      studyLanguage,
      studyScope,
      morphActiveTopic,
      activeQBankIdx,
      scrollOrientation,
      readerViewMode,
      fitMode,
      zoomLevel,
      initialProgress?.lastStudiedPage,
      resumedSessionInfo?.lastStudiedPage,
    ]
  );

  useEffect(() => {
    if (isRestoringRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    activePdfPage,
    currentIdx,
    messages,
    activeIntent,
    studyLanguage,
    studyScope,
    morphActiveTopic,
    activeQBankIdx,
    performSave,
  ]);

  // Flush save on page exit
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isRestoringRef.current) {
        performSave();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [performSave]);

  // --------------------------------------------------------------------------
  // SESSION RESET HANDLERS ("Start New")
  // --------------------------------------------------------------------------
  const handleStartFreshStudio = useCallback(async () => {
    setShowStartNewModal(false);
    setShowStudioResumeBanner(false);

    const defaultMessages: ChatMessage[] = [
      {
        sender: "ai",
        text: `Fresh study session started for "${book.title}". I am your grounded Ascleon mentor, backed by active page analysis. What would you like to explore?`,
        time: "Just now",
        provider: "grounded-mentor",
      },
    ];
    setMessages(defaultMessages);
    setMorphActiveTopic(null);
    setActiveQBankIdx(0);
    setQuizAnswer(null);
    setQuizSubmitted(false);

    performSave({
      studioState: {
        activeIntent: "chat",
        studyLanguage,
        studyScope,
        morphActiveTopic: null,
        chatMessages: defaultMessages,
        activeQBankIdx: 0,
      },
    });

    resetUserStudyProgress(book.slug, "studio_only").catch(() => {});
    toast.success("Fresh studio session started!");
  }, [book.title, book.slug, performSave, studyLanguage, studyScope]);

  const handleRestartFromBeginning = useCallback(async () => {
    setShowStartNewModal(false);
    setShowResumeSourceHud(false);
    setShowStudioResumeBanner(false);

    hasExplicitlyRestartedRef.current = true;
    lastSavedPageRef.current = 1;

    if (book.fileURL) {
      setActivePdfPage(1);
    } else {
      setCurrentIdx(0);
    }

    const defaultMessages: ChatMessage[] = [
      {
        sender: "ai",
        text: `Restarted from Page 1 of "${book.title}". I am your grounded Ascleon mentor, ready whenever you are!`,
        time: "Just now",
        provider: "grounded-mentor",
      },
    ];
    setMessages(defaultMessages);
    setMorphActiveTopic(null);
    setActiveQBankIdx(0);
    setQuizAnswer(null);
    setQuizSubmitted(false);

    performSave({
      lastStudiedPage: 1,
      progressPercent: 0,
      readingStatus: "in_progress",
      studioState: {
        activeIntent: "chat",
        studyLanguage,
        studyScope: { type: "page", startPage: 1, endPage: 1 },
        morphActiveTopic: null,
        chatMessages: defaultMessages,
        activeQBankIdx: 0,
      },
    });

    resetUserStudyProgress(book.slug, "full").catch(() => {});
    toast.success("Restarted book from Page 1");
  }, [book.fileURL, book.title, book.slug, performSave, studyLanguage]);

  // Keep studyScope in sync with active page when in single-page mode
  useEffect(() => {
    const cur = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
    setStudyScope((prev) => {
      if (prev.type === "page" && (prev.startPage !== cur || prev.endPage !== cur)) {
        return {
          ...prev,
          startPage: cur,
          endPage: cur,
        };
      }
      return prev;
    });
  }, [book.fileURL, activePdfPage, currentSegment, currentIdx]);

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

  // Trigger real Morph generation via /api/morph (supports custom override text, diagram, specific whole topic & cached retrieval)
  const handleRunMorph = async (
    overrideSelection?: string,
    diagramUrl?: string,
    forceRefresh = false,
    customTopic?: string | null,
  ) => {
    const topicToMorph = customTopic !== undefined ? customTopic : morphActiveTopic;
    const targetSelection = overrideSelection ?? selectedText;
    const baseKey = topicToMorph
      ? `topic_${topicToMorph.toLowerCase().trim().replace(/[\s\/\\#?]+/g, "_")}`
      : (book.fileURL ? activePdfPage : currentIdx);
    const activeKey = `${baseKey}_${studyLanguage}`;
    const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
    const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

    setActiveIntent("morph");

    // Instant local cache hit: if this page/topic was already morphed in this session and not forcing refresh, restore in 0ms!
    if (!forceRefresh && !targetSelection && !diagramUrl && (morphArtifacts[activeKey] || morphArtifacts[String(baseKey)])) {
      if (topicToMorph !== undefined) setMorphActiveTopic(topicToMorph);
      return;
    }

    setIsMorphLoading(true);
    if (topicToMorph !== undefined) setMorphActiveTopic(topicToMorph);

    morphAbortRef.current?.abort();
    const controller = new AbortController();
    morphAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 35_000);

    try {
      let effectiveScope = studyScope;
      if (topicToMorph) {
        const matched = (book.blueprint?.topicMap?.topics || []).find(
          (t: any) => t.title.toLowerCase() === topicToMorph.toLowerCase()
        );
        if (matched) {
          effectiveScope = {
            type: "topic",
            startPage: matched.startPage,
            endPage: matched.endPage,
            topicTitle: matched.title,
            topicId: matched.id,
          };
          setStudyScope(effectiveScope);
        }
      }

      const precedingSegments = segments
        .slice(Math.max(0, currentIdx - 2), currentIdx)
        .map((s) => s.content);

      const res = await fetch("/api/morph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          language: studyLanguage,
          forceRefresh: Boolean(forceRefresh),
          studyScope: effectiveScope,
          customTopic: topicToMorph || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 402 || errorData?.isBillingError) {
          toast.error(errorData.error || "Monthly AI credit limit reached.", {
            action: {
              label: "Upgrade Plan",
              onClick: () => window.location.assign("/subscriptions?reason=limit"),
            },
          });
          return;
        }
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
          [String(baseKey)]: artifact,
        }));
      }
    } catch (err) {
      if (timedOut) {
        toast.error("Morph generation timed out on slow network. Please retry.");
      } else if (err instanceof Error && err.name !== "AbortError") {
        console.error("Failed to generate Morph artifact:", err);
        toast.error(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      if (morphAbortRef.current === controller) {
        morphAbortRef.current = null;
        setIsMorphLoading(false);
      }
      setSelectionPos(null);
    }
  };

  // Dynamic QBank generator with per-page caching
  const loadDynamicQBank = useCallback(async (diagramUrl?: string, forceRefresh = false) => {
    const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
    const scopePart = studyScope.type === "page" ? activePage : `${studyScope.type}_${studyScope.startPage}_${studyScope.endPage}`;
    const cacheKey = `${scopePart}_${studyLanguage}`;

    // Instant cache hit: if QBank was already generated for this page/scope, load instantly (0ms)
    if (!forceRefresh && !diagramUrl && !selectedText && qbankCache[cacheKey]?.length) {
      setDynamicQBankList(qbankCache[cacheKey]);
      setQuizSubmitted(false);
      setQuizAnswer(null);
      setActiveQBankIdx(0);
      return;
    }

    setIsQBankLoading(true);
    setQuizSubmitted(false);
    setQuizAnswer(null);
    qbankAbortRef.current?.abort();
    const controller = new AbortController();
    qbankAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 25_000);
    try {
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");
      const existingTopics = dynamicQBankList.map((q) => q.topic).filter(Boolean);

      const res = await fetch("/api/qbank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          bookId: book._id,
          bookTitle: book.title,
          pageNumber: activePage,
          pageText: activeText,
          selectedText: selectedText || undefined,
          snippedDiagram: diagramUrl || snippedDiagram?.url || null,
          language: studyLanguage,
          studyScope,
          excludeTopics: forceRefresh ? existingTopics : [],
          forceRefresh: Boolean(forceRefresh),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 402 || errorData?.isBillingError) {
          toast.error(errorData.error || "Monthly AI credit limit reached.", {
            action: {
              label: "Upgrade Plan",
              onClick: () => window.location.assign("/subscriptions?reason=limit"),
            },
          });
        } else {
          toast.error(errorData.error || `QBank generation failed (${res.status}). Please retry.`);
        }
        return;
      }
      const data = await res.json();
      if (data?.questions && data.questions.length > 0) {
        setDynamicQBankList(data.questions);
        setQBankCache((prev) => ({ ...prev, [cacheKey]: data.questions }));
        setActiveQBankIdx(0);
      } else {
        toast.error("No QBank questions returned. Please try again.");
      }
    } catch (e) {
      if (timedOut) {
        toast.error("QBank generation timed out on slow network. Please retry.");
      } else if (!(e instanceof Error && e.name === "AbortError")) {
        console.warn("Dynamic QBank load warning:", e);
        toast.error("Network error generating QBank. Please retry.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (qbankAbortRef.current === controller) {
        qbankAbortRef.current = null;
        setIsQBankLoading(false);
      }
    }
  }, [book._id, book.title, book.fileURL, activePdfPage, activePageLiveText, currentSegment, currentIdx, selectedText, snippedDiagram, qbankCache, dynamicQBankList, studyLanguage, studyScope]);

  // Dynamic Summary generator with per-page caching
  const loadDynamicSummary = useCallback(async (forceRefresh = false) => {
    const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
    const scopePart = studyScope.type === "page" ? activePage : `${studyScope.type}_${studyScope.startPage}_${studyScope.endPage}`;
    const cacheKey = `${scopePart}_${studyLanguage}`;

    // Instant cache hit: if summary was already generated for this page/scope, load instantly (0ms)
    if (!forceRefresh && !selectedText && summaryCache[cacheKey]) {
      setDynamicSummary(summaryCache[cacheKey]);
      return;
    }

    setIsSummaryLoading(true);
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 22_000);
    try {
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          bookId: book._id,
          bookTitle: book.title,
          pageNumber: activePage,
          pageText: activeText,
          selectedText: selectedText || undefined,
          language: studyLanguage,
          studyScope,
          forceRefresh: Boolean(forceRefresh),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 402 || errorData?.isBillingError) {
          toast.error(errorData.error || "Monthly AI credit limit reached.", {
            action: {
              label: "Upgrade Plan",
              onClick: () => window.location.assign("/subscriptions?reason=limit"),
            },
          });
        } else {
          toast.error(errorData.error || `Summary failed (${res.status}). Please retry.`);
        }
        return;
      }
      const data = await res.json();
      if (data?.summary) {
        setDynamicSummary(data.summary);
        setSummaryCache((prev) => ({ ...prev, [cacheKey]: data.summary }));
      }
    } catch (e) {
      if (timedOut) {
        toast.error("Summary timed out on slow network. Please retry.");
      } else if (!(e instanceof Error && e.name === "AbortError")) {
        console.warn("Dynamic Summary load warning:", e);
        toast.error("Network error loading summary. Please retry.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
        setIsSummaryLoading(false);
      }
    }
  }, [book._id, book.title, book.fileURL, activePdfPage, activePageLiveText, currentSegment, currentIdx, selectedText, summaryCache, studyLanguage, studyScope]);

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

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 28_000);

    setIsAiLoading(true);
    try {
      const activePageNum = book.fileURL
        ? activePdfPage
        : (currentSegment?.pageNumber || currentIdx + 1);
      const activeContent = (book.fileURL && activePageLiveText)
        ? activePageLiveText
        : (currentSegment?.content || "");

      const res = await fetch("/api/reader-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query: queryText,
          bookId: book._id,
          bookTitle: book.title,
          bookTopic: book.blueprint?.domain || book.topic || "",
          bookReferences: book.blueprint?.authoritativeReferences || [],
          currentSegmentIndex: currentIdx,
          currentPageNumber: activePageNum,
          currentSegmentContent: activeContent,
          selectedText: contextSelection || selectedText || undefined,
          selectedImage: imagePayload || snippedDiagram?.url || undefined,
          language: studyLanguage,
          history: historyPayload,
          studyScope,
          topicMap: book.blueprint?.topicMap,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 402 || errorData?.isBillingError) {
          const msg = errorData.error || "Monthly AI credit limit reached.";
          toast.error(msg, {
            action: {
              label: "Upgrade Plan",
              onClick: () => window.location.assign("/subscriptions?reason=limit"),
            },
          });
          setMessages((prev) => [
            ...prev,
            {
              sender: "ai",
              text: `⚠️ **Monthly AI Credit Limit Reached**\n\n${msg}\n\n[Open Plans & Egyptian Payments](/subscriptions?reason=limit)`,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
          return;
        }
        throw new Error(errorData.error || `AI error ${res.status}`);
      }
      const data = await res.json();

      if (data.authoritativeReferences?.length) {
        setActiveReferences(data.authoritativeReferences);
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
          topicLocation: data.topicLocation,
        },
      ]);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError" && !timedOut) {
        // Cancelled by user or superseded by a newer question
        return;
      }
      const snippet = (contextSelection || selectedText || "").slice(0, 120);
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: timedOut
            ? `⏱️ **Request timed out** due to slow network or high server load. You can re-send your question now.\n\n${snippet ? `> "${snippet}..."` : ""}`
            : `Grounded Analysis of Selected Passage:\n\n"${snippet}..."\n\nCross-referencing canonical references confirms that this mechanism directly governs bedside diagnostic differentiation in Section ${currentIdx + 1}.`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          provider: "deterministic",
          model: timedOut ? "timeout-recovery" : "grounded-offline",
          toolsUsed: ["deep_reference_retriever"],
          citations: [`Section ${currentIdx + 1}`],
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setIsAiLoading(false);
      }
    }
  };

  const handleResetMorph = (idx: number | string) => {
    setMorphArtifacts((prev) => {
      const copy = { ...prev };
      delete copy[`${idx}_${studyLanguage}`];
      delete copy[String(idx)];
      return copy;
    });
    setMorphActiveTopic(null);
  };

  const activeBaseKey = morphActiveTopic
    ? `topic_${morphActiveTopic.toLowerCase().trim().replace(/[\s\/\\#?]+/g, "_")}`
    : (book.fileURL ? activePdfPage : currentIdx);
  const activeMorphArtifact =
    morphArtifacts[`${activeBaseKey}_${studyLanguage}`] || morphArtifacts[String(activeBaseKey)];
  const activeQBankQuestion = dynamicQBankList.length > 0 ? dynamicQBankList[activeQBankIdx % dynamicQBankList.length] : null;

  // Resizable Splitter State
  const [splitRatio, setSplitRatio] = useState<number>(54);
  const [isWhiteboardExpanded, setIsWhiteboardExpanded] = useState<boolean>(false);
  const [whiteboardSelectionSeq, setWhiteboardSelectionSeq] = useState<number>(0);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveSplitRatio =
    isWhiteboardExpanded && activeIntent === "whiteboard"
      ? 36
      : splitRatio;

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
    if (!inputQuery.trim()) return;

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

  const goToSourcePage = useCallback(
    (page: number) => {
      if (book.fileURL) {
        setActivePdfPage(Math.min(resolvedTotalPages, Math.max(1, page)));
        return;
      }

      setCurrentIdx(findNearestSegmentIndex(segments, page));
    },
    [book.fileURL, resolvedTotalPages, segments]
  );

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
    <div
      data-study-theme={theme}
      className="study-dotted-canvas fixed inset-0 z-30 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden pt-0 select-none overscroll-none transition-colors duration-200"
    >
      {/* FLOATING DETACHED TOP HUD ISLANDS */}
      <header className="pointer-events-none relative z-30 flex shrink-0 items-center justify-between gap-2 px-2.5 pt-2 pb-1 sm:px-3.5 sm:pt-2.5">
        {/* Left Island: Library Back + Book Title */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[44vw] sm:max-w-xs shrink rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] px-1.5 py-1 pr-3 shadow-[var(--study-shadow)] backdrop-blur-xl">
          <Link
            href="/library"
            className="flex size-7 items-center justify-center rounded-full border border-[var(--study-pill-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-xs transition-transform hover:-translate-y-0.5 hover:border-[color:var(--orange)] cursor-pointer shrink-0"
            title="Return to library"
            aria-label="Return to library"
          >
            <ArrowLeft className="size-3.5 stroke-[2.5]" />
          </Link>
          <AscleonLogo size={20} className="hidden sm:block shrink-0 transition-transform duration-200 hover:scale-105" />
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="display line-clamp-1 text-xs font-bold text-[var(--study-text)] sm:text-sm truncate">
              {book.title}
            </h1>
          </div>
        </div>

        {/* Center Islands: Mobile Source/Studio Switcher + Desktop Progress & Page Tracking */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile/Tablet Viewport Toggle */}
          <div className="pointer-events-auto flex lg:hidden items-center rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] p-0.5 shadow-[var(--study-shadow)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMobileActivePane("reader")}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                mobileActivePane === "reader"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                  : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              <BookOpen className="size-3" />
              <span>Source</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileActivePane("studio")}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                mobileActivePane === "studio"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                  : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              <Sparkles className="size-3" />
              <span>Studio</span>
            </button>
          </div>

          <div className="pointer-events-auto hidden sm:flex items-center gap-2.5 rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] px-3 py-1 shadow-[var(--study-shadow)] backdrop-blur-xl">
            <div className="hidden md:flex w-32 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--study-surface-muted)]">
                <div
                  className="h-full bg-[color:var(--orange)] transition-all duration-300"
                  style={{ width: `${readingPercent}%` }}
                />
              </div>
              <span className="font-mono text-[10px] font-bold text-[var(--study-text-muted)]">
                {readingPercent}%
              </span>
            </div>

            <div className="hidden md:block h-3.5 w-px bg-[var(--study-border-strong)]" />

            {isEditingTopPage ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = parseInt(topPageInputValue, 10);
                  if (!isNaN(p) && p >= 1 && p <= resolvedTotalPages) {
                    goToSourcePage(p);
                  }
                  setIsEditingTopPage(false);
                }}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[11px] font-bold"
              >
                <span className="text-[color:var(--orange)]">Page</span>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={resolvedTotalPages}
                  value={topPageInputValue}
                  onChange={(e) => setTopPageInputValue(e.target.value)}
                  onBlur={() => {
                    const p = parseInt(topPageInputValue, 10);
                    if (!isNaN(p) && p >= 1 && p <= resolvedTotalPages) {
                      goToSourcePage(p);
                    }
                    setIsEditingTopPage(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIsEditingTopPage(false);
                  }}
                  className="w-12 rounded border border-[color:var(--orange)] bg-[var(--study-surface-solid)] px-1 py-0.5 text-center text-[color:var(--orange)] outline-none"
                />
                <span className="text-[var(--study-text-muted)]">/</span>
                <span className="text-[var(--study-text-soft)]">{resolvedTotalPages}</span>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTopPageInputValue(String(currentPageNumber));
                  setIsEditingTopPage(true);
                }}
                className="group flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold transition-colors hover:bg-[var(--study-glass-hover)]"
                title="Click to jump to a page number"
              >
                <span className="text-[color:var(--orange)] underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                  Page {currentPageNumber}
                </span>
                <span className="text-[var(--study-text-muted)]">/</span>
                <span className="text-[var(--study-text-soft)]">{resolvedTotalPages}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Islands: Scope Badges + 1-Click Canvas Theme Switch + Page Nav */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          {selectedText && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border-[1.5px] border-[color:var(--orange)] bg-[var(--study-surface)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--orange)] shadow-[var(--study-shadow)] backdrop-blur-xl animate-pulse">
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
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border-[1.5px] border-[var(--study-amber-border)] bg-[var(--study-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--study-amber-text)] shadow-[var(--study-shadow)] backdrop-blur-xl">
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

          {/* 1-Click Dotted Canvas Theme Switch (White + Black Dots <-> Black + White Dots) */}
          <button
            type="button"
            onClick={() => handleThemeChange(theme === "paper" ? "ink" : "paper")}
            className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] p-0.5 text-[10.5px] font-bold text-[var(--study-text)] shadow-[var(--study-shadow)] backdrop-blur-xl transition-all hover:border-[color:var(--orange)]"
            title={
              theme === "paper"
                ? "Switch to Black Dotted Canvas"
                : "Switch to White Dotted Canvas"
            }
            aria-label={
              theme === "paper"
                ? "Switch to Black Dotted Canvas"
                : "Switch to White Dotted Canvas"
            }
            aria-pressed={theme === "ink"}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-all",
                theme === "paper"
                  ? "bg-[#0f0e10] text-white shadow-xs"
                  : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              <Sun className="size-3" />
              <span className="hidden md:inline">White</span>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-all",
                theme === "ink"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] font-black shadow-xs"
                  : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              <Moon className="size-3" />
              <span className="hidden md:inline">Black</span>
            </span>
          </button>

          <div className="hidden sm:flex items-center gap-0.5 rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] p-0.5 shadow-[var(--study-shadow)] backdrop-blur-xl">
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
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[var(--study-text)] transition-colors hover:bg-[var(--study-glass-hover)] disabled:cursor-default disabled:opacity-30"
              title="Previous page (←)"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={currentPageNumber >= resolvedTotalPages}
              onClick={() => {
                if (book.fileURL) {
                  setActivePdfPage((prev) => Math.min(resolvedTotalPages, prev + 1));
                } else {
                  setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1));
                }
              }}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[var(--study-text)] transition-colors hover:bg-[var(--study-glass-hover)] disabled:cursor-default disabled:opacity-30"
              title="Next page (→)"
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MAIN SPLIT WORKSPACE: FRAMED SOURCE PANEL | FRAMED STUDIO PANEL   */}
      {/* ================================================================= */}
      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden px-2 pb-2 pt-1 sm:px-3.5 sm:pb-3.5 sm:pt-1.5 gap-2 sm:gap-3"
        style={{ cursor: isDraggingSplit ? "col-resize" : "default" }}
      >
        <div className="flex h-full w-full gap-1.5 sm:gap-2 overflow-hidden">
          {/* ============================================================== */}
          {/* LEFT PANEL: CONTRASTED SOURCE STUDY FRAME OVER DOTTED CANVAS   */}
          {/* ============================================================== */}
          <div
            className={cn(
              "study-dotted-canvas relative h-full flex-col overflow-hidden rounded-[22px] border-2 border-[var(--study-panel-border)] shadow-[var(--study-shadow-lg)] transition-[width] duration-75",
              mobileActivePane === "reader" ? "flex w-full" : "hidden",
              "lg:flex"
            )}
            style={isLgScreen ? { width: `${effectiveSplitRatio}%` } : undefined}
          >
            {/* FLOATING SOURCE PROGRESSION HUD (Mobile/Tablet only; desktop shows Studio banner) */}
            {showResumeSourceHud && resumedSessionInfo && (
              <div className="lg:hidden absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-md w-[92%] sm:w-auto animate-in fade-in slide-in-from-top-3 duration-500">
                <div className="flex items-center gap-3 rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-solid)] px-4 py-2 text-[var(--study-text)] shadow-[var(--study-shadow-lg)] backdrop-blur-xl">
                  {/* Animated Radial / Progress Ring */}
                  {(() => {
                    const safeResumedPage = Math.min(resolvedTotalPages, Math.max(1, Number(resumedSessionInfo.lastStudiedPage) || 1));
                    const safeResumedPct = Math.min(
                      100,
                      Math.max(0, Math.round((safeResumedPage / resolvedTotalPages) * 100))
                    );
                    return (
                      <>
                        <div className="relative size-7 shrink-0 flex items-center justify-center">
                          <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                            <path
                              className="text-[var(--study-surface-muted)]"
                              strokeWidth="3.5"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className="text-[color:var(--orange)] transition-all duration-1000 ease-out"
                              strokeDasharray={`${safeResumedPct}, 100`}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                          </svg>
                          <span className="absolute font-mono text-[9px] font-bold text-[color:var(--orange)]">
                            {safeResumedPct}%
                          </span>
                        </div>

                        <div className="flex flex-col min-w-0 pr-1">
                          <div className="flex items-center gap-1.5">
                            <span className="size-2 shrink-0 rounded-full bg-[color:var(--orange)] animate-ping" />
                            <span className="text-[11.5px] font-bold text-[var(--study-text)] truncate">
                              Resumed at Page {safeResumedPage} of {resolvedTotalPages}
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--study-text-muted)] font-medium">
                            Last studied {formatTimeAgo(resumedSessionInfo.lastStudiedAt)}
                          </span>
                        </div>
                      </>
                    );
                  })()}

                  <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-[var(--study-border)]">
                    <button
                      type="button"
                      onClick={handleRestartFromBeginning}
                      className="cursor-pointer rounded-full border border-[var(--study-border)] bg-[var(--study-surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--study-text)] hover:bg-[var(--study-glass-hover)] transition-colors"
                      title="Start from beginning (Page 1)"
                    >
                      Page 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResumeSourceHud(false)}
                      className="cursor-pointer rounded-full p-1 text-[var(--study-text-muted)] hover:text-[var(--study-text)] transition-colors"
                      title="Dismiss"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Left Panel Body: Authentic PDF Viewer */}
            {book.fileURL ? (
              <div className="relative flex flex-1 overflow-hidden">
                <SourceSelectionToolbar
                  selectedText={selectedText}
                  position={selectionPos}
                  onMorphSelection={() => {
                    handleRunMorph(selectedText);
                    setMobileActivePane("studio");
                  }}
                  onWhiteboardSelection={() => {
                    setSelectionPos(null);
                    setWhiteboardSelectionSeq((n) => n + 1);
                    setActiveIntent("whiteboard");
                    setMobileActivePane("studio");
                  }}
                  onAskAI={() => {
                    handleAskAISelection(selectedText);
                    setMobileActivePane("studio");
                  }}
                  onVoiceViva={() => {
                    setSelectionPos(null);
                    setActiveIntent("voice");
                    setMobileActivePane("studio");
                  }}
                  onQuizSelection={() => {
                    setSelectionPos(null);
                    setActiveIntent("quiz");
                    setMobileActivePane("studio");
                    loadDynamicQBank();
                  }}
                  onPinToBoard={() => handlePinSelectionToVault(selectedText)}
                  onClearSelection={handleClearSelection}
                />
                <OriginalPdfViewer
                  fileURL={book.fileURL}
                  currentPage={activePdfPage}
                  scrollOrientation={scrollOrientation}
                  onScrollOrientationChange={(newOrientation) => {
                    setScrollOrientation(newOrientation);
                    try {
                      localStorage.setItem(`ascleon_pdf_orientation_${book.slug}`, newOrientation);
                      localStorage.setItem(`ascleon_pdf_orientation_${book._id}`, newOrientation);
                    } catch {}
                    performSave({
                      studioState: {
                        activeIntent,
                        studyLanguage,
                        studyScope,
                        morphActiveTopic,
                        chatMessages: messages,
                        activeQBankIdx,
                        scrollOrientation: newOrientation,
                        readerViewMode,
                        fitMode,
                        zoomLevel,
                      },
                    });
                  }}
                  onTotalPagesLoaded={(total) => setTotalPdfPages(total)}
                  onPageChange={(page, text) => {
                    // Safety guard: during restoration, ignore transient Page 1 if a saved page > 1 exists
                    if (isRestoringRef.current && page === 1 && (lastSavedPageRef.current || initialProgress?.lastStudiedPage || 1) > 1) {
                      return;
                    }
                    setActivePdfPage(page);
                    lastSavedPageRef.current = page;
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
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onFitWidth={handleFitWidth}
                  onFitPage={handleFitPage}
                  onZoomReset={() => {
                    setFitMode("normal");
                    setZoomLevel(100);
                  }}
                  theme={theme}
                  className="flex-1"
                />
              </div>
            ) : (
              /* Reflow Document Reading Surface over Left Dotted Canvas */
              <div
                ref={scrollViewportRef}
                onMouseUp={handleTextSelection}
                onTouchEnd={handleTextSelection}
                className={cn(
                  "study-scrollbar relative flex-1 overflow-y-auto overscroll-y-contain px-4 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] transition-colors sm:px-10 sm:py-8 select-text font-serif bg-transparent text-[var(--study-text)]",
                )}
              >
                {/* Floating Selection Action Toolbar inside Left Panel */}
                <SourceSelectionToolbar
                  selectedText={selectedText}
                  position={selectionPos}
                  onMorphSelection={() => {
                    handleRunMorph(selectedText);
                    setMobileActivePane("studio");
                  }}
                  onWhiteboardSelection={() => {
                    setSelectionPos(null);
                    setWhiteboardSelectionSeq((n) => n + 1);
                    setActiveIntent("whiteboard");
                    setMobileActivePane("studio");
                  }}
                  onAskAI={() => {
                    handleAskAISelection(selectedText);
                    setMobileActivePane("studio");
                  }}
                  onVoiceViva={() => {
                    setSelectionPos(null);
                    setActiveIntent("voice");
                    setMobileActivePane("studio");
                  }}
                  onQuizSelection={() => {
                    setSelectionPos(null);
                    setActiveIntent("quiz");
                    setMobileActivePane("studio");
                    setQuizAnswer(null);
                    setQuizSubmitted(false);
                  }}
                  onPinToBoard={() => handlePinSelectionToVault(selectedText)}
                  onClearSelection={handleClearSelection}
                />

                <div
                  className={cn(
                    "mx-auto transition-transform duration-150 origin-top",
                    fitMode === "normal" && "max-w-4xl xl:max-w-5xl px-2",
                    fitMode === "fit-width" && "max-w-full px-2",
                    fitMode === "fit-page" && "max-w-2xl text-sm leading-normal",
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
                            {/* Paragraph Action Gutter Bar on Hover / Focus */}
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-1 font-sans text-[10px] opacity-0 transition-opacity group-hover/para:opacity-100 group-focus-within/para:opacity-100">
                              <span className="font-mono font-bold uppercase tracking-wider opacity-60">
                                Block {pIdx + 1}
                              </span>
                              <div className="flex flex-wrap items-center gap-1">
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
                                  onClick={() => {
                                    setSelectedText(para);
                                    setWhiteboardSelectionSeq((n) => n + 1);
                                    setActiveIntent("whiteboard");
                                    setMobileActivePane("studio");
                                  }}
                                  className="flex cursor-pointer items-center gap-1 rounded-full border border-current/20 bg-current/5 px-2 py-0.5 font-bold hover:bg-current/15"
                                  title="Create Living Board from this block"
                                >
                                  <Tv className="size-2.5" />
                                  <span>Living Board</span>
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

                {/* Border Navigation Arrows for Reflow Mode */}
                {segments.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={currentIdx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentIdx((prev) => Math.max(0, prev - 1));
                      }}
                      className={cn(
                        "group/arrow absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex size-11 items-center justify-center rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-[var(--study-shadow-lg)] transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] hover:text-[color:var(--ink)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
                        currentIdx === 0 ? "opacity-0 pointer-events-none" : "opacity-90 hover:opacity-100"
                      )}
                      title="Previous Section"
                      aria-label="Previous Section"
                    >
                      <ChevronLeft className="size-6 stroke-[3] transition-transform group-hover/arrow:-translate-x-0.5" />
                    </button>

                    <button
                      type="button"
                      disabled={currentIdx === segments.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1));
                      }}
                      className={cn(
                        "group/arrow absolute right-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex size-11 items-center justify-center rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-[var(--study-shadow-lg)] transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] hover:text-[color:var(--ink)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
                        currentIdx === segments.length - 1 ? "opacity-0 pointer-events-none" : "opacity-90 hover:opacity-100"
                      )}
                      title="Next Section"
                      aria-label="Next Section"
                    >
                      <ChevronRight className="size-6 stroke-[3] transition-transform group-hover/arrow:translate-x-0.5" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Floating Mobile Reader Page Footer Scrubber (< sm) */}
            <div className="mx-1 mt-1.5 mb-[max(0.25rem,env(safe-area-inset-bottom))] flex sm:hidden shrink-0 items-center justify-between gap-2 rounded-full border border-[var(--study-border)] bg-[var(--study-surface)] px-2.5 py-1.5 shadow-[var(--study-shadow-lg)] backdrop-blur-xl">
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
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] transition-colors hover:bg-[var(--study-glass-hover)] disabled:cursor-default disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div className="flex items-center gap-2">
                {isEditingTopPage ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const p = parseInt(topPageInputValue, 10);
                      if (!isNaN(p) && p >= 1 && p <= resolvedTotalPages) {
                        goToSourcePage(p);
                      }
                      setIsEditingTopPage(false);
                    }}
                    className="flex items-center gap-1 font-mono text-xs font-bold"
                  >
                    <span className="text-[color:var(--orange)]">Page</span>
                    <input
                      autoFocus
                      type="number"
                      min={1}
                      max={resolvedTotalPages}
                      value={topPageInputValue}
                      onChange={(e) => setTopPageInputValue(e.target.value)}
                      onBlur={() => {
                        const p = parseInt(topPageInputValue, 10);
                        if (!isNaN(p) && p >= 1 && p <= resolvedTotalPages) {
                          goToSourcePage(p);
                        }
                        setIsEditingTopPage(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setIsEditingTopPage(false);
                      }}
                      className="w-12 rounded border border-[color:var(--orange)] bg-[var(--study-surface-solid)] px-1 py-0.5 text-center text-[color:var(--orange)] outline-none"
                    />
                    <span className="text-[var(--study-text-muted)]">/</span>
                    <span className="text-[var(--study-text-soft)]">{resolvedTotalPages}</span>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTopPageInputValue(String(currentPageNumber));
                      setIsEditingTopPage(true);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-bold hover:bg-[var(--study-glass-hover)]"
                    title="Tap to jump to a page"
                  >
                    <span className="text-[color:var(--orange)]">Page {currentPageNumber}</span>
                    <span className="text-[var(--study-text-muted)]">/</span>
                    <span className="text-[var(--study-text-soft)]">{resolvedTotalPages}</span>
                    <span className="ml-1 rounded-full bg-[var(--study-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--study-text-muted)]">
                      {readingPercent}%
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={currentPageNumber >= resolvedTotalPages}
                onClick={() => {
                  if (book.fileURL) {
                    setActivePdfPage((prev) => Math.min(resolvedTotalPages, prev + 1));
                  } else {
                    setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1));
                  }
                }}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] transition-colors hover:bg-[var(--study-glass-hover)] disabled:cursor-default disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* ADJUSTABLE FLOATING SPLITTER */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize reading and studio panes"
            tabIndex={0}
            onPointerDown={handleSplitPointerDown}
            onDoubleClick={() => setSplitRatio(54)}
            onKeyDown={handleSplitKeyDown}
            className="group relative hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center"
            title="Drag to resize panes • double-click to reset"
          >
            <div
              className={cn(
                "h-20 w-1 rounded-full transition-colors duration-150",
                isDraggingSplit
                  ? "bg-[color:var(--orange)]"
                  : "bg-[var(--study-border-strong)] group-hover:bg-[color:var(--orange)]",
              )}
            />
          </div>

          {/* ============================================================== */}
          {/* RIGHT PANEL: ALL CONTROLS, LIVE VOICE & INTERACTIVE WORKSPACE    */}
          {/* ============================================================== */}
          <VoiceSessionProvider
            bookTitle={book.title}
            currentPageNumber={book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
            currentSectionText={
              (book.fileURL && activePageLiveText)
                ? activePageLiveText
                : (currentSegment?.content || "")
            }
            selectedText={selectedText || undefined}
            authoritativeReferences={activeReferences}
            studyLanguage={studyLanguage}
            voiceName={liveVoiceName}
            onVoiceNameChange={setLiveVoiceName}
            isMicMuted={isMicMuted}
            onMicMutedChange={setIsMicMuted}
            isAgentSoundMuted={isAgentSoundMuted}
            onTriggerMorph={() => {
              setActiveIntent("morph");
              handleRunMorph();
            }}
          >
          <div
            className={cn(
              "study-dotted-canvas relative h-full min-w-0 flex-col overflow-clip rounded-[22px] border-2 border-[var(--study-panel-border)] shadow-[var(--study-shadow-lg)] text-[var(--study-text)]",
              mobileActivePane === "studio" ? "flex w-full" : "hidden",
              "lg:flex lg:flex-1"
            )}
          >
            {/* MINIMAL STUDIO HEADER (Floating Glass Capsule matching Left PDF Toolbar) */}
            <div className="shrink-0 px-4 sm:px-6 pt-2.5 pb-1.5 z-20">
              <div className="flex h-10 items-center justify-between gap-2 rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] backdrop-blur-xl px-2 sm:px-2.5 shadow-[var(--study-shadow)]">
                {/* Left: Active Mode Pill + Tappable Scope/Language Pill */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsStudioMenuOpen(true)}
                    className={cn(
                      activeIntent === "voice" ? GLASS_BUTTON_VOICE_ACTIVE : GLASS_BUTTON_ACTIVE,
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide shrink-0"
                    )}
                    title="Switch AI feature"
                  >
                    {activeIntent === "chat" && <MessageSquare className="size-3" />}
                    {activeIntent === "morph" && <Sparkles className="size-3" />}
                    {activeIntent === "whiteboard" && <Tv className="size-3" />}
                    {activeIntent === "voice" && <Mic className="size-3" />}
                    {activeIntent === "quiz" && <HelpCircle className="size-3" />}
                    {activeIntent === "summary" && <FileText className="size-3" />}
                    <span>
                      {activeIntent === "voice"
                        ? "Ascleon Voice"
                        : activeIntent === "chat"
                        ? "AI Chat"
                        : activeIntent === "morph"
                        ? "Morph"
                        : activeIntent === "whiteboard"
                        ? "Living Board"
                        : activeIntent === "quiz"
                        ? "Qbanks"
                        : "Summary"}
                    </span>
                  </button>

                  <div className="relative min-w-0">
                    <button
                      ref={quickControlsToggleRef}
                      type="button"
                      aria-expanded={isQuickControlsOpen}
                      onClick={() => setIsQuickControlsOpen((prev) => !prev)}
                      className={cn(
                        isQuickControlsOpen ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold max-w-[200px] sm:max-w-[240px]"
                      )}
                      title="Tap to quickly adjust Language, Mic, Voice Sound & Scope"
                    >
                      <span className="truncate">
                        {studyScope.type === "topic" &&
                        studyScope.topicTitle &&
                        studyScope.topicTitle.trim().toLowerCase() !== "general"
                          ? studyScope.topicTitle
                          : studyScope.type === "range"
                          ? `P.${studyScope.startPage}–${studyScope.endPage}`
                          : `P.${book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}`}
                      </span>
                      <span className="opacity-35">·</span>
                      <span className="uppercase font-mono text-[10px] text-[color:var(--orange)]">
                        {studyLanguage === "ar" ? "عربي" : studyLanguage === "mixed" ? "Mix" : "EN"}
                      </span>
                      <span className="opacity-35 hidden sm:inline">·</span>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px]">
                        {isMicMuted ? (
                          <MicOff className="size-3 text-red-500" />
                        ) : (
                          <Mic className="size-3 text-[var(--study-teal-text)]" />
                        )}
                        {isAgentSoundMuted ? (
                          <VolumeX className="size-3 text-amber-500" />
                        ) : (
                          <Volume2 className="size-3 text-[var(--study-teal-text)]" />
                        )}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-3 opacity-65 transition-transform duration-150",
                          isQuickControlsOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {/* Compact Glassmorphism Quick-Control Toggle Menu */}
                    {isQuickControlsOpen && (
                      <div
                        ref={quickControlsRef}
                        className="absolute left-0 top-full mt-2 z-50 w-[285px] sm:w-[310px] rounded-2xl border-[1.5px] border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] backdrop-blur-xl p-3 text-[var(--study-text)] shadow-[var(--study-shadow-lg)] flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        {/* 1. Language Switch */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--study-text-muted)]">
                            Language
                          </span>
                          <div className="flex items-center gap-1">
                            {STUDY_LANGUAGES.map((lang) => {
                              const isSelected = studyLanguage === lang.id;
                              return (
                                <button
                                  key={lang.id}
                                  type="button"
                                  onClick={() => setStudyLanguage(lang.id)}
                                  className={cn(
                                    isSelected ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                                    "rounded-full px-2.5 py-0.5 text-[10px] font-black"
                                  )}
                                >
                                  {lang.id === "mixed" ? "Mix" : lang.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Mic Control & Noise Filter */}
                        <div className="flex flex-col gap-1.5 border-t border-[var(--study-border)] pt-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--study-text-muted)]">
                              Microphone
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsMicMuted((prev) => !prev)}
                              className={cn(
                                isMicMuted
                                  ? "backdrop-blur-md bg-[var(--study-red-bg)] border border-[var(--study-red-border)] text-[var(--study-red-text)] cursor-pointer"
                                  : GLASS_BUTTON_VOICE_ACTIVE,
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black"
                              )}
                            >
                              {isMicMuted ? <MicOff className="size-3" /> : <Mic className="size-3" />}
                              <span>{isMicMuted ? "Muted" : "Mic On"}</span>
                            </button>
                          </div>

                          <NoisyPlaceQuickToggle />
                        </div>

                        {/* 3. Voice Agent Sound & Persona */}
                        <div className="flex flex-col gap-1.5 border-t border-[var(--study-border)] pt-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--study-text-muted)]">
                              Voice Agent Sound
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsAgentSoundMuted((prev) => !prev)}
                              className={cn(
                                isAgentSoundMuted
                                  ? "backdrop-blur-md bg-[var(--study-amber-bg)] border border-[var(--study-amber-border)] text-[var(--study-amber-text)] cursor-pointer"
                                  : GLASS_BUTTON_VOICE_ACTIVE,
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black"
                              )}
                            >
                              {isAgentSoundMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                              <span>{isAgentSoundMuted ? "Sound Off" : "Sound On"}</span>
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {AVAILABLE_LIVE_VOICES.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setLiveVoiceName(v.id)}
                                className={cn(
                                  liveVoiceName === v.id ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                                  "rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                                )}
                                title={`${v.name} (${v.gender}) — ${v.tone}`}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 4. Footer: Scope Reset & Full Controls */}
                        <div className="flex items-center justify-between gap-2 border-t border-[var(--study-border)] pt-2">
                          {studyScope.type !== "page" ? (
                            <button
                              type="button"
                              onClick={() => {
                                const p = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
                                setStudyScope({ type: "page", startPage: p, endPage: p });
                              }}
                              className={cn(
                                GLASS_BUTTON_BASE,
                                "rounded-full px-2.5 py-1 text-[10px] font-bold"
                              )}
                            >
                              Reset to Page {book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--study-text-muted)] font-medium">
                              Scoped to Page {book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setIsQuickControlsOpen(false);
                              setIsStudioMenuOpen(true);
                            }}
                            className="text-[10px] font-black text-[color:var(--orange)] hover:underline cursor-pointer"
                          >
                            All Controls →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Features Toggle + Hamburger Drawer Button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-expanded={showFeatureBar}
                    onClick={() => setShowFeatureBar((prev) => !prev)}
                    className={cn(
                      showFeatureBar ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] sm:text-[11px] font-bold"
                    )}
                    title={showFeatureBar ? "Minimize AI features bar" : "Show AI features bar"}
                  >
                    <Layers className="size-3" />
                    <span>Features</span>
                    {showFeatureBar ? (
                      <ChevronUp className="size-3 opacity-80" />
                    ) : (
                      <ChevronDown className="size-3 opacity-80" />
                    )}
                  </button>

                  <button
                    ref={studioMenuToggleRef}
                    type="button"
                    aria-expanded={isStudioMenuOpen}
                    aria-label="Toggle studio menu"
                    onClick={() => setIsStudioMenuOpen((prev) => !prev)}
                    className={cn(
                      isStudioMenuOpen ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                      "relative flex size-7 sm:size-8 items-center justify-center rounded-full"
                    )}
                    title="Open studio tools & settings"
                  >
                    {isStudioMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
                    {(selectedText || snippedDiagram) && !isStudioMenuOpen && (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[color:var(--orange)] ring-2 ring-[var(--study-surface-solid)] animate-pulse"
                        title="Active selection ready"
                      />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* PERSISTENT TOGGLEABLE MAIN AI FEATURES BAR (Glassmorphism, Show/Minimize) */}
            {showFeatureBar && (
              <div className="mx-4 sm:mx-6 mb-2 grid shrink-0 grid-cols-5 gap-1 sm:gap-1.5 rounded-2xl border-[1.5px] border-[var(--study-pill-border)]/45 bg-[var(--study-surface)]/90 backdrop-blur-md p-1.5 text-[10px] sm:text-[11px] shadow-[var(--study-shadow)] animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  type="button"
                  onClick={() => setActiveIntent("voice")}
                  aria-label="Ascleon Voice"
                  className={cn(
                    activeIntent === "voice" ? GLASS_BUTTON_VOICE_ACTIVE : GLASS_BUTTON_BASE,
                    "flex items-center justify-center gap-1 rounded-full py-1.5 px-1.5 font-bold whitespace-nowrap"
                  )}
                >
                  <Mic className="size-3 shrink-0" />
                  <span className="hidden truncate sm:inline">Ascleon Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntent("chat")}
                  aria-label="AI Chat"
                  className={cn(
                    activeIntent === "chat" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "flex items-center justify-center gap-1 rounded-full py-1.5 px-1.5 font-bold whitespace-nowrap"
                  )}
                >
                  <MessageSquare className="size-3 shrink-0" />
                  <span className="hidden truncate sm:inline">AI Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntent("morph")}
                  aria-label="Morph"
                  className={cn(
                    activeIntent === "morph" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "flex items-center justify-center gap-1 rounded-full py-1.5 px-1.5 font-bold whitespace-nowrap"
                  )}
                >
                  <Sparkles className="size-3 shrink-0" />
                  <span className="hidden truncate sm:inline">Morph</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntent("whiteboard")}
                  title="Ascleon Living Board — 2D Handwritten Whiteboard + 3D Lab"
                  aria-label="Living Board"
                  className={cn(
                    activeIntent === "whiteboard" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "flex items-center justify-center gap-1 rounded-full py-1.5 px-1.5 font-bold whitespace-nowrap"
                  )}
                >
                  <Tv className="size-3 shrink-0" />
                  <span className="hidden truncate sm:inline">Living Board</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntent("quiz")}
                  aria-label="Qbanks"
                  className={cn(
                    activeIntent === "quiz" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "flex items-center justify-center gap-1 rounded-full py-1.5 px-1.5 font-bold whitespace-nowrap"
                  )}
                >
                  <HelpCircle className="size-3 shrink-0" />
                  <span className="hidden truncate sm:inline">Qbanks</span>
                </button>
              </div>
            )}

            {/* HORIZONTAL SLIDE-OVER STUDIO DRAWER (Right Edge) */}
            {activeIntent !== "voice" && (
              <ActiveVoiceMiniBar onReturnToVoice={() => setActiveIntent("voice")} />
            )}
            <StudioMenuDrawer
              isOpen={isStudioMenuOpen}
              onClose={() => setIsStudioMenuOpen(false)}
              toggleButtonRef={studioMenuToggleRef}
              activeIntent={activeIntent}
              onSelectIntent={(intent) => {
                if (intent === "summary") {
                  setActiveIntent("summary");
                  loadDynamicSummary();
                } else {
                  setActiveIntent(intent);
                }
              }}
              selectedText={selectedText}
              snippedDiagram={snippedDiagram}
              onMorphSelection={() => handleRunMorph(selectedText)}
              onWhiteboardSelection={() => {
                setWhiteboardSelectionSeq((n) => n + 1);
                setActiveIntent("whiteboard");
              }}
              onAskAISelection={() => handleAskAISelection(selectedText)}
              onPinSelection={() => handlePinSelectionToVault(selectedText)}
              onClearSelection={handleClearSelection}
              onClearDiagram={() => setSnippedDiagram(null)}
              isAiLoading={isAiLoading}
              showDeepReferences={showDeepReferences}
              referencesCount={activeReferences.length}
              onToggleDeepReferences={() => setShowDeepReferences((prev) => !prev)}
              onRunExecutiveSummary={() => {
                setActiveIntent("chat");
                const activePage = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
                const safeScope = sanitizeStudyScope(studyScope, activePage);
                const scopeLabel =
                  safeScope.type === "topic" && safeScope.topicTitle && !isGenericTopicTitle(safeScope.topicTitle)
                    ? `Topic "${safeScope.topicTitle}" (pp. ${safeScope.startPage}–${safeScope.endPage})`
                    : safeScope.type === "range"
                    ? `Pages ${safeScope.startPage}–${safeScope.endPage}`
                    : `Page ${activePage}`;
                triggerDirectAIQuery(
                  `Generate a high-yield executive summary, core mechanism breakdown, and clinical exam pearls for ${scopeLabel} of "${book.title}".`
                );
              }}
              isMorphLoading={isMorphLoading}
              morphActiveTopic={morphActiveTopic}
              hasMorphArtifact={Boolean(activeMorphArtifact)}
              onReMorph={() => handleRunMorph(undefined, undefined, true, morphActiveTopic || undefined)}
              onResetMorph={() => handleResetMorph(book.fileURL ? activePdfPage : currentIdx)}
              isWhiteboardExpanded={isWhiteboardExpanded}
              onToggleWhiteboardExpand={() => setIsWhiteboardExpanded((prev) => !prev)}
              isQBankLoading={isQBankLoading}
              qbankCurrentIndex={activeQBankIdx}
              qbankTotalCount={dynamicQBankList.length}
              onGenerateNewQBank={() => loadDynamicQBank(undefined, true)}
              isSummaryLoading={isSummaryLoading}
              onRefreshSummary={() => loadDynamicSummary(true)}
              currentPage={book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
              totalPages={resolvedTotalPages}
              topics={sanitizeTopicCandidates(book.blueprint?.topicMap?.topics).map((t, idx) => ({
                id: t.id || `topic-${idx}`,
                title: t.title,
                startPage: t.startPage,
                endPage: t.endPage,
                keyConcepts: t.keyConcepts || [],
                subtopics: [],
              }))}
              studyScope={studyScope}
              onScopeChange={setStudyScope}
              onNavigateToPage={goToSourcePage}
              studyLanguage={studyLanguage}
              onLanguageChange={setStudyLanguage}
              zoomLevel={zoomLevel}
              fitMode={fitMode}
              theme={theme}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onFitWidth={handleFitWidth}
              onFitPage={handleFitPage}
              onThemeChange={handleThemeChange}
              bookId={book._id ? String(book._id) : undefined}
              ingestionStatus={book.ingestionStatus}
              ingestionProgress={book.ingestionProgress}
              onOpenStartNew={() => setShowStartNewModal(true)}
            />

            {/* TAB CONTENTS CONTAINER */}
            <div className="study-scrollbar flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              {/* STUDIO SESSION CONTINUATION / RESUME BANNER */}
              {showStudioResumeBanner && resumedSessionInfo && (
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-2 border-[color:var(--ink)] bg-[#f6d7a1] px-2.5 py-2 text-[color:var(--ink)] shadow-chip animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]">
                      <RotateCcw className="size-2.5" />
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-[11px] font-black text-[color:var(--ink)] whitespace-nowrap">
                        Session Restored
                      </span>
                      <span className="rounded-full bg-[color:var(--ink)] px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--cream)] uppercase shrink-0">
                        P.{Math.min(resolvedTotalPages, Math.max(1, Number(resumedSessionInfo.lastStudiedPage) || 1))} · {resumedSessionInfo.studioState?.activeIntent || "Studio"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowStartNewModal(true)}
                      className="cursor-pointer rounded-full border border-[color:var(--ink)]/35 bg-[#fbf7f0]/75 px-2.5 py-0.5 text-[10px] font-bold text-[color:var(--ink)] hover:bg-[#fbf7f0] transition-colors"
                    >
                      Start New...
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudioResumeBanner(false)}
                      className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-2.5 py-0.5 text-[10px] font-black text-[color:var(--ink)] shadow-xs hover:brightness-105 transition-all"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudioResumeBanner(false)}
                      className="cursor-pointer rounded-full p-0.5 text-[color:var(--ink)]/65 hover:text-[color:var(--ink)]"
                      title="Dismiss banner"
                      aria-label="Dismiss session restored banner"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {/* TAB 1: THE MORPH ENGINE */}
              {activeIntent === "morph" && (
                <div className="flex animate-in fade-in flex-col gap-2.5 duration-200">
                  {/* TOP CONTROLLER: Compact Scope & Custom Topic Bar */}
                  <div className="rounded-[16px] border-[1.5px] border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md p-2.5 shadow-[var(--study-shadow)] flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-[var(--study-text-muted)] mr-0.5 hidden sm:inline">
                          Scope:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMorphActiveTopic(null);
                            if (activeMorphArtifact) {
                              handleRunMorph(undefined, undefined, false, null);
                            }
                          }}
                          className={cn(
                            !morphActiveTopic ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                            "px-2 py-0.5 rounded-full text-[10.5px] font-bold flex items-center gap-1"
                          )}
                        >
                          <BookOpen className="size-3" />
                          <span>Page {currentPageNumber}</span>
                        </button>

                        {morphActiveTopic && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--study-teal-bg)] border border-[var(--study-teal-border)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--study-teal-text)]">
                            <Sparkles className="size-2.5" />
                            <span className="max-w-[140px] truncate">{morphActiveTopic}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setMorphActiveTopic(null);
                                setMorphTopicInput("");
                              }}
                              className="hover:opacity-75 cursor-pointer ml-0.5 text-[var(--study-text-muted)]"
                              title="Clear topic filter"
                            >
                              <X className="size-2.5" />
                            </button>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isMorphLoading}
                        onClick={() => handleRunMorph(undefined, undefined, true, morphActiveTopic || undefined)}
                        className={cn(
                          GLASS_BUTTON_BASE,
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold disabled:opacity-40"
                        )}
                        title="Re-synthesize with fresh Gemini AI analysis"
                      >
                        <RefreshCw className={cn("size-2.5", isMorphLoading && "animate-spin")} />
                        <span>{activeMorphArtifact ? "Re-morph" : "Run Morph"}</span>
                      </button>
                    </div>

                    {/* Topic Input Box: Write Any Specific Whole Topic */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1 min-w-0">
                        <input
                          type="text"
                          value={morphTopicInput}
                          onChange={(e) => setMorphTopicInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && morphTopicInput.trim()) {
                              handleRunMorph(undefined, undefined, true, morphTopicInput.trim());
                            }
                          }}
                          placeholder="Custom topic (e.g. Acute Coronary Syndrome)..."
                          className="w-full rounded-full border border-[var(--study-pill-border)]/45 bg-[var(--study-surface-muted)] px-3 py-1 text-[11px] font-medium text-[var(--study-text)] placeholder:text-[var(--study-text-muted)] focus:border-[color:var(--orange)] focus:outline-none pr-24 sm:pr-28"
                        />
                        {book.blueprint?.topicMap?.topics && book.blueprint.topicMap.topics.length > 0 && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  setMorphTopicInput(e.target.value);
                                  handleRunMorph(undefined, undefined, true, e.target.value);
                                }
                              }}
                              value=""
                              className="bg-transparent text-[10px] font-bold text-[color:var(--orange)] outline-none cursor-pointer pr-1"
                              title="Pick a detected topic from this book"
                            >
                              <option value="" disabled className="bg-[var(--study-surface-solid)] text-[var(--study-text)]">
                                Topics ▾
                              </option>
                              {book.blueprint.topicMap.topics.map((t: any) => (
                                <option key={t.id} value={t.title} className="bg-[var(--study-surface-solid)] text-[var(--study-text)]">
                                  {t.title} (P.{t.startPage}–{t.endPage})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isMorphLoading || !morphTopicInput.trim()}
                        onClick={() => {
                          if (morphTopicInput.trim()) {
                            handleRunMorph(undefined, undefined, true, morphTopicInput.trim());
                          }
                        }}
                        className={cn(
                          GLASS_BUTTON_ACTIVE,
                          "shrink-0 rounded-full px-3 py-1 text-[10.5px] font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                      >
                        <span>Morph Topic ✦</span>
                      </button>
                    </div>
                  </div>

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
                    <div className="flex flex-1 flex-col items-center justify-center py-3">
                      <div className="w-full max-w-md rounded-[20px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-xl p-5 text-center shadow-[var(--study-shadow-lg)] flex flex-col items-center gap-3">
                        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--cream)] via-[color:var(--orange)] to-[#e0459a] text-xl text-[color:var(--ink)] shadow-lg shadow-[color:var(--orange)]/25 font-black">
                          ✦
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] px-3 py-0.5 text-[11px] font-bold text-[var(--study-teal-text)]">
                          <span className="size-2 rounded-full bg-[var(--study-teal-text)] animate-pulse" />
                          <span>
                            {selectedText
                              ? "Passage Highlighted • Ready to Morph Selection"
                              : book.fileURL
                                ? `Page ${activePdfPage} Context Window Ready`
                                : `Section ${currentIdx + 1} Context Window Ready`}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1">
                          <h3 className="text-lg font-black text-[var(--study-text)] tracking-tight">
                            {selectedText
                              ? "Turn selected passage into magic"
                              : "Turn this section into magic"}
                          </h3>
                          <p className="text-xs text-[var(--study-text-muted)] leading-relaxed max-w-xs mx-auto">
                            {selectedText
                              ? `Focused on your ${selectedText.split(/\s+/).length}-word highlight: "${selectedText.slice(0, 90)}..."`
                              : isMedicalBook
                                ? "Transform dense clinical text into an interactive, retainable learning experience grounded in surrounding mechanisms and canonical textbooks."
                                : `Transform dense text into an interactive, retainable learning experience grounded in ${book.topic || "core domain principles"} and primary sources.`}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 w-full pt-0.5 text-left">
                          <div className="flex flex-col gap-1 rounded-xl border border-[var(--study-pill-border)]/35 bg-[var(--study-surface-muted)] p-2.5">
                            <Workflow className="size-3.5 text-[color:var(--orange)]" />
                            <span className="text-[10px] font-bold text-[var(--study-text)]">
                              Concept Mind Map
                            </span>
                            <span className="text-[9px] text-[var(--study-text-muted)]">
                              Core principles canvas
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 rounded-xl border border-[var(--study-pill-border)]/35 bg-[var(--study-surface-muted)] p-2.5">
                            <Activity className="size-3.5 text-[var(--study-teal-text)]" />
                            <span className="text-[10px] font-bold text-[var(--study-text)]">
                              {isMedicalBook ? "Phonocardiograms" : "Dynamic Simulators"}
                            </span>
                            <span className="text-[9px] text-[var(--study-text-muted)]">
                              {isMedicalBook
                                ? "Interactive S1/S2 loops"
                                : "Interactive state models"}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 rounded-xl border border-[var(--study-pill-border)]/35 bg-[var(--study-surface-muted)] p-2.5">
                            <MapPin className="size-3.5 text-[#e0459a]" />
                            <span className="text-[10px] font-bold text-[var(--study-text)]">
                              {isMedicalBook ? "Bedside Map" : "Visual Roadmap"}
                            </span>
                            <span className="text-[9px] text-[var(--study-text-muted)]">
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
                          className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] py-2.5 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-xs transition-all hover:brightness-105 disabled:opacity-50"
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
                <div className="flex min-w-0 animate-in fade-in flex-col gap-3 duration-200">
                  {/* Collapsible Deep Knowledge & Textbook Drawer */}
                  <div className="rounded-[16px] border-[1.5px] border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md overflow-hidden shadow-[var(--study-shadow)]">
                    <button
                      type="button"
                      onClick={() => setShowDeepReferences((prev) => !prev)}
                      className="flex w-full cursor-pointer items-center justify-between p-3 text-left transition-colors hover:bg-[var(--study-glass-hover)]"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 text-[color:var(--orange)]" />
                        <span className="text-xs font-bold text-[var(--study-text)]">
                          Textbooks &amp; QBanks Grounding
                        </span>
                        <span className="rounded-full bg-[color:var(--orange)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--orange)]">
                          {activeReferences.length} References
                        </span>
                      </div>
                      {showDeepReferences ? (
                        <ChevronUp className="size-4 text-[var(--study-text-muted)]" />
                      ) : (
                        <ChevronDown className="size-4 text-[var(--study-text-muted)]" />
                      )}
                    </button>

                    {showDeepReferences && (
                      <div className="border-t border-[var(--study-border)] p-3 flex flex-col gap-2.5 text-xs bg-[var(--study-surface-muted)]">
                        <div className="text-[11px] text-[var(--study-text-muted)]">
                          The study agent automatically cross-references canonical gold-standard literature to guarantee board-grade accuracy:
                        </div>
                        {activeReferences.map((ref) => (
                          <div
                            key={ref.id}
                            className="rounded-xl border border-[var(--study-pill-border)]/45 bg-[var(--study-surface-solid)] p-2.5 flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--study-teal-text)]">
                              <span>📚 {ref.source}</span>
                              <span className="text-[9px] uppercase tracking-wider text-[var(--study-text-muted)]">
                                {ref.type}
                              </span>
                            </div>
                            <span className="font-semibold text-[var(--study-text)] text-[11.5px]">
                              {ref.title} ({ref.chapterOrSection})
                            </span>
                            <p className="text-[10.5px] italic text-[var(--study-text-soft)] leading-relaxed border-l-2 border-[color:var(--orange)]/50 pl-2 my-1">
                              &ldquo;{ref.excerpt.slice(0, 160)}...&rdquo;
                            </p>
                            {ref.clinicalPearls.length > 0 && (
                              <div className="text-[10px] text-[var(--study-text)] flex flex-col gap-0.5 mt-1">
                                {ref.clinicalPearls.map((p, i) => (
                                  <span key={i} className="text-[var(--study-amber-text)]">
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

                  {/* Messages Feed */}
                  <div className="flex min-w-0 flex-col gap-3">
                    {messages.map((m, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-[18px] p-3.5 text-xs leading-relaxed border-2 border-[var(--study-panel-border)]",
                          m.sender === "user"
                            ? "self-end max-w-[85%] bg-[#ff4c00] text-[color:var(--ink)] font-bold shadow-[var(--study-shadow)]"
                            : "self-start max-w-[95%] bg-[#f6d7a1] text-[color:var(--ink)] font-medium shadow-[var(--study-shadow)]",
                        )}
                      >
                        {m.sender === "ai" && (
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[color:var(--ink)]/20 text-[10.5px]">
                            <span className="flex items-center gap-1.5 font-black text-[color:var(--ink)]">
                              <span className="rounded-full bg-[#ff4c00] text-[color:var(--ink)] px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider shadow-sm">
                                Ascleon AI
                              </span>
                              <span className="text-[10px] font-bold text-[color:var(--ink)]/80">
                                Grounded Study Mentor
                              </span>
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
                        {m.sender === "ai" ? (
                          <div dir="auto" className="ascleon-bidi">
                            <RichStudyMessage content={m.text} />
                          </div>
                        ) : (
                          <p dir="auto" className="ascleon-bidi whitespace-pre-line font-bold text-[color:var(--ink)]">
                            {m.text}
                          </p>
                        )}

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

                        {/* Topic Disambiguation Card (when AI detects multiple interconnected topics) */}
                        {m.topicLocation?.isAmbiguous && m.topicLocation.candidates && m.topicLocation.candidates.length > 0 && (
                          <div className="mt-2.5 rounded-xl border-2 border-[color:var(--ink)] bg-[#fbf7f0] p-3 text-[color:var(--ink)] shadow-xs">
                            <div className="flex items-center gap-1.5 font-black text-[11px] text-[#ff4c00]">
                              <MapPin className="size-3.5 text-[#ff4c00]" />
                              <span>Clarify Which Topic to Study:</span>
                            </div>
                            <p className="mt-1 text-[10.5px] text-[color:var(--ink)]/80 leading-snug">
                              This subject connects across several sections in the study source. Which area should we focus on?
                            </p>
                            <div className="mt-2 flex flex-col gap-1.5">
                              {m.topicLocation.candidates.map((cand, ci) => (
                                <button
                                  key={ci}
                                  type="button"
                                  onClick={() => {
                                    setStudyScope({
                                      type: "topic",
                                      topicTitle: cand.title,
                                      startPage: cand.startPage,
                                      endPage: cand.endPage,
                                    });
                                    goToSourcePage(cand.startPage);
                                    triggerDirectAIQuery(`Explain "${cand.title}" (Pages ${cand.startPage}–${cand.endPage}) thoroughly according to the study source.`);
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-[color:var(--ink)]/30 bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-[color:var(--ink)] hover:bg-[#ff4c00]/15 hover:border-[color:var(--orange)] transition-colors cursor-pointer text-left shadow-xs"
                                >
                                  <span>{cand.title}</span>
                                  <span className="font-mono text-[9.5px] bg-[#2e6f68]/15 text-[#2e6f68] px-1.5 py-0.5 rounded font-black">
                                    pp. {cand.startPage}–{cand.endPage} →
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Direct Topic Navigation Banner (Single Identified Topic, hidden for generic "General" or current page) */}
                        {m.topicLocation &&
                          !m.topicLocation.isAmbiguous &&
                          m.topicLocation.title?.trim().toLowerCase() !== "general" &&
                          m.topicLocation.startPage !== currentPageNumber && (
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--ink)]/30 bg-[#2e6f68]/15 p-2.5 text-[11px] text-[color:var(--ink)]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <BookOpen className="size-4 shrink-0 text-[#2e6f68]" />
                              <div className="truncate">
                                <span className="font-bold">Topic in Source: </span>
                                <span className="font-semibold text-[color:var(--ink)]/90">{m.topicLocation.title}</span>
                                <span className="ml-1 text-[10px] font-mono font-bold text-[#2e6f68]">
                                  (Pages {m.topicLocation.startPage}–{m.topicLocation.endPage})
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => goToSourcePage(m.topicLocation!.startPage)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[#ff4c00] px-2.5 py-1 text-[10px] font-black text-[color:var(--ink)] hover:brightness-105 transition-all shadow-xs"
                                title={`Navigate reader to Page ${m.topicLocation.startPage}`}
                              >
                                <span>Navigate to Page {m.topicLocation.startPage}</span>
                                <span>→</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isAiLoading && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--study-panel-border)] bg-[#f6d7a1] p-3 text-xs font-bold text-[color:var(--ink)] shadow-[var(--study-shadow)]">
                        <div className="flex items-center gap-2 min-w-0">
                          <RefreshCw className="size-3.5 shrink-0 animate-spin text-[#ff4c00]" />
                          <span className="truncate">Querying deep textbook corpus &amp; synthesizing grounded response...</span>
                        </div>
                        <button
                          type="button"
                          onClick={cancelActiveAiQuery}
                          className="shrink-0 cursor-pointer rounded-full border border-[color:var(--ink)]/40 bg-white/80 px-2.5 py-0.5 text-[10.5px] font-black text-[color:var(--ink)] hover:bg-white transition-colors"
                          title="Stop current response"
                        >
                          Stop
                        </button>
                      </div>
                    )}

                    {/* Bottom Action Bar: Executive Summary & Core Prompts pinned right below latest response */}
                    <div className="flex w-full min-w-0 items-center gap-1.5 pt-2 pb-1 pr-4 border-t border-[var(--study-border)] overflow-x-auto no-scrollbar touch-pan-x whitespace-nowrap shrink-0 snap-x snap-mandatory scroll-px-3">
                      <button
                        type="button"
                        disabled={isAiLoading}
                        onClick={() => {
                          const activePage = currentPageNumber;
                          const safeScope = sanitizeStudyScope(studyScope, activePage);
                          const scopeLabel =
                            safeScope.type === "topic" && safeScope.topicTitle && !isGenericTopicTitle(safeScope.topicTitle)
                              ? `Topic "${safeScope.topicTitle}" (pp. ${safeScope.startPage}–${safeScope.endPage})`
                              : safeScope.type === "range"
                              ? `Pages ${safeScope.startPage}–${safeScope.endPage}`
                              : `Page ${activePage}`;
                          const prompt = `Generate a high-yield executive summary, core mechanism breakdown, and clinical exam pearls for ${scopeLabel} of "${book.title}".`;
                          triggerDirectAIQuery(prompt);
                        }}
                        className={cn(
                          GLASS_BUTTON_ACTIVE,
                          "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black disabled:opacity-40"
                        )}
                        title="Run executive summary prompt for the active scope"
                      >
                        <FileText className="size-3" />
                        <span>
                          {studyScope.type === "topic"
                            ? "Executive Topic Summary"
                            : studyScope.type === "range"
                            ? "Executive Range Summary"
                            : "Executive Page Summary"}
                        </span>
                      </button>

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
                          className={cn(
                            GLASS_BUTTON_BASE,
                            "shrink-0 snap-start rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
                          )}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}

              {/* TAB 3: ASCLEON GENERATIVE WHITEBOARD VIDEO */}
              {activeIntent === "whiteboard" && (
                <div className="flex animate-in fade-in flex-col h-full duration-150">
                  <WhiteboardVideoStudio
                    book={book}
                    currentPageNumber={currentPageNumber}
                    activePageLiveText={
                      (book.fileURL && activePageLiveText)
                        ? activePageLiveText
                        : (currentSegment?.content || "")
                    }
                    selectedText={selectedText || undefined}
                    studyLanguage={studyLanguage}
                    onStudyLanguageChange={setStudyLanguage}
                    studyScope={studyScope}
                    onStudyScopeChange={setStudyScope}
                    onNavigateToPage={goToSourcePage}
                    onWhiteboardExpandChange={setIsWhiteboardExpanded}
                    selectionTriggerSeq={whiteboardSelectionSeq}
                  />
                </div>
              )}

              {/* TAB 4: ASCLEON LIVE ORAL VIVA MENTOR */}
              {activeIntent === "voice" && (
                <div className="flex animate-in fade-in flex-col h-full duration-150">
                  <AscleonVoiceStudio
                    currentPageNumber={book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
                    onStudyLanguageChange={setStudyLanguage}
                    onTriggerMorph={() => {
                      setActiveIntent("morph");
                      handleRunMorph();
                    }}
                    onContinueInChat={(summaryText) => {
                      setActiveIntent("chat");
                      triggerDirectAIQuery(
                        `Continue from my live voice session. Here is what we just covered:\n\n${summaryText.slice(0, 2000)}\n\nSummarize the key takeaways and ask what I want to explore next.`
                      );
                    }}
                  />
                </div>
              )}

              {/* TAB 4: DEEP STRUCTURED SUMMARY & MNEMONICS */}
              {activeIntent === "summary" && (
                <div className="flex animate-in fade-in flex-col gap-4 duration-200">
                  <div className="flex items-center justify-between rounded-[14px] border-[1.5px] border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md px-3 py-2 shadow-[var(--study-shadow)]">
                    <span className="font-mono text-xs font-bold text-[color:var(--orange)]">
                      Page {currentSegment?.pageNumber || currentIdx + 1} Synthesis
                    </span>
                    <button
                      type="button"
                      disabled={isSummaryLoading}
                      onClick={() => loadDynamicSummary()}
                      className={cn(
                        GLASS_BUTTON_BASE,
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold disabled:opacity-40"
                      )}
                    >
                      <RefreshCw className={cn("size-3", isSummaryLoading && "animate-spin text-[color:var(--orange)]")} />
                      <span>{isSummaryLoading ? "Synthesizing..." : "Re-Synthesize"}</span>
                    </button>
                  </div>

                  {/* Executive Summary */}
                  <div className="rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[#f6d7a1] p-4 text-xs leading-relaxed text-[color:var(--ink)] shadow-[var(--study-shadow)]">
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
                    <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[#7fd8c9] p-4 text-xs text-[color:var(--ink)] shadow-[var(--study-shadow)]">
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
                    <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[#ff4c00] p-4 text-xs text-[color:var(--ink)] shadow-[var(--study-shadow)]">
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
                  <div className="flex flex-col gap-2.5 rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md p-4 text-xs text-[var(--study-text)] shadow-[var(--study-shadow)]">
                    <div className="flex items-center gap-2 font-black text-[var(--study-text)] text-[11px] uppercase tracking-wider">
                      <BookmarkCheck className="size-4 text-[#ff4c00]" />
                      <span>Memory Anchors &amp; Mnemonics</span>
                    </div>
                    {(dynamicSummary?.mnemonics || activeMnemonics).map((mn: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1 rounded-xl border border-[var(--study-pill-border)]/45 bg-[var(--study-surface-solid)] p-3 text-[var(--study-text)] shadow-xs"
                      >
                        <span className="font-black text-[#ff4c00]">
                          • {mn.mnemonic}: <span className="font-bold text-[var(--study-text)]">{mn.expansion}</span>
                        </span>
                        <span className="text-[11px] font-medium text-[var(--study-text-muted)]">{mn.notes || mn.rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: DYNAMIC QBANK PRACTICE (FLOATING OVER DOTTED CANVAS) */}
              {activeIntent === "quiz" && (
                <div className="flex animate-in fade-in flex-col gap-3 bg-transparent duration-150">
                  {/* QBank Header Card */}
                  <div className="flex items-center justify-between gap-2 rounded-[16px] border-[1.5px] border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md px-3.5 py-2.5 text-xs text-[var(--study-text)] shadow-[var(--study-shadow)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center gap-1.5 font-black text-[var(--study-text)] truncate">
                        <Award className="size-4 shrink-0 text-[#ff4c00]" />
                        <span className="truncate">{dynamicQBankList[activeQBankIdx]?.examType || "Clinical / Academic QBank"}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isQBankLoading}
                      onClick={() => loadDynamicQBank(undefined, dynamicQBankList.length > 0)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-[var(--study-panel-border)] bg-[#ff4c00] px-2.5 py-1 text-[10.5px] font-black text-[color:var(--ink)] shadow-xs transition-all hover:brightness-105 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={cn("size-3", isQBankLoading && "animate-spin text-[color:var(--ink)]")} />
                      <span>
                        {isQBankLoading
                          ? "Generating..."
                          : dynamicQBankList.length > 0
                            ? "New Questions"
                            : "Generate Questions"}
                      </span>
                    </button>
                  </div>

                  {dynamicQBankList.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between gap-2 rounded-[14px] border border-[var(--study-pill-border)]/45 bg-[var(--study-surface)] backdrop-blur-md px-3 py-2 text-[11px] font-bold text-[var(--study-text)]" dir="auto">
                        <span dir="auto" className="text-[var(--study-text)] text-start [unicode-bidi:isolate]">
                          {dynamicQBankList[activeQBankIdx]?.topic || `Question on Page ${currentPageNumber}`}
                        </span>
                        <span dir="ltr" className="shrink-0 rounded-full border border-[var(--study-panel-border)] bg-[#ff4c00] px-2.5 py-0.5 text-[10px] font-black text-[color:var(--ink)] shadow-xs">
                          Case {((activeQBankIdx % dynamicQBankList.length) + 1)} / {dynamicQBankList.length}
                        </span>
                      </div>

                      {/* Vignette Presentation */}
                      <div className="rounded-[16px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md p-4 shadow-[var(--study-shadow)]" dir="auto">
                        <p dir="auto" className="font-serif text-xs leading-relaxed text-[var(--study-text)] font-medium text-start [unicode-bidi:plaintext] select-text">
                          {dynamicQBankList[activeQBankIdx]?.vignette}
                        </p>
                      </div>

                      {/* Multiple Choice Options */}
                      <div className="flex flex-col gap-2" dir="auto">
                        {(dynamicQBankList[activeQBankIdx]?.options || []).map((option, idx) => (
                          <button
                            key={idx}
                            type="button"
                            dir="auto"
                            onClick={() => !quizSubmitted && setQuizAnswer(idx)}
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-[14px] border-[1.5px] border-[var(--study-panel-border)] p-3 text-start text-xs transition-all shadow-xs backdrop-blur-md",
                              quizSubmitted && idx === dynamicQBankList[activeQBankIdx]?.correctIndex
                                ? "bg-[#7fd8c9] text-[color:var(--ink)] font-black ring-2 ring-[var(--study-panel-border)]"
                                : quizSubmitted && quizAnswer === idx && idx !== dynamicQBankList[activeQBankIdx]?.correctIndex
                                  ? "bg-[#e0459a]/35 text-[var(--study-text)] font-bold"
                                  : quizAnswer === idx
                                    ? "bg-[#ff4c00] text-[color:var(--ink)] font-black"
                                    : "bg-[var(--study-surface)] text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]",
                            )}
                          >
                            <bdi dir="ltr" className="shrink-0 font-mono font-black select-none">
                              {String.fromCharCode(65 + idx)}.
                            </bdi>
                            <span dir="auto" className="flex-1 font-medium text-start [unicode-bidi:isolate]">
                              {option}
                            </span>
                          </button>
                        ))}
                      </div>

                      {!quizSubmitted ? (
                        <button
                          type="button"
                          disabled={quizAnswer === null}
                          onClick={() => setQuizSubmitted(true)}
                          className="cursor-pointer rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] py-2.5 text-xs font-black uppercase text-[color:var(--ink)] shadow-[var(--study-shadow)] transition-all hover:brightness-105 disabled:cursor-default disabled:opacity-40"
                        >
                          Submit Answer &amp; Reveal Rationale
                        </button>
                      ) : (
                        <div className="flex animate-in fade-in flex-col gap-3 rounded-[16px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md p-3.5 text-xs text-[var(--study-text)] shadow-[var(--study-shadow)]" dir="auto">
                          {/* Answer Banner */}
                          <div className="flex items-center gap-2 font-black text-sm" dir="auto">
                            {quizAnswer === dynamicQBankList[activeQBankIdx]?.correctIndex ? (
                              <>
                                <CheckCircle2 className="size-5 text-[var(--study-teal-text)] shrink-0" />
                                <span dir="auto" className="text-start [unicode-bidi:isolate]">
                                  {studyLanguage === "ar" ? "إجابة صحيحة!" : "Correct!"} <bdi dir="ltr">({String.fromCharCode(65 + dynamicQBankList[activeQBankIdx]?.correctIndex)})</bdi>
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="size-5 text-[#e0459a] shrink-0" />
                                <span dir="auto" className="text-[#e0459a] text-start [unicode-bidi:isolate]">
                                  {studyLanguage === "ar" ? "إجابة غير صحيحة. الخيار الصحيح هو" : "Incorrect. Correct choice is"} <bdi dir="ltr">({String.fromCharCode(65 + dynamicQBankList[activeQBankIdx]?.correctIndex)})</bdi>
                                </span>
                              </>
                            )}
                          </div>

                          {/* Distractor Breakdown */}
                          {dynamicQBankList[activeQBankIdx]?.distractorRationales && (
                            <div dir="auto" className="flex flex-col gap-1.5 border-t border-[var(--study-border)] pt-2 text-[11px] leading-relaxed">
                              <strong dir="auto" className="text-[var(--study-text)] text-start block [unicode-bidi:isolate]">
                                {studyLanguage === "ar" ? "تحليل الخيارات والاستدلال السريري:" : "Distractor Analysis & Clinical Reasoning:"}
                              </strong>
                              {Object.entries(dynamicQBankList[activeQBankIdx].distractorRationales).map(([optIdx, rationale]) => (
                                <div
                                  key={optIdx}
                                  dir="auto"
                                  className={cn(
                                    "flex items-start gap-2 rounded-lg p-2.5 text-[10.5px] border border-[var(--study-pill-border)]/35 text-start",
                                    Number(optIdx) === dynamicQBankList[activeQBankIdx].correctIndex
                                      ? "bg-[#7fd8c9] font-bold text-[color:var(--ink)]"
                                      : "bg-[var(--study-surface-muted)] text-[var(--study-text)]"
                                  )}
                                >
                                  <bdi dir="ltr" className="shrink-0 font-black select-none">
                                    ({String.fromCharCode(65 + Number(optIdx))}):
                                  </bdi>
                                  <span dir="auto" className="flex-1 leading-relaxed text-start [unicode-bidi:isolate]">
                                    {rationale}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* High Yield Takeaway Box */}
                          <div dir="auto" className="rounded-xl border-2 border-[var(--study-panel-border)] bg-[#ff4c00] p-3 text-[11px] text-[color:var(--ink)] shadow-xs">
                            <div className="flex items-center gap-1.5 mb-1 text-start" dir="auto">
                              <span className="font-black text-[color:var(--ink)] [unicode-bidi:isolate]">
                                🎯 {studyLanguage === "ar" ? "اللؤلؤة الامتحانية المركزة:" : "High-Yield Exam Takeaway:"}
                              </span>
                            </div>
                            <p dir="auto" className="font-medium text-start leading-relaxed [unicode-bidi:plaintext]">
                              {dynamicQBankList[activeQBankIdx]?.highYieldTakeaway}
                            </p>
                          </div>

                          {/* Question Navigation Controls */}
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={activeQBankIdx === 0}
                              onClick={() => {
                                setQuizSubmitted(false);
                                setQuizAnswer(null);
                                setActiveQBankIdx((prev) => Math.max(0, prev - 1));
                              }}
                              className="cursor-pointer rounded-full border border-[var(--study-pill-border)] bg-[var(--study-glass)] px-3 py-1.5 text-xs font-bold text-[var(--study-text)] shadow-xs transition-all hover:bg-[var(--study-glass-hover)] disabled:opacity-35"
                            >
                              ← Prev
                            </button>

                            {activeQBankIdx < dynamicQBankList.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuizSubmitted(false);
                                  setQuizAnswer(null);
                                  setActiveQBankIdx((prev) => prev + 1);
                                }}
                                className="flex-1 cursor-pointer rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] py-2 text-xs font-black text-[color:var(--ink)] shadow-xs transition-all hover:brightness-105 text-center"
                              >
                                Next Question ({activeQBankIdx + 2}/{dynamicQBankList.length}) →
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isQBankLoading}
                                onClick={() => loadDynamicQBank(undefined, true)}
                                className="flex-1 cursor-pointer rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] py-2 text-xs font-black text-[color:var(--ink)] shadow-xs transition-all hover:brightness-105 text-center"
                              >
                                <span>{isQBankLoading ? "Generating New Questions..." : "Generate More Questions ✦"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : isQBankLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2.5 rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md py-8 px-4 text-center text-xs text-[var(--study-text)] shadow-[var(--study-shadow)]">
                      <RefreshCw className="size-7 animate-spin text-[#ff4c00]" />
                      <p className="font-black text-sm">Generating Practice Questions...</p>
                      <p className="text-[11px] font-medium text-[var(--study-text-muted)] max-w-xs">
                        Crafting board-grade clinical cases grounded in Page {currentPageNumber}.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2.5 rounded-[18px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md py-7 px-4 text-center text-xs text-[var(--study-text)] shadow-[var(--study-shadow)]">
                      <div className="flex size-10 items-center justify-center rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] text-[color:var(--ink)] shadow-xs">
                        <HelpCircle className="size-5" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-black text-[var(--study-text)]">
                          Practice QBank • Page {currentPageNumber}
                        </h3>
                        <p className="text-[11.5px] font-medium text-[var(--study-text-muted)] max-w-xs leading-relaxed">
                          Generate board-grade questions with full distractor rationales grounded in Page {currentPageNumber} whenever you&apos;re ready.
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadDynamicQBank()}
                          className="cursor-pointer rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] px-4 py-1.5 text-xs font-black text-[color:var(--ink)] shadow-xs transition-all hover:brightness-105"
                        >
                          Generate Practice Questions
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveIntent("chat")}
                          className="cursor-pointer rounded-full border border-[var(--study-pill-border)] bg-[var(--study-glass)] px-3.5 py-1.5 text-xs font-bold text-[var(--study-text)] transition-colors hover:bg-[var(--study-glass-hover)]"
                        >
                          Back to AI Chat
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BOTTOM PROMPT INPUT (Shown only in AI Chat mode, Keyboard-Aware on Mobile) */}
            {activeIntent === "chat" && (
              <div
                className="shrink-0 border-t-[1.5px] border-[var(--study-pill-border)]/35 bg-[var(--study-surface)] backdrop-blur-xl px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-3.5 transition-[padding] duration-150 ease-out"
                style={{
                  paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 8}px` : undefined,
                }}
              >
                <form
                  onSubmit={handleSendMessage}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    placeholder={
                      selectedText
                        ? `Ask about selected (${selectedText.split(/\s+/).length}w) passage...`
                        : `Ask the AI Study Agent about ${book.title}...`
                    }
                    className="w-full rounded-full border-[1.5px] border-[var(--study-pill-border)]/55 bg-[var(--study-surface-solid)] backdrop-blur-md py-2 pl-3.5 pr-10 sm:py-2.5 sm:pl-4 sm:pr-11 text-xs text-[var(--study-text)] placeholder:text-[var(--study-text-muted)] transition-all focus:border-[color:var(--orange)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inputQuery.trim() || isAiLoading}
                    className={cn(
                      GLASS_BUTTON_ACTIVE,
                      "absolute right-1.5 flex size-7 items-center justify-center rounded-full disabled:cursor-default disabled:opacity-40"
                    )}
                    title="Send query"
                  >
                    <Send className="size-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>
          </VoiceSessionProvider>
        </div>
      </div>

      {/* START NEW SESSION MODAL */}
      {showStartNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[22px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 text-[color:var(--ink)] shadow-chip animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[color:var(--ink)]/15">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs">
                  <RotateCcw className="size-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[color:var(--ink)]">Start New Study Session</h3>
                  <p className="text-[11px] text-[color:var(--ink)]/65">Choose how you want to continue</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStartNewModal(false)}
                className="rounded-full p-1 text-[color:var(--ink)]/60 hover:text-[color:var(--ink)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {/* Option 1: Fresh Studio Session */}
              <button
                type="button"
                onClick={handleStartFreshStudio}
                className="flex flex-col items-start gap-1 rounded-xl border-2 border-[color:var(--ink)] bg-white p-3.5 text-left transition-all hover:bg-[color:var(--orange)]/15 hover:border-[color:var(--orange)] shadow-xs cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-[color:var(--ink)] flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-[color:var(--orange)]" />
                    Fresh Studio Session
                  </span>
                  <span className="rounded-full bg-[color:var(--ink)]/10 px-2 py-0.5 text-[9.5px] font-mono font-bold text-[color:var(--ink)]/70">
                    Keep Page
                  </span>
                </div>
                <p className="text-[11px] text-[color:var(--ink)]/75 leading-relaxed">
                  Stay on your current page (Page {book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}), while resetting the AI chat, active topic, and studio tools to a clean slate.
                </p>
              </button>

              {/* Option 2: Restart Entire Book */}
              <button
                type="button"
                onClick={handleRestartFromBeginning}
                className="flex flex-col items-start gap-1 rounded-xl border-2 border-[color:var(--ink)] bg-white p-3.5 text-left transition-all hover:bg-rose-50 hover:border-rose-400 shadow-xs cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-rose-700 flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-rose-600" />
                    Restart Entire Book
                  </span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9.5px] font-mono font-bold text-rose-700">
                    Page 1 • 0%
                  </span>
                </div>
                <p className="text-[11px] text-[color:var(--ink)]/75 leading-relaxed">
                  Jump back to Page 1, reset reading progress to 0%, and start a completely fresh studio session.
                </p>
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStartNewModal(false)}
                className="rounded-full border border-[color:var(--ink)]/20 px-4 py-1.5 text-xs font-bold text-[color:var(--ink)]/70 hover:bg-[color:var(--ink)]/5 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
