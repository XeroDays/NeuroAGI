function GenerateQuestionnaireLLMQuery ({ issue, gender, age } = {}) {
  const safeIssue = String(issue || "").trim() || "an unspecified health issue";
  const safeGender = String(gender || "male").toLowerCase();
  const safeAge = String(age || "30");

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `You are generating the INITIAL structured medical intake questionnaire for a patient.

The patient is:
- Age: ${safeAge} Years Old
- Gender: ${safeGender}
- Presenting issue: "${safeIssue}"

Current date and time:
${dateTimeStr}

Your responsibility is to generate medically relevant intake questions that help collect the MOST clinically useful information for understanding the patient's condition before deeper analysis occurs.

Clinical intake objectives:
- Gather information that improves:
  - symptom understanding,
  - severity assessment,
  - risk stratification,
  - triage accuracy,
  - and diagnostic direction.
- Adapt dynamically to the reported issue.
- Focus on high-yield clinical questioning.
- Avoid generic filler questions.
- Avoid repetitive or semantically overlapping questions.
- Prefer questions that materially improve clinical understanding.

Clinical reasoning guidance:
- Silently determine:
  - likely symptom categories,
  - possible body systems involved,
  - common causes,
  - dangerous causes that should not be missed,
  - and the most important missing information.
- Prioritize questions that clarify:
  - onset,
  - duration,
  - progression,
  - severity,
  - frequency,
  - triggers,
  - relieving factors,
  - associated symptoms,
  - functional impact,
  - prior episodes,
  - medications,
  - supplements,
  - relevant medical history,
  - exposure risks,
  - and family history when clinically relevant.
- If the issue may indicate an urgent condition, prioritize questions about:
  - chest pain,
  - breathing difficulty,
  - neurological symptoms,
  - bleeding,
  - loss of consciousness,
  - suicidality,
  - severe infection symptoms,
  - pregnancy-related emergencies,
  - or rapidly worsening symptoms.

Question count rules:
- Return between 8 and 20 questions.
- Prefer quality over quantity.
- Do NOT ask excessive low-value questions.
- Do NOT ask multiple questions that gather essentially the same information.
- Prioritize adaptive relevance over completeness.

Question authoring requirements:
- Ask concise, professional, patient-friendly questions.
- Use second-person language.
- Avoid unnecessary medical jargon.
- No double-barreled questions.
- Each question should gather ONE clear piece of information.

Question types:
Use the MOST appropriate type:
- \`single_select\`
- \`multi_select\`
- \`slider\`
- \`range\`
- \`text\`

Question type guidance:
- Use \`single_select\` for:
  - yes/no,
  - severity categories,
  - frequency categories,
  - or mutually exclusive answers.
- Use \`multi_select\` when multiple symptoms, triggers, exposures, or conditions may apply.
- Use \`slider\` for:
  - pain,
  - severity,
  - stress,
  - mood,
  - sleep quality,
  - or other graded experiences.
- Use \`text\` only when structured answers are not practical.

Units and measurement rules:
- ALWAYS include units whenever answers involve:
  - duration,
  - frequency,
  - quantity,
  - count,
  - weight,
  - dose,
  - temperature,
  - distance,
  - or measurable values.
- A patient reading the question in isolation must immediately understand the expected unit.

Examples:
- GOOD:
  - "How long does each episode last (in minutes)?"
  - "How many times per week does this occur?"
  - "What is your temperature (in °C)?"
- BAD:
  - "How long does it last?"
  - "How often does it happen?"

Slider and range rules:
- Bounds must be clinically realistic.
- Step values must be sensible.
- Units must appear:
  - either in the question text,
  - or in BOTH labels.min and labels.max.
- Pain/severity scales should usually use 0-10 unless clinically inappropriate.

Selectable question rules:
- ALL \`single_select\` and \`multi_select\` questions MUST include "Other" as the FINAL option.
- Numeric selectable options MUST include units.
  - GOOD:
    - "30 minutes"
    - "3 times per week"
  - BAD:
    - "30"
    - "3"

Schema rules:
- \`text\`:
  - allowed fields:
    - \`question\`
    - \`type\`
- \`single_select\` and \`multi_select\`:
  - required fields:
    - \`question\`
    - \`type\`
    - \`options\`
- \`slider\` and \`range\`:
  - required fields:
    - \`question\`
    - \`type\`
    - \`min\`
    - \`max\`
    - \`step\`
    - \`labels\`

Output requirements:
- Return ONLY a valid JSON array.
- No markdown.
- No explanations.
- No comments.
- No trailing commas.
- No code fences.
- Never invent unsupported question types.
- Never include fields irrelevant to the selected question type.

Expected JSON format:
[
  {
    "question": "How severe is your pain currently?",
    "type": "slider",
    "min": 0,
    "max": 10,
    "step": 1,
    "labels": {
      "min": "No pain",
      "max": "Worst pain"
    }
  },
  {
    "question": "How long does each headache episode typically last (in minutes)?",
    "type": "slider",
    "min": 0,
    "max": 1440,
    "step": 5,
    "labels": {
      "min": "0 min",
      "max": "24 h"
    }
  },
  {
    "question": "Which symptoms are you currently experiencing?",
    "type": "multi_select",
    "options": [
      "Fever",
      "Headache",
      "Fatigue",
      "Nausea",
      "Other"
    ]
  }
]`;
}

