const { chatCompletion, streamChat } = require("./api-helper");
const modelConfigService = require("./model-config-service");

// Master model is not user-configurable — it is always used for the JSON merge step.
const OPENROUTER_MASTER_MODEL = "baidu/cobuddy:free";

/** Returns the currently active model IDs from the user's saved selection. */
function getActiveModels() {
  return modelConfigService.getActiveModelIds();
}

async function AskAllWorkerAgis(prompt, options = {}) {
  const models = getActiveModels();
  const messages = [{ role: "user", content: prompt }];
  const startedAt = Date.now();
  console.log(`[agi] fanout → ${models.length} worker model(s)`);

  const settled = await Promise.allSettled(
    models.map((model) =>
      chatCompletion(messages, model, options)
        .then((content) => ({ model, ok: true, content }))
        .catch((err) => ({
          model,
          ok: false,
          error: err?.message || String(err),
        }))
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
  console.log(`[agi] master query → ${OPENROUTER_MASTER_MODEL}`);
  return chatCompletion(
    [{ role: "user", content: prompt }],
    OPENROUTER_MASTER_MODEL,
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
  OPENROUTER_MASTER_MODEL,
  getActiveModels,
};
