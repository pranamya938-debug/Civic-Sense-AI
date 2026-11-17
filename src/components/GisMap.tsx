import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ComplaintPriority, ComplaintStatus, Ward } from '../shared/types';

export interface MapComplaintPoint {
  id: string;
  title: string;
  category: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  latitude: number;
  longitude: number;
  address: string;
  wardId: string;
  isDemoData?: boolean;
}

interface GisMapProps {
  complaints: MapComplaintPoint[];
  wards?: Ward[];
  showWardOverlay?: boolean;
  clusterMode?: boolean;
  densityMode?: boolean;
  heightClass?: string;
  selectedId?: string | null;
  pickLocationMode?: boolean;
  pickedCoords?: { lat: number; lng: number } | null;
  onPickLocation?: (lat: number, lng: number) => void;
  onSelectComplaint?: (id: string) => void;
}

const PRIORITY_COLORS: Record<ComplaintPriority, string> = {
  Critical: '#DC2626',
  High: '#D97706',
  Medium: '#059669',
  Low: '#0B3B2E',
};

export const GisMap: React.FC<GisMapProps> = ({
  complaints,
  wards = [],
  showWardOverlay = false,
  clusterMode = false,
  densityMode = false,
  heightClass = 'h-[420px]',
  selectedId,
  pickLocationMode = false,
  pickedCoords,
  onPickLocation,
  onSelectComplaint,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = pickedCoords
      ? [pickedCoords.lat, pickedCoords.lng]
      : complaints.length > 0
      ? [complaints[0].latitude, complaints[0].longitude]
      : [12.9716, 77.5946];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 12,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layerGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (pickLocationMode && onPickLocation) {
        onPickLocation(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [pickLocationMode, onPickLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
    if (pickedCoords) {
      const marker = L.circleMarker([pickedCoords.lat, pickedCoords.lng], {
        radius: 9,
        color: '#0B3B2E',
        weight: 3,
        fillColor: '#10B981',
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindTooltip(`Selected GPS: ${pickedCoords.lat.toFixed(4)}, ${pickedCoords.lng.toFixed(4)}`);
      pickMarkerRef.current = marker;
      if (pickLocationMode) {
        map.panTo([pickedCoords.lat, pickedCoords.lng]);
      }
    }
  }, [pickedCoords, pickLocationMode]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (showWardOverlay && wards.length > 0) {
      for (const ward of wards) {
        const count = complaints.filter((c) => c.wardId === ward.id).length;
        const circle = L.circle([ward.centerLat, ward.centerLng], {
          radius: 1300,
          color: '#0B3B2E',
          weight: 1,
          dashArray: '4 4',
          fillColor: '#059669',
          fillOpacity: densityMode ? Math.min(0.45, 0.08 + count * 0.06) : 0.06,
        });
        circle.bindTooltip(
          `<strong>${ward.name}</strong><br/>${ward.zone} · ${count} complaint(s)<br/><em>Demo boundary approximation</em>`
        );
        circle.addTo(layer);
      }
    }

    if (clusterMode && complaints.length > 0) {
      // Lightweight spatial grid clustering (~1.1km grid cells)
      const buckets = new Map<string, MapComplaintPoint[]>();
      for (const c of complaints) {
        const key = `${Math.round(c.latitude * 100)}:${Math.round(c.longitude * 100)}`;
        const arr = buckets.get(key) || [];
        arr.push(c);
        buckets.set(key, arr);
      }
      buckets.forEach((group) => {
        if (group.length === 1) {
          const item = group[0];
          const color = PRIORITY_COLORS[item.priority] || '#059669';
          const marker = L.circleMarker([item.latitude, item.longitude], {
            radius: selectedId === item.id ? 10 : 7,
            color: '#ffffff',
            weight: 2,
            fillColor: color,
            fillOpacity: 0.92,
          });
          marker.bindPopup(
            `<div style="min-width:200px">
              <div style="font-size:11px;color:#525252">${item.id} · ${item.priority}</div>
              <div style="font-weight:600;color:#0B3B2E;margin:2px 0">${item.title}</div>
              <div style="font-size:12px;color:#404040">${item.category} · ${item.status}</div>
            </div>`
          );
          marker.on('click', () => onSelectComplaint?.(item.id));
          marker.addTo(layer);
        } else {
          const avgLat = group.reduce((s, x) => s + x.latitude, 0) / group.length;
          const avgLng = group.reduce((s, x) => s + x.longitude, 0) / group.length;
          const clusterIcon = L.divIcon({
            html: `<div style="width:34px;height:34px;border-radius:9999px;background:#0B3B2E;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${group.length}</div>`,
            className: '',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
          const m = L.marker([avgLat, avgLng], { icon: clusterIcon });
          m.bindTooltip(`${group.length} clustered complaints — click to zoom in`);
          m.on('click', () => {
            map.setView([avgLat, avgLng], Math.min(16, map.getZoom() + 2));
          });
          m.addTo(layer);
        }
      });
    } else {
      for (const item of complaints) {
        const color = PRIORITY_COLORS[item.priority] || '#059669';
        if (densityMode) {
          L.circle([item.latitude, item.longitude], {
            radius: 320,
            color: 'transparent',
            fillColor: color,
            fillOpacity: 0.22,
          }).addTo(layer);
        }
        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius: selectedId === item.id ? 11 : 7.5,
          color: selectedId === item.id ? '#0B3B2E' : '#ffffff',
          weight: selectedId === item.id ? 3 : 2,
          fillColor: color,
          fillOpacity: 0.92,
        });
        marker.bindPopup(
          `<div style="min-width:210px">
            <div style="font-size:11px;color:#525252">${item.id} · ${item.priority}</div>
            <div style="font-weight:600;color:#0B3B2E;margin:2px 0">${item.title}</div>
            <div style="font-size:12px;color:#404040">${item.category} · ${item.status}</div>
            <div style="font-size:11px;color:#737373;margin-top:4px">${item.address}</div>
          </div>`
        );
        marker.on('click', () => onSelectComplaint?.(item.id));
        marker.addTo(layer);
      }
    }
  }, [complaints, wards, showWardOverlay, clusterMode, densityMode, selectedId, onSelectComplaint]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      {pickLocationMode && (
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-medium text-[#0B3B2E] shadow-sm">
          Click anywhere on the map to adjust GPS coordinates
        </div>
      )}
    </div>
  );
};
