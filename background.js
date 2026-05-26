const STORAGE_KEY = "capturedHomeLatestTimelinePayloads";
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
  if (!message || message.type !== "capture-home-latest-timeline") {
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
  return !!record && typeof record === "object" && record.payload && typeof record.payload === "object";
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
