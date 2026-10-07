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
      coords: { lat: 7.8269, lng: 123.4371 },
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
      coords: { lat: 7.8312, lng: 123.4437 },
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
      coords: { lat: 7.8347, lng: 123.4481 },
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
      coords: { lat: 7.8198, lng: 123.4297 },
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
      coords: { lat: 7.8191, lng: 123.4412 },
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
      coords: { lat: 7.8362, lng: 123.4264 },
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
    /* BACKEND INTEGRATION STUB:
     * const params = new URLSearchParams({ search: query, filter });
     * const res = await fetch(`/api/stations?${params}`);
     * return await res.json();
     */
    initDataStores();
    let stations = JSON.parse(
      localStorage.getItem(STORE_KEYS.STATIONS) || "[]"
    );
    if (!stations.length) stations = DEFAULT_STATIONS;

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
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/orders', {
     *   method: 'POST',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify(orderPayload)
     * });
     * return await res.json();
     * PROTOTYPE LIMITATION: Simulated payment gateway & simulated SMS rider dispatch.
     */
    initDataStores();

    // Normalise fulfillment once - every downstream branch keys off this.
    const fulfillmentType =
      orderPayload.fulfillmentType || orderPayload.fulfillment === "pickup"
        ? orderPayload.fulfillmentType ||
          (orderPayload.fulfillment === "pickup" ? "pickup" : "delivery")
        : "delivery";
    const isPickup = fulfillmentType === "pickup";

    // Guard on the data, not on the UI. Pickup has exactly one valid payment
    // method; anything else is a bad request and must not be persisted.
    if (isPickup && orderPayload.paymentMethod !== PICKUP_PAYMENT_METHOD) {
      throw new Error(
        "Pickup orders must be paid at the counter (pay_at_counter)."
      );
    }

    const orders = JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS) || "[]");
    const newId = "AT-" + Math.floor(1000 + Math.random() * 9000);
    const items = Array.isArray(orderPayload.items) && orderPayload.items.length
      ? orderPayload.items
      : orderPayload.containers || [];

    const newOrder = {
      id: newId,
      stationId: orderPayload.stationId,
      stationName: orderPayload.stationName || "Water Refilling Station",
      stationAddress: orderPayload.stationAddress || "",
      customerName: orderPayload.customerName || "AquaTracker Customer",
      contactPhone: orderPayload.contactPhone || "",
      // `items` is the canonical field; `containers` is kept as the legacy
      // alias the existing order cards still read.
      items,
      containers: items,
      gallonsTotal: orderPayload.gallonsTotal,
      fulfillment: fulfillmentType,
      fulfillmentType,
      deliveryAddress: isPickup ? "" : orderPayload.deliveryAddress || "",
      landmark: isPickup ? "" : orderPayload.landmark || "None specified",
      notes: orderPayload.notes || "",
      paymentMethod: isPickup ? PICKUP_PAYMENT_METHOD : orderPayload.paymentMethod,
      // Counter orders stay unpaid until station staff confirm the cash.
      paymentStatus: isPickup ? "unpaid" : "paid",
      subtotal: orderPayload.subtotal,
      discount: orderPayload.discount,
      // Counter pickup carries no delivery fee.
      deliveryFee: isPickup ? 0 : Number(orderPayload.deliveryFee || 0),
      total: isPickup
        ? Math.max(0, Number(orderPayload.subtotal || 0) - Number(orderPayload.discount || 0))
        : orderPayload.total,
      pointsEarned: orderPayload.gallonsTotal * 10,
      status: isPickup ? "new" : "pending",
      timeline: isPickup
        ? [
            { status: "new", label: "Order Received at Station", time: "Just now", done: true },
            { status: "preparing", label: "Station Preparing Refill", time: "Pending", done: false },
            { status: "ready_for_pickup", label: "Ready for Counter Pickup", time: "Pending", done: false },
            { status: "completed", label: "Picked Up & Paid", time: "Pending", done: false },
          ]
        : [
            {
              status: "pending",
              label: "Order Received at Station",
              time: "Just now",
              done: true,
            },
            {
              status: "confirmed",
              label: "Station Preparing Refill",
              time: "Pending",
              done: false,
            },
            {
              status: "out-for-delivery",
              label:
                orderPayload.fulfillment === "delivery"
                  ? "Out for Delivery"
                  : "Ready for Counter Pickup",
              time: "Pending",
              done: false,
            },
            {
              status: "completed",
              label: "Completed",
              time: "Pending",
              done: false,
            },
          ],
      createdAt: new Date().toISOString(),
    };

    orders.unshift(newOrder);
    localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));

    // Mirror prototype customer orders into the shared owner/staff station
    // queue. This is the SAME order the staff console works on, so it carries
    // the full fulfillment/payment shape rather than a reduced copy.
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

    // Award loyalty points
    await addLoyaltyPoints(newOrder.pointsEarned, `Refill Order #${newId}`);

    // Create notification
    await pushNotification({
      title: `Order #${newId} Placed!`,
      message: isPickup
        ? `Your pickup order (${newOrder.gallonsTotal} gal) from ${newOrder.stationName} is being prepared. Pay ₱${newOrder.total.toFixed(2)} at the counter.`
        : `Your refill order (${newOrder.gallonsTotal} gal) from ${newOrder.stationName} was placed.`,
      type: "order",
    });

    return { success: true, order: newOrder };
  }

  /**
   * API-Swappable Stub for: GET /api/orders
   * Retrieves user order history.
   */
  async function fetchOrders() {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/orders');
     * return await res.json();
     */
    initDataStores();
    return JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS) || "[]");
  }

  /**
   * API-Swappable Stub for: PATCH /api/orders/:id/advance-demo
   * Advances the mock order status along the 4-stage pipeline for demo testing.
   */
  async function advanceOrderStatus(orderId) {
    initDataStores();
    const orders = JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS) || "[]");
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;

    const stages = ["pending", "confirmed", "out-for-delivery", "completed"];
    const currentIndex = stages.indexOf(order.status);
    if (currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      order.status = nextStage;

      const timelineIdx = order.timeline.findIndex(t => t.status === nextStage);
      if (timelineIdx !== -1) {
        order.timeline[timelineIdx].done = true;
        order.timeline[timelineIdx].time = "Just now";
      }

      localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));

      await pushNotification({
        title: `Order #${order.id} Updated: ${nextStage.replace(/-/g, " ").toUpperCase()}`,
        message: `Your water refill is now: ${order.timeline[timelineIdx]?.label || nextStage}`,
        type: "order",
      });
    }

    return order;
  }

  // ---------------------------------------------------------------------
  // COUNTER-PICKUP — station staff side
  //
  // These operate on the SAME order records the staff console already reads
  // (the shared station queue). There is no separate pickup store: the
  // customer record and the station record are two views of one order, so
  // every write below is mirrored back onto both.
  // ---------------------------------------------------------------------

  /** The shared station-side order store. */
  function stationOrderStore() {
    if (!global.AquaCommon) return { key: "aquatracker_orders_db", read: () => [], write: () => {} };
    return {
      key: global.AquaCommon.STORE_KEYS.ORDERS,
      read: () => global.AquaCommon.read(global.AquaCommon.STORE_KEYS.ORDERS, []),
      write: (orders) => global.AquaCommon.write(global.AquaCommon.STORE_KEYS.ORDERS, orders),
    };
  }

  /**
   * API-Swappable Stub for: GET /api/stations/:stationId/pickup-orders
   * Incoming counter-pickup orders for one station, newest first.
   */
  async function fetchPickupOrders(stationId) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch(`/api/stations/${stationId}/pickup-orders`);
     * return await res.json();
     */
    initDataStores();
    return stationOrderStore()
      .read()
      .filter(
        (order) =>
          isPickupOrder(order) &&
          (!stationId || order.stationId === stationId)
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  /**
   * API-Swappable Stub for: PATCH /api/orders/:id/status
   * Advances a pickup order along PICKUP_STATUS_FLOW and mirrors the change
   * onto the customer's own order record so their history stays in step.
   */
  async function updatePickupOrderStatus(orderId, nextStatus) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch(`/api/orders/${orderId}/status`, {
     *   method: 'PATCH',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ status: nextStatus }),
     * });
     * return await res.json();
     */
    initDataStores();
    const allowed = [...PICKUP_STATUS_FLOW, "cancelled"];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Unsupported pickup status: ${nextStatus}`);
    }

    const store = stationOrderStore();
    const orders = store.read();
    const order = orders.find((o) => o.id === orderId && isPickupOrder(o));
    if (!order) return null;

    const now = new Date().toISOString();
    order.status = nextStatus;
    order.updatedAt = now;
    store.write(orders);

    // Mirror onto the customer-side record so their tracking card updates.
    const customerOrders = JSON.parse(
      localStorage.getItem(STORE_KEYS.ORDERS) || "[]"
    );
    const mirror = customerOrders.find((o) => o.id === orderId);
    if (mirror) {
      mirror.status = nextStatus;
      mirror.updatedAt = now;
      const stage = (mirror.timeline || []).find((t) => t.status === nextStatus);
      if (stage) {
        stage.done = true;
        stage.time = "Just now";
      }
      localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(customerOrders));
    }

    return order;
  }

  /**
   * API-Swappable Stub for: PATCH /api/orders/:id/collect-payment
   * Staff confirm the cash was collected: marks the order paid and completed.
   */
  async function markPickupOrderPaid(orderId) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch(`/api/orders/${orderId}/collect-payment`, {
     *   method: 'PATCH',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ paymentStatus: 'paid' }),
     * });
     * return await res.json();
     */
    const updated = await updatePickupOrderStatus(orderId, "completed");
    if (!updated) return null;

    const store = stationOrderStore();
    const orders = store.read();
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      const paidAt = new Date().toISOString();
      order.paymentStatus = "paid";
      order.paidAt = paidAt;
      order.amountCollected = Number(order.total || 0);
      store.write(orders);
      updated.paymentStatus = "paid";
      updated.paidAt = paidAt;
      updated.amountCollected = Number(order.total || 0);
    }

    // Keep the customer's copy truthful about payment.
    const customerOrders = JSON.parse(
      localStorage.getItem(STORE_KEYS.ORDERS) || "[]"
    );
    const mirror = customerOrders.find((o) => o.id === orderId);
    if (mirror) {
      mirror.paymentStatus = "paid";
      mirror.paidAt = updated.paidAt;
      localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(customerOrders));
    }

    return updated;
  }

  /**
   * API-Swappable Stub for: GET /api/subscriptions
   */
  async function fetchSubscriptions() {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/subscriptions');
     * return await res.json();
     */
    initDataStores();
    return JSON.parse(localStorage.getItem(STORE_KEYS.SUBSCRIPTIONS) || "[]");
  }

  /**
   * API-Swappable Stub for: POST /api/subscriptions
   */
  async function createSubscription(subPayload) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/subscriptions', { method: 'POST', body: JSON.stringify(subPayload) });
     * return await res.json();
     */
    initDataStores();
    const subs = JSON.parse(
      localStorage.getItem(STORE_KEYS.SUBSCRIPTIONS) || "[]"
    );
    const newSub = {
      id: "sub-" + Math.floor(1000 + Math.random() * 9000),
      stationId: subPayload.stationId,
      stationName: subPayload.stationName,
      frequency: subPayload.frequency,
      frequencyLabel:
        subPayload.frequency === "weekly"
          ? "Every Week"
          : subPayload.frequency === "biweekly"
            ? "Every 2 Weeks"
            : "Every Month",
      containerType: subPayload.containerType || "5-Gallon Container",
      gallonsPerRefill: subPayload.gallonsPerRefill,
      basePrice: subPayload.basePrice,
      subscriptionDiscount: subPayload.basePrice * 0.1,
      estimatedTotal: subPayload.basePrice * 0.9,
      status: "active",
      nextRefillDate: "Next refill in 7 days",
      deliveryAddress: subPayload.deliveryAddress,
      paymentMethod: subPayload.paymentMethod || "Cash on Delivery",
      createdAt: new Date().toISOString(),
    };

    subs.unshift(newSub);
    localStorage.setItem(STORE_KEYS.SUBSCRIPTIONS, JSON.stringify(subs));

    await pushNotification({
      title: "Subscription Activated!",
      message: `Recurring refill plan registered with ${newSub.stationName} (10% discount applied).`,
      type: "subscription",
    });

    return { success: true, subscription: newSub };
  }

  /**
   * API-Swappable Stub for: PATCH /api/subscriptions/:id
   */
  async function updateSubscriptionStatus(subId, newStatus) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch(`/api/subscriptions/${subId}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
     * return await res.json();
     */
    initDataStores();
    const subs = JSON.parse(
      localStorage.getItem(STORE_KEYS.SUBSCRIPTIONS) || "[]"
    );
    const sub = subs.find(s => s.id === subId);
    if (!sub) return { success: false, error: "Subscription not found" };

    sub.status = newStatus;
    localStorage.setItem(STORE_KEYS.SUBSCRIPTIONS, JSON.stringify(subs));

    await pushNotification({
      title: `Subscription ${newStatus.toUpperCase()}`,
      message: `Your refill plan with ${sub.stationName} has been ${newStatus}.`,
      type: "subscription",
    });

    return { success: true, subscription: sub };
  }

  /**
   * API-Swappable Stub for: GET /api/loyalty
   */
  async function fetchLoyalty() {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/loyalty');
     * return await res.json();
     */
    initDataStores();
    return JSON.parse(
      localStorage.getItem(STORE_KEYS.LOYALTY) ||
        JSON.stringify(DEFAULT_LOYALTY)
    );
  }

  /**
   * API-Swappable Stub for: POST /api/loyalty/points
   */
  async function addLoyaltyPoints(pts, reason) {
    initDataStores();
    const loyalty = JSON.parse(
      localStorage.getItem(STORE_KEYS.LOYALTY) ||
        JSON.stringify(DEFAULT_LOYALTY)
    );
    loyalty.balance += pts;
    loyalty.history.unshift({
      id: "lh-" + Date.now(),
      type: "earn",
      title: reason,
      points: pts,
      date: "Just now",
    });
    localStorage.setItem(STORE_KEYS.LOYALTY, JSON.stringify(loyalty));
    return loyalty;
  }

  /**
   * API-Swappable Stub for: POST /api/loyalty/redeem
   */
  async function redeemLoyaltyReward(rewardId) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) });
     * return await res.json();
     */
    initDataStores();
    const loyalty = JSON.parse(
      localStorage.getItem(STORE_KEYS.LOYALTY) ||
        JSON.stringify(DEFAULT_LOYALTY)
    );
    const reward = loyalty.rewardsCatalog.find(r => r.id === rewardId);
    if (!reward) return { success: false, error: "Reward not found." };

    if (loyalty.balance < reward.pointsCost) {
      return {
        success: false,
        error: `Insufficient points! You need ${reward.pointsCost} points but currently have ${loyalty.balance}.`,
      };
    }

    loyalty.balance -= reward.pointsCost;
    loyalty.history.unshift({
      id: "lh-" + Date.now(),
      type: "redeem",
      title: `Redeemed: ${reward.name}`,
      points: -reward.pointsCost,
      date: "Just now",
    });

    localStorage.setItem(STORE_KEYS.LOYALTY, JSON.stringify(loyalty));

    await pushNotification({
      title: "Reward Redeemed!",
      message: `You claimed "${reward.name}". Use voucher code "${reward.code}" on checkout.`,
      type: "promo",
    });

    return { success: true, reward, remainingBalance: loyalty.balance };
  }

  /**
   * API-Swappable Stub for: GET /api/notifications
   */
  async function fetchNotifications() {
    initDataStores();
    return JSON.parse(localStorage.getItem(STORE_KEYS.NOTIFICATIONS) || "[]");
  }

  /**
   * API-Swappable Stub for: POST /api/notifications
   */
  async function pushNotification(notif) {
    initDataStores();
    const notifs = JSON.parse(
      localStorage.getItem(STORE_KEYS.NOTIFICATIONS) || "[]"
    );
    const newNotif = {
      id: "notif-" + Date.now(),
      title: notif.title,
      message: notif.message,
      type: notif.type || "info",
      time: "Just now",
      read: false,
    };
    notifs.unshift(newNotif);
    localStorage.setItem(STORE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    return newNotif;
  }

  /**
   * API-Swappable Stub for: POST /api/notifications/mark-read
   */
  async function markAllNotificationsRead() {
    initDataStores();
    const notifs = JSON.parse(
      localStorage.getItem(STORE_KEYS.NOTIFICATIONS) || "[]"
    );
    notifs.forEach(n => (n.read = true));
    localStorage.setItem(STORE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    return notifs;
  }

  /**
   * API-Swappable Stub for: POST /api/stations/toggle-save
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
