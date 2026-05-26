const STORAGE_KEY = "capturedUserFlowPayloads";

const summaryEl = document.getElementById("summary");
const outputEl = document.getElementById("output");
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
  const tweets = buildRecoveredTweets(composite);

  latestCompositeJson = JSON.stringify(composite, null, 2);
  outputEl.textContent = latestCompositeJson;
  renderTweetCards(tweets);

  if (records.length === 0) {
    summaryEl.textContent = "No matching POST bodies have been captured yet. Open x.com, trigger user_flow traffic, then click the extension again.";
    copyButton.disabled = true;
    return;
  }

  const newestRecord = records[records.length - 1];
  const newestLabel = formatTimestamp(newestRecord.capturedAt);
  summaryEl.textContent = `Recovered ${tweets.length} unique tweets from ${composite.length} unique user_flow events merged from the latest ${records.length} captures. Last capture: ${newestLabel}.`;
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

function buildRecoveredTweets(entries) {
  const tweetsById = new Map();

  for (const event of entries) {
    if (!event || typeof event !== "object") {
      continue;
    }

    const items = Array.isArray(event.items) ? event.items : [];
    const namespaceLabel = formatNamespace(event.event_namespace);
    const eventTimestamp = Number(event.triggered_on) || 0;

    for (const item of items) {
      const tweetId = getTweetId(item);
      if (!tweetId) {
        continue;
      }

      let tweet = tweetsById.get(tweetId);
      if (!tweet) {
        tweet = {
          id: tweetId,
          url: `https://x.com/i/status/${tweetId}`,
          authorIds: new Set(),
          contexts: new Set(),
          suggestionTypes: new Set(),
          media: [],
          mediaKeys: new Set(),
          metrics: null,
          text: "",
          latestTriggeredOn: 0,
          sortIndex: "",
          quoteIds: new Set(),
          retweetIds: new Set(),
          rawPreview: null
        };
        tweetsById.set(tweetId, tweet);
      }

      if (item.author_id) {
        tweet.authorIds.add(String(item.author_id));
      }

      if (namespaceLabel) {
        tweet.contexts.add(namespaceLabel);
      }

      const suggestionType = item.suggestion_details && item.suggestion_details.suggestion_type;
      if (typeof suggestionType === "string" && suggestionType) {
        tweet.suggestionTypes.add(suggestionType);
      }

      if (eventTimestamp > tweet.latestTriggeredOn) {
        tweet.latestTriggeredOn = eventTimestamp;
      }

      if (typeof item.sort_index === "string" && item.sort_index > tweet.sortIndex) {
        tweet.sortIndex = item.sort_index;
      }

      if (item.quoted_tweet_id) {
        tweet.quoteIds.add(String(item.quoted_tweet_id));
      }

      if (item.retweeting_tweet_id) {
        tweet.retweetIds.add(String(item.retweeting_tweet_id));
      }

      const itemText = extractTweetText(item, event);
      if (itemText.length > tweet.text.length) {
        tweet.text = itemText;
      }

      const mediaEntries = collectMediaEntries(item);
      for (const mediaEntry of mediaEntries) {
        if (tweet.mediaKeys.has(mediaEntry.key)) {
          continue;
        }

        tweet.mediaKeys.add(mediaEntry.key);
        tweet.media.push(mediaEntry);
      }

      tweet.metrics = chooseMetrics(tweet.metrics, item.engagement_metrics);
      if (!tweet.rawPreview) {
        tweet.rawPreview = item;
      }
    }
  }

  return Array.from(tweetsById.values())
    .sort((left, right) => compareTweets(left, right))
    .map((tweet) => ({
      ...tweet,
      authorIds: Array.from(tweet.authorIds),
      contexts: Array.from(tweet.contexts),
      suggestionTypes: Array.from(tweet.suggestionTypes),
      quoteIds: Array.from(tweet.quoteIds),
      retweetIds: Array.from(tweet.retweetIds)
    }));
}

function renderTweetCards(tweets) {
  tweetListEl.replaceChildren();

  if (tweets.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No tweet-like items were found in the saved payloads yet. Once `log=[...]` request bodies are captured, tweet cards will appear here.";
    tweetListEl.append(emptyState);
    return;
  }

  for (const tweet of tweets) {
    tweetListEl.append(buildTweetCard(tweet));
  }
}

