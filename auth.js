(() => {
  "use strict";

  class ArcGISAuthPanel extends EventTarget {
    constructor(host, options = {}) {
      super();
      this.host = typeof host === "string" ? document.getElementById(host) : host;
      this.portalUrl = BridgeCommon.normalizeUrl(options.portalUrl || "https://www.arcgis.com");
      this.clientId = String(options.clientId || "").trim();
      this.redirectUri = options.redirectUri || "urn:ietf:wg:oauth:2.0:oob";
      this.prefix = options.storagePrefix || "popup-live-bridge";
      this.txKey = `${this.prefix}-oauth-transaction`;
      this.tokenKey = `${this.prefix}-oauth-token`;
      this.token = this.readToken();
      this.render();
    }

    randomString(length = 64) {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    }

    async pkceChallenge(verifier) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
    }

    readToken() {
      try {
        const token = JSON.parse(sessionStorage.getItem(this.tokenKey) || "null");
        if (!token?.accessToken || Number(token.expiresAt || 0) <= Date.now() + 15000) return null;
        return token;
      } catch {
        return null;
      }
    }

    get accessToken() {
      return this.token?.accessToken || "";
    }

    get username() {
      return this.token?.username || "";
    }

    render() {
      this.host.innerHTML = `
        <details class="auth-panel" ${this.token ? "" : "open"}>
          <summary>ArcGIS sign-in <span class="auth-summary-state"></span></summary>
          <div class="auth-body">
            <p class="small-note">Uses OAuth 2.0 authorization code with PKCE and the registered out-of-band redirect. No client secret is used.</p>
            <div class="field-grid two">
              <label>Portal URL<input class="auth-portal" type="url" spellcheck="false"></label>
              <label>OAuth Client ID<input class="auth-client" type="text" spellcheck="false"></label>
            </div>
            <div class="actions">
              <button type="button" class="auth-prepare">1. Prepare sign-in</button>
              <a class="button-link good auth-open hidden" href="#" target="_blank" rel="noopener noreferrer">2. Open ArcGIS sign-in</a>
            </div>
            <label>Authorization result
              <textarea class="auth-result" rows="3" spellcheck="false" placeholder="Paste the ArcGIS approval-page URL or authorization code."></textarea>
            </label>
            <div class="actions">
              <button type="button" class="good auth-complete">3. Complete sign-in</button>
              <button type="button" class="danger auth-signout">Forget token</button>
            </div>
            <div class="status auth-status"></div>
          </div>
        </details>`;
      this.portalInput = this.host.querySelector(".auth-portal");
      this.clientInput = this.host.querySelector(".auth-client");
      this.openLink = this.host.querySelector(".auth-open");
      this.resultInput = this.host.querySelector(".auth-result");
      this.statusNode = this.host.querySelector(".auth-status");
      this.summaryState = this.host.querySelector(".auth-summary-state");
      this.portalInput.value = this.portalUrl;
      this.clientInput.value = this.clientId;
      this.host.querySelector(".auth-prepare").addEventListener("click", () => this.prepare());
      this.host.querySelector(".auth-complete").addEventListener("click", () => this.complete());
      this.host.querySelector(".auth-signout").addEventListener("click", () => this.signOut());
      this.refreshState();
    }

    setStatus(message, tone = "") {
      BridgeCommon.setStatus(this.statusNode, message, tone);
    }

    refreshState() {
      if (this.token) {
        const minutes = Math.max(0, Math.floor((this.token.expiresAt - Date.now()) / 60000));
        this.summaryState.textContent = `— ${this.token.username || "signed in"}`;
        this.setStatus(`Authenticated as ${this.token.username || "ArcGIS user"}. Approximately ${minutes} minutes remain.`, "good");
      } else {
        this.summaryState.textContent = "— not signed in";
        this.setStatus("Not signed in. Public services can still be queried if anonymous access is allowed.", "info");
      }
    }

    validate() {
      this.portalUrl = BridgeCommon.normalizeUrl(this.portalInput.value);
      this.clientId = this.clientInput.value.trim();
      const problems = [];
      if (!/^https:\/\//i.test(this.portalUrl)) problems.push("Portal URL must use HTTPS.");
      if (BridgeCommon.isPlaceholder(this.clientId)) problems.push("Replace the OAuth Client ID placeholder.");
      if (problems.length) throw new Error(problems.join(" "));
    }

    async prepare() {
      try {
        this.validate();
        const verifier = this.randomString(72);
        const challenge = await this.pkceChallenge(verifier);
        const state = this.randomString(48);
        const transaction = {
          verifier,
          state,
          clientId: this.clientId,
          portalUrl: this.portalUrl,
          redirectUri: this.redirectUri,
          createdAt: Date.now()
        };
        localStorage.setItem(this.txKey, JSON.stringify(transaction));
        const query = new URLSearchParams({
          client_id: this.clientId,
          response_type: "code",
          redirect_uri: this.redirectUri,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256"
        });
        this.openLink.href = `${this.portalUrl}/sharing/rest/oauth2/authorize?${query}`;
        this.openLink.classList.remove("hidden");
        this.resultInput.value = "";
        this.setStatus("Sign-in prepared. Open ArcGIS sign-in, then paste the approval URL or code here.", "info");
      } catch (error) {
        this.setStatus(error.message, "bad");
      }
    }

    extract(rawValue) {
      const raw = String(rawValue || "").trim();
      if (!raw) throw new Error("Paste the ArcGIS approval-page URL or authorization code.");
      let code = "";
      let returnedState = "";
      try {
        const url = new URL(raw);
        code = url.searchParams.get("code") || "";
        returnedState = url.searchParams.get("state") || "";
      } catch {
        const codeMatch = raw.match(/(?:^|[?&#\s])code=([^&#\s]+)/i);
        const stateMatch = raw.match(/(?:^|[?&#\s])state=([^&#\s]+)/i);
        code = codeMatch ? decodeURIComponent(codeMatch[1]) : raw;
        returnedState = stateMatch ? decodeURIComponent(stateMatch[1]) : "";
      }
      if (!String(code).trim()) throw new Error("No authorization code was found.");
      return { code: String(code).trim(), returnedState };
    }

    async complete() {
      try {
        const tx = JSON.parse(localStorage.getItem(this.txKey) || "null");
        if (!tx) throw new Error("No prepared PKCE transaction exists. Start with step 1.");
        if (Date.now() - Number(tx.createdAt || 0) > 15 * 60 * 1000) {
          localStorage.removeItem(this.txKey);
          throw new Error("The prepared sign-in is more than 15 minutes old. Prepare a new sign-in.");
        }
        const { code, returnedState } = this.extract(this.resultInput.value);
        if (returnedState && returnedState !== tx.state) throw new Error("The returned OAuth state does not match the prepared transaction.");
        const body = new URLSearchParams({
          client_id: tx.clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: tx.redirectUri,
          code_verifier: tx.verifier,
          f: "json"
        });
        const response = await fetch(`${tx.portalUrl}/sharing/rest/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
          cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error?.error_description || data.error?.message || `HTTP ${response.status}`);
        }
        if (!data.access_token) throw new Error("Token response did not contain an access token.");
        this.token = {
          accessToken: data.access_token,
          username: data.username || "",
          expiresAt: Date.now() + Number(data.expires_in || 0) * 1000,
          receivedAt: Date.now(),
          portalUrl: tx.portalUrl
        };
        sessionStorage.setItem(this.tokenKey, JSON.stringify(this.token));
        localStorage.removeItem(this.txKey);
        this.resultInput.value = "";
        this.refreshState();
        this.dispatchEvent(new CustomEvent("tokenchange", { detail: this.token }));
      } catch (error) {
        this.setStatus(`Sign-in failed: ${error.message}`, "bad");
      }
    }

    signOut() {
      this.token = null;
      sessionStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.txKey);
      this.openLink.classList.add("hidden");
      this.refreshState();
      this.dispatchEvent(new CustomEvent("tokenchange", { detail: null }));
    }
  }

  window.ArcGISAuthPanel = ArcGISAuthPanel;
})();