function GenerateMergeQuestionnaireLLMQuery(questionnaireSets = []) {
  const sets = Array.isArray(questionnaireSets) ? questionnaireSets : [];

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const sources = sets
    .map((set, i) => `Source ${i + 1}:\n${JSON.stringify(set, null, 2)}`)
    .join("\n\n");

    return `You are a highly experienced clinical questionnaire normalization engine used in a medical decision-support system.

    Your task is to MERGE multiple independently generated patient intake questionnaires into a single, clean, clinically optimized questionnaire.
    
    For awareness:
    Current date/time: ${dateTimeStr}
    
    You are given ${sets.length} JSON arrays of questions for the same patient case.
    
    Input format:
    Each item is:
    { "question": string, "type": "single_select" | "multi_select" | "slider" | "range" | "text", "options"?: string[], "min"?: number, "max"?: number, "step"?: number, "labels"?: { "min": string, "max": string } }
    
    ${sources}
    
    ────────────────────────────────────────
    PRIMARY OBJECTIVE
    ────────────────────────────────────────
    
    Produce ONE consolidated questionnaire that is:
    - deduplicated
    - clinically consistent
    - structurally valid
    - unit-correct
    - non-redundant
    - medically meaningful
    
    Do NOT optimize for completeness. Optimize for clinical signal quality.
    
    ────────────────────────────────────────
    MERGING PRINCIPLES (STRICT)
    ────────────────────────────────────────
    
    1. Semantic Deduplication (CORE RULE)
    Treat questions as duplicates if they measure:
    - the same symptom
    - same time dimension (duration/frequency/onset)
    - same severity scale
    - same trigger set
    - same clinical domain variable
    
    Even if wording differs.
    
    Example duplicates:
    - "How long does pain last?"
    - "Duration of pain episodes?"
    → MUST MERGE
    
    ---
    
    2. Canonical Question Selection
    When merging duplicates:
    - Choose the MOST clinically precise, self-contained, and unit-explicit version as the base
    - Preserve best structure (slider vs text vs select)
    - Preserve best clinical clarity
    
    Do NOT randomly mix wording.
    
    ---
    
    3. Option Merging Rules
    For single_select / multi_select:
    - Merge option sets using union
    - Remove duplicates (case-insensitive, punctuation-insensitive)
    - Keep clinically meaningful granularity (avoid near-duplicates like "mild" vs "slightly mild")
    - ALWAYS place "Other" as last option
    - Ensure options remain mutually exclusive where required
    
    ---
    
    4. Numeric / Unit Normalization (MANDATORY)
    For any measurable concept:
    - Ensure unit is explicitly stated in question text
    
    Standard conversions:
    - duration → minutes or hours (context dependent)
    - frequency → per day / per week
    - temperature → °C
    - weight → kg
    - distance → cm or meters
    - heart rate → bpm
    - pain → 0–10 scale (preferred)
    
    If unit is missing:
    - infer the most clinically standard unit
    - inject it into question text safely
    
    ---
    
    5. Slider / Range Normalization
    - Ensure bounds are medically realistic
    - Fix invalid scales:
      - pain: 0–10
      - heart rate: 30–220 bpm
      - duration: do NOT exceed 1440 minutes unless explicitly needed
    - Step must match clinical resolution (1, 5, or 10 typically)
    
    ---
    
    6. Type Correction Rules (STRICT)
    You MUST correct invalid types:
    
    - Yes/No → single_select ["Yes","No","Other"]
    - multi-answer symptom lists → multi_select
    - numeric continuous → slider or range
    - categorical severity → single_select
    
    Never preserve incorrect types from source blindly.
    
    ---
    
    7. Atomicity Rule (IMPORTANT)
    Each question must measure EXACTLY ONE clinical variable.
    
    Reject or split:
    - "severity and frequency"
    - "pain and duration"
    - "symptoms and triggers"
    
    ---
    
    8. Quality Filtering Rule
    Remove questions ONLY if:
    - clinically irrelevant to presenting complaint
    - redundant after merging
    - nonsensical or uninterpretable
    - duplicate after normalization
    
    Prefer fixing over dropping only when fix does NOT distort meaning.
    
    Do NOT inflate questionnaire size unnecessarily.
    
    ---
    
    9. No Creativity Rule (CRITICAL)
    Do NOT invent:
    - new symptoms
    - new conditions
    - new clinical domains
    - new question intent not present in inputs
    
    You are a MERGER, not a generator.
    
    ────────────────────────────────────────
    OUTPUT RULES
    ────────────────────────────────────────
    
    Return ONLY a valid JSON array.
    
    Do NOT include:
    - explanations
    - markdown
    - comments
    - code fences
    - additional text
    
    Each output must follow:
    { "question": string, "type": "single_select" | "multi_select" | "slider" | "range" | "text", "options"?: string[], "min"?: number, "max"?: number, "step"?: number, "labels"?: { "min": string, "max": string } }
    `;}

