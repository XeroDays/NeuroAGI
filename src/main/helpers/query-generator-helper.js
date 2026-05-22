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

  return `You are a highly experienced medical doctor, licensed physician, and PhD-level clinical specialist conducting a professional medical intake assessment.

  The user is a ${safeAge}-year-old ${safeGender} reporting the following issue: "${safeIssue}".

  For awareness, the current date and time of this request is ${dateTimeStr}.

  Your task is to generate intelligent, medically relevant follow-up questions that help gather deeper clinical insights about the user's condition, symptoms, history, severity, triggers, duration, lifestyle factors, medications, and risk indicators.
  
  Requirements:
  - Ask concise, professional, patient-friendly questions.
  - Ask questions as many as possible but should be relavant.
  - Dynamically adapt questions based on the reported issue.
  - Include a mix of question types when appropriate:
    - single_select
    - multi_select
    - slider
    - range
    - text
  - For selectable questions, always include an "Other" option.
  - Some questions should measure severity or emotional state using sliders.
  - Some questions should allow selecting multiple symptoms or triggers.
  - Some questions should ask about duration, frequency, pain level, mood level, sleep quality, stress level, etc.
  - Avoid duplicate or unnecessary questions.
  - Prioritize medically meaningful questions that can improve diagnostic understanding.
  - **Always state the unit of measurement in the question text whenever the answer is a quantity** — duration, frequency, length, weight, distance, temperature, count, etc. For example, write "How long does each episode typically last (in minutes)?" instead of "How long does each episode typically last?"; write "How much water do you drink per day (in liters)?" instead of "How much water do you drink per day?". A user reading the question in isolation must know exactly what unit to answer in.
    - For "slider" and "range" types, the unit must be present in EITHER the question text OR both of "labels.min" / "labels.max" (preferred: in the question text). Bounds must be clinically reasonable for the chosen unit — do not pick arbitrarily large or small "min" / "max". For example, an episode duration that maxes out at 1440 should be phrased as "How long does each episode typically last (in minutes)?" with min: 0, max: 1440, labels.min: "0 min", labels.max: "24 h". A pain or severity scale should typically be 0-10, not 0-100.
    - For "single_select" and "multi_select", if the options are numeric tokens (e.g. "30", "60", "90"), include the unit on each option ("30 minutes", "60 minutes", "90 minutes"). Numeric options without units are forbidden.
  
  Return ONLY valid JSON.
  
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
      "question": "Which symptoms are you experiencing?",
      "type": "multi_select",
      "options": [
        "Fever",
        "Headache",
        "Fatigue",
        "Nausea",
        "Other"
      ]
    }
  ]
  
  Do not include explanations, markdown, comments, or any text outside the JSON array.`;
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

  return `You are a highly experienced medical doctor, licensed physician, and clinical assessment designer.

  For awareness, the current date and time of this request is ${dateTimeStr}.

  Below are ${sets.length} independently generated intake questionnaires for the same patient case. Each is a JSON array of questions in this schema:
  { "question": string, "type": "single_select" | "multi_select" | "slider" | "range" | "text", "options"?: string[], "min"?: number, "max"?: number, "step"?: number, "labels"?: { "min": string, "max": string } }

  ${sources}

  Your task:
  - Combine these into ONE consolidated, deduplicated questionnaire.
  - Treat questions with the same clinical intent as duplicates even if worded differently — merge them into a single question.
  - When merging selectable questions (single_select, multi_select), take the union of their options and remove near-duplicate options (case-insensitive, punctuation-insensitive). Always keep "Other" as the last option.
  - When merging slider / range questions, prefer the most clinically reasonable min / max / step values and reuse the clearer label text.
  - Drop low-value, redundant, or trivially similar questions; keep only medically meaningful ones.
  - Maintain a healthy mix of question types where appropriate (single_select, multi_select, slider, range, text).
  - Do NOT invent new clinical territory the sources did not cover.

  After producing the merged list, run a FINAL VALIDATION PASS over every question and apply the rules below before emitting. Output only the post-validation list.

  Validation checklist (apply to each question one-by-one):
  - **Clarity.** Every question must be self-contained and unambiguous. A user reading it in isolation must know exactly what is being asked, with no missing context.
  - **Units (MANDATORY for any measurable quantity).** If the answer is a quantity (duration, frequency, length, weight, distance, temperature, count, dose, etc.), the unit MUST be stated in the question text (preferred) or in BOTH "labels.min" and "labels.max". If a sourced question lacks a unit, ADD the most clinically reasonable unit (headache-duration sliders → minutes; water intake → liters; weight → kg; temperature → Celsius; heart rate → bpm; pain → 0-10 scale with the labels naming the endpoints). Never leave a measurable question unit-less.
  - **Sensible bounds.** For "slider" and "range", "min" and "max" must reflect realistic clinical values for the chosen unit. Cap nonsense bounds (e.g. a pain-level slider at 0-100 should be tightened to 0-10; a heart-rate slider at 0-1000 should be tightened to 30-220; an episode duration in minutes should not exceed 1440). "step" should be a sensible granularity for the unit (e.g. step: 5 for minutes-bound durations, step: 1 for 0-10 pain scales).
  - **Option coherence.** For "single_select", options must be mutually exclusive. For "multi_select", options should be non-redundant findings. In both, "Other" MUST be the last option. Numeric options must carry a unit ("30 minutes", not "30").
  - **Single intent.** Reject double-barreled questions (e.g. "How severe and how frequent are your episodes?") — split them into two questions or drop one half.
  - **Type fit.** Verify the chosen "type" matches the answer shape. If a sourced question's "type" is wrong (e.g. a yes/no question typed as "text"), correct it to "single_select" with ["Yes", "No", "Other"]. If a frequency question is typed "text" but only has a discrete set of answers, convert it to "single_select".
  - **Fix before dropping.** If a question fails one of the above and CAN be fixed by rewording, retyping, or adjusting bounds/units/options, fix it. Drop a question only if it is truly unfixable (e.g. nonsensical or no longer clinically relevant). Prefer fixing over dropping — the sources already paid the cost of generating it.

  Output contract:
  Return ONLY a valid JSON array using the exact schema above. Do not include explanations, markdown, comments, code fences, or any text outside the JSON array.`;
}

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

  The user is a ${safeAge}-year-old ${safeGender} reporting the following issue: "${safeIssue}".

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

  Low-libido case example:
  {
    "question": "Total testosterone (ng/dL)",
    "type": "slider",
    "min": 0,
    "max": 1500,
    "step": 10,
    "labels": { "min": "Very low", "max": "Very high" }
  }

  Varicocele case example:
  {
    "question": "Ultrasound varicocele grade",
    "type": "single_select",
    "options": ["Grade I", "Grade II", "Grade III", "Grade IV", "Other"]
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

  return `You are a highly experienced, board-certified clinical physician conducting the **final clarifying intake** for a patient case before handing it over for full physician analysis. The patient has already completed (1) an intake symptom questionnaire and (2) a laboratory / imaging report intake. Your job now is to inspect everything you have so far and decide what **additional** clarifying questions a competent doctor would still want to ask before forming a diagnostic impression.

  Patient profile:
  - Age: ${safeAge}
  - Gender: ${safeGender}
  - Presenting complaint: "${safeIssue}"
  - Current date and time of this request: ${dateTimeStr}

  ${intakeBlock}

  ${labBlock}

  Your task:
  - Carefully read the presenting complaint, the intake answers, and the lab / imaging results above. Cross-reference them against current clinical knowledge.
  - Identify the *remaining gaps* in the picture — symptom characteristics that were not yet captured, lifestyle / exposure factors not yet asked, time-course details, response-to-prior-treatment, family history, medication / supplement use, or anything contradictory in the data that needs clarification.
  - Generate a focused set of additional clarifying questions a physician would ask in person before forming a working diagnosis. Do **not** repeat questions whose answers are already visible above; the patient will not want to answer the same thing twice.
  - It is fine — even preferred — to return a small, surgical list of high-value questions rather than an exhaustive one. If genuinely no further clarification is needed, return a 1-question list confirming any single most important uncertainty.

  Question authoring requirements (same rules as the intake questionnaire):
  - Ask concise, professional, patient-friendly questions in the second person.
  - Mix question types where appropriate: \`single_select\`, \`multi_select\`, \`slider\`, \`range\`, \`text\`.
  - For selectable questions, always include an "Other" option as the LAST option.
  - **Always state the unit of measurement in the question text whenever the answer is a quantity** (duration, frequency, length, weight, distance, temperature, count, dose, etc.). For example, write "How long has this issue been worsening (in weeks)?" instead of "How long has this issue been worsening?".
    - For \`slider\` / \`range\`, the unit must appear in EITHER the question text OR both of \`labels.min\` / \`labels.max\` (preferred: in the question text). Bounds must be clinically reasonable for the chosen unit — do not pick arbitrary min / max. A pain or severity scale should typically be 0-10, not 0-100. \`step\` should be a sensible granularity for the unit.
    - For \`single_select\` / \`multi_select\`, numeric option tokens MUST carry their unit ("30 minutes", not "30").
  - No double-barreled questions (no "How long AND how severe…?"). Split or drop.
  - Verify the chosen \`type\` matches the answer shape. Yes/no questions are \`single_select\` with ["Yes", "No", "Other"], not \`text\`.

  Return ONLY valid JSON.

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
      "question": "Which symptoms are you experiencing?",
      "type": "multi_select",
      "options": [
        "Fever",
        "Headache",
        "Fatigue",
        "Nausea",
        "Other"
      ]
    }
  ]

  Do not include explanations, markdown, comments, code fences, or any text outside the JSON array.`;
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

  return `You are an experienced, board-certified clinical physician with deep diagnostic and pharmacological expertise. You are writing a **pre-doctor educational analysis** for a patient who has already completed an intake questionnaire, reported their laboratory / imaging findings, and answered a final round of clarifying questions. This is NOT a final diagnosis and NOT a prescription — it is structured guidance the patient will read before their real doctor's appointment.

  Patient profile:
  - Age: ${safeAge}
  - Gender: ${safeGender}
  - Presenting complaint: "${safeIssue}"
  - Date of this analysis: ${dateTimeStr}

  ${intakeBlock}

  ${labBlock}

  ${preDocBlock}

  Your job:
  - Analyse the case rigorously. Cross-reference symptoms, demographics, intake answers, and laboratory / imaging findings against current peer-reviewed medical research, standard clinical guidelines, and published case studies.
  - Address the patient directly in the second person ("you", "your symptoms").
  - Be honest about uncertainty — say "likely", "possible", or "less likely" rather than asserting a single cause if the picture is mixed.
  - Reason about whether each likely cause is **natural / physiological**, **lifestyle-driven (self-made)**, **medication-induced or iatrogenic**, or **secondary to another condition** — and explain why for each.
  - Surface red-flag warning signs that mean the patient should seek urgent / emergency care, not wait for an appointment.

  Your response MUST be a single, fully-formatted Markdown document (no JSON, no code fences around the whole document). Use this exact section structure with these headings in this order:

  # Pre-doctor Analysis

  ## Summary
  One short paragraph naming the most plausible working explanation(s) in plain language.

  ## Most Likely Causes
  A ranked Markdown list (highest probability first). For each cause give 1-2 lines explaining *why* the patient's specific intake and lab findings point to it.

  ## Is This Natural, Lifestyle-Driven, Medication-Induced, or Secondary?
  Explicitly classify each leading cause from the previous section into one of those four buckets and justify the classification.

  ## How to Address This
  Concrete, prioritised actions the patient can take now (self-care, lifestyle adjustments, diet, sleep, stress, exercise, ergonomic / environmental tweaks). Use a Markdown list.

  ## Medications a Doctor Commonly Prescribes
  Briefly describe the **classes of medication** a physician would typically consider for this presentation, what each class does, and why it might be chosen. Do **not** instruct the patient to self-medicate. Add a one-line caveat that exact drug, dose, and duration must come from their physician.

  ## Prevention and Long-Term Outlook
  How the patient can prevent recurrence or progression, plus what the realistic prognosis looks like with and without proper care.

  ## Red Flags — See a Doctor Immediately If
  A Markdown bullet list of warning signs that warrant urgent or emergency evaluation, not a routine appointment.

  ## What to Bring to the Doctor's Appointment
  Short list: which symptoms to track between now and the visit, which reports / images / medication lists to bring, and which specific questions to ask the physician.

  ## Disclaimer
  One short paragraph stating clearly that this is an AI-generated pre-doctor educational summary, not a diagnosis or prescription, and that the patient must consult a licensed clinician for a definitive evaluation.

  Formatting rules:
  - Output **Markdown only** — use \`#\`, \`##\`, \`**bold**\`, \`*italic*\`, and \`-\` / numbered lists.
  - Do NOT wrap the entire reply in a code fence and do NOT return JSON.
  - Do NOT include any text before the first heading or after the Disclaimer section.
  - Keep paragraphs tight and patient-friendly; avoid raw medical jargon without a quick gloss.`;
}

module.exports = {
  GenerateQuestionnaireLLMQuery,
  GenerateMergeQuestionnaireLLMQuery,
  GenerateLaboratoryLLMQuery,
  GeneratePreDoctorRoomLLMQuery,
  GenerateDoctorAnalysisLLMQuery,
};
