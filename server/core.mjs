/** Input validation, provider adapter and demo fixtures. No user account or data store. */
export const CATEGORIES = Object.freeze({
  all: 'service.beauty',
  hair: 'service.beauty.hairdresser',
  beauty: 'service.beauty',
  spa: 'service.beauty.spa,service.beauty.massage'
});
export const RADII = new Set([1, 3, 5, 10, 20, 30]);
export const DEMO_CENTER = Object.freeze({lat: 51.5074, lon: -0.1278, label: 'London · fictional demo area'});
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function validateSearch(params) {
  const category = String(params.get('category') || 'all');
  const radius = Number(params.get('radius') || 5);
  if (!Object.hasOwn(CATEGORIES, category)) throw new ApiError(400, 'INVALID_CATEGORY', 'Choose a valid service.');
  if (!RADII.has(radius)) throw new ApiError(400, 'INVALID_RADIUS', 'Choose an available search radius.');
  const location = String(params.get('location') || '').trim();
  const rawLat = params.get('lat'); const rawLon = params.get('lon');
  let coords = null;
  if (rawLat !== null || rawLon !== null) {
    if (rawLat === null || rawLon === null || rawLat.trim() === '' || rawLon.trim() === '') throw new ApiError(400, 'INVALID_COORDINATES', 'Latitude and longitude must both be set.');
    const lat = Number(rawLat), lon = Number(rawLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new ApiError(400, 'INVALID_COORDINATES', 'Coordinates are outside the valid range.');
    coords = { lat, lon, label: 'Your chosen location' };
  } else if (location.length < 2 || location.length > 120 || /[\x00-\x1f\x7f]/.test(location)) {
    throw new ApiError(400, 'INVALID_LOCATION', 'Enter a town, city or postcode (2–120 characters).');
  }
  return {category, radius, location, coords};
}
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const x = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1-x)));
}
function text(value, cap = 180) { return typeof value === 'string' ? value.trim().slice(0, cap) : ''; }
// Provider coordinates may be numbers or numeric strings, but never null, booleans,
// empty strings or out-of-range values (Number(null) would otherwise become 0).
function providerCoordinate(value, min, max) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function safeLink(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value.startsWith('www.') ? `https://${value}` : value); return ['http:','https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function safePhone(value) {
  const phone = text(value, 48); return /^[+\d()\s.-]{6,48}$/.test(phone) ? phone : null;
}
function classify(categories) {
  if (categories.some(c => c === 'service.beauty.hairdresser')) return 'hair';
  if (categories.some(c => c === 'service.beauty.spa' || c === 'service.beauty.massage')) return 'spa';
  return 'beauty';
}
export function normalisePlace(feature, center) {
  const p = feature?.properties || {};
  const coord = feature?.geometry?.coordinates;
  const lat = providerCoordinate(p.lat ?? coord?.[1], -90, 90);
  const lon = providerCoordinate(p.lon ?? coord?.[0], -180, 180);
  if (lat === null || lon === null) return null;
  const categories = Array.isArray(p.categories) ? p.categories.filter(x => typeof x === 'string') : [];
  if (!categories.some(x => x.startsWith('service.beauty'))) return null;
  if (categories.some(x => x.startsWith('service.beauty.tattoo') || x.startsWith('service.beauty.tanning_salon')) && !categories.some(x => ['service.beauty.hairdresser','service.beauty.spa','service.beauty.massage'].includes(x))) return null;
  const name = text(p.name, 110);
  if (!name) return null;
  const id = text(p.place_id || feature.id, 220);
  if (!id) return null;
  const address = text(p.formatted, 240) || [text(p.housenumber,20),text(p.street,100),text(p.city,100),text(p.postcode,20)].filter(Boolean).join(' ');
  return {
    id, name, category: classify(categories), address: address || 'Address not listed',
    city: text(p.city, 100), lat, lon, distanceKm: +distanceKm(center, {lat,lon}).toFixed(2),
    website: safeLink(p.website), phone: safePhone(p.contact?.phone || p.phone || p.datasource?.raw?.phone),
    openingHours: text(p.opening_hours, 220) || null,
    wheelchair: p.facilities?.wheelchair === true || p.wheelchair === 'yes' || p.datasource?.raw?.wheelchair === 'yes',
    accessibilityListed: p.facilities?.wheelchair != null || p.wheelchair != null || p.datasource?.raw?.wheelchair != null,
    demo: false
  };
}
export function geoUrl(path, params, key) {
  const url = new URL(`https://api.geoapify.com${path}`);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apiKey', key);
  return url;
}
// Bound *decompressed bytes read*, not just Content-Length (which can be absent,
// false or refer to a compressed transfer). Never buffer an unbounded provider body.
const MAX_PROVIDER_BYTES = 1_500_000;
const providerResponseError = () => new ApiError(503, 'PROVIDER_ERROR', 'Unexpected response from the location service.');
function cancelBody(body) {
  try { Promise.resolve(body?.cancel?.()).catch(() => {}); } catch {}
}
async function requestJson(url, fetcher) {
  let response;
  try {
    // A redirect could disclose the API key embedded in the Geoapify URL.
    response = await fetcher(url, {
      signal: AbortSignal.timeout(8500),
      redirect: 'error',
      headers: {'Accept': 'application/json'}
    });
  } catch {
    throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'The location service is unavailable. Please try again.');
  }
  if (!response?.ok) {
    cancelBody(response?.body);
    if (response?.status === 429) throw new ApiError(503, 'PROVIDER_BUSY', 'Our location provider is busy. Try again shortly.');
    throw new ApiError(503, 'PROVIDER_ERROR', 'The location service could not complete the search.');
  }
  const advertised = response.headers?.get?.('content-length');
  if (advertised != null && (!/^\\d+$/.test(advertised.trim()) || Number(advertised) > MAX_PROVIDER_BYTES)) {
    cancelBody(response.body);
    throw providerResponseError();
  }
  const type = response.headers?.get?.('content-type');
  if (type && !/^\\s*application\\/(?:json|[\\w.-]+\\+json)(?:\\s*;|$)/i.test(type)) {
    cancelBody(response.body);
    throw providerResponseError();
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw providerResponseError();
  let total = 0;
  let finished = false;
  const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) { finished = true; break; }
      if (!(value instanceof Uint8Array) || total + value.byteLength > MAX_PROVIDER_BYTES) throw new Error('Provider body exceeds limit');
      total += value.byteLength;
      chunks.push(value);
    }
    const payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, total)));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid provider JSON shape');
    return payload;
  } catch {
    throw providerResponseError();
  } finally {
    if (!finished) {
      try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
    }
    reader.releaseLock();
  }
}
export async function searchLive(input, key, fetcher = fetch) {
  let center = input.coords;
  if (!center) {
    const geo = await requestJson(geoUrl('/v1/geocode/search', {text: input.location, format:'json', limit: 1, lang:'en'}, key), fetcher);
    const found = geo?.results?.[0];
    const lat = providerCoordinate(found?.lat, -90, 90);
    const lon = providerCoordinate(found?.lon, -180, 180);
    if (lat === null || lon === null) {
      throw new ApiError(404, 'LOCATION_NOT_FOUND', 'We could not find that location. Try a town and country or a postcode.');
    }
    center = {lat, lon, label: text(found.formatted, 150) || input.location};
  }
  const lonlat = `${center.lon},${center.lat}`;
  const url = geoUrl('/v2/places', {
    categories: CATEGORIES[input.category],
    filter: `circle:${lonlat},${input.radius*1000}`,
    bias: `proximity:${lonlat}`,
    limit: 100,
    lang: 'en'
  }, key);
  const response = await requestJson(url, fetcher);
  const seen = new Set();
  const salons = (Array.isArray(response.features) ? response.features : [])
    .map(x => normalisePlace(x, center)).filter(Boolean)
    .filter(x => x.distanceKm <= input.radius + .02)
    .filter(x => input.category === 'all' || x.category === input.category)
    .filter(x => !seen.has(x.id) && seen.add(x.id))
    .sort((a,b) => a.distanceKm - b.distanceKm)
    .slice(0, 100);
  return {mode:'live', center, salons, category: input.category, radius: input.radius, updatedAt: new Date().toISOString(),
    notice: 'Listings come from OpenStreetMap-based data. Contact businesses to verify services, opening hours and appointments.'};
}
// Entirely invented demonstrations. These are NOT real salons or bookable listings.
const examples = [
  ['Moss & Mirror Studio','hair',.008,-.018,true,false],
  ['Sunday Colour House','hair',-.013,.025,true,false],
  ['Atelier No. 8','hair',.017,.019,false,false],
  ['The Good Fringe','hair',-.018,-.035,true,true],
  ['The Quiet Cut','hair',.023,-.009,true,false],
  ['Olive Beauty Room','beauty',-.014,.003,true,true],
  ['Petal Nail Atelier','beauty',.006,.033,true,false],
  ['Glow Society','beauty',-.028,.014,false,true],
  ['Lavender Lash Lounge','beauty',.025,-.032,true,false],
  ['Little Ritual Spa','spa',-.011,-.025,true,true],
  ['Stillwater Wellness','spa',.032,.012,true,true],
  ['Cedar Massage Studio','spa',-.031,-.026,false,false],
  ['Blush & Bloom Beauty','beauty',.006,-.052,true,false],
  ['Curl Theory Studio','hair',-.039,.028,true,true],
  ['Cloud Nine Head Spa','spa',.041,-.037,true,false],
  ['Palm & Polish','beauty',.019,.051,true,true]
];
export function searchDemo(input) {
  const center = {...DEMO_CENTER};
  const salons = examples.map(([name,category,dy,dx,website,wheelchair], i) => {
    const lat = center.lat + dy, lon = center.lon + dx;
    return {id:`demo-${i+1}`, name, category, address:'Fictional address · demonstration only', city:'Demo London', lat,lon,
      distanceKm:+distanceKm(center,{lat,lon}).toFixed(2), website:null, phone:null, openingHours:null,
      wheelchair, accessibilityListed:wheelchair, demo:true};
  }).filter(x => x.distanceKm <= input.radius)
    .filter(x => input.category === 'all' || x.category === input.category)
    .sort((a,b) => a.distanceKm-b.distanceKm);
  return {mode:'demo', center, salons, category:input.category, radius:input.radius, updatedAt:new Date().toISOString(),
    notice:'DEMO MODE: All salon names, locations and attributes shown here are invented. Add a Geoapify key to search real places.'};
}