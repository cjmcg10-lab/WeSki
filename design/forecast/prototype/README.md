<!-- PROTOTYPE — design artifact from /sdlc:generate-ux. Not production code.
     Implementation is produced by /sdlc:generate-code from ux-prd.md. -->

# SkiWithMe Forecast — design prototype

## What this is

A click-through picture of the approved Forecast design (`../approved-design.md`), built so the design can be
reviewed. It is **not** the app and none of it ships. Every number on screen is a hand-made fixture: nothing here is
a real forecast, a real score or a real closure. It makes no network requests and saves nothing.

It shows Forecast where it will live: inside a phone-width frame, in the tall bottom sheet, over a static stand-in
for the map, with the six-tab bar (Map, Group, Stats, History, Forecast, More).

## How to run

Open `index.html` in a browser (double-click it). No install, no build, no server needed.

If you prefer a local server: `npx serve .` from this folder. That command keeps running until you stop it.

## Screens

| Screen | File | What it is |
|---|---|---|
| S1 Forecast | `screens/s1-forecast.html` (also `index.html`) | The calendar: mountains down the side, nine days across |
| S2 Day view | `screens/s2-day-view.html` | One mountain on one day: score, best window, hours |
| S3 Add a mountain | `screens/s3-add-a-mountain.html` | Search and add |
| S4 Drop a pin / Edit pin | `screens/s4-drop-a-pin.html` | Add a mountain that is not in the list |
| S5 Edit list | `screens/s5-edit-list.html` | Reorder, remove, undo |
| S6 Plan a trip | `screens/s6-plan-a-trip.html` | Pick days, rank the mountains |
| S7 How scores work | `screens/s7-how-scores-work.html` | The explainer |

All eight pages share one phone shell and one script, so you can also walk between screens inside any of them the
way a user would (tap a score cell, a toolbar button, the back control).

Entry points: the **Forecast tab**, the **Forecast button on the start screen** and the **ski score row in Mountain
weather**. Use "Entry points" in the Prototype states panel, or `index.html?screen=map`, `?screen=start`,
`?screen=wx`.

The weather row has six forms. Mountain already on your list: "Ski score today", which opens the day view. Not on
your list: one button, "Add Jay Peak to your list"; tapping it adds the mountain and opens today's day view, which
shows "Jay Peak added to your list." with an Undo button at its top. Back from there, the row reads "Jay Peak added
to your list." with two buttons, "Open day view" and "Undo". Undo, from either place, removes the mountain and ends
on the weather sheet with focus on the Add button. In the `loading` state the row reads "Loading ski score…" and a
tap shows and announces "Still loading the ski score." In the `error` state, with the mountain on your list, the row
reads "Ski score couldn't load." with the button "Open day view", which opens the day view showing only its error
and "Try again". In the `error` state with the mountain not on your list, tapping Add opens the day view with
"Couldn't save Jay Peak. This device may be in private browsing or out of space." and "Try again: add Jay Peak" at
its top; the first retry fails ("Still couldn't save Jay Peak. Try again later."), the second saves and puts focus on
Undo.

The Forecast tab, pressed on a day view that was opened from the weather row, opens the calendar.

Closing Forecast and opening it again returns the calendar to where it was scrolled. "Open the map" in the day view
closes Forecast and puts focus on the mountain name in the app header.

## How to reach each state

Two ways, both without editing code:

1. The **Prototype states** panel beside the phone (below it on a narrow screen): pick a Screen, then a State. It
   also switches Dark / Light. A line under the buttons says what you are looking at.
2. The address: `?state=` with one of `default`, `loading`, `empty`, `error`, `partial`, `offline`,
   `no-permission`, for example `screens/s4-drop-a-pin.html?state=no-permission`. Add `&theme=light` for the light
   theme. The screen index on every page links all 49 combinations.

Seven screens × seven states = 49. Where the design says a state cannot occur, the screen shows its default and the
panel states the reason:

| Screen | States that cannot occur (reason shown in the panel) |
|---|---|
| S1, S2, S3, S6 | no-permission (no device permission or sign-in is needed) |
| S5 | loading (the list is read from the phone before the screen draws), no-permission |
| S7 | loading, empty, error (the text ships with the app), no-permission |

Variants inside a state:

