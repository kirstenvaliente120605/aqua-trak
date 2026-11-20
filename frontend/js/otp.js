(() => {
  "use strict";

  const EMAIL_KEY = "aquatracker_otp_email";
  const TOKEN_KEY = "aquatracker_reset_token";
  const NOTICE_KEY = "aquatracker_otp_notice";
  const route = location.pathname.split("/").filter(Boolean).pop();
  const views = Array.from(document.querySelectorAll("[data-otp-view]"));
  const view = views.find(item => item.dataset.otpView === route);
  const email = sessionStorage.getItem(EMAIL_KEY) || "";

  if (!view) return;
  if (route !== "forgot-password" && !email) {
    location.replace("/auth/customer/login?error=required");
    return;
  }
  if (route === "reset-password" && !sessionStorage.getItem(TOKEN_KEY)) {
    location.replace("/auth/forgot-password");
    return;
  }

  view.hidden = false;
  document.title = `${view.querySelector("h2").textContent} · AquaTracker`;
  document.querySelectorAll("[data-otp-email]").forEach(node => { node.textContent = email; });
  const savedNotice = sessionStorage.getItem(NOTICE_KEY);
  if (savedNotice) {
    const error = view.querySelector("[data-otp-error]");
    if (error) {
      error.textContent = savedNotice;
      error.hidden = false;
    }
    sessionStorage.removeItem(NOTICE_KEY);
  }

  async function post(url, body) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
    } catch (requestError) {
      throw new Error("Network error. Check your connection and try again.");
    }

    const responseBody = await response.text();
    let result = {};
    try {
      const parsed = JSON.parse(responseBody);
      if (parsed && typeof parsed === "object") result = parsed;
    } catch {
      // The response can still be handled using its HTTP status.
    }
    if (!response.ok) {
      const fallback = response.status === 429
        ? "Too many requests. Please try again later."
        : response.status === 503
          ? "We could not process your request right now. Please try again later."
          : "Something went wrong. Please try again.";
      const error = new Error(result.error || fallback);
      error.code = result.code || "";
      throw error;
    }
    return result;
  }

  function showError(node, text) {
    node.textContent = text;
    node.hidden = !text;
  }

  function setupCodeInput(container) {
    container.innerHTML = "";
    const inputs = [];
    for (let index = 0; index < 6; index += 1) {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = index === 0 ? "one-time-code" : "off";
      input.maxLength = index === 0 ? 6 : 1;
      input.pattern = "[0-9]";
      input.setAttribute("aria-label", `Digit ${index + 1} of 6`);
      input.required = true;
      input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length > 1) {
          digits.slice(0, 6 - index).split("").forEach((digit, offset) => {
            if (inputs[index + offset]) inputs[index + offset].value = digit;
          });
          inputs[Math.min(index + digits.length, 5)].focus();
          return;
        }
        input.value = digits.slice(-1);
        if (input.value && inputs[index + 1]) inputs[index + 1].focus();
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !input.value && inputs[index - 1]) {
          inputs[index - 1].value = "";
          inputs[index - 1].focus();
          event.preventDefault();
        } else if (event.key === "ArrowLeft" && inputs[index - 1]) {
          inputs[index - 1].focus();
        } else if (event.key === "ArrowRight" && inputs[index + 1]) {
          inputs[index + 1].focus();
        }
      });
      input.addEventListener("paste", event => {
        const pasted = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        if (!pasted) return;
        event.preventDefault();
        pasted.split("").forEach((digit, position) => {
          if (inputs[position]) inputs[position].value = digit;
        });
        inputs[Math.min(pasted.length, 5)].focus();
      });
      inputs.push(input);
      container.append(input);
    }
    return {
      value: () => inputs.map(input => input.value).join(""),
      clear: () => { inputs.forEach(input => { input.value = ""; }); inputs[0].focus(); },
    };
  }

  if (route === "verify-email" || route === "reset-otp") {
    const codeForm = view.querySelector("[data-code-form]");
    const codeInput = setupCodeInput(view.querySelector("[data-otp-input]"));
    const error = view.querySelector("[data-otp-error]");
    const submit = view.querySelector("[data-code-submit]");
    const resend = view.querySelector("[data-resend]");
    const countdown = view.querySelector("[data-countdown]");
    const purpose = route === "verify-email" ? "verify_email" : "reset_password";
    const timerKey = `aquatracker_otp_resend_at_${purpose}`;
    if (!sessionStorage.getItem(timerKey)) sessionStorage.setItem(timerKey, String(Date.now() + 60000));

    function updateCountdown() {
      const seconds = Math.max(0, Math.ceil((Number(sessionStorage.getItem(timerKey)) - Date.now()) / 1000));
      resend.disabled = seconds > 0;
      resend.textContent = seconds > 0 ? `Resend code in ${seconds}s` : "Resend code";
      countdown.textContent = seconds > 0 ? `You can request another code in ${seconds}s.` : "You can request another code now.";
    }
    updateCountdown();
    window.setInterval(updateCountdown, 1000);

    codeForm.addEventListener("submit", async event => {
      event.preventDefault();
      showError(error, "");
      if (codeInput.value().length !== 6) {
        showError(error, "Enter all six digits.");
        return;
      }
      submit.disabled = true;
      try {
        if (route === "verify-email") {
          const result = await post("/auth/verify-email", { email, otp: codeInput.value() });
          sessionStorage.removeItem(EMAIL_KEY);
          sessionStorage.removeItem(TOKEN_KEY);
          location.assign(result.redirectUrl || "/");
        } else {
          const result = await post("/auth/verify-reset-otp", { email, otp: codeInput.value() });
          sessionStorage.setItem(TOKEN_KEY, result.resetToken);
          location.assign("/auth/reset-password");
        }
      } catch (requestError) {
        showError(error, requestError.message);
        codeInput.clear();
      } finally {
        submit.disabled = false;
      }
    });

    resend.addEventListener("click", async () => {
      resend.disabled = true;
      showError(error, "");
      try {
        await post("/auth/resend-otp", { email, purpose });
        sessionStorage.setItem(timerKey, String(Date.now() + 60000));
        updateCountdown();
        showError(error, "If the account can receive a code, a new one has been sent.");
      } catch (requestError) {
        if (requestError.code === "OTP_COOLDOWN") sessionStorage.setItem(timerKey, String(Date.now() + 60000));
        else resend.disabled = false;
        showError(error, requestError.message);
        updateCountdown();
      }
    });
  }

  if (route === "forgot-password") {
    const form = view.querySelector("[data-forgot-form]");
    const error = view.querySelector("[data-forgot-error]");
    const submit = view.querySelector("[data-forgot-submit]");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      showError(error, "");
      submit.disabled = true;
      try {
        const requestedEmail = form.elements.email.value.trim().toLowerCase();
        await post("/auth/forgot-password", { email: requestedEmail });
        sessionStorage.setItem(EMAIL_KEY, requestedEmail);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.setItem("aquatracker_otp_resend_at_reset_password", String(Date.now() + 60000));
        location.assign("/auth/reset-otp");
      } catch (requestError) {
        showError(error, requestError.message);
        submit.disabled = false;
      }
    });
  }

  if (route === "reset-password") {
    const form = view.querySelector("[data-reset-form]");
    const error = view.querySelector("[data-reset-error]");
    const submit = view.querySelector("[data-reset-submit]");
    view.querySelectorAll("[data-password-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", `${show ? "Hide" : "Show"} ${input.id === "new-password" ? "new password" : "confirmation password"}`);
      });
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      showError(error, "");
      const password = form.elements.newPassword.value;
      if (password.length < 8 || password.length > 128) {
        showError(error, "Password must be between 8 and 128 characters.");
        return;
      }
      if (password !== form.elements.confirmPassword.value) {
        showError(error, "Passwords do not match.");
        return;
      }
      submit.disabled = true;
      try {
        await post("/auth/reset-password", {
          email,
          resetToken: sessionStorage.getItem(TOKEN_KEY),
          newPassword: password,
        });
        sessionStorage.removeItem(EMAIL_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        location.assign("/auth/customer/login?notice=password-reset");
      } catch (requestError) {
        showError(error, requestError.message);
        if (requestError.code === "RESET_TOKEN_INVALID") {
          sessionStorage.removeItem(TOKEN_KEY);
          window.setTimeout(() => location.assign("/auth/forgot-password"), 1600);
        } else {
          submit.disabled = false;
        }
      }
    });
  }
})();
