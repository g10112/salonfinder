# Salon Finder

**A thoughtful, responsive web app for discovering hair, beauty and wellness studios.**

Salon Finder helps a customer search an area, evaluate practical information, create a shortlist and contact studios directly. It does **not** claim to be an appointment inventory, review aggregator, payment processor or booking platform. Missing provider fields stay missing: there are no invented star ratings, prices, opening statuses or appointments.

> **Current status (16 October 2026):** v1 source built, 13 automated tests passing and desktop/mobile Chromium interaction smoke-tested in fictional demonstration mode. No live Geoapify key, external provider integration test, managed hosting, production observability or booking integration has been verified. This code is deployable but should not be described as an already operating commercial production service.

## Use it in 30 seconds

Requires **Node.js 22 or newer**; no npm packages or compilation required.

```bash
npm start
# Open http://127.0.0.1:3000
```

Out of the box, **every salon listing is explicitly fictional**. This makes it safe to explore the experience without a map provider account. Demo listings are centred around London irrespective of what location the visitor types; the page prominently warns that they are illustrative and cannot be contacted.

### Enable real salon searches

Get a key at [Geoapify](https://myprojects.geoapify.com/) and configure it **only on the server**, never inside `public/`:

```bash
# macOS/Linux:
GEOAPIFY_API_KEY=your_key npm start

# PowerShell:
$env:GEOAPIFY_API_KEY="your_key"
npm start
```

You can copy `.env.example` to `.env` and use `node --env-file=.env server/index.mjs` (Node 22). Do **not** check a filled `.env` into GitHub. Visit `/api/config` to verify `mode: "live"`; no credentials are exposed in the response. API usage incurs provider credits and is subject to Geoapify terms. Under load, use paid or appropriately provisioned service quotas.

## What users can do

| Capability | Details |
|---|---|
| Search | Town, city or postcode; opt-in browser geolocation; radius of 1, 3, 5, 10, 20 or 30 km. |
| Service categories | All beauty services, hairdressers/barbers, beauty/nails, or spa/massage. These use Geoapify category taxonomy; the provider does not guarantee exact service menus or nail/barber subtypes. |
| Results | Geographically bounded salon cards with truthful distance estimates, known website/phone, wheelchair information, and details. |
| Filters | Website, phone, positive wheelchair-access tag and favourites. A missing wheelchair tag is **not** treated as evidence of inaccessibility. |
| Sort | Nearest, alphabetically, or easiest to contact. |
| Explore area | Responsive schematic projection of **relative positions**, clearly distinguished from a road map, with real map/directions links for live results. |
| Saved | Heart favourites and private notes in local browser storage; saved places and CSV export. No account is required. |
| Compare | Up to three businesses across distance, services, accessibility, contact channels, hours and personal notes. |
| Prepare an enquiry | A guided, editable service/date/time/budget/preferences form; copies a polite, detailed message. It never sends or books without action by the visitor. |
| Share | Copies a search URL for town searches; precise browser-geolocation searches are deliberately not added to share URLs. |
| Accessibility | Semantic labels, `aria-live` states, keyboard-focus styling, reduced-motion support, responsive layout, native dialogs. |
| Privacy | No application account, advertising tags or analytics; visitors can delete locally saved data from Privacy & data. |
| Install | Web manifest, offline-static-assets service worker on HTTPS. Live search requires a connection. |

## Architecture

```text
Browser (responsive HTML/CSS/ES modules)
  │ ├ localStorage: favourites, notes, distance preference
  │ └ geolocation: only on explicit user request
  ▼
Node 22 HTTP server (no runtime dependencies)
  ├ GET /           → static web client
  ├ GET /api/config → demo/live status
  ├ GET /api/search → sanitised, bounded search
  └ GET /healthz    → liveness
       │
       ├ without key → explicitly invented demo fixtures
       └ with key    → Geoapify Geocoding + Places API
                           └ OSM-derived salon data
```

Backend safeguards: allowlisted static paths and upstream origins, input/radius/coordinate validation, strict CSP and security headers, HTTPS-only provider access, redirect rejection to protect the provider key, 8.5-second upstream timeout, a 1.5 MB streaming cap on decoded provider responses (including chunked or misleading Content-Length), per-process 60 requests per minute/IP, and a 5-minute/120-entry in-memory response cache. Every returned listing is normalised with HTML-escaped rendering and sanitised website/telephone links. API errors avoid leaking keys or raw provider messages.

### Search taxonomy

This app uses officially supported Geoapify Places categories:

- `all` → `service.beauty` (excludes tattoo-only and tanning-only categories).
- `hair` → `service.beauty.hairdresser`.
- `beauty` → `service.beauty`, with hair/spa results filtered out after response normalisation.
- `spa` → `service.beauty.spa,service.beauty.massage`.

A barber may be tagged as a hairdresser, and nail studios may fall under general beauty. **Not every relevant business is guaranteed to be listed or categorised correctly.** Location queries resolve to the provider's highest-ranked geocoding candidate: encourage visitors to include a country or postcode when ambiguity exists.

Geoapify docs: [Places](https://apidocs.geoapify.com/docs/places/) and [Geocoding](https://apidocs.geoapify.com/docs/geocoding/). OSM attribution is displayed in the footer. Review the relevant Geoapify plan, caching and data use terms before commercial release.

## Testing

```bash
npm test          # Node built-in test runner, API/normalisation/security/cache regression tests
npm run check     # Syntax checks + test suite
```

Manual regression matrix:

1. On desktop and narrow mobile, run a search and confirm no horizontal overflow.
2. Change category/radius, search again and verify count and empty state.
3. Toggle website/phone/wheelchair filters; reset filters.
4. Save a place; switch to Saved; refresh; reopen details and edit private notes.
5. Select two places; open Compare; copy the comparison; remove a selection.
6. Switch to Area view and open a marker's details.
7. Build an enquiry with date and budget, copy it, and confirm no network submission.
8. Attempt denied geolocation; see graceful feedback and normal manual location entry.
9. Check keyboard focus, Escape on dialogs, and reduced-motion preference.
10. With a *separate test provider key*, validate geocoding, quota errors and real listing fields; never assume availability, prices or hours are correct.

The UI was smoke-tested using Chromium with local mocked API fixture responses at 1440px and 390px, exercising save, compare, detail, notes, area view and enquiry. Browser testing did **not** establish the behaviour of the live third-party API.

## Deployment

```bash
docker build -t salonfinder:1 .
docker run --rm -p 3000:3000 -e GEOAPIFY_API_KEY="$GEOAPIFY_API_KEY" salonfinder:1
```

Set `HOST=0.0.0.0` behind HTTPS ingress for non-Docker hosting. For a real public launch, follow [Operations & launch checklist](docs/OPERATIONS.md): HTTPS domain, provider credits/quotas, shared distributed rate limiting/caching across replicas, error monitoring, backup/redeployment, browser test automation, legal/privacy/attribution and explicit live-provider smoke tests. **Do not expose this process directly as your entire edge security perimeter.**

## Repository structure

- `public/index.html` — accessible app structure, search, result views and dialogs.
- `public/styles.css` — responsive styling; CSS-only illustrative visuals (no stock photos, fabricated reviews or licensed imagery).
- `public/app.js` — search, filters, favourites, compare, local notes and enquiry generation.
- `public/sw.js` — offline static-app caching only, excludes all API calls.
- `server/core.mjs` — geocoding/places client, validation, normalisation, distance math and demo fixtures.
- `server/index.mjs` — secure, zero-dependency HTTP server.
- `tests/` — Node API and server tests.
- `.github/workflows/ci.yml` — GitHub Actions syntax and test gate.
- `docs/OPERATIONS.md` — deployment, security, release requirements.
- `docs/PRODUCT.md` — design decisions, limitations and roadmap.

## Duplicate repository note

The owner's pre-existing `salonfinder` repository is the canonical code home. The older empty `salon-finder` repository is intentionally not populated with a second implementation. No Bauer Media or BlobBridge code or data is included.

## License

**All rights reserved.** No open-source permission is granted without a separately supplied licence. This repository's original code is distinct from third-party Geoapify services and OpenStreetMap data governed by their respective terms.