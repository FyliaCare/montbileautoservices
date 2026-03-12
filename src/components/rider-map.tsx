"use client";

// ═══════════════════════════════════════════════════════════════════════
//  MONTBILE HUD — Futuristic Fleet Tracking Interface
//  Dark theme · Glowing trails · Compass ring · Speed arcs · Live data
//  CartoDB Dark Matter tiles (free, no API key)
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { RiderLocation } from "@/lib/types";
import {
  MapPin, Navigation, Loader2, Maximize2, Gauge, Satellite,
  Play, Pause, SkipBack, SkipForward, Compass, Radio, Activity,
  Eye, EyeOff, Crosshair
} from "lucide-react";

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

function isStale(ts: string): boolean {
  return Date.now() - new Date(ts).getTime() > 5 * 60 * 1000;
}

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

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h${m > 0 ? m + "m" : ""}`;
}

function getCompassDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// ─── HUD color palette ───
const HUD = {
  cyan: "#00f0ff",
  cyanDim: "rgba(0,240,255,0.3)",
  cyanGlow: "0 0 12px rgba(0,240,255,0.6)",
  green: "#00ff88",
  greenDim: "rgba(0,255,136,0.3)",
  amber: "#ffaa00",
  red: "#ff3355",
  purple: "#aa55ff",
  bg: "#0a0e14",
  bgPanel: "rgba(10,14,20,0.85)",
  bgPanelSolid: "#0d1117",
  border: "rgba(0,240,255,0.15)",
  text: "#e0f0ff",
  textDim: "rgba(200,220,240,0.5)",
};

// ─── HUD Styles ───
let stylesInjected = false;
function injectHudStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .hud-marker { background: transparent !important; border: none !important; }
    .hud-marker-selected { z-index: 1000 !important; }
    .hud-speed-label { pointer-events: none; }
    .hud-trail { pointer-events: none; }
    .leaflet-container.hud-map {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: ${HUD.bg} !important;
    }
    .leaflet-container.hud-map .leaflet-control-zoom a {
      background: ${HUD.bgPanel} !important;
      color: ${HUD.cyan} !important;
      border: 1px solid ${HUD.border} !important;
      font-weight: 700;
    }
    .leaflet-container.hud-map .leaflet-control-zoom a:hover {
      background: rgba(0,240,255,0.1) !important;
    }
    .leaflet-container.hud-map .leaflet-control-attribution {
      background: rgba(10,14,20,0.7) !important;
      color: rgba(200,220,240,0.3) !important;
      font-size: 8px !important;
    }
    .leaflet-container.hud-map .leaflet-control-attribution a {
      color: rgba(0,240,255,0.4) !important;
    }
    .leaflet-container.hud-map .leaflet-popup-content-wrapper {
      border-radius: 8px !important;
      background: ${HUD.bgPanelSolid} !important;
      border: 1px solid ${HUD.border} !important;
      color: ${HUD.text} !important;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6), ${HUD.cyanGlow} !important;
    }
    .leaflet-container.hud-map .leaflet-popup-tip {
      background: ${HUD.bgPanelSolid} !important;
      border: 1px solid ${HUD.border} !important;
      box-shadow: none !important;
    }
    @keyframes hud-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.08); } }
    @keyframes hud-ring { 0% { opacity:0.7; transform:scale(1); } 100% { opacity:0; transform:scale(3); } }
    @keyframes hud-glow { 0%,100% { filter: drop-shadow(0 0 4px ${HUD.cyan}); } 50% { filter: drop-shadow(0 0 12px ${HUD.cyan}); } }
    @keyframes hud-scan { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes hud-trail-glow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
    @keyframes speed-arc-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.4); } }
  `;
  document.head.appendChild(style);
}

