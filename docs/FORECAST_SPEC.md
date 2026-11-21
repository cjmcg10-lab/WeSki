# Forecast spec (Connor, 2026-11-21)

The original build spec for the Forecast section, kept word for word. The working plan is `docs/FORECAST_PLAN.md`; the work is tracked in GitHub issue #1 and its sub-issues.

Build a mobile-first ski forecasting app where I can search for any downhill ski resort worldwide, add it to my watchlist, compare its daily ski-quality scores with any other resorts I choose, and tap a day to see hourly conditions.

Worldwide resort search is a core requirement. The user chooses the mountains. The watchlist, comparison calendar, weather requests, and scoring engine must all work from the selected resort’s ID, coordinates, elevation, and local time zone. Adding a resort that already exists in the catalog must require zero code changes. Start new users with an empty watchlist and an “Add a mountain” search. If a resort is missing from the catalog, let the user add a provisional location by map pin.

Implement and verify a working app with live weather data. Follow these requirements.

## 1. Fit the project

Inspect the repository and reuse its stack, design system, and deployment setup. If this is the existing SkiWithMe project, add a Forecast section and preserve the map, group, and tracking features. If the repository is empty, build a standalone mobile-first TypeScript web app suitable for Cloudflare deployment.

Support iPhone, Android, and desktop browsers. Save the watchlist across reloads without requiring an account. Use free, commercially reusable production data sources. Verify current provider documentation, license terms, attribution, rate limits, caching rules, and redistribution terms. Keep credentials server-side. Obtain approval before public deployment or incurring charges.

## 2. Build worldwide mountain search and setup

Use a maintained worldwide downhill ski-area catalog such as OpenSkiData. Index the full available catalog. Search official names, alternate names, local spellings, and nearby towns. Show region and country in search results so the user can distinguish resorts with similar names. Support resorts in both hemispheres, small local hills, and large multi-sector mountains.

For each resort, store:

- Stable resort ID, display name, aliases, region, country, and local time zone.
- Representative skiable base coordinates and elevation.
- Representative upper-mountain coordinates and elevation, preferably at the highest regularly lift-served ski terrain.
- Source and verification status for each terrain point.
- Published operating hours and seasonal status when available.
- Separate sectors when reliable mapping shows that the resort spans materially different valleys or elevations.

Use mapped lifts and connected downhill runs to locate ski terrain. Cross-check questionable elevations against permitted resort information or an open elevation dataset such as Copernicus GLO-30. A nearby town, hotel, or geographic summit can be at a materially different elevation from the skiing.

If a search has no match, let the user name a provisional resort, select its location on a map, save it to the same watchlist, and receive a location forecast. Identify missing terrain information and support correcting it later. The user should be able to save a mountain even when forecast coverage is incomplete.

## 3. Make the comparison calendar the home screen

Use mountains as rows and dates as columns. Keep mountain names visible while dates scroll horizontally on a phone. Let the user add, remove, and reorder any mountains, including mountains in different countries.

Each mountain-day cell should show:

1. Overall day score out of 100, or a supported range when uncertainty is substantial.
2. Best ski window in resort-local time, such as “9 AM–noon,” when timing is reliable enough.
3. Forecast confidence: High, Medium, or Low.

Reading down one date should answer “Where should I ski Saturday?” Reading across one resort should answer “Which day should I ski here?” Allow sorting by a selected date. For a multi-day trip, let the user choose the dates they actually intend to ski, then compare average score, strongest day, weakest day, and coverage. Flag close results when uncertainty is larger than the predicted difference. A resort with missing days must not gain a ranking advantage from those omissions.

Tapping any cell must open that exact resort and local date. Show the day score, best stretch, peak individual hour, confidence, and one plain-language explanation first. Below that, display the hourly scores in a chart and an accessible list. Highlight the best stretch. Show base and upper-mountain conditions separately where supported, with temperature, wind and gusts, precipitation type, visibility, expected snow surface, and update time. Returning to the calendar should preserve the watchlist order, selected dates, and scroll position.

## 4. Route weather requests by geography and forecast horizon

Implement a worldwide point-forecast baseline so a newly selected resort can receive weather without a country-specific integration. Evaluate MET Norway Locationforecast for that role. Add regional weather sources where they offer suitable coverage and measurable value:

- United States: National Weather Service hourly forecasts, raw forecast grids, observations, and alerts.
- Canada: Environment and Climate Change Canada open data, including HRDPS where applicable.
- Nordic region: MET Norway’s regional guidance.
- French Alps and Pyrenees: Météo-France AROME where covered.
- Switzerland and surrounding terrain: MeteoSwiss regional ensembles where covered.
- Worldwide uncertainty and longer-range trends: evaluate ECMWF open ensembles and NOAA GEFS.
- Other regions: retain the worldwide baseline and add regional providers through the same adapter interface. Use Open-Meteo’s hosted service only where its current terms permit the intended use.

Maintain a source-coverage table listing each provider’s geographic domain, model family, variables, native time steps, forecast horizon, update schedule, attribution, fallback, and implementation status. Distinguish live integrations from candidates.

