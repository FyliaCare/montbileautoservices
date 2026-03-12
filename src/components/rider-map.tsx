"use client";

// ─── Advanced Real-Time Fleet Map ───
// Leaflet + OpenStreetMap — 100% free, no API key
// Features: smooth marker animation, heading arrows, speed labels,
// stationary detection, user-interactive pan/zoom, stale-rider dimming,
// locate-rider button, auto-fit toggle, and XSS-safe popups.

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { RiderLocation } from "@/lib/types";
import { MapPin, Navigation, Loader2, Maximize2, Gauge, Satellite, Layers, Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface RiderMapProps {
  locations: Record<string, RiderLocation>;
  className?: string;
  height?: string;
  selectedRiderId?: string | null;
  onSelectRider?: (id: string | null) => void;
}

// ─── Helpers ───
function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

function speedKmh(mps: number | null): number {
  return mps != null && mps > 0 ? Math.round(mps * 3.6) : 0;
}

function timeAgoLabel(ts: string): string {
  const sec = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/** Is this location stale? (>5 min since update) */
function isStale(ts: string): boolean {
  return Date.now() - new Date(ts).getTime() > 5 * 60 * 1000;
}

/** Calculate total trail distance in km using Haversine */
function trailDistanceKm(trail: Array<{ lat: number; lng: number }> | undefined): number {
  if (!trail || trail.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < trail.length; i++) {
    const R = 6371;
    const dLat = (trail[i].lat - trail[i - 1].lat) * Math.PI / 180;
    const dLng = (trail[i].lng - trail[i - 1].lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(trail[i - 1].lat * Math.PI / 180) * Math.cos(trail[i].lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return dist;
}

/** Format seconds into human-readable duration */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h${m > 0 ? m + "m" : ""}`;
}

/** Convert heading degrees to compass direction */
function getCompassDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// Inject custom styles once
let stylesInjected = false;
function injectLeafletStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .rider-marker { background: transparent !important; border: none !important; }
    .leaflet-popup-content-wrapper { border-radius: 12px !important; box-shadow: 0 4px 16px rgba(0,0,0,0.18) !important; }
    .leaflet-popup-tip { box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; }
    .leaflet-container { font-family: system-ui, -apple-system, sans-serif; }
    @keyframes pulse-pin { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
    @keyframes pulse-ring { 0% { opacity:0.6;transform:scale(1); } 100% { opacity:0;transform:scale(2.5); } }
    .speed-label { pointer-events: none; }
    .rider-marker-selected { z-index: 1000 !important; }
    .trail-line { pointer-events: none; }
  `;
  document.head.appendChild(style);
}

// Fix Leaflet default icon paths (not used but prevents warnings)
function fixLeafletIcons(L: typeof import("leaflet")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// ─── Smooth LatLng animation via CSS transition ───
function smoothMoveMarker(marker: L.Marker, newLatLng: [number, number], map: L.Map) {
  const el = marker.getElement();
  if (el) {
    el.style.transition = "transform 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)";
  }
  marker.setLatLng(newLatLng);
  // Fallback cleanup
  setTimeout(() => {
    if (el) el.style.transition = "";
  }, 1600);
}

export function RiderMap({ locations, className = "", height = "380px", selectedRiderId, onSelectRider }: RiderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const speedLabelsRef = useRef<Record<string, L.Marker>>({});
  const trailLinesRef = useRef<Record<string, L.Polyline[]>>({});
  const tilesRef = useRef<{ street: L.TileLayer | null; satellite: L.TileLayer | null }>({ street: null, satellite: null });
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [leafletModule, setLeafletModule] = useState<typeof import("leaflet") | null>(null);
  const [autoFit, setAutoFit] = useState(true);
  const [mapStyle, setMapStyle] = useState<"street" | "satellite">("street");
  const [showTrails, setShowTrails] = useState(true);
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);

  // Playback state
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackMarkerRef = useRef<L.CircleMarker | null>(null);
  const playbackTrailRef = useRef<L.Polyline | null>(null);

  const riderEntries = useMemo(() => Object.entries(locations), [locations]);
  const activeCount = useMemo(() => riderEntries.filter(([, l]) => l.source !== "tracker" && l.status === "active").length, [riderEntries]);
  const trackingCount = useMemo(() => riderEntries.filter(([, l]) => l.source === "tracker" && l.tracker_data?.online).length, [riderEntries]);
  const offlineCount = riderEntries.length - activeCount - trackingCount;

  // Auto-focused rider for vehicle dashboard
  const focusedLoc = useMemo(() => {
    if (selectedRiderId && locations[selectedRiderId]) return locations[selectedRiderId];
    const trackers = Object.values(locations).filter(l => l.source === "tracker" && l.tracker_data?.online);
    if (trackers.length > 0) return trackers[0];
    const active = Object.values(locations).filter(l => l.status === "active");
    if (active.length > 0) return active[0];
    const all = Object.values(locations);
    return all.length > 0 ? all[0] : null;
  }, [locations, selectedRiderId]);

  // Get the playback trail from the selected rider (or first rider with trail data)
  const playbackTrail = useMemo(() => {
    const targetId = selectedRiderId || Object.keys(locations).find((id) => locations[id].tracker_data?.trail && locations[id].tracker_data!.trail.length > 1);
    if (!targetId || !locations[targetId]?.tracker_data?.trail) return [];
    return locations[targetId].tracker_data!.trail;
  }, [locations, selectedRiderId]);

  // Load Leaflet dynamically (no SSR)
  useEffect(() => {
    injectLeafletStyles();
    import("leaflet")
      .then((L) => {
        fixLeafletIcons(L);
        setLeafletModule(L);
        setIsLoaded(true);
      })
      .catch(() => setHasError(true));
  }, []);

  // Initialize map
  const initMap = useCallback(() => {
    if (!isLoaded || !leafletModule || !mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
      return;
    }

    try {
      const L = leafletModule;
      const defaultCenter: [number, number] = [4.8985, -1.7554];

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView(defaultCenter, 14);

      // Add zoom control top-left
      L.control.zoom({ position: "topleft" }).addTo(map);

      // Street tiles (OpenStreetMap)
      const streetTile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 19,
      }).addTo(map);

      // Satellite tiles (ESRI — free, no API key)
      const satTile = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: '&copy; Esri',
        maxZoom: 19,
      });

      tilesRef.current = { street: streetTile, satellite: satTile };

      // Track user interaction to disable auto-fit
      map.on("dragstart zoomstart", () => {
        userInteractedRef.current = true;
        setAutoFit(false);
      });

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 400);
    } catch {
      setHasError(true);
    }
  }, [isLoaded, leafletModule]);

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
        speedLabelsRef.current = {};
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initMap]);

  // Resize observer
  useEffect(() => {
    if (!mapRef.current || !mapInstanceRef.current) return;
    const observer = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize());
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [isLoaded]);

  // Toggle satellite/street tiles
  useEffect(() => {
    const map = mapInstanceRef.current;
    const tiles = tilesRef.current;
    if (!map || !tiles.street || !tiles.satellite) return;
    if (mapStyle === "satellite") {
      map.removeLayer(tiles.street);
      if (!map.hasLayer(tiles.satellite)) map.addLayer(tiles.satellite);
    } else {
      map.removeLayer(tiles.satellite);
      if (!map.hasLayer(tiles.street)) map.addLayer(tiles.street);
    }
  }, [mapStyle]);

  // ─── Update markers ───
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletModule) return;

    const L = leafletModule;
    const map = mapInstanceRef.current;
    const currentMarkers = markersRef.current;
    const currentSpeedLabels = speedLabelsRef.current;

    // Remove markers for riders no longer present
    Object.keys(currentMarkers).forEach((id) => {
      if (!locations[id]) {
        currentMarkers[id].remove();
        delete currentMarkers[id];
        if (currentSpeedLabels[id]) {
          currentSpeedLabels[id].remove();
          delete currentSpeedLabels[id];
        }
      }
    });

    const bounds = L.latLngBounds([]);

    Object.entries(locations).forEach(([id, loc]) => {
      if (loc.lat == null || loc.lng == null || isNaN(loc.lat) || isNaN(loc.lng)) {
        if (currentMarkers[id]) { currentMarkers[id].remove(); delete currentMarkers[id]; }
        if (currentSpeedLabels[id]) { currentSpeedLabels[id].remove(); delete currentSpeedLabels[id]; }
        return;
      }

      const latLng: [number, number] = [loc.lat, loc.lng];
      const isTracker = loc.source === "tracker";
      const trackerOnline = isTracker && loc.tracker_data?.online;
      // For trackers: use tracker_data.online (device state), not status (shift state)
      const isActive = isTracker ? !!trackerOnline : loc.status === "active";
      const stale = isStale(loc.timestamp);
      const speed = isTracker && loc.tracker_data?.speed_kmh != null ? Math.round(loc.tracker_data.speed_kmh) : speedKmh(loc.speed);
      const isMoving = speed > 2;
      const isSelected = id === selectedRiderId;
      const initial = escapeHtml(loc.rider_name?.charAt(0)?.toUpperCase() || "?");

      // ─ Heading rotation (default: 0) ─
      const rotation = loc.heading != null && loc.heading > 0 && isMoving ? Math.round(loc.heading) : 0;

      // ─ Small pin marker (like DAGPS) ─
      // Trackers get purple/indigo tones; phone riders get green/blue/amber
      const pinColor = isTracker
        ? (trackerOnline ? (isMoving ? "#7c3aed" : "#6366f1") : "#9CA3AF")
        : (isActive ? (stale ? "#f59e0b" : (isMoving ? "#10b981" : "#3b82f6")) : "#9CA3AF");
      const pinBorder = isSelected ? "#1d4ed8" : "#fff";
      const pinOpacity = stale && !isActive ? 0.5 : 1;

      // Direction arrow for moving vehicles
      const arrowSvg = isMoving && rotation > 0
        ? `<div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%) rotate(${rotation}deg);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:6px solid ${pinColor};"></div>`
        : "";

      const pinSize = isSelected ? 32 : 26;
      const innerSize = pinSize - 6;
      const emojiSize = isSelected ? 15 : 12;

      // Tracker = satellite dish icon (round pin), Phone = pragya/tricycle (teardrop pin)
      const iconHtml = isTracker
        ? `<div style="position:relative;opacity:${pinOpacity};">
            ${arrowSvg}
            <div style="width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${pinColor};border:2.5px solid ${pinBorder};box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
              <span style="font-size:${emojiSize}px;line-height:1;">📡</span>
            </div>
            ${isActive && !stale ? `<div style="position:absolute;top:${pinSize/2 - 4}px;left:${pinSize/2 - 4}px;width:8px;height:8px;border-radius:50%;background:${pinColor};animation:pulse-ring 2s infinite;opacity:0;"></div>` : ""}
          </div>`
        : `<div style="position:relative;opacity:${pinOpacity};">
            ${arrowSvg}
            <div style="width:${pinSize}px;height:${pinSize}px;border-radius:50% 50% 50% 0;background:${pinColor};border:2.5px solid ${pinBorder};transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
              <span style="transform:rotate(45deg);font-size:${emojiSize}px;line-height:1;">🛺</span>
            </div>
            ${isActive && !stale ? `<div style="position:absolute;top:${pinSize/2 - 4}px;left:${pinSize/2 - 4}px;width:8px;height:8px;border-radius:50%;background:${pinColor};animation:pulse-ring 2s infinite;opacity:0;"></div>` : ""}
          </div>`;

      const icon = L.divIcon({
        html: iconHtml,
        className: `rider-marker${isSelected ? " rider-marker-selected" : ""}`,
        iconSize: [pinSize, pinSize],
        iconAnchor: [pinSize / 2, pinSize],
        popupAnchor: [0, -pinSize],
      });

      if (currentMarkers[id]) {
        smoothMoveMarker(currentMarkers[id], latLng, map);
        currentMarkers[id].setIcon(icon);
      } else {
        const marker = L.marker(latLng, { icon }).addTo(map);
        marker.on("click", () => onSelectRider?.(id === selectedRiderId ? null : id));
        currentMarkers[id] = marker;
      }

      // ─ Speed label (compact) ─
      if (isActive) {
        const speedText = isMoving ? `${speed}` : "P";
        const speedColor = speed > 40 ? "#ef4444" : speed > 20 ? "#f59e0b" : "#10b981";
        const speedHtml = `<div style="background:rgba(255,255,255,0.9);border-radius:6px;padding:0 4px;font-size:8px;font-weight:800;color:${speedColor};box-shadow:0 1px 3px rgba(0,0,0,0.15);white-space:nowrap;text-align:center;line-height:14px;">${speedText}${isMoving ? '<span style="font-size:6px;"> km/h</span>' : ""}</div>`;
        const speedIcon = L.divIcon({
          html: speedHtml,
          className: "speed-label",
          iconSize: [40, 14],
          iconAnchor: [20, -2],
        });
        if (currentSpeedLabels[id]) {
          currentSpeedLabels[id].setLatLng(latLng);
          currentSpeedLabels[id].setIcon(speedIcon);
        } else {
          currentSpeedLabels[id] = L.marker(latLng, { icon: speedIcon, interactive: false }).addTo(map);
        }
      } else if (currentSpeedLabels[id]) {
        currentSpeedLabels[id].remove();
        delete currentSpeedLabels[id];
      }

      // ─ XSS-safe popup ─
      const safeName = escapeHtml(loc.rider_name || "Unknown");
      const timeLabel = timeAgoLabel(loc.timestamp);
      const timeColor = stale ? "#d97706" : "#6b7280";
      const statusLabel = isTracker
        ? (trackerOnline ? (isMoving ? "TRACKING" : "PARKED") : "DEVICE OFF")
        : (isActive ? (stale ? "STALE" : "ON SHIFT") : "OFFLINE");
      const statusBg = isTracker
        ? (trackerOnline ? (isMoving ? "#ede9fe" : "#e0e7ff") : "#f3f4f6")
        : (isActive ? (stale ? "#fef3c7" : "#d1fae5") : "#f3f4f6");
      const statusFg = isTracker
        ? (trackerOnline ? (isMoving ? "#7c3aed" : "#4f46e5") : "#6b7280")
        : (isActive ? (stale ? "#d97706" : "#059669") : "#6b7280");
      const accuracyStr = loc.accuracy != null ? `${Math.round(loc.accuracy)}m` : "—";
      const sourceLabel = isTracker ? "📡 Hardware Tracker" : "📱 Phone GPS";
      const td = loc.tracker_data;

      // Tracker-specific enriched popup
      let trackerExtra = "";
      if (isTracker && td) {
        const hbLabel = td.heartbeat_age_sec < 60 ? td.heartbeat_age_sec + "s ago" : Math.floor(td.heartbeat_age_sec / 60) + "m ago";
        const mvColor = td.movement === "moving" ? "#10b981" : td.movement === "idle" ? "#9ca3af" : "#3b82f6";
        const mvLabel = td.movement ? td.movement.toUpperCase() : "—";
        let speedChart = "";
        if (td.speed_history && td.speed_history.length > 3) {
          const bars = td.speed_history.slice(-8).map((s: number) => {
            if (s > 30) return "█";
            if (s > 20) return "▆";
            if (s > 10) return "▄";
            if (s > 2) return "▂";
            return "▁";
          }).join("");
          speedChart = '<span>📊</span><span>Speed: <span style="font-family:monospace;letter-spacing:1px;">' + escapeHtml(bars) + "</span></span>";
        }
        trackerExtra = '<span style="color:#6366f1;">💓</span><span>Heartbeat: <b>' + escapeHtml(hbLabel) + "</b></span>"
          + '<span>🟢</span><span>Device: <b>' + (td.online ? "Online" : "Offline") + "</b> (" + escapeHtml(td.device_type || "GT06") + ")</span>"
          + '<span>⚡</span><span>Movement: <b style="color:' + mvColor + ';">' + escapeHtml(mvLabel) + "</b></span>"
          + (td.heading_compass && td.heading_computed > 0 ? '<span>🧭</span><span>Direction: <b>' + escapeHtml(td.heading_compass) + "</b> (" + td.heading_computed + "°)</span>" : "")
          + (td.alarm > 0 ? '<span style="color:#ef4444;">🚨</span><span style="color:#ef4444;font-weight:700;">ALARM ACTIVE</span>' : "")
          + speedChart
          + '<span>📶</span><span>Signal: ' + (td.signal || 0) + " | GPS: " + escapeHtml(td.gps_time || "—") + "</span>";
      }

      currentMarkers[id].bindPopup(`
        <div style="font-family:system-ui;min-width:200px;padding:2px 0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="font-weight:800;font-size:14px;">${safeName}</span>
            <span style="display:inline-block;padding:2px 8px;border-radius:8px;background:${statusBg};color:${statusFg};font-size:10px;font-weight:700;">● ${statusLabel}</span>
          </div>
          <div style="font-size:11px;color:#555;display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;">
            <span>🛺</span><span>${isMoving ? `Moving at <b>${speed} km/h</b>` : "Stationary (Parked)"}</span>
            <span>🧭</span><span>Heading: ${loc.heading != null && loc.heading > 0 ? `${Math.round(loc.heading)}°` : "—"}</span>
            <span style="color:${timeColor};">🕐</span><span style="color:${timeColor};">${isActive ? "Updated" : "Last seen"}: <b>${timeLabel}</b></span>
            <span>📡</span><span>GPS: ±${accuracyStr}</span>
            <span>📍</span><span>${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</span>
            <span>${isTracker ? '🔧' : '📱'}</span><span>${sourceLabel}</span>
            ${trackerExtra}
          </div>
        </div>
      `);

      bounds.extend(latLng);
    });

    // ─ Draw trail polylines for trackers ─
    const currentTrails = trailLinesRef.current;
    // Remove old trails
    Object.keys(currentTrails).forEach((id) => {
      if (!locations[id]) {
        currentTrails[id].forEach((l) => l.remove());
        delete currentTrails[id];
      }
    });
    // Draw new trails
    if (showTrails) {
      Object.entries(locations).forEach(([id, loc]) => {
        const trail = loc.tracker_data?.trail;
        if (!trail || trail.length < 2) return;

        // Remove existing trail for this rider
        if (currentTrails[id]) {
          currentTrails[id].forEach((l) => l.remove());
        }
        currentTrails[id] = [];

        // Draw segments color-coded by speed
        for (let i = 0; i < trail.length - 1; i++) {
          const p1 = trail[i];
          const p2 = trail[i + 1];
          const spd = p2.speed || 0;
          const segColor = spd > 40 ? "#ef4444" : spd > 20 ? "#f59e0b" : spd > 2 ? "#22c55e" : "#93c5fd";
          const line = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
            color: segColor,
            weight: 4,
            opacity: 0.8,
            className: "trail-line",
          }).addTo(map);
          currentTrails[id].push(line);
        }

        // Start marker (small circle)
        const startPt = trail[0];
        const startCircle = L.circleMarker([startPt.lat, startPt.lng], {
          radius: 4,
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentTrails[id].push(startCircle as any);
      });
    } else {
      // Clear all trails
      Object.keys(currentTrails).forEach((id) => {
        currentTrails[id].forEach((l) => l.remove());
        delete currentTrails[id];
      });
    }

    // Auto-fit only on initial load or when toggle is on
    if (riderEntries.length > 0 && bounds.isValid() && (autoFit || !initialFitDoneRef.current)) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      initialFitDoneRef.current = true;
    }
  }, [locations, leafletModule, riderEntries, autoFit, selectedRiderId, onSelectRider, showTrails]);

  // Fly to selected rider
  useEffect(() => {
    if (!selectedRiderId || !mapInstanceRef.current || !locations[selectedRiderId]) return;
    const loc = locations[selectedRiderId];
    mapInstanceRef.current.flyTo([loc.lat, loc.lng], 17, { duration: 0.8 });
  }, [selectedRiderId, locations]);

  // ─── Playback animation ───
  useEffect(() => {
    if (!playbackActive || !playbackPlaying || playbackTrail.length < 2) return;
    if (!mapInstanceRef.current || !leafletModule) return;

    const L = leafletModule;
    const map = mapInstanceRef.current;

    const interval = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = prev + 1;
        if (next >= playbackTrail.length) {
          setPlaybackPlaying(false);
          return prev;
        }

        const pt = playbackTrail[next];
        const spd = pt.speed || 0;
        const color = spd > 40 ? "#ef4444" : spd > 20 ? "#f59e0b" : spd > 2 ? "#22c55e" : "#93c5fd";

        // Animate playback marker
        if (playbackMarkerRef.current) {
          playbackMarkerRef.current.setLatLng([pt.lat, pt.lng]);
          playbackMarkerRef.current.setStyle({ fillColor: color, color: color });
        } else {
          playbackMarkerRef.current = L.circleMarker([pt.lat, pt.lng], {
            radius: 8,
            color: color,
            fillColor: color,
            fillOpacity: 1,
            weight: 3,
          }).addTo(map);
        }

        // Draw segment up to this point
        if (prev >= 0 && prev < playbackTrail.length) {
          const prevPt = playbackTrail[prev];
          const segColor = spd > 40 ? "#ef4444" : spd > 20 ? "#f59e0b" : spd > 2 ? "#22c55e" : "#93c5fd";
          L.polyline([[prevPt.lat, prevPt.lng], [pt.lat, pt.lng]], {
            color: segColor,
            weight: 5,
            opacity: 1,
          }).addTo(map);
        }

        // Pan map to follow
        map.panTo([pt.lat, pt.lng], { animate: true, duration: 0.3 });

        return next;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [playbackActive, playbackPlaying, playbackSpeed, playbackTrail, leafletModule]);

  // Cleanup playback marker when playback deactivated
  useEffect(() => {
    if (!playbackActive) {
      if (playbackMarkerRef.current) {
        playbackMarkerRef.current.remove();
        playbackMarkerRef.current = null;
      }
      if (playbackTrailRef.current) {
        playbackTrailRef.current.remove();
        playbackTrailRef.current = null;
      }
    }
  }, [playbackActive]);

  const togglePlayback = useCallback(() => {
    if (!playbackActive) {
      setPlaybackActive(true);
      setPlaybackIndex(0);
      setPlaybackPlaying(true);
    } else {
      setPlaybackActive(false);
      setPlaybackPlaying(false);
      setPlaybackIndex(0);
    }
  }, [playbackActive]);

  const togglePlayPause = useCallback(() => {
    if (!playbackActive) return;
    setPlaybackPlaying((p) => !p);
  }, [playbackActive]);

  const skipForward = useCallback(() => {
    setPlaybackIndex((prev) => Math.min(prev + 3, playbackTrail.length - 1));
  }, [playbackTrail]);

  const skipBack = useCallback(() => {
    setPlaybackIndex((prev) => Math.max(prev - 3, 0));
  }, []);

  const handleFitAll = useCallback(() => {
    if (!mapInstanceRef.current || !leafletModule) return;
    const L = leafletModule;
    const bounds = L.latLngBounds([]);
    Object.values(locations).forEach((loc) => {
      if (loc.lat != null && loc.lng != null) bounds.extend([loc.lat, loc.lng]);
    });
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
    setAutoFit(true);
    userInteractedRef.current = false;
  }, [locations, leafletModule]);

  if (hasError) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-surface-700 ${className}`} style={{ height }}>
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <MapPin className="h-6 w-6 text-danger" />
          <span className="text-xs font-medium">Map failed to load</span>
          <button onClick={() => { setHasError(false); setIsLoaded(false); setLeafletModule(null); setTimeout(() => window.location.reload(), 100); }} className="text-xs font-bold text-bolt underline">Retry</button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-surface-700 ${className}`} style={{ height }}>
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin text-bolt" />
          <span className="text-xs font-medium">Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-2xl flex flex-col ${className}`} style={{ height }}>
      {/* Map section */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* Map container */}
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} className="z-0" />

      {/* Top-right overlay controls */}
      <div className="absolute top-2 right-2 z-1000 flex flex-col items-end gap-1.5">
        {/* Status pill */}
        <div className="flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-surface-800/90 backdrop-blur-sm px-2.5 py-1 shadow-md">
          <div className="relative">
            <Navigation className="h-3.5 w-3.5 text-bolt" />
            {riderEntries.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-bolt text-[7px] font-black text-white">{riderEntries.length}</span>
            )}
          </div>
          <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">
            {riderEntries.length === 0 ? "No riders" : (
              [activeCount > 0 ? `${activeCount} shift` : "", trackingCount > 0 ? `${trackingCount} tracking` : "", offlineCount > 0 ? `${offlineCount} off` : ""].filter(Boolean).join(" · ")
            )}
          </span>
        </div>

        {/* Map style toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setMapStyle(mapStyle === "street" ? "satellite" : "street")}
            className="flex items-center gap-1 rounded-lg bg-white/90 dark:bg-surface-800/90 backdrop-blur-sm px-2 py-1 shadow-md text-[10px] font-bold text-gray-600 dark:text-gray-300 transition-all hover:bg-white"
            title={mapStyle === "street" ? "Switch to satellite" : "Switch to street"}
          >
            <Layers className="h-3 w-3" />
            {mapStyle === "street" ? "Satellite" : "Map"}
          </button>
          <button
            onClick={() => setShowTrails(!showTrails)}
            className={`flex items-center gap-1 rounded-lg backdrop-blur-sm px-2 py-1 shadow-md text-[10px] font-bold transition-all ${
              showTrails ? "bg-emerald-500/90 text-white" : "bg-white/90 dark:bg-surface-800/90 text-gray-600 dark:text-gray-300"
            }`}
            title="Toggle route trail"
          >
            <Navigation className="h-3 w-3" />
            Trail
          </button>
          {playbackTrail.length > 1 && (
            <button
              onClick={togglePlayback}
              className={`flex items-center gap-1 rounded-lg backdrop-blur-sm px-2 py-1 shadow-md text-[10px] font-bold transition-all ${
                playbackActive ? "bg-violet-500/90 text-white" : "bg-white/90 dark:bg-surface-800/90 text-gray-600 dark:text-gray-300"
              }`}
              title="Toggle route playback"
            >
              <Play className="h-3 w-3" />
              {playbackActive ? "Stop" : "Play"}
            </button>
          )}
        </div>

        {/* Fit all */}
        <button
          onClick={handleFitAll}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 shadow-md text-[10px] font-bold transition-all backdrop-blur-sm ${
            autoFit
              ? "bg-bolt/90 text-white"
              : "bg-white/90 dark:bg-surface-800/90 text-gray-600 dark:text-gray-300"
          }`}
          title="Fit all riders"
        >
          <Maximize2 className="h-3 w-3" />
          {autoFit ? "Auto" : "Fit"}
        </button>
      </div>

      {/* Speed legend (bottom-left) */}
      {showTrails && !playbackActive && Object.values(locations).some((l) => l.tracker_data?.trail && l.tracker_data.trail.length > 1) && (
        <div className="absolute bottom-2 left-2 z-1000 flex items-center gap-1 rounded-lg bg-white/90 dark:bg-surface-800/90 backdrop-blur-sm px-2 py-1 shadow-md">
          <span className="text-[8px] font-bold text-gray-400">Speed:</span>
          <span className="w-3 h-1.5 rounded-sm bg-blue-300" />
          <span className="text-[7px] text-gray-400">Idle</span>
          <span className="w-3 h-1.5 rounded-sm bg-emerald-500" />
          <span className="text-[7px] text-gray-400">Normal</span>
          <span className="w-3 h-1.5 rounded-sm bg-amber-500" />
          <span className="text-[7px] text-gray-400">Fast</span>
          <span className="w-3 h-1.5 rounded-sm bg-red-500" />
          <span className="text-[7px] text-gray-400">Over</span>
        </div>
      )}

      {/* Playback controls panel */}
      {playbackActive && playbackTrail.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-1000 bg-white/95 dark:bg-surface-800/95 backdrop-blur-md border-t border-gray-200 dark:border-surface-600 px-3 py-2">
          {/* Timeline slider */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-mono text-gray-500 min-w-[40px]">
              {playbackTrail[playbackIndex]?.t ? new Date(playbackTrail[playbackIndex].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--"}
            </span>
            <input
              type="range"
              min={0}
              max={playbackTrail.length - 1}
              value={playbackIndex}
              onChange={(e) => setPlaybackIndex(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-surface-600 accent-violet-500 cursor-pointer"
            />
            <span className="text-[9px] font-mono text-gray-500 min-w-[40px] text-right">
              {playbackTrail[playbackTrail.length - 1]?.t ? new Date(playbackTrail[playbackTrail.length - 1].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--"}
            </span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            {/* Left: Current speed/position info */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${
                (playbackTrail[playbackIndex]?.speed || 0) > 40 ? "text-red-500" :
                (playbackTrail[playbackIndex]?.speed || 0) > 20 ? "text-amber-500" :
                (playbackTrail[playbackIndex]?.speed || 0) > 2 ? "text-emerald-500" : "text-blue-400"
              }`}>
                {Math.round(playbackTrail[playbackIndex]?.speed || 0)} km/h
              </span>
              <span className="text-[9px] text-gray-400">
                {playbackIndex + 1}/{playbackTrail.length}
              </span>
            </div>

            {/* Center: Transport controls */}
            <div className="flex items-center gap-1.5">
              <button onClick={skipBack} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface-600 transition-colors" title="Skip back">
                <SkipBack className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
              </button>
              <button
                onClick={togglePlayPause}
                className="p-1.5 rounded-full bg-violet-500 text-white hover:bg-violet-600 transition-colors shadow-md"
                title={playbackPlaying ? "Pause" : "Play"}
              >
                {playbackPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={skipForward} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface-600 transition-colors" title="Skip forward">
                <SkipForward className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {/* Right: Speed multiplier */}
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                    playbackSpeed === spd
                      ? "bg-violet-500 text-white" 
                      : "bg-gray-100 dark:bg-surface-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No riders overlay */}
      {riderEntries.length === 0 && (
        <div className="absolute inset-0 z-500 flex items-center justify-center bg-black/30 backdrop-blur-[1px] rounded-2xl">
          <div className="flex flex-col items-center gap-2 text-white">
            <MapPin className="h-8 w-8 opacity-70" />
            <p className="text-sm font-bold">No riders or trackers active</p>
            <p className="text-xs opacity-70">Locations appear when riders start a shift or trackers come online</p>
          </div>
        </div>
      )}
      </div>{/* end map section */}

      {/* ── Vehicle Dashboard (car instrument cluster) ── */}
      {focusedLoc && riderEntries.length > 0 && (() => {
        const loc = focusedLoc;
        const dlIsTracker = loc.source === "tracker";
        const td = loc.tracker_data;
        // Use tracker_data.speed_kmh directly for trackers; convert loc.speed (m/s) for phone
        const dlSpeed = dlIsTracker && td?.speed_kmh != null ? Math.round(td.speed_kmh) : speedKmh(loc.speed);
        const dlMoving = dlSpeed > 2;
        // Use tracker_data heading if available, else loc.heading
        const dlHeading = dlIsTracker && td?.heading_computed ? Math.round(td.heading_computed) : (loc.heading != null && loc.heading > 0 ? Math.round(loc.heading) : 0);
        const dlCompass = dlIsTracker && td?.heading_compass && td.heading_compass !== "—" ? td.heading_compass : (dlHeading > 0 ? getCompassDir(dlHeading) : "—");
        const dlAccuracy = loc.accuracy != null ? Math.round(loc.accuracy) : null;
        const dlMileage = trailDistanceKm(td?.trail);
        const dlStale = isStale(loc.timestamp);
        const dlStatusLabel = dlIsTracker
          ? (td?.online ? (dlMoving ? "MOVING" : "PARKED") : "OFFLINE")
          : (loc.status === "active" ? (dlStale ? "STALE" : (dlMoving ? "MOVING" : "PARKED")) : "OFFLINE");
        const dlStatusColor = dlIsTracker
          ? (td?.online ? (dlMoving ? "text-emerald-400" : "text-blue-400") : "text-gray-500")
          : (loc.status === "active" ? (dlStale ? "text-amber-400" : (dlMoving ? "text-emerald-400" : "text-blue-400")) : "text-gray-500");
        const dlDotColor = dlIsTracker
          ? (td?.online ? (dlMoving ? "bg-emerald-400" : "bg-blue-400") : "bg-gray-500")
          : (loc.status === "active" ? (dlStale ? "bg-amber-400" : (dlMoving ? "bg-emerald-400" : "bg-blue-400")) : "bg-gray-500");
        const dlSpeedColor = dlSpeed > 40 ? "text-red-400" : dlSpeed > 20 ? "text-amber-400" : dlSpeed > 2 ? "text-emerald-400" : "text-blue-300";
        const hbAge = td?.heartbeat_age_sec ?? null;
        const dlSignal = td?.signal ?? null;

        return (
          <div className="bg-gray-900 border-t border-gray-700 px-3 py-2 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{dlIsTracker ? "📡" : "🛺"}</span>
                <span className="text-xs font-bold text-white truncate">{loc.rider_name}</span>
                <span className="text-[9px] text-gray-500">{dlIsTracker ? "Hardware Tracker" : "Phone GPS"}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`h-2 w-2 rounded-full ${dlDotColor} ${dlMoving ? "animate-pulse" : ""}`} />
                <span className={`text-[10px] font-bold ${dlStatusColor}`}>{dlStatusLabel}</span>
              </div>
            </div>

            {/* Gauges row */}
            <div className="grid grid-cols-5 gap-1">
              {/* Speed */}
              <div className="flex flex-col items-center bg-gray-800 rounded-lg py-1.5 px-1">
                <Gauge className={`h-3.5 w-3.5 ${dlSpeedColor} mb-0.5`} />
                <span className={`text-xl font-black leading-none ${dlSpeedColor}`}>{dlSpeed}</span>
                <span className="text-[7px] text-gray-500 mt-0.5">km/h</span>
              </div>
              {/* Heading */}
              <div className="flex flex-col items-center bg-gray-800 rounded-lg py-1.5 px-1">
                <Navigation className="h-3.5 w-3.5 text-blue-400 mb-0.5" style={{ transform: `rotate(${dlHeading}deg)` }} />
                <span className="text-sm font-bold text-blue-300 leading-none">{dlCompass}</span>
                <span className="text-[7px] text-gray-500 mt-0.5">heading</span>
              </div>
              {/* GPS */}
              <div className="flex flex-col items-center bg-gray-800 rounded-lg py-1.5 px-1">
                <MapPin className="h-3.5 w-3.5 text-red-400 mb-0.5" />
                <span className="text-sm font-bold text-red-300 leading-none">{dlAccuracy != null ? `±${dlAccuracy}` : "—"}</span>
                <span className="text-[7px] text-gray-500 mt-0.5">GPS (m)</span>
              </div>
              {/* Signal */}
              <div className="flex flex-col items-center bg-gray-800 rounded-lg py-1.5 px-1">
                <Satellite className="h-3.5 w-3.5 text-purple-400 mb-0.5" />
                <div className="flex items-end gap-px h-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`w-1 rounded-sm ${dlSignal != null && dlSignal >= i * 6 ? "bg-purple-400" : "bg-gray-600"}`} style={{ height: `${4 + i * 2.5}px` }} />
                  ))}
                </div>
                <span className="text-[7px] text-gray-500 mt-0.5">signal</span>
              </div>
              {/* Heartbeat */}
              <div className="flex flex-col items-center bg-gray-800 rounded-lg py-1.5 px-1">
                <span className="text-sm mb-0.5">❤️</span>
                <span className={`text-sm font-bold leading-none ${hbAge != null && hbAge < 30 ? "text-emerald-400" : hbAge != null && hbAge < 120 ? "text-amber-400" : "text-gray-500"}`}>
                  {hbAge != null ? formatDuration(hbAge) : "—"}
                </span>
                <span className="text-[7px] text-gray-500 mt-0.5">heartbeat</span>
              </div>
            </div>

            {/* Bottom info bar */}
            <div className="flex items-center justify-between mt-1.5 text-[9px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className={`font-semibold ${dlMoving ? "text-emerald-400" : "text-blue-400"}`}>
                  ⚡ {td?.movement ? td.movement.toUpperCase() : (dlMoving ? "MOVING" : "STATIONARY")}
                </span>
              </span>
              {dlMileage > 0 && (
                <span>🛣️ <span className="font-semibold text-white">{dlMileage.toFixed(1)} km</span></span>
              )}
              {td?.daemon_uptime_sec != null && td.daemon_uptime_sec > 0 && (
                <span>⏱️ <span className="font-semibold text-white">{formatDuration(td.daemon_uptime_sec)}</span></span>
              )}
              <span className="text-gray-500">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Advanced Rider Location List ───
export function RiderLocationList({
  locations,
  selectedRiderId,
  onSelectRider,
}: {
  locations: Record<string, RiderLocation>;
  selectedRiderId?: string | null;
  onSelectRider?: (id: string | null) => void;
}) {
  const entries = useMemo(() => {
    return Object.entries(locations)
      .map(([id, loc]) => ({ ...loc, id }))
      .sort((a, b) => {
        // Live/tracking first, then by most recent timestamp
        const aLive = a.source === "tracker" ? !!a.tracker_data?.online : a.status === "active";
        const bLive = b.source === "tracker" ? !!b.tracker_data?.online : b.status === "active";
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [locations]);

  // Live clock for "time ago" updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(iv);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map((loc) => {
        const isTracker = loc.source === "tracker";
        const trackerOnline = isTracker && loc.tracker_data?.online;
        const isActive = isTracker ? !!trackerOnline : loc.status === "active";
        const stale = isStale(loc.timestamp);
        const speed = isTracker && loc.tracker_data?.speed_kmh != null ? Math.round(loc.tracker_data.speed_kmh) : speedKmh(loc.speed);
        const isMoving = speed > 2;
        const isSelected = loc.id === selectedRiderId;
        const ago = timeAgoLabel(loc.timestamp);

        return (
          <button
            key={loc.id}
            onClick={() => onSelectRider?.(isSelected ? null : loc.id)}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all tap-active ${
              isSelected
                ? "bg-bolt/10 ring-2 ring-bolt/30 dark:bg-bolt/15"
                : "bg-gray-50 dark:bg-surface-700 hover:bg-gray-100 dark:hover:bg-surface-600"
            }`}
          >
            {/* Avatar */}
            <div className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              isTracker
                ? (trackerOnline ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600" : "bg-gray-200 dark:bg-surface-600 text-gray-400")
                : (isActive
                    ? stale ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                    : "bg-gray-200 dark:bg-surface-600 text-gray-400")
            }`}>
              {isTracker ? (
                <Satellite className="h-5 w-5" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><circle cx="12" cy="18" r="3"/>
                  <path d="M12 15V7l-4 4h8"/><path d="M5 15L9 7"/><path d="M19 15l-4-8"/>
                </svg>
              )}
              {isTracker && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-bolt text-[7px] text-white">📡</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {loc.rider_name}
                {isTracker && <span className="ml-1.5 text-[9px] font-semibold text-bolt bg-bolt/10 px-1.5 py-0.5 rounded">TRACKER</span>}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                {isActive && (
                  <>
                    <span className={`flex items-center gap-0.5 font-semibold ${isMoving ? (speed > 40 ? "text-red-500" : "text-emerald-600") : "text-gray-400"}`}>
                      <Gauge className="h-3 w-3" />
                      {isMoving ? `${speed} km/h` : "Parked"}
                    </span>
                    <span className="text-gray-300">•</span>
                  </>
                )}
                <span className={stale ? "text-amber-500 font-semibold" : ""}>{ago}</span>
                {loc.accuracy != null && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span>±{Math.round(loc.accuracy)}m</span>
                  </>
                )}
                {isTracker && loc.tracker_data && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className={`font-semibold ${loc.tracker_data.online ? "text-emerald-500" : "text-gray-400"}`}>
                      {loc.tracker_data.online ? "📡 Live" : "📡 Off"}
                    </span>
                  </>
                )}
              </div>
              {/* Tracker heartbeat bar */}
              {isTracker && loc.tracker_data && loc.tracker_data.speed_history && loc.tracker_data.speed_history.length > 3 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] text-gray-400">Speed:</span>
                  <div className="flex items-end gap-px h-3">
                    {loc.tracker_data.speed_history.slice(-12).map((s: number, i: number) => (
                      <div
                        key={i}
                        className={`w-1 rounded-sm ${s > 30 ? "bg-red-400" : s > 15 ? "bg-amber-400" : s > 2 ? "bg-emerald-400" : "bg-gray-200 dark:bg-surface-600"}`}
                        style={{ height: `${Math.max(2, Math.min(12, s / 4))}px` }}
                      />
                    ))}
                  </div>
                  {loc.tracker_data.heading_compass && loc.tracker_data.heading_computed > 0 && (
                    <span className="text-[9px] text-blue-400 font-semibold ml-1">{loc.tracker_data.heading_compass}</span>
                  )}
                </div>
              )}
            </div>

            {/* Status badge */}
            <div className="flex flex-col items-end gap-1">
              {isTracker ? (
                trackerOnline ? (
                  isMoving ? (
                    <div className="flex items-center gap-1">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
                      </span>
                      <span className="text-[10px] font-bold text-violet-600">MOVING</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-400" />
                      <span className="text-[10px] font-bold text-indigo-500">TRACKING</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400">DEVICE OFF</span>
                  </div>
                )
              ) : isActive ? (
                stale ? (
                  <div className="flex items-center gap-1">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="text-[10px] font-bold text-amber-500">STALE</span>
                  </div>
                ) : isMoving ? (
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600">ON SHIFT</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-blue-400" />
                    <span className="text-[10px] font-bold text-blue-500">PARKED</span>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-1">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-gray-400" />
                  <span className="text-[10px] font-bold text-gray-400">OFFLINE</span>
                </div>
              )}
              {isMoving && loc.heading != null && loc.heading > 0 && (
                <span className="text-[9px] text-gray-400">{Math.round(loc.heading)}°</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
