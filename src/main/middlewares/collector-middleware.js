const {
  GenerateQuestionnaireLLMQuery,
  GenerateMergeQuestionnaireLLMQuery,
  GenerateLaboratoryLLMQuery,
  GeneratePreDoctorRoomLLMQuery,
  GenerateDoctorAnalysisLLMQuery,
} = require("../helpers/query-generator-helper");
const {
  AskAllWorkerAgis,
  AskMasterAgi,
  StreamFromAllWorkerAgis,
  StreamFromAllDoctorAgis,
} = require("../services/agi-service");
const channels = require("../../shared/ipc/channels");
const { jsonrepair } = require("jsonrepair");
  
// payload genuinely needs more room. Uncomment a different row to switch.
// const JSON_LLM_OPTIONS = { maxTokens: 4096,  reasoning: { effort: "none"   } };
// const JSON_LLM_OPTIONS = { maxTokens: 8192,  reasoning: { effort: "low"    } };
   const JSON_LLM_OPTIONS = { maxTokens: 16384, reasoning: { effort: "medium" } };
// const JSON_LLM_OPTIONS = { maxTokens: 32768, reasoning: { effort: "high"   } };
// const JSON_LLM_OPTIONS = { maxTokens: 65536, reasoning: { effort: "high"   } };

// Free-form doctor analysis report (streaming prose) — chosen on the Home screen via the
// "Reasoning level" dropdown and forwarded through StartDoctor (sessionStorage key
// "neuroagi:reasoningLevel"). Default = "medium".
const PROSE_LLM_OPTIONS_BY_LEVEL = {
  none:      { maxTokens: 4096,  reasoning: { effort: "none"   } },
  low:       { maxTokens: 8192,  reasoning: { effort: "low"    } },
  medium:    { maxTokens: 16384, reasoning: { effort: "medium" } },
  high:      { maxTokens: 32768, reasoning: { effort: "high"   } },
  very_high: { maxTokens: 65536, reasoning: { effort: "high"   } },
};
const DEFAULT_REASONING_LEVEL = "medium";

function resolveProseOptions(level) {
  return (
    PROSE_LLM_OPTIONS_BY_LEVEL[level] ||
    PROSE_LLM_OPTIONS_BY_LEVEL[DEFAULT_REASONING_LEVEL]
  );
}

function pickBestWorkerSet(sets) {
  const arrays = (Array.isArray(sets) ? sets : []).filter(Array.isArray);
  if (arrays.length === 0) return [];
  return arrays.reduce((best, s) => (s.length > best.length ? s : best));
}

function logBadChunk(slice, err) {
  const match = /position (\d+)/i.exec(err?.message || "");
  if (!match) return;
  const pos = Number(match[1]);
  const from = Math.max(0, pos - 80);
  const to = Math.min(slice.length, pos + 80);
  console.error(
    `[collector] JSON parse failed at pos ${pos}. Context:\n…${slice.slice(from, to)}…`
  );
}

function normalize(text) {
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
}

function parseJsonArray(raw) {
  if (typeof raw !== "string") {
    throw new Error("LLM response was not a string");
  }
  let text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (text.length === 0) {
    console.error(
      "[collector] LLM returned empty content (raw input was empty after trim/fence-strip)."
    );
    throw new Error(
      "LLM returned empty content. The model likely spent its output budget on internal reasoning — raise maxTokens or set reasoning.effort to 'none'."
    );
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    console.error("[collector] No JSON array found. Raw response:\n" + raw);
    throw new Error("Could not find a JSON array in the LLM response");
  }
  const slice = text.slice(start, end + 1);

  try {
    const parsed = JSON.parse(slice);
    if (!Array.isArray(parsed)) {
      throw new Error("Parsed JSON is not an array");
    }
    return parsed;
  } catch (err1) {
    logBadChunk(slice, err1);
    console.warn("[collector] Strict parse failed, trying normalized parse…");

    const normalized = normalize(slice);
    try {
      const parsed = JSON.parse(normalized);
      if (!Array.isArray(parsed)) {
        throw new Error("Normalized JSON is not an array");
      }
      console.log("[collector] Recovered via normalization");
      return parsed;
    } catch (err2) {
      console.warn("[collector] Normalized parse failed, trying jsonrepair…");

      try {
        const repaired = jsonrepair(normalized);
        const parsed = JSON.parse(repaired);
        if (!Array.isArray(parsed)) {
          throw new Error("Repaired JSON is not an array");
        }
        console.log("[collector] Recovered via jsonrepair");
        return parsed;
      } catch (err3) {
        console.error("[collector] All parse tiers failed. Full raw response:\n" + raw);
        throw new Error(`Failed to parse LLM JSON: ${err3.message}`);
      }
    }
  }
}

