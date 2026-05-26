const STORAGE_KEY = "capturedHomeLatestTimelinePayloads";

const summaryEl = document.getElementById("summary");
const tweetListEl = document.getElementById("tweetList");
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
  if (!window.confirm("Clear all saved captured payloads?")) {
    return;
  }

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
  const captureGroups = buildCaptureGroups(records);
  const recoveredCount = captureGroups.reduce((count, group) => count + group.tweets.length, 0);

  latestCompositeJson = JSON.stringify(composite, null, 2);
  renderCaptureGroups(captureGroups);

  if (records.length === 0 || captureGroups.length === 0) {
    summaryEl.textContent = "No matching timeline responses have been captured yet. Open x.com, let HomeLatestTimeline load, then click the extension again.";
    copyButton.disabled = true;
    return;
  }

  const newestRecord = records[records.length - 1];
  const newestLabel = formatTimestamp(newestRecord.capturedAt);
  summaryEl.textContent = `Showing ${recoveredCount} recovered tweet cards across ${captureGroups.length} captured requests, ordered from oldest to newest. Latest capture: ${newestLabel}.`;
  copyButton.disabled = false;
}

function buildComposite(records) {
  const uniqueEntries = [];
  const seen = new Set();

  for (const record of records) {
    const entries = extractTimelineTweets(record ? record.payload : null);

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

function buildCaptureGroups(records) {
  return records
    .slice()
    .sort((left, right) => (left.capturedAt || 0) - (right.capturedAt || 0))
    .map((record, index) => ({
      id: index + 1,
      capturedAt: record.capturedAt,
      tweets: buildRecoveredTweets(extractTimelineTweets(record.payload))
    }))
    .filter((group) => group.tweets.length > 0);
}

function buildRecoveredTweets(entries) {
  const tweetsById = new Map();
  let fallbackOrder = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const tweetId = getTweetId(entry);
    if (!tweetId) {
      continue;
    }

    let tweet = tweetsById.get(tweetId);
    if (!tweet) {
      tweet = {
        id: tweetId,
        url: buildTweetUrl(entry),
        authorIds: new Set(),
        authorHandles: new Set(),
        authorNames: new Set(),
        contexts: new Set(),
        suggestionTypes: new Set(),
        media: [],
        mediaKeys: new Set(),
        metrics: null,
        text: "",
        latestTriggeredOn: 0,
        position: Number.POSITIVE_INFINITY,
        fallbackOrder: fallbackOrder++,
        quoteIds: new Set(),
        retweetIds: new Set(),
        rawPreview: null
      };
      tweetsById.set(tweetId, tweet);
    }

    for (const authorId of entry.authorIds) {
      tweet.authorIds.add(authorId);
    }

    if (entry.authorHandle) {
      tweet.authorHandles.add(entry.authorHandle);
    }

    if (entry.authorName) {
      tweet.authorNames.add(entry.authorName);
    }

    if (entry.context) {
      tweet.contexts.add(entry.context);
    }

    if (entry.suggestionType) {
      tweet.suggestionTypes.add(entry.suggestionType);
    }

    if (entry.createdAtMs > tweet.latestTriggeredOn) {
      tweet.latestTriggeredOn = entry.createdAtMs;
    }

    if (Number.isFinite(entry.position)) {
      tweet.position = Math.min(tweet.position, entry.position);
    }

    if (entry.quotedTweetId) {
      tweet.quoteIds.add(entry.quotedTweetId);
    }

    if (entry.retweetedTweetId) {
      tweet.retweetIds.add(entry.retweetedTweetId);
    }

    if (entry.text.length > tweet.text.length) {
      tweet.text = entry.text;
    }

    for (const mediaEntry of entry.media) {
      if (tweet.mediaKeys.has(mediaEntry.key)) {
        continue;
      }

      tweet.mediaKeys.add(mediaEntry.key);
      tweet.media.push(mediaEntry);
    }

    tweet.metrics = chooseMetrics(tweet.metrics, entry.metrics);
    if (!tweet.rawPreview) {
      tweet.rawPreview = entry.raw;
    }
  }

  return Array.from(tweetsById.values())
    .sort((left, right) => compareTweets(left, right))
    .map((tweet) => ({
      ...tweet,
      authorIds: Array.from(tweet.authorIds),
      authorHandles: Array.from(tweet.authorHandles),
      authorNames: Array.from(tweet.authorNames),
      contexts: Array.from(tweet.contexts),
      suggestionTypes: Array.from(tweet.suggestionTypes),
      quoteIds: Array.from(tweet.quoteIds),
      retweetIds: Array.from(tweet.retweetIds)
    }));
}

function renderCaptureGroups(captureGroups) {
  tweetListEl.replaceChildren();

  if (captureGroups.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No tweet-like items were found in the saved timeline responses yet. Once HomeLatestTimeline responses are captured, tweet cards will appear here.";
    tweetListEl.append(emptyState);
    return;
  }

  for (const group of captureGroups) {
    const section = document.createElement("section");
    section.className = "capture-group";

    const header = document.createElement("div");
    header.className = "capture-group__header";

    const title = document.createElement("h3");
    title.className = "capture-group__title";
    title.textContent = formatTimestamp(group.capturedAt);
    header.append(title);

    const meta = document.createElement("p");
    meta.className = "capture-group__meta";
    meta.textContent = `${group.tweets.length} recovered ${group.tweets.length === 1 ? "tweet" : "tweets"}`;
    header.append(meta);

    section.append(header);

    const cards = document.createElement("div");
    cards.className = "capture-group__cards";
    for (const tweet of group.tweets) {
      cards.append(buildTweetCard(tweet));
    }

    section.append(cards);
    tweetListEl.append(section);
  }
}

function buildTweetCard(tweet) {
  const article = document.createElement("article");
  article.className = "tweet-card";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "tweet-card__title";
  const link = document.createElement("a");
  link.href = tweet.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = `Tweet ${tweet.id}`;
  title.append(link);
  titleWrap.append(title);

  const authorLink = buildAuthorLink(tweet);
  if (authorLink) {
    titleWrap.append(authorLink);
  }

  article.append(titleWrap);

  if (tweet.text) {
    const text = document.createElement("p");
    text.className = "tweet-card__text";
    text.textContent = tweet.text;
    article.append(text);
  } else {
    const fallback = document.createElement("p");
    fallback.className = "tweet-card__fallback";
    fallback.textContent = "No tweet text was present in the captured timeline response for this item.";
    article.append(fallback);
  }

  if (tweet.media.length > 0) {
    const mediaList = document.createElement("div");
    mediaList.className = "media-list";

    for (const mediaEntry of tweet.media) {
      mediaList.append(buildMediaBlock(mediaEntry));
    }

    article.append(mediaList);
  }

  return article;
}

function buildAuthorLink(tweet) {
  const handle = tweet.authorHandles.length > 0 ? tweet.authorHandles[0] : "";
  if (!handle) {
    return null;
  }

  const meta = document.createElement("p");
  meta.className = "tweet-card__meta";

  const link = document.createElement("a");
  link.href = `https://x.com/${handle}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = `@${handle}`;
  meta.append(link);

  return meta;
}

function buildMediaBlock(mediaEntry) {
  const wrapper = document.createElement("div");
  wrapper.className = "media-item";

  const label = document.createElement("p");
  label.className = "media-item__label";
  label.textContent = mediaEntry.label;
  wrapper.append(label);

  const link = document.createElement("a");
  link.href = mediaEntry.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = mediaEntry.url;
  wrapper.append(link);

  if (looksLikePreviewableImage(mediaEntry.url)) {
    const image = document.createElement("img");
    image.className = "media-preview";
    image.src = mediaEntry.url;
    image.alt = mediaEntry.label;
    wrapper.append(image);
  }

  return wrapper;
}

function getTweetId(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (typeof item.id === "string" && item.id) {
    return item.id;
  }

  if (typeof item.rest_id === "string" && item.rest_id) {
    return item.rest_id;
  }

  return null;
}

function chooseMetrics(existingMetrics, nextMetrics) {
  if (!nextMetrics || typeof nextMetrics !== "object") {
    return existingMetrics;
  }

  if (!existingMetrics) {
    return nextMetrics;
  }

  const existingViews = Number(existingMetrics.view_count) || 0;
  const nextViews = Number(nextMetrics.view_count) || 0;
  return nextViews >= existingViews ? nextMetrics : existingMetrics;
}

function compareTweets(left, right) {
  if (left.position !== right.position) {
    if (!Number.isFinite(left.position)) {
      return 1;
    }

    if (!Number.isFinite(right.position)) {
      return -1;
    }

    return left.position - right.position;
  }

  if (left.latestTriggeredOn !== right.latestTriggeredOn) {
    return left.latestTriggeredOn - right.latestTriggeredOn;
  }

  return left.fallbackOrder - right.fallbackOrder;
}

function looksLikePreviewableImage(url) {
  return /(\.png|\.jpe?g|\.gif|\.webp)(\?|$)/i.test(url) || url.includes("pbs.twimg.com/media/");
}

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function extractTimelineTweets(payload) {
  const instructions = extractInstructionLists(payload);
  const tweets = [];
  let orderIndex = 0;

  for (const instructionList of instructions) {
    for (const instruction of instructionList) {
      if (!instruction || typeof instruction !== "object" || !Array.isArray(instruction.entries)) {
        continue;
      }

      for (const entry of instruction.entries) {
        const extracted = extractTweetsFromEntry(entry, orderIndex);
        orderIndex += extracted.length;
        tweets.push(...extracted);
      }
    }
  }

  return tweets;
}

function extractInstructionLists(payload) {
  const root = payload && payload.data && typeof payload.data === "object" ? payload.data : null;
  if (!root) {
    return [];
  }

  const results = [];
  const visited = new Set();

  walk(root);
  return results;

  function walk(value) {
    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value.instructions)) {
      results.push(value.instructions);
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        walk(child);
      }
    }
  }
}

function extractTweetsFromEntry(entry, startOrderIndex) {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const results = [];
  const content = entry.content;

  if (content && content.entryType === "TimelineTimelineItem") {
    const tweet = extractTweetFromItemContent(content.itemContent, {
      orderIndex: startOrderIndex,
      entryId: entry.entryId,
      sortIndex: entry.sortIndex,
      context: content.clientEventInfo && content.clientEventInfo.component
        ? content.clientEventInfo.component
        : content.entryType
    });
    if (tweet) {
      results.push(tweet);
    }
  }

  if (content && content.entryType === "TimelineTimelineModule" && Array.isArray(content.items)) {
    let moduleOrder = startOrderIndex;
    for (const moduleItem of content.items) {
      const tweet = extractTweetFromItemContent(moduleItem && moduleItem.item && moduleItem.item.itemContent, {
        orderIndex: moduleOrder++,
        entryId: moduleItem && moduleItem.entryId,
        sortIndex: entry.sortIndex,
        context: content.displayType || content.entryType
      });
      if (tweet) {
        results.push(tweet);
      }
    }
  }

  return results;
}

function extractTweetFromItemContent(itemContent, options) {
  if (!itemContent || itemContent.__typename !== "TimelineTweet") {
    return null;
  }

  const tweetResult = unwrapTweetResult(itemContent.tweet_results && itemContent.tweet_results.result);
  if (!tweetResult) {
    return null;
  }

  const legacy = tweetResult.legacy || {};
  const user = unwrapUserResult(tweetResult.core && tweetResult.core.user_results && tweetResult.core.user_results.result);
  const userLegacy = user && user.legacy ? user.legacy : {};
  const screenName = user && user.core ? user.core.screen_name : "";

  return {
    id: tweetResult.rest_id || legacy.id_str || "",
    position: Number.isFinite(options && options.orderIndex) ? options.orderIndex : Number.POSITIVE_INFINITY,
    sortIndex: typeof options.sortIndex === "string" ? options.sortIndex : "",
    context: options && options.context ? String(options.context) : "",
    suggestionType: itemContent.tweetDisplayType || itemContent.itemType || "",
    text: extractBestTweetText(tweetResult),
    authorIds: collectAuthorIds(tweetResult, user, userLegacy),
    authorHandle: typeof screenName === "string" ? screenName : "",
    authorName: user && user.core && typeof user.core.name === "string" ? user.core.name : "",
    createdAtMs: parseDateToMs(legacy.created_at),
    quotedTweetId: legacy.quoted_status_id_str || "",
    retweetedTweetId: legacy.retweeted_status_id_str || "",
    metrics: extractMetrics(tweetResult),
    media: collectMediaEntries(tweetResult),
    raw: tweetResult
  };
}

function unwrapTweetResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  if (result.__typename === "Tweet") {
    return result;
  }

  if (result.tweet && result.tweet.__typename === "Tweet") {
    return result.tweet;
  }

  if (result.result) {
    return unwrapTweetResult(result.result);
  }

  return null;
}

function unwrapUserResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  if (result.__typename === "User") {
    return result;
  }

  if (result.result) {
    return unwrapUserResult(result.result);
  }

  return null;
}

function extractBestTweetText(tweetResult) {
  const legacy = tweetResult && tweetResult.legacy ? tweetResult.legacy : {};
  const note = tweetResult && tweetResult.note_tweet && tweetResult.note_tweet.note_tweet_results
    ? tweetResult.note_tweet.note_tweet_results.result
    : null;
  const noteText = note && typeof note.text === "string" ? note.text : "";
  const candidates = [
    noteText,
    legacy.full_text,
    tweetResult && typeof tweetResult.full_text === "string" ? tweetResult.full_text : "",
    legacy.text
  ];

  let best = "";
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > best.length) {
      best = candidate.trim();
    }
  }

  return best;
}

function collectAuthorIds(tweetResult, user, userLegacy) {
  const ids = new Set();
  const legacy = tweetResult && tweetResult.legacy ? tweetResult.legacy : {};

  if (legacy.user_id_str) {
    ids.add(String(legacy.user_id_str));
  }

  if (user && typeof user.rest_id === "string") {
    ids.add(user.rest_id);
  }

  if (userLegacy && typeof userLegacy.id_str === "string") {
    ids.add(userLegacy.id_str);
  }

  return Array.from(ids);
}

function extractMetrics(tweetResult) {
  const legacy = tweetResult && tweetResult.legacy ? tweetResult.legacy : {};
  const views = tweetResult && tweetResult.views && tweetResult.views.count ? tweetResult.views.count : legacy.view_count;

  return {
    reply_count: legacy.reply_count,
    retweet_count: legacy.retweet_count,
    favorite_count: legacy.favorite_count,
    quote_count: legacy.quote_count,
    view_count: views
  };
}

function collectMediaEntries(tweetResult) {
  const media = [];
  const seen = new Set();
  const legacy = tweetResult && tweetResult.legacy ? tweetResult.legacy : {};
  const allMedia = [
    ...toArray(legacy.extended_entities && legacy.extended_entities.media),
    ...toArray(legacy.entities && legacy.entities.media)
  ];

  const addMedia = (url, label) => {
    if (typeof url !== "string" || !url.startsWith("http")) {
      return;
    }

    const key = `${label}|${url}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    media.push({ key, label, url });
  };

  for (const mediaItem of allMedia) {
    addMedia(mediaItem.media_url_https, mediaItem.type || "media");
    addMedia(mediaItem.expanded_url, `${mediaItem.type || "media"} page`);
  }

  return media;
}

function buildTweetUrl(entry) {
  if (entry.authorHandle) {
    return `https://x.com/${entry.authorHandle}/status/${entry.id}`;
  }

  return `https://x.com/i/status/${entry.id}`;
}

function parseDateToMs(value) {
  if (typeof value !== "string" || !value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
