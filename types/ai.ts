import { ReferenceResource, QBankVignette, HighYieldMnemonic } from "./knowledge";

export type AIProvider = "gemini" | "groq" | "openrouter" | "openai" | "deterministic";

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface AgentContext {
  bookId: string;
  bookTitle: string;
  currentSegmentIndex: number;
  currentPageNumber?: number;
  currentSegmentContent: string;
  selectedText?: string;
  history?: { sender: "user" | "ai"; text: string }[];
}

export interface AgentToolResult {
  toolName: string;
  output: string;
  data?: any;
}

export interface AgentRunOutput {
  text: string;
  provider: AIProvider;
  model: string;
  toolsUsed: string[];
  citations: string[];
  generatedMorph?: any;
  generatedQuiz?: any;
  authoritativeReferences?: ReferenceResource[];
  qbankVignettes?: QBankVignette[];
  mnemonics?: HighYieldMnemonic[];
}
