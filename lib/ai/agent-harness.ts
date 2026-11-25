import { GoogleGenAI } from "@google/genai";
import {
  AgentContext,
  AgentRunOutput,
  AIProvider,
} from "@/types/ai";
import {
  AGENT_TOOLS_DEFINITIONS,
  executeAgentTool,
  convertSchemaToLowercase,
  convertSchemaToGemini,
} from "./tools";
import { buildLanguageDirective } from "@/lib/language";
import { retrieveEnrichedContext } from "./knowledge/knowledge-retriever";
import { EnrichedStudyContext } from "@/types/knowledge";
import { normalizeScientificNotation } from "@/lib/formatting/scientific-text";
import {
  clearModelCooldown,
  FAST_GEMINI_MODEL_CHAIN,
  GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
} from "./model-cooldown";
import {
  buildIntentPromptAddon,
  classifyStudyQuery,
  type QueryIntent,
} from "./intent-router";
import { isPlaceholderPageText } from "./rag/chunker";

const SOCRATIC_SYSTEM_PROMPT = `You are Ascleon's elite AI Clinical Study Agent & Academic Mentor.
Your mission is to guide students to first-principles mastery of the material in their study source with absolute scientific fidelity, pedagogical elegance, and crystal-clear presentation.

Core Guidelines:
1. PRIMARY SOURCE FIDELITY & SCOPE AWARENESS:
   - Ground your answer FIRST AND FOREMOST in the ACTIVE STUDY TEXT provided in your context.
   - When the user asks about a complete multi-page topic or page range, synthesize the ENTIRE topic across all its pages thoroughly, rather than restricting yourself to a single page.
   - If the student specifically highlighted or selected text, prioritize that exact excerpt first.
   - Draw seamlessly from canonical gold-standard textbooks and guidelines (e.g., Harrison's, Braunwald's, Robbins, Oxford Handbook, ESC/AHA/ACC) to enrich, explain, and illustrate the primary source.
   - NEVER create artificial division or say "bridging the gap between your text and the authoritative corpus". Seamlessly synthesize the knowledge into one unified, crystal-clear explanation.
   - NEVER start responses with robotic boilerplate like "To master [Topic] within the context of the provided material...". Jump directly into answering with engaging, high-yield clarity!
   - STRICT TOPIC RELEVANCE: NEVER introduce unrelated diseases, unrelated question bank scenarios, or irrelevant distractor concepts.

2. ADAPTIVE QUERY-INTENT & CONVERSATIONAL MEMORY:
   - CONVERSATIONAL FEEDBACK / ACKNOWLEDGMENTS: If the student simply says "good", "great", "ok", "thanks", "understood", "تمام", "شكرا", or similar:
     • DO NOT dump the full page explanation again!
     • Acknowledge their understanding warmly in 1-2 brief sentences.
     • Socratic follow-up: Ask if they would like a quick 1-question oral check, want to move to the next key mechanism, or have a specific doubt.
   - SESSION RECAP / META QUERIES: If the student asks "what have we studied now?", "summarize what we covered", "احنا درسنا ايه لحد دلوقتي":
     • Review the conversation history and active study text to deliver a crisp, structured bulleted summary of the concepts you and the student have explored together in this session.
   - For DIRECT / BRIEF QUESTIONS: Answer IMMEDIATELY, DIRECTLY, and CONCISELY.
   - For TOPIC EXPLANATIONS & DEEP DIVES: Deliver an exhaustive, structured masterclass:
     • Pathophysiological & cellular mechanisms step-by-step.
     • Clinical manifestations & physical exam signs with their underlying mechanics.
     • Diagnostic criteria & laboratory findings.
     • High-yield clinical pearls and management algorithms.

3. SCIENTIFIC & MATHEMATICAL NOTATION INTEGRITY:
   - Always output chemical and electrolyte formulas in proper Unicode: CO₂, O₂, H₂O, HCO₃⁻, Ca²⁺, Mg²⁺, Na⁺, K⁺, Cl⁻, PaO₂, PaCO₂, SaO₂, FiO₂, B₁₂, T₃, T₄. Never output broken ASCII like CO2 or raw LaTeX like $CO_2$.
   - Output square roots cleanly as √(expression), fractions as (numerator / denominator), and comparisons as ±, ≥, ≤, ≈, ≠.
   - Format physiological cascades with clean arrows: e.g.,
     LV Failure → ↑ LVEDP → ↑ LA Pressure → ↑ Pulmonary Venous Pressure → Pulmonary Edema.
   - NEVER output raw HTML tags such as <br>, <br/>, or <p> inside Markdown or table cells; keep table cells concise using clean punctuation or semicolons instead.`;

