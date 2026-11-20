(function () {
  "use strict";

  const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOffIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7a10.8 10.8 0 0 0 4.1-.8"/></svg>';

  function updateButton(input, button) {
    const visible = input.type === "text";
    button.innerHTML = visible ? eyeIcon : eyeOffIcon;
    button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(visible));
    button.title = visible ? "Hide password" : "Show password";
  }

  function addToggle(input) {
    if (input.dataset.passwordToggleReady === "true") return;

    const adjacentToggle = input.nextElementSibling?.matches("button[data-toggle-password]")
      ? input.nextElementSibling
      : null;
    let wrapper = input.closest(".password-toggle-wrap, .password-input");
    if (wrapper) {
      wrapper.classList.add("password-toggle-wrap");
    } else {
      wrapper = document.createElement("span");
      wrapper.className = "password-toggle-wrap";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    let button = wrapper.querySelector("[data-toggle-password]");
    if (!button && adjacentToggle) {
      button = adjacentToggle;
      wrapper.appendChild(button);
    }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "password-toggle-button";
      button.setAttribute("data-toggle-password", "");
      wrapper.appendChild(button);
    }

    button.type = "button";
    button.classList.add("password-toggle-button");
    if (input.id) button.setAttribute("aria-controls", input.id);
    else button.removeAttribute("aria-controls");
    button.addEventListener("click", function () {
      input.type = input.type === "password" ? "text" : "password";
      updateButton(input, button);
    });

    input.dataset.passwordToggleReady = "true";
    updateButton(input, button);
  }

  function scan(root) {
    if (root instanceof Element && root.matches('input[type="password"]')) {
      addToggle(root);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('input[type="password"]').forEach(addToggle);
    }
  }

  scan(document);

  if (document.body && "MutationObserver" in window) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
