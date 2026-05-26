# X Banger Rescue

Do you sometimes see a great post on Twitter, but for whatever reason, your feed refreshes before you finish reading it or click on it?

X Banger Rescue, developed by [John Loeber](https://x.com/johnloeber), is here to save the day.

**This is a Chrome Extension that will capture your ten latest feed refreshes.** You can click on the extension at any time to view the dataset and interact with the tweets.

This means that if you ever see a great tweet and your feed refreshes too quickly, you can just open up the extension and find it.

To the Twitter team: please make this a native feature on Twitter. There is no browser extension solution possible for mobile. (At least not on iPhone.)

## Dependencies/Security

This Chrome Extension uses only vanilla JavaScript and has no third-party dependencies. Not a single package or import.

This extension itself does not send any of your data anywhere. It's possible that your extension's data is synced with your Google Chrome Browser profile, but that's something you would've had to enable.

## Developer Overview

This Chrome extension captures X GraphQL responses and stores the latest ten JSON payloads that actually contain tweet-like data in `chrome.storage.local`.

It matches response URLs like:

`https://x.com/i/api/graphql/<variable>/HomeLatestTimeline?...`

and also other operations such as:

`https://x.com/i/api/graphql/<variable>/UserTweets?...`

Clicking the extension opens a separate HTML window that groups recovered tweet cards by capture time.

## Developer Instructions: Load it in Chrome

If you don't trust the Chrome Web Store (admittedly you probably shouldn't), you can inspect the source code of this repo, and then just install it from the source:

1. Clone this repository to `/path/to/rescue-bangers`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `/path/to/rescue-bangers`.

## How it works

- `content-script.js` injects `page-hook.js` into `x.com` pages at document start.
- `page-hook.js` patches `fetch` and `XMLHttpRequest` in the page context so it can read matching JSON response bodies for `.../graphql/<hash>/<operation>`.
- Captured payloads are forwarded to `background.js`, which keeps only the latest ten tweet-like responses.
- The extension keeps only the latest ten captures.
- The viewer extracts tweets from timeline-style GraphQL payloads and groups them by when the response was captured.

## Notes

- The `<variable>` path segment between `graphql/` and the operation name is treated as dynamic and is not hard-coded.
- This implementation captures responses, not requests.

## Features

- Captures home timeline (both For You and Following)
- Captures lists
- Captures feeds on individual tweets
- Captures feeds on profiles
- Chronology matches your usage
- Deduplicates tweets for the most recent

## Known Issues

Does this suck a little? Yes. But is it good enough? Also yes.

- Doesn't capture pinned tweets
- Doesn't point out that Ads are Ads (or have a filter for it. Sometimes you want to see the ad?)
- Doesn't handle translations
- Doesn't strip the "RT @..." for retweets

## Contributions

Want to help out? Feel free to file issues if you run into bugs, or PRs if you have any ideas for improving the application. I do not receive GitHub notifications, so send an email to contact@johnloeber.com if there's something I should look at.

## Keywords
X, Twitter, Post, Tweet, Refresh, Timeline, Feed, Recover
