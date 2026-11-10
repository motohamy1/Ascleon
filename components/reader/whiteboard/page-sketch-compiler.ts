import { WhiteboardDeck, WhiteboardScene, MedicalPrimitiveType } from "@/types/whiteboard";

export interface CompileSketchOptions {
  bookTitle?: string;
  pageNumber?: number;
  pageText: string;
  selectedText?: string;
  customFocus?: string;
  language?: "en" | "ar" | "mixed";
}

interface ClinicalDomainMatch {
  domain: string;
  primaryPrimitive: MedicalPrimitiveType;
  secondaryPrimitive: MedicalPrimitiveType;
  tertiaryPrimitive: MedicalPrimitiveType;
  defaultOrgan: string;
}

/**
 * Intelligent domain heuristic detector for textbooks & clinical papers
 */
function detectClinicalDomain(text: string): ClinicalDomainMatch {
  const lower = text.toLowerCase();

  // 1. Neuro / Stroke / Cerebrovascular
  if (/stroke|brain|cerebr|infarct|ischemi|mca|tia|hemipleg|aphasia|droop|mening|seiz/i.test(lower)) {
    return {
      domain: "Neurology & Cerebrovascular",
      primaryPrimitive: "vessel_occlusion",
      secondaryPrimitive: "brain_territories",
      tertiaryPrimitive: "patient_droop",
      defaultOrgan: "Brain & Cerebral Vasculature",
    };
  }

  // 2. Cardiac / Coronary / Hemodynamic
  if (/heart|cardiac|coronary|myocard|infarction|ecg|stemi|angina|troponin|arrhythm|valve/i.test(lower)) {
    return {
      domain: "Cardiovascular & Hemodynamics",
      primaryPrimitive: "heart_coronary",
      secondaryPrimitive: "vessel_occlusion",
      tertiaryPrimitive: "ecg_waveform",
      defaultOrgan: "Heart & Myocardium",
    };
  }

  // 3. Respiratory / Pulmonary
  if (/lung|pulmonary|alveol|copd|asthma|bronch|hypoxia|pneumon|diffusion|pao2/i.test(lower)) {
    return {
      domain: "Pulmonology & Gas Exchange",
      primaryPrimitive: "lungs_alveoli",
      secondaryPrimitive: "vessel_occlusion",
      tertiaryPrimitive: "warning_stamp",
      defaultOrgan: "Lungs & Alveoli",
    };
  }

  // 4. Renal / Electrolyte / Nephron
  if (/kidney|renal|nephron|glomerul|gfr|creatinine|dialysis|electrolyte|na\+|k\+|aldosterone/i.test(lower)) {
    return {
      domain: "Nephrology & Renal Physiology",
      primaryPrimitive: "kidney_nephron",
      secondaryPrimitive: "cell_receptor",
      tertiaryPrimitive: "warning_stamp",
      defaultOrgan: "Kidney & Nephron",
    };
  }

  // 5. Molecular / Pharmacology / Receptor
  if (/receptor|agonist|antagonist|enzyme|inhibitor|pathway|kinase|cpm|cascade|drug|rx/i.test(lower)) {
    return {
      domain: "Cellular Pharmacology & Receptors",
      primaryPrimitive: "cell_receptor",
      secondaryPrimitive: "syringe_tpa",
      tertiaryPrimitive: "warning_stamp",
      defaultOrgan: "Cellular Membrane & Receptors",
    };
  }

  // Default General Medical
  return {
    domain: "Clinical Pathophysiology",
    primaryPrimitive: "brain_territories",
    secondaryPrimitive: "vessel_occlusion",
    tertiaryPrimitive: "patient_droop",
    defaultOrgan: "Target Organ & Vascular Bed",
  };
}

/**
 * Instant Client-and-Server Page-to-Sketch Storyboard Compiler
 * Synthesizes a grounded, multi-scene VideoScribe whiteboard deck in < 50ms
 */
