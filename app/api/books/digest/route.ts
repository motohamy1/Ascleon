import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

interface DigestBlueprint {
  domain: string;
  subspecialty: string;
  topic: string;
  authoritativeReferences: string[];
  summary: string;
  initialQBank: Array<{
    vignette: string;
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
    keyConcept: string;
  }>;
  initialMnemonics: Array<{
    title: string;
    mnemonic: string;
    expansion: string;
    notes: string;
  }>;
  chapterMap: Array<{
    title: string;
    description: string;
  }>;
}

function generateFallbackBlueprint(title: string, preview: string): DigestBlueprint {
  const lower = `${title} ${preview}`.toLowerCase();

  if (lower.includes("surg") || lower.includes("swelling") || lower.includes("hernia") || lower.includes("ulcer") || lower.includes("appendic") || lower.includes("thyroid")) {
    return {
      domain: "Clinical Surgery",
      subspecialty: "Surgical History Taking, Bedside Examination & Operative Principles",
      topic: "Surgery",
      authoritativeReferences: [
        "Bailey & Love's Short Practice of Surgery (28th Ed)",
        "Browse's Introduction to the Symptoms & Signs of Surgical Disease (6th Ed)",
        "Sabiston Textbook of Surgery: The Biological Basis of Modern Surgical Practice (21st Ed)",
        "Schwartz's Principles of Surgery (11th Ed)"
      ],
      summary: `Comprehensive surgical study material covering systematic clinical history taking (O.C.D.), physical examination of swellings and ulcers, neurovascular pressure effects (V.A.N.), and operative principles.`,
      initialQBank: [
        {
          vignette: "A 52-year-old patient presents with a painless, progressively enlarging mass in the supraclavicular fossa noticed accidentally 3 months ago. Over the past 2 weeks, the patient developed unilateral upper limb swelling with prominent superficial veins and tingling along the medial border of the forearm.",
          question: "In systematic surgical history taking, what do these secondary limb symptoms represent?",
          options: [
            "Local pressure effects on adjacent Vein and Nerve structures (V.A.N. triad)",
            "Systemic paraneoplastic endocrine syndrome",
            "Primary intrinsic venous thrombosis unrelated to the mass",
            "Acute inflammatory cellulitis of the extremity"
          ],
          correctAnswerIndex: 0,
          explanation: "Progressive masses compress neighboring neurovascular bundles (V.A.N.): venous obstruction increases hydrostatic pressure causing edema and varicosities, while nerve compression produces paresthesia or paresis.",
          keyConcept: "Surgical Swelling V.A.N. Pressure Symptoms"
        }
      ],
      initialMnemonics: [
        {
          title: "Swelling History & Pressure Effects",
          mnemonic: "O.C.D. + V.A.N.",
          expansion: "Onset, Course, Duration + Vein, Artery, Nerve",
          notes: "Framework for analyzing any surgical swelling chronologically and screening for local neurovascular compression."
        }
      ],
      chapterMap: [
        { title: "Surgical History & Swelling Sheet", description: "Chronological analysis (O.C.D.) and neurovascular pressure symptoms (V.A.N.)" },
        { title: "Physical Examination & Differential", description: "Inspection, palpation, lymph node drainage, and operative indications" }
      ]
    };
  }
  
  if (lower.includes("cardio") || lower.includes("heart") || lower.includes("murmur") || lower.includes("ecg") || lower.includes("valve")) {
    return {
      domain: "Cardiovascular Medicine",
      subspecialty: "Clinical Cardiology & Valvular Pathophysiology",
      topic: "Cardiology",
      authoritativeReferences: [
        "Braunwald's Heart Disease: A Textbook of Cardiovascular Medicine (12th Ed)",
        "2024 AHA/ACC Guideline for the Management of Patients with Valvular Heart Disease",
        "Hurst's The Heart (14th Ed)",
        "ESC Guidelines on Cardio-Oncology and Heart Failure"
      ],
      summary: `Comprehensive study material covering cardiovascular mechanics, diagnostic auscultation, hemodynamics, and evidence-based clinical protocols. Grounded in authoritative cardiology references.`,
      initialQBank: [
        {
          vignette: "A 68-year-old patient presents with progressive exertional dyspnea and lightheadedness. Physical examination reveals a harsh, crescendo-decrescendo systolic ejection murmur at the right upper sternal border that radiates to the carotids, with delayed and diminished carotid pulses (pulsus parvus et tardus).",
          question: "Which hemodynamic parameter is most pathognomonic for severe aortic stenosis in this clinical scenario?",
          options: [
            "Aortic valve area ≤ 1.0 cm² with mean gradient ≥ 40 mmHg",
            "Left ventricular ejection fraction > 65% with wide pulse pressure",
            "Prominent early diastolic decrescendo murmur at Erb's point",
            "Holosystolic murmur at the apex radiating to the axilla"
          ],
          correctAnswerIndex: 0,
          explanation: "Severe aortic stenosis is classically defined by an aortic valve area ≤ 1.0 cm² (or indexed area ≤ 0.6 cm²/m²), peak aortic jet velocity ≥ 4.0 m/s, or mean transvalvular gradient ≥ 40 mmHg, per AHA/ACC guidelines.",
          keyConcept: "Severe Aortic Stenosis Diagnostic Criteria"
        }
      ],
      initialMnemonics: [
        {
          title: "SAD Triad of Aortic Stenosis",
          mnemonic: "S - A - D",
          expansion: "Syncope, Angina, Dyspnea",
          notes: "Classic presentation of severe symptomatic aortic stenosis indicating urgent surgical or transcatheter intervention."
        }
      ],
      chapterMap: [
        { title: "Hemodynamic Foundations", description: "Pressure-volume loops and cardiac cycle auscultation" },
        { title: "Valvular Pathology", description: "Stenosis, regurgitation, and repair criteria" }
      ]
    };
  }

  if (lower.includes("neuro") || lower.includes("brain") || lower.includes("cortex") || lower.includes("stroke") || lower.includes("synapse")) {
    return {
      domain: "Neurology & Neuroscience",
      subspecialty: "Clinical Neurology & Neuroanatomy",
      topic: "Neurology",
      authoritativeReferences: [
        "Adams and Victor's Principles of Neurology (12th Ed)",
        "Kandel's Principles of Neural Science (6th Ed)",
        "Bradley and Daroff's Neurology in Clinical Practice (8th Ed)",
        "AAN Guidelines for Acute Ischemic Stroke Management"
      ],
      summary: `Foundational neurological study resource exploring central and peripheral neuroanatomy, localization, synaptic transmission, and clinical management.`,
      initialQBank: [
        {
          vignette: "A 55-year-old presents with acute onset right hemiparesis, right facial droop involving the lower face, and expressive non-fluent aphasia. Comprehension remains intact.",
          question: "Which vascular territory is most likely occluded?",
          options: [
            "Left Middle Cerebral Artery (Superior Division)",
            "Left Middle Cerebral Artery (Inferior Division)",
            "Left Posterior Cerebral Artery",
            "Right Anterior Cerebral Artery"
          ],
          correctAnswerIndex: 0,
          explanation: "Occlusion of the superior division of the left MCA causes Broca's (expressive) aphasia and contralateral face and arm weakness, sparing Wernicke's receptive language area.",
          keyConcept: "MCA Superior Division Stroke Localization"
        }
      ],
      initialMnemonics: [
        {
          title: "FAST Stroke Assessment",
          mnemonic: "F - A - S - T",
          expansion: "Face drooping, Arm weakness, Speech difficulty, Time to call emergency",
          notes: "Rapid triage tool for hyperacute ischemic stroke identification."
        }
      ],
      chapterMap: [
        { title: "Neurovascular Anatomy", description: "Cerebral arterial supply and stroke syndromes" },
        { title: "Diagnostic Localization", description: "Cranial nerves and corticospinal tract mapping" }
      ]
    };
  }

  if (lower.includes("code") || lower.includes("algorithm") || lower.includes("software") || lower.includes("python") || lower.includes("javascript") || lower.includes("system")) {
    return {
      domain: "Computer Science & Software Engineering",
      subspecialty: "System Architecture & Algorithms",
      topic: "Software Engineering",
      authoritativeReferences: [
        "Introduction to Algorithms (CLRS, 4th Ed)",
        "Designing Data-Intensive Applications (Kleppmann)",
        "Clean Architecture: A Craftsman's Guide to Software Structure (Martin)",
        "Computer Systems: A Programmer's Perspective (Bryant & O'Hallaron)"
      ],
      summary: `Engineering guide covering algorithm design, computational complexity, distributed systems architecture, and production engineering practices.`,
      initialQBank: [
        {
          vignette: "An engineering team is designing a distributed ledger service that requires high write throughput and must tolerate network partitions while maintaining eventual consistency across geodistributed replicas.",
          question: "According to the CAP theorem and PACELC framework, which trade-off must the architecture embrace?",
          options: [
            "AP / PA/EL: Prioritize Availability over strict Consistency during partitions, and Latency over Consistency in normal operations",
            "CP / PC/EC: Guarantee strict Consistency at the expense of Availability during partitions",
            "CA / None: Provide both Consistency and Availability without partition tolerance",
            "ACID / 2PC: Enforce two-phase commit across all geodistributed nodes on every write"
          ],
          correctAnswerIndex: 0,
          explanation: "Under the CAP theorem, when a partition (P) occurs, a distributed system must choose between Availability (A) and Consistency (C). High-throughput eventual consistency architectures choose AP.",
          keyConcept: "Distributed Consensus and CAP/PACELC Trade-offs"
        }
      ],
      initialMnemonics: [
        {
          title: "SOLID Object-Oriented Principles",
          mnemonic: "S - O - L - I - D",
          expansion: "Single responsibility, Open-closed, Liskov substitution, Interface segregation, Dependency inversion",
          notes: "Guiding principles for maintainable, decoupled object-oriented architecture."
        }
      ],
      chapterMap: [
        { title: "Foundations & Asymptotics", description: "Time and space complexity invariants" },
        { title: "Scalable Architecture", description: "Partitioning, replication, and distributed consensus" }
      ]
    };
  }

  // General Academic / Scientific fallback
  return {
    domain: "Academic Science & Professional Studies",
    subspecialty: "Core Concepts & Practical Application",
    topic: "General Science",
    authoritativeReferences: [
      `Standard Reference Corpus for ${title}`,
      "Peer-Reviewed Academic Review Literature",
      "Authoritative Society Guidelines & Textbooks"
    ],
    summary: `Structured study material for "${title}". Analyzed to enable deep active recall, interactive visualization, and Socratic dialogue.`,
    initialQBank: [
      {
        vignette: `A student is reviewing key foundational principles from "${title}" to prepare for comprehensive examination.`,
        question: "What is the primary conceptual pillar introduced in the opening sections?",
        options: [
          "Establishment of core definitions and foundational invariant principles",
          "Secondary experimental variations without theoretical basis",
          "Historical biographical background only",
          "Peripheral case study observations"
        ],
        correctAnswerIndex: 0,
        explanation: "Authoritative academic sources begin by laying down formal invariant definitions and core mechanisms before branching into complex applications.",
        keyConcept: "Foundational First-Principles Grounding"
      }
    ],
    initialMnemonics: [
      {
        title: "Active Learning Framework",
        mnemonic: "P - R - E - P",
        expansion: "Preview, Recall, Explain, Practice",
        notes: "Evidence-based framework for high retention study sessions."
      }
    ],
    chapterMap: [
      { title: "Foundations", description: "Introductory core concepts and framework" },
      { title: "Advanced Synthesis", description: "Application, problem solving, and practice" }
    ]
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, author, totalPages, textPreview } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const blueprint = generateFallbackBlueprint(title, textPreview || "");
      return NextResponse.json({ success: true, blueprint, source: "fallback-no-key" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are Ascleon's Deep Source Ingestion AI. Your job is to ingest, digest, and understand this newly uploaded study source to configure the user's interactive Study Space.
Book Title: "${title}"
Author: "${author || "Unknown"}"
Total Pages: ${totalPages || "Unknown"}

First few pages text preview:
"""
${(textPreview || "").slice(0, 3500)}
"""

Task:
Analyze the document and generate a JSON study blueprint with:
1. "domain": The exact high-level academic/clinical field (e.g. "Cardiology", "Neurology", "Organic Chemistry", "Computer Science", "Contract Law").
2. "subspecialty": The specific subfield (e.g. "Valvular Heart Disease & Auscultation", "Distributed Systems").
3. "topic": A concise 1-2 word topic tag.
4. "authoritativeReferences": An array of 3-4 REAL world-class gold-standard textbooks, canonical reference treatises, or published societal guidelines in this exact field that an expert mentor would consult.
5. "summary": A 2-3 sentence executive summary of the document's scope and study value.
6. "initialQBank": An array of 2-3 high-yield multiple-choice questions grounded in the previewed material. Each with "vignette", "question", "options" (4 items), "correctAnswerIndex" (0-3), "explanation" (detailed rationale citing mechanisms), and "keyConcept".
7. "initialMnemonics": An array of 1-2 high-yield memory anchors/mnemonics ("title", "mnemonic", "expansion", "notes").
8. "chapterMap": An array of key sections or chapters ("title", "description").

Return ONLY a valid JSON object matching this structure.`;

      const generatePromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Digest generation timed out after 15s")), 15000)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      const responseText = response.text?.trim() || "";
      if (responseText) {
        const parsed = JSON.parse(responseText);
        return NextResponse.json({
          success: true,
          blueprint: parsed,
          source: "gemini-3.8-flash",
        });
      }
    } catch (aiErr) {
      console.warn("AI digestion error, falling back to heuristic blueprint:", aiErr);
    }

    const fallbackBlueprint = generateFallbackBlueprint(title, textPreview || "");
    return NextResponse.json({
      success: true,
      blueprint: fallbackBlueprint,
      source: "fallback-heuristic",
    });
  } catch (error) {
    console.error("Digest API fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal digestion error" },
      { status: 500 }
    );
  }
}
