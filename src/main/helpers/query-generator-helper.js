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

module.exports = {
  GenerateQuestionnaireLLMQuery,
  GenerateMergeQuestionnaireLLMQuery,
  GenerateLaboratoryLLMQuery,
};