| To see | Do this |
|---|---|
| Closed day | S1: Cannon Mountain, Monday. Or `screens/s2-day-view.html?m=cannon-mountain&day=3` |
| Insufficient data | S1: Niseko Hirafu, Wednesday. Or `?m=niseko-hirafu&day=5` |
| Insufficient data: too few hours with data | S1: Burklyn Hill, today (4 of 7 ski hours missing: "Not enough hourly data to score this day."). Or `?m=pin-burklyn-hill&day=0` |
| Best window with under 3 hours of data | S1: Cannon Mountain, today (cell "Under 3 h of data"); the day view shows "Best window: under 3 hours of data". Or `?m=cannon-mountain&day=0` |
| Southern Hemisphere, out of season | Cardrona (Otago, New Zealand), last row on S1: every cell "Closed", row lines "Season closed. Opens June." and its own time zone. Day view "Closed for the season." (`?m=cardrona`). Also in S3: type "cardrona" |
| Day over (another time zone) | Niseko Hirafu, today. Or `?m=niseko-hirafu&day=0` |
| Time blocks (days 3–5) / range (days 6–9) | In S2 step forward with the `›` button. Or `?day=3`, `?day=6` |
| Pinned mountain (tag "Pinned") | Burklyn Hill row; `?m=pin-burklyn-hill` |
| Failed row and stale row | S1 or S6, state `partial` (Burke Mountain fails, Cannon Mountain is stale) |
| Offline with no saved copy | State `offline`: Burklyn Hill row on S1; `screens/s2-day-view.html?state=offline&m=pin-burklyn-hill` |
| Error with no saved copy | `screens/s2-day-view.html?state=error&m=pin-burklyn-hill`, or tap any "–" cell on S1 in state `error` |
| Offline, score saved but no hourly detail | `screens/s2-day-view.html?state=offline&m=cannon-mountain&day=2` |
| Day view with a placeholder score | S1 in state `loading`, tap any cell |
| Refresh outcomes | State `offline`: the button reads "Refresh when online"; pressing it shows a line under it that stays. State `error`: Refresh replaces the error card's text with "Still couldn't load …. Try again later." and puts nothing in the footer. State `partial` (S1): Refresh before Burke's retry ends with "Updated. 1 mountain couldn't load." and no toast. State `default` with the panel option **Options → Refresh fails** on: Refresh ends with "Couldn't refresh. Showing forecasts as of 6:40 AM." Otherwise it ends with the "Forecasts updated" toast |
| Empty list with a removal still undoable | S5: remove every mountain, go back. The calendar's empty state keeps "Edit list" |
| S6 "fewer than two mountains" | Remove mountains in Edit list, then open Plan a trip |
| S6 "Not yet" days | Plan a trip → Later dates → set From and To so some days fall after December 12, 2026. Days in range press their chips; later days show as "Not yet" in the summary and on every card, and the "enters forecast range" note shows under the summary. Tap a "Not yet" day to see when it enters range. At most 14 later days are listed, as the line under the chips says |
| S6 end date before start date | Later dates → set To earlier than From: the error shows under To |
| S6 closed days | Default state: Cannon Mountain is closed Monday; its card ranks on its open days only and reads "Coverage 3 of 4 days · 1 closed". Cardrona is closed on all four days: it is listed last and its card reads "Closed on all your days." |
| A second failure | States `error` and `partial`: the first "Try again" fails on purpose and the message changes to "Still couldn't load …. Try again later."; the second one succeeds |
| Saving fails (S3, S4) | `screens/s3-add-a-mountain.html?state=error`, tap Add on Stowe: the message and "Try again: add Stowe" stay under that row. The first retry fails again ("Still couldn't save Stowe. Try again later."); the second saves. Saving a pin in S4 `error` behaves the same |
| Same-name mountains | S3: type "snow" (two Snow Valley rows, told apart by region and country). Add both: on the calendar, in Edit list and in Plan a trip every cell and button name, the day-view title, the trip card headings and the announcements then add the region ("Remove Snow Valley, Ontario") |
| Pin name already on the list | S4: name the pin "jay peak" (any case) and save: "You already have a mountain called jay peak. Choose another name." shows under the field, focus stays there. Enter in the name field saves |
| Search opened from Plan a trip | Plan a trip → (fewer than two mountains) Add a mountain: rows already on your list show "On your list" without "Show" |
| "Near you" | S3 with the search field empty (a fixture list; location is never asked for) |
| Removed from the worldwide list | S5, state `partial`: Hogback Mountain has "Keep as a pin" and "Remove" |
| Draft pin kept | S4: type a name or move the map, go back, open Drop a pin again |
| Edit a pin | S5: "Edit pin" on Burklyn Hill (title "Edit pin", "Save changes", "Remove this mountain") |
| Top pick / Close call tags | Tap a date at the top of the calendar to sort by that day |
| Weather row "Add Jay Peak to your list" with Undo | Remove Jay Peak in Edit list, close, then Entry points → Mountain weather row |

"Reset fixtures" in the panel puts everything back.

## Keyboard

The calendar is one Tab stop. Arrow keys move between days and mountains; Home / End go to the first / last day;
Ctrl+Home / Ctrl+End to the first / last cell; Page Up / Page Down move seven days; Enter or Space opens the day
(or sorts, on a date). On a row that failed to load, the message cell opens the day view in its error state and
Right Arrow moves to that row's "Try again" button. Left Arrow from the first day moves to the mountain's row header, which is where focus lands
after a mountain is added or a pin is saved. Escape goes back one screen, or closes Forecast from the calendar; in
the search field the first Escape clears the text.