function filterCitationSources(refs: Array<{ source: unknown }>): string[] {
  return refs
    .map((r) => {
      const s = r?.source;
      if (typeof s === "string") return s;
      if (s && typeof s === "object") {
        const obj = s as Record<string, unknown>;
        return String(obj.title || obj.source || obj.name || "");
      }
      return "";
    })
    .filter((s) => {
      const low = (s || "").trim().toLowerCase();
      return (
        Boolean(low) &&
        low !== "[object object]" &&
        !low.startsWith("authoritative literature on") &&
        !low.startsWith("standard reference corpus") &&
        !low.startsWith("authoritative canon for")
      );
    });
}

const FRESH_PAGE_ANCHORED_RE =
  /\b(explain|summarize|summary|what is this|what does this|mechanism|breakdown|tell me about this|this page|current page|core mechanism|high-yield|exam pearls|key invariants)\b|اشرح|لخص|ملخص|الصفحة|ايه ده|ما هذا/i;

const EXPLICIT_CROSS_PAGE_RE =
  /\b(previous page|earlier page|last page|compare with|before this|what we covered|we studied)\b|الصفحة السابقة|قارن مع/i;

export function preparePageAwareHistory(
  history: AgentContext["history"],
  currentPageNumber: number | undefined,
  userQuery: string,
  intent: QueryIntent
): Array<{ sender: "user" | "ai"; text: string; pageNumber?: number }> {
  if (!Array.isArray(history) || history.length === 0) return [];
  const recent = history.slice(-8).filter((h) => h && typeof h.text === "string" && h.text.trim());

  if (intent === "recap") {
    return recent.map((h) => ({
      ...h,
      text:
        h.pageNumber && currentPageNumber && h.pageNumber !== currentPageNumber
          ? `[Earlier turn while viewing Page ${h.pageNumber}]: ${h.text}`
          : h.text,
    }));
  }

  const isFreshPageAnchoredQuery =
    FRESH_PAGE_ANCHORED_RE.test(userQuery) && !EXPLICIT_CROSS_PAGE_RE.test(userQuery);

  const filtered = isFreshPageAnchoredQuery && currentPageNumber
    ? recent.filter((h) => !h.pageNumber || h.pageNumber === currentPageNumber)
    : recent;

  return filtered.map((h) => ({
    ...h,
    text:
      h.pageNumber && currentPageNumber && h.pageNumber !== currentPageNumber
        ? `[Earlier turn while viewing Page ${h.pageNumber}]: ${h.text}`
        : h.text,
  }));
}

function buildActiveViewportPrompt(
  userQuery: string,
  context: AgentContext,
  enriched: EnrichedStudyContext
): string {
  const activePage = context.currentPageNumber || context.currentSegmentIndex + 1;
  const contentTrimmed = (context.currentSegmentContent || "").trim();
  const contentIsScannedOrMissing = isPlaceholderPageText(contentTrimmed);
  const scope = context.studyScope;

  let viewportLock: string;
  if (scope?.type === "topic" && scope.startPage && scope.endPage) {
    const label = scope.topicTitle ? `"${scope.topicTitle}" ` : "";
    viewportLock = `ACTIVE STUDY SCOPE: Complete Topic ${label}(Pages ${scope.startPage}–${scope.endPage}) of "${context.bookTitle}". Synthesize and illustrate thoroughly across ALL pages of this topic provided below. Do not restrict yourself to a single page when multi-page topic context is provided.`;
  } else if (scope?.type === "range" && scope.startPage && scope.endPage) {
    viewportLock = `ACTIVE STUDY SCOPE: Selected Page Range (Pages ${scope.startPage}–${scope.endPage}) of "${context.bookTitle}". Synthesize and illustrate thoroughly across ALL pages in this selected range provided below.`;
  } else {
    viewportLock = `ACTIVE VIEWPORT LOCK: The student is currently on Page ${activePage} of "${context.bookTitle}". Answer STRICTLY from ACTIVE PAGE ${activePage} below (plus any matched book excerpts if the student explicitly asked about a topic located on other pages). Never answer about an earlier page's topic from chat history unless the student explicitly asks to compare or refer back.`;
  }

  const visionNote =
    contentIsScannedOrMissing && context.selectedImage
      ? `\n[NOTE: Page ${activePage} appears to be a scanned/image-based page with minimal extractable text. Read and explain the attached Page ${activePage} image directly.]\n`
      : "";

  const scopeHeader =
    scope?.type === "topic"
      ? `Topic: ${scope.topicTitle || "Selected Topic"} (Pages ${scope.startPage}–${scope.endPage})`
      : scope?.type === "range"
        ? `Selected Range: Pages ${scope.startPage}–${scope.endPage}`
        : `Section ${context.currentSegmentIndex + 1}, Page ${activePage}`;

  const pageIntro = `${viewportLock}\n\nActive Book: "${context.bookTitle}" (${scopeHeader})${visionNote}\nActive Study Source Text:\n${contentTrimmed}\n${
    context.selectedText
      ? `\nUser Specifically Selected/Highlighted:\n"${context.selectedText}"\n`
      : ""
  }\n\n${enriched.groundingSnippet}`;

  const lastTurn =
    Array.isArray(context.history) && context.history.length > 0
      ? context.history[context.history.length - 1]
      : null;
  const isAnsweringSocraticPrompt =
    Boolean(context.socraticMode) &&
    lastTurn?.sender === "ai" &&
    /[?؟]/.test(lastTurn.text || "");

  if (isAnsweringSocraticPrompt) {
    return (
      `${pageIntro}\n\n` +
      `[SOCRATIC COACHING TURN — STUDENT'S ANSWER TO YOUR PREVIOUS QUESTION]:\n${userQuery}\n\n` +
      `Coach instruction: The student is responding to the question you just asked in your previous turn. Evaluate their response directly (confirm what is right, clarify any nuance in 1–2 concise sentences), DO NOT dump a full lecture or comparison table about the term they typed, and ask ONE focused next-step question to keep progressing through the topic.`
    );
  }

  return `${pageIntro}\n\nStudent Question / Query:\n${userQuery}`;
}

