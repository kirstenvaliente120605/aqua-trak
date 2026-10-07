/**
 * AquaTracker — Customer-Specific Logic (customer.js)
 *
 * Handles buyer-facing flows: finding stations, ordering, and loyalty.
 */

(function (global) {
  "use strict";

  // Constants for Customer Store (Extending Common)
  const STORE_KEYS = global.AquaCommon.STORE_KEYS;

  async function placeRefillOrder(orderPayload) {
    /* BACKEND INTEGRATION STUB: POST /api/orders */
    const orders = JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS) || "[]");
    const newId = "AT-" + Math.floor(1000 + Math.random() * 9000);

    const newOrder = {
      id: newId,
      userId: global.AquaAuth.getCurrentUser().userId,
      stationId: orderPayload.stationId,
      stationName: orderPayload.stationName || "Water Refilling Station",
      containers: orderPayload.containers,
      gallonsTotal: orderPayload.gallonsTotal,
      fulfillment: orderPayload.fulfillment,
      deliveryAddress: orderPayload.deliveryAddress,
      landmark: orderPayload.landmark || "None specified",
      contactPhone: orderPayload.contactPhone,
      paymentMethod: orderPayload.paymentMethod,
      subtotal: orderPayload.subtotal,
      discount: orderPayload.discount,
      deliveryFee: orderPayload.deliveryFee,
      total: orderPayload.total,
      status: "pending",
      timeline: [
        { status: "pending", label: "Order Received", time: "Just now", done: true },
        { status: "confirmed", label: "Preparing Refill", time: "Pending", done: false },
        { status: "out-for-delivery", label: "Out for Delivery", time: "Pending", done: false },
        { status: "completed", label: "Completed", time: "Pending", done: false },
      ],
      createdAt: new Date().toISOString(),
    };

    orders.unshift(newOrder);
    localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));

    await global.AquaCommon.pushNotification({
      title: `Order #${newId} Placed!`,
      message: `Your refill order from ${newOrder.stationName} was placed.`,
      type: "order",
    });

    return { success: true, order: newOrder };
  }

  async function createSubscription(subPayload) {
    /* BACKEND INTEGRATION STUB: POST /api/subscriptions */
    const subs = JSON.parse(localStorage.getItem("aquatracker_customer_subscriptions") || "[]");
    const newSub = {
      id: "sub-" + Math.floor(1000 + Math.random() * 9000),
      ...subPayload,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    subs.unshift(newSub);
    localStorage.setItem("aquatracker_customer_subscriptions", JSON.stringify(subs));
    return { success: true, subscription: newSub };
  }

  async function redeemLoyaltyReward(rewardId) {
    /* BACKEND INTEGRATION STUB: POST /api/loyalty/redeem */
    const loyalty = JSON.parse(localStorage.getItem("aquatracker_customer_loyalty") || "{}");
    // Simplified check for prototype
    loyalty.balance -= 100;
    localStorage.setItem("aquatracker_customer_loyalty", JSON.stringify(loyalty));
    return { success: true, rewardId };
  }

  const AquaCustomer = {
    placeRefillOrder,
    createSubscription,
    redeemLoyaltyReward,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AquaCustomer;
  } else {
    global.AquaCustomer = AquaCustomer;
  }
})(typeof window !== "undefined" ? window : this);
