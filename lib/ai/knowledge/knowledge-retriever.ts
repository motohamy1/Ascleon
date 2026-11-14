import {
  ReferenceResource,
  QBankVignette,
  HighYieldMnemonic,
  EnrichedStudyContext,
} from "@/types/knowledge";
import {
  CLINICAL_AUTHORITATIVE_REFERENCES,
  CLINICAL_QBANK_REPOSITORY,
  CLINICAL_MNEMONICS,
} from "./deep-corpus";
import { connectToDatabase } from "@/database/mongoose";
import KnowledgeNode from "@/database/models/knowledge-node.model";

import { GoogleGenAI } from "@google/genai";

// In-memory cache for dynamic DB knowledge nodes and LLM-resolved canonical references
const knowledgeNodeCache = new Map<string, any[]>();
const dynamicRefCache = new Map<string, ReferenceResource[]>();

function isGenericReferenceName(name: string): boolean {
  const low = name.trim().toLowerCase();
  return (
    !low ||
    low.startsWith("standard reference corpus") ||
    low.startsWith("authoritative literature on") ||
    low.startsWith("authoritative canon for") ||
    low === "peer-reviewed academic review literature" ||
    low === "authoritative society guidelines & textbooks"
  );
}

/**
 * Resolves exact, topic-specific canonical textbooks and guidelines using Gemini
 * when the book has no pre-digested blueprint references or the static corpus doesn't cover the topic.
 */
