# Salon Finder — product specification, design principles and roadmap

## Core problem

Discovery across search engines and social feeds is noisy: services and contact details may be missing; prices, testimonials and appointment slots are not comparable or reliable without direct salon confirmation. Salon Finder organises the **known** facts, supports personal evaluation, and helps visitors contact businesses with the right questions.

## Primary journeys

### First-time visitor
1. Enter a city/postcode or voluntarily use browser geolocation.
2. Choose hair, beauty/nails, spa/massage or all and a bounded search radius.
3. Filter for contact channels or a positively marked accessibility facility.
4. Examine cards by distance and view relative positions; never confuse the schematic area plot with road mapping.
5. Open details, use a provider-listed official website or phone number when available, or external driving directions.

### Careful shopper
1. Save an appealing option.
2. Compare two or three local studios on known fields, seeing “Not listed” where information is absent.
3. Keep notes of quotes and questions privately on the device; optionally export the shortlist as CSV.
4. Create an enquiry outlining service, budget, timing, sensitivities and accessibility needs. Copy it, decide whether to send it, and book directly with the selected salon.

### Returning visitor
1. Reopen the site and select Saved.
2. Review previous notes, export or delete saved data.
3. Re-run discovery at a new location without an account.

## Product decisions

- **Trust ahead of decorative metrics.** No provider-independent star rating, fictional review quote, pseudo-pricing or implied availability.
- **Consent ahead of automation.** Search location is shared on demand, personal enquiries are copied rather than automatically sent, and favourites live only in the browser.
- **No backend user store.** Early release has low infrastructure overhead and no personal accounts or credential recovery. Cross-device sync is not supported.
- **Clear demo/live separation.** Real contact actions only for genuine provider returned records. Fictional listings are flagged visibly in cards, details and the search status banner.
- **No dependencies in the web client or Node service.** This reduces setup friction, build overhead and external assets. The trade-off is that large future app capabilities may benefit from adopting a framework and stronger UI component abstraction.
- **Fair comparison.** Missing values are never treated as negative judgements. A single missing website/phone should not imply low-quality service.
- **“Area view” is spatial, not a street-map substitute.** Pinned relative geographical positions preserve the quick exploration experience without embedding a map tile service or misrepresenting travel routes.

## Future roadmap (NOT implemented)

1. Provider abstraction with commercial alternate search sources, provenance, business claim/verification and richer service classification.
2. Truly interactive map tiles with accessible list synchronization and a compliant commercial map-tile plan.
3. Appointment discovery only after integrating an authorised availability provider; avoid false real-time “book now” claims.
4. Business owner profiles, validated service menus, optional indicative prices and verified opening hours, subject to verification and legal review.
5. Locale, currency and unit selector; localized addresses, measurement preferences and multilingual interface.
6. Optional private account and encrypted cross-device shortlist sync, with secure authentication, data export/deletion and operator privacy obligations.
7. Continuous CI browser tests, accessibility audits, search quality telemetry and geographical expansion.

## Non-goals of v1

In-app payment, provider-written reviews, salon ratings, arbitrary internet scraping, affiliate rankings, verified wheelchair audit, medical advice, appointment inventory, automated contacts, ranking bias based on commission, invented provider data or republishing sensitive user information.