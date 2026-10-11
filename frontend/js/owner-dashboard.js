/**
 * AquaTracker — Station Owner Dashboard Logic (owner-dashboard.js)
 *
 * Purely a management console. No customer-facing logic.
 */

(function (global) {
  "use strict";

  let currentUser = null;
  let currentSection = 'overview';
  let selectedPeriod = "7d";
  let ordersFilter = null;
  const inventoryReorderAt = { caps: 30, seals: 15, bottles: 4 };
  const inventoryLabels = { caps: "Sanitary caps", seals: "Bottle seals", bottles: "Refill bottles" };

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
    if (normalized.includes("reject") || normalized.includes("cancel") || normalized.includes("expired")) return "slate";
    if (normalized.includes("out for delivery")) return "out-for-delivery";
    if (normalized.includes("deliver") || normalized.includes("complete") || normalized === "active" || normalized === "approved") return "completed";
    if (normalized.includes("prepar") || normalized.includes("progress") || normalized.includes("ready") || normalized.includes("scheduled")) return "out-for-delivery";
    if (normalized.includes("pending") || normalized.includes("new")) return "pending";
    return "blue";
  }

  function formatDate(value) {
    if (!value) return "Date not recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function sectionHero(eyebrow, title, description, tone = "amber") {
    return `
      <section class="section-hero ${tone} dashboard-hero">
        <span class="eyebrow">${eyebrow}</span>
        <h2>${title}</h2>
        <p>${description}</p>
      </section>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function periodWindow(period = selectedPeriod, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "today") {
      return { start: today, end: now, previousStart: new Date(today.getTime() - 86400000), previousEnd: today };
    }
    if (period === "7d" || period === "30d") {
      const days = period === "7d" ? 7 : 30;
      const start = new Date(today.getTime() - (days - 1) * 86400000);
      return {
        start, end: now,
        previousStart: new Date(start.getTime() - days * 86400000),
        previousEnd: start,
      };
    }
    return { start: new Date(0), end: now, previousStart: null, previousEnd: null };
  }

  function dateInWindow(value, start, end) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  }

  function isRevenueOrder(order) {
    const status = String(order.status || "").toLowerCase();
    return !status.includes("cancel") &&
      (status === "paid" || status === "delivered" || String(order.paymentStatus || "").toLowerCase() === "paid");
  }

  function getRevenue(order) {
    const total = Number(order.total);
    return isRevenueOrder(order) && Number.isFinite(total) ? total : 0;
  }

  function getFulfillment(order) {
    return String(order.fulfillment || order.fulfillmentType || "").toLowerCase();
  }

  function isLowStock(item, quantity) {
    const threshold = inventoryReorderAt[String(item).toLowerCase()];
    return threshold !== undefined && Number(quantity) <= threshold;
  }

  function isWaitingOrder(order) {
    return ["new", "new order", "preparing"].includes(String(order.status || "").toLowerCase());
  }

  function metricComparison(current, previous, hasPrevious, label) {
    if (!hasPrevious || previous === 0) return "No prior data yet";
    const change = Math.round(((current - previous) / previous) * 100);
    const direction = change > 0 ? "+" : "";
    const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
    return `<span class="${tone}">${direction}${change}% vs ${label}</span>`;
  }

  function widgetError(name, error) {
    console.error(`Error rendering overview ${name}:`, error);
    return `<div class="overview-widget-error" role="status">Couldn't load ${escapeHtml(name)}.</div>`;
  }

  async function renderOverviewHero() {
    try {
      const settings = await global.AquaOwner.fetchSettings();
      const now = new Date();
      const hour = now.getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      const firstName = String(currentUser.name || "there").trim().split(/\s+/)[0];
      const stationName = settings?.name || currentUser.station || "your station";
      const status = getStationStatus(settings?.hours, now);
      return `
        <section class="section-hero amber dashboard-hero overview-hero">
          <div><span class="eyebrow">Station command center</span>
          <h2>${escapeHtml(greeting)}, ${escapeHtml(firstName)}</h2>
          <p>${escapeHtml(stationName)} · ${now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p></div>
          <span class="station-status-chip ${status.open ? "is-open" : "is-closed"}"><span></span>${escapeHtml(status.label)}</span>
        </section>`;
    } catch (error) {
      return widgetError("station greeting", error);
    }
  }

  function getStationStatus(hours, now) {
    const dayRange = String(hours || "").match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*[-–]\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i);
    const times = String(hours || "").match(/\d{1,2}(?::\d{2})?\s*[AP]M/gi) || [];
    if (!dayRange || times.length < 2) return { open: false, label: "Hours not set" };
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const fromDay = days.findIndex(day => day.toLowerCase() === dayRange[1].toLowerCase());
    const throughDay = days.findIndex(day => day.toLowerCase() === dayRange[2].toLowerCase());
    const today = now.getDay();
    const dayOpen = fromDay <= throughDay
      ? today >= fromDay && today <= throughDay
      : today >= fromDay || today <= throughDay;
    const parseTime = value => {
      const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!match) return null;
      let hour = Number(match[1]) % 12;
      if (match[3].toUpperCase() === "PM") hour += 12;
      return hour * 60 + Number(match[2] || 0);
    };
    const start = parseTime(times[0]);
    const end = parseTime(times[1]);
    const minute = now.getHours() * 60 + now.getMinutes();
    const withinHours = start <= end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
    const open = dayOpen && withinHours;
    return { open, label: open ? "Open now" : "Closed now" };
  }

  function renderQuickActions() {
    return `
      <nav class="overview-quick-actions" aria-label="Station quick actions">
        <button class="button small amber" type="button" data-overview-action="section:promotions">＋ Add Promotion</button>
        <button class="button small outline" type="button" data-overview-action="section:pricing">₱ Update Prices</button>
        <button class="button small outline" type="button" data-overview-action="section:staff-approvals">♙ Review Staff Requests</button>
        <button class="button small outline" type="button" data-overview-action="section:station-settings">◷ Edit Station Hours</button>
      </nav>`;
  }

  async function renderOverviewStats() {
    try {
      const orders = await global.AquaOwner.fetchOrders();
      const window = periodWindow();
      const current = orders.filter(order => dateInWindow(order.createdAt, window.start, window.end));
      const previous = window.previousStart
        ? orders.filter(order => dateInWindow(order.createdAt, window.previousStart, new Date(window.previousEnd.getTime() - 1)))
        : [];
      const currentPaid = current.filter(isRevenueOrder);
      const previousPaid = previous.filter(isRevenueOrder);
      const currentRevenue = current.reduce((sum, order) => sum + getRevenue(order), 0);
      const previousRevenue = previous.reduce((sum, order) => sum + getRevenue(order), 0);
      const currentCustomers = new Set(current.map(order => order.userId || order.customerName).filter(Boolean)).size;
      const previousCustomers = new Set(previous.map(order => order.userId || order.customerName).filter(Boolean)).size;
      const currentPending = current.filter(isWaitingOrder).length;
      const previousPending = previous.filter(isWaitingOrder).length;
      const periodLabel = selectedPeriod === "today" ? "today" : selectedPeriod === "7d" ? "last 7 days" : selectedPeriod === "30d" ? "last 30 days" : "all time";
      const comparisonLabel = selectedPeriod === "today" ? "yesterday" : selectedPeriod === "7d" ? "last week" : "prior 30 days";
      const orderLabel = selectedPeriod === "today" ? "Orders Today" : "Total Orders";
      const cards = [
        { title: "Total Revenue", value: `₱${currentRevenue.toLocaleString()}`, comparison: metricComparison(currentRevenue, previousRevenue, previousPaid.length > 0, comparisonLabel), icon: "₱", action: "orders:all", tone: "" },
        { title: orderLabel, value: current.length, comparison: metricComparison(current.length, previous.length, previous.length > 0, comparisonLabel), icon: "▤", action: "orders:all", tone: "amber" },
        { title: "Unique Customers", value: currentCustomers, comparison: metricComparison(currentCustomers, previousCustomers, previousCustomers > 0, comparisonLabel), icon: "♙", action: "section:customers", tone: "blue" },
        { title: "Average Order Value", value: currentPaid.length ? `₱${(currentRevenue / currentPaid.length).toFixed(2)}` : "₱0.00", comparison: metricComparison(currentPaid.length ? currentRevenue / currentPaid.length : 0, previousPaid.length ? previousRevenue / previousPaid.length : 0, previousPaid.length > 0, comparisonLabel), icon: "↗", action: "orders:all", tone: "" },
        { title: "Pending Orders", value: currentPending, comparison: metricComparison(currentPending, previousPending, previous.length > 0, comparisonLabel), icon: "◷", action: "orders:queue", tone: "amber" },
      ];
      return `
        <section class="overview-stats-widget" aria-labelledby="overview-stats-title">
          <div class="overview-section-toolbar"><div><span class="eyebrow">Performance</span><h3 id="overview-stats-title">Your station at a glance</h3></div>
            <label class="period-selector">Period <select id="overview-period" aria-label="Performance period">
              <option value="today" ${selectedPeriod === "today" ? "selected" : ""}>Today</option>
              <option value="7d" ${selectedPeriod === "7d" ? "selected" : ""}>7 days</option>
              <option value="30d" ${selectedPeriod === "30d" ? "selected" : ""}>30 days</option>
              <option value="all" ${selectedPeriod === "all" ? "selected" : ""}>All time</option>
            </select></label>
          </div>
          <div class="stats overview-stats">${cards.map(card => `
            <button class="stat-card dashboard-stat-card ${card.tone}" type="button" data-overview-action="${card.action}" aria-label="${card.title}: ${card.value}. Open related section">
              <span class="stat-icon">${card.icon}</span><span class="dashboard-stat-copy"><b>${card.value}</b><small>${card.title} · ${periodLabel}</small><span class="stat-comparison">${card.comparison}</span></span>
            </button>`).join("")}
          </div>
        </section>`;
    } catch (error) {
      return widgetError("performance cards", error);
    }
  }

  async function renderNeedsAttention() {
    try {
      const [orders, approvals, inventory, subscriptions, requests] = await Promise.all([
        global.AquaOwner.fetchOrders(),
        global.AquaOwner.fetchStaffApprovals(),
        global.AquaOwner.fetchInventory(),
        global.AquaOwner.fetchSubscriptions(),
        global.AquaOwner.fetchCustomersRequests(),
      ]);
      const waiting = orders.filter(isWaitingOrder);
      const lowStock = Object.entries(inventory).filter(([name, quantity]) => isLowStock(name, quantity));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueBy = new Date(today);
      dueBy.setDate(dueBy.getDate() + 3);
      dueBy.setHours(23, 59, 59, 999);
      const dueSubscriptions = subscriptions.filter(plan => {
        const status = String(plan.status || "").toLowerCase();
        return ["active", "scheduled"].includes(status) && dateInWindow(plan.nextRefill, today, dueBy);
      });
      const openRequests = requests.filter(request => !["resolved", "closed", "complete", "completed", "cancelled"].includes(String(request.status || "").toLowerCase()));
      const items = [
        { label: "Orders waiting", count: waiting.length, detail: waiting.map(order => order.id).join(", "), action: "orders:queue" },
        { label: "Staff approvals", count: approvals.length, detail: "Pending staff applications", action: "section:staff-approvals" },
        { label: "Low-stock items", count: lowStock.length, detail: lowStock.map(([name, amount]) => `${inventoryLabels[name] || name.replace(/[-_]/g, " ")} (${amount})`).join(", "), action: "section:inventory" },
        { label: "Subscriptions due in 3 days", count: dueSubscriptions.length, detail: "Upcoming recurring deliveries", action: "section:subscriptions" },
        { label: "Open customer requests", count: openRequests.length, detail: "Requests needing a response", action: "section:customer-requests" },
      ];
      const count = items.reduce((sum, item) => sum + item.count, 0);
      return `<section class="glass-panel dashboard-panel attention-panel">
        <div class="dashboard-panel-heading"><div><span class="eyebrow">Action center</span><h3>Needs attention</h3></div><span class="pill ${count ? "pending" : "completed"}">${count ? `${count} to review` : "All clear"}</span></div>
        ${count ? `<div class="attention-list">${items.filter(item => item.count > 0).map(item => `
          <button class="attention-row" type="button" data-overview-action="${item.action}">
            <span class="attention-count">${item.count}</span><span class="attention-copy"><strong>${item.label}</strong><small>${escapeHtml(item.detail || "Take a look when you can.")}</small></span><span aria-hidden="true">›</span>
          </button>`).join("")}
          ${waiting.length ? `<button class="button small amber" type="button" data-overview-action="orders:queue">Open order queue</button>` : ""}
        </div>` : `<div class="all-caught-up"><span>✓</span><strong>All caught up</strong><p>Nothing needs your attention right now.</p></div>`}
      </section>`;
    } catch (error) {
      return widgetError("Needs Attention", error);
    }
  }

  function getPeriodOrders(orders) {
    const window = periodWindow();
    return orders.filter(order => dateInWindow(order.createdAt, window.start, window.end));
  }

  async function renderRevenueChart() {
    try {
      const orders = getPeriodOrders(await global.AquaOwner.fetchOrders()).filter(order => getRevenue(order) > 0);
      if (!orders.length) return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Paid & delivered</span><h3>Revenue over time</h3></div></div><div class="chart-empty">Not enough data yet</div></section>`;
      const buckets = new Map();
      orders.forEach(order => {
        const date = new Date(order.createdAt);
        const key = selectedPeriod === "today"
          ? `${date.getHours().toString().padStart(2, "0")}`
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const label = selectedPeriod === "today"
          ? `${key}:00`
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const bucket = buckets.get(key) || { label, value: 0 };
        bucket.value += getRevenue(order);
        buckets.set(key, bucket);
      });
      const entries = [...buckets.entries()].sort(([first], [second]) => first.localeCompare(second)).slice(-14).map(([, value]) => [value.label, value.value]);
      const maximum = Math.max(...entries.map(([, value]) => value), 1);
      const barWidth = 620 / entries.length;
      const bars = entries.map(([label, value], index) => {
        const height = Math.max(4, (value / maximum) * 128);
        const x = index * barWidth + barWidth * 0.18;
        return `<rect x="${x}" y="${145 - height}" width="${barWidth * 0.58}" height="${height}" rx="5" class="revenue-bar"><title>${escapeHtml(label)} · ₱${value.toFixed(2)}</title></rect>`;
      }).join("");
      const labels = entries.map(([label], index) => `<text x="${index * barWidth + barWidth / 2}" y="165" text-anchor="middle">${escapeHtml(label)}</text>`).join("");
      return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Paid & delivered</span><h3>Revenue over time</h3></div><span class="chart-caption">${entries.length} ${selectedPeriod === "today" ? "hours" : "days"}</span></div>
        <svg class="revenue-chart" viewBox="0 0 620 180" role="img" aria-label="Revenue bars by date; hover a bar for details"><line x1="0" y1="145" x2="620" y2="145" class="chart-axis"/>${bars}${labels}</svg></section>`;
    } catch (error) {
      return widgetError("revenue chart", error);
    }
  }

  async function renderStatusChart() {
    try {
      const orders = getPeriodOrders(await global.AquaOwner.fetchOrders());
      const groups = [
        ["New", order => ["new", "new order"].includes(String(order.status || "").toLowerCase()), "status-new"],
        ["Preparing", order => String(order.status || "").toLowerCase().includes("prepar"), "status-preparing"],
        ["Ready for pickup", order => String(order.status || "").toLowerCase().includes("ready"), "status-ready"],
        ["Out for delivery", order => String(order.status || "").toLowerCase().includes("out for delivery"), "status-delivery"],
        ["Delivered", order => ["delivered", "complete", "completed"].includes(String(order.status || "").toLowerCase()), "status-delivered"],
        ["Cancelled", order => String(order.status || "").toLowerCase().includes("cancel"), "status-cancelled"],
      ];
      if (!orders.length) return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Fulfillment</span><h3>Orders by status</h3></div></div><div class="chart-empty">Not enough data yet</div></section>`;
      const counts = groups.map(([, matches]) => orders.filter(matches).length);
      const otherCount = Math.max(0, orders.length - counts.reduce((sum, value) => sum + value, 0));
      if (otherCount) groups.push(["Other", () => false, "status-other"]);
      if (otherCount) counts.push(otherCount);
      return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Fulfillment</span><h3>Orders by status</h3></div><span class="chart-caption">${orders.length} orders</span></div>
        <div class="status-segments" role="img" aria-label="${groups.map(([label], index) => `${label}: ${counts[index]}`).join(", ")}">${groups.map(([label, , tone], index) => counts[index] ? `<span class="${tone}" style="width:${counts[index] / orders.length * 100}%" title="${label}: ${counts[index]}"></span>` : "").join("")}</div>
        <div class="chart-legend">${groups.map(([label, , tone], index) => `<span><i class="${tone}"></i>${label}<b>${counts[index]}</b></span>`).join("")}</div></section>`;
    } catch (error) {
      return widgetError("order status chart", error);
    }
  }

  async function renderFulfillmentChart() {
    try {
      const orders = getPeriodOrders(await global.AquaOwner.fetchOrders());
      if (!orders.length) return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Fulfillment mix</span><h3>Delivery vs pickup</h3></div></div><div class="chart-empty">Not enough data yet</div></section>`;
      const delivery = orders.filter(order => getFulfillment(order) === "delivery").length;
      const pickup = orders.filter(order => getFulfillment(order) === "pickup").length;
      const total = delivery + pickup;
      return `<section class="glass-panel dashboard-panel chart-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Fulfillment mix</span><h3>Delivery vs pickup</h3></div></div>
        ${total ? `<div class="fulfillment-bar"><span class="fulfillment-delivery" style="width:${delivery / total * 100}%" title="Delivery: ${delivery}"></span><span class="fulfillment-pickup" style="width:${pickup / total * 100}%" title="Pickup: ${pickup}"></span></div>
          <div class="fulfillment-labels"><span>Delivery <b>${delivery} · ${Math.round(delivery / total * 100)}%</b></span><span>Pickup <b>${pickup} · ${Math.round(pickup / total * 100)}%</b></span></div>` : `<div class="chart-empty">Not enough data yet</div>`}
      </section>`;
    } catch (error) {
      return widgetError("fulfillment chart", error);
    }
  }

  async function renderRecentOrders() {
    try {
      const orders = [...await global.AquaOwner.fetchOrders()]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
      return `<section class="glass-panel dashboard-panel recent-orders-panel">
        <div class="dashboard-panel-heading"><div><span class="eyebrow">Latest activity</span><h3>Recent orders</h3></div>
          <button class="button small outline" type="button" data-overview-action="orders:all">View all</button></div>
        ${orders.length ? `<div class="activity-list">${orders.map(order => {
          const normalized = String(order.status || "").toLowerCase();
          const fulfillment = getFulfillment(order);
          const nextStatus = ["new", "new order"].includes(normalized) ? "Preparing"
            : normalized === "preparing" ? (fulfillment === "delivery" ? "Out for delivery" : "Ready for Pickup")
              : null;
          return `<article class="activity-row">
            <span class="activity-icon">${fulfillment === "pickup" ? "⌂" : "↗"}</span>
            <div class="activity-copy"><strong>${escapeHtml(order.customerName || "Customer")} · ${Number(order.gallons || 0)} gal</strong><small>${escapeHtml(order.id)} · ${formatDate(order.createdAt)} · ${fulfillment === "pickup" ? "Pickup" : "Delivery"}</small></div>
            <div class="activity-meta"><span class="pill ${statusClass(order.status)}">${escapeHtml(order.status || "New")}</span><strong>₱${Number(order.total || 0).toFixed(2)}</strong>${nextStatus ? `<button class="button tiny outline" type="button" data-overview-action="advance" data-order-id="${escapeHtml(order.id)}" data-next-status="${nextStatus}">${nextStatus === "Preparing" ? "Mark preparing" : nextStatus === "Out for delivery" ? "Mark out for delivery" : "Mark ready"}</button>` : ""}</div>
          </article>`;
        }).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">▤</span><strong>No order activity yet</strong><p>New station orders will appear here.</p></div>`}
      </section>`;
    } catch (error) {
      return widgetError("recent orders", error);
    }
  }

  async function switchSection(sectionId, keepOrdersFilter = false) {
    currentSection = sectionId;
    if (sectionId !== "orders" || !keepOrdersFilter) ordersFilter = null;
    window.location.hash = sectionId;
    document.querySelectorAll('#side-nav button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    const main = document.getElementById('main-content');
    const title = document.getElementById('view-title');
    const eyebrow = document.getElementById('view-eyebrow');
    main.innerHTML = `<div class="empty-state">Loading data…</div>`;

    if (!currentUser) {
      console.error("Owner Dashboard Error: currentUser is not initialized.");
      main.innerHTML = `<div class="empty-state">Error: User session not found. Please log in again.</div>`;
      return;
    }

    try {
      if (sectionId === 'overview') {
        eyebrow.textContent = 'Business Overview';
        title.textContent = 'Station Performance';
        await renderOverview(main);
      } else if (sectionId === 'orders') {
        eyebrow.textContent = 'Order Oversight';
        title.textContent = 'Order Management';
        await renderOrders(main);
      } else if (sectionId === 'staff-approvals') {
        eyebrow.textContent = 'Staff Management';
        title.textContent = 'Personnel';
        await renderStaff(main);
      } else if (sectionId === 'subscriptions') {
        eyebrow.textContent = 'Recurring Plans';
        title.textContent = 'Station Subscriptions';
        await renderSubscriptions(main);
      } else if (sectionId === 'customers') {
        eyebrow.textContent = 'Customer Relationships';
        title.textContent = 'Station Customers';
        await renderCustomers(main);
      } else if (sectionId === 'promotions') {
        eyebrow.textContent = 'Station Marketing';
        title.textContent = 'Promotions';
        await renderPromotions(main);
      } else if (sectionId === 'pricing') {
        eyebrow.textContent = 'Pricing & Products';
        title.textContent = 'Rate Settings';
        await renderPricing(main);
      } else if (sectionId === 'station-settings') {
        eyebrow.textContent = 'Station Profile';
        title.textContent = 'Business Settings';
        await renderSettings(main);
      } else if (sectionId === 'inventory') {
        eyebrow.textContent = 'Station Supplies';
        title.textContent = 'Inventory';
        await renderInventory(main);
      } else if (sectionId === 'customer-requests') {
        eyebrow.textContent = 'Customer Support';
        title.textContent = 'Customer Requests';
        await renderCustomerRequests(main);
      } else if (sectionId === 'profile') {
        eyebrow.textContent = 'Account';
        title.textContent = 'Owner Profile';
        await renderProfile(main);
      }
    } catch (err) {
      console.error(`Critical error rendering section ${sectionId}:`, err);
      main.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderOverview(container) {
    try {
      const [hero, quickActions, stats, attention, revenueChart, statusChart, fulfillmentChart, recentOrders] = await Promise.all([
        renderOverviewHero(),
        renderQuickActions(),
        renderOverviewStats(),
        renderNeedsAttention(),
        renderRevenueChart(),
        renderStatusChart(),
        renderFulfillmentChart(),
        renderRecentOrders(),
      ]);
      container.innerHTML = `
        ${hero}
        ${quickActions}
        ${stats}
        ${attention}
        <div class="overview-chart-grid">${revenueChart}${statusChart}${fulfillmentChart}</div>
        ${recentOrders}
      `;
      container.onclick = async event => {
        const button = event.target.closest("[data-overview-action]");
        if (!button) return;
        const [type, value] = button.dataset.overviewAction.split(":");
        if (type === "section") await switchSection(value);
        else if (type === "orders") await openOrders(value);
        else if (type === "advance") await advanceOverviewOrder(button.dataset.orderId, button.dataset.nextStatus);
      };
      container.onchange = async event => {
        if (event.target.id !== "overview-period") return;
        selectedPeriod = event.target.value;
        await renderOverview(container);
      };
    } catch (err) {
      console.error("Error rendering overview:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderInventory(container) {
    try {
      const inventory = await global.AquaOwner.fetchInventory();
      const items = Object.entries(inventory);
      container.innerHTML = `${sectionHero(`Station supplies · ${escapeHtml(currentUser.station)}`, "Inventory levels", "Review stock for the items your station uses every day.")}
        <section class="glass-panel dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Stock on hand</span><h3>Inventory items</h3></div><span class="pill blue">${items.length} items</span></div>
        ${items.length ? `<div class="inventory-summary-grid">${items.map(([name, quantity]) => `<article class="glass-card inventory-summary-card"><span class="eyebrow">${escapeHtml(inventoryLabels[name] || name.replace(/[-_]/g, " "))}</span><strong>${Number(quantity)}</strong><span class="pill ${isLowStock(name, quantity) ? "pending" : "completed"}">${isLowStock(name, quantity) ? "Low stock" : "In stock"}</span></article>`).join("")}</div>` : `<div class="empty-state dashboard-empty"><strong>No inventory recorded</strong></div>`}</section>`;
    } catch (error) {
      container.innerHTML = widgetError("inventory", error);
    }
  }

  async function renderCustomerRequests(container) {
    try {
      const requests = await global.AquaOwner.fetchCustomersRequests();
      const open = requests.filter(request => !["resolved", "closed", "complete", "completed", "cancelled"].includes(String(request.status || "").toLowerCase()));
      container.innerHTML = `${sectionHero(`Customer support · ${escapeHtml(currentUser.station)}`, "Customer requests", "Follow up on questions and delivery instructions from your customers.")}
        <section class="glass-panel dashboard-panel"><div class="dashboard-panel-heading"><div><span class="eyebrow">Open requests</span><h3>Requests needing a response</h3></div><span class="pill ${open.length ? "pending" : "completed"}">${open.length} open</span></div>
        ${open.length ? `<div class="dashboard-card-list">${open.map(request => `<article class="glass-card request-summary-card"><div><strong>${escapeHtml(request.subject || request.customerName || "Customer request")}</strong><p>${escapeHtml(request.message || "")}</p></div><span class="pill pending">${escapeHtml(request.status)}</span></article>`).join("")}</div>` : `<div class="empty-state dashboard-empty"><strong>No open customer requests</strong><p>New customer requests will appear here.</p></div>`}</section>`;
    } catch (error) {
      container.innerHTML = widgetError("customer requests", error);
    }
  }

  async function openOrders(filter = "all") {
    ordersFilter = filter === "all" ? null : filter;
    await switchSection("orders", true);
  }

  async function openOrderQueue() {
    await openOrders("queue");
  }

  async function advanceOverviewOrder(orderId, nextStatus) {
    try {
      await global.AquaOwner.updateOrderStatus(orderId, nextStatus);
      showToast(`Order ${orderId} moved to ${nextStatus}.`);
      if (currentSection === "overview") await renderOverview(document.getElementById("main-content"));
      else await renderOrders(document.getElementById("main-content"));
    } catch (error) {
      console.error("Error updating order from Overview:", error);
      showToast("Couldn't update the order. Please try again.");
    }
  }

  async function renderOrders(container) {
    try {
      const allOrders = await global.AquaOwner.fetchOrders();
      const orders = ordersFilter === "queue" ? allOrders.filter(isWaitingOrder) : ordersFilter === "today"
        ? allOrders.filter(order => dateInWindow(order.createdAt, periodWindow("today").start, periodWindow("today").end))
        : allOrders;
      const pending = allOrders.filter(isWaitingOrder);
      const revenue = allOrders.reduce((sum, order) => sum + getRevenue(order), 0);
      container.innerHTML = `
        ${sectionHero(`Order oversight · ${currentUser.station}`, "Every refill, in one place.", "Follow incoming station orders, monitor fulfillment, and keep every customer informed.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">▤</span><div><b>${orders.length}</b><small>Total orders</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${pending.length}</b><small>Needs attention</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">₱</span><div><b>₱${revenue.toLocaleString()}</b><small>Order value</small></div></div>
        </div>
        <section class="glass-panel dashboard-panel">
          <div class="dashboard-panel-heading">
            <div><span class="eyebrow">Fulfillment</span><h3>${ordersFilter === "queue" ? "New & preparing orders" : ordersFilter === "today" ? "Today's orders" : "All station orders"}</h3></div>
            <span class="pill blue">${orders.length} records</span>
          </div>
          ${orders.length ? `<div class="table-wrap dashboard-table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                ${orders.map(o => `
                  <tr>
                    <td><strong class="dashboard-order-id">${o.id}</strong><small class="table-subtext">${o.gallons || 0} gallon${Number(o.gallons) === 1 ? "" : "s"} · ${o.fulfillment || "refill"}</small></td>
                    <td><span class="dashboard-customer-cell"><span class="dashboard-avatar small">${getInitials(o.customerName)}</span>${o.customerName || 'Customer'}</span></td>
                    <td>${formatDate(o.createdAt)}</td>
                    <td><strong>₱${Number(o.total || 0).toFixed(2)}</strong></td>
                    <td><span class="pill ${statusClass(o.status)}">${o.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">📦</span><strong>No orders to show</strong><p>Station orders will appear here when customers place them.</p></div>`}
        </section>
      `;
    } catch (err) {
      console.error("Error rendering orders:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderStaff(container) {
    try {
      const approvals = await global.AquaOwner.fetchStaffApprovals();
      const staff = await global.AquaOwner.fetchStaff();
      container.innerHTML = `
        ${sectionHero(`Team operations · ${currentUser.station}`, "Build a team that keeps water moving.", "Review new applications and stay connected with the people behind every refill.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">♙</span><div><b>${staff.length}</b><small>Team members</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${approvals.length}</b><small>Applications to review</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">✓</span><div><b>${staff.filter(member => String(member.status).toLowerCase() === "active").length}</b><small>Active on your team</small></div></div>
        </div>
        <div class="dashboard-split dashboard-split-wide">
          <section class="glass-panel dashboard-panel">
            <div class="dashboard-panel-heading"><div><span class="eyebrow">Action queue</span><h3>Team applications</h3></div><span class="pill ${approvals.length ? "pending" : "completed"}">${approvals.length} pending</span></div>
            ${approvals.length ? `<div class="dashboard-card-list">${approvals.map(applicant => `
              <article class="glass-card dashboard-person-card approval-card">
                <div class="dashboard-person-main"><span class="dashboard-avatar">${getInitials(applicant.name)}</span><div><strong>${applicant.name}</strong><span>${applicant.email}</span></div></div>
                <div class="approval-details"><span class="eyebrow">Requested assignment</span><strong>${applicant.station || currentUser.station}</strong><small>Submitted ${formatDate(applicant.createdAt || applicant.submittedAt)}</small></div>
                <div class="dashboard-card-actions"><button class="button small amber" data-approval-id="${escapeHtml(applicant.id)}" data-decision="approve">Approve</button><button class="button small outline" data-approval-id="${escapeHtml(applicant.id)}" data-decision="reject">Reject</button></div>
              </article>
            `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">✓</span><strong>All caught up</strong><p>There are no staff applications waiting for review.</p></div>`}
          </section>
          <section class="glass-panel dashboard-panel">
            <div class="dashboard-panel-heading"><div><span class="eyebrow">On the floor</span><h3>Your team</h3></div><span class="pill blue">${staff.length} members</span></div>
            ${staff.length ? `<div class="dashboard-card-list">${staff.map(member => `
              <article class="dashboard-team-row"><span class="dashboard-avatar">${getInitials(member.name)}</span><div class="dashboard-person-copy"><strong>${member.name}</strong><span>${member.email || "Station team member"}</span></div><span class="pill ${statusClass(member.status)}">${member.status || "Active"}</span></article>
            `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">♙</span><strong>Your team starts here</strong><p>Approved staff members will appear in this roster.</p></div>`}
          </section>
        </div>
      `;
      container.onclick = async event => {
        const button = event.target.closest("[data-approval-id]");
        if (button) await handleStaffDecision(button.dataset.approvalId, button.dataset.decision);
      };
    } catch (err) {
      console.error("Error rendering staff:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function handleStaffDecision(id, decision) {
    try {
      const res = await global.AquaOwner.decideStaffApproval(id, decision);
      showToast(`Staff member ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await renderStaff(document.getElementById('main-content'));
    } catch (err) {
      console.error("Error deciding staff approval:", err);
      showToast("Failed to update staff status.");
    }
  }

  async function renderPricing(container) {
    try {
      const pricing = await global.AquaOwner.fetchPricing();

      // Grouping configuration: maps product IDs to their water type and details
      const productGroups = {
        "Mineral Water": {
          caption: "Same water, different container styles — choose which style(s) your station offers.",
          products: {
            "5-gallon-slim": { label: "5-Gallon Slim", detail: "Lightweight slim container", icon: "◉" },
            "5-gallon-round": { label: "5-Gallon Round", detail: "Classic family-size refill", icon: "◉" },
          }
        }
      };

      const entries = Object.entries(pricing || {});

      let html = `
        ${sectionHero(`Rates & products · ${currentUser.station}`, "Clear pricing, confident customers.", "Manage refill rates by product and keep your station's offers up to date.")}
        <div class="dashboard-panel-heading dashboard-section-heading">
          <div><span class="eyebrow">Product catalog</span><h3>Refill rates</h3></div>
          <span class="pill blue">${entries.length} products</span>
        </div>`;

      if (entries.length) {
        // Render grouped sections
        for (const [type, group] of Object.entries(productGroups)) {
          const typeProducts = Object.entries(group.products);

          html += `
            <div class="pricing-group-section" style="margin-top: 24px;">
              <div class="group-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                  <h3 style="margin: 0; color: var(--navy);">${type}</h3>
                  <p style="margin: 0; font-size: 13px; color: #64807b;">${group.caption}</p>
                </div>
                <button class="button small outline" disabled title="Multi-type support coming soon">＋ Add Water Type</button>
              </div>
              <div class="dashboard-product-grid">`;

          typeProducts.forEach(([prod, info]) => {
            const price = pricing[prod];
            if (price !== undefined) {
              html += `
                <article class="glass-card dashboard-product-card">
                  <span class="dashboard-product-icon">${info.icon}</span>
                  <span class="eyebrow">Station product</span>
                  <h3>${info.label}</h3>
                  <p>${info.detail}</p>
                  <label class="dashboard-price-label" for="price-${prod}">Price per refill</label>
                  <div class="dashboard-price-editor">
                    <span>₱</span>
                    <input type="number" min="0" step="0.01" value="${price}" id="price-${prod}">
                    <button class="button small amber" data-price-product="${prod}">Save rate</button>
                  </div>
                </article>`;
            }
          });

          html += `</div></div>`;
        }
      } else {
        html += `<div class="empty-state dashboard-empty"><span class="empty-state-icon">₱</span><strong>No products configured</strong><p>Add station rates to show your refill products.</p></div>`;
      }

      container.innerHTML = html;
      container.onclick = async event => {
        const button = event.target.closest("[data-price-product]");
        if (button) await savePrice(button.dataset.priceProduct);
      };
    } catch (err) {
      console.error("Error rendering pricing:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function savePrice(product) {
    const newPrice = document.getElementById(`price-${product}`).value;
    try {
      const currentPricing = await global.AquaOwner.fetchPricing();
      currentPricing[product] = parseFloat(newPrice);
      await global.AquaOwner.updatePricing(currentPricing);
      showToast(`Updated ${product} price to ₱${newPrice}.`);
    } catch (err) {
      console.error("Error saving price:", err);
      showToast("Failed to save price.");
    }
  }

  async function renderSettings(container) {
    try {
      const settings = await global.AquaOwner.fetchSettings();
      container.innerHTML = `
        ${sectionHero(`Station profile · ${currentUser.station}`, "A welcoming local refill hub.", "Keep your station's public details accurate so nearby customers know where to find you.")}
        <section class="glass-panel dashboard-form-panel">
          <div class="dashboard-panel-heading"><div><span class="eyebrow">Public listing</span><h3>Station details</h3></div><span class="pill completed">Visible to customers</span></div>
          <div class="dashboard-form-grid">
            <fieldset class="dashboard-form-section">
              <legend><span>01</span>Basic information</legend>
              <label for="set-name">Station name</label><input type="text" id="set-name" value="${settings.name}">
              <label for="set-address">Street address</label><input type="text" id="set-address" value="${settings.address}">
            </fieldset>
            <fieldset class="dashboard-form-section">
              <legend><span>02</span>Hours & contact</legend>
              <label for="set-hours">Operating hours</label><input type="text" id="set-hours" value="${settings.hours}">
              <label for="set-contact">Contact number</label><input type="text" id="set-contact" value="${settings.contact}">
            </fieldset>
          </div>
          <div class="dashboard-form-footer"><p>Changes update your station profile on this device.</p><button class="button amber" data-save-settings>Save station details</button></div>
        </section>
      `;
      container.onclick = async event => {
        if (event.target.closest("[data-save-settings]")) await saveSettings();
      };
    } catch (err) {
      console.error("Error rendering settings:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderSubscriptions(container) {
    try {
      const subscriptions = await global.AquaOwner.fetchSubscriptions();
      const activeCount = subscriptions.filter(plan => String(plan.status).toLowerCase() === "active").length;
      container.innerHTML = `
        ${sectionHero(`Recurring refill plans · ${currentUser.station}`, "Reliable refills, right on schedule.", "A clear view of the regulars who count on your station every week.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">↻</span><div><b>${subscriptions.length}</b><small>Total plans</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">✓</span><div><b>${activeCount}</b><small>Active subscribers</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">▣</span><div><b>${subscriptions.reduce((sum, plan) => sum + Number(plan.gallons || 0), 0)}</b><small>Gallons per cycle</small></div></div>
        </div>
        ${subscriptions.length ? `<div class="dashboard-card-grid">${subscriptions.map(plan => `
          <article class="glass-card dashboard-subscription-card">
            <div class="dashboard-subscription-top"><span class="dashboard-product-icon">↻</span><span class="pill ${statusClass(plan.status)}">${plan.status}</span></div>
            <span class="eyebrow">${plan.planName || "Recurring refill plan"}</span>
            <h3>${plan.customerName || "Station customer"}</h3>
            <p>${plan.gallons} gallons · ${plan.frequency} · ₱${Number(plan.estimatedTotal).toFixed(2)} per refill</p>
            <div class="dashboard-detail-row"><span>Next delivery</span><strong>${formatDate(plan.nextRefill)}</strong></div>
          </article>
        `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">↻</span><strong>No subscription plans yet</strong><p>Recurring customers will appear here when they start a plan.</p></div>`}`;
    } catch (err) {
      console.error("Error rendering subscriptions:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderCustomers(container) {
    try {
      const customers = await global.AquaOwner.fetchCustomers();
      container.innerHTML = `
        ${sectionHero(`Customer relationships · ${currentUser.station}`, "Get to know your regulars.", "Every refill builds a relationship. See who visits, what they order, and when they last stopped by.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">♙</span><div><b>${customers.length}</b><small>Station customers</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">▤</span><div><b>${customers.reduce((sum, customer) => sum + Number(customer.orderCount || 0), 0)}</b><small>Orders placed</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">₱</span><div><b>₱${customers.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0).toLocaleString()}</b><small>Customer spend</small></div></div>
        </div>
        ${customers.length ? `<div class="dashboard-card-grid">${customers.map(customer => `
          <article class="glass-card dashboard-customer-card">
            <div class="dashboard-person-main"><span class="dashboard-avatar">${getInitials(customer.name)}</span><div><span class="eyebrow">Station regular</span><h3>${customer.name}</h3></div></div>
            <div class="dashboard-customer-metrics"><div><strong>${customer.orderCount}</strong><span>orders</span></div><div><strong>₱${Number(customer.totalSpent).toFixed(2)}</strong><span>total spend</span></div></div>
            <div class="dashboard-detail-row"><span>Last refill</span><strong>${formatDate(customer.lastOrder)}</strong></div>
          </article>
        `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">♙</span><strong>No customers yet</strong><p>Customers who order from your station will appear here.</p></div>`}`;
    } catch (err) {
      console.error("Error rendering customers:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderPromotions(container) {
    try {
      const promotions = await global.AquaOwner.fetchPromotions();
      container.innerHTML = `
        ${sectionHero(`Station marketing · ${currentUser.station}`, "Give neighbors a reason to come back.", "Highlight the offers that make every refill a little more rewarding.")}
        <div class="dashboard-promo-toolbar"><div><span class="eyebrow">Offers & rewards</span><h3>Your promotions</h3><p>Track offer status and customer redemptions.</p></div><button type="button" class="button amber" disabled title="Promotion creation is not enabled yet">＋ Create promotion</button></div>
        ${promotions.length ? `<div class="dashboard-card-grid">${promotions.map(promotion => `
          <article class="glass-card dashboard-promotion-card">
            <div class="dashboard-promotion-banner"><span class="dashboard-promotion-mark">✦</span><span class="pill ${statusClass(promotion.status)}">${promotion.status}</span></div>
            <span class="eyebrow">Station offer</span><h3>${promotion.name}</h3><p>${promotion.detail}</p>
            <div class="dashboard-promo-code"><span>Offer code</span><strong>${promotion.code || "No code assigned"}</strong></div>
            <div class="dashboard-detail-row"><span>Redemptions</span><strong>${Number(promotion.redemptions || 0)}</strong></div>
            <div class="dashboard-detail-row"><span>Offer period</span><strong>${promotion.expiry ? `Until ${formatDate(promotion.expiry)}` : "No expiry date set"}</strong></div>
          </article>
        `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">✦</span><strong>No promotions configured</strong><p>When your station launches an offer, it will appear here.</p></div>`}`;
    } catch (err) {
      console.error("Error rendering promotions:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderProfile(container) {
    try {
      const profileKey = `aquatracker_profile_owner_${currentUser.email}`;
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(profileKey) || "{}");
      } catch (err) {
        console.error("Invalid saved owner profile:", err);
        localStorage.removeItem(profileKey);
      }
      const owner = { ...currentUser, ...saved };
      const memberSince = owner.createdAt ? formatDate(owner.createdAt) : "Station owner";
      const initials = getInitials(owner.name);
      container.innerHTML = `
        ${sectionHero("Account & preferences", `Your AquaTracker profile, ${owner.name.split(" ")[0]}.`, "Manage the details your team and station use to recognize you.")}
        <div class="dashboard-profile-layout">
          <aside class="glass-panel dashboard-profile-summary">
            <span class="dashboard-avatar profile-avatar">${initials}</span>
            <span class="pill completed">Station owner</span>
            <h3>${owner.name}</h3><p>${owner.email}</p>
            <div class="dashboard-profile-divider"></div>
            <div class="dashboard-detail-row"><span>Station</span><strong>${owner.station || currentUser.station}</strong></div>
            <div class="dashboard-detail-row"><span>Member since</span><strong>${memberSince}</strong></div>
            <div class="dashboard-detail-row"><span>Account</span><strong>Verified session</strong></div>
          </aside>
          <section class="glass-panel dashboard-profile-form">
            <div class="dashboard-panel-heading"><div><span class="eyebrow">Personal details</span><h3>Profile information</h3></div><span class="dashboard-product-icon">♙</span></div>
            <p class="dashboard-form-intro">Your station identity is managed by the account signed in to this browser.</p>
            <div class="dashboard-profile-fields">
              <label for="owner-profile-name">Full name<input id="owner-profile-name" value="${owner.name}"></label>
              <label for="owner-profile-phone">Phone number<input id="owner-profile-phone" value="${owner.phone || ''}" placeholder="Add a contact number"></label>
              <label>Email address<input value="${owner.email}" readonly></label>
              <label>Role<input value="Station owner" readonly></label>
            </div>
            <div class="dashboard-form-footer"><p>Changes to your profile are saved on this device.</p><button class="button amber" onclick="saveOwnerProfile()">Save profile</button></div>
          </section>
        </div>`;
    } catch (err) {
      console.error("Error rendering owner profile:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  function saveOwnerProfile() {
    const profileKey = `aquatracker_profile_owner_${currentUser.email}`;
    const profile = {
      name: document.getElementById('owner-profile-name').value.trim(),
      phone: document.getElementById('owner-profile-phone').value.trim(),
    };
    if (!profile.name) {
      showToast("Name is required.");
      return;
    }
    localStorage.setItem(profileKey, JSON.stringify(profile));
    showToast("Prototype profile saved on this device.");
  }

  async function saveSettings() {
    const settings = {
      name: document.getElementById('set-name').value,
      address: document.getElementById('set-address').value,
      hours: document.getElementById('set-hours').value,
      contact: document.getElementById('set-contact').value,
    };
    try {
      await global.AquaOwner.updateSettings(settings);
      showToast("Station profile updated successfully.");
    } catch (err) {
      console.error("Error saving settings:", err);
      showToast("Failed to save settings.");
    }
  }

  // Bridge to HTML's DOMContentLoaded: allow HTML to set the user object
  global.setUser = function(user) {
    currentUser = user;
    global.AquaOwner.setOwner(user);
  };
  global.showToast = global.showToast || function(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  };

  global.switchSection = switchSection;
  global.openOrders = openOrders;
  global.openOrderQueue = openOrderQueue;
  global.advanceOverviewOrder = advanceOverviewOrder;
  global.saveOwnerProfile = saveOwnerProfile;
  global.handleStaffDecision = handleStaffDecision;
  global.savePrice = savePrice;
  global.saveSettings = saveSettings;
})(typeof window !== "undefined" ? window : this);