async function StartReportcollection({ issue, gender, age } = {}) {
  console.log("[collector] StartReportcollection:", { issue, gender, age });
  try {
    const initialPrompt = GenerateQuestionnaireLLMQuery({ issue, gender, age });

    const workerResults = await AskAllWorkerAgis(initialPrompt, JSON_LLM_OPTIONS);

    const parsedSets = [];
    for (const r of workerResults) {
      if (!r.ok) {
        console.warn(`[collector] worker ${r.model} failed:`, r.error);
        continue;
      }
      try {
        const parsed = parseJsonArray(r.content);
        parsedSets.push(parsed);
        console.log(
          `[collector] worker ${r.model} parsed OK (${parsed.length} questions)`
        );
      } catch (e) {
        console.warn(`[collector] worker ${r.model} unparsable JSON:`, e.message);
      }
    }

    if (parsedSets.length === 0) {
      throw new Error("All worker models failed or returned unparsable JSON");
    }
    console.log(`[collector] ${parsedSets.length} clean worker set(s) → master merge`);

    const mergePrompt = GenerateMergeQuestionnaireLLMQuery(parsedSets);
    const mergedRaw = await AskMasterAgi(mergePrompt, JSON_LLM_OPTIONS);

    let questions;
    try {
      questions = parseJsonArray(mergedRaw);
      console.log(
        `[collector] master merge parsed OK (${questions.length} questions)`
      );
    } catch (mergeErr) {
      console.warn(
        "[collector] Master merge unusable, falling back to best worker set:",
        mergeErr.message
      );
      questions = pickBestWorkerSet(parsedSets);
      console.log(
        `[collector] Master merge fallback: using worker set with ${questions.length} questions`
      );
    }

    return {
      ok: true,
      issue: String(issue || ""),
      gender: String(gender || "male"),
      age: String(age || "30"),
      questions,
    };
  } catch (err) {
    console.error("[collector] StartReportcollection failed:", err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

async function SubmitQuestionnaire({ issue, gender, age, questions = [], answers = [] } = {}) {
  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  console.log("[collector] SubmitQuestionnaire received:", {
    issue,
    gender,
    age,
    questionCount: qList.length,
    answerCount: aList.length,
  });

  const byIndex = new Map(aList.map((a, i) => [i, a]));
  console.log("[collector] === Q&A dump ===");
  qList.forEach((q, i) => {
    const a = byIndex.get(i);
    console.log(`Q${i + 1} [${q?.type || "?"}] ${q?.question || "(no question text)"}`);
    console.log(`A${i + 1}:`, a?.value);
  });
  console.log("[collector] === end Q&A ===");

  return { ok: true };
}

async function GotoLaboratory({ issue, gender, age, questions = [], answers = [] } = {}) {
  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  console.log("[collector] GotoLaboratory:", {
    issue,
    gender,
    age,
    questionCount: qList.length,
    answerCount: aList.length,
  });

  try {
    const initialPrompt = GenerateLaboratoryLLMQuery({
      issue,
      gender,
      age,
      questions: qList,
      answers: aList,
    });

    const workerResults = await AskAllWorkerAgis(initialPrompt, JSON_LLM_OPTIONS);

    const parsedSets = [];
    for (const r of workerResults) {
      if (!r.ok) {
        console.warn(`[collector/lab] worker ${r.model} failed:`, r.error);
        continue;
      }
      try {
        const parsed = parseJsonArray(r.content);
        parsedSets.push(parsed);
        console.log(
          `[collector/lab] worker ${r.model} parsed OK (${parsed.length} questions)`
        );
      } catch (e) {
        console.warn(`[collector/lab] worker ${r.model} unparsable JSON:`, e.message);
      }
    }

    if (parsedSets.length === 0) {
      throw new Error("All worker models failed or returned unparsable JSON");
    }
    console.log(`[collector/lab] ${parsedSets.length} clean worker set(s) → master merge`);

    const mergePrompt = GenerateMergeQuestionnaireLLMQuery(parsedSets);
    const mergedRaw = await AskMasterAgi(mergePrompt, JSON_LLM_OPTIONS);

    let labQuestions;
    try {
      labQuestions = parseJsonArray(mergedRaw);
      console.log(
        `[collector/lab] master merge parsed OK (${labQuestions.length} questions)`
      );
    } catch (mergeErr) {
      console.warn(
        "[collector/lab] Master merge unusable, falling back to best worker set:",
        mergeErr.message
      );
      labQuestions = pickBestWorkerSet(parsedSets);
      console.log(
        `[collector/lab] Master merge fallback: using worker set with ${labQuestions.length} questions`
      );
    }

    return {
      ok: true,
      issue: String(issue || ""),
      gender: String(gender || "male"),
      age: String(age || "30"),
      questions: labQuestions,
    };
  } catch (err) {
    console.error("[collector] GotoLaboratory failed:", err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

async function SubmitLaboratory({ issue, gender, age, questions = [], answers = [] } = {}) {
  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  console.log("[collector/lab] SubmitLaboratory received:", {
    issue,
    gender,
    age,
    questionCount: qList.length,
    answerCount: aList.length,
  });

  const byIndex = new Map(aList.map((a, i) => [i, a]));
  console.log("[collector/lab] === Lab Q&A dump ===");
  qList.forEach((q, i) => {
    const a = byIndex.get(i);
    console.log(`Q${i + 1} [${q?.type || "?"}] ${q?.question || "(no question text)"}`);
    console.log(`A${i + 1}:`, a?.value);
  });
  console.log("[collector/lab] === end Lab Q&A ===");

  return { ok: true };
}

async function GotoPreDoctorRoom(
  { issue, gender, age, questionnaire = {}, laboratory = {} } = {}
) {
  const intakeQs = Array.isArray(questionnaire?.questions) ? questionnaire.questions : [];
  const intakeAs = Array.isArray(questionnaire?.answers) ? questionnaire.answers : [];
  const labQs = Array.isArray(laboratory?.questions) ? laboratory.questions : [];
  const labAs = Array.isArray(laboratory?.answers) ? laboratory.answers : [];

  console.log("[collector/predoc] GotoPreDoctorRoom:", {
    issue,
    gender,
    age,
    intakeQuestionCount: intakeQs.length,
    intakeAnswerCount: intakeAs.length,
    labQuestionCount: labQs.length,
    labAnswerCount: labAs.length,
  });

  try {
    const initialPrompt = GeneratePreDoctorRoomLLMQuery({
      issue,
      gender,
      age,
      questionnaire: { questions: intakeQs, answers: intakeAs },
      laboratory: { questions: labQs, answers: labAs },
    });

    const workerResults = await AskAllWorkerAgis(initialPrompt, JSON_LLM_OPTIONS);

    const parsedSets = [];
    for (const r of workerResults) {
      if (!r.ok) {
        console.warn(`[collector/predoc] worker ${r.model} failed:`, r.error);
        continue;
      }
      try {
        const parsed = parseJsonArray(r.content);
        parsedSets.push(parsed);
        console.log(
          `[collector/predoc] worker ${r.model} parsed OK (${parsed.length} questions)`
        );
      } catch (e) {
        console.warn(
          `[collector/predoc] worker ${r.model} unparsable JSON:`,
          e.message
        );
      }
    }

    if (parsedSets.length === 0) {
      throw new Error("All worker models failed or returned unparsable JSON");
    }
    console.log(
      `[collector/predoc] ${parsedSets.length} clean worker set(s) → master merge`
    );

    const mergePrompt = GenerateMergeQuestionnaireLLMQuery(parsedSets);
    const mergedRaw = await AskMasterAgi(mergePrompt, JSON_LLM_OPTIONS);

    let preDocQuestions;
    try {
      preDocQuestions = parseJsonArray(mergedRaw);
      console.log(
        `[collector/predoc] master merge parsed OK (${preDocQuestions.length} questions)`
      );
    } catch (mergeErr) {
      console.warn(
        "[collector/predoc] Master merge unusable, falling back to best worker set:",
        mergeErr.message
      );
      preDocQuestions = pickBestWorkerSet(parsedSets);
      console.log(
        `[collector/predoc] Master merge fallback: using worker set with ${preDocQuestions.length} questions`
      );
    }

    return {
      ok: true,
      issue: String(issue || ""),
      gender: String(gender || "male"),
      age: String(age || "30"),
      questions: preDocQuestions,
    };
  } catch (err) {
    console.error("[collector/predoc] GotoPreDoctorRoom failed:", err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

async function SubmitPreDoctorRoom(
  { issue, gender, age, questions = [], answers = [] } = {}
) {
  const qList = Array.isArray(questions) ? questions : [];
  const aList = Array.isArray(answers) ? answers : [];

  console.log("[collector/predoc] SubmitPreDoctorRoom received:", {
    issue,
    gender,
    age,
    questionCount: qList.length,
    answerCount: aList.length,
  });

  const byIndex = new Map(aList.map((a, i) => [i, a]));
  console.log("[collector/predoc] === Pre-doctor Q&A dump ===");
  qList.forEach((q, i) => {
    const a = byIndex.get(i);
    console.log(`Q${i + 1} [${q?.type || "?"}] ${q?.question || "(no question text)"}`);
    console.log(`A${i + 1}:`, a?.value);
  });
  console.log("[collector/predoc] === end Pre-doctor Q&A ===");

  return { ok: true };
}

function StartDoctor(
  {
    issue,
    gender,
    age,
    reasoningLevel,
    questionnaire = {},
    laboratory = {},
    preDoctorRoom = {},
  } = {},
  sender
) {
  const intakeQs = Array.isArray(questionnaire?.questions) ? questionnaire.questions : [];
  const intakeAs = Array.isArray(questionnaire?.answers) ? questionnaire.answers : [];
  const labQs = Array.isArray(laboratory?.questions) ? laboratory.questions : [];
  const labAs = Array.isArray(laboratory?.answers) ? laboratory.answers : [];
  const preDocQs = Array.isArray(preDoctorRoom?.questions) ? preDoctorRoom.questions : [];
  const preDocAs = Array.isArray(preDoctorRoom?.answers) ? preDoctorRoom.answers : [];

  const proseOptions = resolveProseOptions(reasoningLevel);
  const resolvedLevel = PROSE_LLM_OPTIONS_BY_LEVEL[reasoningLevel]
    ? reasoningLevel
    : DEFAULT_REASONING_LEVEL;

  console.log("[collector/doctor] StartDoctor:", {
    issue,
    gender,
    age,
    reasoningLevel: resolvedLevel,
    proseOptions,
    intakeQuestionCount: intakeQs.length,
    intakeAnswerCount: intakeAs.length,
    labQuestionCount: labQs.length,
    labAnswerCount: labAs.length,
    preDocQuestionCount: preDocQs.length,
    preDocAnswerCount: preDocAs.length,
  });

  const safeSend = (channel, payload) => {
    if (!sender) return;
    try {
      if (sender.isDestroyed && sender.isDestroyed()) return;
      sender.send(channel, payload);
    } catch (err) {
      console.warn(
        `[collector/doctor] safeSend ${channel} failed:`,
        err?.message || String(err)
      );
    }
  };

  let prompt;
  try {
    prompt = GenerateDoctorAnalysisLLMQuery({
      issue,
      gender,
      age,
      questionnaire: { questions: intakeQs, answers: intakeAs },
      laboratory: { questions: labQs, answers: labAs },
      preDoctorRoom: { questions: preDocQs, answers: preDocAs },
    });
  } catch (err) {
    console.error("[collector/doctor] prompt build failed:", err);
    return { ok: false, error: err?.message || String(err), models: [] };
  }

  const streamBuffers = new Map();
  const reasoningBuffers = new Map();

  const models = StreamFromAllDoctorAgis(
    prompt,
    {
      onModelDelta: (model, delta) => {
        const prev = streamBuffers.get(model) || "";
        streamBuffers.set(model, prev + (typeof delta === "string" ? delta : ""));
        safeSend(channels.DOCTOR_STREAM_DELTA, { model, delta });
      },
      onModelReasoning: (model, delta) => {
        const prev = reasoningBuffers.get(model) || "";
        reasoningBuffers.set(
          model,
          prev + (typeof delta === "string" ? delta : "")
        );
        safeSend(channels.DOCTOR_STREAM_REASONING_DELTA, { model, delta });
      },
      onModelDone: (model) => {
        const buf = streamBuffers.get(model) || "";
        const reasoningBuf = reasoningBuffers.get(model) || "";
        console.log(
          `[collector/doctor] stream done for ${model} (content: ${buf.length} chars, reasoning: ${reasoningBuf.length} chars)`
        );
        safeSend(channels.DOCTOR_STREAM_DONE, { model });
      },
      onModelError: (model, error) => {
        const buf = streamBuffers.get(model) || "";
        const reasoningBuf = reasoningBuffers.get(model) || "";
        console.warn(
          `[collector/doctor] stream error for ${model} (after content: ${buf.length} chars, reasoning: ${reasoningBuf.length} chars):`,
          error
        );
        safeSend(channels.DOCTOR_STREAM_ERROR, { model, error });
      },
      onAllDone: ({ okModels, errorModels, elapsedMs }) => {
        console.log(
          `[collector/doctor] all doctor streams settled in ${elapsedMs}ms — ok: ${okModels.length}, err: ${errorModels.length}`
        );
      },
    },
    proseOptions
  );

  return { ok: true, models };
}

module.exports = {
  StartReportcollection,
  SubmitQuestionnaire,
  GotoLaboratory,
  SubmitLaboratory,
  GotoPreDoctorRoom,
  SubmitPreDoctorRoom,
  StartDoctor,
};