export function compilePageToWhiteboardDeck(options: CompileSketchOptions): WhiteboardDeck {
  const {
    bookTitle = "Medical Study Material",
    pageNumber = 1,
    pageText = "",
    selectedText = "",
    customFocus = "",
    language = "en",
  } = options;

  const isAr = language === "ar";
  const isMixed = language === "mixed";
  const targetText = (selectedText || pageText || "").trim();

  // Extract meaningful sentences
  const rawSentences = targetText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const domain = detectClinicalDomain(targetText + " " + (customFocus || ""));

  const topicTitle =
    customFocus ||
    (selectedText ? selectedText.slice(0, 50) + "..." : rawSentences[0] ? rawSentences[0].slice(0, 55) : `${domain.domain} (Page ${pageNumber})`);

  // Extract mechanisms & core principles from sentences
  const sTrigger = rawSentences[0] || "Primary pathophysiological trigger disrupting baseline homeostasis.";
  const sMediator = rawSentences[1] || "Downstream cellular and vascular cascades leading to progressive tissue ischemia.";
  const sClinical = rawSentences[2] || "Clinical manifestations, physical signs, and hallmark diagnostic parameters.";
  const sProtocol = rawSentences[3] || "Immediate first-line therapeutic protocol and critical time-sensitive management.";

  // Scene 1: Anatomical Insult & Etiology
  const scene1: WhiteboardScene = {
    id: `scene-p${pageNumber}-1`,
    sceneNumber: 1,
    title: isAr
      ? `الموقع التشريحي والمحفز الأولي: ${domain.domain}`
      : `Anatomical Insult & Etiology: ${domain.domain}`,
    durationSecondsEstimate: 22,
    spokenScriptHint: isAr
      ? `أهلاً بك يا دكتور، انتبه هنا على البورد. النقطة الأولى هي المحفز الأولي: ${sTrigger.slice(0, 120)}. لاحظ كيفية تشكل الإجهاد في النسيج المستهدف.`
      : `Welcome Doctor. Look at the board: the initial pathophysiological trigger is "${sTrigger.slice(0, 120)}". Watch the vessel and tissue changes sketch out in real time.`,
    illustration: {
      title: isAr ? "المحفز الأولي والوعاء المصاب" : "Primary Trigger & Vascular Insult",
      totalSteps: 3,
      illustrationStyle: "videoscribe",
      nodes: [
        {
          id: "node-1",
          x: 25,
          y: 45,
          label: isAr ? "المحفز الأولي / Trigger" : "Primary Insult / Trigger",
          subtext: sTrigger.slice(0, 85),
          type: "trigger",
          sketchType: domain.primaryPrimitive,
          revealedInStep: 0,
          colorVariant: "red",
        },
        {
          id: "node-2",
          x: 55,
          y: 45,
          label: isAr ? "التغير الوعائي والخثري" : "Vascular Obstruction / Insult",
          subtext: sMediator.slice(0, 85),
          type: "mediator",
          sketchType: "vessel_occlusion",
          revealedInStep: 1,
          colorVariant: "red",
        },
        {
          id: "node-3",
          x: 82,
          y: 45,
          label: isAr ? "العضو المستهدف المصاب" : domain.defaultOrgan,
          subtext: "Loss of tissue perfusion & energy failure",
          type: "outcome",
          sketchType: domain.secondaryPrimitive,
          revealedInStep: 2,
          colorVariant: "blue",
        },
      ],
      edges: [
        {
          id: "edge-1-2",
          from: "node-1",
          to: "node-2",
          label: isAr ? "تفعيل سريع" : "Precipitates",
          style: "arrow",
          revealedInStep: 1,
        },
        {
          id: "edge-2-3",
          from: "node-2",
          to: "node-3",
          label: isAr ? "نقص التروية" : "Ischemia",
          style: "arrow",
          revealedInStep: 2,
        },
      ],
      chalkNotes: [
        isAr
          ? `قاعدة سريرية: ${sTrigger.slice(0, 95)}`
          : `Core Invariant: ${sTrigger.slice(0, 110)}`,
      ],
    },
    widget: {
      type: "clinical_algorithm",
      clinicalAlgorithm: {
        title: isAr ? "مسار التقييم الأولي" : "Immediate Triage Algorithm",
        chiefComplaintOrScenario: topicTitle,
        firstStepId: "step-1",
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            stageName: isAr ? "التقييم الفوري" : "Initial Assessment",
            actionText: isAr
              ? "فحص العلامات الحيوية وسكر الدم وتحديد وقت ظهور الأعراض بدقة"
              : "Check airway, vitals, blood glucose, and confirm exact Last Known Normal (LKN) time.",
            branches: [
              {
                choiceLabel: isAr ? "أعراض حادة ونقص تروية" : "Acute Onset (< 4.5h)",
                nextStepId: "step-urgent",
                isUrgent: true,
              },
              {
                choiceLabel: isAr ? "استقرار نسبي" : "Subacute / Stable",
                nextStepId: "step-workup",
              },
            ],
          },
          {
            id: "step-urgent",
            stepNumber: 2,
            stageName: isAr ? "مسار التدخل العاجل" : "Code Emergency Protocol",
            actionText: isAr
              ? "طلب تصوير طبقي محوري فوري واستدعاء فريق التدخل الوعائي"
              : "STAT Non-contrast Head CT and activate acute reperfusion team.",
            evidenceLevel: "Class I",
          },
          {
            id: "step-workup",
            stepNumber: 2,
            stageName: isAr ? "فحوصات موسعة" : "Secondary Diagnostic Workup",
            actionText: "Continuous telemetry monitoring, vascular imaging, and risk stratification.",
          },
        ],
      },
    },
  };

  // Scene 2: Pathophysiological Cascade & Cellular Mechanism
  const scene2: WhiteboardScene = {
    id: `scene-p${pageNumber}-2`,
    sceneNumber: 2,
    title: isAr
      ? "مسار التدهور الفسيولوجي واختلال التوازن"
      : "Pathophysiological Cascade & Mechanism",
    durationSecondsEstimate: 25,
    spokenScriptHint: isAr
      ? `مع استمرار نقص التروية، يبدأ شلال موت الخلايا واختلال المستقبلات: ${sMediator.slice(0, 120)}.`
      : `As tissue perfusion drops, downstream molecular cascades accelerate: "${sMediator.slice(0, 120)}". Notice how cellular pumps fail.`,
    illustration: {
      title: isAr ? "شلال الضرر الخلوي" : "Cellular Cascade & Penumbra",
      totalSteps: 3,
      illustrationStyle: "videoscribe",
      nodes: [
        {
          id: "node-penumbra",
          x: 25,
          y: 45,
          label: isAr ? "منطقة التروية المهددة (Penumbra)" : "Ischemic Penumbra",
          subtext: "Salvageable tissue at risk",
          type: "mediator",
          sketchType: "brain_territories",
          revealedInStep: 0,
          colorVariant: "amber",
        },
        {
          id: "node-cellular",
          x: 55,
          y: 45,
          label: isAr ? "فشل مضخات الغشاء وتدفق الكالسيوم" : "Excitotoxicity & Membrane Failure",
          subtext: "ATP depletion → Ca²⁺ influx → cytotoxic edema",
          type: "trap",
          sketchType: "cell_receptor",
          revealedInStep: 1,
          colorVariant: "red",
        },
        {
          id: "node-irreversible",
          x: 82,
          y: 45,
          label: isAr ? "الاحتشاء الدائم والتنخر" : "Irreversible Infarct Core",
          subtext: "Apoptosis and permanent cell death",
          type: "outcome",
          sketchType: "vessel_rupture",
          revealedInStep: 2,
          colorVariant: "dark",
        },
      ],
      edges: [
        {
          id: "edge-pen-cell",
          from: "node-penumbra",
          to: "node-cellular",
          label: "Energy Depletion",
          style: "arrow",
          revealedInStep: 1,
        },
        {
          id: "edge-cell-irrev",
          from: "node-cellular",
          to: "node-irreversible",
          label: "Without Reperfusion",
          style: "inhibition",
          revealedInStep: 2,
        },
      ],
      chalkNotes: [
        isAr
          ? "القاعدة الذهبية: الوقت هو الدماغ / Time is Brain"
          : "Golden Rule: Early reperfusion rescues the ischemic penumbra before irreversible infarction.",
      ],
    },
    widget: {
      type: "physiology_simulator",
      physiologySimulator: {
        title: isAr ? "محاكي الضغط والتروية الدموية" : "Hemodynamic & Perfusion Simulator",
        organSystem: domain.domain,
        clinicalTakeaway: sMediator.slice(0, 100),
        parameters: [
          {
            id: "map",
            name: "MAP (Mean Arterial Pressure)",
            unit: "mmHg",
            baseValue: 85,
            currentValue: 85,
            min: 50,
            max: 140,
            normalRange: [70, 105],
          },
          {
            id: "perfusion",
            name: "Organ Perfusion Pressure",
            unit: "% baseline",
            baseValue: 40,
            currentValue: 40,
            min: 10,
            max: 100,
            normalRange: [80, 100],
          },
        ],
        interventions: [
          {
            id: "rx-thrombolysis",
            label: isAr ? "تفعيل مذيب الخثرة (tPA)" : "Administer IV tPA (Thrombolysis)",
            active: false,
            effectDescription: "Reopens occluded vessel and restores tissue perfusion.",
            parameterImpacts: { perfusion: 45, map: -5 },
          },
          {
            id: "rx-bp-permissive",
            label: isAr ? "الحفاظ على الضغط الترويحي" : "Permissive Hypertension Protocol",
            active: false,
            effectDescription: "Maintains collateral flow to the ischemic penumbra.",
            parameterImpacts: { perfusion: 15, map: 10 },
          },
        ],
      },
    },
  };

  // Scene 3: Clinical Presentation, Signs & Diagnostics
  const scene3: WhiteboardScene = {
    id: `scene-p${pageNumber}-3`,
    sceneNumber: 3,
    title: isAr
      ? "المظاهر السريرية والتشخيص التفريقي"
      : "Clinical Manifestations & Diagnostics",
    durationSecondsEstimate: 25,
    spokenScriptHint: isAr
      ? `لاحظ يا دكتور المريض هنا على اليمين: ${sClinical.slice(0, 120)}. الفحص السريري يحدد فوراً مكان الآفة.`
      : `Observe the clinical signs on the right: "${sClinical.slice(0, 120)}". The physical exam immediately localizes the vascular territory.`,
    illustration: {
      title: isAr ? "العلامات السريرية الموجهة" : "Clinical Signs & Hallmarks",
      totalSteps: 3,
      illustrationStyle: "videoscribe",
      nodes: [
        {
          id: "node-patient",
          x: 25,
          y: 45,
          label: isAr ? "العلامات العصبية (FAST)" : "Cardinal Manifestations",
          subtext: sClinical.slice(0, 85),
          type: "trigger",
          sketchType: domain.tertiaryPrimitive,
          revealedInStep: 0,
          colorVariant: "red",
        },
        {
          id: "node-diagnostic",
          x: 55,
          y: 45,
          label: isAr ? "التصوير الشعاعي الحاسم" : "Definitive Diagnostic Imaging",
          subtext: "CT / MRI / Biomarkers to rule out mimic",
          type: "mediator",
          sketchType: "ecg_waveform",
          revealedInStep: 1,
          colorVariant: "blue",
        },
        {
          id: "node-pearl",
          x: 82,
          y: 45,
          label: isAr ? "نافذة العلاج العاجلة" : "Time-Critical Pearl",
          subtext: "First-line intervention within therapeutic window",
          type: "outcome",
          sketchType: "warning_stamp",
          revealedInStep: 2,
          colorVariant: "amber",
        },
      ],
      edges: [
        {
          id: "edge-pt-dx",
          from: "node-patient",
          to: "node-diagnostic",
          label: "Immediate Scan",
          style: "arrow",
          revealedInStep: 1,
        },
        {
          id: "edge-dx-pearl",
          from: "node-diagnostic",
          to: "node-pearl",
          label: "Action Threshold",
          style: "arrow",
          revealedInStep: 2,
        },
      ],
      chalkNotes: [
        isAr
          ? `تلميح للاختبار: ${sProtocol.slice(0, 95)}`
          : `Exam Pearl: ${sProtocol.slice(0, 110)}`,
      ],
    },
    widget: {
      type: "differential_matrix",
      differentialMatrix: {
        title: isAr ? "مصفوفة التشخيص المقارن" : "Differential Diagnosis Matrix",
        clinicalPresentation: sClinical.slice(0, 120),
        keyDifferentiators: [
          "Onset Timing (Sudden vs. Gradual)",
          "Focal Neurological Deficit vs. Diffuse Signs",
          "Imaging Findings on Non-contrast Head CT",
        ],
        conditions: [
          {
            id: "cond-1",
            conditionName: isAr ? "احتشاء إقفاري حاد (Ischemic Infarction)" : "Acute Ischemic Event",
            probability: "High",
            hallmarkFeatures: [
              "Sudden focal weakness / facial droop",
              "Normal early CT with early loss of insular ribbon",
              "Vessel occlusion on CTA",
            ],
            pathognomonicSign: "Hyperdense MCA sign or focal deficit conforming to arterial territory",
            treatmentClue: "IV Alteplase / Tenecteplase if < 4.5h + Endovascular Thrombectomy if LVO",
          },
          {
            id: "cond-2",
            conditionName: isAr ? "نزف دماغي حاد (Hemorrhage)" : "Acute Hemorrhagic Event",
            probability: "Moderate",
            hallmarkFeatures: [
              "Severe headache, vomiting, sudden hypertension",
              "Immediate hyperdensity (bright white) on CT",
              "Rapid decrease in consciousness",
            ],
            pathognomonicSign: "Hyperdense parenchymal blood collection with mass effect",
            redFlags: ["Anticoagulation use", "Systolic BP > 200 mmHg"],
            treatmentClue: "Absolute contraindication to thrombolysis; emergency BP lowering and reversal",
          },
        ],
      },
    },
  };

  return {
    id: `deck-p${pageNumber}-${Date.now()}`,
    bookTitle,
    pageNumber,
    topicTitle,
    language: isAr ? "ar" : isMixed ? "mixed" : "en",
    scenes: [scene1, scene2, scene3],
    createdAt: new Date().toISOString(),
  };
}
