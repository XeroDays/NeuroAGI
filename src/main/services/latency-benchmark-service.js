const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const BENCHMARK_PROMPT = `Write the integers from 1 to 120 inclusive, one number per line.
Output only those numbers.
Do not add a title, commentary, or reasoning.`;

const LLM_OPTIONS = {
  maxTokens: 2048,
  reasoning: { effort: "none" },
};

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function formatLatency(elapsedMs) {
  return `${formatSeconds(elapsedMs)}s`;
}

function formatThroughput(contentLength, reasoningLength, elapsedMs) {
  const seconds = Number(elapsedMs) / 1000;
  if (!(seconds > 0)) return "0tps";
  const chars = (Number(contentLength) || 0) + (Number(reasoningLength) || 0);
  return `${Math.round(chars / seconds)}tps`;
}

function preview(text, maxLen = 120) {
  if (typeof text !== "string" || text.length === 0) return "(empty)";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

function contentLengthOf(value) {
  return typeof value === "string" ? value.length : 0;
}

async function probeModel(modelEntry, apiKey) {
  const model = modelEntry?.name;
  const type = modelEntry?.type || "";
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
      return {
        model,
        type,
        status: "error",
        elapsedMs,
        note: `HTTP ${res.status}: ${errText.slice(0, 400)}`,
      };
    }

    const json = await res.json();
    elapsedMs = Date.now() - startedAt;

    if (json?.error) {
      return {
        model,
        type,
        status: "error",
        elapsedMs,
        note: json.error.message || String(json.error),
      };
    }

    const message = json?.choices?.[0]?.message ?? {};
    const content = typeof message.content === "string" ? message.content : "";
    const reasoningLen = contentLengthOf(message.reasoning);
    const finishReason = json?.choices?.[0]?.finish_reason ?? null;

    return {
      model,
      type,
      status: "ok",
      elapsedMs,
      finishReason,
      contentLength: content.length,
      reasoningLength: reasoningLen,
      latency: formatLatency(elapsedMs),
      throughput: formatThroughput(content.length, reasoningLen, elapsedMs),
      note: preview(content),
    };
  } catch (err) {
    elapsedMs = Date.now() - startedAt;
    return {
      model,
      type,
      status: "error",
      elapsedMs,
      note: err?.message || String(err),
    };
  }
}

module.exports = {
  OPENROUTER_URL,
  BENCHMARK_PROMPT,
  LLM_OPTIONS,
  formatSeconds,
  formatLatency,
  formatThroughput,
  preview,
  probeModel,
};
