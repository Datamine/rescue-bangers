const STORAGE_KEY = "capturedUserFlowPayloads";
const MAX_RECORDS = 10;
const TARGET_URLS = ["https://x.com/i/api/1.1/graphql/user_flow.json*"];

let writeQueue = Promise.resolve();

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("viewer.html"),
    type: "popup",
    width: 980,
    height: 760
  });
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST") {
      return;
    }

    const payload = extractPayload(details.requestBody);
    if (payload === null) {
      return;
    }

    const record = {
      capturedAt: typeof details.timeStamp === "number" ? Math.round(details.timeStamp) : Date.now(),
      url: details.url,
      payload
    };

    writeQueue = writeQueue
      .then(() => appendRecord(record))
      .catch((error) => console.error("Failed to persist captured payload", error));
  },
  { urls: TARGET_URLS },
  ["requestBody"]
);

async function appendRecord(record) {
  const result = await storageGet(STORAGE_KEY, []);
  const records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  records.push(record);
  await storageSet({
    [STORAGE_KEY]: records.slice(-MAX_RECORDS)
  });
}

function extractPayload(requestBody) {
  if (!requestBody) {
    return null;
  }

  const rawPayload = extractRawPayload(requestBody.raw);
  if (rawPayload !== null) {
    return rawPayload;
  }

  return extractFormPayload(requestBody.formData);
}

function extractRawPayload(rawParts) {
  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    return null;
  }

  const decoder = new TextDecoder();
  let bodyText = "";

  for (const part of rawParts) {
    if (!part || !(part.bytes instanceof ArrayBuffer)) {
      continue;
    }

    bodyText += decoder.decode(part.bytes, { stream: true });
  }

  bodyText += decoder.decode();
  return safeParseJson(bodyText);
}

function extractFormPayload(formData) {
  if (!formData || typeof formData !== "object") {
    return null;
  }

  for (const values of Object.values(formData)) {
    if (!Array.isArray(values)) {
      continue;
    }

    for (const value of values) {
      const parsed = safeParseJson(value);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function safeParseJson(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn("Ignoring non-JSON request body", error);
    return null;
  }
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
