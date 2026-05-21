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

  Output contract:
  Return ONLY a valid JSON array using the exact schema above. Do not include explanations, markdown, comments, code fences, or any text outside the JSON array.`;
}

module.exports = { GenerateQuestionnaireLLMQuery, GenerateMergeQuestionnaireLLMQuery };
