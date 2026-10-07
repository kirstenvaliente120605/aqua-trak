/**
 * AquaTracker — Station Owner Dashboard Logic (owner-dashboard.js)
 *
 * Purely a management console. No customer-facing logic.
 */

(function (global) {
  "use strict";

  let currentUser = null;
  let currentSection = 'overview';

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
    if (normalized.includes("deliver") || normalized.includes("complete") || normalized === "active" || normalized === "approved") return "completed";
    if (normalized.includes("prepar") || normalized.includes("progress") || normalized.includes("ready") || normalized.includes("scheduled")) return "out-for-delivery";
    if (normalized.includes("reject") || normalized.includes("cancel") || normalized.includes("expired")) return "slate";
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
      const [stats, orders] = await Promise.all([
        global.AquaOwner.fetchBusinessStats(),
        global.AquaOwner.fetchOrders(),
      ]);
      const hour = new Date().getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      const recentOrders = [...orders]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 3);
      container.innerHTML = `
        ${sectionHero(`Management Console · ${currentUser.station}`, `${greeting}, ${currentUser.name.split(" ")[0]} — here's your station at a glance.`, `A live snapshot of ${currentUser.station}'s business and the activity that needs your attention.`)}
        <div class="stats four">
          <div class="stat-card">
            <div class="stat-icon">₱</div>
            <div><b>₱${(stats.revenue || 0).toLocaleString()}</b><small>Total Revenue</small></div>
          </div>
          <div class="stat-card amber">
            <div class="stat-icon">📦</div>
            <div><b>${stats.orderVolume || 0}</b><small>Total Orders</small></div>
          </div>
          <div class="stat-card blue">
            <div class="stat-icon">🕒</div>
            <div><b>${stats.ordersToday || 0}</b><small>Orders Today</small></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div><b>${stats.customerCount || 0}</b><small>Unique Customers</small></div>
          </div>
        </div>
        <div class="dashboard-split">
          <section class="glass-panel dashboard-panel">
            <div class="dashboard-panel-heading">
              <div><span class="eyebrow">Latest activity</span><h3>Recent orders</h3></div>
              <button class="button small outline" type="button" onclick="switchSection('orders')">View all</button>
            </div>
            ${recentOrders.length ? `<div class="activity-list">${recentOrders.map(order => `
              <article class="activity-row">
                <span class="activity-icon">↗</span>
                <div class="activity-copy"><strong>${order.customerName || "Customer"} · ${order.gallons || 0} gal</strong><small>${order.id} · ${formatDate(order.createdAt)}</small></div>
                <div class="activity-meta"><span class="pill ${statusClass(order.status)}">${order.status}</span><strong>₱${Number(order.total || 0).toFixed(2)}</strong></div>
              </article>
            `).join("")}</div>` : `<div class="empty-state dashboard-empty"><span class="empty-state-icon">📦</span><strong>No order activity yet</strong><p>New station orders will appear here.</p></div>`}
          </section>
          <aside class="glass-panel dashboard-note-panel">
            <span class="dashboard-note-icon">✦</span>
            <span class="eyebrow">Today's focus</span>
            <h3>Keep every refill moving.</h3>
            <p>${stats.ordersToday || 0} ${Number(stats.ordersToday) === 1 ? "order is" : "orders are"} on the books today. Check the fulfillment queue to keep customers up to date.</p>
            <button class="button small amber" type="button" onclick="switchSection('orders')">Open order queue</button>
          </aside>
        </div>
      `;
    } catch (err) {
      console.error("Error rendering overview:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function renderOrders(container) {
    try {
      const orders = await global.AquaCommon.fetchOrders();
      const pending = orders.filter(order => !["delivered", "completed", "cancelled"].includes(String(order.status).toLowerCase()));
      const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      container.innerHTML = `
        ${sectionHero(`Order oversight · ${currentUser.station}`, "Every refill, in one place.", "Follow incoming station orders, monitor fulfillment, and keep every customer informed.")}
        <div class="stats three">
          <div class="stat-card"><span class="stat-icon">▤</span><div><b>${orders.length}</b><small>Total orders</small></div></div>
          <div class="stat-card amber"><span class="stat-icon">◷</span><div><b>${pending.length}</b><small>Needs attention</small></div></div>
          <div class="stat-card blue"><span class="stat-icon">₱</span><div><b>₱${revenue.toLocaleString()}</b><small>Order value</small></div></div>
        </div>
        <section class="glass-panel dashboard-panel">
          <div class="dashboard-panel-heading">
            <div><span class="eyebrow">Fulfillment</span><h3>All station orders</h3></div>
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
                <div class="dashboard-card-actions"><button class="button small amber" onclick="handleStaffDecision('${applicant.id}', 'approve')">Approve</button><button class="button small outline" onclick="handleStaffDecision('${applicant.id}', 'reject')">Reject</button></div>
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
    } catch (err) {
      console.error("Error rendering staff:", err);
      container.innerHTML = `<div class="empty-state">Couldn't load data — see console</div>`;
    }
  }

  async function handleStaffDecision(id, decision) {
    try {
      const res = await global.AquaOwner.decideStaffApproval(id, decision);
      showToast(`Staff member ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      renderStaff(document.getElementById('main-content'));
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
                    <button class="button small amber" onclick="savePrice('${prod}')">Save rate</button>
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
          <div class="dashboard-form-footer"><p>Changes update your station profile on this device.</p><button class="button amber" onclick="saveSettings()">Save station details</button></div>
        </section>
      `;
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
  global.saveOwnerProfile = saveOwnerProfile;
  global.handleStaffDecision = handleStaffDecision;
  global.savePrice = savePrice;
  global.saveSettings = saveSettings;
})(typeof window !== "undefined" ? window : this);
