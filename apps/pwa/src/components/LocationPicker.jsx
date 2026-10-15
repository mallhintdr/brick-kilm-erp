import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Map for picking the kiln's spot: tap anywhere or drag the marker. Satellite view by default
// (kilns are easy to recognise from above), street map as the other layer.
const PIN = L.divIcon({
  className: 'kiln-pin',
  html: '<svg viewBox="0 0 24 36" width="30" height="45"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
});
const PAKISTAN = [30.2, 71.5];

export default function LocationPicker({ lat, lon, disabled, onPick }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const has = lat !== '' && lon !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon));
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true })
      .setView(has ? [Number(lat), Number(lon)] : PAKISTAN, has ? 16 : 6);
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery © Esri',
    });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    });
    satellite.addTo(map);
    L.control.layers({ Satellite: satellite, Map: streets }, null, { position: 'topright' }).addTo(map);

    const place = (ll) => {
      if (!markerRef.current) {
        markerRef.current = L.marker(ll, { icon: PIN, draggable: !disabled }).addTo(map);
        markerRef.current.on('dragend', (e) => {
          const p = e.target.getLatLng();
          pickRef.current?.(p.lat.toFixed(5), p.lng.toFixed(5));
        });
      } else {
        markerRef.current.setLatLng(ll);
      }
    };
    if (has) place([Number(lat), Number(lon)]);
    if (!disabled) {
      map.on('click', (e) => {
        place(e.latlng);
        pickRef.current?.(e.latlng.lat.toFixed(5), e.latlng.lng.toFixed(5));
      });
    }
    mapRef.current = map;
    // the map sits inside a card that may still be laying out
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [disabled]);

  // typed coordinates or GPS move the marker too
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === '' || lon === '' || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return;
    const ll = [Number(lat), Number(lon)];
    if (markerRef.current) markerRef.current.setLatLng(ll);
    else {
      markerRef.current = L.marker(ll, { icon: PIN, draggable: !disabled }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const p = e.target.getLatLng();
        pickRef.current?.(p.lat.toFixed(5), p.lng.toFixed(5));
      });
    }
    // zoom in to the kiln when coming from a far-out view (e.g. the saved spot loaded after the map)
    if (map.getZoom() < 12 || !map.getBounds().contains(ll)) map.setView(ll, Math.max(map.getZoom(), 16));
  }, [lat, lon]);

  return <div ref={boxRef} className="location-map" role="application" aria-label="Kiln location map" />;
}
