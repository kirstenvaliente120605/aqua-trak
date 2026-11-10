/**
 * AquaTracker — Customer Dashboard Prototype Data Layer (dashboard.js)
 *
 * Manages all customer-facing interactive flows:
 * - Station Finder & Distance/Rating filters
 * - Step-by-step Refill Order Flow with tiered discounts & container deposits
 * - Order Tracking & 4-Stage Status Pipeline (Pending -> Confirmed -> Out for Delivery/Ready -> Completed)
 * - Recurring Refill Subscriptions (Pause, Resume, Cancel, Edit, Create)
 * - AquaPoints Loyalty Engine & Voucher Redemption
 * - Notifications & Activity Alerts
 * - Profile Management (Address Book, Payment Methods, Security)
 *
 * Customer application data currently uses temporary localStorage demo records.
 * Identity remains server-authoritative via /api/auth/me. Replace prototype
 * data operations with the documented backend routes during data migration.
 */

(function (global) {
  "use strict";

  // Temporary localStorage keys for customer prototype data.
  const STORE_KEYS = {
    STATIONS: "aquatracker_stations_db",
    ORDERS: "aquatracker_customer_orders",
    SUBSCRIPTIONS: "aquatracker_customer_subscriptions",
    LOYALTY: "aquatracker_customer_loyalty",
    NOTIFICATIONS: "aquatracker_customer_notifications",
    SAVED_STATIONS: "aquatracker_saved_stations",
  };

  // Counter-pickup is settled in cash at the station, never online, so it has
  // its own payment method and its own status pipeline.
  const PICKUP_PAYMENT_METHOD = "pay_at_counter";
  const PICKUP_STATUS_FLOW = ["new", "preparing", "ready_for_pickup", "completed"];
  const PICKUP_TERMINAL = ["completed", "cancelled"];

  function isPickupOrder(order) {
    return order && (order.fulfillmentType === "pickup" || order.fulfillment === "pickup");
  }

  /**
   * JSON fetch against the PHP API. Rejects with the server's own message so
   * callers can surface a readable toast instead of "Unexpected token <".
   */
  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Please sign in again to continue.");
      }
      throw new Error((data && data.error) || `Request failed (${res.status}).`);
    }

    return data;
  }

  // Seed Data: Stations in Filipino Local Context
  const DEFAULT_STATIONS = [
    {
      id: "drink-refill",
      name: "DRINK n' REFILL Purified Water Refilling Station",
      address: "45 Sabellano St, San Jose District, Pagadian City",
      distanceKm: 0.8,
      rating: 4.9,
      reviewsCount: 142,
      pricePerGallon: 35,
      hours: "Mon–Sat 7:30 AM–5:00 PM",
      schedule: [
        { days: "Monday – Friday", hours: "7:30 AM – 5:00 PM" },
        { days: "Saturday", hours: "7:30 AM – 4:00 PM" },
        { days: "Sunday", hours: "Closed" },
      ],
      phone: "0918 962 5038",
      waterTypes: ["Purified", "Alkaline (+₱10)"],
      deliveryAvailable: true,
      deliveryFee: 15,
      deliveryRadiusKm: 3.5,
      deliveryCoverage: "San Jose, Kawit, Tuburan & Santiago District",
      pickupAvailable: true,
      minOrderGallons: 1,
      tag: "Best Value · Verified",
      coords: { lat: 7.827330, lng: 123.444185 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Container Refill",
          price: 35,
          unit: "per refill",
          desc: "Fits standard top & bottom-load dispensers",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Container Refill",
          price: 35,
          unit: "per refill",
          desc: "Classic inverted water cooler bottle",
        },
        {
          type: "5-gal-alkaline",
          name: "5-Gallon Alkaline Ionized Refill",
          price: 45,
          unit: "per refill",
          desc: "pH 8.5+ enhanced mineral alkaline water",
        },
        {
          type: "new-bottle",
          name: "New 5-Gallon Bottle Deposit",
          price: 160,
          unit: "per bottle",
          desc: "Food-grade polycarbonate container deposit",
        },
      ],
      certifications: [
        "DOH Water Safety Compliant",
        "City Health Office Sanitary Permit 2026",
        "16-Stage Reverse Osmosis & UV Filtration",
      ],
      sampleReview: {
        author: "Elena R. (San Jose)",
        rating: 5,
        date: "2 days ago",
        comment:
          "Crystal clear water with zero chlorine taste. Kuya Jun delivered to our 2nd floor doorstep in 25 minutes!",
      },
    },
    {
      id: "ultra-pure",
      name: "Ultra Pure Water Refilling Station",
      address: "Purok Bakhaw A, Brgy. Kawit, Pagadian City",
      distanceKm: 1.4,
      rating: 4.7,
      reviewsCount: 88,
      pricePerGallon: 30,
      hours: "Mon–Sun 8:00 AM–6:00 PM",
      schedule: [
        { days: "Monday – Saturday", hours: "8:00 AM – 6:00 PM" },
        { days: "Sunday", hours: "8:00 AM – 4:00 PM" },
      ],
      phone: "0970 488 8866",
      waterTypes: ["Purified"],
      deliveryAvailable: false,
      deliveryFee: 0,
      deliveryRadiusKm: 0,
      deliveryCoverage: "Counter pickup only at Brgy. Kawit hub",
      pickupAvailable: true,
      minOrderGallons: 1,
      tag: "Lowest Price",
      coords: { lat: 7.831200, lng: 123.443700 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Container Refill",
          price: 30,
          unit: "per refill",
          desc: "Budget-friendly purified water refill",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Container Refill",
          price: 30,
          unit: "per refill",
          desc: "Classic round container refill",
        },
        {
          type: "new-bottle",
          name: "New 5-Gallon Bottle Deposit",
          price: 150,
          unit: "per bottle",
          desc: "BPA-free durable container",
        },
      ],
      certifications: [
        "Sanitary Inspection Grade A",
        "Dual UV Sterilization System",
      ],
      sampleReview: {
        author: "Mark G. (Brgy. Kawit)",
        rating: 5,
        date: "Last week",
        comment:
          "Lowest price in the area and very fast refill at the express counter.",
      },
    },
    {
      id: "waterpol",
      name: "Waterpol Water Refilling Station",
      address: "Purok Pagang, Brgy. Kawit, Pagadian City",
      distanceKm: 2.1,
      rating: 4.8,
      reviewsCount: 116,
      pricePerGallon: 35,
      hours: "Mon–Sat 7:00 AM–6:30 PM",
      schedule: [
        { days: "Monday – Saturday", hours: "7:00 AM – 6:30 PM" },
        { days: "Sunday", hours: "8:00 AM – 12:00 PM" },
      ],
      phone: "0927 251 4246",
      waterTypes: ["Purified", "Mineral"],
      deliveryAvailable: true,
      deliveryFee: 15,
      deliveryRadiusKm: 4.0,
      deliveryCoverage: "Kawit, Gatas, Danlugan, and nearby sitios",
      pickupAvailable: true,
      minOrderGallons: 2,
      tag: "Fast Delivery",
      coords: { lat: 7.834700, lng: 123.448100 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Refill (Purified)",
          price: 35,
          unit: "per refill",
          desc: "Pure distilled-grade drinking water",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Refill (Purified)",
          price: 35,
          unit: "per refill",
          desc: "Standard round water cooler bottle",
        },
        {
          type: "5-gal-mineral",
          name: "5-Gallon Natural Mineral Water",
          price: 35,
          unit: "per refill",
          desc: "Mineral-rich spring filtered water",
        },
        {
          type: "new-bottle",
          name: "New 5-Gallon Bottle Deposit",
          price: 160,
          unit: "per bottle",
          desc: "High quality Blue container",
        },
      ],
      certifications: [
        "DOH Microbiological Test Compliant",
        "Ozonation & Micro-Filtration Certified",
      ],
      sampleReview: {
        author: "Jocelyn T. (Gatas)",
        rating: 5,
        date: "3 days ago",
        comment:
          "Prompt delivery service! The delivery rider carries the bottles right into our dispenser.",
      },
    },
    {
      id: "pg-aquamaster",
      name: "PG Aquamaster Water Refilling Station",
      address: "Purok Makugihon, Brgy. Bulatok, Pagadian City",
      distanceKm: 2.9,
      rating: 4.6,
      reviewsCount: 64,
      pricePerGallon: 30,
      hours: "Mon–Sat 8:00 AM–5:00 PM",
      schedule: [
        { days: "Monday – Saturday", hours: "8:00 AM – 5:00 PM" },
        { days: "Sunday", hours: "Closed" },
      ],
      phone: "0951 312 5308",
      waterTypes: ["Purified"],
      deliveryAvailable: false,
      deliveryFee: 0,
      deliveryRadiusKm: 0,
      deliveryCoverage: "Walk-in & Drive-thru Counter at Brgy. Bulatok",
      pickupAvailable: true,
      minOrderGallons: 1,
      tag: "Standard",
      coords: { lat: 7.819800, lng: 123.429700 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Container Refill",
          price: 30,
          unit: "per refill",
          desc: "Standard purified refill",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Container Refill",
          price: 30,
          unit: "per refill",
          desc: "Classic round container refill",
        },
        {
          type: "bottled-case",
          name: "350ml Bottled Water (Box of 24)",
          price: 180,
          unit: "per box",
          desc: "Sealed single-serve bottles",
        },
      ],
      certifications: [
        "City Health Sanitation Permit",
        "Carbon Block & Sediment Filtered",
      ],
      sampleReview: {
        author: "Roberto S. (Bulatok)",
        rating: 4.5,
        date: "2 weeks ago",
        comment:
          "Friendly staff and clean refilling area. Perfect for quick counter pickups.",
      },
    },
    {
      id: "aquater",
      name: "Aqua'Ter SMN Water Refilling Station",
      address: "Beside DXPR Radio, San Jose District, Pagadian City",
      distanceKm: 1.1,
      rating: 4.9,
      reviewsCount: 204,
      pricePerGallon: 25,
      hours: "Mon–Sun 6:30 AM–7:00 PM",
      schedule: [
        { days: "Monday – Friday", hours: "6:30 AM – 7:00 PM" },
        { days: "Saturday – Sunday", hours: "7:00 AM – 6:00 PM" },
      ],
      phone: "0975 462 7620",
      waterTypes: ["Purified", "Mineral"],
      deliveryAvailable: true,
      deliveryFee: 15,
      deliveryRadiusKm: 3.0,
      deliveryCoverage: "San Jose, Tuburan, Santa Lucia & Poblacion",
      pickupAvailable: true,
      minOrderGallons: 1,
      tag: "Community Favorite",
      coords: { lat: 7.819100, lng: 123.441200 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Container Refill",
          price: 25,
          unit: "per refill",
          desc: "Top-grade purified refill",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Container Refill",
          price: 25,
          unit: "per refill",
          desc: "Round dispenser bottle refill",
        },
        {
          type: "5-gal-mineral",
          name: "5-Gallon Mineral Water Refill",
          price: 30,
          unit: "per refill",
          desc: "Alkaline & mineral fortified",
        },
        {
          type: "new-bottle",
          name: "New 5-Gallon Bottle Deposit",
          price: 150,
          unit: "per bottle",
          desc: "New food-grade container",
        },
      ],
      certifications: [
        "DOH Water Safety Compliant",
        "Multi-Stage Ozonation & RO Certified",
        "Barangay San Jose Top Sanitation Award",
      ],
      sampleReview: {
        author: "Ana Mae B. (Poblacion)",
        rating: 5,
        date: "Yesterday",
        comment:
          "Best value in Pagadian! Water is always fresh and rider always sends an SMS when approaching.",
      },
    },
    {
      id: "ph2o",
      name: "PH2O Water Refilling Station",
      address: "Warlito Pulmones St, Santiago District, Pagadian City",
      distanceKm: 3.4,
      rating: 4.8,
      reviewsCount: 92,
      pricePerGallon: 30,
      hours: "24/7 Automated Vendo & Counter",
      schedule: [
        { days: "Counter Service", hours: "Mon–Sun 7:00 AM – 8:00 PM" },
        { days: "Automated Vendo", hours: "24/7 (365 Days / Always Open)" },
      ],
      phone: "0985 337 4448",
      waterTypes: ["Purified", "Alkaline"],
      deliveryAvailable: true,
      deliveryFee: 20,
      deliveryRadiusKm: 4.5,
      deliveryCoverage: "Santiago, Balangasan, San Pedro District",
      pickupAvailable: true,
      minOrderGallons: 1,
      tag: "24/7 Vendo Available",
      coords: { lat: 7.836200, lng: 123.426400 },
      products: [
        {
          type: "5-gal-slim",
          name: "5-Gallon Slim Container Refill",
          price: 30,
          unit: "per refill",
          desc: "High purity purified water",
        },
        {
          type: "5-gal-round",
          name: "5-Gallon Round Container Refill",
          price: 30,
          unit: "per refill",
          desc: "Round bottle dispenser refill",
        },
        {
          type: "5-gal-alkaline",
          name: "5-Gallon Alkaline Water Refill",
          price: 40,
          unit: "per refill",
          desc: "Antioxidant ionized alkaline water",
        },
        {
          type: "1-gal-bottle",
          name: "1-Gallon Handy Jug Refill",
          price: 10,
          unit: "per jug",
          desc: "Quick vendo fill-up",
        },
      ],
      certifications: [
        "Automated Touchless Sanitization",
        "DOH Certified Laboratory Tested",
      ],
      sampleReview: {
        author: "Chris P. (Santiago)",
        rating: 5,
        date: "4 days ago",
        comment:
          "The 24/7 coin vendo is a lifesaver when you run out of water late at night. Super clean machine!",
      },
    },
    {
      id: "alka",
      name: "Alka Water Refilling Station",
      address: "Zone 11, Alta Tierra Subdivision, Tiguma, Pagadian City",
      pricePerGallon: 35,
      rating: 0,
      phone: "",
      hours: "",
      deliveryAvailable: true,
      pickupAvailable: true,
      coords: { lat: 7.840580, lng: 123.463360 },
    },
  ];

  // Seed Orders with 4-Stage Status Pipeline
  const DEFAULT_ORDERS = [
    {
      id: "AT-1048",
      stationId: "drink-refill",
      stationName: "DRINK n' REFILL Station",
      containers: [
        {
          type: "5-gal-slim",
          label: "5-Gallon Slim Container",
          count: 2,
          unitPrice: 35,
        },
      ],
      gallonsTotal: 2,
      fulfillment: "delivery",
      deliveryAddress: "Block 4, Lot 12, Sunrise Village, Brgy. San Jose",
      landmark: "Near Yellow Chapel",
      contactPhone: "+63 917 555 4321",
      paymentMethod: "Cash on Delivery",
      subtotal: 70.0,
      discount: 0.0,
      deliveryFee: 15.0,
      total: 85.0,
      pointsEarned: 20,
      status: "out-for-delivery", // pending | confirmed | out-for-delivery | completed
      timeline: [
        {
          status: "pending",
          label: "Order Placed",
          time: "10:15 AM, Today",
          done: true,
        },
        {
          status: "confirmed",
          label: "Confirmed & Refilled",
          time: "10:28 AM, Today",
          done: true,
        },
        {
          status: "out-for-delivery",
          label: "Out for Delivery (Rider: Kuya Jun)",
          time: "10:45 AM, Today",
          done: true,
        },
        {
          status: "completed",
          label: "Delivered & Completed",
          time: "Est. 11:15 AM",
          done: false,
        },
      ],
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: "AT-1042",
      stationId: "aquater",
      stationName: "Aqua'Ter SMN Station",
      containers: [
        {
          type: "5-gal-round",
          label: "5-Gallon Round Container",
          count: 6,
          unitPrice: 25,
        },
      ],
      gallonsTotal: 6,
      fulfillment: "delivery",
      deliveryAddress: "Block 4, Lot 12, Sunrise Village, Brgy. San Jose",
      landmark: "Near Yellow Chapel",
      contactPhone: "+63 917 555 4321",
      paymentMethod: "Cash on Delivery (COD)",
      subtotal: 150.0,
      discount: 15.0, // 10% volume discount for 6 gallons
      deliveryFee: 0.0,
      total: 135.0,
      pointsEarned: 60,
      status: "completed",
      timeline: [
        {
          status: "pending",
          label: "Order Placed",
          time: "Sep 23, 2:00 PM",
          done: true,
        },
        {
          status: "confirmed",
          label: "Confirmed by Station",
          time: "Sep 23, 2:10 PM",
          done: true,
        },
        {
          status: "out-for-delivery",
          label: "Delivered to Doorstep",
          time: "Sep 23, 2:40 PM",
          done: true,
        },
        {
          status: "completed",
          label: "Completed",
          time: "Sep 23, 2:50 PM",
          done: true,
        },
      ],
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Seed Subscriptions
  const DEFAULT_SUBSCRIPTIONS = [
    {
      id: "sub-8041",
      stationId: "drink-refill",
      stationName: "DRINK n' REFILL Purified Water",
      frequency: "weekly", // weekly | biweekly | monthly
      frequencyLabel: "Every Monday Morning",
      containerType: "5-Gallon Slim Container",
      gallonsPerRefill: 2,
      basePrice: 70.0,
      subscriptionDiscount: 7.0, // 10% off auto-renewal
      estimatedTotal: 63.0,
      status: "active", // active | paused | cancelled
      nextRefillDate: "Monday, Sep 28, 2026",
      deliveryAddress: "Block 4, Lot 12, Sunrise Village, Brgy. San Jose",
      paymentMethod: "Cash on Delivery",
      createdAt: "2026-08-10T08:00:00.000Z",
    },
  ];

  // Seed Loyalty & Redeemable Rewards
  const DEFAULT_LOYALTY = {
    balance: 240,
    tier: "Silver Refiller",
    nextTierPoints: 500,
    history: [
      {
        id: "lh-1",
        type: "earn",
        title: "Refill Order #AT-1048",
        points: 20,
        date: "Today, 10:15 AM",
      },
      {
        id: "lh-2",
        type: "earn",
        title: "September 3-Week Refill Streak",
        points: 25,
        date: "Sep 22, 2026",
      },
      {
        id: "lh-3",
        type: "earn",
        title: "Refill Order #AT-1042 (6 Gallons)",
        points: 60,
        date: "Sep 23, 2026",
      },
      {
        id: "lh-4",
        type: "welcome",
        title: "Welcome Account Bonus",
        points: 50,
        date: "Sep 01, 2026",
      },
    ],
    rewardsCatalog: [
      {
        id: "rew-30-off",
        name: "₱30 Refill Voucher",
        category: "Discount",
        pointsCost: 100,
        description:
          "Get ₱30 discount on your next pickup or delivery water order.",
        code: "AQUA30OFF",
      },
      {
        id: "rew-70-off",
        name: "₱70 Refill Voucher (2 Free Slim Refills)",
        category: "Discount",
        pointsCost: 200,
        description: "Enjoy ₱70 off any refill order of 2 or more containers.",
        code: "AQUA70FREE",
      },
      {
        id: "rew-caps",
        name: "5× Sanitary Container Caps & Seal Kit",
        category: "Merchandise",
        pointsCost: 150,
        description:
          "Pack of 5 hygienic non-spill bottle caps with tamper-evident blue seals.",
        code: "FREE-CAPS5",
      },
      {
        id: "rew-tumbler",
        name: "AquaTracker 750ml Stainless Insulated Tumbler",
        category: "Merchandise",
        pointsCost: 500,
        description:
          "Keep your purified water cold for up to 24 hours. Claimable at nearest station.",
        code: "CLAIM-TUMBLER",
      },
    ],
  };

  // Seed Notifications
  const DEFAULT_NOTIFICATIONS = [
    {
      id: "notif-1",
      title: "Order Out for Delivery!",
      message:
        "Kuya Jun is on the way with your 2x 5-gallon refill from DRINK n' REFILL Station.",
      type: "order",
      time: "15 mins ago",
      read: false,
    },
    {
      id: "notif-2",
      title: "Upcoming Subscription Refill",
      message:
        "Your weekly Monday refill (2 gallons) is scheduled for Sep 28. Tap to edit or pause.",
      type: "subscription",
      time: "1 hour ago",
      read: false,
    },
    {
      id: "notif-3",
      title: "Weekend Promo: Free Delivery",
      message:
        "Aqua'Ter SMN Station is offering 0 delivery fee for orders of 4+ gallons this weekend!",
      type: "promo",
      time: "Yesterday",
      read: true,
    },
  ];

  /* -------------------------------------------------------------
   * API STUB LAYER (API-Swappable Functions with inline boundaries)
   * ------------------------------------------------------------- */

  function initDataStores() {
    try {
      const storedStations = localStorage.getItem(STORE_KEYS.STATIONS);
      if (!storedStations) {
        localStorage.setItem(
          STORE_KEYS.STATIONS,
          JSON.stringify(DEFAULT_STATIONS)
        );
      } else {
        const stations = JSON.parse(storedStations);
        if (
          !Array.isArray(stations) ||
          stations.some(
            station =>
              !Number.isFinite(Number(station.pricePerGallon)) ||
              !Array.isArray(station.waterTypes) ||
              !Array.isArray(station.products) ||
              !Array.isArray(station.schedule)
          )
        ) {
          localStorage.setItem(
            STORE_KEYS.STATIONS,
            JSON.stringify(DEFAULT_STATIONS)
          );
        }
      }
      if (!localStorage.getItem(STORE_KEYS.ORDERS)) {
        localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(DEFAULT_ORDERS));
      }
      if (!localStorage.getItem(STORE_KEYS.SUBSCRIPTIONS)) {
        localStorage.setItem(
          STORE_KEYS.SUBSCRIPTIONS,
          JSON.stringify(DEFAULT_SUBSCRIPTIONS)
        );
      }
      if (!localStorage.getItem(STORE_KEYS.LOYALTY)) {
        localStorage.setItem(
          STORE_KEYS.LOYALTY,
          JSON.stringify(DEFAULT_LOYALTY)
        );
      }
      if (!localStorage.getItem(STORE_KEYS.NOTIFICATIONS)) {
        localStorage.setItem(
          STORE_KEYS.NOTIFICATIONS,
          JSON.stringify(DEFAULT_NOTIFICATIONS)
        );
      }
      if (!localStorage.getItem(STORE_KEYS.SAVED_STATIONS)) {
        localStorage.setItem(
          STORE_KEYS.SAVED_STATIONS,
          JSON.stringify(["drink-refill"])
        );
      }
    } catch (e) {
      console.warn("Storage initialization fallback", e);
    }
  }

  /**
   * API-Swappable Stub for: GET /api/stations
   * Fetches nearby stations with optional query and filters.
   */
  async function fetchStations(query = "", filter = "all") {
    initDataStores();
    let cached = JSON.parse(
      localStorage.getItem(STORE_KEYS.STATIONS) || "[]"
    );
    if (!cached.length) cached = DEFAULT_STATIONS;

    let stations = cached;
    try {
      const data = await apiFetch("/api/stations");
      const live = Array.isArray(data.stations) ? data.stations : [];
      if (live.length) {
        stations = live.map(station => {
          const local = cached.find(item => item.id === station.id)
            || DEFAULT_STATIONS.find(item => item.id === station.id)
            || {};
          return {
            ...local,
            ...station,
            name: station.name || local.name || "Water station",
            address: station.address || local.address || "",
            products: local.products || [],
            schedule: local.schedule || [{ days: "Daily", hours: "Call station" }],
            waterTypes: local.waterTypes || ["Purified"],
            pricePerGallon: local.pricePerGallon ?? 0,
          };
        });
      }
    } catch (error) {
      console.warn("Using cached stations:", error);
    }

    // Ensure fallback hydration of enriched properties if existing records are partial
    stations = stations.map(s => {
      const defaultMatch = DEFAULT_STATIONS.find(d => d.id === s.id);
      if (defaultMatch) {
        return {
          ...defaultMatch,
          ...s,
          products: s.products || defaultMatch.products,
          schedule: s.schedule || defaultMatch.schedule,
          sampleReview: s.sampleReview || defaultMatch.sampleReview,
          certifications: s.certifications || defaultMatch.certifications,
          deliveryFee:
            s.deliveryFee !== undefined
              ? s.deliveryFee
              : defaultMatch.deliveryFee,
          deliveryCoverage: s.deliveryCoverage || defaultMatch.deliveryCoverage,
          deliveryRadiusKm:
            s.deliveryRadiusKm !== undefined
              ? s.deliveryRadiusKm
              : defaultMatch.deliveryRadiusKm,
        };
      }
      return s;
    });

    if (query) {
      const q = query.toLowerCase();
      stations = stations.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.waterTypes.some(t => t.toLowerCase().includes(q))
      );
    }

    if (filter === "delivery") {
      stations = stations.filter(s => s.deliveryAvailable);
    } else if (filter === "top-rated") {
      stations = stations.filter(s => s.rating >= 4.8);
    } else if (filter === "lowest-price") {
      stations = [...stations].sort(
        (a, b) => a.pricePerGallon - b.pricePerGallon
      );
    }

    return stations;
  }

  /**
   * Fetches a specific station by ID with complete details.
   */
  async function fetchStationById(stationId) {
    const stations = await fetchStations();
    return stations.find(s => s.id === stationId) || null;
  }

  /**
   * Ranks refilling stations by straight-line distance from a point and keeps
   * only those within radiusKm, nearest first.
   *
   * Stations whose coordinates are missing or malformed are SKIPPED rather than
   * throwing, so a station registered before coordinates existed can never
   * break the order flow. Each returned station carries a live `distanceKm`.
   *
   * Pass radiusKm as null/undefined to rank every station with coordinates.
   *
   * API-Swappable Stub for: GET /api/stations/nearby?lat=&lng=&radiusKm=
   * The signature is deliberately shaped like that endpoint, so replacing this
   * with a real server query is a one-line change at the call sites.
   */
  function getNearestStations(stations, point, radiusKm) {
    if (!Array.isArray(stations) || !stations.length) return [];

    // Haversine maths is owned by location.js, which loads after this file.
    // Resolve it per call rather than at module scope so load order is moot.
    const measure =
      global.AquaLocation && typeof global.AquaLocation.distanceKm === "function"
        ? global.AquaLocation.distanceKm
        : null;
    if (!measure || !point) return [];

    const radius = Number(radiusKm);
    const limit = Number.isFinite(radius) && radius > 0 ? radius : Infinity;

    return stations
      .map((station) => {
        const km = measure(point, station && station.coords);
        // km === null means "no usable coordinates" - drop this station.
        return km === null ? null : { ...station, distanceKm: km };
      })
      .filter(Boolean)
      .filter((station) => station.distanceKm <= limit)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /**
   * API-Swappable Stub for: POST /api/orders
   * Submits a customer water refill order.
   */
  async function placeRefillOrder(orderPayload) {
    // Fail fast with readable messages before touching the network.
    const items =
      Array.isArray(orderPayload.items) && orderPayload.items.length
        ? orderPayload.items
        : orderPayload.containers || [];

    if (!orderPayload.stationId) {
      throw new Error("Choose a station before placing an order.");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Add at least one item to the order.");
    }

    const fulfillmentType =
      orderPayload.fulfillmentType ||
      (orderPayload.fulfillment === "pickup" ? "pickup" : "delivery");
    const isPickup = fulfillmentType === "pickup";

    if (isPickup && orderPayload.paymentMethod !== PICKUP_PAYMENT_METHOD) {
      throw new Error("Pickup orders must be paid at the counter.");
    }

    const payload = {
      ...orderPayload,
      items,
      containers: items,
      fulfillment: fulfillmentType,
      fulfillmentType,
      paymentMethod: isPickup
        ? PICKUP_PAYMENT_METHOD
        : orderPayload.paymentMethod,
    };

    // ORDER + ORDER_ITEM are written inside one transaction by the API.
    const data = await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const newOrder = data.order;

    // Mirror the persisted order into the shared station queue the staff
    // prototype UI reads. The database remains the source of truth.
    if (global.AquaCommon) {
      const stationOrders = global.AquaCommon.read(
        global.AquaCommon.STORE_KEYS.ORDERS,
        []
      );
      stationOrders.unshift({
        id: newOrder.id,
        userId: orderPayload.userId || "",
        customerName: newOrder.customerName,
        contactPhone: newOrder.contactPhone,
        stationId: newOrder.stationId,
        stationName: newOrder.stationName,
        stationAddress: newOrder.stationAddress,
        items: newOrder.items,
        gallons: newOrder.gallonsTotal,
        notes: newOrder.notes,
        fulfillment: newOrder.fulfillment,
        fulfillmentType: newOrder.fulfillmentType,
        paymentMethod: newOrder.paymentMethod,
        paymentStatus: newOrder.paymentStatus,
        status: isPickup ? "new" : "New order",
        total: newOrder.total,
        createdAt: newOrder.createdAt,
        updatedAt: newOrder.createdAt,
      });
      global.AquaCommon.write(
        global.AquaCommon.STORE_KEYS.ORDERS,
        stationOrders
      );
    }

    return { success: true, order: newOrder };
  }

  /**
   * API-Swappable Stub for: GET /api/orders
   * Retrieves user order history.
   */
  async function fetchOrders() {
    const data = await apiFetch("/api/orders");
    return Array.isArray(data.orders) ? data.orders : [];
  }

  /**
   * API-Swappable Stub for: PATCH /api/orders/:id/advance-demo
   * Advances the mock order status along the 4-stage pipeline for demo testing.
   */
  async function advanceOrderStatus(orderId) {
    const orders = await fetchOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return null;

    const stages = isPickupOrder(order)
      ? [...PICKUP_STATUS_FLOW]
      : ["pending", "confirmed", "out-for-delivery", "completed"];
    const currentIndex = stages.indexOf(order.status);
    if (currentIndex < 0 || currentIndex >= stages.length - 1) {
      return order;
    }

    const nextStage = stages[currentIndex + 1];
    const data = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStage }),
    });

    return data.order || order;
  }

  // ---------------------------------------------------------------------
  // COUNTER-PICKUP - station staff side
  //
  // Pickup and delivery orders share one ERD ORDER row, so staff status
  // changes are immediately visible to the customer dashboard.
  // ---------------------------------------------------------------------

  /** Incoming counter-pickup orders for one station, newest first. */
  async function fetchPickupOrders(stationId) {
    const data = await apiFetch("/api/staff/orders");
    const orders = Array.isArray(data.orders) ? data.orders : [];
    return orders
      .filter(
        (order) =>
          isPickupOrder(order) &&
          (!stationId || order.stationId === stationId)
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  /** PATCH /api/staff/orders/:id - advance a pickup order. */
  async function updatePickupOrderStatus(orderId, nextStatus) {
    const allowed = [...PICKUP_STATUS_FLOW, "cancelled"];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Unsupported pickup status: ${nextStatus}`);
    }

    const data = await apiFetch(
      `/api/staff/orders/${encodeURIComponent(orderId)}`,
      { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }
    );

    return data.order || null;
  }

  /**
   * API-Swappable Stub for: PATCH /api/orders/:id/collect-payment
   * Staff confirm the cash was collected: marks the order paid and completed.
   */
  async function markPickupOrderPaid(orderId) {
    const data = await apiFetch(
      `/api/staff/orders/${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", paymentStatus: "paid" }),
      }
    );

    return data.order || null;
  }

  /**
   * API-Swappable Stub for: GET /api/subscriptions
   */
  async function fetchSubscriptions() {
    const data = await apiFetch("/api/subscriptions");
    return Array.isArray(data.subscriptions) ? data.subscriptions : [];
  }

  /**
   * Persists a SUBSCRIPTION row (plus its SUBSCRIPTION_PLAN) for the customer.
   */
  async function createSubscription(subPayload) {
    if (!subPayload || !subPayload.stationId) {
      throw new Error("Choose a station for the subscription.");
    }

    const data = await apiFetch("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(subPayload),
    });

    return { success: true, subscription: data.subscription };
  }

  /**
   * API-Swappable Stub for: PATCH /api/subscriptions/:id
   */
  async function updateSubscriptionStatus(subId, newStatus) {
    const data = await apiFetch(
      `/api/subscriptions/${encodeURIComponent(subId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status: newStatus }) }
    );

    return { success: true, subscription: data.subscription };
  }

  /**
   * API-Swappable Stub for: GET /api/loyalty
   */
  async function fetchLoyalty() {
    const data = await apiFetch("/api/loyalty");
    return {
      balance: Number(data.balance || 0),
      tier: data.tier || "Bronze",
      nextTierPoints: Number(data.nextTierPoints || 500),
      history: Array.isArray(data.history) ? data.history : [],
      rewardsCatalog: Array.isArray(data.rewardsCatalog)
        ? data.rewardsCatalog
        : [],
    };
  }

  /**
   * Points are awarded server-side when an order is created. Kept as a
   * local-only shim so any remaining prototype callers fail soft.
   */
  async function addLoyaltyPoints(pts, reason) {
    const loyalty = await fetchLoyalty().catch(() => ({ ...DEFAULT_LOYALTY }));
    return loyalty;
  }

  /**
   * Deducts points and issues a CUSTOMER_REWARD voucher.
   */
  async function redeemLoyaltyReward(rewardId) {
    if (!rewardId) {
      throw new Error("Choose a reward to redeem.");
    }

    const data = await apiFetch("/api/rewards/redeem", {
      method: "POST",
      body: JSON.stringify({ rewardId }),
    });

    return {
      success: true,
      reward: data.reward,
      remainingBalance: Number(data.remainingBalance || 0),
    };
  }

  async function fetchNotifications() {
    const data = await apiFetch("/api/notifications");
    return Array.isArray(data.notifications) ? data.notifications : [];
  }

  async function pushNotification(notif) {
    if (!notif || !notif.title) {
      throw new Error("Notification title is required.");
    }

    const data = await apiFetch("/api/notifications", {
      method: "POST",
      body: JSON.stringify(notif),
    });

    return data.notification;
  }

  async function markAllNotificationsRead() {
    const data = await apiFetch("/api/notifications/read-all", {
      method: "PATCH",
    });

    return Array.isArray(data.notifications) ? data.notifications : [];
  }

  async function updateProfile(profile) {
    const data = await apiFetch("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(profile),
    });

    return data.user;
  }

  async function changePassword(currentPassword, newPassword) {
    return apiFetch("/api/profile/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /** ERD stores a single CUSTOMER.default_address. */
  async function updateAddress(address) {
    const data = await apiFetch("/api/profile/address", {
      method: "PATCH",
      body: JSON.stringify({ address }),
    });

    return data.address;
  }

  /**
   * API-Swappable Stub for: POST /api/stations/toggle-save
   *
   * Saved stations have no ERD table, so this remains device-local by design.
   */
  function toggleSavedStation(stationId) {
    initDataStores();
    let saved = JSON.parse(
      localStorage.getItem(STORE_KEYS.SAVED_STATIONS) || "[]"
    );
    if (saved.includes(stationId)) {
      saved = saved.filter(id => id !== stationId);
    } else {
      saved.push(stationId);
    }
    localStorage.setItem(STORE_KEYS.SAVED_STATIONS, JSON.stringify(saved));
    return saved;
  }

  function getSavedStations() {
    initDataStores();
    return JSON.parse(localStorage.getItem(STORE_KEYS.SAVED_STATIONS) || "[]");
  }

  // Export module globally
  const DashboardModule = {
    fetchStations,
    fetchStationById,
    getNearestStations,
    placeRefillOrder,
    fetchOrders,
    advanceOrderStatus,
    fetchPickupOrders,
    updatePickupOrderStatus,
    markPickupOrderPaid,
    isPickupOrder,
    PICKUP_PAYMENT_METHOD,
    PICKUP_STATUS_FLOW,
    PICKUP_TERMINAL,
    fetchSubscriptions,
    createSubscription,
    updateSubscriptionStatus,
    fetchLoyalty,
    redeemLoyaltyReward,
    fetchNotifications,
    pushNotification,
    markAllNotificationsRead,
    updateProfile,
    changePassword,
    updateAddress,
    toggleSavedStation,
    getSavedStations,
    initDataStores,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DashboardModule;
  } else {
    global.AquaDashboard = DashboardModule;
  }
})(typeof window !== "undefined" ? window : this);