function fixLeafletIcons(L: typeof import("leaflet")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function smoothMoveMarker(marker: L.Marker, newLatLng: [number, number]) {
  const el = marker.getElement();
  if (el) {
    el.style.transition = "transform 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)";
  }
  marker.setLatLng(newLatLng);
  setTimeout(() => { if (el) el.style.transition = ""; }, 1600);
}

// ─── SVG Helpers for HUD markers ───
function createVehicleMarkerSvg(heading: number, isMoving: boolean, isOnline: boolean, isTracker: boolean, isSelected: boolean): string {
  const color = !isOnline ? "#555" : isMoving ? HUD.cyan : HUD.green;
  const glowColor = !isOnline ? "transparent" : isMoving ? HUD.cyan : HUD.green;
  const size = isSelected ? 44 : 36;
  const half = size / 2;
  const pulseRing = isOnline && isMoving
    ? `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="none" stroke="${glowColor}" stroke-width="1" opacity="0.5" style="animation:hud-ring 2s infinite;transform-origin:center;" />`
    : "";
  const icon = isTracker
    ? `<circle cx="${half}" cy="${half}" r="6" fill="${color}" stroke="#000" stroke-width="1.5"/>
       <circle cx="${half}" cy="${half}" r="2" fill="#000"/>
       <line x1="${half}" y1="${half - 6}" x2="${half}" y2="${half - 10}" stroke="${color}" stroke-width="1.5"/>
       <line x1="${half + 4}" y1="${half - 4}" x2="${half + 7}" y2="${half - 7}" stroke="${color}" stroke-width="1"/>
       <line x1="${half - 4}" y1="${half - 4}" x2="${half - 7}" y2="${half - 7}" stroke="${color}" stroke-width="1"/>`
    : `<polygon points="${half},${half - 8} ${half + 6},${half + 5} ${half},${half + 2} ${half - 6},${half + 5}" fill="${color}" stroke="#000" stroke-width="1" transform="rotate(${heading},${half},${half})"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${pulseRing}
    <circle cx="${half}" cy="${half}" r="${half - 2}" fill="rgba(0,0,0,0.4)" stroke="${color}" stroke-width="${isSelected ? 2 : 1}" stroke-dasharray="${isSelected ? '0' : '4 2'}" />
    ${icon}
    ${isSelected ? `<circle cx="${half}" cy="${half}" r="${half - 1}" fill="none" stroke="${HUD.cyan}" stroke-width="1.5" style="animation:hud-glow 2s infinite;"/>` : ""}
  </svg>`;
}

// Speed arc SVG for the HUD dashboard
function speedArcSvg(speed: number, maxSpeed: number = 80): string {
  const pct = Math.min(speed / maxSpeed, 1);
  const angle = pct * 240; // 240 degree arc
  const startAngle = 150; // start from bottom-left
  const r = 42;
  const cx = 50, cy = 50;
  const toRad = (d: number) => d * Math.PI / 180;

  function arcPoint(a: number) {
    const rad = toRad(a);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const start = arcPoint(startAngle);
  const end = arcPoint(startAngle + angle);
  const largeArc = angle > 180 ? 1 : 0;

  const bgStart = arcPoint(startAngle);
  const bgEnd = arcPoint(startAngle + 240);
  const bgLargeArc = 1;

  const color = speed > 40 ? HUD.red : speed > 25 ? HUD.amber : speed > 2 ? HUD.cyan : HUD.green;

  return `<svg viewBox="0 0 100 100" class="w-full h-full">
    <defs>
      <filter id="arcGlow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${bgLargeArc} 1 ${bgEnd.x} ${bgEnd.y}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4" stroke-linecap="round"/>
    ${speed > 0 ? `<path d="M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" filter="url(#arcGlow)" style="animation:speed-arc-pulse 2s infinite;"/>` : ""}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="${color}" font-size="18" font-weight="900" font-family="Inter,system-ui">${speed}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="rgba(200,220,240,0.4)" font-size="6" font-weight="600" font-family="Inter,system-ui">KM/H</text>
  </svg>`;
}

export function RiderMap({ locations, className = "", height = "420px", selectedRiderId, onSelectRider }: RiderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const speedLabelsRef = useRef<Record<string, L.Marker>>({});
  const trailLinesRef = useRef<Record<string, L.Polyline[]>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [leafletModule, setLeafletModule] = useState<typeof import("leaflet") | null>(null);
  const [autoFit, setAutoFit] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showHud, setShowHud] = useState(true);
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);

  // Playback state
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackMarkerRef = useRef<L.CircleMarker | null>(null);

  const riderEntries = useMemo(() => Object.entries(locations), [locations]);
  const trackingCount = useMemo(() => riderEntries.filter(([, l]) => l.source === "tracker" && l.tracker_data?.online).length, [riderEntries]);
  const activeCount = useMemo(() => riderEntries.filter(([, l]) => l.source !== "tracker" && l.status === "active").length, [riderEntries]);

  // Auto-focus: selected rider, or first online tracker, or first active
  const focusedLoc = useMemo(() => {
    if (selectedRiderId && locations[selectedRiderId]) return locations[selectedRiderId];
    const trackers = Object.values(locations).filter(l => l.source === "tracker" && l.tracker_data?.online);
    if (trackers.length > 0) return trackers[0];
    const active = Object.values(locations).filter(l => l.status === "active");
    return active.length > 0 ? active[0] : Object.values(locations)[0] || null;
  }, [locations, selectedRiderId]);

  const playbackTrail = useMemo(() => {
    const targetId = selectedRiderId || Object.keys(locations).find((id) => locations[id].tracker_data?.trail && locations[id].tracker_data!.trail.length > 1);
    if (!targetId || !locations[targetId]?.tracker_data?.trail) return [];
    return locations[targetId].tracker_data!.trail;
  }, [locations, selectedRiderId]);

  // Tick for live time-ago
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(iv);
  }, []);

  // Load Leaflet
  useEffect(() => {
    injectHudStyles();
    import("leaflet")
      .then((L) => { fixLeafletIcons(L); setLeafletModule(L); setIsLoaded(true); })
      .catch(() => setHasError(true));
  }, []);

  // Init map
  const initMap = useCallback(() => {
    if (!isLoaded || !leafletModule || !mapRef.current) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.invalidateSize(); return; }

    try {
      const L = leafletModule;
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([4.8985, -1.7554], 14);

      L.control.zoom({ position: "topleft" }).addTo(map);

      // CartoDB Dark Matter — free dark tiles
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      // Add HUD class
      map.getContainer().classList.add("hud-map");

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

  // ─── Update markers & trails ───
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletModule) return;
    const L = leafletModule;
    const map = mapInstanceRef.current;
    const currentMarkers = markersRef.current;
    const currentSpeedLabels = speedLabelsRef.current;

    // Clean removed
    Object.keys(currentMarkers).forEach((id) => {
      if (!locations[id]) {
        currentMarkers[id].remove();
        delete currentMarkers[id];
        if (currentSpeedLabels[id]) { currentSpeedLabels[id].remove(); delete currentSpeedLabels[id]; }
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
      const isActive = isTracker ? !!trackerOnline : loc.status === "active";
      const stale = isStale(loc.timestamp);
      const speed = isTracker && loc.tracker_data?.speed_kmh != null ? Math.round(loc.tracker_data.speed_kmh) : speedKmh(loc.speed);
      const isMoving = speed > 2;
      const isSelected = id === selectedRiderId;
      const rotation = loc.heading != null && loc.heading > 0 && isMoving ? Math.round(loc.heading) : 0;

      // HUD-style SVG marker
      const markerSize = isSelected ? 44 : 36;
      const svgHtml = createVehicleMarkerSvg(rotation, isMoving, isActive && !stale, isTracker, isSelected);

      const icon = L.divIcon({
        html: `<div style="opacity:${stale && !isActive ? 0.4 : 1};">${svgHtml}</div>`,
        className: `hud-marker${isSelected ? " hud-marker-selected" : ""}`,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
        popupAnchor: [0, -markerSize / 2],
      });

      if (currentMarkers[id]) {
        smoothMoveMarker(currentMarkers[id], latLng);
        currentMarkers[id].setIcon(icon);
      } else {
        const marker = L.marker(latLng, { icon }).addTo(map);
        marker.on("click", () => onSelectRider?.(id === selectedRiderId ? null : id));
        currentMarkers[id] = marker;
      }

      // Speed label with glow
      if (isActive) {
        const speedColor = speed > 40 ? HUD.red : speed > 20 ? HUD.amber : speed > 2 ? HUD.cyan : HUD.green;
        const speedText = isMoving ? `${speed}` : "P";
        const glowStyle = isMoving ? `text-shadow: 0 0 8px ${speedColor};` : "";
        const speedHtml = `<div style="background:rgba(10,14,20,0.8);border:1px solid ${speedColor}33;border-radius:4px;padding:0 4px;font-size:8px;font-weight:800;color:${speedColor};white-space:nowrap;text-align:center;line-height:14px;font-family:Inter,system-ui;${glowStyle}">${speedText}${isMoving ? '<span style="font-size:5px;opacity:0.6;"> km/h</span>' : ""}</div>`;
        const speedIcon = L.divIcon({ html: speedHtml, className: "hud-speed-label", iconSize: [42, 14], iconAnchor: [21, -4] });
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

      // HUD popup
      const safeName = escapeHtml(loc.rider_name || "Unknown");
      const timeLabel = timeAgoLabel(loc.timestamp);
      const statusLabel = isTracker ? (trackerOnline ? (isMoving ? "TRACKING" : "PARKED") : "DEVICE OFF") : (isActive ? (stale ? "STALE" : "ON SHIFT") : "OFFLINE");
      const statusColor = isTracker ? (trackerOnline ? (isMoving ? HUD.cyan : HUD.green) : "#555") : (isActive ? (stale ? HUD.amber : (isMoving ? HUD.cyan : HUD.green)) : "#555");
      const td = loc.tracker_data;

      let trackerExtra = "";
      if (isTracker && td) {
        const hbLabel = td.heartbeat_age_sec < 60 ? td.heartbeat_age_sec + "s ago" : Math.floor(td.heartbeat_age_sec / 60) + "m ago";
        trackerExtra = `
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${HUD.border};">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
              <span style="font-size:9px;color:${HUD.textDim};">💓 HB: <b style="color:${td.heartbeat_age_sec < 30 ? HUD.green : td.heartbeat_age_sec < 120 ? HUD.amber : HUD.red};">${escapeHtml(hbLabel)}</b></span>
              <span style="font-size:9px;color:${HUD.textDim};">📡 ${td.online ? '<b style="color:' + HUD.green + ';">LIVE</b>' : '<b style="color:#555;">OFF</b>'}</span>
              ${td.heading_compass && td.heading_computed > 0 ? `<span style="font-size:9px;color:${HUD.textDim};">🧭 ${escapeHtml(td.heading_compass)} (${td.heading_computed}°)</span>` : ""}
              <span style="font-size:9px;color:${HUD.textDim};">⚡ <b style="color:${td.movement === "moving" ? HUD.cyan : HUD.green};">${escapeHtml((td.movement || "—").toUpperCase())}</b></span>
            </div>
          </div>`;
      }

      currentMarkers[id].bindPopup(`
        <div style="font-family:Inter,system-ui;min-width:180px;padding:2px 0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-weight:800;font-size:13px;color:${HUD.text};">${safeName}</span>
            <span style="padding:1px 6px;border-radius:4px;background:${statusColor}22;color:${statusColor};font-size:9px;font-weight:700;border:1px solid ${statusColor}44;">● ${statusLabel}</span>
          </div>
          <div style="font-size:10px;color:${HUD.textDim};display:grid;grid-template-columns:auto 1fr;gap:2px 6px;">
            <span>🚀</span><span>${isMoving ? `<b style="color:${HUD.cyan};">${speed} km/h</b>` : `<span style="color:${HUD.green};">Parked</span>`}</span>
            <span>🕐</span><span>${timeLabel}</span>
            <span>📍</span><span style="font-family:monospace;font-size:9px;">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</span>
          </div>
          ${trackerExtra}
        </div>
      `);

      bounds.extend(latLng);
    });

    // ─ Trail polylines (glowing) ─
    const currentTrails = trailLinesRef.current;
    Object.keys(currentTrails).forEach((id) => {
      if (!locations[id]) { currentTrails[id].forEach((l) => l.remove()); delete currentTrails[id]; }
    });

    if (showTrails) {
      Object.entries(locations).forEach(([id, loc]) => {
        const trail = loc.tracker_data?.trail;
        if (!trail || trail.length < 2) return;
        if (currentTrails[id]) { currentTrails[id].forEach((l) => l.remove()); }
        currentTrails[id] = [];

        // Glow under-layer
        const allPts = trail.map(p => [p.lat, p.lng] as [number, number]);
        const glowLine = L.polyline(allPts, {
          color: HUD.cyan,
          weight: 8,
          opacity: 0.15,
          className: "hud-trail",
        }).addTo(map);
        currentTrails[id].push(glowLine);

        // Individual speed-colored segments
        for (let i = 0; i < trail.length - 1; i++) {
          const p1 = trail[i], p2 = trail[i + 1];
          const spd = p2.speed || 0;
          const segColor = spd > 40 ? HUD.red : spd > 20 ? HUD.amber : spd > 2 ? HUD.cyan : HUD.green;
          const line = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
            color: segColor,
            weight: 3,
            opacity: 0.85,
            className: "hud-trail",
          }).addTo(map);
          currentTrails[id].push(line);
        }

        // Trail start marker (green glow dot)
        const start = trail[0];
        const startCircle = L.circleMarker([start.lat, start.lng], {
          radius: 4, color: HUD.green, fillColor: HUD.green, fillOpacity: 1, weight: 1,
        }).addTo(map);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentTrails[id].push(startCircle as any);
      });
    } else {
      Object.keys(currentTrails).forEach((id) => { currentTrails[id].forEach((l) => l.remove()); delete currentTrails[id]; });
    }

    if (riderEntries.length > 0 && bounds.isValid() && (autoFit || !initialFitDoneRef.current)) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      initialFitDoneRef.current = true;
    }
  }, [locations, leafletModule, riderEntries, autoFit, selectedRiderId, onSelectRider, showTrails]);

  // Fly to selected
  useEffect(() => {
    if (!selectedRiderId || !mapInstanceRef.current || !locations[selectedRiderId]) return;
    const loc = locations[selectedRiderId];
    mapInstanceRef.current.flyTo([loc.lat, loc.lng], 17, { duration: 0.8 });
  }, [selectedRiderId, locations]);

  // ─── Playback ───
  useEffect(() => {
    if (!playbackActive || !playbackPlaying || playbackTrail.length < 2) return;
    if (!mapInstanceRef.current || !leafletModule) return;
    const L = leafletModule;
    const map = mapInstanceRef.current;

    const interval = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = prev + 1;
        if (next >= playbackTrail.length) { setPlaybackPlaying(false); return prev; }
        const pt = playbackTrail[next];
        const spd = pt.speed || 0;
        const color = spd > 40 ? HUD.red : spd > 20 ? HUD.amber : spd > 2 ? HUD.cyan : HUD.green;

        if (playbackMarkerRef.current) {
          playbackMarkerRef.current.setLatLng([pt.lat, pt.lng]);
          playbackMarkerRef.current.setStyle({ fillColor: color, color: color });
        } else {
          playbackMarkerRef.current = L.circleMarker([pt.lat, pt.lng], {
            radius: 8, color, fillColor: color, fillOpacity: 1, weight: 3,
          }).addTo(map);
        }

        if (prev >= 0 && prev < playbackTrail.length) {
          const prevPt = playbackTrail[prev];
          L.polyline([[prevPt.lat, prevPt.lng], [pt.lat, pt.lng]], {
            color, weight: 5, opacity: 1,
          }).addTo(map);
        }
        map.panTo([pt.lat, pt.lng], { animate: true, duration: 0.3 });
        return next;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [playbackActive, playbackPlaying, playbackSpeed, playbackTrail, leafletModule]);

  useEffect(() => {
    if (!playbackActive) {
      if (playbackMarkerRef.current) { playbackMarkerRef.current.remove(); playbackMarkerRef.current = null; }
    }
  }, [playbackActive]);

  const togglePlayback = useCallback(() => {
    if (!playbackActive) { setPlaybackActive(true); setPlaybackIndex(0); setPlaybackPlaying(true); }
    else { setPlaybackActive(false); setPlaybackPlaying(false); setPlaybackIndex(0); }
  }, [playbackActive]);
  const togglePlayPause = useCallback(() => { if (playbackActive) setPlaybackPlaying(p => !p); }, [playbackActive]);
  const skipForward = useCallback(() => { setPlaybackIndex(p => Math.min(p + 3, playbackTrail.length - 1)); }, [playbackTrail]);
  const skipBack = useCallback(() => { setPlaybackIndex(p => Math.max(p - 3, 0)); }, []);

  const handleFitAll = useCallback(() => {
    if (!mapInstanceRef.current || !leafletModule) return;
    const L = leafletModule;
    const bounds = L.latLngBounds([]);
    Object.values(locations).forEach((loc) => { if (loc.lat != null && loc.lng != null) bounds.extend([loc.lat, loc.lng]); });
    if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    setAutoFit(true);
    userInteractedRef.current = false;
  }, [locations, leafletModule]);

  // ─── Focused vehicle data for HUD gauges ───
  const hud = useMemo(() => {
    if (!focusedLoc) return null;
    const loc = focusedLoc;
    const isTracker = loc.source === "tracker";
    const td = loc.tracker_data;
    const speed = isTracker && td?.speed_kmh != null ? Math.round(td.speed_kmh) : speedKmh(loc.speed);
    const isMoving = speed > 2;
    const heading = isTracker && td?.heading_computed ? Math.round(td.heading_computed) : (loc.heading != null && loc.heading > 0 ? Math.round(loc.heading) : 0);
    const compass = isTracker && td?.heading_compass && td.heading_compass !== "—" ? td.heading_compass : (heading > 0 ? getCompassDir(heading) : "—");
    const mileage = trailDistanceKm(td?.trail);
    const stale = isStale(loc.timestamp);
    const online = isTracker ? !!td?.online : loc.status === "active";
    const movement = td?.movement || (isMoving ? "moving" : "stationary");
    const hbAge = td?.heartbeat_age_sec ?? null;
    const signal = td?.signal ?? null;
    return { loc, isTracker, td, speed, isMoving, heading, compass, mileage, stale, online, movement, hbAge, signal };
  }, [focusedLoc]);

  // ─── Error / loading states ───
  if (hasError) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height, background: HUD.bg }}>
        <div className="flex flex-col items-center gap-2" style={{ color: HUD.textDim }}>
          <MapPin className="h-6 w-6" style={{ color: HUD.red }} />
          <span className="text-xs font-medium">Map failed to load</span>
          <button onClick={() => { setHasError(false); setIsLoaded(false); setLeafletModule(null); setTimeout(() => window.location.reload(), 100); }}
            className="text-xs font-bold underline" style={{ color: HUD.cyan }}>Retry</button>
        </div>
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height, background: HUD.bg }}>
        <div className="flex flex-col items-center gap-2" style={{ color: HUD.textDim }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: HUD.cyan }} />
          <span className="text-xs font-medium">Initializing HUD…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden flex flex-col ${className}`} style={{ height, background: HUD.bg, borderRadius: "12px" }}>
      {/* Map section */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} className="z-0" />

        {/* ── HUD Corner Decorations ── */}
        <div className="absolute top-0 left-0 w-8 h-8 pointer-events-none z-[500]" style={{ borderTop: `2px solid ${HUD.cyanDim}`, borderLeft: `2px solid ${HUD.cyanDim}` }} />
        <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none z-[500]" style={{ borderTop: `2px solid ${HUD.cyanDim}`, borderRight: `2px solid ${HUD.cyanDim}` }} />
        <div className="absolute bottom-0 left-0 w-8 h-8 pointer-events-none z-[500]" style={{ borderBottom: `2px solid ${HUD.cyanDim}`, borderLeft: `2px solid ${HUD.cyanDim}` }} />
        <div className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none z-[500]" style={{ borderBottom: `2px solid ${HUD.cyanDim}`, borderRight: `2px solid ${HUD.cyanDim}` }} />

        {/* ── Top-left: Status ── */}
        <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-1.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: HUD.bgPanel, border: `1px solid ${HUD.border}`, backdropFilter: "blur(12px)" }}>
            <Radio className="h-3.5 w-3.5" style={{ color: HUD.cyan }} />
            <span className="text-[10px] font-bold" style={{ color: HUD.text }}>
              {riderEntries.length === 0 ? "NO SIGNAL" : (
                [trackingCount > 0 ? `${trackingCount} LIVE` : "", activeCount > 0 ? `${activeCount} SHIFT` : ""].filter(Boolean).join(" · ") || `${riderEntries.length} DEVICE${riderEntries.length > 1 ? "S" : ""}`
              )}
            </span>
            {trackingCount > 0 && <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: HUD.cyan, boxShadow: HUD.cyanGlow }} />}
          </div>

          {/* Live time */}
          <div className="px-2.5 py-1 rounded-lg" style={{ background: HUD.bgPanel, border: `1px solid ${HUD.border}` }}>
            <span className="text-[9px] font-mono" style={{ color: HUD.textDim }}>
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>

        {/* ── Top-right: Controls ── */}
        <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-1.5">
          <div className="flex gap-1">
            <button onClick={() => setShowTrails(!showTrails)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
              style={{ background: showTrails ? `${HUD.cyan}22` : HUD.bgPanel, color: showTrails ? HUD.cyan : HUD.textDim, border: `1px solid ${showTrails ? HUD.cyan + "44" : HUD.border}` }}>
              <Navigation className="h-3 w-3" /> TRAIL
            </button>
            <button onClick={() => setShowHud(!showHud)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
              style={{ background: showHud ? `${HUD.cyan}22` : HUD.bgPanel, color: showHud ? HUD.cyan : HUD.textDim, border: `1px solid ${showHud ? HUD.cyan + "44" : HUD.border}` }}>
              {showHud ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} HUD
            </button>
          </div>
          <div className="flex gap-1">
            {playbackTrail.length > 1 && (
              <button onClick={togglePlayback}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
                style={{ background: playbackActive ? `${HUD.purple}33` : HUD.bgPanel, color: playbackActive ? HUD.purple : HUD.textDim, border: `1px solid ${playbackActive ? HUD.purple + "44" : HUD.border}` }}>
                <Play className="h-3 w-3" /> {playbackActive ? "STOP" : "REPLAY"}
              </button>
            )}
            <button onClick={handleFitAll}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold transition-all"
              style={{ background: autoFit ? `${HUD.cyan}22` : HUD.bgPanel, color: autoFit ? HUD.cyan : HUD.textDim, border: `1px solid ${autoFit ? HUD.cyan + "44" : HUD.border}` }}>
              <Crosshair className="h-3 w-3" /> {autoFit ? "AUTO" : "FIT"}
            </button>
          </div>
        </div>

        {/* ── Speed Legend (bottom-left) ── */}
        {showTrails && !playbackActive && Object.values(locations).some((l) => l.tracker_data?.trail && l.tracker_data.trail.length > 1) && (
          <div className="absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: HUD.bgPanel, border: `1px solid ${HUD.border}` }}>
            <span className="text-[7px] font-bold" style={{ color: HUD.textDim }}>SPEED:</span>
            <span className="w-3 h-1 rounded-sm" style={{ background: HUD.green }} /><span className="text-[7px]" style={{ color: HUD.textDim }}>Idle</span>
            <span className="w-3 h-1 rounded-sm" style={{ background: HUD.cyan }} /><span className="text-[7px]" style={{ color: HUD.textDim }}>OK</span>
            <span className="w-3 h-1 rounded-sm" style={{ background: HUD.amber }} /><span className="text-[7px]" style={{ color: HUD.textDim }}>Fast</span>
            <span className="w-3 h-1 rounded-sm" style={{ background: HUD.red }} /><span className="text-[7px]" style={{ color: HUD.textDim }}>Over</span>
          </div>
        )}

        {/* ── Playback controls ── */}
        {playbackActive && playbackTrail.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 z-[1000] px-3 py-2" style={{ background: HUD.bgPanel, borderTop: `1px solid ${HUD.border}`, backdropFilter: "blur(12px)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-mono min-w-[40px]" style={{ color: HUD.textDim }}>
                {playbackTrail[playbackIndex]?.t ? new Date(playbackTrail[playbackIndex].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--"}
              </span>
              <input type="range" min={0} max={playbackTrail.length - 1} value={playbackIndex}
                onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, ${HUD.cyan} ${(playbackIndex / (playbackTrail.length - 1)) * 100}%, rgba(255,255,255,0.1) ${(playbackIndex / (playbackTrail.length - 1)) * 100}%)` }} />
              <span className="text-[9px] font-mono min-w-[40px] text-right" style={{ color: HUD.textDim }}>
                {playbackTrail[playbackTrail.length - 1]?.t ? new Date(playbackTrail[playbackTrail.length - 1].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: (playbackTrail[playbackIndex]?.speed || 0) > 40 ? HUD.red : (playbackTrail[playbackIndex]?.speed || 0) > 20 ? HUD.amber : HUD.cyan }}>
                  {Math.round(playbackTrail[playbackIndex]?.speed || 0)} km/h
                </span>
                <span className="text-[9px]" style={{ color: HUD.textDim }}>{playbackIndex + 1}/{playbackTrail.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={skipBack} className="p-1 rounded-full transition-colors hover:bg-white/5"><SkipBack className="h-3.5 w-3.5" style={{ color: HUD.textDim }} /></button>
                <button onClick={togglePlayPause} className="p-1.5 rounded-full transition-colors" style={{ background: `${HUD.purple}44`, color: HUD.purple }}>
                  {playbackPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button onClick={skipForward} className="p-1 rounded-full transition-colors hover:bg-white/5"><SkipForward className="h-3.5 w-3.5" style={{ color: HUD.textDim }} /></button>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 4].map((spd) => (
                  <button key={spd} onClick={() => setPlaybackSpeed(spd)}
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold transition-all"
                    style={{ background: playbackSpeed === spd ? `${HUD.purple}44` : "rgba(255,255,255,0.05)", color: playbackSpeed === spd ? HUD.purple : HUD.textDim }}>
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No signal overlay */}
        {riderEntries.length === 0 && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Satellite className="h-10 w-10" style={{ color: HUD.textDim }} />
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full animate-pulse" style={{ background: HUD.red }} />
              </div>
              <p className="text-sm font-bold" style={{ color: HUD.text }}>NO SIGNAL</p>
              <p className="text-xs" style={{ color: HUD.textDim }}>Waiting for tracker or rider signal…</p>
            </div>
          </div>
        )}
      </div>

      {/* ══════ HUD Instrument Panel ══════ */}
      {showHud && hud && riderEntries.length > 0 && (
        <div style={{ background: HUD.bgPanelSolid, borderTop: `1px solid ${HUD.border}` }} className="shrink-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: `1px solid ${HUD.border}` }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">{hud.isTracker ? "📡" : "🛺"}</span>
              <span className="text-xs font-bold truncate" style={{ color: HUD.text }}>{hud.loc.rider_name}</span>
              <span className="text-[8px] font-mono" style={{ color: HUD.textDim }}>{hud.isTracker ? "TRACKER" : "PHONE"}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full" style={{
                background: hud.online ? (hud.isMoving ? HUD.cyan : HUD.green) : "#555",
                boxShadow: hud.online && hud.isMoving ? HUD.cyanGlow : "none",
                animation: hud.isMoving ? "hud-pulse 2s infinite" : "none",
              }} />
              <span className="text-[9px] font-bold" style={{
                color: hud.online ? (hud.isMoving ? HUD.cyan : HUD.green) : "#555",
              }}>
                {hud.online ? (hud.isMoving ? "MOVING" : "PARKED") : "OFFLINE"}
              </span>
            </div>
          </div>

          {/* Gauges grid */}
          <div className="grid grid-cols-5 gap-1 p-2">
            {/* Speed arc */}
            <div className="flex flex-col items-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
              <div className="w-16 h-16" dangerouslySetInnerHTML={{ __html: speedArcSvg(hud.speed) }} />
              <span className="text-[7px] font-bold mt-0.5" style={{ color: HUD.textDim }}>SPEED</span>
            </div>

            {/* Compass / Heading */}
            <div className="flex flex-col items-center justify-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
              <div className="relative w-10 h-10">
                {/* Compass ring */}
                <svg viewBox="0 0 40 40" className="w-full h-full">
                  <circle cx="20" cy="20" r="17" fill="none" stroke={HUD.border} strokeWidth="1" strokeDasharray="2 2" />
                  <text x="20" y="6" textAnchor="middle" fill={HUD.textDim} fontSize="5" fontWeight="700">N</text>
                  <text x="36" y="22" textAnchor="middle" fill={HUD.textDim} fontSize="4">E</text>
                  <text x="20" y="38" textAnchor="middle" fill={HUD.textDim} fontSize="4">S</text>
                  <text x="4" y="22" textAnchor="middle" fill={HUD.textDim} fontSize="4">W</text>
                </svg>
                {/* Direction needle */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Navigation className="h-4 w-4" style={{ color: HUD.cyan, transform: `rotate(${hud.heading}deg)`, filter: `drop-shadow(0 0 4px ${HUD.cyan})`, transition: "transform 0.8s ease" }} />
                </div>
              </div>
              <span className="text-xs font-bold" style={{ color: HUD.cyan, textShadow: `0 0 8px ${HUD.cyan}` }}>{hud.compass}</span>
              <span className="text-[7px] font-bold" style={{ color: HUD.textDim }}>HEADING</span>
            </div>

            {/* Signal strength */}
            <div className="flex flex-col items-center justify-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
              <div className="flex items-end gap-px h-5 mb-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="w-1.5 rounded-sm transition-all" style={{
                    height: `${4 + i * 3}px`,
                    background: hud.signal != null && hud.signal >= i * 6
                      ? (hud.signal >= 20 ? HUD.cyan : hud.signal >= 10 ? HUD.amber : HUD.red)
                      : "rgba(255,255,255,0.08)",
                    boxShadow: hud.signal != null && hud.signal >= i * 6 ? `0 0 4px ${HUD.cyan}` : "none",
                  }} />
                ))}
              </div>
              <span className="text-sm font-bold" style={{ color: HUD.purple, textShadow: `0 0 6px ${HUD.purple}` }}>
                {hud.signal ?? "—"}
              </span>
              <span className="text-[7px] font-bold" style={{ color: HUD.textDim }}>SIGNAL</span>
            </div>

            {/* Heartbeat */}
            <div className="flex flex-col items-center justify-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
              <Activity className="h-4 w-4 mb-1" style={{
                color: hud.hbAge != null && hud.hbAge < 30 ? HUD.green : hud.hbAge != null && hud.hbAge < 120 ? HUD.amber : HUD.red,
                filter: hud.hbAge != null && hud.hbAge < 30 ? `drop-shadow(0 0 4px ${HUD.green})` : "none",
                animation: hud.hbAge != null && hud.hbAge < 60 ? "hud-pulse 1.5s infinite" : "none",
              }} />
              <span className="text-sm font-bold" style={{
                color: hud.hbAge != null && hud.hbAge < 30 ? HUD.green : hud.hbAge != null && hud.hbAge < 120 ? HUD.amber : HUD.red,
              }}>
                {hud.hbAge != null ? formatDuration(hud.hbAge) : "—"}
              </span>
              <span className="text-[7px] font-bold" style={{ color: HUD.textDim }}>HEARTBEAT</span>
            </div>

            {/* Distance */}
            <div className="flex flex-col items-center justify-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
              <MapPin className="h-4 w-4 mb-1" style={{ color: HUD.amber, filter: `drop-shadow(0 0 4px ${HUD.amber})` }} />
              <span className="text-sm font-bold" style={{ color: HUD.amber, textShadow: `0 0 6px ${HUD.amber}` }}>
                {hud.mileage > 0 ? hud.mileage.toFixed(1) : "0.0"}
              </span>
              <span className="text-[7px] font-bold" style={{ color: HUD.textDim }}>KM TODAY</span>
            </div>
          </div>

          {/* Speed history waveform */}
          {hud.td?.speed_history && hud.td.speed_history.length > 3 && (
            <div className="px-3 pb-2">
              <div className="flex items-end gap-px h-6 rounded-lg px-2 py-1" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${HUD.border}` }}>
                <span className="text-[7px] font-bold mr-2 self-center" style={{ color: HUD.textDim }}>SPD</span>
                {hud.td.speed_history.map((s: number, i: number) => {
                  const barColor = s > 40 ? HUD.red : s > 20 ? HUD.amber : s > 2 ? HUD.cyan : "rgba(255,255,255,0.08)";
                  return (
                    <div key={i} className="flex-1 rounded-sm transition-all" style={{
                      height: `${Math.max(2, Math.min(16, s / 3))}px`,
                      background: barColor,
                      boxShadow: s > 2 ? `0 0 3px ${barColor}` : "none",
                    }} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom telemetry bar */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: `1px solid ${HUD.border}` }}>
            <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: hud.isMoving ? HUD.cyan : HUD.green, textShadow: `0 0 6px ${hud.isMoving ? HUD.cyan : HUD.green}` }}>
              ⚡ {(hud.movement || "—").toUpperCase()}
            </span>
            {hud.td?.daemon_uptime_sec != null && hud.td.daemon_uptime_sec > 0 && (
              <span className="text-[9px]" style={{ color: HUD.textDim }}>
                ⏱️ <span className="font-semibold" style={{ color: HUD.text }}>{formatDuration(hud.td.daemon_uptime_sec)}</span>
              </span>
            )}
            <span className="text-[9px] font-mono" style={{ color: HUD.textDim }}>
              {hud.loc.lat.toFixed(5)}, {hud.loc.lng.toFixed(5)}
            </span>
            <span className="text-[9px]" style={{ color: HUD.textDim }}>
              🕐 {timeAgoLabel(hud.loc.timestamp)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HUD Rider Location List ───
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
        const aLive = a.source === "tracker" ? !!a.tracker_data?.online : a.status === "active";
        const bLive = b.source === "tracker" ? !!b.tracker_data?.online : b.status === "active";
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [locations]);

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
        const statusColor = !isActive ? "#555" : isMoving ? HUD.cyan : HUD.green;

        return (
          <button
            key={loc.id}
            onClick={() => onSelectRider?.(isSelected ? null : loc.id)}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all"
            style={{
              background: isSelected ? `${HUD.cyan}11` : HUD.bgPanelSolid,
              border: `1px solid ${isSelected ? HUD.cyan + "33" : HUD.border}`,
            }}
          >
            {/* Avatar */}
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg" style={{
              background: `${statusColor}15`,
              border: `1px solid ${statusColor}33`,
            }}>
              {isTracker ? (
                <Satellite className="h-5 w-5" style={{ color: statusColor }} />
              ) : (
                <Navigation className="h-5 w-5" style={{ color: statusColor }} />
              )}
              {isActive && !stale && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full" style={{
                  background: statusColor,
                  boxShadow: `0 0 6px ${statusColor}`,
                  animation: isMoving ? "hud-pulse 2s infinite" : "none",
                }} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: HUD.text }}>
                {loc.rider_name}
                {isTracker && <span className="ml-1.5 text-[8px] font-semibold px-1.5 py-0.5 rounded" style={{ color: HUD.cyan, background: `${HUD.cyan}15`, border: `1px solid ${HUD.cyan}22` }}>TRACKER</span>}
              </p>
              <div className="flex items-center gap-2 text-[11px] mt-0.5" style={{ color: HUD.textDim }}>
                {isActive && (
                  <>
                    <span className="flex items-center gap-0.5 font-semibold" style={{ color: isMoving ? (speed > 40 ? HUD.red : HUD.cyan) : HUD.green }}>
                      <Gauge className="h-3 w-3" />
                      {isMoving ? `${speed} km/h` : "Parked"}
                    </span>
                    <span style={{ color: HUD.border }}>·</span>
                  </>
                )}
                <span style={{ color: stale ? HUD.amber : HUD.textDim }}>{ago}</span>
                {isTracker && loc.tracker_data && (
                  <>
                    <span style={{ color: HUD.border }}>·</span>
                    <span className="font-semibold" style={{ color: loc.tracker_data.online ? HUD.green : "#555" }}>
                      📡 {loc.tracker_data.online ? "Live" : "Off"}
                    </span>
                  </>
                )}
              </div>

              {/* Speed history bars */}
              {isTracker && loc.tracker_data?.speed_history && loc.tracker_data.speed_history.length > 3 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[8px] font-bold" style={{ color: HUD.textDim }}>SPD:</span>
                  <div className="flex items-end gap-px h-2.5">
                    {loc.tracker_data.speed_history.slice(-12).map((s: number, i: number) => {
                      const barColor = s > 30 ? HUD.red : s > 15 ? HUD.amber : s > 2 ? HUD.cyan : "rgba(255,255,255,0.05)";
                      return <div key={i} className="w-1 rounded-sm" style={{ height: `${Math.max(1, Math.min(10, s / 4))}px`, background: barColor }} />;
                    })}
                  </div>
                  {loc.tracker_data.heading_compass && loc.tracker_data.heading_computed > 0 && (
                    <span className="text-[8px] font-semibold ml-1" style={{ color: HUD.cyan }}>{loc.tracker_data.heading_compass}</span>
                  )}
                </div>
              )}
            </div>

            {/* Status badge */}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{
                  background: statusColor,
                  boxShadow: isActive && isMoving ? `0 0 6px ${statusColor}` : "none",
                  animation: isActive && isMoving ? "hud-pulse 2s infinite" : "none",
                }} />
                <span className="text-[9px] font-bold" style={{ color: statusColor }}>
                  {isTracker
                    ? (trackerOnline ? (isMoving ? "MOVING" : "TRACKING") : "DEVICE OFF")
                    : (isActive ? (stale ? "STALE" : (isMoving ? "ON SHIFT" : "PARKED")) : "OFFLINE")}
                </span>
              </div>
              {isMoving && loc.heading != null && loc.heading > 0 && (
                <span className="text-[8px]" style={{ color: HUD.textDim }}>{Math.round(loc.heading)}°</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
