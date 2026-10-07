/**
 * AquaTracker — Station Staff Dashboard Logic (staff-dashboard.js)
 *
 * Purely an operational console. No customer-facing logic.
 */

(function (global) {
  "use strict";

  let currentUser = null;
  let currentSection = 'station-orders';

  // =====================================================================
  // COUNTER-PICKUP QUEUE  (prototype-only bits are marked PROTOTYPE)
  //
  // New pickup orders are detected by polling the order data stub on an
  // interval. In production this would be a websocket/SSE subscription from
  // the orders API, and the polling block below would be deleted. Seen-order
  // ids and the mute preference are kept in localStorage so a reload never
  // re-alerts staff about orders they already have on screen.
  // =====================================================================
  const PICKUP_POLL_MS = 5000;
  const PICKUP_SEEN_KEY = "aquatracker_staff_seen_pickups";
  const PICKUP_SOUND_KEY = "aquatracker_staff_pickup_sound";

  let pickupPollTimer = null;
  let pickupPollBusy = false;
  let pickupSignature = null;   // last rendered queue shape, to avoid DOM churn
  let pickupSoundMuted = false;
  let pickupAudioCtx = null;

  /** localStorage key holding the ids this staff member has already seen. */
  function pickupSeenKey() {
    return `${PICKUP_SEEN_KEY}_${(currentUser && currentUser.email) || "unknown"}`;
  }

  function getSeenPickupIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(pickupSeenKey()) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Corrupt pickup seen-list, resetting:", err);
      localStorage.removeItem(pickupSeenKey());
      return [];
    }
  }

  function markPickupSeen(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    const merged = Array.from(new Set([...getSeenPickupIds(), ...ids]));
    localStorage.setItem(pickupSeenKey(), JSON.stringify(merged));
  }

  function isPickupMuted() {
    return localStorage.getItem(PICKUP_SOUND_KEY) === "off";
  }

  function setPickupMuted(muted) {
    pickupSoundMuted = muted;
    localStorage.setItem(PICKUP_SOUND_KEY, muted ? "off" : "on");
  }

  /**
   * Two-tone chime built with the Web Audio API so the prototype ships with no
   * audio asset to load. Silently no-ops if audio is blocked by the browser.
   */
  function playPickupChime() {
    if (pickupSoundMuted) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!pickupAudioCtx) pickupAudioCtx = new AudioCtor();
      if (pickupAudioCtx.state === "suspended") pickupAudioCtx.resume();

      const start = pickupAudioCtx.currentTime;
      [[880, 0], [1174.66, 0.13]].forEach(([frequency, offset]) => {
        const osc = pickupAudioCtx.createOscillator();
        const gain = pickupAudioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3);
        osc.connect(gain).connect(pickupAudioCtx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + 0.32);
      });
    } catch (err) {
      console.warn("Pickup alert sound unavailable:", err);
    }
  }

  function togglePickupSound() {
    setPickupMuted(!pickupSoundMuted);
    if (!pickupSoundMuted) playPickupChime();   // audible confirmation of "unmuted"
    renderPickupOrders(document.getElementById('main-content'));
    showToast(pickupSoundMuted ? "Pickup alerts muted." : "Pickup alerts sound on.");
  }

  /** Shape of the queue, so we only re-render when something actually moved. */
  function pickupQueueSignature(orders) {
    return orders
      .map(o => `${o.id}:${o.status}:${o.paymentStatus}`)
      .sort()
      .join("|");
  }

  function isPickupOpen(order) {
    return !['completed', 'cancelled'].includes(String(order.status || '').toLowerCase());
  }

  /** PROTOTYPE: replace with a websocket/SSE push when a real API exists. */
  function startPickupPolling() {
    stopPickupPolling();
    pickupPoll();
    pickupPollTimer = setInterval(pickupPoll, PICKUP_POLL_MS);
  }

  function stopPickupPolling() {
    if (pickupPollTimer) {
      clearInterval(pickupPollTimer);
      pickupPollTimer = null;
    }
  }

  /** PROTOTYPE: one poll tick - detect arrivals, refresh badge, refresh view. */
  async function pickupPoll() {
    if (!currentUser || pickupPollBusy) return;
    pickupPollBusy = true;
    try {
      const orders = await global.AquaDashboard.fetchPickupOrders(currentUser.stationId);
      const seen = getSeenPickupIds();

      // Anything not yet on this device's seen-list is genuinely new.
      const fresh = orders.filter(order => !seen.includes(order.id));
      if (fresh.length) {
        markPickupSeen(fresh.map(order => order.id));
        // Stagger so two orders arriving together are readable, not stacked.
        fresh.forEach((order, index) => {
          setTimeout(() => {
            playPickupChime();
            showToast(`New pickup order from ${order.customerName || "a customer"}`);
          }, index * 1400);
        });
      }

      updatePickupNavBadge(orders);

      // Only repaint the open view when the queue actually changed.
      const signature = pickupQueueSignature(orders);
      if (currentSection === 'pickup-orders' && signature !== pickupSignature) {
        renderPickupOrders(document.getElementById('main-content'));
      }
    } catch (err) {
      console.error("Pickup poll failed:", err);
    } finally {
      pickupPollBusy = false;
    }
  }

  function updatePickupNavBadge(orders) {
    const button = document.querySelector('#side-nav button[data-section="pickup-orders"]');
    if (!button) return;
    const seen = getSeenPickupIds();
    const unseenOpen = (orders || []).filter(
      order => isPickupOpen(order) && !seen.includes(order.id)
    ).length;

    let badge = button.querySelector('.nav-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-count-badge';
      button.appendChild(badge);
    }
    badge.textContent = unseenOpen > 0 ? String(unseenOpen) : '';
    badge.classList.toggle('show', unseenOpen > 0);
  }

  function relativeTime(value) {
    const then = new Date(value);
    if (Number.isNaN(then.getTime())) return "";
    const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} hr ago` : then.toLocaleDateString();
  }

  function pickupStatusLabel(status) {
    const labels = {
      new: 'New',
      preparing: 'Preparing',
      ready_for_pickup: 'Ready for pickup',
      completed: 'Collected & paid',
      cancelled: 'Cancelled',
    };
    return labels[status] || String(status || '').replace(/_/g, ' ');
  }

  function pickupStatusClass(status) {
    const map = {
      new: 'new',
      preparing: 'preparing',
      ready_for_pickup: 'ready_for_pickup',
      completed: 'completed',
      cancelled: 'cancelled',
    };
    return map[status] || 'slate';
  }

  /** Action buttons available for a given pickup status. */
  function pickupActionsHtml(order) {
    const id = escapeHtml(order.id);
    const actions = [];
    if (order.status === 'new') {
      actions.push(`<button class="button small amber" onclick="advancePickupOrder('${id}','preparing')">Start preparing</button>`);
    }
    if (order.status === 'preparing') {
      actions.push(`<button class="button small amber" onclick="advancePickupOrder('${id}','ready_for_pickup')">Mark ready for pickup</button>`);
    }
    if (order.status === 'ready_for_pickup') {
      actions.push(`<button class="button small" onclick="collectPickupPayment('${id}')">Mark as paid &amp; completed</button>`);
    }
    if (['new', 'preparing', 'ready_for_pickup'].includes(order.status)) {
      actions.push(`<button class="button small outline" onclick="cancelPickupOrder('${id}')">Cancel</button>`);
    }
    return actions.length
      ? `<div class="pickup-card-actions">${actions.join('')}</div>`
      : '';
  }

  function renderPickupCardHtml(order, seenIds) {
    const isUnseen = !seenIds.includes(order.id) && isPickupOpen(order);
    const isUnpaid = order.paymentStatus !== 'paid';
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsSummary = items.length
      ? items.map(item => `${escapeHtml(item.label || 'Refill')} × ${escapeHtml(String(item.count ?? order.gallons ?? 0))}`).join(', ')
      : `${escapeHtml(String(order.gallons || 0))} gal refill`;

    return `
      <article class="glass-card pickup-card ${isUnseen ? 'pickup-card-new' : ''}">
        <div class="dashboard-queue-top">
          <div class="dashboard-person-main">
            <span class="dashboard-avatar small">${escapeHtml(getInitials(order.customerName))}</span>
            <div>
              <span class="eyebrow">${escapeHtml(order.id)} · placed ${escapeHtml(relativeTime(order.createdAt))}</span>
              <h3>${escapeHtml(order.customerName || 'Customer')}</h3>
            </div>
          </div>
          <div class="pickup-card-flags">
            ${isUnseen ? '<span class="pickup-new-flag">New</span>' : ''}
            ${isUnpaid ? '<span class="pill unpaid">Pay at counter – unpaid</span>' : '<span class="pill completed">Paid</span>'}
            <span class="pill ${pickupStatusClass(order.status)}">${escapeHtml(pickupStatusLabel(order.status))}</span>
          </div>
        </div>

        <div class="pickup-card-details">
          <div class="dashboard-detail-row"><span>Items</span><strong>${itemsSummary}</strong></div>
          <div class="dashboard-detail-row"><span>Contact</span><strong>${escapeHtml(order.contactPhone || 'Not provided')}</strong></div>
          <div class="dashboard-detail-row"><span>Amount to collect</span><strong>₱${Number(order.total || 0).toFixed(2)}</strong></div>
        </div>

        ${order.notes ? `<p class="pickup-card-notes"><strong>Customer note:</strong> ${escapeHtml(order.notes)}</p>` : ''}

        ${pickupActionsHtml(order)}
      </article>`;
  }

  async function renderPickupOrders(container) {
    if (!container) return;
    try {
      const orders = await global.AquaDashboard.fetchPickupOrders(currentUser.stationId);
      const seenIds = getSeenPickupIds();
      pickupSignature = pickupQueueSignature(orders);

      const open = orders.filter(isPickupOpen);
      const unseen = open.filter(order => !seenIds.includes(order.id));
      const readyNow = open.filter(order => order.status === 'ready_for_pickup');
      const unpaidTotal = open
        .filter(order => order.paymentStatus !== 'paid')
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

      container.innerHTML = `
        ${sectionHero(
          `Counter service · ${currentUser.station}`,
          'Prepare refills for customers on their way.',
          'Every pickup order here is paid in cash when the customer reaches your counter.'
        )}

        <div class="pickup-toolbar">
          <label class="pickup-sound-toggle">
            <input type="checkbox" ${pickupSoundMuted ? '' : 'checked'} onchange="togglePickupSound()">
            <span>${pickupSoundMuted ? '🔕 Alerts muted' : '🔔 Alert sound on'}</span>
          </label>
          <small class="pickup-poll-note">Auto-refreshes every ${PICKUP_POLL_MS / 1000}s</small>
        </div>

        <div class="stats three">
          <div class="stat-card ${unseen.length ? 'amber' : ''}"><span class="stat-icon">◉</span><div><b>${open.length}</b><small>Open pickups</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${readyNow.length}</b><small>Ready to collect</small></div></div>
          <div class="stat-card"><span class="stat-icon">₱</span><div><b>₱${unpaidTotal.toFixed(2)}</b><small>To collect</small></div></div>
        </div>

        <section class="glass-panel dashboard-panel">
          <div class="dashboard-panel-heading">
            <div><span class="eyebrow">Counter queue</span><h3>Pickup orders</h3></div>
            <span class="pill ${unseen.length ? 'pending' : 'completed'}">${unseen.length ? `${unseen.length} new` : 'All caught up'}</span>
          </div>

          ${open.length ? `
            <div class="dashboard-order-list">
              ${open.map(order => renderPickupCardHtml(order, seenIds)).join('')}
            </div>
            <div class="dashboard-stage-track pickup-stage-track">${['New', 'Preparing', 'Ready', 'Collected'].map((stage, index) => `<div class="dashboard-stage ${index === 0 ? 'done' : ''}"><span>${index + 1}</span><small>${stage}</small></div>`).join('')}</div>
          ` : `
            <div class="empty-state dashboard-empty">
              <span class="empty-state-icon">✓</span>
              <strong>No pickup orders waiting</strong>
              <p>Counter pickup orders for ${escapeHtml(currentUser.station || 'this station')} will appear here the moment a customer places one.</p>
            </div>
          `}

          ${orders.length > open.length ? `
            <p class="dashboard-supporting-note">${orders.length - open.length} finished pickup order${orders.length - open.length === 1 ? '' : 's'} in history.</p>
          ` : ''}
        </section>`;
    } catch (err) {
      console.error("Error rendering staff pickup orders:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load pickup orders — see console</div>`;
    }
  }

  async function advancePickupOrder(orderId, nextStatus) {
    try {
      await global.AquaDashboard.updatePickupOrderStatus(orderId, nextStatus);
      // Acting on an order is what marks it as seen, so the alerts clear.
      markPickupSeen(orderId);
      await renderPickupOrders(document.getElementById('main-content'));
      showToast(`Order ${orderId} is now ${pickupStatusLabel(nextStatus).toLowerCase()}.`);
    } catch (err) {
      console.error("Could not update pickup order:", err);
      showToast("That status change could not be saved. Please try again.");
    }
  }

  async function cancelPickupOrder(orderId) {
    try {
      await global.AquaDashboard.updatePickupOrderStatus(orderId, 'cancelled');
      markPickupSeen(orderId);
      await renderPickupOrders(document.getElementById('main-content'));
      showToast(`Order ${orderId} was cancelled.`);
    } catch (err) {
      console.error("Could not cancel pickup order:", err);
      showToast("That order could not be cancelled. Please try again.");
    }
  }

  async function collectPickupPayment(orderId) {
    try {
      const order = await global.AquaDashboard.markPickupOrderPaid(orderId);
      if (!order) return showToast("That order was not found for this station.");
      markPickupSeen(orderId);
      await renderPickupOrders(document.getElementById('main-content'));
      showToast(`₱${Number(order.total || 0).toFixed(2)} collected. Order ${orderId} completed.`);
    } catch (err) {
      console.error("Could not collect pickup payment:", err);
      showToast("Payment could not be recorded. Please try again.");
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(name) {
    return String(name || "AquaTracker")
      .trim()
      .split(/\s+/)
      .map(part => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function statusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("deliver") || normalized.includes("complete") || normalized === "active" || normalized === "approved" || normalized === "present") return "completed";
    if (normalized.includes("prepar") || normalized.includes("progress") || normalized.includes("ready") || normalized.includes("scheduled")) return "out-for-delivery";
    if (normalized.includes("reject") || normalized.includes("cancel") || normalized.includes("absent")) return "slate";
    if (normalized.includes("pending") || normalized.includes("new") || normalized.includes("open")) return "pending";
    return "blue";
  }

  function formatDate(value) {
    if (!value) return "Date not recorded";
    const rawValue = String(value);
    const date = new Date(rawValue.length === 10 ? `${rawValue}T00:00:00` : rawValue);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function sectionHero(eyebrow, title, description) {
    return `
      <section class="section-hero blue dashboard-hero">
        <span class="eyebrow">${eyebrow}</span>
        <h2>${title}</h2>
        <p>${description}</p>
      </section>`;
  }

  async function switchSection(sectionId) {
    currentSection = sectionId;
    window.location.hash = sectionId;
    document.querySelectorAll('#side-nav button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    const main = document.getElementById('main-content');
    const title = document.getElementById('view-title');
    const eyebrow = document.getElementById('view-eyebrow');
    main.innerHTML = `<div class="empty-state">Loading data…</div>`;

    if (sectionId === 'station-orders') {
      eyebrow.textContent = 'Order Queue';
      title.textContent = 'Fulfillment Pipeline';
      await renderOrderQueue(main);
    } else if (sectionId === 'pickup-orders') {
      eyebrow.textContent = 'Counter Service';
      title.textContent = 'Pickup Orders';
      await renderPickupOrders(main);
    } else if (sectionId === 'inventory') {
      eyebrow.textContent = 'Stock Control';
      title.textContent = 'Inventory Management';
      await renderInventory(main);
    } else if (sectionId === 'my-shifts') {
      eyebrow.textContent = 'Attendance';
      title.textContent = 'Shift History';
      await renderShifts(main);
    } else if (sectionId === 'customer-requests') {
      eyebrow.textContent = 'Support';
      title.textContent = 'Customer Requests';
      await renderRequests(main);
    } else if (sectionId === 'profile') {
      eyebrow.textContent = 'Account';
      title.textContent = 'Staff Profile';
      await renderProfile(main);
    }
  }

  async function renderOrderQueue(container) {
    try {
      const orders = await global.AquaCommon.fetchOrders(currentUser.stationId);
      const active = orders.filter(o => !['completed', 'delivered', 'cancelled'].includes(String(o.status).toLowerCase()));
      const completed = orders.length - active.length;
      const stages = ["New", "Preparing", "Ready", "Completed"];
      container.innerHTML = `
        ${sectionHero(`Station operations · ${currentUser.station}`, "Good work starts with a smooth handoff.", "Move each refill through the station with clear next steps and a customer-ready finish.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">▤</span><div><b>${orders.length}</b><small>Orders today</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${active.length}</b><small>In the queue</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${completed}</b><small>Completed</small></div></div>
        </div>
        <section class="glass-panel dashboard-panel">
          <div class="dashboard-panel-heading"><div><span class="eyebrow">Fulfillment pipeline</span><h3>Station orders</h3></div><span class="pill ${active.length ? "pending" : "completed"}">${active.length} active</span></div>
          ${active.length ? `<div class="dashboard-order-list">${active.map(order => {
            const status = String(order.status || "").toLowerCase();
            const stageIndex = status.includes("deliver") || status.includes("complete") ? 3 : status.includes("ready") ? 2 : status.includes("prepar") || status.includes("confirm") ? 1 : 0;
            const currentLabel = stages[stageIndex];
            return `
              <article class="glass-card dashboard-queue-card">
                <div class="dashboard-queue-top">
                  <div class="dashboard-person-main"><span class="dashboard-avatar small">${getInitials(order.customerName)}</span><div><span class="eyebrow">${order.id} · ${order.gallons || 0} gallon${Number(order.gallons) === 1 ? "" : "s"}</span><h3>${order.customerName || "Customer"}</h3></div></div>
                  <span class="pill ${statusClass(order.status)}">${order.status}</span>
                </div>
                <div class="dashboard-stage-track">${stages.map((stage, index) => `<div class="dashboard-stage ${index < stageIndex ? "done" : ""} ${index === stageIndex ? "current" : ""}"><span>${index < stageIndex ? "✓" : index + 1}</span><small>${stage}</small></div>`).join("")}</div>
                <div class="dashboard-queue-footer"><span>${order.fulfillment === "delivery" ? "Delivery" : "Station pickup"} · ₱${Number(order.total || 0).toFixed(2)}</span><button class="button small amber" onclick="advanceOrder('${order.id}')">${currentLabel === "Ready" ? "Complete order →" : "Advance order →"}</button></div>
              </article>`;
          }).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">✓</span><strong>Queue is clear</strong><p>New station orders will appear here as they come in.</p></div>`}
        </section>
        ${completed ? `<p class="dashboard-supporting-note">You have ${completed} completed order${completed === 1 ? "" : "s"} in your station history.</p>` : ""}
      `;
    } catch (err) {
      console.error("Error rendering staff order queue:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderInventory(container) {
    try {
      const inv = await global.AquaStaff.fetchInventory(currentUser.stationId);
      const inventoryItems = [
        { key: "caps", label: "Sanitary caps", unit: "caps", icon: "◉", reorderAt: 30 },
        { key: "seals", label: "Bottle seals", unit: "seals", icon: "⬡", reorderAt: 15 },
        { key: "bottles", label: "Refill bottles", unit: "bottles", icon: "♢", reorderAt: 4 },
      ];
      const lowStock = inventoryItems.filter(item => Number(inv[item.key] || 0) <= item.reorderAt).length;
      container.innerHTML = `
        ${sectionHero(`Stock control · ${currentUser.station}`, "Stay ahead of every refill.", "A clear view of station essentials, with quick adjustments when stock comes in.")}
        <div class="stats three"><div class="stat-card"><span class="stat-icon">▦</span><div><b>${inventoryItems.length}</b><small>Tracked supplies</small></div></div><div class="stat-card amber"><span class="stat-icon">!</span><div><b>${lowStock}</b><small>Items to restock</small></div></div><div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${inventoryItems.length - lowStock}</b><small>Stock healthy</small></div></div></div>
        <div class="dashboard-panel-heading dashboard-section-heading"><div><span class="eyebrow">Station essentials</span><h3>Inventory levels</h3></div><span class="pill ${lowStock ? "pending" : "completed"}">${lowStock ? `${lowStock} need attention` : "All stock healthy"}</span></div>
        <div class="dashboard-inventory-grid">${inventoryItems.map(item => {
          const quantity = Number(inv[item.key] || 0);
          const level = quantity < item.reorderAt / 2 ? "critical" : quantity <= item.reorderAt ? "low" : "healthy";
          const levelLabel = level === "critical" ? "Critical" : level === "low" ? "Low stock" : "In good shape";
          const barWidth = Math.min(100, Math.max(5, quantity / (item.reorderAt * 3) * 100));
          return `
            <article class="glass-card dashboard-inventory-card ${level}">
              <div class="dashboard-inventory-top"><span class="dashboard-product-icon">${item.icon}</span><span class="pill ${level === "healthy" ? "completed" : level === "low" ? "pending" : "slate"}">${levelLabel}</span></div>
              <span class="eyebrow">On hand</span><h3>${item.label}</h3>
              <div class="dashboard-stock-quantity"><strong>${quantity}</strong><span>${item.unit}</span></div>
              <div class="dashboard-stock-bar" role="meter" aria-valuenow="${quantity}" aria-valuemin="0" aria-valuemax="${item.reorderAt * 3}" aria-label="${item.label} stock level"><span style="width:${barWidth}%"></span></div>
              <div class="dashboard-detail-row"><span>Restock threshold</span><strong>${item.reorderAt} ${item.unit}</strong></div>
              <button class="button small outline" onclick="adjustStock('${item.key}', 1)">＋ Receive ${item.unit}</button>
            </article>`;
        }).join("")}</div>`;
    } catch (err) {
      console.error("Error rendering staff inventory:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderShifts(container) {
    try {
      const shifts = global.AquaCommon.read(global.AquaCommon.STORE_KEYS.SHIFTS, [])
        .filter(shift => shift.stationId === currentUser.stationId);
      container.innerHTML = `
        ${sectionHero(`Attendance · ${currentUser.station}`, "Your week, at a glance.", "See what's coming up and keep your station team in sync.")}
        <div class="stats three"><div class="stat-card"><span class="stat-icon">▦</span><div><b>${shifts.length}</b><small>Scheduled shifts</small></div></div><div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${shifts.filter(shift => String(shift.date) === new Date().toISOString().slice(0, 10)).length}</b><small>On today's rota</small></div></div><div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${shifts.filter(shift => shift.attendance).length}</b><small>Attendance logged</small></div></div></div>
        <section class="glass-panel dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Your station rota</span><h3>My shifts</h3></div><span class="pill blue">${shifts.length} scheduled</span></div>
          ${shifts.length ? `<div class="dashboard-shift-grid">${shifts.map(shift => `
            <article class="glass-card dashboard-shift-card">
              <div class="dashboard-shift-date"><span class="dashboard-product-icon">◷</span><span class="pill ${statusClass(shift.status)}">${shift.status}</span></div>
              <span class="eyebrow">${formatDate(shift.date)}</span><h3>${shift.start} <span>to</span> ${shift.end}</h3>
              <div class="dashboard-detail-row"><span>Station</span><strong>${currentUser.station}</strong></div>
              <div class="dashboard-detail-row"><span>Attendance</span><strong>${shift.attendance || "Not clocked in yet"}</strong></div>
            </article>`).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">◷</span><strong>No shifts assigned</strong><p>Your upcoming station rota will appear here.</p></div>`}
        </section>`;
    } catch (err) {
      console.error("Error rendering staff shifts:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderRequests(container) {
    try {
      const requests = global.AquaCommon.read(global.AquaCommon.STORE_KEYS.REQUESTS, [])
        .filter(request => request.stationId === currentUser.stationId);
      container.innerHTML = `
        ${sectionHero(`Customer care · ${currentUser.station}`, "A little help goes a long way.", "Keep track of customer questions and follow-ups from one station inbox.")}
        <div class="stats three"><div class="stat-card"><span class="stat-icon">✉</span><div><b>${requests.length}</b><small>Total requests</small></div></div><div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${requests.filter(request => ["open", "pending"].includes(String(request.status).toLowerCase())).length}</b><small>Need follow-up</small></div></div><div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${requests.filter(request => ["resolved", "closed", "completed"].includes(String(request.status).toLowerCase())).length}</b><small>Resolved</small></div></div></div>
        <section class="glass-panel dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Station inbox</span><h3>Customer requests</h3></div><span class="pill ${requests.length ? "pending" : "completed"}">${requests.length} requests</span></div>
          ${requests.length ? `<div class="dashboard-card-list">${requests.map(request => `
            <article class="glass-card dashboard-request-card">
              <div class="dashboard-request-top"><div class="dashboard-person-main"><span class="dashboard-avatar">${getInitials(request.customerName)}</span><div><span class="eyebrow">${request.id} · ${request.type || "Customer request"}</span><h3>${request.subject}</h3></div></div><span class="pill ${statusClass(request.status)}">${request.status}</span></div>
              <p>${request.message}</p>
              <div class="dashboard-request-footer"><span>From <strong>${request.customerName}</strong></span><span>Order <strong>${request.orderId || "Not linked"}</strong></span><span>${formatDate(request.createdAt)}</span></div>
            </article>
          `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">✉</span><strong>Your inbox is clear</strong><p>Customer questions for this station will appear here.</p></div>`}
        </section>`;
    } catch (err) {
      console.error("Error rendering customer requests:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderProfile(container) {
    try {
      const profileKey = `aquatracker_profile_staff_${currentUser.email}`;
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(profileKey) || "{}");
      } catch (err) {
        console.error("Invalid saved staff profile:", err);
        localStorage.removeItem(profileKey);
      }
      const profile = { ...currentUser, ...saved };
      const memberSince = profile.createdAt
        ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : "Station team";
      container.innerHTML = `
        ${sectionHero("Account & preferences", `Welcome to your station, ${profile.name.split(" ")[0]}.`, "Keep your contact details current so your station team can reach you.")}
        <div class="dashboard-profile-layout">
          <aside class="glass-panel dashboard-profile-summary">
            <span class="dashboard-avatar profile-avatar">${getInitials(profile.name)}</span><span class="pill completed">Station staff</span>
            <h3>${profile.name}</h3><p>${profile.email}</p>
            <div class="dashboard-profile-divider"></div>
            <div class="dashboard-detail-row"><span>Station</span><strong>${profile.station || currentUser.station}</strong></div>
            <div class="dashboard-detail-row"><span>Team since</span><strong>${memberSince}</strong></div>
            <div class="dashboard-detail-row"><span>Permissions</span><strong>${(profile.permissions || []).length || "Assigned by owner"}</strong></div>
          </aside>
          <section class="glass-panel dashboard-profile-form">
            <div class="dashboard-panel-heading"><div><span class="eyebrow">Personal details</span><h3>Staff profile</h3></div><span class="dashboard-product-icon">♙</span></div>
            <p class="dashboard-form-intro">Your station assignment and access are managed by your owner.</p>
            <div class="dashboard-profile-fields">
              <label for="staff-profile-name">Full name<input id="staff-profile-name" value="${profile.name}"></label>
              <label for="staff-profile-phone">Phone number<input id="staff-profile-phone" value="${profile.phone || ''}" placeholder="Add a contact number"></label>
              <label>Email address<input value="${profile.email}" readonly></label>
              <label>Station<input value="${profile.station || currentUser.station}" readonly></label>
            </div>
            <div class="dashboard-form-footer"><p>Your personal details are saved on this device.</p><button class="button amber" onclick="saveStaffProfile()">Save profile</button></div>
          </section>
        </div>`;
    } catch (err) {
      console.error("Error rendering staff profile:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  function saveStaffProfile() {
    const profileKey = `aquatracker_profile_staff_${currentUser.email}`;
    const profile = {
      name: document.getElementById('staff-profile-name').value.trim(),
      phone: document.getElementById('staff-profile-phone').value.trim(),
    };
    if (!profile.name) return showToast("Name is required.");
    localStorage.setItem(profileKey, JSON.stringify(profile));
    showToast("Prototype profile saved on this device.");
  }

  async function advanceOrder(orderId) {
    const orders = await global.AquaCommon.fetchOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return showToast("Order was not found for this station.");
    const stages = ['New', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Delivered'];
    const current = stages.indexOf(
      order.status === 'New order' ? 'New' : order.status
    );
    const nextStatus = stages[current + 1];
    if (!nextStatus) return showToast("This order is already complete.");
    await global.AquaStaff.updateOrderStatus(orderId, nextStatus);
    await switchSection('station-orders');
  }

  async function adjustStock(item, amount) {
    await global.AquaStaff.updateInventory(currentUser.stationId, item, amount);
    switchSection('inventory');
  }

  global.setUser = function(user) {
    currentUser = user;
    pickupSoundMuted = isPickupMuted();
    // PROTOTYPE: begin watching the pickup queue for new counter orders.
    startPickupPolling();
  };
  global.showToast = global.showToast || function(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  };
  global.switchSection = switchSection;
  global.advanceOrder = advanceOrder;
  global.adjustStock = adjustStock;
  global.saveStaffProfile = saveStaffProfile;
  global.startPickupPolling = startPickupPolling;
  global.stopPickupPolling = stopPickupPolling;
  global.togglePickupSound = togglePickupSound;
  global.advancePickupOrder = advancePickupOrder;
  global.cancelPickupOrder = cancelPickupOrder;
  global.collectPickupPayment = collectPickupPayment;
})(typeof window !== "undefined" ? window : this);
