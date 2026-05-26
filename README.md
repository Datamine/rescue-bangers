# X User Flow Capture

This Chrome extension captures outgoing `POST` requests to:

`https://x.com/i/api/1.1/graphql/user_flow.json`

It stores the latest ten successfully parsed JSON request bodies in `chrome.storage.local`. Clicking the extension opens a separate HTML window that shows a deduplicated composite of all top-level objects from those saved payloads.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/home/v/recover-bangers`.

## How it works

- Capture happens in `background.js` using `chrome.webRequest.onBeforeRequest` plus the `requestBody` extra info spec.
- The body parser prefers structured fields like `log=[...]` from form-encoded requests, which is where X commonly places the client event array.
- The extension keeps only the latest ten captures.
- The viewer merges all saved payloads, flattens top-level arrays, deduplicates entries using a stable JSON serialization, and renders tweet-like items as cards before showing the raw composite JSON.

## Notes

- Chrome extensions can match the request by URL and method, but not by directly reading HTTP/2 pseudo-headers like `:authority` or `:path`. In practice, the filter here is equivalent to `POST https://x.com/i/api/1.1/graphql/user_flow.json`.
- If the request body is not valid JSON, the extension ignores it.
