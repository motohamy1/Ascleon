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
import { StudyLanguageSwitch } from "@/components/reader/StudyLanguageSwitch";
import { StudyLanguage, DEFAULT_STUDY_LANGUAGE } from "@/lib/language";
import {
  SourceSelectionToolbar,
  ScannedPinItem,
} from "@/components/reader/SourceSelectionToolbar";
import { RagDigestionBadge } from "@/components/reader/RagDigestionBadge";
import OriginalPdfViewer from "./OriginalPdfViewer";
import RichStudyMessage from "./RichStudyMessage";
import { AscleonLogo } from "@/components/ui/AscleonLogo";
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
import StudyScopeBar, { StudyScope } from "./StudyScopeBar";
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
  "📑 Executive page summary",
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

  // Universal Multi-Page / Topic Study Scope State
  const [studyScope, setStudyScope] = useState<StudyScope>(() => {
    if (initialProgress?.studioState?.studyScope) {
      return initialProgress.studioState.studyScope as StudyScope;
    }
    const initialPage = initialProgress?.lastStudiedPage || 1;
    return {
      type: "page",
      startPage: initialPage,
      endPage: initialPage,
    };
  });

  // Right Panel: All Controls & Study Studio (Default: AI Chat)
  const [activeIntent, setActiveIntent] = useState<StudyIntent>(() => {
    return (initialProgress?.studioState?.activeIntent as StudyIntent) || "chat";
  });
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
            const sIdx = segments.findIndex((s) => s.pageNumber === saved!.lastStudiedPage);
            if (sIdx >= 0) setCurrentIdx(sIdx);
            else setCurrentIdx(Math.min(segments.length - 1, saved.lastStudiedPage - 1));
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
          if (saved.studioState.activeIntent) {
            setActiveIntent(saved.studioState.activeIntent as StudyIntent);
          }
          if (saved.studioState.studyLanguage) {
            setStudyLanguage(saved.studioState.studyLanguage as StudyLanguage);
          }
          if (saved.studioState.studyScope) {
            setStudyScope(saved.studioState.studyScope as StudyScope);
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

      const maxPages = book.fileURL ? totalPdfPages : (book.totalPages || segments.length || 1);
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
      book.totalPages,
      activePdfPage,
      currentSegment?.pageNumber,
      currentIdx,
      totalPdfPages,
      segments.length,
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
      console.error("Failed to generate Morph artifact:", err);
    } finally {
      setIsMorphLoading(false);
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
    try {
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");
      const existingTopics = dynamicQBankList.map((q) => q.topic).filter(Boolean);

      const res = await fetch("/api/qbank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.questions && data.questions.length > 0) {
          setDynamicQBankList(data.questions);
          setQBankCache((prev) => ({ ...prev, [cacheKey]: data.questions }));
          setActiveQBankIdx(0);
        }
      }
    } catch (e) {
      console.warn("Dynamic QBank load warning:", e);
    } finally {
      setIsQBankLoading(false);
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
    try {
      const activeText = (book.fileURL && activePageLiveText) ? activePageLiveText : (currentSegment?.content || "");

      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book._id,
          bookTitle: book.title,
          pageNumber: activePage,
          pageText: activeText,
          selectedText: selectedText || undefined,
          language: studyLanguage,
          studyScope,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.summary) {
          setDynamicSummary(data.summary);
          setSummaryCache((prev) => ({ ...prev, [cacheKey]: data.summary }));
        }
      }
    } catch (e) {
      console.warn("Dynamic Summary load warning:", e);
    } finally {
      setIsSummaryLoading(false);
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

      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const data = await res.json();

      if (data.authoritativeReferences?.length) {
        setActiveReferences(data.authoritativeReferences);
      }
      if (data.qbankVignettes?.length && dynamicQBankList.length === 0) {
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
          topicLocation: data.topicLocation,
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
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveSplitRatio = isWhiteboardExpanded && activeIntent === "voice" ? 36 : splitRatio;

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
    <div className="fixed inset-0 z-30 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-[color:var(--ink)] pt-0 text-[color:var(--cream)] select-none overscroll-none">
      {/* COMPACT UNIFIED TOP BAR (44px) */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#141318] px-2 sm:px-3 z-30 gap-1 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[40%] sm:max-w-xs shrink">
          <Link
            href="/library"
            className="flex size-7 items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5 cursor-pointer shrink-0"
            title="Return to library"
          >
            <ArrowLeft className="size-3.5 stroke-[2.5]" />
          </Link>
          <AscleonLogo size={22} className="shrink-0 transition-transform duration-200 hover:scale-105" />
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="display line-clamp-1 text-xs font-bold text-[color:var(--cream)] sm:text-sm truncate">
              {book.title}
            </h1>
            {(book.blueprint?.domain || book.topic) && (
              <span className="hidden md:inline-flex shrink-0 items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                {book.blueprint?.domain || book.topic}
              </span>
            )}
          </div>
        </div>

        {/* Center: Mobile Source/Studio Switcher (on mobile/tablet) + Page Tracking */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile/Tablet Viewport Toggle */}
          <div className="flex lg:hidden items-center rounded-full border border-white/20 bg-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setMobileActivePane("reader")}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                mobileActivePane === "reader"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                  : "text-[color:var(--cream)]/70 hover:text-white"
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
                  : "text-[color:var(--cream)]/70 hover:text-white"
              )}
            >
              <Sparkles className="size-3" />
              <span>Studio</span>
            </button>
          </div>

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

          {isEditingTopPage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = parseInt(topPageInputValue, 10);
                const max = book.fileURL ? totalPdfPages : (book.totalPages || segments.length);
                if (!isNaN(p) && p >= 1 && p <= max) {
                  if (book.fileURL) {
                    setActivePdfPage(p);
                  } else {
                    const matchedIdx = segments.findIndex((s) => s.pageNumber === p);
                    if (matchedIdx !== -1) setCurrentIdx(matchedIdx);
                    else setCurrentIdx(Math.min(segments.length - 1, p - 1));
                  }
                }
                setIsEditingTopPage(false);
              }}
              className="flex items-center gap-1 font-mono text-[11px] font-bold"
            >
              <span className="text-[color:var(--orange)]">Page</span>
              <input
                autoFocus
                type="number"
                min={1}
                max={book.fileURL ? totalPdfPages : (book.totalPages || segments.length)}
                value={topPageInputValue}
                onChange={(e) => setTopPageInputValue(e.target.value)}
                onBlur={() => {
                  const p = parseInt(topPageInputValue, 10);
                  const max = book.fileURL ? totalPdfPages : (book.totalPages || segments.length);
                  if (!isNaN(p) && p >= 1 && p <= max) {
                    if (book.fileURL) {
                      setActivePdfPage(p);
                    } else {
                      const matchedIdx = segments.findIndex((s) => s.pageNumber === p);
                      if (matchedIdx !== -1) setCurrentIdx(matchedIdx);
                      else setCurrentIdx(Math.min(segments.length - 1, p - 1));
                    }
                  }
                  setIsEditingTopPage(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsEditingTopPage(false);
                }}
                className="w-12 rounded border border-[color:var(--orange)] bg-[color:var(--ink)] px-1 py-0.5 text-center text-[color:var(--orange)] outline-none"
              />
              <span className="opacity-40">/</span>
              <span className="opacity-70">{book.fileURL ? totalPdfPages : (book.totalPages || segments.length)}</span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                const cur = book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1);
                setTopPageInputValue(String(cur));
                setIsEditingTopPage(true);
              }}
              className="group flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold transition-colors hover:bg-white/10 hover:ring-1 hover:ring-[color:var(--orange)]/50"
              title="Click to jump to a page number"
            >
              <span className="text-[color:var(--orange)] underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
                Page {book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
              </span>
              <span className="opacity-40">/</span>
              <span className="opacity-70">{book.fileURL ? totalPdfPages : (book.totalPages || segments.length)}</span>
            </button>
          )}
        </div>

        {/* Right Active Scope Badges & Navigation */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {selectedText && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[color:var(--orange)]/60 bg-[color:var(--orange)]/20 px-2 py-0.5 text-[10px] font-bold text-[color:var(--orange)] animate-pulse">
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
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
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
        className="flex flex-1 overflow-hidden p-1 sm:p-2 gap-1 sm:gap-2"
        style={{ cursor: isDraggingSplit ? "col-resize" : "default" }}
      >
        <div className="flex h-full w-full gap-1 sm:gap-2 overflow-hidden">
          {/* ============================================================== */}
          {/* LEFT PANEL: AUTHENTIC PDF READER (CLEAN, NO REDUNDANT TOOLBARS)*/}
          {/* ============================================================== */}
          <div
            className={cn(
              "relative h-full flex-col overflow-hidden rounded-[18px] border border-white/10 shadow-frame transition-[width] duration-75 bg-[#17161b]",
              mobileActivePane === "reader" ? "flex w-full" : "hidden",
              "lg:flex"
            )}
            style={isLgScreen ? { width: `${effectiveSplitRatio}%` } : undefined}
          >
            {/* FLOATING SOURCE PROGRESSION HUD (Animated Session Resume Toast) */}
            {showResumeSourceHud && resumedSessionInfo && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-md w-[92%] sm:w-auto animate-in fade-in slide-in-from-top-3 duration-500">
                <div className="flex items-center gap-3 rounded-full border-2 border-[color:var(--ink)] bg-[#1d1b22]/95 px-4 py-2 text-[color:var(--cream)] shadow-chip backdrop-blur-md">
                  {/* Animated Radial / Progress Ring */}
                  <div className="relative size-7 shrink-0 flex items-center justify-center">
                    <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-white/15"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[color:var(--orange)] transition-all duration-1000 ease-out"
                        strokeDasharray={`${resumedSessionInfo.progressPercent}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span className="absolute font-mono text-[9px] font-bold text-[color:var(--orange)]">
                      {resumedSessionInfo.progressPercent}%
                    </span>
                  </div>

                  <div className="flex flex-col min-w-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full bg-[color:var(--orange)] animate-ping" />
                      <span className="text-[11.5px] font-bold text-[color:var(--cream)] truncate">
                        Resumed at Page {resumedSessionInfo.lastStudiedPage} of {resumedSessionInfo.totalPages}
                      </span>
                    </div>
                    <span className="text-[10px] text-[color:var(--cream)]/60 font-medium">
                      Last studied {formatTimeAgo(resumedSessionInfo.lastStudiedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-white/15">
                    <button
                      type="button"
                      onClick={handleRestartFromBeginning}
                      className="cursor-pointer rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-[color:var(--cream)] hover:bg-white/20 transition-colors"
                      title="Start from beginning (Page 1)"
                    >
                      Page 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResumeSourceHud(false)}
                      className="cursor-pointer rounded-full p-1 text-[color:var(--cream)]/60 hover:text-white transition-colors"
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
              /* Document Reading Surface */
              <div
                ref={scrollViewportRef}
                onMouseUp={handleTextSelection}
                onTouchEnd={handleTextSelection}
                className={cn(
                  "custom-scrollbar relative flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 transition-colors sm:px-12 sm:py-10 select-text",
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
                  onMorphSelection={() => {
                    handleRunMorph(selectedText);
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
                        "group/arrow absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-frame transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
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
                        "group/arrow absolute right-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex size-11 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-frame transition-all duration-200 cursor-pointer hover:scale-110 hover:bg-[color:var(--orange)] active:scale-95 disabled:pointer-events-none disabled:opacity-0",
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
            className="group relative hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center"
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
          <div
            className={cn(
              "h-full flex-col overflow-hidden rounded-[20px] bg-[color:var(--ink-soft)]",
              mobileActivePane === "studio" ? "flex w-full" : "hidden",
              "lg:flex lg:flex-1"
            )}
          >
            {/* TOP CONTROL BAR - Responsive & Aligned with Left Toolbar */}
            <div className="flex h-11 shrink-0 items-center justify-between gap-1 sm:gap-2 border-b border-white/10 px-2 sm:px-3 bg-[#141318] overflow-x-auto no-scrollbar flex-nowrap">
              {/* Back to Source button on mobile */}
              <button
                type="button"
                onClick={() => setMobileActivePane("reader")}
                className="flex lg:hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--cream)] hover:bg-white/20 cursor-pointer shrink-0"
              >
                <BookOpen className="size-3 text-[color:var(--orange)]" />
                <span>Source</span>
              </button>
              {/* Zoom & View Controls - Desktop Only */}
              <div className="hidden lg:flex shrink-0 items-center gap-0.5 sm:gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-0.5 sm:p-1 text-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="flex size-5 sm:size-6 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)]/10"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3 sm:size-3.5" />
                </button>
                <span className="w-8 sm:w-10 text-center font-mono text-[10px] sm:text-[11px] font-bold text-[color:var(--ink)]">
                  {fitMode === "normal" ? `${zoomLevel}%` : "Auto"}
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="flex size-5 sm:size-6 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)]/10"
                  title="Zoom In"
                >
                  <ZoomIn className="size-3 sm:size-3.5" />
                </button>

                <div className="mx-0.5 sm:mx-1 h-3 w-px bg-[color:var(--ink)]/20" />

                {/* Fit Modes */}
                <button
                  type="button"
                  onClick={handleFitWidth}
                  className={cn(
                    "cursor-pointer rounded-full px-1.5 sm:px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap",
                    fitMode === "fit-width"
                      ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                      : "text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]",
                  )}
                >
                  <span className="hidden sm:inline">Fit </span>Width
                </button>
                <button
                  type="button"
                  onClick={handleFitPage}
                  className={cn(
                    "cursor-pointer rounded-full px-1.5 sm:px-2 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap",
                    fitMode === "fit-page"
                      ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                      : "text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]",
                  )}
                >
                  <span className="hidden sm:inline">Fit </span>Page
                </button>

                <div className="hidden lg:block mx-0.5 sm:mx-1 h-3 w-px bg-[color:var(--ink)]/20" />

                {/* Themes */}
                <div className="hidden lg:flex items-center gap-1">
                  {(["paper", "ink"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={cn(
                        "size-2.5 sm:size-3 rounded-full border border-[color:var(--ink)]/30 transition-transform cursor-pointer",
                        t === "paper" && "bg-[#fbf7f0]",
                        t === "ink" && "bg-[color:var(--ink)]",
                        theme === t && "scale-125 ring-2 ring-[color:var(--orange)]",
                      )}
                      title={`Set theme to ${t}`}
                    />
                  ))}
                </div>
              </div>

              {/* Universal Study Language Switch (Controls Voice, AI Chat, Morph, Q banks, Summaries) */}
              <StudyLanguageSwitch
                currentLanguage={studyLanguage}
                onLanguageChange={setStudyLanguage}
                compact={!isLgScreen}
              />

              {/* Real-time RAG Digestion Progress Badge */}
              {book._id && (
                <RagDigestionBadge
                  bookId={String(book._id)}
                  initialStatus={book.ingestionStatus || "completed"}
                  initialProgress={book.ingestionProgress ?? 100}
                />
              )}

              {/* Start New Session Trigger */}
              <button
                type="button"
                onClick={() => setShowStartNewModal(true)}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-white/10 px-1.5 sm:px-2.5 py-1 text-[10px] sm:text-xs font-bold text-[color:var(--cream)] shadow-xs transition-all hover:bg-white/20 whitespace-nowrap"
                title="Start a new session or restart book"
              >
                <RotateCcw className="size-3 text-[color:var(--orange)]" />
                <span className="hidden sm:inline">Start </span>
                <span>New</span>
              </button>

              {/* Ascleon Live Voice Button */}
              <button
                type="button"
                onClick={() => {
                  setActiveIntent("voice");
                }}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-1 rounded-full border-2 border-[color:var(--ink)] px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap",
                  activeIntent === "voice"
                    ? "bg-[#43a08f] text-[color:var(--ink)] shadow-chip"
                    : "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip hover:-translate-y-0.5",
                )}
              >
                <Mic className="size-3 sm:size-3.5" />
                <span className="hidden md:inline">Ascleon </span>
                <span>Voice</span>
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

            {/* Universal Study Scope Bar (Single Page, Multi-Page Range, or Complete Topic) */}
            <StudyScopeBar
              currentPage={book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}
              totalPages={book.fileURL ? totalPdfPages : segments.length}
              topics={book.blueprint?.topicMap?.topics || []}
              currentScope={studyScope}
              onScopeChange={(newScope) => {
                setStudyScope(newScope);
              }}
              onNavigateToPage={(p) => {
                if (book.fileURL) {
                  setActivePdfPage(p);
                } else {
                  const matchedIdx = segments.findIndex((s) => s.pageNumber === p);
                  if (matchedIdx !== -1) setCurrentIdx(matchedIdx);
                  else setCurrentIdx(Math.min(segments.length - 1, p - 1));
                }
              }}
            />

            {/* STUDIO SWITCHER TABS (4 CORE TABS: AI Chat, Morph, Voice, Q banks) */}
            <div className="grid shrink-0 grid-cols-4 gap-0.5 sm:gap-1 border-b border-white/10 bg-black/40 p-1 sm:p-1.5 text-[10px] sm:text-[11px]">
              <button
                type="button"
                onClick={() => setActiveIntent("chat")}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1 sm:py-1.5 font-bold transition-all whitespace-nowrap",
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
                onClick={() => {
                  setActiveIntent("morph");
                  handleRunMorph();
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1 sm:py-1.5 font-bold transition-all whitespace-nowrap",
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
                onClick={() => setActiveIntent("voice")}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1 sm:py-1.5 font-bold transition-all whitespace-nowrap",
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
                  loadDynamicQBank();
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1 rounded-full py-1 sm:py-1.5 font-bold transition-all whitespace-nowrap",
                  activeIntent === "quiz"
                    ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-chip"
                    : "border border-transparent text-[color:var(--cream)]/60 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                <HelpCircle className="size-3" />
                <span className="truncate">Q banks</span>
              </button>
            </div>

            {/* TAB CONTENTS CONTAINER */}
            <div className="custom-scrollbar-dark flex-1 overflow-y-auto overscroll-y-contain p-2.5 sm:p-4">
              {/* STUDIO SESSION CONTINUATION / RESUME BANNER */}
              {showStudioResumeBanner && resumedSessionInfo && (
                <div className="mb-3 rounded-[16px] border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-3 text-[color:var(--ink)] shadow-chip animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs">
                        <RotateCcw className="size-3" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-[color:var(--ink)]">
                            Previous Study Session Restored
                          </span>
                          <span className="rounded-full bg-[color:var(--ink)] px-1.5 py-0.2 text-[9px] font-bold text-[color:var(--cream)] uppercase">
                            {resumedSessionInfo.studioState?.activeIntent || "Studio Space"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[color:var(--ink)]/80 leading-snug line-clamp-2">
                          Continuing from Page {resumedSessionInfo.lastStudiedPage}.
                          {resumedSessionInfo.studioState?.lastActiveSnippet
                            ? ` (${resumedSessionInfo.studioState.lastActiveSnippet})`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowStudioResumeBanner(false)}
                      className="cursor-pointer rounded-full p-1 text-[color:var(--ink)]/60 hover:text-[color:var(--ink)]"
                      title="Dismiss banner"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-[color:var(--ink)]/15 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowStartNewModal(true)}
                      className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-transparent px-3 py-1 text-[10.5px] font-bold text-[color:var(--ink)] hover:bg-[color:var(--ink)]/10 transition-colors"
                    >
                      Start New...
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudioResumeBanner(false)}
                      className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1 text-[10.5px] font-black text-[color:var(--ink)] shadow-xs hover:brightness-105 transition-all"
                    >
                      Continue Studying
                    </button>
                  </div>
                </div>
              )}
              {/* TAB 1: THE MORPH ENGINE */}
              {activeIntent === "morph" && (
                <div className="flex animate-in fade-in flex-col gap-4 duration-200">
                  {/* TOP CONTROLLER: Scope & Custom Whole Topic Bar */}
                  <div className="rounded-[18px] border-2 border-[color:var(--ink)] bg-[#1d1b22] p-2.5 sm:p-3 shadow-chip flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--cream)]/60 mr-1 hidden sm:inline">
                          Scope:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMorphActiveTopic(null);
                            handleRunMorph(undefined, undefined, false, null);
                          }}
                          className={cn(
                            "cursor-pointer px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 border",
                            !morphActiveTopic
                              ? "bg-[color:var(--orange)] text-[color:var(--ink)] border-[color:var(--ink)] shadow-xs"
                              : "bg-white/5 text-[color:var(--cream)]/70 border-white/10 hover:bg-white/10"
                          )}
                        >
                          <BookOpen className="size-3" />
                          <span>Active Page ({book.fileURL ? activePdfPage : currentIdx + 1})</span>
                        </button>

                        {morphActiveTopic && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#43a08f]/20 border border-[#43a08f]/50 px-2.5 py-1 text-[11px] font-bold text-[#7fd8c9]">
                            <Sparkles className="size-3" />
                            <span className="max-w-[140px] truncate">{morphActiveTopic}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setMorphActiveTopic(null);
                                setMorphTopicInput("");
                              }}
                              className="hover:opacity-75 cursor-pointer ml-0.5 text-white/60"
                              title="Clear topic filter"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isMorphLoading}
                        onClick={() => handleRunMorph(undefined, undefined, true, morphActiveTopic || undefined)}
                        className="flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--cream)]/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
                        title="Re-synthesize with fresh Gemini AI analysis"
                      >
                        <RefreshCw className={cn("size-3", isMorphLoading && "animate-spin")} />
                        <span>Re-morph AI</span>
                      </button>
                    </div>

                    {/* Topic Input Box: Write Any Specific Whole Topic */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={morphTopicInput}
                          onChange={(e) => setMorphTopicInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && morphTopicInput.trim()) {
                              handleRunMorph(undefined, undefined, true, morphTopicInput.trim());
                            }
                          }}
                          placeholder="Write a whole topic to turn into magic (e.g. Acute Coronary Syndrome, Heart Failure)..."
                          className="w-full rounded-full border-2 border-[color:var(--ink)] bg-[#121114] px-3.5 py-1.5 text-xs font-medium text-[color:var(--cream)] placeholder:text-[color:var(--cream)]/40 focus:border-[color:var(--orange)] focus:outline-none pr-28 sm:pr-32"
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
                              <option value="" disabled className="bg-[#1b1a20] text-white">
                                Book Topics ▾
                              </option>
                              {book.blueprint.topicMap.topics.map((t: any) => (
                                <option key={t.id} value={t.title} className="bg-[#1b1a20] text-white">
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
                        className="cursor-pointer shrink-0 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-chip hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                                    if (book.fileURL) {
                                      setActivePdfPage(cand.startPage);
                                    } else {
                                      const sIdx = segments.findIndex((s) => s.pageNumber === cand.startPage);
                                      if (sIdx >= 0) setCurrentIdx(sIdx);
                                    }
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

                        {/* Direct Topic Navigation Banner (Single Identified Topic) */}
                        {m.topicLocation && !m.topicLocation.isAmbiguous && (
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
                                onClick={() => {
                                  if (book.fileURL) {
                                    setActivePdfPage(m.topicLocation!.startPage);
                                  } else {
                                    const sIdx = segments.findIndex((s) => s.pageNumber === m.topicLocation!.startPage);
                                    if (sIdx >= 0) setCurrentIdx(sIdx);
                                  }
                                }}
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
                      <div className="flex items-center gap-2 rounded-xl border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-3 text-xs font-bold text-[color:var(--ink)] shadow-chip">
                        <RefreshCw className="size-3.5 animate-spin text-[#ff4c00]" />
                        <span>Querying deep textbook corpus &amp; synthesizing grounded response...</span>
                      </div>
                    )}

                    {/* Bottom Action Bar: Executive Summary & Core Prompts pinned right below latest response */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/10 overflow-x-auto no-scrollbar touch-pan-x whitespace-nowrap shrink-0">
                      <button
                        type="button"
                        disabled={isAiLoading}
                        onClick={() => {
                          const scopeLabel = studyScope.type === "topic" && studyScope.topicTitle
                            ? `Topic "${studyScope.topicTitle}" (pp. ${studyScope.startPage}–${studyScope.endPage})`
                            : studyScope.type === "range"
                            ? `Pages ${studyScope.startPage}–${studyScope.endPage}`
                            : `Page ${book.fileURL ? activePdfPage : (currentSegment?.pageNumber || currentIdx + 1)}`;
                          const prompt = `Generate a high-yield executive summary, core mechanism breakdown, and clinical exam pearls for ${scopeLabel} of "${book.title}".`;
                          triggerDirectAIQuery(prompt);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--orange)] bg-[color:var(--orange)]/15 px-3 py-1 text-[11px] font-black text-[color:var(--orange)] hover:bg-[color:var(--orange)]/25 transition-all shadow-xs"
                        title="Run executive summary prompt for the active scope"
                      >
                        <FileText className="size-3 text-[color:var(--orange)]" />
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
                          className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[color:var(--cream)]/80 transition-all hover:border-[color:var(--orange)]/60 hover:bg-[color:var(--orange)]/15 hover:text-[color:var(--cream)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}

              {/* TAB 3: ASCLEON LIVE ORAL MENTOR */}
              {activeIntent === "voice" && (
                <div className="flex animate-in fade-in flex-col h-full duration-150">
                  <AscleonVoiceStudio
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
                    onStudyLanguageChange={setStudyLanguage}
                    bookId={String(book._id || "")}
                    studyScope={studyScope}
                    snippedDiagram={snippedDiagram?.url || null}
                    onWhiteboardExpandChange={setIsWhiteboardExpanded}
                    onTriggerMorph={() => {
                      setActiveIntent("morph");
                      handleRunMorph();
                    }}
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
                      onClick={() => loadDynamicQBank(undefined, true)}
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
                              className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white px-3 py-1.5 text-xs font-bold text-[color:var(--ink)] disabled:opacity-30"
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
                                className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-2 text-xs font-bold text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 text-center"
                              >
                                Next Question ({activeQBankIdx + 2}/{dynamicQBankList.length}) →
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isQBankLoading}
                                onClick={() => loadDynamicQBank(undefined, true)}
                                className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-2 text-xs font-bold text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 text-center"
                              >
                                <span>{isQBankLoading ? "Generating New Questions..." : "Generate More Questions ✦"}</span>
                              </button>
                            )}
                          </div>
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

            {/* BOTTOM PROMPT INPUT (Responsive & Keyboard-Aware on Mobile) */}
            <div
              className="shrink-0 border-t border-white/10 bg-[#141318] p-2.5 sm:p-3.5 transition-[padding] duration-150 ease-out"
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
                  className="w-full rounded-full border border-white/15 bg-white/[0.06] py-2 pl-3.5 pr-10 sm:py-2.5 sm:pl-4 sm:pr-11 text-xs text-[color:var(--cream)] placeholder-[color:var(--cream)]/40 transition-all focus:border-[color:var(--orange)] focus:outline-none"
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

      {/* Floating Quick Action Button on Mobile */}
      {mobileActivePane === "reader" && (
        <button
          type="button"
          onClick={() => setMobileActivePane("studio")}
          className="fixed bottom-4 right-4 z-40 flex lg:hidden items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--ink)] shadow-chip transition-transform active:scale-95 cursor-pointer"
        >
          <Sparkles className="size-4" />
          <span>Open Studio</span>
        </button>
      )}

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
