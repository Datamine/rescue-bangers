const STORAGE_KEY = "capturedUserFlowPayloads";

const summaryEl = document.getElementById("summary");
const outputEl = document.getElementById("output");
const copyButton = document.getElementById("copyButton");
const clearButton = document.getElementById("clearButton");

let latestCompositeJson = "[]";

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latestCompositeJson);
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy JSON";
    }, 1200);
  } catch (error) {
    console.error("Failed to copy JSON", error);
    copyButton.textContent = "Copy failed";
    window.setTimeout(() => {
      copyButton.textContent = "Copy JSON";
    }, 1400);
  }
});

clearButton.addEventListener("click", async () => {
  clearButton.disabled = true;

  try {
    await storageSet({ [STORAGE_KEY]: [] });
    await render();
  } catch (error) {
    console.error("Failed to clear saved payloads", error);
  } finally {
    clearButton.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    void render();
  }
});

void render();

async function render() {
  const result = await storageGet(STORAGE_KEY, []);
  const records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  const composite = buildComposite(records);

  latestCompositeJson = JSON.stringify(composite, null, 2);
  outputEl.textContent = latestCompositeJson;

  if (records.length === 0) {
    summaryEl.textContent = "No matching POST bodies have been captured yet. Open x.com, trigger user_flow traffic, then click the extension again.";
    copyButton.disabled = true;
    return;
  }

  const newestRecord = records[records.length - 1];
  const newestLabel = formatTimestamp(newestRecord.capturedAt);
  summaryEl.textContent = `Showing ${composite.length} unique top-level objects merged from the latest ${records.length} captured payloads. Last capture: ${newestLabel}.`;
  copyButton.disabled = false;
}

function buildComposite(records) {
  const uniqueEntries = [];
  const seen = new Set();

  for (const record of records) {
    const payload = record ? record.payload : null;
    const entries = Array.isArray(payload) ? payload : payload === null || payload === undefined ? [] : [payload];

    for (const entry of entries) {
      const key = stableStringify(entry);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueEntries.push(entry);
    }
  }

  return uniqueEntries;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function formatTimestamp(value) {
  if (typeof value !== "number") {
    return "unknown";
  }

  return new Date(value).toLocaleString();
}

function storageGet(key, fallbackValue) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [key]: fallbackValue }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}
