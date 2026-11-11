import { useEffect, useId, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useI18n } from '../i18n';
import 'leaflet/dist/leaflet.css';
import './map.css';

export type LocationPoint = { latitude: number; longitude: number };
export type MapPickerProps = { value?: LocationPoint; onChange?: (value: LocationPoint | undefined) => void; onValidityChange?: (valid: boolean) => void; readOnly?: boolean };
const words = {
  ru: { map: 'Карта места', hint: 'Нажмите на карту или введите координаты. Маркер можно перетащить.', lat: 'Широта', lng: 'Долгота', apply: 'Применить координаты', clear: 'Удалить точку', invalid: 'Введите широту от −90 до 90 и долготу от −180 до 180.', offline: 'Карта недоступна; координаты можно ввести вручную.', link: 'Открыть точку в OpenStreetMap' },
  en: { map: 'Location map', hint: 'Click the map or enter coordinates. You can drag the marker.', lat: 'Latitude', lng: 'Longitude', apply: 'Apply coordinates', clear: 'Remove point', invalid: 'Enter latitude from −90 to 90 and longitude from −180 to 180.', offline: 'The map is unavailable; coordinates can be entered manually.', link: 'Open point in OpenStreetMap' },
  kk: { map: 'Орын картасы', hint: 'Картаны басыңыз немесе координаттарды енгізіңіз. Белгіні жылжытуға болады.', lat: 'Ендік', lng: 'Бойлық', apply: 'Координаттарды қолдану', clear: 'Нүктені жою', invalid: 'Ендікті −90 мен 90, бойлықты −180 мен 180 аралығында енгізіңіз.', offline: 'Карта қолжетімсіз; координаттарды қолмен енгізуге болады.', link: 'Нүктені OpenStreetMap жүйесінде ашу' },
};

