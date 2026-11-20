/**
 * AquaTracker location module.
 *
 * Owns the single customer location point: a one-shot browser geolocation
 * read triggered only by an explicit button press, plus manual pin placement on a
 * plain Leaflet map. The point is persisted locally and reused to rank the
 * nearest water refilling stations.
 *
 * Deliberately NOT a live-tracking module. There is no watchPosition and no
 * periodic polling - navigator.geolocation.getCurrentPosition runs once per
 * click with maximumAge 0, and the map is an ordinary pan/zoom map.
 */

(function (global) {
  "use strict";

  const STORE_KEYS = {
    LOCATION: "aquatracker_customer_location",
  };

  // Pagadian City - keep the initial map view over the station catalog.
  const DEFAULT_CENTER = { lat: 7.830000, lng: 123.441000 };
  const DEFAULT_ZOOM = 12;
  const FOCUS_ZOOM = 15;

  const LEAFLET_VERSION = "1.9.4";
  const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
  const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
  const LEAFLET_CSS_INTEGRITY = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
  const LEAFLET_JS_INTEGRITY = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";

  // Standard OpenStreetMap raster tiles - no API key, no account needed.
  const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // Short, non-technical copy. Codes are mapped to friendly sentences so the
  // customer never sees a raw GeolocationError.
  const FRIENDLY_MESSAGES = {
    1: "Location access was declined. You can drop a pin on the map instead.",
    2: "We couldn't read your location just now. Try again, or drop a pin on the map.",
    3: "Finding your location took too long. Try again, or drop a pin on the map.",
    unsupported: "This browser can't share your location. Drop a pin on the map instead.",
    unknown: "We couldn't read your location. Drop a pin on the map instead.",
  };

  let leafletPromise = null;
  let activeMap = null;
  let activeObserver = null;

  // -------------------------------------------------------------
  // Leaflet loader (CDN, lazy, once per page)
  // -------------------------------------------------------------
  function ensureLeaflet() {
    if (global.L) return Promise.resolve(global.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.integrity = LEAFLET_CSS_INTEGRITY;
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      const script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.integrity = LEAFLET_JS_INTEGRITY;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = () =>
        global.L ? resolve(global.L) : reject(new Error("unknown"));
      script.onerror = () => reject(new Error("unsupported"));
      document.head.appendChild(script);
    }).catch((error) => {
      // Let a later attempt retry instead of caching the failure forever.
      leafletPromise = null;
      throw error;
    });

    return leafletPromise;
  }

  // -------------------------------------------------------------
  // Validation + geo maths
  // -------------------------------------------------------------
  function isValidPoint(point) {
    if (!point) return false;
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    );
  }

  /** Great-circle distance between two points, in kilometres. */
  function distanceKm(from, to) {
    if (!isValidPoint(from) || !isValidPoint(to)) return null;

    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(Number(to.lat) - Number(from.lat));
    const dLng = toRad(Number(to.lng) - Number(from.lng));
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(from.lat))) *
        Math.cos(toRad(Number(to.lat))) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // -------------------------------------------------------------
  // Persistence - API-swappable stubs
  // -------------------------------------------------------------

  /**
   * API-Swappable Stub for: GET /api/customer/location
   * Returns the saved point as { lat, lng, label, updatedAt }, or null.
   */
  function getSavedLocation() {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/customer/location');
     * return await res.json();
     */
    try {
      const raw = localStorage.getItem(STORE_KEYS.LOCATION);
      if (!raw) return null;
      const point = JSON.parse(raw);
      return isValidPoint(point) ? point : null;
    } catch (error) {
      console.warn("Saved location unreadable, ignoring", error);
      return null;
    }
  }

  /**
   * API-Swappable Stub for: POST /api/customer/location
   * Normalises and persists { lat, lng, label, updatedAt }.
   */
  async function saveLocation(point) {
    /* BACKEND INTEGRATION STUB:
     * const res = await fetch('/api/customer/location', {
     *   method: 'POST',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify(record),
     * });
     * return await res.json();
     */
    const record = {
      lat: Number(point.lat),
      lng: Number(point.lng),
      label: point.label || "Pinned on map",
      updatedAt: new Date().toISOString(),
    };

    if (!isValidPoint(record)) throw new Error("Invalid location point");

    localStorage.setItem(STORE_KEYS.LOCATION, JSON.stringify(record));
    return record;
  }

  /** API-Swappable Stub for: DELETE /api/customer/location */
  function clearSavedLocation() {
    /* BACKEND INTEGRATION STUB:
     * await fetch('/api/customer/location', { method: 'DELETE' });
     */
    localStorage.removeItem(STORE_KEYS.LOCATION);
  }

  // -------------------------------------------------------------
  // One-shot geolocation
  // -------------------------------------------------------------

  /**
   * Reads the device position exactly once.
   *
   * Called only from the "Use my current location" button - never on page
   * load, never on a timer, and never through watchPosition. Rejects with a
   * key from FRIENDLY_MESSAGES rather than a GeolocationError object.
   */
  function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
      const geolocation = global.navigator && global.navigator.geolocation;
      if (!geolocation) {
        reject(new Error("unsupported"));
        return;
      }

      geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }),
        (error) => reject(new Error(error && error.code ? String(error.code) : "unknown")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  function friendlyMessage(reason) {
    return FRIENDLY_MESSAGES[reason] || FRIENDLY_MESSAGES.unknown;
  }

  /**
   * Wires the "Use my current location" button: one read per click, a loading
   * state while pending, friendly copy on failure, manual pinning still open.
   * Returns an unsubscribe function.
   */
  function bindLocateButton(button, handlers = {}) {
    if (!button) return null;
    const label = button.querySelector("[data-locate-label]") || button;

    const onClick = async () => {
      if (button.disabled) return;

      const idleText = label.textContent;
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
      label.textContent = "Locating…";

      try {
        const coords = await requestCurrentPosition();
        const record = await saveLocation({
          lat: coords.lat,
          lng: coords.lng,
          label: "Current location",
        });
        if (handlers.onLocated) handlers.onLocated(record);
        return record;
      } catch (error) {
        const message = friendlyMessage(error.message);
        if (handlers.onError) handlers.onError(message);
        return null;
      } finally {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
        label.textContent = idleText;
      }
    };

    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  }

  // -------------------------------------------------------------
  // Map
  // -------------------------------------------------------------

  const USER_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';

  const STATION_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="16.5" height="16.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7s6 6.2 6 10.4a6 6 0 0 1-12 0C6 8.9 12 2.7 12 2.7z"/></svg>';

  function makeDivIcon(L, svg, { size = 34, ring = "#0b7d80" } = {}) {
    // divIcon avoids Leaflet's default marker sprites, whose image paths are
    // resolved relative to the stylesheet - unreliable behind a CDN.
    return L.divIcon({
      className: "aq-map-marker",
      html: `<span class="aq-map-pin" style="width:${size}px;height:${size}px;background:${ring};box-shadow:0 4px 12px rgba(7,59,76,.35)">${svg}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  }

  function escapePopupText(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    if (!text || /^(undefined|null)$/i.test(text)) return "";
    return text.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function buildStationPopup(station) {
    const name = escapePopupText(station.name);
    const address = escapePopupText(station.address);
    const hours = escapePopupText(station.hours);
    const stationId = escapePopupText(station.id);
    const status = escapePopupText(station.status).toLowerCase();
    const statusKnown = Boolean(status);
    const explicitlyUnavailable = ["closed", "inactive", "disabled", "maintenance", "paused", "suspended", "pending", "deleted", "archived", "0", "false"].includes(status);
    // The public station list is orderable unless it explicitly says otherwise.
    const isOpen = !statusKnown || !explicitlyUnavailable;
    const isClosed = ["closed", "inactive", "paused", "suspended"].includes(status);
    const available = isOpen && Boolean(stationId);
    const price = Number(station.pricePerGallon);
    const hasPrice =
      station.pricePerGallon !== null &&
      station.pricePerGallon !== undefined &&
      String(station.pricePerGallon).trim() !== "" &&
      Number.isFinite(price) &&
      price > 0;
    const fields = [
      address && `<p class="station-popup-field"><strong>Address</strong> ${address}</p>`,
      hasPrice &&
        `<p class="station-popup-field"><strong>Price</strong> ₱${price.toFixed(2)} / 5-gallon refill</p>`,
      hours && `<p class="station-popup-field"><strong>Hours</strong> ${hours}</p>`,
    ].filter(Boolean).join("");
    const statusBadge = statusKnown
      ? `<span class="station-popup-status ${isOpen ? "station-popup-status-open" : "station-popup-status-closed"}">${isOpen ? "Open" : (isClosed ? "Closed" : "Unavailable")}</span>`
      : `<span class="station-popup-status station-popup-status-closed">${isOpen ? "Open" : "Unavailable"}</span>`;
    const reason = !stationId
      ? "This station is unavailable for ordering."
      : isOpen
        ? ""
        : isClosed
          ? "This station is currently closed."
          : "This station is currently unavailable for orders.";

    return `<div class="station-popup-content">
      ${name ? `<strong class="station-popup-title">${name}</strong>` : ""}
      ${statusBadge}
      <div class="station-popup-fields">${fields}</div>
      <button class="station-popup-order" type="button" data-station-popup-order data-station-id="${stationId}"${available ? "" : " disabled"}>Order Water</button>
      ${reason ? `<p class="station-popup-reason">${reason}</p>` : ""}
    </div>`;
  }

  /** Tears down the map built by a previous render, if any. */
  function destroyMap() {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
    if (activeMap) {
      activeMap.off();
      activeMap.remove();
      activeMap = null;
    }
  }

  /**
   * Builds the interactive map inside containerId.
   *
   * Restores the saved point when there is one, otherwise centres on Pagadian
   * City. Clicking the map saves a new point; the marker itself is fixed.
   * options.onChange(record) fires whenever the point changes.
   */
  async function initLocationMap(containerId, options = {}) {
    const container =
      typeof containerId === "string"
        ? document.getElementById(containerId)
        : containerId;
    if (!container) return null;

    let L;
    try {
      L = await ensureLeaflet();
    } catch (error) {
      console.warn("Map unavailable", error);
      return null;
    }

    // The station finder re-renders its markup on every visit, which orphans
    // the previous map. Clean it up before building a new one.
    destroyMap();

    const saved = getSavedLocation();
    const start = saved
      ? { lat: Number(saved.lat), lng: Number(saved.lng) }
      : DEFAULT_CENTER;

    const map = L.map(container, {
      center: [start.lat, start.lng],
      zoom: saved ? FOCUS_ZOOM : DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

    const marker = L.marker([start.lat, start.lng], {
      icon: makeDivIcon(L, USER_ICON_SVG, { size: 43, ring: "#0b7d80" }),
      draggable: false,
      keyboard: true,
      title: "Your location",
    }).addTo(map);

    const stationLayer = L.layerGroup().addTo(map);
    const stationMarkers = new Map();
    if (Array.isArray(options.stations)) renderStationPins(options.stations);

    function renderStationPins(stations) {
      const activeStationIds = new Set();
      stations.forEach((station) => {
        if (!isValidPoint(station.coords) || station.id === null || station.id === undefined) return;
        const stationId = String(station.id);
        const coordinates = [Number(station.coords.lat), Number(station.coords.lng)];
        const tooltipName = escapePopupText(station.name);
        let stationMarker = stationMarkers.get(stationId);
        if (!stationMarker) {
          stationMarker = L.marker(coordinates, {
            icon: makeDivIcon(L, STATION_ICON_SVG, { size: 33, ring: "#e67e22" }),
            title: station.name,
            keyboard: false,
          })
            .bindTooltip(tooltipName, {
              direction: "top",
              offset: [0, -15],
            });
          stationMarker
            .bindPopup(buildStationPopup(station))
            .on("popupopen", (event) => {
              const button = event.popup
                .getElement()
                .querySelector("[data-station-popup-order]");
              if (!button || button.disabled || button.dataset.bound === "true") return;
              button.dataset.bound = "true";
              button.addEventListener("click", () => {
                const popupStationId = button.dataset.stationId;
                if (popupStationId && typeof global.switchSection === "function") {
                  global.switchSection("order-refills", popupStationId);
                }
              });
            });
          stationMarkers.set(stationId, stationMarker);
        } else {
          stationMarker.setLatLng(coordinates);
          stationMarker.setTooltipContent(tooltipName);
          stationMarker.setPopupContent(buildStationPopup(station));
          stationMarker.options.title = station.name;
          if (stationMarker.getElement()) stationMarker.getElement().title = station.name || "";
        }
        if (!stationLayer.hasLayer(stationMarker)) stationMarker.addTo(stationLayer);
        activeStationIds.add(stationId);
      });

      stationMarkers.forEach((stationMarker, stationId) => {
        if (activeStationIds.has(stationId)) return;
        stationLayer.removeLayer(stationMarker);
        stationMarkers.delete(stationId);
      });
    }

    /**
     * Moves the marker to a point and zooms in. Presentation only - it does
     * not persist, because the locate button has already saved by the time it
     * calls this. Saves happen in commit(), driven by map clicks and drags.
     */
    function focusPoint(record) {
      marker.setLatLng([Number(record.lat), Number(record.lng)]);
      marker.setTooltipContent(record.label || "Your location");
      map.setView([Number(record.lat), Number(record.lng)], FOCUS_ZOOM, {
        animate: true,
      });
      return marker.getLatLng();
    }

    async function commit(partial) {
      try {
        const record = await saveLocation({
          lat: partial.lat,
          lng: partial.lng,
          label: partial.label,
        });
        if (typeof options.onChange === "function") options.onChange(record);
        return record;
      } catch (error) {
        console.warn("Could not save location", error);
        return null;
      }
    }

    map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      marker.setLatLng([lat, lng]);
      commit({ lat, lng, label: "Pinned on map" });
    });

    // A hidden tab or a closed modal collapses the container; Leaflet caches
    // the stale size, so nudge it whenever the box is measured again.
    if (typeof ResizeObserver !== "undefined") {
      activeObserver = new ResizeObserver(() => map.invalidateSize());
      activeObserver.observe(container);
    }

    const handle = {
      map,
      marker,
      getPoint: () => {
        const { lat, lng } = marker.getLatLng();
        return { lat, lng };
      },
      focusPoint,
      renderStationPins,
      invalidateSize: () => map.invalidateSize(),
      destroy: destroyMap,
    };

    activeMap = map;
    return handle;
  }

  const AquaLocation = {
    STORE_KEYS,
    DEFAULT_CENTER,
    getSavedLocation,
    saveLocation,
    clearSavedLocation,
    initLocationMap,
    destroyMap,
    bindLocateButton,
    requestCurrentPosition,
    friendlyMessage,
    distanceKm,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AquaLocation;
  } else {
    global.AquaLocation = AquaLocation;
  }
})(typeof window !== "undefined" ? window : this);
