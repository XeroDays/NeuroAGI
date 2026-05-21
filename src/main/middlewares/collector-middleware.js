const {
  GenerateQuestionnaireLLMQuery,
  GenerateMergeQuestionnaireLLMQuery,
  GenerateLaboratoryLLMQuery,
} = require("../helpers/query-generator-helper");
const { AskAllWorkerAgis, AskMasterAgi } = require("../services/agi-service");
const { jsonrepair } = require("jsonrepair");

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

    const workerResults = await AskAllWorkerAgis(initialPrompt);

    const parsedSets = [];
    for (const r of workerResults) {
      if (!r.ok) {
        console.warn(`[collector] worker ${r.model} failed:`, r.error);
        continue;
      }
      try {
        parsedSets.push(parseJsonArray(r.content));
        console.log(`[collector] worker ${r.model} parsed OK`);
      } catch (e) {
        console.warn(`[collector] worker ${r.model} unparsable JSON:`, e.message);
      }
    }

    if (parsedSets.length === 0) {
      throw new Error("All worker models failed or returned unparsable JSON");
    }
    console.log(`[collector] ${parsedSets.length} clean worker set(s) → master merge`);

    const mergePrompt = GenerateMergeQuestionnaireLLMQuery(parsedSets);
    const mergedRaw = await AskMasterAgi(mergePrompt);
    const questions = parseJsonArray(mergedRaw);

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

    const workerResults = await AskAllWorkerAgis(initialPrompt);

    const parsedSets = [];
    for (const r of workerResults) {
      if (!r.ok) {
        console.warn(`[collector/lab] worker ${r.model} failed:`, r.error);
        continue;
      }
      try {
        parsedSets.push(parseJsonArray(r.content));
        console.log(`[collector/lab] worker ${r.model} parsed OK`);
      } catch (e) {
        console.warn(`[collector/lab] worker ${r.model} unparsable JSON:`, e.message);
      }
    }

    if (parsedSets.length === 0) {
      throw new Error("All worker models failed or returned unparsable JSON");
    }
    console.log(`[collector/lab] ${parsedSets.length} clean worker set(s) → master merge`);

    const mergePrompt = GenerateMergeQuestionnaireLLMQuery(parsedSets);
    const mergedRaw = await AskMasterAgi(mergePrompt);
    const labQuestions = parseJsonArray(mergedRaw);

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

module.exports = {
  StartReportcollection,
  SubmitQuestionnaire,
  GotoLaboratory,
  SubmitLaboratory,
};
