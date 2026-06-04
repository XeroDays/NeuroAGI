const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PROJECT_ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(PROJECT_ROOT, "models-catalog.json");

const BENCHMARK_PROMPT = `Count the number of letters in the word "characteristically".
Think carefully and verify your count.
After you have finished, reply with exactly: OK`;

const LLM_OPTIONS = {
  maxTokens: 16384,
  reasoning: { effort: "medium" },
};

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function preview(text, maxLen = 120) {
  if (typeof text !== "string" || text.length === 0) return "(empty)";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

async function benchmarkModel(modelEntry, index, total) {
  const { name: model, type } = modelEntry;
  const apiKey = process.env.OPENROUTER_API_KEY;

  console.log(`\n[${index}/${total}] → ${model} (${type})`);
  console.log(`  Sending request…`);

  const startedAt = Date.now();
  let elapsedMs = 0;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/xerodays/neuroAGI",
        "X-Title": "NeuroAGI",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: BENCHMARK_PROMPT }],
        stream: false,
        max_tokens: LLM_OPTIONS.maxTokens,
        reasoning: LLM_OPTIONS.reasoning,
      }),
    });

    elapsedMs = Date.now() - startedAt;

    if (!res.ok) {
      const errText = await res.text();
      const message = `HTTP ${res.status}: ${errText.slice(0, 400)}`;
      console.log(`  ✗ Failed in ${formatSeconds(elapsedMs)}s — ${message}`);
      return {
        model,
        type,
        status: "error",
        elapsedMs,
        note: message,
      };
    }

    const json = await res.json();
    elapsedMs = Date.now() - startedAt;

    if (json?.error) {
      const message = json.error.message || String(json.error);
      console.log(`  ✗ API error in ${formatSeconds(elapsedMs)}s — ${message}`);
      return {
        model,
        type,
        status: "error",
        elapsedMs,
        note: message,
      };
    }

    const message = json?.choices?.[0]?.message ?? {};
    const content = message.content ?? "";
    const finishReason = json?.choices?.[0]?.finish_reason ?? null;
    const reasoningLen =
      typeof message.reasoning === "string" ? message.reasoning.length : 0;

    console.log(`  ✓ Completed in ${formatSeconds(elapsedMs)}s`);
    console.log(`    status: ${res.status}, finish_reason: ${finishReason}`);
    console.log(`    content: ${content.length} chars, reasoning: ${reasoningLen} chars`);
    console.log(`    preview: ${preview(content)}`);

    return {
      model,
      type,
      status: "ok",
      elapsedMs,
      finishReason,
      contentLength: content.length,
      reasoningLength: reasoningLen,
      note: preview(content),
    };
  } catch (err) {
    elapsedMs = Date.now() - startedAt;
    const message = err?.message || String(err);
    console.log(`  ✗ Exception in ${formatSeconds(elapsedMs)}s — ${message}`);
    return {
      model,
      type,
      status: "error",
      elapsedMs,
      note: message,
    };
  }
}

function printSummary(results, totalRunMs) {
  const successCount = results.filter((r) => r.status === "ok").length;
  const failureCount = results.length - successCount;
  const sorted = [...results].sort((a, b) => a.elapsedMs - b.elapsedMs);

  console.log("\n" + "=".repeat(72));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(72));
  console.log(`Models tested : ${results.length}`);
  console.log(`Successful    : ${successCount}`);
  console.log(`Failed        : ${failureCount}`);
  console.log(`Total run time: ${formatSeconds(totalRunMs)}s`);
  console.log("");

  const rankCol = "Rank".padEnd(5);
  const modelCol = "Model".padEnd(48);
  const typeCol = "Type".padEnd(6);
  const timeCol = "Time".padEnd(8);
  const statusCol = "Status".padEnd(8);
  console.log(`${rankCol}${modelCol}${typeCol}${timeCol}${statusCol}Note`);
  console.log("-".repeat(72));

  sorted.forEach((result, i) => {
    const rank = String(i + 1).padEnd(5);
    const model = result.model.padEnd(48).slice(0, 48);
    const type = result.type.padEnd(6);
    const time = `${formatSeconds(result.elapsedMs)}s`.padEnd(8);
    const status = result.status.padEnd(8);
    console.log(`${rank}${model}${type}${time}${status}${result.note}`);
  });

  console.log("=".repeat(72));
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(
      "OPENROUTER_API_KEY is not set. Add it to the .env file in the project root."
    );
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`Catalog not found: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  if (!Array.isArray(catalog) || catalog.length === 0) {
    console.error("models-catalog.json is empty or invalid.");
    process.exit(1);
  }

  console.log("NeuroAGI Model Latency Benchmark");
  console.log(`Catalog: ${catalog.length} models`);
  console.log(`Prompt : ${preview(BENCHMARK_PROMPT, 80)}`);
  console.log(`Options: stream=false, reasoning=medium, max_tokens=${LLM_OPTIONS.maxTokens}`);

  const runStartedAt = Date.now();
  const results = [];

  for (let i = 0; i < catalog.length; i++) {
    const result = await benchmarkModel(catalog[i], i + 1, catalog.length);
    results.push(result);
  }

  const totalRunMs = Date.now() - runStartedAt;
  printSummary(results, totalRunMs);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(PROJECT_ROOT, `benchmark-results-${timestamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        totalRunMs,
        prompt: BENCHMARK_PROMPT,
        options: LLM_OPTIONS,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nResults saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err?.message || String(err));
  process.exit(1);
});
