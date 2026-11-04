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

2. ADAPTIVE QUERY-INTENT HANDLING:
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
     LV Failure → ↑ LVEDP → ↑ LA Pressure → ↑ Pulmonary Venous Pressure → Pulmonary Edema.`;

/**
 * Executes a call to Google Gemini with tools and deep background references
 */
async function callGeminiAgent(
  apiKey: string,
  userQuery: string,
  context: AgentContext,
  enriched: EnrichedStudyContext
): Promise<AgentRunOutput> {
  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-3-flash-preview";

  // Build grounding context from active page + background textbook knowledge
  const pageIntro = `Active Book: "${context.bookTitle}" (Section ${context.currentSegmentIndex + 1}${
    context.currentPageNumber ? `, Page ${context.currentPageNumber}` : ""
  })\nActive Section Text:\n${context.currentSegmentContent}\n${
    context.selectedText ? `\nUser Specifically Selected/Highlighted:\n"${context.selectedText}"\n` : ""
  }\n\n${enriched.groundingSnippet}`;

  const isToolRequest = /morph|quiz|test me|vignette|flashcard|visualize|diagram/i.test(userQuery);

  const toolsDeclaration = isToolRequest ? [
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
  ] : undefined;

  // Turn 1: Initial call with prompt injected as system instruction
  const userParts: any[] = [
    { text: `${pageIntro}\n\nStudent Question / Query:\n${userQuery}` },
  ];

  if (context.selectedImage) {
    const cleanBase64 = context.selectedImage.replace(/^data:image\/\w+;base64,/, "");
    userParts.push({
      inlineData: {
        mimeType: "image/png",
        data: cleanBase64,
      },
    });
  }

  const contents: any[] = [
    {
      role: "user",
      parts: userParts,
    },
  ];

  const toolsUsed: string[] = [];
  let generatedMorph: any = null;
  let generatedQuiz: any = null;

  const isQuickQuery =
    userQuery.trim().length < 80 &&
    !userQuery.toLowerCase().includes("deep dive") &&
    !userQuery.toLowerCase().includes("mechanism") &&
    !userQuery.toLowerCase().includes("step-by-step") &&
    !userQuery.toLowerCase().includes("breakdown");

  const langDirective = buildLanguageDirective(context.language || "en", "text");
  const fullSystemInstruction = `${SOCRATIC_SYSTEM_PROMPT}\n\n${langDirective}`;

  try {
    const generatePromise = ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: fullSystemInstruction,
        tools: toolsDeclaration as any,
        temperature: 0.2,
        thinkingConfig: {
          thinkingBudget: isQuickQuery ? 0 : 256,
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini call timed out after 30s")), 30000)
    );

    const response: any = await Promise.race([generatePromise, timeoutPromise]);

    const candidate = response.candidates?.[0];
    const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall);

    if (candidate && candidate.content && functionCalls && functionCalls.length > 0) {
      // Execute each tool
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

      // Turn 2: Provide tool results back to Gemini for final response
      const followUpContents = [
        ...contents,
        candidate.content,
        {
          role: "user",
          parts: toolParts,
        },
      ];

      const finalResponsePromise = ai.models.generateContent({
        model: modelName,
        contents: followUpContents,
        config: {
          temperature: 0.3,
          thinkingConfig: {
            thinkingBudget: isQuickQuery ? 0 : 256,
          },
        },
      });

      const finalTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini Turn 2 call timed out after 30s")), 30000)
      );

      const finalResponse: any = await Promise.race([finalResponsePromise, finalTimeoutPromise]);

      return {
        text: normalizeScientificNotation(
          finalResponse.text ||
          "Here is the synthesized clinical explanation grounded in your active text and canonical textbooks."
        ),
        provider: "gemini",
        model: modelName,
        toolsUsed,
        citations: [
          `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
          ...enriched.authoritativeReferences.map((r) => r.source),
        ],
        generatedMorph,
        generatedQuiz,
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    }

    return {
      text: normalizeScientificNotation(
        response.text ||
        "Grounded analysis completed based on your active chapter reading and textbook references."
      ),
      provider: "gemini",
      model: modelName,
      toolsUsed,
      citations: [
        `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
        ...enriched.authoritativeReferences.map((r) => r.source),
      ],
      generatedMorph,
      generatedQuiz,
      authoritativeReferences: enriched.authoritativeReferences,
      qbankVignettes: enriched.qbankVignettes,
      mnemonics: enriched.mnemonics,
    };
  } catch (err: any) {
    // If primary model hits an error, try gemini-3.8-flash fallback
    try {
      const fallbackResp = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
      });
      return {
        text: normalizeScientificNotation(fallbackResp.text || "Analysis completed."),
        provider: "gemini",
        model: "gemini-3.8-flash",
        toolsUsed: [],
        citations: [`Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`],
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    } catch {
      throw err;
    }
  }
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
  enriched: EnrichedStudyContext
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
  const messages: any[] = [
    { role: "system", content: `${SOCRATIC_SYSTEM_PROMPT}\n\n${langDirective}\n\n${enriched.groundingSnippet}` },
    {
      role: "user",
      content: `Book: "${context.bookTitle}" (${context.currentPageNumber ? `Page ${context.currentPageNumber}` : `Section ${context.currentSegmentIndex + 1}`})\nActive Text:\n${
        context.currentSegmentContent
      }\n${context.selectedText ? `Highlighted Passage:\n"${context.selectedText}"\n` : ""}\nQuery: ${userQuery}`,
    },
  ];

  const toolsUsed: string[] = [];
  let generatedMorph: any = null;
  let generatedQuiz: any = null;
  const isToolRequest = /morph|quiz|test me|vignette|flashcard|visualize|diagram/i.test(userQuery);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      model: effectiveModel,
      messages,
      ...(isToolRequest ? { tools: toolsSchema, tool_choice: "auto" } : {}),
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider} API error (${res.status}): ${errText}`);
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

    // Follow-up call
    const followUpRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature: 0.3,
      }),
    });

    if (followUpRes.ok) {
      const followUpData = await followUpRes.json();
      return {
        text: normalizeScientificNotation(
          followUpData.choices?.[0]?.message?.content ||
          "Grounded explanation synthesized."
        ),
        provider,
        model: effectiveModel,
        toolsUsed,
        citations: [
          `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
          ...enriched.authoritativeReferences.map((r) => r.source),
        ],
        generatedMorph,
        generatedQuiz,
        authoritativeReferences: enriched.authoritativeReferences,
        qbankVignettes: enriched.qbankVignettes,
        mnemonics: enriched.mnemonics,
      };
    }
  }

  return {
    text: normalizeScientificNotation(
      msg?.content || "Analysis synthesized from active study text."
    ),
    provider,
    model: effectiveModel,
    toolsUsed,
    citations: [
      `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
      ...enriched.authoritativeReferences.map((r) => r.source),
    ],
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
    citations: [
      `Page ${context.currentPageNumber || context.currentSegmentIndex + 1}`,
      ...(enriched.authoritativeReferences.map((r) => r.source) || []),
    ],
    authoritativeReferences: enriched.authoritativeReferences,
    qbankVignettes: enriched.qbankVignettes,
    mnemonics: enriched.mnemonics,
  };
}

/**
 * Universal Autonomous Study Agent Dispatcher
 * Cascades through free-tier providers in order of preference, enriched with deep textbook and QBank references.
 */
export async function runStudyAgent(
  userQuery: string,
  context: AgentContext
): Promise<AgentRunOutput> {
  // Pre-flight background enrichment: Dynamically adapts to the book title and text
  const enriched = await retrieveEnrichedContext({
    text: context.currentSegmentContent,
    query: userQuery,
    bookTitle: context.bookTitle,
    bookTopic: context.bookTopic || "",
    bookReferences: context.bookReferences,
  });

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Google Gemini (Preferred: 1M context + free tier)
  if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
    try {
      return await callGeminiAgent(geminiKey, userQuery, context, enriched);
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
        enriched
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
        enriched
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
        enriched
      );
    } catch (err) {
      console.warn("OpenAI agent call failed, attempting deterministic fallback:", err);
    }
  }

  // 5. Intelligent Fallback: Uses deep references and QBanks, 100% reliable with zero keys
  return runDeterministicFallback(userQuery, context, enriched);
}
