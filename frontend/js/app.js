(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const toast = (text) => {
    let element = $("[data-toast]");
    if (!element) {
      element = document.createElement("div");
      element.className = "toast";
      element.dataset.toast = "";
      document.body.append(element);
    }
    element.textContent = text;
    element.classList.add("show");
    clearTimeout(element.hideTimer);
    element.hideTimer = setTimeout(() => element.classList.remove("show"), 2800);
  };
  const accounts = {
    customer: { email: "customer.demo@example.com", password: "CustomerDemo123!", name: "Customer Demo", subtitle: "Customer account", label: "Customer", eyebrow: "Your water, sorted.", title: "Find your next refill in a few taps.", description: "Discover trusted stations, compare plans, and keep your home stocked without the guesswork." },
    owner: { email: "owner.demo@example.com", password: "OwnerDemo123!", name: "Owner Demo", subtitle: "ClearSpring Water Hub", label: "Station owner", eyebrow: "Run a smoother station.", title: "Your station, at a glance.", description: "Stay on top of orders, subscriptions, prices, and the customers who keep coming back." },
    staff: { email: "staff.demo@example.com", password: "StaffDemo123!", name: "Staff Demo", subtitle: "Station staff", label: "Station staff", eyebrow: "Support your station team.", title: "Your station shift, at a glance.", description: "Manage assigned station work, coordinate orders, and stay connected with your owner." },
  };
  let sessionUser = null;
  const accountFor = (role) => ({ ...accounts[role], ...(sessionUser && sessionUser.role === role ? sessionUser : {}) });
  const initialsFor = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const stations = [
    ["DRINK n' REFILL Purified Water Refilling Station", "45 Sabellano St, Pagadian City", "Mon–Sat 7:30 AM–4:30 PM", "0918 962 5038", "Contact station", "Verified listing"],
    ["Ultra Pure Water Refilling Station", "Purok Bakhaw A, Brgy. Kawit", "Hours not publicly listed", "0970 488 8866", "Contact station", "Verified listing"],
    ["Waterpol Water Refilling Station", "Purok Pagang, Brgy. Kawit", "Delivery advertised", "0927 251 4246", "Contact station", "Delivery"],
    ["PG Aquamaster Water Refilling Station", "Purok Makugihon, Brgy. Bulatok", "Hours not publicly listed", "0951 312 5308", "Contact station", "Verified listing"],
    ["Aqua'Ter SMN Water Refilling Station", "Beside DXPR, San Jose District", "Delivery advertised", "0975 462 7620", "₱25 / gallon", "Best value"],
    ["PH2O Water Refilling Station", "Warlito Pulmones St, Santiago District", "Vendo available 24/7", "0985 337 4448", "Contact station", "24/7 vendo"],
    ["Alka Water Refilling Station", "Zone 11, Alta Tierra Subdivision, Tiguma", "Hours not publicly listed", "0938 686 3252", "Contact station", "Verified listing"],
  ];
  const stationCoordinates = [
    [7.8269, 123.4371],
    [7.8312, 123.4437],
    [7.8347, 123.4481],
    [7.8198, 123.4297],
    [7.8191, 123.4412],
    [7.8362, 123.4264],
    [7.8127, 123.4512],
  ];
  const orders = [["AT-1048", "Mia Santos", "2 × 5-gallon refill", "₱70.00", "Ready for pickup", "teal"], ["AT-1047", "Noah Garcia", "1 × 5-gallon refill", "₱35.00", "Processing", "orange"], ["AT-1046", "Lia Mendoza", "Monthly · 4 gallons", "₱120.00", "Completed", "slate"], ["AT-1045", "Enzo Reyes", "3 × 5-gallon refill", "₱105.00", "New order", "blue"]];
  const sectionData = {
    "find-stations": ["Station finder", "Find clean water close by.", "Search nearby refill stations by distance, operating hours, price, and availability.", [["7", "verified listings", "Pagadian City"], ["4", "delivery / pickup options", "check each station"], ["₱25", "listed starting price", "Aqua'Ter SMN"]], stations.map((item) => [item[0], `${item[1]} · ${item[2]} · ${item[3]}`, "Listed"])],
    "my-subscriptions": ["Refill plans", "Stay ahead of your next refill.", "Manage active plans, renewal dates, gallon usage, and delivery preferences.", [["1", "active plan", "Monthly essentials"], ["2 / 4", "gallons used", "this billing cycle"], ["Oct 03", "next renewal", "13 days away"]], [["Monthly essentials", "4 gallons per month · ClearSpring Water Hub", "Active"], ["Next refill", "2 gallons planned · Delivery on Oct 03", "Scheduled"], ["Payment method", "Visa ending in 2048 · Auto-renew enabled", "Verified"]]],
    "orders-history": ["Refill history", "Every refill, in one place.", "Review past orders, pickup details, receipts, and current refill status.", [["8", "completed orders", "this year"], ["1", "in progress", "ready soon"], ["₱1,240", "saved with plans", "this year"]], [["Order #AT-2048", "2 gallons · ClearSpring Water Hub · Sep 20", "Ready for pickup"], ["Order #AT-1987", "4 gallons · AquaVida Refill Station · Sep 05", "Completed"], ["Order #AT-1873", "2 gallons · BlueDrop Purified Water · Aug 18", "Completed"]]],
    rewards: ["AquaPoints", "Your refills are giving back.", "Track points earned from refills and redeem perks for your next station visit.", [["120", "points available", "ready to redeem"], ["2", "perks unlocked", "this month"], ["40", "points to next perk", "Keep refilling"]], [["₱50 refill credit", "Redeem with 150 AquaPoints", "40 points away"], ["Reusable bottle", "Unlocked after 100 points", "Available"], ["September streak", "3 consecutive refill weeks", "+20 bonus points"]]],
    orders: ["Station operations", "Keep today’s orders moving.", "Review incoming orders, pickup readiness, and completed station transactions.", [["18", "new orders", "since 8:00 AM"], ["7", "ready for pickup", "next 2 hours"], ["₱42.8k", "revenue this month", "+8.2%"]], [["Order #AT-2048", "Mia Santos · 2 gallons · Pickup 5:30 PM", "Preparing"], ["Order #AT-2041", "Paolo Reyes · Monthly plan · Pickup 6:00 PM", "Ready"], ["Order #AT-2037", "Lara Cruz · 4 gallons · Sep 20", "Completed"]]],
    subscriptions: ["Plan management", "Grow recurring refills.", "Monitor active plans, upcoming renewals, and customers at risk of churning.", [["126", "active subscriptions", "+11 this month"], ["24", "renewals this week", "next 7 days"], ["94%", "renewal rate", "above target"]], [["Monthly essentials", "82 subscribers · 4 gallons / month", "Healthy"], ["Family refill plan", "31 subscribers · 8 gallons / month", "Growing"], ["At-risk renewals", "13 customers · renewal within 3 days", "Follow up"]]],
    customers: ["Customer relationships", "Know who keeps coming back.", "Understand regular customers, recent visits, and service follow-ups for your station.", [["284", "returning customers", "last 90 days"], ["38", "new customers", "this month"], ["4.9", "average rating", "128 reviews"]], [["Mia Santos", "12 visits · Monthly essentials plan", "Loyal"], ["Paolo Reyes", "7 visits · Last refill Sep 19", "Active"], ["Lara Cruz", "1 visit · No plan yet", "Follow up"]]],
    promotions: ["Station marketing", "Give customers a reason to refill.", "Create, monitor, and pause offers that bring more people to your station.", [["3", "active promotions", "running now"], ["184", "redemptions", "this month"], ["₱9.4k", "revenue influenced", "promotion sales"]], [["Free delivery weekend", "Sep 21–22 · First-time customers", "Active"], ["Bring your bottle", "10% off · Reusable bottle users", "Active"], ["September streak", "20 bonus points · Returning customers", "Draft"]]],
    "station-settings": ["Station profile", "Keep your station information accurate.", "Update operating hours, prices, pickup instructions, and the public station listing.", [["Open", "station status", "until 9:00 PM"], ["₱35", "price / gallon", "last updated today"], ["4.9", "public rating", "128 reviews"]], [["Operating hours", "Mon–Sun · 6:00 AM to 9:00 PM", "Published"], ["Pickup instructions", "Use the green counter beside the entrance", "Published"], ["Water quality certificate", "Renewal due Nov 12, 2026", "Verified"]]],
    "my-shifts": ["Shift operations", "Your station shift, at a glance.", "Manage assigned station work and stay connected with your owner.", [["4", "orders assigned", "today"], ["2:00 PM", "next shift", "to 9:00 PM"], ["1", "inventory alert", "check stock"]], [["Orders assigned", "4 pickup orders need attention today", "Open"], ["Next shift", "Today · 2:00 PM to 9:00 PM", "Scheduled"], ["Inventory alert", "Check refill inventory before 4:00 PM", "Important"]]],
    "station-orders": ["Station operations", "Coordinate today’s pickup queue.", "Review assigned orders and keep customers updated throughout your shift.", [["4", "assigned orders", "today"], ["2", "ready for pickup", "next 2 hours"], ["100%", "shift coverage", "on track"]], [["AT-1048", "Mia Santos · 2 × 5-gallon refill", "Ready"], ["AT-1047", "Noah Garcia · 1 × 5-gallon refill", "Processing"], ["AT-1045", "Enzo Reyes · 3 × 5-gallon refill", "New"]]],
  };
  const labels = { "find-stations": "Find stations", "my-subscriptions": "My subscriptions", "orders-history": "Orders & history", rewards: "Rewards", orders: "Orders", subscriptions: "Subscriptions", customers: "Customers", "staff-approvals": "Staff approvals", promotions: "Promotions", "station-settings": "Station settings", "my-shifts": "My shifts", "station-orders": "Station orders", inventory: "Inventory", "customer-requests": "Customer requests" };
  const catalog = [
    ["drink-refill", "DRINK n' REFILL Purified Water Refilling Station", "₱35 / gallon", true],
    ["ultra-pure", "Ultra Pure Water Refilling Station", "₱30 / gallon", false],
    ["waterpol", "Waterpol Water Refilling Station", "₱35 / gallon", true],
    ["pg-aquamaster", "PG Aquamaster Water Refilling Station", "₱30 / gallon", false],
    ["aquater", "Aqua'Ter SMN Water Refilling Station", "₱25 / gallon", true],
    ["ph2o", "PH2O Water Refilling Station", "₱30 / gallon", false],
    ["alka", "Alka Water Refilling Station", "₱35 / gallon", true],
  ];

  function shell(role, title, active, content) {
    const account = accountFor(role) || accounts.customer;
    const nav = role === "owner" ? [["Overview", ""], ["Orders", "orders"], ["Subscriptions", "subscriptions"], ["Customers", "customers"], ["Staff approvals", "staff-approvals"], ["Promotions", "promotions"], ["Station settings", "station-settings"], ["Profile", "profile"]] : role === "staff" ? [["Overview", ""], ["My shifts", "my-shifts"], ["Station orders", "station-orders"], ["Inventory", "inventory"], ["Customer requests", "customer-requests"], ["Staff profile", "profile"]] : [["Overview", ""], ["Find stations", "find-stations"], ["Order water", "order-water"], ["My subscriptions", "my-subscriptions"], ["Orders & history", "orders-history"], ["Rewards", "rewards"], ["Profile", "profile"]];
    const navHtml = nav.map(([label, path]) => `<a class="${active === label ? "active" : ""}" href="${path ? `/dashboard/${role}/${path}` : `/dashboard/${role}`}"><span>•</span>${label}</a>`).join("");
    const initials = initialsFor(account.name);
    return `<div class="app-shell"><aside class="sidebar"><a class="mark mark-compact" href="/"><img src="/images/logo/aquatracker-icon-teal-light.png" alt="AquaTracker logo" class="mark-icon-img"><span>Aqua<span class="mark-accent">Tracker</span></span></a><div class="account-chip"><span class="avatar">${initials}</span><span><strong>${esc(account.name)}</strong><small>${esc(account.label)}</small></span></div><nav class="side-nav">${navHtml}</nav><a class="signout" href="/auth/logout">↪ Sign out</a></aside><section class="workspace"><header class="topbar"><div class="mobile-menu"><button data-menu-toggle>☰</button></div><div><small>${esc(account.label)} workspace</small><h1>${esc(title)}</h1></div><div class="top-actions"><button class="icon-button" data-notifications aria-label="Open notifications"><svg class="bell-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><i></i></button><span class="top-account"><strong>${esc(account.name)}</strong><small>${esc(account.subtitle)}</small></span><span class="avatar pale">${initials}</span></div></header><main class="content">${content}</main></section></div><div class="notification-panel" data-notification-panel><strong>Notifications</strong><p>Your latest AquaTracker updates will appear here.</p><button data-close-notifications>Mark all read</button></div>`;
  }
  function stats(items) { return `<div class="stats three">${items.map((item) => `<div><b>${esc(item[0])}</b><small>${esc(item[1])}<br>${esc(item[2])}</small></div>`).join("")}</div>`; }
  function stationRows() {
    return stations.map((station, index) => `<article class="station-row" data-station data-station-index="${index}" data-station-id="${catalog[index][0]}"><div><b>${esc(station[0])}</b><span class="pill">${esc(station[5])}</span><small>${esc(station[1])} · ${esc(station[3])}</small></div><strong data-station-distance>${esc(catalog[index][2])}<small>${esc(station[2])}</small></strong><div class="station-actions"><button class="button small" type="button" data-order-station="${catalog[index][0]}">Order</button><button class="save-station" type="button" data-save-station aria-label="Save ${esc(station[0])}">＋</button></div></article>`).join("");
  }
  function findStationsSection(role, data) {
    return `<section class="section-hero ${role}"><span class="eyebrow">${esc(data[0])}</span><h2>${esc(data[1])}</h2><p>${esc(data[2])}</p><div class="location-tools"><span class="location-status" data-location-status>Finding stations near you…</span><button class="button small outline" type="button" data-locate-stations>Use my location</button><button class="button small" type="button" data-order-nearest hidden>Order from nearest station</button></div></section>${stats(data[3])}<section class="panel" id="workspace-details"><div class="section-heading"><span class="eyebrow">Nearest to you</span><h2>Find stations</h2><input class="search" data-station-search placeholder="Search by station or area" aria-label="Search stations"></div><div class="station-list" data-station-list>${stationRows()}</div></section>`;
  }
  function distanceBetween(lat1, lon1, lat2, lon2) {
    const radians = (value) => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const deltaLat = radians(lat2 - lat1);
    const deltaLon = radians(lon2 - lon1);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function bindLocationFinder() {
    const status = $("[data-location-status]");
    const list = $("[data-station-list]");
    const locate = () => {
      if (!navigator.geolocation) {
        status.textContent = "Location is unavailable. Showing all stations.";
        return;
      }
      status.textContent = "Finding stations near you…";
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const rows = $$("[data-station]", list).map((row) => {
            const index = Number(row.dataset.stationIndex);
            const [latitude, longitude] = stationCoordinates[index];
            const distance = distanceBetween(coords.latitude, coords.longitude, latitude, longitude);
            row.querySelector("[data-station-distance]").innerHTML = `${distance.toFixed(1)} km away<small>${esc(stations[index][2])}</small>`;
            row.dataset.distance = String(distance);
            return row;
          }).sort((first, second) => Number(first.dataset.distance) - Number(second.dataset.distance));
          rows.forEach((row) => list.append(row));
          const nearest = rows[0];
          if (nearest) {
            nearest.classList.add("nearest-station");
            nearest.querySelector("b").insertAdjacentHTML("afterend", ' <span class="pill orange">Nearest</span>');
            const orderNearest = $("[data-order-nearest]");
            orderNearest.hidden = false;
            orderNearest.dataset.stationId = nearest.dataset.stationId;
          }
          status.textContent = `Showing ${rows.length} stations nearest to your location.`;
        },
        () => { status.textContent = "Location permission was unavailable. Showing all stations."; },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    };
    $("[data-locate-stations]")?.addEventListener("click", locate);
    $("[data-order-nearest]")?.addEventListener("click", (event) => {
      if (event.currentTarget.dataset.stationId) location.assign(`/dashboard/customer/order-water?station=${encodeURIComponent(event.currentTarget.dataset.stationId)}`);
    });
    locate();
  }
  function orderPage(role) {
    const requestedStation = new URLSearchParams(location.search).get("station");
    const content = `<section class="section-hero"><span class="eyebrow">Order water</span><h2>Refill your home in a few clicks.</h2><p>Choose a station, enter your gallon quantity, and select pickup or delivery. Discounts are applied automatically: 10% for 5–7 gallons and 15% for 8 or more.</p></section><section class="panel commerce-panel"><form data-order-form class="commerce-form"><label>Station<select name="stationId" data-requested-station="${esc(requestedStation || "")}" required>${catalog.map(([id, name, price, delivery]) => `<option value="${id}">${esc(name)} · ${price}${delivery ? " · delivery available" : ""}</option>`).join("")}</select></label><label>Number of gallons<input name="gallons" type="number" min="1" max="100" value="1" required><small>5–7 gallons: 10% off · 8+ gallons: 15% off</small></label><label>Fulfillment<select name="fulfillment"><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label><div class="price-preview" data-order-preview>Estimated total: ₱35.00</div><button class="button" type="submit">Place water order →</button><p class="form-message" data-order-message aria-live="polite"></p></form></section>`;
    document.body.innerHTML = shell(role, "Order water", "Order water", content);
    bindDashboard();
    bindOrderForm();
  }
  function bindOrderForm() {
    const form = $("[data-order-form]");
    const preview = $("[data-order-preview]");
    const message = $("[data-order-message]");
    const requestedStation = form.elements.stationId.dataset.requestedStation;
    if (catalog.some(([id]) => id === requestedStation)) form.elements.stationId.value = requestedStation;
    const updatePreview = () => {
      const station = catalog.find(([id]) => id === form.elements.stationId.value);
      const gallons = Math.max(1, Number(form.elements.gallons.value) || 1);
      const unit = Number(station[2].replace(/[^\d.]/g, ""));
      const rate = gallons >= 8 ? 0.15 : gallons >= 5 ? 0.1 : 0;
      const subtotal = unit * gallons;
      const total = subtotal - subtotal * rate;
      preview.textContent = `Estimated total: ₱${total.toFixed(2)}${rate ? ` · ${rate * 100}% discount applied` : ""}`;
    };
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "Submitting order…";
      try {
        const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to place order.");
        message.textContent = `Order ${payload.order.id} placed. Total: ₱${payload.order.total.toFixed(2)}.`;
        toast("Water order placed.");
        form.reset();
        updatePreview();
      } catch (error) {
        message.textContent = error.message;
      }
    });
    updatePreview();
  }
  async function subscriptionPage(role) {
    const content = `<section class="section-hero"><span class="eyebrow">Subscriptions</span><h2>Never run out of water.</h2><p>Register a recurring refill plan and get a 10% subscription discount. Choose the station, gallon quantity, and refill frequency that fits your household.</p></section><section class="panel commerce-panel"><form data-subscription-form class="commerce-form"><label>Station<select name="stationId" required>${catalog.map(([id, name, price]) => `<option value="${id}">${esc(name)} · ${price}</option>`).join("")}</select></label><label>Gallons per refill<input name="gallons" type="number" min="1" max="100" value="4" required></label><label>Refill frequency<select name="frequency"><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly" selected>Every month</option></select></label><button class="button" type="submit">Register subscription →</button><p class="form-message" data-subscription-message aria-live="polite"></p></form></section><section class="panel"><div class="section-heading"><span class="eyebrow">Your plans</span><h2>Active subscriptions</h2></div><div class="activity-list" data-subscription-list><p class="empty-state">Loading subscriptions…</p></div></section>`;
    document.body.innerHTML = shell(role, "My subscriptions", "My subscriptions", content);
    bindDashboard();
    const form = $("[data-subscription-form]");
    const message = $("[data-subscription-message]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "Registering subscription…";
      try {
        const response = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to register subscription.");
        message.textContent = `Subscription ${payload.subscription.id} is active.`;
        toast("Subscription registered.");
        await loadSubscriptions();
      } catch (error) {
        message.textContent = error.message;
      }
    });
    async function loadSubscriptions() {
      const list = $("[data-subscription-list]");
      const response = await fetch("/api/subscriptions", { headers: { Accept: "application/json" } });
      const payload = await response.json();
      list.innerHTML = payload.subscriptions.length ? payload.subscriptions.map((item) => `<article><span class="list-icon">↻</span><div><b>${esc(item.stationName)}</b><small>${item.gallons} gallons · ${esc(item.frequency)} · ₱${item.estimatedTotal.toFixed(2)} estimated per refill</small><small>Next refill: ${new Date(item.nextRefill).toLocaleDateString()}</small></div><span class="pill">${esc(item.status)}</span>${item.status === "Active" ? `<button class="text-button" data-cancel-subscription="${esc(item.id)}">Cancel</button>` : ""}</article>`).join("") : '<p class="empty-state">No subscriptions yet. Register your first plan above.</p>';
      $$("[data-cancel-subscription]").forEach((button) => button.addEventListener("click", async () => {
        const response = await fetch(`/api/subscriptions/${encodeURIComponent(button.dataset.cancelSubscription)}/cancel`, { method: "POST", headers: { Accept: "application/json" } });
        if (!response.ok) return toast("Unable to cancel subscription.");
        toast("Subscription cancelled.");
        loadSubscriptions();
      }));
    }
    await loadSubscriptions();
  }
  async function orderHistoryPage(role) {
    const content = `<section class="section-hero"><span class="eyebrow">Orders & history</span><h2>Track every refill.</h2><p>Review your water orders, quantities, discounts, fulfillment method, and current status.</p></section><section class="panel"><div class="section-heading"><span class="eyebrow">Your orders</span><h2>Order history</h2></div><div class="activity-list" data-order-list><p class="empty-state">Loading orders…</p></div></section>`;
    document.body.innerHTML = shell(role, "Orders & history", "Orders & history", content);
    bindDashboard();
    try {
      const response = await fetch("/api/orders", { headers: { Accept: "application/json" } });
      const payload = await response.json();
      const list = $("[data-order-list]");
      list.innerHTML = payload.orders.length ? payload.orders.map((item) => `<article><span class="list-icon">✓</span><div><b>${esc(item.id)} · ${esc(item.stationName)}</b><small>${item.gallons} gallons · ${esc(item.fulfillment)} · ${new Date(item.createdAt).toLocaleDateString()}</small><small>Subtotal ₱${item.subtotal.toFixed(2)} · Discount ₱${item.discount.toFixed(2)} · Total ₱${item.total.toFixed(2)}</small></div><span class="pill">${esc(item.status)}</span></article>`).join("") : '<p class="empty-state">No orders yet. <a href="/dashboard/customer/order-water">Order water now.</a></p>';
    } catch {
      $("[data-order-list]").innerHTML = '<p class="empty-state">Orders are temporarily unavailable.</p>';
    }
  }
  function section(role, key) {
    if (key === "staff-approvals") return staffApprovals(role);
    if (key === "order-water") return orderPage(role);
    if (key === "my-subscriptions") return subscriptionPage(role);
    if (key === "orders-history") return orderHistoryPage(role);
    if (role === "staff" && ["my-shifts", "station-orders", "inventory", "customer-requests"].includes(key)) return staffSection(role, key);
    const data = sectionData[key] || sectionData["find-stations"];
    const content = key === "find-stations" ? findStationsSection(role, data) : `<section class="section-hero ${role}"><span class="eyebrow">${esc(data[0])}</span><h2>${esc(data[1])}</h2><p>${esc(data[2])}</p></section>${stats(data[3])}<section class="panel" id="workspace-details"><div class="section-heading"><span class="eyebrow">${esc(data[0])}</span><h2>${esc(labels[key] || "Workspace")}</h2></div><div class="activity-list">${data[4].map((row) => `<article><span class="list-icon">•</span><div><b>${esc(row[0])}</b><small>${esc(row[1])}</small></div><span class="pill">${esc(row[2])}</span></article>`).join("")}</div></section>`;
    document.body.innerHTML = shell(role, labels[key] || "Workspace", labels[key] || "Workspace", content);
    bindDashboard();
    if (key === "find-stations") bindLocationFinder();
  }