function GenerateLaboratoryLLMQuery({ issue, gender, age, questions = [], answers = [] } = {}) {
  const safeIssue = String(issue || "").trim() || "an unspecified health issue";
  const safeGender = String(gender || "male").toLowerCase();
  const safeAge = String(age || "30");

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  const intake = qList
    .map((q, i) => {
      const a = aList[i];
      const qText = q?.question || `(question ${i + 1})`;
      const qType = q?.type || "?";
      let aText;
      if (a == null || a.value == null) {
        aText = "(no answer)";
      } else if (Array.isArray(a.value)) {
        aText = a.value.length ? a.value.join(", ") : "(none selected)";
      } else if (typeof a.value === "object") {
        aText = JSON.stringify(a.value);
      } else {
        aText = String(a.value);
      }
      return `Q${i + 1} [${qType}] ${qText}\nA${i + 1}: ${aText}`;
    })
    .join("\n\n");

  return `You are a highly experienced licensed physician and clinical pathologist (lab medicine specialist) designing the laboratory workup for a patient case.

  The patient is  ${safeAge} Years Old ${safeGender} and presenting issue: "${safeIssue}".

  For awareness, the current date and time of this request is ${dateTimeStr}.

  Below are the patient's intake questionnaire answers:

  ${intake || "(no intake answers were captured)"}

  Your task:
  - Based on the patient profile (age, gender, primary issue) and the intake answers above, determine which laboratory tests and/or imaging studies a competent clinician would reasonably order to investigate this case.
  - For EACH suggested test, emit exactly ONE question representing the RESULT VALUE the user will enter from their report. The question stem must clearly name the test, including units where relevant (e.g. "Total testosterone (ng/dL)", "Ultrasound varicocele grade", "Fasting blood glucose (mg/dL)").
  - Choose the input type that best matches how the result is reported:
    - Continuous numeric result with a clinical range -> "slider" with clinically sensible min, max, step, and labels.min / labels.max such as "Low" / "High".
    - A result reported as a numeric pair (low-high band) -> "range".
    - Categorical / graded / staged result -> "single_select". Always include "Other" as the last option.
    - Imaging finding checklist (multiple findings can co-occur) -> "multi_select". Always include "Other" as the last option.
    - Free-form descriptive finding -> "text".
  - Prioritise medically meaningful, first-line tests for this case. Do not invent obscure or irrelevant tests. Do not duplicate questions.
  - It is fine to return a small focused panel rather than an exhaustive list.

  Examples of the expected shape (do NOT include these literal questions unless clinically appropriate — they only illustrate the schema):

  Hormone panel case example:
  {
    "question": "Estradiol serum level (pg/mL)",
    "type": "slider",
    "min": 0,
    "max": 1500,
    "step": 5,
    "labels": { "min": "Very low", "max": "Very high" }
  }

  Vitamin D status example:
  {
    "question": "Vitamin D (25-OH) status",
    "type": "single_select",
    "options": ["Deficient (< 20 ng/mL)", "Insufficient (20-29 ng/mL)", "Sufficient (30-100 ng/mL)", "Toxic (> 100 ng/mL)", "Other"]
  }

  Return ONLY a valid JSON array using this exact schema:
  { "question": string, "type": "single_select" | "multi_select" | "slider" | "range" | "text", "options"?: string[], "min"?: number, "max"?: number, "step"?: number, "labels"?: { "min": string, "max": string } }

  Do not include explanations, markdown, comments, code fences, or any text outside the JSON array.`;
}

