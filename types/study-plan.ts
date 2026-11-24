import { StudyLanguage } from "@/lib/language";

export type StudyPlanStepType = "summary" | "quiz" | "flashcards" | "reading";

export type StudyPlanStepStatus = "pending" | "ready" | "completed" | "deferred";

export type StudyPlanStatus = "active" | "completed" | "archived";

export interface StudyPlanSummaryContent {
  kind: "summary";
  keyTakeaways: string[];
  highYieldNotes: string[];
  clinicalPearls: string[];
}

export interface StudyPlanFlashcardsContent {
  kind: "flashcards";
  cards: Array<{ front: string; back: string }>;
}

export interface StudyPlanQuizContent {
  kind: "quiz";
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
}

export interface StudyPlanReadingContent {
  kind: "reading";
  focusPoints: string[];
  guidingQuestions: string[];
}

export type StudyPlanStepContent =
  | StudyPlanSummaryContent
  | StudyPlanFlashcardsContent
  | StudyPlanQuizContent
  | StudyPlanReadingContent;

export interface StudyPlanStep {
  id: string;
  title: string;
  type: StudyPlanStepType;
  startPage: number;
  endPage: number;
  estimatedMinutes: number;
  status: StudyPlanStepStatus;
  generatedContent?: StudyPlanStepContent | null;
  completedAt?: string | null;
}

export interface StudyPlanSection {
  id: string;
  title: string;
  dayNumber: number;
  scheduledDate: string;
  topics: string[];
  steps: StudyPlanStep[];
}

export interface StudyPlanDiffSummary {
  added: string[];
  changed: string[];
  removed: string[];
}

export interface StudyPlanChatMessage {
  role: "user" | "assistant";
  text: string;
  diffSummary?: StudyPlanDiffSummary | null;
  createdAt: string;
}

export interface StudyPlanDTO {
  _id: string;
  clerkId: string;
  bookId: string;
  bookSlug: string;
  bookTitle: string;
  title: string;
  subject: string;
  examDate: string | null;
  targetGrade: string;
  confidenceLevel: number;
  language: StudyLanguage;
  status: StudyPlanStatus;
  readinessScore: number;
  sections: StudyPlanSection[];
  chatHistory: StudyPlanChatMessage[];
  createdAt: string;
  updatedAt: string;
}