async function resolveDynamicCanonicalReferences(params: {
  bookTitle: string;
  domain: string;
  text: string;
  query: string;
}): Promise<ReferenceResource[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") return [];

  const topicHint = (params.query || params.text.slice(0, 200))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const cacheKey = `${params.domain}:${params.bookTitle}:${topicHint.slice(0, 60)}`.toLowerCase();
  const cached = dynamicRefCache.get(cacheKey);
  if (cached) return cached;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Identify 2-3 REAL, authoritative, world-class textbooks or official clinical/academic guidelines that directly cover the EXACT topic in the study excerpt below.
Book Title: "${params.bookTitle}"
Detected Field: "${params.domain}"
Student Query: "${params.query}"
Excerpt:
"""
${params.text.slice(0, 900)}
"""

STRICT RULES:
- Return ONLY references that genuinely match the subject of the Book Title and Excerpt (e.g., for MRCP / Internal Medicine on Pulmonary Embolism -> NICE NG158, ESC Guidelines on Acute Pulmonary Embolism, Kumar & Clark's Clinical Medicine; NEVER return surgery textbooks for internal medicine topics).
- Return ONLY valid JSON array of 2-3 objects:
[
  {
    "source": "Exact Textbook or Guideline Name",
    "type": "textbook" | "guideline",
    "title": "Relevant Chapter or Guideline Section",
    "chapterOrSection": "Chapter/Section",
    "excerpt": "1-2 sentence concise authoritative principle",
    "clinicalPearls": ["1 concise high-yield pearl"]
  }
]`;

    const genPromise = ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Dynamic ref timeout")), 2500)
    );
    const resp: any = await Promise.race([genPromise, timeoutPromise]);
    const raw = resp?.text?.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const refs: ReferenceResource[] = parsed
      .filter((r: any) => r?.source && !isGenericReferenceName(String(r.source)))
      .slice(0, 3)
      .map((r: any, idx: number) => ({
        id: `ref-llm-${idx + 1}`,
        source: String(r.source),
        type: r.type === "guideline" ? "guideline" : "textbook",
        title: String(r.title || r.source),
        chapterOrSection: String(r.chapterOrSection || "Core Reference"),
        excerpt: String(r.excerpt || ""),
        clinicalPearls: Array.isArray(r.clinicalPearls) ? r.clinicalPearls.map(String) : [],
        relevanceTag: params.domain,
      }));

    if (refs.length > 0) {
      dynamicRefCache.set(cacheKey, refs);
    }
    return refs;
  } catch {
    return [];
  }
}

export interface ContextRetrievalOptions {
  text: string;
  query?: string;
  bookTitle?: string;
  bookTopic?: string;
  bookReferences?: string[];
}

/**
 * Universal Multi-Domain Knowledge Retriever
 * Dynamically detects the domain (Surgery, Cardiology, Medicine, Computer Science, AI, Law, Finance)
 * and retrieves or synthesizes the exact canonical textbooks, guidelines, and QBank vignettes.
 */
export async function retrieveEnrichedContext(
  textOrOptions: string | ContextRetrievalOptions,
  optionalQuery?: string
): Promise<EnrichedStudyContext> {
  let text = "";
  let query = "";
  let bookTitle = "";
  let bookTopic = "";
  let bookReferences: string[] = [];

  if (typeof textOrOptions === "string") {
    text = textOrOptions;
    query = optionalQuery || "";
  } else {
    text = textOrOptions.text || "";
    query = textOrOptions.query || "";
    bookTitle = textOrOptions.bookTitle || "";
    bookTopic = textOrOptions.bookTopic || "";
    bookReferences = textOrOptions.bookReferences || [];
  }

  // If authoritative dynamic references were already supplied by book blueprint, prioritize them (excluding generic placeholders)
  const validExplicitRefs = Array.isArray(bookReferences)
    ? bookReferences.filter((r: any) => {
        const name = typeof r === "string" ? r : r?.source || r?.title || "";
        return name && !isGenericReferenceName(String(name));
      })
    : [];

  if (validExplicitRefs.length > 0) {
    const formattedRefs: ReferenceResource[] = validExplicitRefs.map((r: any, idx: number) => {
      if (typeof r === "object" && r.source) return r;
      const refTitle = typeof r === "string" ? r : r.title || r.source || "Canonical Reference";
      return {
        id: `ref-dynamic-${idx + 1}`,
        source: refTitle,
        type: "textbook" as const,
        title: refTitle,
        chapterOrSection: `Canonical Grounding for ${bookTitle}`,
        excerpt: `Authoritative literature dynamically grounded for ${bookTopic || bookTitle}.`,
        clinicalPearls: [`Grounded in verified source text for ${bookTitle}.`],
        relevanceTag: (bookTopic || "academic_canon").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      };
    });

    const snippet = formattedRefs
      .map((r) => `[Canonical Reference: ${r.source} - ${r.title}]\n"${r.excerpt}"`)
      .join("\n\n");

    return {
      focalTopic: bookTopic || "Primary Source Study",
      authoritativeReferences: formattedRefs,
      qbankVignettes: [],
      mnemonics: [],
      groundingSnippet: snippet,
    };
  }

  const combined = `${bookTitle} ${bookTopic} ${text} ${query}`.toLowerCase();
  const bookScope = `${bookTitle} ${bookTopic}`.toLowerCase();

  // 1. DYNAMIC DOMAIN DETECTION
  // Priority order: specific medical subdomains (surgery / cardiology) > broad medicine > other technical domains > general
  let domain: "surgery" | "cardiology" | "medicine" | "cs_architecture" | "ai_ml" | "law" | "finance" | "general" = "general";

  const isInternalMedicine =
    bookScope.includes("internal medicine") ||
    bookScope.includes("mrcp") ||
    bookScope.includes("plab") ||
    bookScope.includes("usmle") ||
    bookScope.includes("kumar") ||
    bookScope.includes("harrison") ||
    bookScope.includes("davidson") ||
    bookScope.includes("oxford handbook") ||
    bookScope.includes("physician") ||
    bookScope.includes("endocrin") ||
    bookScope.includes("nephrol") ||
    bookScope.includes("gastroenterol") ||
    bookScope.includes("rheumatol") ||
    bookScope.includes("hematol") ||
    bookScope.includes("pulmonol") ||
    bookScope.includes("respirat") ||
    bookScope.includes("pediatric");

  const isExplicitSurgery =
    !isInternalMedicine &&
    (bookScope.includes("surgery") ||
      bookScope.includes("surgical") ||
      bookScope.includes("operative") ||
      bookScope.includes("bailey") ||
      bookScope.includes("browse") ||
      bookScope.includes("sabiston") ||
      bookScope.includes("schwartz") ||
      bookScope.includes("mrcs"));

  if (isExplicitSurgery) {
    domain = "surgery";
  } else if (isInternalMedicine) {
    domain = "medicine";
  } else if (
    combined.includes("heart") ||
    combined.includes("cardio") ||
    combined.includes("murmur") ||
    combined.includes("stenosis") ||
    combined.includes("auscultat") ||
    combined.includes("s1") ||
    combined.includes("s2") ||
    combined.includes("mrcp") ||
    combined.includes("ekg") ||
    combined.includes("ecg") ||
    combined.includes("arrhythmia") ||
    combined.includes("myocardial") ||
    combined.includes("heart failure") ||
    combined.includes("cardiomyopathy")
  ) {
    domain = "cardiology";
  } else if (
    combined.includes("patient") ||
    combined.includes("clinical") ||
    combined.includes("syndrome") ||
    combined.includes("patholog") ||
    combined.includes("pharmacology") ||
    combined.includes("usmle") ||
    combined.includes("diagnosis") ||
    combined.includes("treatment") ||
    combined.includes("management") ||
    combined.includes("medication") ||
    combined.includes("therapy") ||
    combined.includes("bedside") ||
    combined.includes("ward") ||
    combined.includes("rounds")
  ) {
    domain = "medicine";
  } else if (
    combined.includes("software") ||
    combined.includes("distributed") ||
    combined.includes("database") ||
    combined.includes("concurrency") ||
    combined.includes("architecture") ||
    combined.includes("api") ||
    combined.includes("microservice") ||
    combined.includes("system design") ||
    combined.includes("design pattern") ||
    combined.includes("interface") ||
    combined.includes("service") ||
    combined.includes("rest") ||
    combined.includes("endpoint")
  ) {
    domain = "cs_architecture";
  } else if (
    combined.includes("machine learning") ||
    combined.includes("transformer") ||
    combined.includes("neural") ||
    combined.includes("gradient descent") ||
    combined.includes("deep learning") ||
    combined.includes("ai") ||
    combined.includes("artificial intelligence") ||
    combined.includes("llm") ||
    combined.includes("large language") ||
    combined.includes("prompt") ||
    combined.includes("token") ||
    combined.includes("training")
  ) {
    domain = "ai_ml";
  } else if (
    combined.includes("jurisdiction") ||
    combined.includes("tort") ||
    combined.includes("constitutional") ||
    combined.includes("statute") ||
    combined.includes("court") ||
    combined.includes("legal") ||
    combined.includes("law") ||
    combined.includes("precedent") ||
    combined.includes("regulation")
  ) {
    domain = "law";
  } else if (
    combined.includes("portfolio") ||
    combined.includes("derivative") ||
    combined.includes("cfa") ||
    combined.includes("equity") ||
    combined.includes("valuation") ||
    combined.includes("asset") ||
    combined.includes("risk management") ||
    combined.includes("investment") ||
    combined.includes("financial")
  ) {
    domain = "finance";
  }

  // If bookTopic is provided and matches a known domain, prefer that over detected domain
  if (bookTopic && bookTopic.trim()) {
    const topicLower = bookTopic.trim().toLowerCase();
    const topicDomainMap: Record<string, "surgery" | "cardiology" | "medicine" | "cs_architecture" | "ai_ml" | "law" | "finance" | "general"> = {
      surgery: "surgery",
      "clinical surgery": "surgery",
      "general surgery": "surgery",
      cardiology: "cardiology",
      heart: "cardiology",
      cardiovascular: "cardiology",
      circulation: "cardiology",
      medicine: "medicine",
      clinical: "medicine",
      pharmacology: "medicine",
      pathology: "medicine",
      anatomy: "medicine",
      usmle: "medicine",
      cs_architecture: "cs_architecture",
      software: "cs_architecture",
      distributed: "cs_architecture",
      architecture: "cs_architecture",
      ai_ml: "ai_ml",
      "machine learning": "ai_ml",
      "artificial intelligence": "ai_ml",
      law: "law",
      legal: "law",
      finance: "finance",
      cfa: "finance",
      portfolio: "finance",
    };
    if (topicDomainMap[topicLower]) {
      domain = topicDomainMap[topicLower];
    } else if (topicLower.includes("surg")) {
      domain = "surgery";
    }
  }

  let focalTopic = bookTopic || "Foundational First Principles";
  const matchingRefs: ReferenceResource[] = [];
  const matchingQBank: QBankVignette[] = [];
  const matchingMnemonics: HighYieldMnemonic[] = [];

  // 2. DOMAIN-SPECIFIC RESOURCE RESOLUTION
  switch (domain) {
    case "surgery": {
      focalTopic = "Clinical Surgery, History Taking & Bedside Examination";
      matchingRefs.push({
        id: "ref-bailey-love-1",
        source: "Bailey & Love's Short Practice of Surgery",
        edition: "28th Edition",
        type: "textbook",
        title: "Principles of Surgical History Taking, Swellings & Ulcers",
        chapterOrSection: "Part 1: Basic Principles & Clinical Assessment",
        excerpt:
          "Systematic surgical evaluation begins with the patient's exact complaint in their own words, followed by chronological analysis of onset, course, and duration. Local examination of any swelling requires assessment of site, size, shape, surface, edge, consistency, fluctuation, transillumination, reducibility, anatomical plane attachment, neurovascular compression (V.A.N.), and regional lymphadenopathy.",
        clinicalPearls: [
          "Onset & Course: Sudden onset suggests vascular trauma/hematoma; acute suggests inflammation/abscess; gradual progressive suggests neoplasia; intermittent suggests reducible hernia.",
          "Never examine a localized swelling without evaluating the draining regional lymph nodes and distal neurovascular (V.A.N.) status.",
        ],
        relevanceTag: "clinical_surgery_swelling_assessment",
      });
      matchingRefs.push({
        id: "ref-browse-surgery-1",
        source: "Browse's Introduction to the Symptoms & Signs of Surgical Disease",
        edition: "6th Edition",
        type: "textbook",
        title: "Bedside Examination of Lumps, Swellings, and Pressure Effects",
        chapterOrSection: "Chapter 2: The History and General Principles of Local Examination",
        excerpt:
          "A mass or swelling exerts local mechanical effects on adjacent anatomical structures: venous compression causes distal pitting edema and secondary varicosities; arterial compromise causes pallor, coldness, and trophic skin/nail changes; nerve compression produces radicular pain, paraesthesia, or lower motor neuron paresis.",
        clinicalPearls: [
          "V.A.N. Framework for local pressure symptoms: Vein (edema/varicosities), Artery (ischemia/trophic changes), Nerve (paresthesia/motor weakness).",
          "Always record the chief complaint in the patient's vernacular rather than premature diagnostic terminology.",
        ],
        relevanceTag: "surgical_signs_symptoms_van",
      });
      matchingQBank.push({
        id: "qbank-surg-01",
        examType: "General Clinical",
        topic: "Surgical Swelling Assessment & Neurovascular Compression",
        difficulty: "hard",
        vignette:
          "A 52-year-old patient presents with a painless, progressively enlarging mass in the supraclavicular fossa noticed accidentally 3 months ago. Over the past 2 weeks, the patient developed unilateral upper limb swelling with prominent superficial veins and tingling along the medial border of the forearm.\n\nIn systematic surgical history taking, what do these secondary limb symptoms represent?",
        options: [
          "Systemic paraneoplastic endocrine syndrome",
          "Local pressure effects on adjacent Vein and Nerve structures (V.A.N. triad)",
          "Primary intrinsic venous thrombosis unrelated to the mass",
          "Acute inflammatory cellulitis of the extremity",
        ],
        correctIndex: 1,
        distractorRationales: {
          0: "Incorrect: Unilateral venous engorgement and dermatomal paresthesia reflect direct anatomical compression rather than a systemic humoral effect.",
          1: "Correct: Progressive masses compress neighboring neurovascular bundles (V.A.N.): subclavian vein obstruction increases hydrostatic pressure causing edema and venous engorgement, while lower brachial plexus compression produces medial forearm paresthesia.",
          2: "Incorrect: The symptoms are directly secondary to extrinsic mechanical compression by the enlarging mass.",
          3: "Incorrect: An accidental painless onset with progressive course and mechanical obstruction points to neoplasia rather than acute cellulitis.",
        },
        highYieldTakeaway:
          "Always evaluate every surgical swelling for local pressure symptoms on neighboring Veins (edema/varicosities), Arteries (ischemia/trophic changes), and Nerves (paresthesia/paresis) alongside regional lymph nodes.",
        sourceQBank: "MRCS / Clinical Surgery Qualifying Bank",
      });
      matchingMnemonics.push({
        mnemonic: "O.C.D. + V.A.N.",
        expansion: "Onset, Course, Duration + Vein, Artery, Nerve Pressure Symptoms",
        rule: "Analyze every swelling chronologically (O.C.D.) and screen for local mechanical compression on neighboring neurovascular bundles (V.A.N.).",
        clinicalContext: "Surgical swelling history taking and local complication screening.",
      });
      break;
    }

    case "cardiology":
    case "medicine": {
      const isHeartFailure =
        combined.includes("heart failure") ||
        combined.includes("ahf") ||
        combined.includes("adchf") ||
        combined.includes("hfref") ||
        combined.includes("hfpef") ||
        combined.includes("pulmonary edema") ||
        combined.includes("pioglitazone") ||
        combined.includes("verapamil");

      const isHeartSounds =
        combined.includes("split") ||
        combined.includes("s2") ||
        combined.includes("s1") ||
        combined.includes("s3") ||
        combined.includes("s4") ||
        combined.includes("gallop") ||
        combined.includes("auscultat");

      const isMurmur =
        combined.includes("murmur") ||
        combined.includes("maneuver") ||
        combined.includes("valsalva") ||
        combined.includes("handgrip") ||
        combined.includes("stenosis") ||
        combined.includes("regurgit");

      if (isHeartFailure) {
        focalTopic = "Acute & Chronic Heart Failure Pathophysiology & Management";
        const hfRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "acute_heart_failure_pharmacology");
        const harrisonsRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "gallop_sounds_s3_s4");
        if (hfRef) matchingRefs.push(hfRef);
        if (harrisonsRef) matchingRefs.push(harrisonsRef);
        const failureMnemonic = CLINICAL_MNEMONICS.find(m => m.mnemonic === "FAILURE");
        if (failureMnemonic) matchingMnemonics.push(failureMnemonic);
      } else if (isHeartSounds) {
        focalTopic = "Heart Sounds (S1-S4) & Splitting Mechanics";
        const braunwaldRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "heart_sounds_s2_splitting");
        const harrisonsRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "gallop_sounds_s3_s4");
        if (braunwaldRef) matchingRefs.push(braunwaldRef);
        if (harrisonsRef) matchingRefs.push(harrisonsRef);
        const asdMnemonic = CLINICAL_MNEMONICS.find(m => m.mnemonic.includes("ASD"));
        if (asdMnemonic) matchingMnemonics.push(asdMnemonic);
      } else if (isMurmur) {
        focalTopic = "Cardiac Murmurs, Auscultation & Dynamic Bedside Manoeuvres";
        const oxfordRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "murmurs_dynamic_maneuvers");
        const escRef = CLINICAL_AUTHORITATIVE_REFERENCES.find(r => r.relevanceTag === "valvular_guidelines_criteria");
        if (oxfordRef) matchingRefs.push(oxfordRef);
        if (escRef) matchingRefs.push(escRef);
        const rile = CLINICAL_MNEMONICS.find(m => m.mnemonic === "RILE");
        const handgrip = CLINICAL_MNEMONICS.find(m => m.mnemonic.includes("HANDS DOWN"));
        if (rile) matchingMnemonics.push(rile);
        if (handgrip) matchingMnemonics.push(handgrip);
      } else {
        focalTopic = "Clinical Medicine & Evidence-Based Guidelines";
        // Dynamically resolve exact canonical references for this specific medical topic (e.g., PE, ALS, Renal, etc.)
        const llmRefs = await resolveDynamicCanonicalReferences({
          bookTitle,
          domain,
          text,
          query,
        });
        if (llmRefs.length > 0) {
          matchingRefs.push(...llmRefs);
        } else {
          // Topic-aware clinical fallback (never surgery distractors)
          const isPEorVTE =
            combined.includes("pulmonary embolism") ||
            combined.includes("dvt") ||
            combined.includes("thrombolysis") ||
            combined.includes("doac") ||
            combined.includes("lmwh") ||
            combined.includes("spesi");
          const isPeriArrest =
            combined.includes("peri-arrest") ||
            combined.includes("bradycardia") ||
            combined.includes("tachycardia") ||
            combined.includes("atropine") ||
            combined.includes("cardioversion") ||
            combined.includes("asystole");

          if (isPEorVTE) {
            focalTopic = "Venous Thromboembolism & Pulmonary Embolism";
            matchingRefs.push({
              id: "ref-nice-ng158",
              source: "NICE Guideline NG158: Venous thromboembolic diseases",
              type: "guideline",
              title: "Diagnosis, Risk Stratification & Anticoagulation for PE",
              chapterOrSection: "Initial & Long-Term PE Management",
              excerpt:
                "Offer apixaban or rivaroxaban as first-line anticoagulation for confirmed PE unless contraindicated; consider thrombolysis (e.g. alteplase) for haemodynamically unstable massive PE.",
              clinicalPearls: [
                "Use sPESI to assess suitability for outpatient management in haemodynamically stable PE.",
                "Use LMWH throughout pregnancy and for at least 6 weeks postpartum.",
              ],
              relevanceTag: "pulmonary_embolism_nice",
            });
          }
          if (isPeriArrest) {
            focalTopic = "Peri-Arrest Arrhythmias & Resuscitation";
            matchingRefs.push({
              id: "ref-resus-uk-als",
              source: "Resuscitation Council UK: Adult Advanced Life Support Guidelines",
              type: "guideline",
              title: "Peri-Arrest Bradycardia & Tachycardia Algorithms",
              chapterOrSection: "Section: Peri-Arrest Arrhythmias",
              excerpt:
                "Assess for adverse signs (shock, syncope, myocardial ischaemia, heart failure). First-line for unstable bradycardia is atropine 500 mcg IV; unstable tachycardia requires immediate synchronised DC cardioversion.",
              clinicalPearls: [
                "Screen for reversible causes: 4 Hs (Hypoxia, Hypovolaemia, Hypo/hyperkalaemia, Hypothermia) and 4 Ts (Thrombosis, Tension pneumothorax, Tamponade, Toxins).",
              ],
              relevanceTag: "peri_arrest_als",
            });
          }
          if (matchingRefs.length === 0) {
            matchingRefs.push({
              id: "ref-kumar-clark",
              source: "Kumar & Clark's Clinical Medicine",
              type: "textbook",
              title: "Core Internal Medicine & Clinical Management",
              chapterOrSection: "Internal Medicine Canon",
              excerpt:
                "Evidence-based internal medicine integrates pathophysiology, bedside clinical signs, and societal guidelines to guide diagnostic investigation and first-line therapy.",
              clinicalPearls: [
                "Prioritize haemodynamic stability and reversible causes before definitive workup.",
              ],
              relevanceTag: "internal_medicine_canon",
            });
          }
        }
      }

      // Add matching QBank vignette only if strictly relevant to active topic
      if (isHeartFailure) {
        const hfQ = CLINICAL_QBANK_REPOSITORY.find(q => q.topic.includes("Mitral Regurgitation Post-Myocardial") || q.topic.includes("Heart Failure"));
        if (hfQ) matchingQBank.push(hfQ);
      } else if (isHeartSounds) {
        const s2Q = CLINICAL_QBANK_REPOSITORY.find(q => q.topic.includes("S2"));
        if (s2Q) matchingQBank.push(s2Q);
      }
      break;
    }

    case "cs_architecture": {
      focalTopic = "Distributed Systems, Consistency & Microservices";
      matchingRefs.push({
        id: "ref-ddia-1",
        source: "Designing Data-Intensive Applications (Martin Kleppmann)",
        edition: "1st Edition",
        type: "textbook",
        title: "Replication, Consensus & Partition Tolerance",
        chapterOrSection: "Part II: Distributed Data Storage",
        excerpt:
          "In distributed systems, networks are inherently unreliable. Algorithms like Raft and Paxos ensure state machine replication despite node crashes and split-brain scenarios. Consistency models range from eventual consistency to strict linearizability.",
        clinicalPearls: [
          "Linearizability guarantees that every read receives the most recent write or an error.",
          "Idempotency keys prevent duplicate side-effects during network retry loops.",
        ],
        relevanceTag: "distributed_consensus",
      });
      matchingRefs.push({
        id: "ref-clean-arch-1",
        source: "Clean Architecture: A Craftsman's Guide (Robert C. Martin)",
        edition: "1st Edition",
        type: "textbook",
        title: "The Dependency Inversion Principle",
        chapterOrSection: "Chapter 11: High-Level Policies vs Low-Level Details",
        excerpt:
          "High-level policy should not depend on low-level implementation details. Both should depend on abstractions. Interfaces belong to the caller, isolating business domain rules from volatile frameworks and databases.",
        clinicalPearls: [
          "Business entities must remain completely ignorant of database, UI, and external transport layers.",
        ],
        relevanceTag: "clean_architecture",
      });
      matchingQBank.push({
        id: "qbank-cs-01",
        examType: "Software Architecture",
        topic: "Distributed Transactions & Dual Writes",
        difficulty: "hard",
        vignette:
          "An enterprise e-commerce platform needs to update an order status in a relational PostgreSQL database and simultaneously publish an 'OrderCreated' event to an Apache Kafka cluster. During network partition testing, the database commit succeeds but the message broker publish fails, leaving downstream shipping microservices desynchronized.\n\nWhich architectural pattern resolves this consistency dilemma with guaranteed at-least-once delivery?",
        options: [
          "Two-Phase Commit (2PC) with distributed XA transactions across PostgreSQL and Kafka",
          "Transactional Outbox Pattern with Change Data Capture (CDC)",
          "Synchronous HTTP retry loop with exponential backoff on the message producer",
          "Eventual write reconciliation batch job executed every midnight",
        ],
        correctIndex: 1,
        distractorRationales: {
          0: "Incorrect: Most modern message brokers like Kafka do not support standard XA/2PC protocols, and 2PC creates severe latency and availability bottlenecks.",
          1: "Correct: The Transactional Outbox pattern writes both the business entity and the outgoing event into the same database atomically in a single ACID transaction. A background CDC process (e.g. Debezium) then streams the outbox table to Kafka with at-least-once guarantees.",
          2: "Incorrect: Synchronous retries can fail permanently during prolonged broker downtime, causing request timeouts or unrecoverable message drops.",
          3: "Incorrect: Nightly batch reconciliation introduces unacceptable 24-hour latency for real-time order fulfillment.",
        },
        highYieldTakeaway:
          "Never perform dual writes to two separate storage systems without an atomic outbox table or dedicated saga orchestrator.",
        sourceQBank: "Staff Systems Architecture Exam Bank",
      });
      matchingMnemonics.push({
        mnemonic: "ACID vs BASE",
        expansion: "Atomicity, Consistency, Isolation, Durability vs Basically Available, Soft state, Eventual consistency",
        rule: "Choose ACID for financial ledgers; choose BASE for globally distributed high-throughput telemetry.",
        clinicalContext: "Storage tier selection under CAP constraints.",
      });
      break;
    }

    case "ai_ml": {
      focalTopic = "Machine Learning & Deep Neural Representations";
      matchingRefs.push({
        id: "ref-dl-1",
        source: "Deep Learning (Ian Goodfellow, Yoshua Bengio, Aaron Courville)",
        edition: "MIT Press",
        type: "textbook",
        title: "Optimization & Regularization for Deep Models",
        chapterOrSection: "Chapter 8: Optimization for Training Deep Models",
        excerpt:
          "Gradient descent in non-convex loss surfaces encounters saddle points rather than local minima in high dimensions. Techniques like Adam (adaptive moment estimation), batch normalization, and residual skip connections preserve gradient flow across hundreds of layers.",
        clinicalPearls: [
          "Vanishing gradients in deep architectures are mitigated by Residual connections (ResNets) and Layer Normalization.",
        ],
        relevanceTag: "optimization_transformers",
      });
      matchingQBank.push({
        id: "qbank-ml-01",
        examType: "General Clinical",
        topic: "Attention Complexity & Long Context Windows",
        difficulty: "hard",
        vignette:
          "A research engineer is training a standard Transformer architecture on document lengths of 32,000 tokens. The model encounters catastrophic CUDA Out-Of-Memory (OOM) errors during self-attention computation.\n\nWhat is the fundamental theoretical computational and memory scaling factor of standard scaled dot-product attention with sequence length N?",
        options: ["O(N log N)", "O(N)", "O(N²)", "O(N³)"],
        correctIndex: 2,
        distractorRationales: {
          0: "Incorrect: Sparse attention or FlashAttention approximations approach O(N log N) or linear memory access, but standard full attention is not O(N log N).",
          1: "Incorrect: Recurrent networks scale linearly O(N), but standard self-attention requires pairwise token interaction.",
          2: "Correct: Standard scaled dot-product attention computes QK^T, which produces an N x N attention matrix, requiring O(N²) time and space complexity relative to context sequence length.",
          3: "Incorrect: Attention matrix computation does not require cubic complexity.",
        },
        highYieldTakeaway:
          "Full attention requires quadratic O(N²) memory. Long-context models employ FlashAttention, rotary embeddings, or linear attention to scale beyond 32k tokens.",
        sourceQBank: "Deep Learning Theoretical Qualifying Exam",
      });
      break;
    }

    default: {
      // General dynamic adaptive fallback for any other subject
      focalTopic = bookTitle || bookTopic || "Core Conceptual Framework";
      matchingRefs.push({
        id: "ref-general-1",
        source: `Authoritative Literature on ${bookTopic || bookTitle || "Subject"}`,
        type: "textbook",
        title: "Foundational Principles & Verified Invariants",
        chapterOrSection: "Core Reference Chapter",
        excerpt: `The established academic literature on ${bookTopic || bookTitle} emphasizes first-principles reasoning: decomposing composite problems into foundational axioms and isolating causal variables before predicting empirical outcomes.`,
        clinicalPearls: [
          "Trace observed surface details back to primary invariants.",
          "Validate assumptions against baseline empirical standards.",
        ],
        relevanceTag: "foundational_principles",
      });
      matchingQBank.push({
        id: "qbank-gen-01",
        examType: "General Clinical",
        topic: bookTopic || "Core Principles",
        difficulty: "medium",
        vignette: `In studying ${bookTitle || "this domain"}, a researcher observes a discrepancy between theoretical predictions and experimental results under stress conditions.\n\nWhat is the most rigorous methodological step according to first-principles inquiry?`,
        options: [
          "Discard the empirical data in favor of established historical models",
          "Identify and isolate the underlying boundary conditions that fail under extreme load",
          "Average the anomalous values with baseline steady-state measurements",
          "Introduce ad-hoc parameters without testing underlying causation",
        ],
        correctIndex: 1,
        distractorRationales: {
          0: "Incorrect: Discarding data introduces confirmation bias.",
          1: "Correct: Identifying boundary condition failures reveals where simplified theoretical assumptions break down under stress.",
          2: "Incorrect: Averaging obscures diagnostic signal.",
          3: "Incorrect: Ad-hoc parameterization hides root cause mechanisms.",
        },
        highYieldTakeaway: "Breakdowns at boundary conditions reveal core causal invariants.",
        sourceQBank: "Foundational Inquiry Exam",
      });
      break;
    }
  }

  // 2.5 PRIORITIZE BOOK-SPECIFIC DIGESTED BLUEPRINT REFERENCES
  if (bookReferences && bookReferences.length > 0 && matchingRefs.length === 0) {
    bookReferences.slice(0, 3).forEach((refName, idx) => {
      matchingRefs.push({
        id: `ref-book-bp-${idx + 1}`,
        source: refName,
        type: "textbook",
        title: refName,
        chapterOrSection: `Canonical Reference for ${bookTopic || bookTitle || "Active Study"}`,
        excerpt: `Authoritative reference for ${bookTitle || focalTopic}, grounding clinical and theoretical mechanisms in verified literature.`,
        clinicalPearls: [
          `Cross-referenced with ${refName} for ${bookTitle || focalTopic}.`,
        ],
        relevanceTag: domain,
      });
    });
  }

  // 3. QUERY MONGO DATABASE FOR CUSTOM CACHED KNOWLEDGE NODES (Fast-path if static corpus already matched)
  if (matchingRefs.length < 2) {
    const cacheKey = `${domain}:${focalTopic.split(" ")[0]}`.toLowerCase();
    const cachedDbNodes = knowledgeNodeCache.get(cacheKey);

    if (cachedDbNodes) {
      for (const node of cachedDbNodes) {
        if (node.type === "textbook" || node.type === "guideline") {
          matchingRefs.push({
            id: String(node._id),
            source: node.source,
            type: node.type,
            title: node.title,
            chapterOrSection: node.topic,
            excerpt: node.content,
            clinicalPearls: node.clinicalPearls || [],
            relevanceTag: node.topic,
          });
        }
      }
    } else {
      try {
        await connectToDatabase();
        const dbNodesPromise = KnowledgeNode.find({
          $or: [
            { domain: { $regex: domain, $options: "i" } },
            { topic: { $regex: focalTopic.split(" ")[0], $options: "i" } },
          ],
        })
          .limit(3)
          .lean();

        // 1.5s timeout guard so DB stalls never slow down the AI assistant
        const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 1500));
        const dbNodes = await Promise.race([dbNodesPromise, timeoutPromise]);

        if (dbNodes && dbNodes.length > 0) {
          knowledgeNodeCache.set(cacheKey, dbNodes);
          for (const node of dbNodes) {
            if (node.type === "textbook" || node.type === "guideline") {
              matchingRefs.push({
                id: String(node._id),
                source: node.source,
                type: node.type,
                title: node.title,
                chapterOrSection: node.topic,
                excerpt: node.content,
                clinicalPearls: node.clinicalPearls || [],
                relevanceTag: node.topic,
              });
            }
          }
        }
      } catch (err) {
        console.warn("MongoDB KnowledgeNode lookup skipped:", err);
      }
    }
  }

  // 4. FORMAT GROUNDING SNIPPET FOR LLM PROMPT
  const refSnippets = matchingRefs
    .slice(0, 3)
    .map(
      (r) =>
        `[AUTHORITATIVE REFERENCE: ${r.source}${r.chapterOrSection ? `, ${r.chapterOrSection}` : ""}]\nTitle: ${r.title}\nKey Excerpt: ${r.excerpt}\nKey Pearls:\n${r.clinicalPearls.map((p) => ` • ${p}`).join("\n")}`
    )
    .join("\n\n");

  const qbankSnippets = matchingQBank
    .slice(0, 2)
    .map(
      (q) =>
        `[QBANK VIGNETTE (${q.sourceQBank}) - ${q.examType} - Difficulty: ${q.difficulty.toUpperCase()}]\nVignette: ${q.vignette}\nKey Pearl: ${q.highYieldTakeaway}`
    )
    .join("\n\n");

  const mnemonicsSnippet = matchingMnemonics
    .map((m) => `[MNEMONIC]: ${m.mnemonic} (${m.expansion})\nRule: ${m.rule}`)
    .join("\n\n");

  const groundingSnippet =
    matchingRefs.length > 0 || matchingQBank.length > 0 || matchingMnemonics.length > 0
      ? `=== CANONICAL REFERENCE ENRICHMENT (${domain.toUpperCase()}) ===\n(Use these gold-standard references strictly to enrich and explain concepts found in the user's primary study source, maintaining absolute fidelity to the source)\n${refSnippets}${
          qbankSnippets ? `\n\n=== RELEVANT QBANK VIGNETTES ===\n${qbankSnippets}` : ""
        }${mnemonicsSnippet ? `\n\n=== HIGH-YIELD MNEMONICS ===\n${mnemonicsSnippet}` : ""}`
      : "";

  return {
    focalTopic,
    authoritativeReferences: matchingRefs,
    qbankVignettes: matchingQBank,
    mnemonics: matchingMnemonics,
    groundingSnippet,
  };
}