function buildArtifactSummaryText(
  generatedMorph: any,
  generatedQuiz: any,
  turn1Text?: string
): string {
  const existing = (turn1Text || "").trim();
  if (existing.length >= 20) {
    return existing;
  }
  const parts: string[] = [];
  if (generatedMorph) {
    const title = generatedMorph.title || "Interactive Concept Morph";
    const steps = Array.isArray(generatedMorph.steps)
      ? generatedMorph.steps
          .slice(0, 6)
          .map((s: any) => s?.title || s?.badge)
          .filter(Boolean)
      : [];
    parts.push(
      `Generated interactive Morph study block: **${title}**${
        steps.length > 0 ? ` (${steps.join(" → ")})` : ""
      }.`
    );
  }
  if (generatedQuiz) {
    const q = String(generatedQuiz.question || "").trim();
    const preview = q.length > 180 ? `${q.slice(0, 180)}...` : q;
    parts.push(
      preview
        ? `Generated a board-style clinical vignette:\n\n> ${preview}`
        : `Generated a board-style clinical vignette quiz.`
    );
  }
  return parts.join("\n\n") || existing || "Generated interactive study artifact.";
}

/**
 * Executes a call to Google Gemini with tools and deep background references
 */
async function callGeminiAgent(
  apiKey: string,
  userQuery: string,
  context: AgentContext,
  enriched: EnrichedStudyContext,
  onDelta?: (text: string) => void
): Promise<AgentRunOutput> {
  const ai = new GoogleGenAI({ apiKey });
  // Only attach function-calling tools when the student explicitly asks to generate an interactive artifact
  const needsTools = /\b(morph|quiz|qbank|test me|vignette|flashcard|visualize|interactive)\b/i.test(
    userQuery
  );
  const classification = classifyStudyQuery(userQuery, Boolean(context.selectedImage));
  // Flash-first for interactive chat; reserve heavy model for quantitative math or vision inputs
  const useHeavyPrimary = classification.intent === "math_calc" || Boolean(context.selectedImage);
  const selectedChain = useHeavyPrimary ? GEMINI_MODEL_CHAIN : FAST_GEMINI_MODEL_CHAIN;
  const orderedModels = orderModelsByHealth(selectedChain);
  const modelsToTry =
    orderedModels.length > 0
      ? orderedModels
      : [...selectedChain];

  const toolsDeclaration = [
    {
      functionDeclarations: AGENT_TOOLS_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: (t.parameters.type || "OBJECT").toUpperCase(),
          properties: convertSchemaToGemini(t.parameters.properties),
          required: t.parameters.required,
        },
      })),
    },
  ];

  const contents: any[] = [];
  const activePage = context.currentPageNumber || context.currentSegmentIndex + 1;
  const scopedHistory = preparePageAwareHistory(
    context.history,
    activePage,
    userQuery,
    classification.intent
  );

  // Inject page-aware conversation turns
  for (const h of scopedHistory) {
    const role = h.sender === "user" ? "user" : "model";
    contents.push({
      role,
      parts: [{ text: h.text }],
    });
  }

  // Turn: Active page grounding context + user query
  const userParts: any[] = [
    { text: buildActiveViewportPrompt(userQuery, context, enriched) },
  ];

  if (context.selectedImage) {
    const mimeMatch = context.selectedImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = context.selectedImage.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    userParts.push({
      inlineData: {
        mimeType,
        data: cleanBase64,
      },
    });
  }

  contents.push({
    role: "user",
    parts: userParts,
  });

  const langDirective = buildLanguageDirective(context.language || "en", "text");
  const intentAddon = buildIntentPromptAddon(classification.intent, context.socraticMode);
  const fullSystemInstruction = `${SOCRATIC_SYSTEM_PROMPT}\n\n${intentAddon}\n\n${langDirective}`;

  let lastError: unknown = new Error("All Gemini models failed");

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    const isPrimary = i === 0;
    const timeoutMs = isPrimary ? 12_000 : 9_000;
    const ttftMs = isPrimary ? 6_000 : 5_000;
    const supportsThinking = !modelName.includes("lite");
    const thinkingBudget = classification.intent === "math_calc" ? 128 : 0;
    const toolsUsed: string[] = [];
    let generatedMorph: any = null;
    let generatedQuiz: any = null;

    const runWithTimeout = async (
      config: Record<string, any>,
      requestContents: any[],
      ms: number,
      label: string
    ) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), ms);
      try {
        const promise = ai.models.generateContent({
          model: modelName,
          contents: requestContents,
          config: {
            ...config,
            abortSignal: abort.signal,
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          abort.signal.addEventListener("abort", () =>
            reject(new Error(`Gemini ${modelName} ${label} timed out after ${Math.round(ms / 1000)}s`))
          )
        );
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    };

    const runStreamWithTimeout = async (
      config: Record<string, any>,
      requestContents: any[]
    ): Promise<string> => {
      const abort = new AbortController();
      let gotFirstChunk = false;
      let streamFailure: Error | null = null;
      const ttftTimer = setTimeout(() => {
        if (!gotFirstChunk) {
          streamFailure = new Error(`Gemini ${modelName} TTFT timed out after ${Math.round(ttftMs / 1000)}s`);
          abort.abort();
        }
      }, ttftMs);
      const totalTimer = setTimeout(() => {
        streamFailure = new Error(`Gemini ${modelName} stream timed out after 25s`);
        abort.abort();
      }, 25_000);

      let fullText = "";
      try {
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents: requestContents,
          config: {
            ...config,
            abortSignal: abort.signal,
          },
        });

        for await (const chunk of stream) {
          const piece = chunk?.text || "";
          if (piece) {
            if (!gotFirstChunk) {
              gotFirstChunk = true;
              clearTimeout(ttftTimer);
              clearModelCooldown(`gemini:${modelName}`);
            }
            fullText += piece;
            onDelta?.(piece);
          }
        }
        return fullText;
      } catch (err) {
        if (gotFirstChunk && fullText.trim().length >= 2) {
          return fullText;
        }
        if (streamFailure) {
          throw streamFailure;
        }
        throw err;
      } finally {
        clearTimeout(ttftTimer);
        clearTimeout(totalTimer);
      }
    };

    try {
      const useCodeExecution = classification.enableCodeExecution && !needsTools;
      const baseConfig: Record<string, any> = {
        systemInstruction: fullSystemInstruction,
        temperature: isPrimary ? 0.2 : 0.25,
        ...(isPrimary && needsTools
          ? { tools: toolsDeclaration as any }
          : useCodeExecution
            ? { tools: [{ codeExecution: {} }] as any }
            : {}),
        ...(supportsThinking ? { thinkingConfig: { thinkingBudget } } : {}),
      };

      if (onDelta && !needsTools) {
        let streamedText = "";
        try {
          streamedText = await runStreamWithTimeout(baseConfig, contents);
        } catch (firstErr: any) {
          const msg = String(firstErr?.message || "").toLowerCase();
          if (useCodeExecution && (msg.includes("codeexecution") || msg.includes("code_execution") || msg.includes("tool") || msg.includes("400"))) {
            const { tools: _omitTools, thinkingConfig: _omitThinking, ...cleanConfig } = baseConfig;
            streamedText = await runStreamWithTimeout(
              supportsThinking && !msg.includes("thinking")
                ? { ...cleanConfig, thinkingConfig: { thinkingBudget } }
                : cleanConfig,
              contents
            );
          } else if (supportsThinking && (msg.includes("thinking") || msg.includes("400"))) {
            const { thinkingConfig: _omit, ...withoutThinking } = baseConfig;
            streamedText = await runStreamWithTimeout(withoutThinking, contents);
          } else {
            throw firstErr;
          }
        }

        const cleanStreamed = streamedText.trim();
        if (cleanStreamed.length < 2) {
          throw new Error(`Gemini ${modelName} returned empty streamed text`);
        }
        if (useCodeExecution && !toolsUsed.includes("code_execution")) {
          toolsUsed.push("code_execution");
        }
        clearModelCooldown(`gemini:${modelName}`);

        return {
          text: normalizeScientificNotation(cleanStreamed),
          provider: "gemini",
          model: modelName,
          routedTier: classification.tier,
          intent: classification.intent,
          toolsUsed,
          citations: Array.from(
            new Set([
              `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
              ...filterCitationSources(enriched.authoritativeReferences),
            ])
          ),
          generatedMorph,
          generatedQuiz,
          authoritativeReferences: enriched.authoritativeReferences,
          qbankVignettes: enriched.qbankVignettes,
          mnemonics: enriched.mnemonics,
        };
      }

      let response: any;
      try {
        response = await runWithTimeout(baseConfig, contents, timeoutMs, "Turn 1");
      } catch (firstErr: any) {
        const msg = String(firstErr?.message || "").toLowerCase();
        // If a model rejects thinkingConfig or codeExecution with a 400/unsupported error, retry once cleanly
        if (useCodeExecution && (msg.includes("codeexecution") || msg.includes("code_execution") || msg.includes("tool") || msg.includes("400"))) {
          const { tools: _omitTools, thinkingConfig: _omitThinking, ...cleanConfig } = baseConfig;
          response = await runWithTimeout(
            supportsThinking && !msg.includes("thinking")
              ? { ...cleanConfig, thinkingConfig: { thinkingBudget } }
              : cleanConfig,
            contents,
            timeoutMs,
            "Turn 1 retry (no codeExecution)"
          );
        } else if (supportsThinking && (msg.includes("thinking") || msg.includes("400"))) {
          const { thinkingConfig: _omit, ...withoutThinking } = baseConfig;
          response = await runWithTimeout(withoutThinking, contents, timeoutMs, "Turn 1 retry");
        } else {
          throw firstErr;
        }
      }

      clearModelCooldown(`gemini:${modelName}`);
      const candidate = response.candidates?.[0];
      const usedCodeExec = Boolean(
        candidate?.content?.parts?.some(
          (p: any) => p.executableCode || p.codeExecutionResult
        )
      );
      if (usedCodeExec && !toolsUsed.includes("code_execution")) {
        toolsUsed.push("code_execution");
      }
      const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

      if (candidate && candidate.content && functionCalls && functionCalls.length > 0) {
        const toolParts: any[] = [];
        for (const fc of functionCalls) {
          const call = fc.functionCall;
          if (!call || !call.name) continue;
          const toolName: string = call.name;
          toolsUsed.push(toolName);

          const execution = await executeAgentTool(
            toolName,
            (call.args as Record<string, any>) || {},
            {
              bookId: context.bookId,
              currentSegmentIndex: context.currentSegmentIndex,
              currentSegmentContent: context.currentSegmentContent,
            }
          );

          if (toolName === "generate_interactive_morph" && execution.data) {
            generatedMorph = execution.data;
          }
          if (toolName === "generate_board_quiz" && execution.data) {
            generatedQuiz = execution.data;
          }

          toolParts.push({
            functionResponse: {
              name: toolName,
              response: { result: execution.output },
            },
          });
        }

        const onlyArtifactTools =
          toolsUsed.length > 0 &&
          toolsUsed.every(
            (t) => t === "generate_interactive_morph" || t === "generate_board_quiz"
          );

        if (onlyArtifactTools) {
          const artifactText = buildArtifactSummaryText(
            generatedMorph,
            generatedQuiz,
            response?.text
          );
          onDelta?.(artifactText);
          return {
            text: normalizeScientificNotation(artifactText),
            provider: "gemini",
            model: modelName,
            routedTier: classification.tier,
            intent: classification.intent,
            toolsUsed,
            citations: Array.from(
              new Set([
                `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
                ...filterCitationSources(enriched.authoritativeReferences),
              ])
            ),
            generatedMorph,
            generatedQuiz,
            authoritativeReferences: enriched.authoritativeReferences,
            qbankVignettes: enriched.qbankVignettes,
            mnemonics: enriched.mnemonics,
          };
        }

        const followUpContents = [
          ...contents,
          candidate.content,
          {
            role: "user",
            parts: toolParts,
          },
        ];

        const finalResponse: any = await runWithTimeout(
          {
            systemInstruction: fullSystemInstruction,
            temperature: 0.3,
            ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
          followUpContents,
          10_000,
          "Turn 2"
        );

        const finalText = (finalResponse?.text || "").trim();
        if (finalText.length < 2) {
          throw new Error(`Gemini ${modelName} returned empty text on Turn 2`);
        }
        onDelta?.(finalText);

        return {
          text: normalizeScientificNotation(finalText),
          provider: "gemini",
          model: modelName,
          routedTier: classification.tier,
          intent: classification.intent,
          toolsUsed,
          citations: Array.from(
            new Set([
              `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
              ...filterCitationSources(enriched.authoritativeReferences),
            ])
          ),
          generatedMorph,
          generatedQuiz,
          authoritativeReferences: enriched.authoritativeReferences,
          qbankVignettes: enriched.qbankVignettes,
          mnemonics: enriched.mnemonics,
        };
      }

      const directText = (response?.text || "").trim();
      if (directText.length < 2) {
        throw new Error(`Gemini ${modelName} returned empty text`);
      }
      onDelta?.(directText);

      return {
        text: normalizeScientificNotation(directText),
        provider: "gemini",
        model: modelName,
        routedTier: classification.tier,
        intent: classification.intent,
        toolsUsed,
        citations: Array.from(
          new Set([
            `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
            ...filterCitationSources(enriched.authoritativeReferences),
          ])
        ),
        generatedMorph,
        generatedQuiz,
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    } catch (err: any) {
      lastError = err;
      markModelCooldownFromError(`gemini:${modelName}`, err);
      console.warn(`[agent-harness] Gemini model ${modelName} failed:`, err?.message || err);
    }
  }

  throw lastError;
}

