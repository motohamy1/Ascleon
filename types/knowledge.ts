export type ReferenceType = "textbook" | "guideline" | "journal" | "qbank_pearl";

export interface ReferenceResource {
  id: string;
  source: string;
  edition?: string;
  type: ReferenceType;
  title: string;
  chapterOrSection: string;
  excerpt: string;
  clinicalPearls: string[];
  relevanceTag: string;
}

export interface QBankVignette {
  id: string;
  examType: "MRCP Part 1" | "MRCP Part 2" | "USMLE Step 2 CK" | "General Clinical" | "Software Architecture";
  topic: string;
  difficulty: "medium" | "hard" | "expert";
  vignette: string;
  options: string[];
  correctIndex: number;
  distractorRationales: Record<number, string>;
  highYieldTakeaway: string;
  sourceQBank: string;
}

export interface HighYieldMnemonic {
  mnemonic: string;
  expansion: string;
  rule: string;
  clinicalContext: string;
}

export interface EnrichedStudyContext {
  focalTopic: string;
  authoritativeReferences: ReferenceResource[];
  qbankVignettes: QBankVignette[];
  mnemonics: HighYieldMnemonic[];
  groundingSnippet: string;
}
