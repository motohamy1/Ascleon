import { Document, Types } from "mongoose";
import { ReactNode } from "react";
import { Control, FieldPath, FieldValues } from "react-hook-form";
import { LucideIcon } from "lucide-react";
import z from "zod";
import { UploadSchema } from "@/lib/zod";
import { PlanType } from "@/lib/subscription-constants";
import { VoiceLanguage } from "@/lib/constants";

// ============================================
// DATABASE MODELS
// ============================================

export type ReadingStatus = "not_started" | "in_progress" | "read";
export type SourceCategoryType = "lecture_notes" | "textbook" | "clinical_sheet" | "guideline_paper" | "exam_review";
export type IngestionStatusType = "pending" | "processing" | "completed" | "failed";

export interface StudioSessionState {
  activeIntent?: "chat" | "morph" | "voice" | "summary" | "quiz";
  studyLanguage?: string;
  studyScope?: {
    type: "page" | "range" | "topic";
    startPage: number;
    endPage: number;
    topicTitle?: string;
    topicId?: string;
  };
  morphActiveTopic?: string | null;
  chatMessages?: Array<{
    sender: "user" | "ai";
    text: string;
    time?: string;
    provider?: string;
    model?: string;
    toolsUsed?: string[];
    citations?: string[];
    imageUrl?: string;
    topicLocation?: any;
    authoritativeReferences?: any[];
  }>;
  activeQBankIdx?: number;
  lastActiveSnippet?: string;
  scrollOrientation?: "vertical" | "horizontal";
  readerViewMode?: "original_pdf" | "reflow";
  fitMode?: "normal" | "fit-width" | "fit-page";
  zoomLevel?: number;
}

export interface UserStudyProgressData {
  bookSlug: string;
  bookId?: string;
  lastStudiedPage: number;
  totalPages: number;
  progressPercent: number;
  readingStatus: ReadingStatus;
  lastStudiedAt: string;
  studioState?: StudioSessionState;
}

export interface IBook extends Document {
  _id: string;
  clerkId: string;
  title: string;
  slug: string;
  author: string;
  persona?: string;
  fileURL: string;
  fileBlobKey: string;
  coverURL: string;
  coverBlobKey?: string;
  fileSize: number;
  totalSegments: number;
  totalPages?: number;
  sourceCategory?: SourceCategoryType;
  customSection?: string;
  domain?: string;
  subspecialty?: string;
  pedagogicalStyle?: string;
  ingestionStatus?: IngestionStatusType;
  ingestionProgress?: number;
  ingestionStage?: string;
  digestedPages?: number;
  blueprint?: {
    domain?: string;
    subspecialty?: string;
    primaryField?: string;
    subField?: string;
    fieldPedagogyStyle?: string;
    domainBoundaries?: string[];
    authoritativeReferences?: any[];
    canonicalReferences?: any[];
    dynamicCanonicalReferences?: any[];
    initialQBank?: any[];
    initialMnemonics?: any[];
    chapterMap?: any[];
    topicMap?: any;
    [key: string]: any;
  };
  topic?: string;
  readingStatus?: ReadingStatus;
  readingTimeMinutes?: number;
  color?: string;
  isFavorite?: boolean;
  year?: number;
  summary?: string;
  language?: VoiceLanguage;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookSegment extends Document {
  clerkId: string;
  bookId: Types.ObjectId;
  content: string;
  segmentIndex: number;
  pageNumber?: number;
  wordCount: number;
  headings?: string[];
  keyTerms?: string[];
  clinicalEntities?: string[];
  goldStandards?: string[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookSegmentData {
  _id: string;
  clerkId: string;
  bookId: string;
  content: string;
  segmentIndex: number;
  pageNumber?: number;
  wordCount: number;
  headings?: string[];
  keyTerms?: string[];
  clinicalEntities?: string[];
  goldStandards?: string[];
  summary?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IVoiceSession extends Document {
  _id: string;
  clerkId: string;
  bookId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
  billingPeriodStart: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// FORM & INPUT TYPES
// ============================================

export type BookUploadFormValues = z.infer<typeof UploadSchema>;

export interface CreateBook {
  clerkId: string;
  title: string;
  author: string;
  persona?: string;
  fileURL: string;
  fileBlobKey: string;
  coverURL?: string;
  coverBlobKey?: string;
  fileSize: number;
  totalSegments?: number;
  totalPages?: number;
  sourceCategory?: SourceCategoryType;
  customSection?: string;
  domain?: string;
  subspecialty?: string;
  pedagogicalStyle?: string;
  ingestionStatus?: IngestionStatusType;
  blueprint?: any;
  topic?: string;
  readingTimeMinutes?: number;
  color?: string;
  year?: number;
  summary?: string;
}

export interface TextSegment {
  text: string;
  segmentIndex: number;
  pageNumber?: number;
  wordCount: number;
}

export interface BookCardProps {
  title: string;
  author: string;
  coverURL: string;
  slug: string;
  topic?: string;
  readingStatus?: ReadingStatus;
  readingTimeMinutes?: number;
  isFavorite?: boolean;
  color?: string;
  sourceCategory?: SourceCategoryType;
  onDelete?: () => void;
}

export interface Messages {
  role: string;
  content: string;
}

export interface ShadowBoxProps {
  children: ReactNode;
  className?: string;
}

export interface VoiceSelectorProps {
  disabled?: boolean;
  className?: string;
  value?: string;
  onChange: (voiceId: string) => void;
}

export interface InputFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}

export interface FileUploadFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  acceptTypes: string[];
  disabled?: boolean;
  icon: LucideIcon;
  placeholder: string;
  hint: string;
}

export interface SessionCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  plan: PlanType;
  maxDurationMinutes: number;
  error?: string;
}

export interface StartSessionResult {
  success: boolean;
  sessionId?: string;
  maxDurationMinutes?: number;
  error?: string;
  isBillingError?: boolean;
}

export interface EndSessionResult {
  success: boolean;
  error?: string;
}
