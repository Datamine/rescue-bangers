# X Banger Rescue

This Chrome extension captures X GraphQL responses and stores the latest ten JSON payloads that actually contain tweet-like data in `chrome.storage.local`.

It matches response URLs like:

`https://x.com/i/api/graphql/<variable>/HomeLatestTimeline?...`

and also other operations such as:

`https://x.com/i/api/graphql/<variable>/UserTweets?...`

Clicking the extension opens a separate HTML window that groups recovered tweet cards by capture time.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/home/v/recover-bangers`.

## How it works

- `content-script.js` injects `page-hook.js` into `x.com` pages at document start.
- `page-hook.js` patches `fetch` and `XMLHttpRequest` in the page context so it can read matching JSON response bodies for `.../graphql/<hash>/<operation>`.
- Captured payloads are forwarded to `background.js`, which keeps only the latest ten tweet-like responses.
- The extension keeps only the latest ten captures.
- The viewer extracts tweets from timeline-style GraphQL payloads and groups them by when the response was captured.

## Notes

- The `<variable>` path segment between `graphql/` and the operation name is treated as dynamic and is not hard-coded.
- This implementation captures responses, not requests.