function GeneratePreDoctorRoomLLMQuery({
  issue,
  gender,
  age,
  questionnaire = {},
  laboratory = {},
} = {}) {
  const safeIssue = String(issue || "").trim() || "an unspecified health issue";
  const safeGender = String(gender || "male").toLowerCase();
  const safeAge = String(age || "30");

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const intakeBlock = formatQaBlock(
    "Intake questionnaire (already answered)",
    questionnaire?.questions,
    questionnaire?.answers
  );
  const labBlock = formatQaBlock(
    "Laboratory / imaging report results (already answered)",
    laboratory?.questions,
    laboratory?.answers
  );

  return `You are generating the FINAL physician-style clarifying intake questions for a patient case before full clinical analysis. The patient has already completed:
(1) an intake symptom questionnaire
and
(2) a laboratory / imaging report intake.

Your responsibility is to review everything already collected and determine whether any HIGH-VALUE missing information still needs clarification before diagnostic reasoning begins.

Patient profile:
- Age: ${safeAge} Years Old
- Gender: ${safeGender}
- Presenting complaint: "${safeIssue}"
- Current date and time of this request: ${dateTimeStr}
 
${intakeBlock}

${labBlock}

Clinical reasoning instructions:
- Analyze the laboratory report results and compare with the original complaint and questionnaire answers  to find any missing information you want to ask from the patient.
- If the laboratory report are not there, do not ask further questions, just return [].
- Carefully analyze the presenting complaint, prior questionnaire responses, laboratory results, imaging findings, and all previously collected information.
- Silently determine:
  - the most likely diagnostic categories,
  - the highest-risk possibilities,
  - possible red flags,
  - contradictions or inconsistencies,
  - and the key missing information preventing further assessment.
- Only ask questions that would MATERIALLY improve:
  - diagnostic confidence,
  - triage accuracy,
  - urgency assessment,
  - treatment safety,
  - interpretation of abnormal findings,
  - or next-step clinical decision making.
- Prioritize questions that could:
  - reveal red-flag symptoms,
  - clarify abnormal lab findings,
  - identify medication or treatment risks,
  - resolve contradictory information,
  - clarify symptom progression,
  - or significantly narrow the differential diagnosis.
- Pay particular attention to:
  - symptom onset,
  - progression over time,
  - triggering factors,
  - relieving factors,
  - episodic vs persistent patterns,
  - exposure risks,
  - medication/supplement use,
  - prior treatment response,
  - and family history when clinically relevant. 
- Do NOT ask questions whose answers are already directly available or reasonably inferable from the provided information.
- Do NOT ask semantically overlapping or redundant questions.
- Do NOT ask low-yield exploratory filler questions.
- If contradictions or inconsistencies exist, prioritize resolving them first.
- If the information suggests a potentially urgent or emergent condition, prioritize clarification of:
  - breathing difficulty,
  - chest pain,
  - neurological symptoms,
  - bleeding,
  - altered consciousness,
  - severe infection symptoms,
  - pregnancy-related emergencies,
  - suicidality,
  - or rapidly worsening symptoms.

Question count rules:
- Return between 3 and 8 questions maximum.
- Prefer fewer questions when confidence is already high.
- If no meaningful diagnostic uncertainty remains, return [].

Question authoring requirements:
- Ask concise, professional, patient-friendly questions in second-person language.
- Avoid medical jargon unless clinically necessary.
- No double-barreled questions.
- Use the MOST appropriate question type:
  - \`single_select\`
  - \`multi_select\`
  - \`slider\`
  - \`range\`
  - \`text\`
- Yes/no questions MUST use:
  - \`single_select\`
  - with options: ["Yes", "No", "Other"]

Units and measurement rules:
- ALWAYS include units whenever the answer involves:
  - duration,
  - frequency,
  - quantity,
  - count,
  - dose,
  - distance,
  - weight,
  - temperature,
  - or severity scales.
- Example:
  - GOOD: "How long have you had the cough (in days)?"
  - BAD: "How long have you had the cough?"
- For \`slider\` and \`range\`:
  - bounds must be clinically realistic,
  - \`step\` must be sensible,
  - and units must appear either:
    - in the question text,
    - or in BOTH \`labels.min\` and \`labels.max\`.
- Pain/severity scales should generally use 0-10 unless clinically inappropriate.
- Numeric options inside selectable questions MUST include units.
  - GOOD: "30 minutes"
  - BAD: "30"

Selectable question rules:
- For ALL \`single_select\` and \`multi_select\` questions:
  - ALWAYS include "Other" as the FINAL option.

Schema rules:
- \`text\` questions:
  - allowed fields:
    - \`question\`
    - \`type\`
- \`single_select\` and \`multi_select\` questions:
  - required fields:
    - \`question\`
    - \`type\`
    - \`options\`
- \`slider\` and \`range\` questions:
  - required fields:
    - \`question\`
    - \`type\`
    - \`min\`
    - \`max\`
    - \`step\`
    - \`labels\`

Output requirements:
- Return ONLY a valid JSON array.
- Do NOT include explanations.
- Do NOT include markdown.
- Do NOT include comments.
- Do NOT include code fences.
- Do NOT include trailing commas.
- Never invent unsupported question types.
- Never include fields irrelevant to the selected question type.

Expected JSON format:
[
  {
    "question": "How severe is your pain currently?",
    "type": "slider",
    "min": 0,
    "max": 10,
    "step": 1,
    "labels": {
      "min": "No pain",
      "max": "Worst pain"
    }
  },
  {
    "question": "How long does each headache episode typically last (in minutes)?",
    "type": "slider",
    "min": 0,
    "max": 1440,
    "step": 5,
    "labels": {
      "min": "0 min",
      "max": "24 h"
    }
  },
  {
    "question": "Which symptoms are you currently experiencing?",
    "type": "multi_select",
    "options": [
      "Fever",
      "Headache",
      "Fatigue",
      "Nausea",
      "Other"
    ]
  }
]`;
}

