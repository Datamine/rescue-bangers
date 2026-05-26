const STORAGE_KEY = "capturedGraphqlTweetPayloads";
const MAX_RECORDS = 10;

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("viewer.html"),
    type: "popup",
    width: 980,
    height: 760
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "capture-graphql-payload") {
    return;
  }

  void appendCapture(message.record)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("Failed to persist captured timeline payload", error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});

async function appendCapture(record) {
  if (!isValidRecord(record)) {
    return;
  }

  const result = await storageGet(STORAGE_KEY, []);
  const records = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  records.push({
    capturedAt: typeof record.capturedAt === "number" ? record.capturedAt : Date.now(),
    url: typeof record.url === "string" ? record.url : "",
    payload: record.payload
  });

  await storageSet({
    [STORAGE_KEY]: records.slice(-MAX_RECORDS)
  });
}

function isValidRecord(record) {
  return !!record &&
    typeof record === "object" &&
    record.payload &&
    typeof record.payload === "object" &&
    containsTweetLikeData(record.payload);
}

function containsTweetLikeData(payload) {
  const stack = [payload];
  let inspected = 0;

  while (stack.length > 0 && inspected < 8000) {
    const value = stack.pop();
    inspected += 1;

    if (!value || typeof value !== "object") {
      continue;
    }

    if (looksLikeTweet(value)) {
      return true;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push(item);
      }
      continue;
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return false;
}

function looksLikeTweet(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value.__typename === "Tweet" || value.__typename === "TimelineTweet") {
    return true;
  }

  if (typeof value.rest_id === "string" && value.legacy && typeof value.legacy.full_text === "string") {
    return true;
  }

  if (value.tweet_results && typeof value.tweet_results === "object") {
    return true;
  }

  if (value.itemContent && value.itemContent.__typename === "TimelineTweet") {
    return true;
  }

  return false;
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
