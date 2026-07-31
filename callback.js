(() => {
  "use strict";

  const TX_KEY = "arcgis-popup-lab7-oauth-transaction";
  const RESULT_KEY = "arcgis-popup-lab7-oauth-result";
  const CHANNEL_NAME = "arcgis-popup-lab7-oauth";
  const status = document.getElementById("callbackStatus");

  function show(message, tone = "info") {
    status.textContent = message;
    status.className = `status ${tone}`;
  }

  function readTransaction() {
    try {
      return JSON.parse(localStorage.getItem(TX_KEY) || "null");
    } catch {
      return null;
    }
  }

  function appendReturnMarker(url) {
    const target = new URL(url);
    target.searchParams.set("oauth_return", String(Date.now()));
    return target.href;
  }

  async function exchangeCode(transaction, code) {
    const tokenUrl = `${transaction.portalUrl}/sharing/rest/oauth2/token`;
    const body = new URLSearchParams({
      client_id: transaction.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.verifier,
      f: "json"
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const message = data.error?.error_description || data.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!data.access_token) throw new Error("The token response did not contain an access_token.");

    return {
      accessToken: data.access_token,
      username: data.username || "",
      expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000),
      receivedAt: Date.now(),
      portalUrl: transaction.portalUrl,
      clientId: transaction.clientId,
      mode: transaction.mode
    };
  }

  function publish(packet) {
    localStorage.setItem(RESULT_KEY, JSON.stringify(packet));

    try {
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage({ type: "arcgis-popup-lab7-oauth-result", packet });
        channel.close();
      }
    } catch { /* optional path */ }

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: "arcgis-popup-lab7-oauth-result", packet },
          window.location.origin
        );
      }
    } catch { /* optional path */ }
  }

  async function run() {
    const query = new URLSearchParams(window.location.search);
    const oauthError = query.get("error");
    const oauthDescription = query.get("error_description");
    if (oauthError) {
      show(`ArcGIS authorization failed: ${oauthDescription || oauthError}`, "bad");
      return;
    }

    const code = query.get("code");
    const returnedState = query.get("state");
    if (!code) {
      show("No authorization code was supplied to the callback page.", "bad");
      return;
    }

    const transaction = readTransaction();
    if (!transaction) {
      show(
        "The OAuth transaction was not available in this browser profile. This usually means ArcGIS Pro opened sign-in in a separate browser context. Return to Lab 7 and use the iframe redirect fallback.",
        "bad"
      );
      return;
    }
    if (returnedState !== transaction.state) {
      show("OAuth state validation failed. The response was rejected.", "bad");
      return;
    }
    if (Date.now() - Number(transaction.createdAt || 0) > 15 * 60 * 1000) {
      show("The OAuth transaction is more than 15 minutes old. Start sign-in again.", "bad");
      return;
    }

    show("Authorization code received. Exchanging it for an access token…", "info");
    try {
      const packet = await exchangeCode(transaction, code);
      publish(packet);
      localStorage.removeItem(TX_KEY);
      show(`Sign-in completed for ${packet.username || "the ArcGIS user"}. Returning to Lab 7…`, "good");

      if (transaction.mode === "redirect") {
        window.setTimeout(() => window.location.replace(appendReturnMarker(transaction.returnUrl)), 500);
      } else {
        window.setTimeout(() => {
          window.close();
          show("Sign-in completed. This window may now be closed manually.", "good");
        }, 700);
      }
    } catch (error) {
      show(`Token exchange failed: ${error.message}`, "bad");
    }
  }

  run();
})();
