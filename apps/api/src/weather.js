import { SETTING_DEFAULTS } from '@kiln/shared';
import { scope, getSetting, httpError } from './core.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Forecast from Open-Meteo (free, no key). Its "best match" blends the leading global models
// (ECMWF, GFS, ICON...) for the location; daily rain probability comes from their ensembles.
// Results are cached for an hour per kiln so every phone gets the same answer quickly.
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // `${tenant}:${kiln}:${lat},${lon}` -> { at, data }

const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max',
  'relative_humidity_2m_mean', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'sunrise', 'sunset',
];
const HOURLY = ['temperature_2m', 'precipitation_probability', 'precipitation', 'relative_humidity_2m', 'wind_speed_10m', 'weather_code'];

// Kiln advice for one day. level: 'red' | 'amber' | 'green'. Keys are translated on the phone.
export function adviseDay(d) {
  const notes = [];
  const rainP = d.rainChance ?? 0;
  const rainMm = d.rainMm ?? 0;
  if (rainP >= 50 || rainMm >= 2) notes.push({ level: 'red', key: 'wxRainCover' });
  else if (rainP >= 30 || rainMm >= 0.5) notes.push({ level: 'amber', key: 'wxRainReady' });
  if ((d.gustKmh ?? 0) >= 50 || (d.windKmh ?? 0) >= 35) notes.push({ level: 'amber', key: 'wxWind' });
  if ((d.tMax ?? 0) >= 42) notes.push({ level: 'red', key: 'wxHeat' });
  else if ((d.tMax ?? 0) >= 38) notes.push({ level: 'amber', key: 'wxHot' });
  if ((d.tMin ?? 99) <= 3) notes.push({ level: 'amber', key: 'wxCold' });
  const dryingSlow = (d.humidity ?? 0) >= 75 || (d.tMax ?? 0) < 20;
  if (!notes.some((n) => n.key === 'wxRainCover')) {
    if (dryingSlow) notes.push({ level: 'amber', key: 'wxSlowDrying' });
    else if (rainP < 30 && (d.humidity ?? 100) < 65 && (d.tMax ?? 0) >= 24) notes.push({ level: 'green', key: 'wxGoodDrying' });
  }
  const level = notes.some((n) => n.level === 'red') ? 'red' : notes.some((n) => n.level === 'amber') ? 'amber' : 'green';
  return { level, notes };
}

// How far to trust a day: 0-2 days high, 3-6 good, 7+ only a trend.
const confidence = (i) => (i <= 2 ? 'high' : i <= 6 ? 'medium' : 'low');

export function registerWeatherRoutes(app, db) {
  const auth = app.locals.auth;

  app.get('/weather', auth(), wrap(async (req, res) => {
    const [lat, lon, place] = await Promise.all([
      getSetting(db, req.user, 'kilnLat', SETTING_DEFAULTS),
      getSetting(db, req.user, 'kilnLon', SETTING_DEFAULTS),
      getSetting(db, req.user, 'kilnPlace', SETTING_DEFAULTS),
    ]);
    if (!lat || !lon || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
      throw httpError(409, 'Kiln location is not set. The owner can set it in Settings → Kiln location.');
    }
    const s = scope(req.user);
    const key = `${s.tenantId}:${s.kilnId}:${lat},${lon}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS && req.query.refresh !== '1') return res.json({ ...hit.data, cached: true });

    const url = `${OPEN_METEO}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`
      + `&daily=${DAILY.join(',')}&hourly=${HOURLY.join(',')}&forecast_days=16&timezone=auto&wind_speed_unit=kmh`;
    let raw;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      raw = await r.json();
    } catch (e) {
      // forecast service unreachable: serve the last good forecast if we have one
      if (hit) return res.json({ ...hit.data, cached: true, stale: true });
      throw httpError(502, `Weather service unavailable (${e.message}). Try again shortly.`);
    }

    const dl = raw.daily || {};
    const days = (dl.time || []).map((date, i) => {
      const d = {
        date,
        code: dl.weather_code?.[i] ?? null,
        tMax: dl.temperature_2m_max?.[i] ?? null,
        tMin: dl.temperature_2m_min?.[i] ?? null,
        rainMm: dl.precipitation_sum?.[i] ?? null,
        rainChance: dl.precipitation_probability_max?.[i] ?? null,
        humidity: dl.relative_humidity_2m_mean?.[i] ?? null,
        windKmh: dl.wind_speed_10m_max?.[i] ?? null,
        gustKmh: dl.wind_gusts_10m_max?.[i] ?? null,
        sunrise: dl.sunrise?.[i] ?? null,
        sunset: dl.sunset?.[i] ?? null,
        confidence: confidence(i),
      };
      return { ...d, advice: adviseDay(d) };
    }).slice(0, 15);

    // next 24 hours from the current hour (in the kiln's local time)
    const hl = raw.hourly || {};
    const nowLocal = new Date(Date.now() + (raw.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13);
    const start = Math.max(0, (hl.time || []).findIndex((t) => t.slice(0, 13) >= nowLocal));
    const hours = (hl.time || []).slice(start, start + 24).map((time, j) => ({
      time,
      temp: hl.temperature_2m?.[start + j] ?? null,
      rainChance: hl.precipitation_probability?.[start + j] ?? null,
      rainMm: hl.precipitation?.[start + j] ?? null,
      humidity: hl.relative_humidity_2m?.[start + j] ?? null,
      windKmh: hl.wind_speed_10m?.[start + j] ?? null,
      code: hl.weather_code?.[start + j] ?? null,
    }));

    const data = {
      place: place || '', lat: Number(lat), lon: Number(lon), timezone: raw.timezone,
      source: 'Open-Meteo (ECMWF, GFS and other national weather models)',
      updatedAt: new Date().toISOString(), days, hours,
    };
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  }));
}