In the result lists (mountains in Add a mountain, places in Drop a pin), Arrow Down from the field goes to the first
row's button, Arrow Up / Down move between rows, Arrow Up from the first row returns to the field, and Home / End go
to the first / last row. On the pin map, Shift + arrow moves four times as far as an arrow alone.

In every sheet the Tab order starts with Close, then the back control, then the screen's content.

Focus rule shown throughout: going forward, focus lands on the new screen's title (on the search field in Add a
mountain); going back, it returns to the control that opened the screen.

While a sheet is open, Tab moves through the sheet, then the tab bar, then a link called **"Leave the phone"**, and
then wraps back to the top of the sheet. The link is prototype scaffolding, not part of the product: it is hidden
until it has keyboard focus, and pressing Enter on it moves focus to the Prototype states panel. Shift+Tab from the
first control in the sheet goes to the same link. Mouse and touch users reach the panel directly.

## What is faked

- **All data.** `mock/data.js` holds the fixtures. Fixture "today" is Friday, December 4, 2026, so the calendar
  never changes. The mountain names are real places; the scores, weather, closure and hours are invented.
- **The map behind the sheet, the start screen, the Mountain weather sheet and the other tabs** are static
  stand-ins. Only the Forecast entry points on them work.
- **The pin map** is a patterned stand-in, not a real map (which map tiles to use is still an open question). The
  arrow buttons and arrow keys move the coordinates; elevation is made up from the coordinates.
- **"Use my location"** jumps to a fixed fixture point; the browser is never asked for location. The
  `no-permission` state shows the denied message.
- **Search** runs over 15 fixture entries, not the worldwide list. It filters as you type; the place search on the
  pin map does the same (there is no Find button). "Near you" is a fixed list of three mountains.
- **Loading, error, offline and partial** are switched by hand; nothing is actually loading or failing. Every
  "Try again" fails once on purpose, to show the repeated-failure wording, and succeeds on the second press; saving
  in the `error` state works the same way. On a full-screen error the second press switches the prototype back to
  default to show recovery.
- **Refresh** shows "Updating…" for about a second, then one of the outcomes in the variants table; nothing is
  fetched. A failed refresh in the `default` state is only shown when the panel option "Refresh fails" is on.
- **Sentences from the scoring engine** (reasons, explanations, hourly factors) are stored in the fixtures as codes
  and turned into words by a table in `mock/data.js`, the way the app will translate them.
- **Saving.** Nothing is stored. Reloading the page resets everything.
- **Fonts.** The app's own fonts (Nunito Sans, Montserrat) are not bundled, because the prototype may not load
  remote files; it falls back to the device's system font, so letter shapes differ slightly from the app.
- **Drag to reorder** in Edit list is not built; the Move up / Move down buttons are.
- **Tab key containment** is shown (see Keyboard). The one difference from the app is the "Leave the phone" link,
  which exists only so keyboard users can reach the Prototype states panel.
- **Later dates** uses the browser's own date picker, which looks different in each browser.
- **Close call tags** use a made-up "uncertainty" number in the fixtures; the real field does not exist yet.
- **Day-score edge rules** (at least 3 ski hours with data, no more than half missing, the 2- or 1-hour fallback for
  the best window, rounding half up) are applied by `scoreOf` in `mock/data.js`. They are provisional until the
  engine owner (issue #2) confirms them.
- **Cardrona's season** is a fixture: the month it opens (June) is typed in, and no ski hours are shown while it is
  closed for the season.
- **Translations and right-to-left** are not shown; text is English only.

## Known differences from the PRD (`../ux-prd.md`)

- **Tab bar and announcements.** The live regions that speak status messages sit inside the sheet, so nothing is
  announced after the sheet has closed (the note under the Prototype states panel is used for those moments).
- **Dialog semantics** follow the decision for this round: the sheet is a dialog without `aria-modal`; the map and
  start screen behind it are made inert, and the tab bar stays usable.
- **200% text zoom, translations and right-to-left** are not demonstrated.
- **Calendar cell for a day with under 3 hours of data.** The decision only sets the day-view wording ("Best window:
  under 3 hours of data"). The prototype's cell shows "Under 3 h of data" and its name says "Best window: under 3
  hours of data"; this cell wording is an assumption, not yet in the PRD.

Not tested on a real phone or with a real screen reader. The checks run were automated only: page validation, a
script syntax check, and a headless-browser pass that opened all 49 screen-and-state pairs in both themes (looking
for script errors and for two controls with the same name) and walked the flows changed in the last review round.