export function MapPicker({ value, onChange, onValidityChange, readOnly = false }: MapPickerProps) {
  const { locale } = useI18n();
  const t = words[locale];
  const zoomTitles = { ru: ['Приблизить', 'Отдалить'], en: ['Zoom in', 'Zoom out'], kk: ['Жақындату', 'Алыстату'] }[locale];
  const currentZoomTitles = useRef(zoomTitles);
  currentZoomTitles.current = zoomTitles;
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const callback = useRef(onChange);
  const point = useRef(value);
  const validityCallback = useRef(onValidityChange);
  const lastEmitted = useRef<string | null>(null);
  validityCallback.current = onValidityChange;
  callback.current = onChange;
  point.current = value;
  const [lat, setLat] = useState(value ? String(value.latitude) : '');
  const [lng, setLng] = useState(value ? String(value.longitude) : '');
  const [invalid, setInvalid] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const serialized = JSON.stringify(value ?? null);
    if (lastEmitted.current === serialized) { lastEmitted.current = null; return; }
    setLat(value ? String(value.latitude) : ''); setLng(value ? String(value.longitude) : ''); setInvalid(false);
    validityCallback.current?.(true);
  }, [value?.latitude, value?.longitude]);
  function selectPoint(next: LocationPoint) {
    setLat(String(next.latitude)); setLng(String(next.longitude)); setInvalid(false);
    validityCallback.current?.(true); lastEmitted.current = JSON.stringify(next); callback.current?.(next);
  }
  const selectPointRef = useRef(selectPoint);
  selectPointRef.current = selectPoint;
  useEffect(() => {
    let disposed = false;
    let activeMap: LeafletMap | null = null;
    // jsdom has no layout engine; manual coordinates remain fully usable.
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) { setOffline(true); return; }
    void import('leaflet').then(L => {
      if (disposed || !container.current) return;
      const initial = point.current;
      activeMap = L.map(container.current, { zoomControl: false }).setView(initial ? [initial.latitude, initial.longitude] : [54.99, 73.37], initial ? 15 : 11);
      L.control.zoom({ zoomInTitle: currentZoomTitles.current[0], zoomOutTitle: currentZoomTitles.current[1] }).addTo(activeMap);
      map.current = activeMap;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
      tiles.on('tileerror', () => setOffline(true));
      tiles.addTo(activeMap);
      if (!readOnly) activeMap.on('click', e => selectPointRef.current({ latitude: e.latlng.wrap().lat, longitude: e.latlng.wrap().lng }));
      const icon = L.divIcon({ className: 'map-picker-marker', html: '', iconSize: [20, 20], iconAnchor: [10, 10] });
      if (initial) {
        marker.current = L.marker([initial.latitude, initial.longitude], { draggable: !readOnly, icon }).addTo(activeMap);
        marker.current.on('dragend', () => { const position = marker.current?.getLatLng(); if (position) selectPointRef.current({ latitude: position.wrap().lat, longitude: position.wrap().lng }); });
      }
    }).catch(() => { if (!disposed) setOffline(true); });
    return () => { disposed = true; activeMap?.remove(); map.current = null; marker.current = null; };
  }, [readOnly]);
  useEffect(() => {
    for (const [index, selector] of ['.leaflet-control-zoom-in', '.leaflet-control-zoom-out'].entries()) {
      const button = container.current?.querySelector(selector);
      button?.setAttribute('title', zoomTitles[index]);
      button?.setAttribute('aria-label', zoomTitles[index]);
    }
  }, [locale]);
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    const coords: [number, number] = [value.latitude, value.longitude];
    if (marker.current) { marker.current.setLatLng(coords); currentMap.panTo(coords); return; }
    void import('leaflet').then(L => {
      if (map.current !== currentMap || !point.current) return;
      const icon = L.divIcon({ className: 'map-picker-marker', html: '', iconSize: [20, 20], iconAnchor: [10, 10] });
      marker.current = L.marker([point.current.latitude, point.current.longitude], { draggable: !readOnly, icon }).addTo(currentMap);
      marker.current.on('dragend', () => { const position = marker.current?.getLatLng(); if (position) selectPointRef.current({ latitude: position.wrap().lat, longitude: position.wrap().lng }); });
      currentMap.panTo([point.current.latitude, point.current.longitude]);
    });
  }, [value?.latitude, value?.longitude, readOnly]);
  function updateDraft(nextLat: string, nextLng: string) {
    setLat(nextLat); setLng(nextLng);
    const blank = !nextLat.trim() && !nextLng.trim();
    const latitude = Number(nextLat), longitude = Number(nextLng);
    const valid = blank || (Boolean(nextLat.trim()) && Boolean(nextLng.trim()) && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180);
    setInvalid(!valid); onValidityChange?.(valid);
    if (valid) {
      const next = blank ? undefined : { latitude, longitude };
      lastEmitted.current = JSON.stringify(next ?? null); onChange?.(next);
    }
  }
  return <div className="map-picker">
    {!readOnly && <p>{t.hint}</p>}
    <div className="map-picker-canvas" ref={container} role="region" aria-label={t.map} />
    {offline && <p role="status">{t.offline}</p>}
    {readOnly ? value && <><p>{t.lat}: {value.latitude}; {t.lng}: {value.longitude}</p><a href={`https://www.openstreetmap.org/?mlat=${value.latitude}&mlon=${value.longitude}#map=15/${value.latitude}/${value.longitude}`} target="_blank" rel="noreferrer">{t.link}</a></> : <>
      <div className="map-picker-fields">
        <label htmlFor={`${id}-lat`}>{t.lat}<input id={`${id}-lat`} type="text" inputMode="decimal" value={lat} onChange={e => updateDraft(e.target.value, lng)} aria-invalid={invalid} /></label>
        <label htmlFor={`${id}-lng`}>{t.lng}<input id={`${id}-lng`} type="text" inputMode="decimal" value={lng} onChange={e => updateDraft(lat, e.target.value)} aria-invalid={invalid} /></label>
      </div>
      {invalid && <p role="alert">{t.invalid}</p>}
      <div className="map-picker-actions"><button type="button" onClick={() => updateDraft('', '')}>{t.clear}</button></div>
    </>}
  </div>;
}
