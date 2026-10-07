export const roles = ["customer", "owner", "staff"];

export const accounts = {
  customer: { email: "mia@aquatracker.ph", password: "MiaDemo2026!", name: "Mia Santos", subtitle: "Customer account" },
  owner: { email: "joan@clearspring.ph", password: "JoanDemo2026!", name: "Joan Dela Cruz", subtitle: "ClearSpring Water Hub" },
  staff: { email: "staff@clearspring.ph", password: "StaffDemo2026!", name: "Dani Cruz", subtitle: "Pending station staff" },
};

export const roleMeta = {
  customer: { label: "Customer", eyebrow: "Your water, sorted.", title: "Find your next refill in a few taps.", description: "Discover trusted stations, compare plans, and keep your home stocked without the guesswork.", tone: "teal" },
  owner: { label: "Station owner", eyebrow: "Run a smoother station.", title: "Your station, at a glance.", description: "Stay on top of orders, subscriptions, prices, and the customers who keep coming back.", tone: "orange" },
  staff: { label: "Station staff", eyebrow: "Support your station team.", title: "Your station shift, at a glance.", description: "Manage assigned station work, coordinate orders, and stay connected with your owner.", tone: "blue" },
};

export const stations = [
  ["DRINK n' REFILL Purified Water Refilling Station", "45 Sabellano St, Pagadian City", "Mon–Sat 7:30 AM–4:30 PM", "0918 962 5038", "Contact station", "Verified listing"],
  ["Ultra Pure Water Refilling Station", "Purok Bakhaw A, Brgy. Kawit", "Hours not publicly listed", "0970 488 8866", "Contact station", "Verified listing"],
  ["Waterpol Water Refilling Station", "Purok Pagang, Brgy. Kawit", "Delivery advertised", "0927 251 4246", "Contact station", "Delivery"],
  ["PG Aquamaster Water Refilling Station", "Purok Makugihon, Brgy. Bulatok", "Hours not publicly listed", "0951 312 5308", "Contact station", "Verified listing"],
  ["Aqua'Ter SMN Water Refilling Station", "Beside DXPR, San Jose District", "Delivery advertised", "0975 462 7620", "₱25 / gallon", "Best value"],
  ["PH2O Water Refilling Station", "Warlito Pulmones St, Santiago District", "Vendo available 24/7", "0985 337 4448", "Contact station", "24/7 vendo"],
  ["Alka Water Refilling Station", "Zone 11, Alta Tierra Subdivision, Tiguma", "Hours not publicly listed", "0938 686 3252", "Contact station", "Verified listing"],
].map(([name, area, hours, phone, price, tag]) => ({ name, area, hours, phone, price, tag }));

export const orders = [
  ["AT-1048", "Mia Santos", "2 × 5-gallon refill", "₱70.00", "Ready for pickup", "teal"],
  ["AT-1047", "Noah Garcia", "1 × 5-gallon refill", "₱35.00", "Processing", "orange"],
  ["AT-1046", "Lia Mendoza", "Monthly · 4 gallons", "₱120.00", "Completed", "slate"],
  ["AT-1045", "Enzo Reyes", "3 × 5-gallon refill", "₱105.00", "New order", "blue"],
].map(([id, customer, items, total, status, tone]) => ({ id, customer, items, total, status, tone }));

