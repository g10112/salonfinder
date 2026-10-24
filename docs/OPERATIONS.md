# Operations and release checklist

## Environment and topology

The Node 22 service is designed to sit behind a managed HTTPS reverse proxy/load balancer. Configure `PORT`, `HOST`, and `GEOAPIFY_API_KEY` using your deployment platform's encrypted environment variables. Do not bake a key into Docker layers, static assets or build-time variables. A credential-less deployment is an **explicit fictional demo**, not an impaired live search. Healthcheck: `GET /healthz`; status response does not disclose secrets.

Recommended initial production topology: one container replica behind TLS-terminating ingress, managed rate limiting/WAF, provider usage and spend alerts, structured error collection with redaction, and deploy/revert scripts. Use provider account IP restrictions where supported. With multiple application replicas, replace the in-memory cache and per-process rate limiter with a shared managed cache and edge quota controls. Logging purposely excludes full search strings, full client locations, personal notes and provider keys; ensure the reverse proxy does likewise where appropriate.

## Release gates

- [x] Source is complete, runnable with Node 22 and has a Dockerfile.
- [x] Syntax checks, basic HTTP test suite and mock-provider tests pass locally.
- [x] Responsive desktop/mobile Chromium functional walkthrough with local mocked data (1440px and 390px) completed.
- [x] Demo listings are explicitly fictional and cannot be contacted.
- [ ] Host with a valid domain and trusted TLS certificate.
- [ ] Configure and restrict a live Geoapify API key with billing limits and alerting.
- [ ] Validate 10+ real location searches, ambiguous addresses, provider errors and coverage in chosen launch geography.
- [ ] Validate mapped business name/address/contact details, accuracy of known opening hours and absent fields with real API responses.
- [ ] Run browser automation under production CSP/HTTPS and mobile assistive-technology checks.
- [ ] Conduct accessibility review to WCAG 2.2 AA where applicable and remediate findings.
- [ ] Add edge/distributed rate limiting, usage dashboard and uptime alerting.
- [ ] Publish required organisation identity, privacy policy, cookies/storage notice and contact/support details for the actual operator and jurisdiction.
- [ ] Confirm Geoapify/OSM attribution, retention, caching and commercial-use obligations for the subscribed plan.
- [ ] Decide search coverage, operating budget, incident ownership, backups for infrastructure/configuration and rollback process.

Passing source tests does not substitute for these production release steps.

## Provider-response hardening (October 2026)

Live Geoapify calls now refuse HTTP redirects (the server-side API key is in the request URL), require a streamable JSON response, and cap the **decoded response body** at 1,500,000 bytes while reading. This protects against absent/incorrect `Content-Length`, unexpectedly large chunked replies, malformed UTF-8 and JSON, and wrong content types. Unexpected responses, including HTTP 200 JSON error objects without the expected `results`/`features` arrays, return the existing generic `PROVIDER_ERROR` without exposing the key or raw provider payload; a valid empty `results` array still means location not found, and an empty `features` array still means zero listings. Geocoding coordinates are range-checked and null/blank/boolean coordinates are not silently interpreted as 0°.

A failed cache load is removed only if it is still the active entry for its key; an expired request failing late can no longer evict a newer successful replacement. The cache remains an in-memory, single-process 5-minute/120-entry cache, not a distributed production control.

**Compatibility:** Mocked provider integrations must return a Fetch-standard `Response` with a readable `body` stream, rather than an object implementing only `text()`. This matches Node 22 `fetch`. Valid Geoapify JSON payloads smaller than the cap retain the same API shape. Larger legitimate payloads now fail closed with HTTP 503 instead of consuming unbounded process memory; narrow search radius or investigate provider payload size rather than silently raising the cap.

**Acceptance and rollback:** Run `npm run check` on Node 22, then exercise live geocoding and Places calls with a dedicated, quota-limited test key in a non-production environment. Test normal results, provider 429, malformed/oversized bodies and proxy redirect behavior. No live provider account was used to develop these changes. Revert the PR commit(s) and redeploy the previously verified image if necessary; there are no database or state migrations. Reverting also restores the previous weaker provider-body boundary, so prefer a forward fix.

## Known reliability boundaries

**Geocoding:** A name can resolve to an unexpected same-named town; users should add region/country/postcode. Geoapify service status and quotas are outside this app's control.

**Place completeness:** Based primarily on contributed OSM tags; salon contact details, accessibility attributes and category tags may be missing or outdated. A blank field is not evidence the service is unavailable. The frontend links to official websites when present but performs no availability or booking checks.

**Search cardinality:** Capped at 100 places to control provider usage and payload size. Search again with a narrower radius for greater detail, particularly in dense urban areas. The source response may return fewer places than exist in the search area.

**Caching:** Five-minute server memory cache avoids redundant API calls on one instance. **Not persistent or distributed**. Provider data rights and plan-specific caching terms must be reviewed. Favoured local places are saved by visitors in their own local storage until cleared.

**Location/privacy:** Browser geolocation is opt-in and supported in secure contexts. The app's server forwards coordinates to Geoapify only if `GEOAPIFY_API_KEY` exists. It does not add coordinates to shared URLs. Logs should never capture full query URLs from reverse proxies. Local storage can be cleared in the app or browser.

**Accessible interface:** Screen reader live regions, semantic controls, visible focus and reduced motion included, but no independent accessibility certification has been completed.

## Incident actions

- If Geoapify API quota is exhausted, return a readable provider error; do **not** silently return fabricated real business data.
- If a key is exposed, rotate it in Geoapify and redeploy securely. Do not rewrite Git history without considering existing clones.
- If listings are inappropriate or factually incorrect, explain their community/provider origin and link visitors to verified salon contact channels; do not invent a correction.
- If service errors increase, use `/healthz` for liveness, verify upstream status and provider quota, then roll back the deployed image tag if required.

## Suggested monitoring

Health uptime/latency, fraction of 4xx/5xx statuses, provider response time and 429/503 count, API credits consumed and edge request rates. Avoid logging raw lat/lon, free-text enquiries or IP addresses long-term without a defined retention policy. No analytics vendor is installed in this source.