const EVENT_NAME = "x-banger-rescue:capture";

installPageHook();

document.addEventListener(EVENT_NAME, (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!detail || typeof detail !== "object") {
    return;
  }

  chrome.runtime.sendMessage({
    type: "capture-home-latest-timeline",
    record: detail
  });
});

function installPageHook() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-hook.js");
  script.async = false;
  script.dataset.eventName = EVENT_NAME;
  (document.head || document.documentElement).append(script);
  script.remove();
}