async function staffSection(role, key) {
          const title = labels[key];
          const intro = key === "my-shifts" ? ["Shift operations", "Own your schedule and attendance.", "Check in and out for assigned shifts."] : key === "station-orders" ? ["Station orders", "Keep every assigned order moving.", "Search orders, add internal notes, and confirm status changes."] : key === "inventory" ? ["Inventory monitoring", "Keep the station ready for the next refill.", "Report returned, damaged, or missing stock to your owner."] : ["Customer requests", "Respond to customers at your station.", "Track pickup changes, container returns, and service follow-ups."];
          document.body.innerHTML = shell(role, title, title, `<section class="section-hero staff"><span class="eyebrow blue-text">${esc(intro[0])}</span><h2>${esc(intro[1])}</h2><p>${esc(intro[2])}</p></section><section class="panel staff-tool" data-staff-tool><p class="empty-state">Loading ${esc(title.toLowerCase())}…</p></section>`);
          bindDashboard();
          const panel = $("[data-staff-tool]");
          try {
            const endpoint = key === "my-shifts" ? "/api/staff/shifts" : key === "station-orders" ? "/api/staff/orders" : key === "inventory" ? "/api/staff/inventory" : "/api/staff/requests";
            const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Unable to load this workspace.");
            if (key === "my-shifts") {
              panel.innerHTML = `<div class="section-heading"><span class="eyebrow">Assigned schedule</span><h2>My shifts</h2></div><div class="activity-list">${payload.shifts.map((shift) => `<article><div><b>${esc(shift.date)} · ${esc(shift.start)}–${esc(shift.end)}</b><small>${esc(shift.status)}</small></div><span><button class="button small" data-attendance="check-in" data-shift="${esc(shift.id)}">Check in</button> <button class="button small outline" data-attendance="check-out" data-shift="${esc(shift.id)}">Check out</button></span></article>`).join("") || '<p class="empty-state">No shifts assigned.</p>'}</div>`;
              $("[data-attendance]").forEach((button) => button.addEventListener("click", async () => { if (!confirm(`Confirm ${button.dataset.attendance.replace("-", " ")}?`)) return; const response = await fetch(`/api/staff/shifts/${button.dataset.shift}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: button.dataset.attendance }) }); toast(response.ok ? "Attendance updated." : "Attendance could not be updated."); if (response.ok) staffSection(role, key); }));
            } else if (key === "station-orders") {
              panel.innerHTML = `<div class="section-heading"><span class="eyebrow">Assigned station only</span><h2>Station order queue</h2><div class="staff-filters"><input class="search" data-order-search placeholder="Search order or customer"><select data-order-status><option value="all">All statuses</option>${payload.statuses.map((status) => `<option>${esc(status)}</option>`).join("")}</select></div></div><div class="activity-list" data-order-list>${payload.orders.map((order) => `<article data-staff-order="${esc(order.id)}"><div><b>${esc(order.id)} · ${esc(order.customerName)}</b><small>${esc(order.gallons)} gallons · ${esc(order.fulfillment)} · ₱${Number(order.total).toFixed(2)}</small><input data-internal-note value="${esc(order.internalNote || "")}" placeholder="Internal note (staff only)"></div><span><select data-status><option>${esc(order.status)}</option>${payload.statuses.filter((status) => status !== order.status).map((status) => `<option>${esc(status)}</option>`).join("")}</select><button class="button small" data-save-order>Save</button></span></article>`).join("") || '<p class="empty-state">No orders assigned to this station.</p>'}</div>`;
              const filterOrders = () => { const search = $("[data-order-search]").value.toLowerCase(); const status = $("[data-order-status]").value; $("[data-staff-order]").forEach((row) => { row.hidden = (search && !row.textContent.toLowerCase().includes(search)) || (status !== "all" && row.querySelector("[data-status]").value !== status); }); };
              $("[data-order-search]").addEventListener("input", filterOrders); $("[data-order-status]").addEventListener("change", filterOrders);
              $("[data-save-order]").forEach((button) => button.addEventListener("click", async () => { const row = button.closest("[data-staff-order]"); const status = row.querySelector("[data-status]").value; if (!confirm(`Set ${row.dataset.staffOrder} to ${status}?`)) return; const response = await fetch(`/api/staff/orders/${row.dataset.staffOrder}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, internalNote: row.querySelector("[data-internal-note]").value }) }); toast(response.ok ? "Order status and note saved." : "Order update failed."); if (response.ok) staffSection(role, key); }));
            } else if (key === "inventory") {
              panel.innerHTML = `<div class="section-heading"><span class="eyebrow">Stock health</span><h2>Inventory</h2></div><div class="activity-list">${payload.inventory.map((item) => `<article><div><b>${esc(item.name)}</b><small>${esc(item.quantity)} ${esc(item.unit)} · reorder at ${esc(item.reorderAt)}</small></div><button class="button small outline" data-report-item="${esc(item.id)}">Report issue</button></article>`).join("")}</div>`;
              $("[data-report-item]").forEach((button) => button.addEventListener("click", async () => { const type = prompt("Report type: return, damage, or missing", "missing"); if (!type || !["return", "damage", "missing"].includes(type)) return; const amount = prompt("How many units?", "1"); const response = await fetch("/api/staff/inventory/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: button.dataset.reportItem, type, amount }) }); toast(response.ok ? "Inventory report submitted." : "Inventory report failed."); if (response.ok) staffSection(role, key); }));
            } else {
              panel.innerHTML = `<div class="section-heading"><span class="eyebrow">Station inbox</span><h2>Customer requests</h2></div><div class="activity-list">${payload.requests.map((request) => `<article data-request="${esc(request.id)}"><div><b>${esc(request.subject)} · ${esc(request.customerName)}</b><small>${esc(request.message)}</small></div><select data-request-status><option>${esc(request.status)}</option><option>In progress</option><option>Resolved</option><option>Closed</option></select><button class="button small" data-save-request>Save</button></article>`).join("") || '<p class="empty-state">No customer requests.</p>'}</div>`;
              $("[data-save-request]").forEach((button) => button.addEventListener("click", async () => { const row = button.closest("[data-request]"); const response = await fetch(`/api/staff/requests/${row.dataset.request}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: row.querySelector("[data-request-status]").value }) }); toast(response.ok ? "Request updated." : "Request update failed."); if (response.ok) staffSection(role, key); }));
            }
          } catch (error) { panel.innerHTML = `<p class="form-message">${esc(error.message)}</p>`; }
        }

  async function staffApprovals(role) {
    document.body.innerHTML = shell(role, "Staff approvals", "Staff approvals", `<section class="section-hero owner"><span class="eyebrow">Station team</span><h2>Confirm your staff.</h2><p>Review staff registration requests for your station and approve only people you know are official team members.</p></section><section class="panel"><div class="section-heading"><span class="eyebrow">Pending requests</span><h2>Staff approvals</h2></div><div class="activity-list" data-approval-list><p class="empty-state">Loading approval requests…</p></div></section>`);
    bindDashboard();
    const list = $("[data-approval-list]");
    try {
      const response = await fetch("/api/staff-approvals", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Unable to load staff approvals.");
      const { approvals } = await response.json();
      list.innerHTML = approvals.length ? approvals.map((approval) => `<article data-approval-id="${esc(approval.id)}"><span class="avatar pale">${esc(initialsFor(approval.name))}</span><div><b>${esc(approval.name)}</b><small>${esc(approval.email)} · ${esc(approval.station)}</small><small>Requested ${new Date(approval.createdAt).toLocaleDateString()}</small></div><button class="button small" data-approval-decision="approve">Approve</button><button class="button small outline" data-approval-decision="reject">Reject</button></article>`).join("") : '<p class="empty-state">No pending staff requests for this station.</p>';
      $$("[data-approval-decision]").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("[data-approval-id]");
        const decision = button.dataset.approvalDecision;
        button.disabled = true;
        let result;
        try {
          result = await fetch(`/api/staff-approvals/${encodeURIComponent(row.dataset.approvalId)}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ decision }) });
        } catch {
          result = null;
        }
        if (!result?.ok) {
          button.disabled = false;
          toast("That approval request could not be updated.");
          return;
        }
        row.remove();
        if (!list.querySelector("[data-approval-id]")) list.innerHTML = '<p class="empty-state">No pending staff requests for this station.</p>';
        toast(decision === "approve" ? "Staff member approved." : "Staff request rejected.");
      }));
    } catch {
      list.innerHTML = '<p class="empty-state">Approval requests are temporarily unavailable.</p>';
    }
  }
  function dashboard(role) {
    const account = accountFor(role);
    let content;
    if (role === "customer") {
      content = `<section class="dashboard-hero teal"><span class="pill orange">Your weekly rhythm</span><h2>Stay stocked, stay easy.</h2><p>Your next plan refill is due in 3 days. You’re doing great — 2 gallons ahead of your usual pace.</p><a class="button dark" href="#stations">Find a refill →</a></section>${stats([["7", "listed stations", "in Pagadian City"], ["8", "completed orders", "this year"], ["120", "reward points", "40 until next perk"]])}<section id="stations" class="dashboard-grid"><div><div class="section-heading"><span class="eyebrow">Near you</span><h2>Find a refill station</h2></div><input class="search" data-station-search placeholder="Search by station or area"><div class="station-list">${stationRows()}</div></div><div><div class="section-heading"><span class="eyebrow">Live view</span><h2>Around Pagadian City</h2></div><div class="fake-map"><i></i><i></i><i></i><i></i><span>12 stations · Updated just now</span></div></div></section>`;
    } else if (role === "owner") {
      content = `<div class="page-heading"><span class="eyebrow orange-text">Tuesday, September 20, 2026</span><h2>Good morning, ${esc(account.name.split(" ")[0])}</h2><p>Here’s what’s happening at ClearSpring today.</p></div>${stats([["28", "Today’s orders", "+12.5%"], ["₱48,620", "Monthly revenue", "+8.2%"], ["146", "Active subscribers", "+4.6%"]])}<section class="panel"><div class="section-heading"><span class="eyebrow orange-text">Order activity</span><h2>Today’s orders</h2></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>${orders.map((order) => `<tr><td><b>${order[0]}</b><small>${order[2]}</small></td><td>${order[1]}</td><td>${order[3]}</td><td><span class="pill ${order[5]}">${order[4]}</span></td></tr>`).join("")}</tbody></table></div></section>`;
    } else {
      content = `<div class="page-heading"><span class="eyebrow blue-text">Assigned station · ${esc(account.station || "Your station")}</span><h2>Welcome back, ${esc(account.name.split(" ")[0])}</h2><p>Only orders, inventory, requests, and shifts assigned to your station are shown here.</p></div><div data-staff-overview>${stats([["—", "Orders needing action", "loading"], ["—", "Ready for pickup", "loading"], ["—", "Open requests", "loading"], ["—", "Low stock items", "loading"]])}</div><section class="quick-actions panel"><div class="section-heading"><span class="eyebrow blue-text">Quick actions</span><h2>Keep today moving</h2></div><div class="quick-action-list"><a class="button small" href="/dashboard/staff/station-orders">View orders</a><a class="button small" href="/dashboard/staff/station-orders">Update status</a><a class="button small outline" href="/dashboard/staff/inventory">Record return</a><a class="button small outline" href="/dashboard/staff/inventory">Report issue</a><a class="button small outline" href="/dashboard/staff/my-shifts">Today’s shift</a><a class="button small outline" href="mailto:manager@clearspring.ph">Contact manager</a><a class="button small outline" href="/dashboard/staff/station-orders">Add note</a></div></section><section class="panel staff-overview-grid"><div><span class="eyebrow blue-text">Role description</span><h2>Station staff</h2><p>Coordinate station orders, prepare refills, maintain inventory accuracy, respond to customer requests, and record attendance. Your role, permissions, and assigned station are controlled by the station owner.</p><div class="section-heading"><span class="eyebrow">Current shift</span><h3 data-current-shift>Loading…</h3></div><div class="activity-list" data-pending-orders><p>Loading pending orders…</p></div></div><div><div class="section-heading"><span class="eyebrow">Staff notifications</span><h2>Important updates</h2></div><div class="activity-list" data-staff-notifications><p>Loading notifications…</p></div></div></section><section class="panel"><div class="section-heading"><span class="eyebrow blue-text">Completed tasks</span><h2>Recently completed</h2></div><div class="activity-list" data-completed-tasks><p>Loading completed tasks…</p></div><div class="section-heading"><span class="eyebrow orange-text">Inventory alerts</span><h2>Needs attention</h2></div><div class="activity-list" data-inventory-alerts><p>Loading inventory alerts…</p></div></section>`;
    }
    const firstName = account.name.split(" ")[0];
    document.body.innerHTML = shell(role, role === "customer" ? `Good morning, ${firstName}` : role === "owner" ? "Station overview" : "Staff workspace", "Overview", content);
    bindDashboard();
    if (role === "staff") {
      fetch("/api/staff/overview").then((response) => response.json()).then((data) => {
        const metrics = data.metrics;
        $("[data-staff-overview]").innerHTML = stats([[metrics.assignedOrders, "Orders needing action", "prepare or hand off"], [metrics.ready, "Ready for pickup", "next handoff"], [metrics.openRequests, "Open requests", "customer inbox"], [metrics.lowStock, "Low stock items", "needs attention"]]);
        const shift = data.currentShift;
        $("[data-current-shift]").textContent = shift ? `${shift.date} · ${shift.start}–${shift.end} · ${shift.status}` : "No shift assigned today";
        $("[data-pending-orders]").innerHTML = data.pendingOrders.length ? data.pendingOrders.map((order) => `<article><div><b>${esc(order.id)} · ${esc(order.customerName)}</b><small>${esc(order.gallons)} gallons · ${esc(order.fulfillment)}</small></div><span class="pill">${esc(order.status)}</span></article>`).join("") : "<p>No pending orders need preparation or pickup.</p>";
        $("[data-completed-tasks]").innerHTML = data.completedTasks.length ? data.completedTasks.map((task) => `<article><div><b>${esc(task.label)}</b><small>${esc(task.detail)}</small></div><span class="pill">Done</span></article>`).join("") : "<p>No recently completed tasks.</p>";
        $("[data-inventory-alerts]").innerHTML = data.inventoryAlerts.length ? data.inventoryAlerts.map((alert) => `<article><div><b>${esc(alert.label)}</b><small>${esc(alert.detail)}</small></div><a class="button small outline" href="/dashboard/staff/inventory">Review</a></article>`).join("") : "<p>No important inventory alerts.</p>";
        $("[data-staff-notifications]").innerHTML = data.notifications.length ? data.notifications.map((notification) => `<article><div><b>${esc(notification.title)}</b><small>${esc(notification.message)}</small></div><span class="pill">${notification.read ? "Read" : "New"}</span></article>`).join("") : "<p>No new staff notifications.</p>";
      }).catch(() => { $("[data-staff-overview-list]").innerHTML = "<p>Staff metrics are temporarily unavailable.</p>"; });
    }
  }
  function profile(role) {
    let savedProfile = {};
    const profileKey = `aquatracker_profile_${role}_${accountFor(role).email}`;
    try {
      savedProfile = JSON.parse(localStorage.getItem(profileKey) || "{}");
    } catch {
      localStorage.removeItem(profileKey);
    }
    const account = { ...accountFor(role), ...savedProfile };
    const staffAccess = role === "staff" ? `<label>Role<input value="Station staff" disabled></label><label>Assigned station<input value="${esc(account.station || "Assigned station")}" disabled></label><label>Permissions<input value="${esc((account.permissions || ["orders", "inventory", "requests"]).join(", "))}" disabled></label>` : "";
    const content = `<div class="page-heading"><span class="eyebrow">Account & preferences</span><h2>Make it yours.</h2><p>Update permitted contact details. Role, permissions, and assigned station cannot be changed by staff.</p></div><form class="profile-grid" data-profile-form><section class="profile-card dark"><span class="avatar large">${initialsFor(account.name)}</span><h2 data-profile-name>${esc(account.name)}</h2><p>${esc(account.subtitle)}</p><hr><p>✓ Role verified</p><p>♢ Notifications enabled</p></section><section class="panel profile-fields"><label>Full name<input name="name" value="${esc(account.name)}" required></label><label>Email address<input name="email" type="email" value="${esc(account.email)}" required></label><label>Mobile number<input name="phone" value="${esc(account.phone || "+63 917 555 0148")}"></label><label>Location<input name="location" value="${esc(account.location || "Pagadian City, Zamboanga del Sur")}"></label>${staffAccess}${role === "owner" ? '<label>Station name<input name="station" value="ClearSpring Water Hub"></label>' : ""}<div class="form-actions"><small data-profile-message>Changes are saved securely to your profile.</small><button type="button" class="button outline" data-profile-discard>Discard</button><button class="button" type="submit">✓ Save changes</button></div></section></form>`;
    document.body.innerHTML = shell(role, "Profile settings", "Profile", content);
    bindDashboard();
    bindProfile();
  }
  function bindDashboard() {
    $("[data-menu-toggle]")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));
    $("[data-notifications]")?.addEventListener("click", () => $("[data-notification-panel]")?.classList.toggle("open"));
    $("[data-close-notifications]")?.addEventListener("click", (event) => {
      $("[data-notification-panel]")?.classList.remove("open");
      event.target.textContent = "All notifications read";
      toast("Notifications marked as read.");
    });
    $("[data-station-search]")?.addEventListener("input", (event) => $$("[data-station]").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.toLowerCase()); }));
    let savedStations = [];
    try {
      savedStations = JSON.parse(localStorage.getItem("aquatracker_saved_stations") || "[]");
      if (!Array.isArray(savedStations)) savedStations = [];
    } catch {
      localStorage.removeItem("aquatracker_saved_stations");
    }
    $$("[data-save-station]").forEach((button, index) => {
      const stationIndex = Number(button.closest("[data-station]")?.dataset.stationIndex);
      if (savedStations.includes(stationIndex)) {
        button.classList.add("saved");
        button.textContent = "✓";
      }
      button.addEventListener("click", () => {
        const saved = savedStations.includes(stationIndex);
        if (saved) savedStations.splice(savedStations.indexOf(stationIndex), 1);
        else savedStations.push(stationIndex);
        localStorage.setItem("aquatracker_saved_stations", JSON.stringify(savedStations));
        button.classList.toggle("saved", !saved);
        button.textContent = saved ? "＋" : "✓";
        toast(saved ? "Station removed from saved stations." : "Station saved.");
      });
    });
    $$("[data-order-station]").forEach((button) => button.addEventListener("click", () => {
      location.assign(`/dashboard/customer/order-water?station=${encodeURIComponent(button.dataset.orderStation)}`);
    }));
  }
  function bindProfile() {
    const form = $("[data-profile-form]");
    // Validate rather than trusting the segment - the page is also served from
    // /pages/profile.html, where pathname[2] is undefined or a filename.
    const seg = location.pathname.split("/")[2];
    const role = accounts[seg] ? seg : "customer";
    const profileKey = `aquatracker_profile_${role}_${accountFor(role).email}`;
    const initial = new FormData(form);
    const message = $("[data-profile-message]");
    form.addEventListener("input", () => { message.textContent = "You have unsaved changes."; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.elements.name.value.trim() || !form.elements.email.value.trim()) {
        message.textContent = "Please complete your name and email before saving.";
        return;
      }
      const profile = Object.fromEntries(new FormData(form).entries());
      if (role === "staff") {
        try {
          const response = await fetch("/api/staff/profile", { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(profile) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Profile could not be saved.");
          sessionUser = payload.user;
        } catch (error) { message.textContent = error.message; return; }
      } else localStorage.setItem(profileKey, JSON.stringify(profile));
      $("[data-profile-name]").textContent = profile.name;
      message.textContent = "✓ Changes saved on this device";
      toast("Profile changes saved.");
    });
    $("[data-profile-discard]").addEventListener("click", () => {
      for (const [key, value] of initial.entries()) {
        if (form.elements[key]) form.elements[key].value = value;
      }
      message.textContent = "Unsaved changes discarded.";
      toast("Profile restored.");
    });
  }
  function auth() {
    // The auth page is reachable two ways: the canonical /auth/<role>/<mode>
    // route, and /pages/auth.html?role=<role>&mode=<mode>. Only trust the
    // path segments when the path really is an /auth/... route - otherwise
    // pathname[2] is the filename ("auth.html"), which is truthy and would
    // silently shadow the role query param.
    const path = location.pathname.split("/");
    const isAuthRoute = path[1] === "auth";
    const params = new URLSearchParams(location.search);
    const requestedRole = (isAuthRoute ? path[2] : null) || params.get("role");
    const role = accounts[requestedRole] ? requestedRole : "customer";
    const requestedMode = (isAuthRoute ? path[3] : null) || params.get("mode");
    const mode = requestedMode === "register" ? "register" : "login";
    const account = accounts[role];
    document.title = `${mode === "register" ? "Create account" : "Welcome back"} · AquaTracker`;
    $$("[data-role-label]").forEach((el) => { el.textContent = `${account.label} portal`; });
    $("[data-role-title]").textContent = account.title;
    $("[data-role-description]").textContent = account.description;
    $("[data-role-eyebrow]").textContent = account.eyebrow;
    $("[data-auth-heading]").textContent = mode === "register" ? "Create your account" : "Welcome back";
    $("[data-auth-copy]").textContent = mode === "register" ? `Join AquaTracker as a ${account.label.toLowerCase()} and get started.` : "Sign in to continue where you left off.";
    const message = $("[data-auth-message]");
    const errors = { invalid: "Invalid email or password.", role: "Use the login page for your account role.", required: "Please sign in to continue.", passwords: "Passwords must match.", email: "Please enter a valid email address.", password: "Password must be at least 8 characters.", station: "Station name is required for this role." };
    const notices = { "staff-registration": "Staff registration submitted successfully. You can now sign in.", "staff-pending": "Your staff account is waiting for confirmation from the owner of this station." };
    if (params.get("error") || params.get("notice")) {
      message.hidden = false;
      message.textContent = errors[params.get("error")] || notices[params.get("notice")] || params.get("error") || params.get("notice");
    }
    $$("[data-role-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.roleTab === role);
      tab.setAttribute("aria-selected", tab.dataset.roleTab === role ? "true" : "false");
      tab.href = `/auth/${tab.dataset.roleTab}/${mode}`;
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.assign(tab.href);
      });
    });
    const form = $("[data-auth-form]");
    form.action = `/auth/${role}/${mode}`;
    form.dataset.role = role; form.dataset.mode = mode;
    $("[data-name-field]").style.display = mode === "register" ? "grid" : "none";
    $("[data-station-field]").style.display = mode === "register" && role !== "customer" ? "grid" : "none";
    $("[data-confirm-field]").style.display = mode === "register" ? "grid" : "none";
    $("[data-remember-field]").style.display = mode === "login" ? "flex" : "none";
    $("[data-auth-submit]").textContent = mode === "register" ? "Create account →" : "Sign in →";
    form.elements.name.required = mode === "register";
    form.elements.confirmPassword.required = mode === "register";
    form.elements.station.required = mode === "register" && role !== "customer";
    $("[data-form-switch-label]").textContent = mode === "register" ? "Already have an account?" : "New to AquaTracker?";
    $("[data-form-switch]").textContent = mode === "register" ? "Sign in" : "Create an account";
    $("[data-form-switch]").href = `/auth/${role}/${mode === "register" ? "login" : "register"}`;
    $("[data-demo-email]").textContent = `${account.email} · click to fill`;
    $("[data-demo-fill]").style.display = mode === "login" ? "grid" : "none";
    $("[data-demo-fill]").addEventListener("click", () => { form.elements.email.value = account.email; form.elements.password.value = account.password; });
    $("[data-toggle-password]")?.addEventListener("click", (event) => { const input = form.elements.password; input.type = input.type === "password" ? "text" : "password"; event.target.textContent = input.type === "password" ? "Show" : "Hide"; });
    form.addEventListener("submit", (event) => {
      if (mode !== "register") return;
      if (form.elements.password.value.length < 8) {
        event.preventDefault();
        message.hidden = false;
        message.textContent = "Password must be at least 8 characters.";
      } else if (form.elements.password.value !== form.elements.confirmPassword.value) {
        event.preventDefault();
        message.hidden = false;
        message.textContent = "Passwords must match.";
      }
    });
  }
  async function loadSession() {
    const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.authenticated ? payload.user : null;
  }
  if (document.body.dataset.page === "auth") auth();
  if (document.body.dataset.page === "dashboard" || document.body.dataset.page === "profile") {
    loadSession().then((user) => {
      sessionUser = user;
      const parts = location.pathname.split("/");
      const role = accounts[parts[2]] ? parts[2] : "customer";
      if (document.body.dataset.page === "profile") profile(role);
      else if (parts[3]) section(role, decodeURIComponent(parts[3])); else dashboard(role);
    }).catch(() => location.assign("/"));
  }
  $("[data-mobile-menu]")?.addEventListener("click", () => $("[data-mobile-nav]")?.classList.toggle("open"));
})();