function formatQaBlock(label, questions = [], answers = []) {
  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  if (qList.length === 0) {
    return `${label}: (none captured)`;
  }

  const lines = qList.map((q, i) => {
    const a = aList[i];
    const qText = q?.question || `(question ${i + 1})`;
    const qType = q?.type || "?";
    let aText;
    if (a == null || a.value == null) {
      aText = "(no answer)";
    } else if (Array.isArray(a.value)) {
      aText = a.value.length ? a.value.join(", ") : "(none selected)";
    } else if (typeof a.value === "object") {
      aText = JSON.stringify(a.value);
    } else {
      aText = String(a.value);
    }
    return `Q${i + 1} [${qType}] ${qText}\nA${i + 1}: ${aText}`;
  });

  return `${label}:\n\n${lines.join("\n\n")}`;
}

function GenerateDoctorAnalysisLLMQuery({
  issue,
  gender,
  age,
  questionnaire = {},
  laboratory = {},
  preDoctorRoom = {},
} = {}) {
  const safeIssue = String(issue || "").trim() || "an unspecified health issue";
  const safeGender = String(gender || "male").toLowerCase();
  const safeAge = String(age || "30");

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const intakeBlock = formatQaBlock(
    "Intake questionnaire",
    questionnaire?.questions,
    questionnaire?.answers
  );
  const labBlock = formatQaBlock(
    "Laboratory / imaging report results",
    laboratory?.questions,
    laboratory?.answers
  );
  const preDocBlock = formatQaBlock(
    "Pre-doctor clarifying questions (final intake)",
    preDoctorRoom?.questions,
    preDoctorRoom?.answers
  );

  return `You are generating a structured PRE-DOCTOR CLINICAL ANALYSIS for educational purposes.

This is NOT a diagnosis and NOT a treatment plan. It is a clinical reasoning summary intended to help the patient understand possible explanations and prepare for a real physician consultation.

Patient profile:
- Age: ${safeAge} Years Old
- Gender: ${safeGender}
- Presenting complaint: "${safeIssue}"
- Date of analysis: ${dateTimeStr}

${intakeBlock}

${labBlock}

${preDocBlock}

Clinical reasoning instructions:
- Analyze all provided information: symptoms, questionnaire responses, lab results, imaging findings, and prior clarifying answers.
- Only use the data provided. Do NOT assume missing results or invent external findings.
- Identify patterns across symptoms and lab abnormalities.
- Explicitly note when data is:
  - incomplete,
  - contradictory,
  - unclear,
  - or insufficient for strong conclusions.
- Prioritize clinically meaningful reasoning:
  - symptom clustering,
  - system involvement (e.g., respiratory, gastrointestinal, neurological),
  - timeline consistency,
  - and lab-symptom alignment.
- If contradictions exist, explicitly highlight them and explain why they matter.

Uncertainty handling:
- Use cautious language such as "possible", "likely", "less likely", "cannot be confirmed".
- Avoid absolute statements unless strongly supported by provided data.
- Do NOT over-rank conditions with false precision. If needed, group similar possibilities together.

Causal reasoning framework:
For each major consideration, classify it into:
- physiological / natural
- lifestyle-related
- medication or substance-related
- secondary to another condition
and explain the reasoning briefly.

Safety prioritization:
- Always identify potential red-flag conditions.
- Highlight symptoms or findings that would require urgent medical evaluation.

Risk-factor & prognosis reasoning:
- Identify both MODIFIABLE risk factors (lifestyle, diet, medication adherence, sleep, stress, substance use, etc.) and NON-MODIFIABLE risk factors (age, gender, prior medical history, family history, genetic predisposition) that are visible in the provided data.
- For each risk factor explicitly note:
  - whether it is modifiable or fixed,
  - how directly it ties back to the presenting complaint,
  - an estimated impact level (low / moderate / high) with a one-line justification grounded ONLY in the patient's data,
  - whether the link to the current issue is well-supported, suggestive, or speculative.
- Project the likely trajectory if the current condition is left UNADDRESSED, broken down into three timeframes:
  - short-term (days to weeks),
  - medium-term (weeks to months),
  - long-term (months to years).
- For each timeframe describe the most plausible progression in plain language, and clearly flag any:
  - irreversible outcomes,
  - rapidly-escalating risks,
  - or risks that could compromise quality of life, function, or fertility/reproductive health (if relevant).
- Briefly contrast the "no-action" trajectory with the likely trajectory if the patient pursues timely medical evaluation and addresses the identified modifiable factors. Keep this contrast non-prescriptive — describe the general direction of improvement only; do NOT suggest specific drugs, dosages, procedures, or supplements.
- If the available data is insufficient to project a particular timeframe responsibly, say so explicitly ("insufficient data to project the long-term trajectory") rather than guessing.
- Stay grounded in the provided questionnaire, lab, and pre-doctor answers — do NOT invent risk factors, comorbidities, or projections that the data does not support.

Output format requirements:

Return a single Markdown document ONLY, with the following structure:

# Pre-doctor Clinical Analysis

## Summary
One concise paragraph explaining the most plausible clinical picture in simple language.

## Key Findings From Your Information
- Summarize important symptom patterns
- Summarize key lab/imaging abnormalities
- Highlight any inconsistencies or missing critical data


Diagnostic reasoning approach:

Before listing possibilities:

1. Identify the SINGLE MOST SUPPORTED clinical explanation from the available data.
2. Identify competing explanations only if they explain findings that the leading explanation does not.
3. Eliminate possibilities that have weak support or directly conflict with the provided data.
4. Explicitly compare alternatives against the leading explanation.

For every possibility provide:

- Supporting evidence
- Contradicting evidence
- Missing evidence needed for confirmation

Assign one confidence category:

- Strongly supported
- Moderately supported
- Weakly supported
- Unlikely

Do not include possibilities that are only theoretically possible without supporting evidence from the patient's data.
 
Clinical weighting instructions:

Not all findings are equally important.

Assign greater weight to:

- Objective laboratory abnormalities
- Imaging findings
- Persistent symptoms
- Symptoms temporally linked to onset

Assign lower weight to:

- Nonspecific symptoms
- Isolated symptoms without corroborating findings

Prioritize explanations that account for the greatest number of findings simultaneously.

## Leading Clinical Impression

State the single most likely explanation based on the available information.

Include:

- Why it best explains the overall picture
- Which findings support it most strongly
- What uncertainty remains
- What evidence would strengthen or weaken this impression

## Contributing Factors (If Applicable)
Classify relevant causes into:
- physiological / natural
- lifestyle-related
- medication or substance-related
- secondary causes

Explain briefly based on provided data only.
 
 
Differential refinement:

For every alternative explanation listed, explicitly explain:

- Why it is less likely than the leading explanation
- Which findings are missing
- Which findings contradict it

Do not present alternatives as equally likely unless the evidence truly supports that conclusion.
 
 
 At the end of the analysis provide:

## Diagnostic Confidence

Estimate confidence in the leading explanation:

- High confidence
- Moderate confidence
- Low confidence

Explain exactly why the confidence is not higher.

## Possible Explanations
Provide any clinically relevant possibilities if any.
For each candidate explanation calculate:

- Evidence supporting it
- Evidence against it
- Findings left unexplained

Then compare all candidates and select the explanation that best accounts for the total clinical picture with the fewest assumptions.

The final report should emphasize the winning explanation rather than presenting all possibilities equally.

## Medication Considerations (Educational Overview)

This section provides general educational context about medication 
categories commonly associated with the identified conditions. 
This is NOT a prescription. All medication decisions must be made 
exclusively by a licensed physician or pharmacist.

For the leading clinical impression and any strongly supported differentials, provide:

### Commonly Used Medication Classes
- List the general CLASS of medications relevant to this condition (e.g., "antihistamines", "proton pump inhibitors", "NSAIDs")
- Do NOT include specific brand names or drug names
- Briefly explain what role each class plays in managing the condition
- Note whether this class is typically used short-term, long-term,  or as-needed

### Lifestyle & Non-Pharmacological Approaches
- Describe general evidence-based non-medication strategies relevant to the identified condition (e.g., dietary changes, sleep hygiene,  activity modifications, stress management)
- Keep these directional and general — not specific protocols
 

### Urgency Classification
Classify how soon medication evaluation is needed:
- **Urgent** — within 24-48 hours
- **Soon** — within 1-2 weeks  
- **Routine** — at a scheduled appointment

 
Formatting rules for overall output:
- Use Markdown only
- No JSON
- No code fences
- No external citations or fabricated research references
- No specific drug names, brand names, dosages, or prescription instructions
- Medication references are limited to general drug CLASS categories only, framed as educational context 
- Do not infer missing medical data
- Keep language patient-friendly but clinically accurate`;
}

module.exports = {
  GenerateQuestionnaireLLMQuery,
  GenerateMergeQuestionnaireLLMQuery,
  GenerateLaboratoryLLMQuery,
  GeneratePreDoctorRoomLLMQuery,
  GenerateDoctorAnalysisLLMQuery,
};