function buildTweetCard(tweet) {
  const article = document.createElement("article");
  article.className = "tweet-card";

  const top = document.createElement("div");
  top.className = "tweet-card__top";

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

  const meta = document.createElement("p");
  meta.className = "tweet-card__meta";
  meta.textContent = buildMetaLine(tweet);
  titleWrap.append(meta);
  top.append(titleWrap);

  const openButton = document.createElement("a");
  openButton.href = tweet.url;
  openButton.target = "_blank";
  openButton.rel = "noreferrer";
  openButton.textContent = "Open on X";
  openButton.className = "chip";
  top.append(openButton);

  article.append(top);

  if (tweet.text) {
    const text = document.createElement("p");
    text.className = "tweet-card__text";
    text.textContent = tweet.text;
    article.append(text);
  } else {
    const fallback = document.createElement("p");
    fallback.className = "tweet-card__fallback";
    fallback.textContent = "No tweet text was present in the captured user_flow payload for this item.";
    article.append(fallback);
  }

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  addChip(chipRow, `author ${tweet.authorIds[0] ?? "unknown"}`);
  for (const context of tweet.contexts.slice(0, 3)) {
    addChip(chipRow, context);
  }
  for (const suggestionType of tweet.suggestionTypes.slice(0, 2)) {
    addChip(chipRow, suggestionType);
  }
  if (tweet.latestTriggeredOn) {
    addChip(chipRow, formatTimestamp(tweet.latestTriggeredOn));
  }
  if (tweet.quoteIds.length > 0) {
    addChip(chipRow, `quotes ${tweet.quoteIds[0]}`);
  }
  if (tweet.retweetIds.length > 0) {
    addChip(chipRow, `retweet ${tweet.retweetIds[0]}`);
  }
  if (chipRow.childNodes.length > 0) {
    article.append(chipRow);
  }

  if (tweet.metrics) {
    const metricsRow = document.createElement("div");
    metricsRow.className = "chip-row";
    for (const label of formatMetrics(tweet.metrics)) {
      addChip(metricsRow, label);
    }
    article.append(metricsRow);
  }

  if (tweet.media.length > 0) {
    const mediaList = document.createElement("div");
    mediaList.className = "media-list";

    for (const mediaEntry of tweet.media) {
      mediaList.append(buildMediaBlock(mediaEntry));
    }

    article.append(mediaList);
  }

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Merged item metadata";
  details.append(summary);

  const metadata = document.createElement("pre");
  metadata.textContent = JSON.stringify(tweet.rawPreview, null, 2);
  details.append(metadata);
  article.append(details);

  return article;
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

function buildMetaLine(tweet) {
  const parts = [];

  if (tweet.authorIds.length > 0) {
    parts.push(`author ${tweet.authorIds.join(", ")}`);
  }

  if (tweet.contexts.length > 0) {
    parts.push(tweet.contexts.slice(0, 2).join(" | "));
  }

  if (tweet.suggestionTypes.length > 0) {
    parts.push(tweet.suggestionTypes.join(", "));
  }

  return parts.join(" • ");
}

function addChip(container, label) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = label;
  container.append(chip);
}

function getTweetId(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.item_type !== 0) {
    return null;
  }

  if (typeof item.id === "string" && item.id) {
    return item.id;
  }

  return null;
}

function formatNamespace(namespace) {
  if (!namespace || typeof namespace !== "object") {
    return "";
  }

  const parts = [namespace.page, namespace.section, namespace.component, namespace.action]
    .filter((value) => typeof value === "string" && value);

  return parts.join(" / ");
}

function extractTweetText(item, event) {
  const candidates = [
    item.full_text,
    item.text,
    item.note_tweet_text,
    item.legacy && item.legacy.full_text,
    item.tweet_results && item.tweet_results.result && item.tweet_results.result.legacy && item.tweet_results.result.legacy.full_text,
    item.note_tweet_results && item.note_tweet_results.result && item.note_tweet_results.result.text,
    item.note_tweet_results && item.note_tweet_results.result && item.note_tweet_results.result.note_tweet && item.note_tweet_results.result.note_tweet.text,
    event && event.full_text,
    event && event.text
  ];

  let best = "";
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > best.length) {
        best = trimmed;
      }
    }
  }

  return best;
}

function collectMediaEntries(item) {
  const media = [];
  const seen = new Set();

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

  addMedia(item.media_asset_url, "media asset");

  for (const mediaDetail of toArray(item.media_details_v2)) {
    addMedia(mediaDetail.media_url_https, "media");
    addMedia(mediaDetail.media_url, "media");
    addMedia(mediaDetail.url, "media");
  }

  for (const mediaDetail of toArray(item.media_details)) {
    addMedia(mediaDetail.media_url_https, "media");
    addMedia(mediaDetail.media_url, "media");
    addMedia(mediaDetail.url, "media");
  }

  return media;
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

function formatMetrics(metrics) {
  const metricPairs = [
    ["replies", metrics.reply_count],
    ["retweets", metrics.retweet_count],
    ["likes", metrics.favorite_count],
    ["quotes", metrics.quote_count],
    ["views", metrics.view_count]
  ];

  return metricPairs
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `${label} ${value}`);
}

function compareTweets(left, right) {
  if (left.sortIndex && right.sortIndex && left.sortIndex !== right.sortIndex) {
    return right.sortIndex.localeCompare(left.sortIndex);
  }

  return right.latestTriggeredOn - left.latestTriggeredOn;
}

function looksLikePreviewableImage(url) {
  return /(\.png|\.jpe?g|\.gif|\.webp)(\?|$)/i.test(url) || url.includes("pbs.twimg.com/media/");
}

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
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
