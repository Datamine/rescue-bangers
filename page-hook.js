(function installHook() {
  const eventName = document.currentScript && document.currentScript.dataset
    ? document.currentScript.dataset.eventName
    : "x-banger-rescue:capture";

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch.apply(this, arguments);

    tryCaptureResponse(getRequestUrl(input), response.clone());
    return response;
  };

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__xBangerRescueUrl = typeof url === "string" ? url : "";
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.addEventListener("loadend", () => {
      if (!matchesGraphqlUrl(this.__xBangerRescueUrl)) {
        return;
      }

      if (typeof this.responseText !== "string" || !this.responseText) {
        return;
      }

      dispatchCapture(this.__xBangerRescueUrl, this.responseText);
    });

    return originalXhrSend.apply(this, arguments);
  };

  async function tryCaptureResponse(url, response) {
    if (!matchesGraphqlUrl(url)) {
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return;
    }

    try {
      const text = await response.text();
      dispatchCapture(url, text);
    } catch (error) {
      console.error("X Banger Rescue failed to read fetch response", error);
    }
  }

  function dispatchCapture(url, bodyText) {
    const payload = parseJson(bodyText);
    if (!payload) {
      return;
    }

    document.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        capturedAt: Date.now(),
        url,
        payload
      }
    }));
  }

  function getRequestUrl(input) {
    if (typeof input === "string") {
      return input;
    }

    if (input && typeof input.url === "string") {
      return input.url;
    }

    return "";
  }

  function matchesGraphqlUrl(url) {
    if (typeof url !== "string" || !url) {
      return false;
    }

    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.hostname === "x.com" && /^\/i\/api\/graphql\/[^/]+\/[^/?/]+(?:\/)?$/.test(parsed.pathname);
    } catch (error) {
      return false;
    }
  }

  function parseJson(value) {
    if (typeof value !== "string" || !value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }
})();