Choose eligible sources by the actual coordinates, elevation, variable, and forecast lead time. A high-resolution regional forecast might be useful for tomorrow’s summit gusts while a global ensemble is more useful for next week’s outlook. Track the underlying model family so two services distributing the same model do not count as independent agreement.

Normalize units and timestamps. Preserve forecast issue time, valid time, accumulation interval, source, and model-grid elevation where available. Handle stale data, missing values, daylight-saving changes, and overlapping snowfall totals. Cache results across users watching the same resort. Support worldwide search without continuously fetching weather for every resort on Earth.

## 5. Calculate hourly and daily ski-quality scores

Start with a consistent all-around, lift-served skier profile. An 80 should mean roughly the same expected experience across mountains. Keep the scoring logic, weights, and thresholds in a versioned module separate from the UI.

For each supported hour and elevation band, calculate four components from 0–100:

- Expected snow surface: 45%.
- Visibility: 25%.
- Wind exposure: 20%.
- Temperature and active-precipitation comfort: 10%.

Implement documented mappings from weather inputs to component scores. Use gradual transitions where practical. Treat these weights as tunable initial assumptions.

Estimate the snow surface from the sequence of recent and forecast weather. Use the preceding 48–72 hours of weather and timestamped surface or grooming reports where available. Carry that state forward hour by hour. Account for rain followed by refreeze, fresh snow over a firm base, and daytime softening. A clear, grippy groomer day can score highly with zero new snowfall. Distinguish summit fog from harmless high clouds. Keep confirmed lift holds separate from predicted wind impacts. Generate the explanation from the factors that actually affected that score.

Initially weight valid base and upper-mountain hourly scores equally. Preserve their individual values. When the available weather cannot resolve the difference between the base and summit, show one location estimate, identify the limitation, and lower confidence. Never invent separate summit wind or visibility values.

Calculate the headline day score over the resort’s scheduled ski hours in local time:

Day score = 0.60 × average of all ski-hour scores
          + 0.40 × highest average of any three consecutive ski hours

Round only the final displayed result. Show the winning three-hour window and the single highest-scoring hour separately. A full-day average of 70 and a best-window average of 85 must produce a day score of 76. Three isolated high-scoring hours cannot form the best window.

Document and test the rules for shortened operating days, missing hours, and tied windows. When published operating hours are unavailable, label the assumed daytime window. Show “Closed” for a confirmed closure and “Insufficient data” when coverage cannot support a defensible score.

## 6. Show confidence and limit forecast precision

Keep ski quality and forecast confidence separate. An excellent predicted day can have low confidence. Start with High, Medium, and Low labels and give the main reason, such as “Models disagree on whether precipitation falls as rain or snow at the base.”

Consider forecast lead time, source age, model agreement, resolution, elevation mismatch, observation coverage, missing surface history, and uncertainty about the starting snow surface. When ensembles are available, score plausible scenarios individually before summarizing their outcomes. Distinguish confidence in the quality of the day from confidence in the timing of its best window.

Use these starting display rules, adjusted to actual source resolution and demonstrated forecast skill:

- Today through 48 hours: daily and hourly scores, elevation details, and best ski window where supported.
- Days 3–5: daily scores and broader windows. Show hourly detail where defensible.
- Days 6–9: supported daily ranges or broad outlooks with confidence.
- Days 10–15: optional broad trip-planning trends where suitable guidance exists.
- Beyond the available horizon: indicate when the trip enters forecast range.

Keep every selected date tappable. If hourly detail is unavailable, explain why and show the most useful supported time blocks. Do not invent hourly precision, score ranges, or confidence percentages. Archive forecasts as originally issued, along with the scoring version, so forecast accuracy, resort rankings, and best-window timing can later be checked against observations and skier feedback.

## 7. Verify that the app works beyond the examples

Use live data in the normal app and clearly labeled fixtures for repeatable tests. Before calling the build complete:

1. Start with an empty watchlist. Search for Jay Peak, Burke Mountain, and Cannon Mountain through the same worldwide search used by every resort. Compare a date, open one hourly view, and return to the same calendar position.
2. Replace all three with entirely different resorts chosen from the imported catalog during verification. Include a small hill, a resort outside North America, and a Southern Hemisphere resort. Add, reorder, reload, compare, and open their forecasts without editing code or configuration. This is a required acceptance test.
3. Add a provisional mountain by pin and verify that it uses the same watchlist and calendar, with its terrain limitations clearly shown.
4. Verify the daily formula, best consecutive window, local dates, missing hours, stale-provider fallback, unresolved summit data, and confirmed closures.
5. Check the calendar and hourly details on a narrow phone screen. Make scores and confidence understandable without relying on color alone.

Deliver the runnable app, setup and test commands, a source-coverage table, and a concise account of what was tested against live data. Prioritize the complete worldwide workflow: search any resort → add it to the watchlist → compare daily scores and best windows → tap a day for hourly conditions.