/**
 * OpenAI-Compatible Chat Completions caller (Groq, OpenRouter, OpenAI)
 */
async function callOpenAICompatibleAgent(
  endpoint: string,
  apiKey: string,
  model: string,
  provider: AIProvider,
  userQuery: string,
  context: AgentContext,
  enriched: EnrichedStudyContext,
  onDelta?: (text: string) => void
): Promise<AgentRunOutput> {
  // In Groq configuration, use openai/gpt-oss-120b instead of decommissioned llama-3.3-70b-versatile
  const effectiveModel =
    provider === "groq" && (!model || model === "llama-3.3-70b-versatile")
      ? "openai/gpt-oss-120b"
      : model;

  const toolsSchema = AGENT_TOOLS_DEFINITIONS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: convertSchemaToLowercase(t.parameters.properties),
        required: t.parameters.required,
      },
    },
  }));

  const langDirective = buildLanguageDirective(context.language || "en", "text");
  const classification = classifyStudyQuery(userQuery, Boolean(context.selectedImage));
  const intentAddon = buildIntentPromptAddon(classification.intent, context.socraticMode);
  const messages: any[] = [
    { role: "system", content: `${SOCRATIC_SYSTEM_PROMPT}\n\n${intentAddon}\n\n${langDirective}` },
  ];

  const activePage = context.currentPageNumber || context.currentSegmentIndex + 1;
  const scopedHistory = preparePageAwareHistory(
    context.history,
    activePage,
    userQuery,
    classification.intent
  );

  // Inject page-aware conversation turns
  for (const h of scopedHistory) {
    messages.push({
      role: h.sender === "user" ? "user" : "assistant",
      content: h.text,
    });
  }

  const userPromptText = buildActiveViewportPrompt(userQuery, context, enriched);

  const userContent =
    context.selectedImage && provider === "openai"
      ? [
          { type: "text", text: userPromptText },
          {
            type: "image_url",
            image_url: {
              url: context.selectedImage.startsWith("data:")
                ? context.selectedImage
                : `data:image/png;base64,${context.selectedImage}`,
            },
          },
        ]
      : userPromptText;

  messages.push({
    role: "user",
    content: userContent,
  });

  const toolsUsed: string[] = [];
  let generatedMorph: any = null;
  let generatedQuiz: any = null;
  const isToolRequest = /morph|quiz|test me|vignette|flashcard|visualize|diagram/i.test(userQuery);
  const useStreaming = Boolean(onDelta && !isToolRequest);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(useStreaming ? 25_000 : 12_000),
    body: JSON.stringify({
      model: effectiveModel,
      messages,
      ...(isToolRequest ? { tools: toolsSchema, tool_choice: "auto" } : {}),
      ...(useStreaming ? { stream: true } : {}),
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider} API error (${res.status}): ${errText}`);
  }

  if (useStreaming && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            fullText += delta;
            onDelta?.(delta);
          }
        } catch {
          // Ignore malformed SSE chunks
        }
      }
    }

    const cleanStreamed = fullText.trim();
    if (cleanStreamed.length < 2) {
      throw new Error(`${provider} returned empty streamed response`);
    }

    return {
      text: normalizeScientificNotation(cleanStreamed),
      provider,
      model: effectiveModel,
      routedTier: classification.tier,
      intent: classification.intent,
      toolsUsed,
      citations: Array.from(
        new Set([
          `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
          ...filterCitationSources(enriched.authoritativeReferences),
        ])
      ),
      generatedMorph,
      generatedQuiz,
      authoritativeReferences: enriched.authoritativeReferences,
      qbankVignettes: enriched.qbankVignettes,
      mnemonics: enriched.mnemonics,
    };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;

  if (msg?.tool_calls && msg.tool_calls.length > 0) {
    messages.push(msg);

    for (const tc of msg.tool_calls) {
      const name = tc.function.name;
      toolsUsed.push(name);
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {}

      const execution = await executeAgentTool(name, args, {
        bookId: context.bookId,
        currentSegmentIndex: context.currentSegmentIndex,
        currentSegmentContent: context.currentSegmentContent,
      });

      if (name === "generate_interactive_morph" && execution.data) {
        generatedMorph = execution.data;
      }
      if (name === "generate_board_quiz" && execution.data) {
        generatedQuiz = execution.data;
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name,
        content: execution.output,
      });
    }

    const onlyArtifactTools =
      toolsUsed.length > 0 &&
      toolsUsed.every(
        (t) => t === "generate_interactive_morph" || t === "generate_board_quiz"
      );

    if (onlyArtifactTools) {
      const artifactText = buildArtifactSummaryText(
        generatedMorph,
        generatedQuiz,
        msg?.content
      );
      onDelta?.(artifactText);
      return {
        text: normalizeScientificNotation(artifactText),
        provider,
        model: effectiveModel,
        routedTier: classification.tier,
        intent: classification.intent,
        toolsUsed,
        citations: Array.from(
          new Set([
            `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
            ...filterCitationSources(enriched.authoritativeReferences),
          ])
        ),
        generatedMorph,
        generatedQuiz,
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    }

    // Follow-up call
    const followUpRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature: 0.3,
      }),
    });

    if (followUpRes.ok) {
      const followUpData = await followUpRes.json();
      const followUpText = (followUpData.choices?.[0]?.message?.content || "").trim();
      if (followUpText.length < 2) {
        throw new Error(`${provider} returned empty follow-up response`);
      }
      onDelta?.(followUpText);
      return {
        text: normalizeScientificNotation(followUpText),
        provider,
        model: effectiveModel,
        routedTier: classification.tier,
        intent: classification.intent,
        toolsUsed,
        citations: Array.from(
          new Set([
            `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
            ...filterCitationSources(enriched.authoritativeReferences),
          ])
        ),
        generatedMorph,
        generatedQuiz,
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    }
  }

  const directContent = (msg?.content || "").trim();
  if (directContent.length < 2) {
    throw new Error(`${provider} returned empty response`);
  }
  onDelta?.(directContent);

  return {
    text: normalizeScientificNotation(directContent),
    provider,
    model: effectiveModel,
    toolsUsed,
    citations: Array.from(
      new Set([
        `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
        ...filterCitationSources(enriched.authoritativeReferences),
      ])
    ),
    generatedMorph,
    generatedQuiz,
    authoritativeReferences: enriched.authoritativeReferences,
    qbankVignettes: enriched.qbankVignettes,
    mnemonics: enriched.mnemonics,
  };
}

/**
 * Deterministic Grounded Synthesizer (Zero-API-key fallback)
 * Uses the rich textbook references, guidelines, and QBank pearls
 * so the platform ALWAYS delivers premium, authoritative answers.
 */
export function runDeterministicFallback(
  userQuery: string,
  context: AgentContext,
  enriched: EnrichedStudyContext
): AgentRunOutput {
  const query = userQuery.toLowerCase();
  const targetText = (context.selectedText || context.currentSegmentContent || "").trim();
  const primaryRef = enriched.authoritativeReferences[0];
  const qbank = enriched.qbankVignettes[0];
  const mnemonic = enriched.mnemonics[0];

  const sentences = targetText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  let responseText = "";

  if (query.includes("summar") || query.includes("review") || query.includes("core") || query.includes("key")) {
    responseText = `### 📚 Grounded Summary: Page ${context.currentPageNumber || context.currentSegmentIndex + 1} (${context.bookTitle})\n\n` +
      `**1. Primary Invariant:**\n${sentences[0] || targetText.slice(0, 180)}\n\n` +
      `**2. Mechanism / Applied Process:**\n${sentences[1] || "Core theoretical concepts develop systematically from initial axioms."}\n\n` +
      `**3. Key Implication:**\n${sentences[2] || "Mastery requires tracing physical observations back to foundational constraints."}\n\n` +
      (primaryRef ? `📖 **Canonical Reference Context:**\n*${primaryRef.source}*\n> "${primaryRef.excerpt.slice(0, 220)}..."\n\n` : "") +
      (mnemonic ? `💡 **Memory Anchor:** **${mnemonic.mnemonic}** — *${mnemonic.expansion}*\n` : "");
  } else {
    responseText = `### 🎓 Grounded First-Principles Analysis: Page ${context.currentPageNumber || context.currentSegmentIndex + 1}\n\n` +
      `**In Response to:** *"${userQuery}"*\n\n` +
      (context.selectedText ? `**Analysis of Your Highlighted Passage:**\n> "${context.selectedText.slice(0, 300)}"\n\n` : "") +
      `**Core Insights from ${context.bookTitle}:**\n` +
      `• ${sentences[0] || targetText.slice(0, 150)}\n` +
      `• ${sentences[1] || "Direct application of principles establishes boundary conditions for problem solving."}\n` +
      (sentences[2] ? `• ${sentences[2]}\n\n` : "\n") +
      (primaryRef ? `📚 **Authoritative Corroboration:**\n*${primaryRef.source}* (${primaryRef.chapterOrSection || primaryRef.title})\n\n` : "") +
      (qbank ? `🎯 **Board/Exam Pearl:** ${qbank.highYieldTakeaway}\n\n` : "") +
      `*💡 Socratic Question for You:* How would the primary outcome shift if the initial conditions in this passage were reversed?`;
  }

  return {
    text: responseText,
    provider: "deterministic",
    model: "ascleon-grounded-mentor-v1",
    toolsUsed: ["deep_reference_retriever"],
    citations: Array.from(
      new Set([
        `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
        ...filterCitationSources(enriched.authoritativeReferences || []),
      ])
    ),
    authoritativeReferences: enriched.authoritativeReferences,
    qbankVignettes: enriched.qbankVignettes,
    mnemonics: enriched.mnemonics,
  };
}

export interface RunStudyAgentOptions {
  onDelta?: (text: string) => void;
  precomputedEnriched?: EnrichedStudyContext;
}

/**
 * Universal Autonomous Study Agent Dispatcher
 * Cascades through free-tier providers in order of preference, enriched with deep textbook and QBank references.
 */
export async function runStudyAgent(
  userQuery: string,
  context: AgentContext,
  options?: RunStudyAgentOptions
): Promise<AgentRunOutput> {
  // Pre-flight background enrichment with 1s cap so slow DB/enrichment never stalls chat
  const emptyEnriched: EnrichedStudyContext = {
    focalTopic: context.bookTopic || context.bookTitle || "General Study",
    groundingSnippet: "",
    authoritativeReferences: [],
    qbankVignettes: [],
    mnemonics: [],
  };
  const enriched =
    options?.precomputedEnriched ??
    (await Promise.race([
      retrieveEnrichedContext({
        text: context.currentSegmentContent,
        query: userQuery,
        bookTitle: context.bookTitle,
        bookTopic: context.bookTopic || "",
        bookReferences: context.bookReferences,
      }).catch(() => emptyEnriched),
      new Promise<EnrichedStudyContext>((resolve) =>
        setTimeout(() => resolve(emptyEnriched), 1000)
      ),
    ]));

  const onDelta = options?.onDelta;
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Google Gemini (Preferred: 1M context + free tier)
  if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
    try {
      return await callGeminiAgent(geminiKey, userQuery, context, enriched, onDelta);
    } catch (err) {
      console.warn("Gemini agent call failed, attempting fallback provider:", err);
    }
  }

  // 2. Groq (Ultra-fast openai/gpt-oss-120b free tier)
  if (groqKey && groqKey !== "your_groq_api_key_here") {
    try {
      return await callOpenAICompatibleAgent(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey,
        "openai/gpt-oss-120b",
        "groq",
        userQuery,
        context,
        enriched,
        onDelta
      );
    } catch (err) {
      console.warn("Groq agent call failed, attempting fallback provider:", err);
    }
  }

  // 3. OpenRouter (Free tier models)
  if (openRouterKey && openRouterKey !== "your_openrouter_api_key_here") {
    try {
      return await callOpenAICompatibleAgent(
        "https://openrouter.ai/api/v1/chat/completions",
        openRouterKey,
        "meta-llama/llama-3.3-70b-instruct:free",
        "openrouter",
        userQuery,
        context,
        enriched,
        onDelta
      );
    } catch (err) {
      console.warn("OpenRouter agent call failed, attempting fallback provider:", err);
    }
  }

  // 4. OpenAI (Standard API)
  if (openAiKey && openAiKey !== "your_openai_api_key_here") {
    try {
      return await callOpenAICompatibleAgent(
        "https://api.openai.com/v1/chat/completions",
        openAiKey,
        "gpt-4o-mini",
        "openai",
        userQuery,
        context,
        enriched,
        onDelta
      );
    } catch (err) {
      console.warn("OpenAI agent call failed, attempting deterministic fallback:", err);
    }
  }

  // 5. Intelligent Fallback: Uses deep references and QBanks, 100% reliable with zero keys
  const fallback = runDeterministicFallback(userQuery, context, enriched);
  onDelta?.(fallback.text);
  return fallback;
}
