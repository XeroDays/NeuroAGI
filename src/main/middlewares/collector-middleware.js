const { GenerateQuestionnaireLLMQuery } = require("../helpers/query-generator-helper");
const { chatCompletion } = require("../services/api-helper");

function parseJsonArray(raw) {
  if (typeof raw !== "string") {
    throw new Error("LLM response was not a string");
  }
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find a JSON array in the LLM response");
  }
  const slice = text.slice(start, end + 1);
  const parsed = JSON.parse(slice);
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed JSON is not an array");
  }
  return parsed;
}

async function StartReportcollection({ issue, gender, age } = {}) {
  console.log("[collector] StartReportcollection:", { issue, gender, age });
  try {
    const prompt = GenerateQuestionnaireLLMQuery({ issue, gender, age });
    const raw = await chatCompletion([{ role: "user", content: prompt }]);
    const questions = parseJsonArray(raw);
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

module.exports = { StartReportcollection };
