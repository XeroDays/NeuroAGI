const { chatCompletion, streamChat } = require("./api-helper");
const modelConfigService = require("./model-config-service");

/** Per-worker timeout for parallel fanout (ms). Slow models are dropped, not blocking. */
const WORKER_TIMEOUT_MS = 120_000;

/** Returns the currently active model IDs from the user's saved selection. */
function getActiveModels() {
  return modelConfigService.getActiveModelIds();
}

/**
 * Builds a single-line, length-capped preview of a prompt for logging so the
 * console stays readable even when prompts are thousands of characters long.
 */
function previewPrompt(prompt, maxChars = 200) {
  const text = typeof prompt === "string" ? prompt : String(prompt ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars)}… (${text.length} chars total)`;
}

async function AskAllWorkerAgis(prompt, options = {}, callbacks = {}) {
  const { onWorkerSettled = null } = callbacks;
  const models = getActiveModels();
  const messages = [{ role: "user", content: prompt }];
  const startedAt = Date.now();
  const total = models.length;
  console.log(`[agi] fanout → ${total} worker model(s): [${models.join(", ")}]`);
  console.log(`[agi] fanout prompt → ${previewPrompt(prompt)}`);

  let completed = 0;
  const workerOptions = {
    ...options,
    timeoutMs: WORKER_TIMEOUT_MS,
  };

  const settled = await Promise.allSettled(
    models.map((model) =>
      chatCompletion(messages, model, workerOptions)
        .then((content) => {
          completed += 1;
          if (typeof onWorkerSettled === "function") {
            onWorkerSettled({ model, completed, total, ok: true });
          }
          return { model, ok: true, content };
        })
        .catch((err) => {
          completed += 1;
          const error = err?.message || String(err);
          if (typeof onWorkerSettled === "function") {
            onWorkerSettled({ model, completed, total, ok: false, error });
          }
          return { model, ok: false, error };
        })
    )
  );

  const results = settled.map((r) => r.value);
  const okCount = results.filter((r) => r.ok).length;
  console.log(
    `[agi] fanout complete: ${okCount}/${results.length} succeeded in ${Date.now() - startedAt}ms`
  );
  return results;
}

async function AskMasterAgi(prompt, options = {}) {
  const masterId = modelConfigService.getMasterModelRuntimeId();
  if (!masterId) {
    throw new Error("No master model selected. Star a model in the Models popup.");
  }
  console.log(`[agi] master query → ${masterId}`);
  console.log(`[agi] master query prompt → ${previewPrompt(prompt)}`);
  return chatCompletion(
    [{ role: "user", content: prompt }],
    masterId,
    options
  );
}

function StreamFromAllWorkerAgis(
  prompt,
  callbacks = {},
  options = {},
  modelList = null
) {
  const {
    onModelDelta = () => {},
    onModelReasoning = () => {},
    onModelDone = () => {},
    onModelError = () => {},
    onAllDone = () => {},
  } = callbacks;

  const messages = [{ role: "user", content: prompt }];
  const resolvedList = modelList !== null ? modelList : getActiveModels();
  const models = Array.isArray(resolvedList) ? resolvedList.slice() : [];
  const startedAt = Date.now();

  console.log(`[agi] stream-fanout → ${models.length} model(s)`);
  console.log(`[agi] stream-fanout prompt → ${previewPrompt(prompt)}`);

  if (models.length === 0) {
    console.warn("[agi] stream-fanout: model list is empty");
    queueMicrotask(() => onAllDone({ models: [], elapsedMs: 0 }));
    return models;
  }

  let remaining = models.length;
  const okSet = new Set();
  const errSet = new Set();

  const settle = (model, kind) => {
    if (okSet.has(model) || errSet.has(model)) return;
    if (kind === "ok") okSet.add(model);
    else errSet.add(model);
    remaining -= 1;
    if (remaining <= 0) {
      console.log(
        `[agi] stream-fanout complete: ${okSet.size}/${models.length} succeeded in ${Date.now() - startedAt}ms`
      );
      try {
        onAllDone({
          models,
          okModels: Array.from(okSet),
          errorModels: Array.from(errSet),
          elapsedMs: Date.now() - startedAt,
        });
      } catch (cbErr) {
        console.error("[agi] stream-fanout onAllDone callback threw:", cbErr);
      }
    }
  };

  for (const model of models) {
    try {
      streamChat(
        messages,
        model,
        (delta) => {
          try {
            onModelDelta(model, delta);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelDelta callback threw for ${model}:`,
              cbErr
            );
          }
        },
        () => {
          try {
            onModelDone(model);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelDone callback threw for ${model}:`,
              cbErr
            );
          } finally {
            settle(model, "ok");
          }
        },
        (err) => {
          const msg = err?.message || String(err);
          console.warn(`[agi] stream-fanout worker ${model} errored:`, msg);
          try {
            onModelError(model, msg);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelError callback threw for ${model}:`,
              cbErr
            );
          } finally {
            settle(model, "err");
          }
        },
        options,
        (reasoningDelta) => {
          try {
            onModelReasoning(model, reasoningDelta);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelReasoning callback threw for ${model}:`,
              cbErr
            );
          }
        }
      );
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[agi] stream-fanout failed to start ${model}:`, msg);
      try {
        onModelError(model, msg);
      } catch (cbErr) {
        console.error(
          `[agi] stream-fanout onModelError callback threw for ${model}:`,
          cbErr
        );
      } finally {
        settle(model, "err");
      }
    }
  }

  return models;
}

function StreamFromAllDoctorAgis(prompt, callbacks = {}, options = {}) {
  // Doctor analysis uses the same user-activated model pool as the worker
  // fanout — the list separation is maintained at the call-site level, not
  // by maintaining two separate static arrays.
  return StreamFromAllWorkerAgis(prompt, callbacks, options, getActiveModels());
}

module.exports = {
  AskAllWorkerAgis,
  AskMasterAgi,
  StreamFromAllWorkerAgis,
  StreamFromAllDoctorAgis,
  getActiveModels,
};