export const sections = {
  customer: {
    "find-stations": ["Station finder", "Find clean water close by.", "Search nearby refill stations by distance, operating hours, price, and availability.", [["7", "verified listings", "Pagadian City"], ["4", "delivery / pickup options", "check each station"], ["₱25", "listed starting price", "Aqua'Ter SMN"]], stations.map((s) => [s.name, `${s.area} · ${s.hours} · ${s.phone}`, "Listed"])],
    "my-subscriptions": ["Refill plans", "Stay ahead of your next refill.", "Manage active plans, renewal dates, gallon usage, and delivery preferences.", [["1", "active plan", "Monthly essentials"], ["2 / 4", "gallons used", "this billing cycle"], ["Oct 03", "next renewal", "13 days away"]], [["Monthly essentials", "4 gallons per month · ClearSpring Water Hub", "Active"], ["Next refill", "2 gallons planned · Delivery on Oct 03", "Scheduled"], ["Payment method", "Visa ending in 2048 · Auto-renew enabled", "Verified"]]],
    "orders-history": ["Refill history", "Every refill, in one place.", "Review past orders, pickup details, receipts, and current refill status.", [["8", "completed orders", "this year"], ["1", "in progress", "ready soon"], ["₱1,240", "saved with plans", "this year"]], [["Order #AT-2048", "2 gallons · ClearSpring Water Hub · Sep 20", "Ready for pickup"], ["Order #AT-1987", "4 gallons · AquaVida Refill Station · Sep 05", "Completed"], ["Order #AT-1873", "2 gallons · BlueDrop Purified Water · Aug 18", "Completed"]]],
    rewards: ["AquaPoints", "Your refills are giving back.", "Track points earned from refills and redeem perks for your next station visit.", [["120", "points available", "ready to redeem"], ["2", "perks unlocked", "this month"], ["40", "points to next perk", "Keep refilling"]], [["₱50 refill credit", "Redeem with 150 AquaPoints", "40 points away"], ["Reusable bottle", "Unlocked after 100 points", "Available"], ["September streak", "3 consecutive refill weeks", "+20 bonus points"]]],
  },
  owner: {
    orders: ["Station operations", "Keep today’s orders moving.", "Review incoming orders, pickup readiness, and completed station transactions.", [["18", "new orders", "since 8:00 AM"], ["7", "ready for pickup", "next 2 hours"], ["₱42.8k", "revenue this month", "+8.2%"]], [["Order #AT-2048", "Mia Santos · 2 gallons · Pickup 5:30 PM", "Preparing"], ["Order #AT-2041", "Paolo Reyes · Monthly plan · Pickup 6:00 PM", "Ready"], ["Order #AT-2037", "Lara Cruz · 4 gallons · Sep 20", "Completed"]]],
    subscriptions: ["Plan management", "Grow recurring refills.", "Monitor active plans, upcoming renewals, and customers at risk of churning.", [["126", "active subscriptions", "+11 this month"], ["24", "renewals this week", "next 7 days"], ["94%", "renewal rate", "above target"]], [["Monthly essentials", "82 subscribers · 4 gallons / month", "Healthy"], ["Family refill plan", "31 subscribers · 8 gallons / month", "Growing"], ["At-risk renewals", "13 customers · renewal within 3 days", "Follow up"]]],
    customers: ["Customer relationships", "Know who keeps coming back.", "Understand regular customers, recent visits, and service follow-ups for your station.", [["284", "returning customers", "last 90 days"], ["38", "new customers", "this month"], ["4.9", "average rating", "128 reviews"]], [["Mia Santos", "12 visits · Monthly essentials plan", "Loyal"], ["Paolo Reyes", "7 visits · Last refill Sep 19", "Active"], ["Lara Cruz", "1 visit · No plan yet", "Follow up"]]],
    promotions: ["Station marketing", "Give customers a reason to refill.", "Create, monitor, and pause offers that bring more people to your station.", [["3", "active promotions", "running now"], ["184", "redemptions", "this month"], ["₱9.4k", "revenue influenced", "promotion sales"]], [["Free delivery weekend", "Sep 21–22 · First-time customers", "Active"], ["Bring your bottle", "10% off · Reusable bottle users", "Active"], ["September streak", "20 bonus points · Returning customers", "Draft"]]],
    "station-settings": ["Station profile", "Keep your station information accurate.", "Update operating hours, prices, pickup instructions, and the public station listing.", [["Open", "station status", "until 9:00 PM"], ["₱35", "price / gallon", "last updated today"], ["4.9", "public rating", "128 reviews"]], [["Operating hours", "Mon–Sun · 6:00 AM to 9:00 PM", "Published"], ["Pickup instructions", "Use the green counter beside the entrance", "Published"], ["Water quality certificate", "Renewal due Nov 12, 2026", "Verified"]]],
  },
  staff: {
    "my-shifts": ["Shift operations", "Your station shift, at a glance.", "Manage assigned station work and stay connected with your owner.", [["4", "orders assigned", "today"], ["2:00 PM", "next shift", "to 9:00 PM"], ["1", "inventory alert", "check stock"]], [["Orders assigned", "4 pickup orders need attention today", "Open"], ["Next shift", "Today · 2:00 PM to 9:00 PM", "Scheduled"], ["Inventory alert", "Check refill inventory before 4:00 PM", "Important"]]],
    "station-orders": ["Station operations", "Coordinate today’s pickup queue.", "Review assigned orders and keep customers updated throughout your shift.", [["4", "assigned orders", "today"], ["2", "ready for pickup", "next 2 hours"], ["100%", "shift coverage", "on track"]], [["AT-1048", "Mia Santos · 2 × 5-gallon refill", "Ready"], ["AT-1047", "Noah Garcia · 1 × 5-gallon refill", "Processing"], ["AT-1045", "Enzo Reyes · 3 × 5-gallon refill", "New"]]],
  },
};
