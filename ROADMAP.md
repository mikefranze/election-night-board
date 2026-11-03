# Roadmap

Election night is **3 November 2026**. This was written on **23 October 2026** —
11 days out — so everything is ordered against that deadline rather than by how
interesting it is.

Effort is rough: **S** = under an hour, **M** = a few hours, **L** = a day or more.

---

## 0. Must happen before election night

These are the things that make the board work on the night. Nothing below this
section matters if these slip.

| # | Task | Effort | Status |
|---|---|---|---|
| 0.1 | **Load polling averages** into `data/polling_averages.csv` | S | **16 of 35 Senate, 18 of 36 Governor loaded** |
| 0.2 | **Re-run `fetch_index.mjs` every few days** to catch upstream changes | S, recurring | Ongoing — House now **435/435** |
| 0.3 | **Rebuild and re-push after any data edit** | S | **Done** — `npm run build` |
| 0.4 | **Rehearse the night once, end to end** | M | **Done 2 Nov** — found two bugs |
| 0.5 | **Last-known-good cache + retry backoff in the page** | M | **Done** |
| 0.6 | **Publish to GitHub Pages and verify from a phone** | S | Not started |

### 0.1 Polling averages — the single highest-value item

**34 rows loaded** (2026-10-28): 16 Senate, 18 Governor, 0 House. Those races
anchor on polling at ±4.6. The 19 Senate and 18 Governor races with no row fall
back to the national-environment prior described below, at ±8.

No House polling rows at all, so every district prior is its **2024 result
re-centred on the environment dial** — the same dial the Senate and Governor
no-poll races use, but swung off the right baseline. House districts anchor on
the 2024 national *House* vote (**R+3.31**, measured in `build_data.mjs` from the
same MEDSL rows that produce each district margin), not the presidential R+1.5;
using the presidential figure would have left every district 1.81 points too
Republican.

**Carried across where the lines moved.** Nine states vote on new congressional
maps on 3 November — 115 districts, 36 of them shifted by 10 points or more.
Those keep their 2024 House result and are moved onto the new boundaries first:
add the **boundary delta**, the same 2024 presidential election counted on the
new lines minus the old ones (`data/redistricting_2026.csv`). Candidates,
turnout and environment are constant inside that subtraction, so what survives
it is the map change alone — and the incumbency in the House result survives
with it. Then the dial is applied as usual, off the House anchor.

Replacing the House result with the presidential one outright was the first
attempt and it discarded incumbency, which is most of the reason to use a House
result at all: FL-09, FL-14, NC-01 and OH-09 all have Democrats who ran ahead of
their old seat's presidential lean, worth four seats in the count. The exception
is the **seven redrawn districts that went unopposed in 2024** — their margin is
a ±100 placeholder, and a placeholder plus a delta is still one, so those fall
back to the presidential vote on the new lines and swing off the presidential
anchor. `housePrior()` is the only place any of this is decided; the chamber
count and the flip list both come through it. At the D+9 default the chamber
projects **D 241 / R 194**.

Two properties keep it honest. Parking the dial at R+3.31 — a zero shift —
reproduces every unchanged district's own 2024 margin exactly, 320 of 320, which
is the regression test. The chamber at that dial comes out **D 207 / R 228**
rather than the real 215/220, because the 115 redrawn districts are restated on
their current boundaries: that difference *is* the gerrymander, measured on real
House votes.
And the anchor and the dial are interchangeable: disagreeing with R+3.31 by a
point is identical to moving the dial a point, so the anchor choice is not
load-bearing.

It is a **uniform-swing** model and should be read as one. It moves all 435
districts by the same number of points and knows nothing about retirements or
candidate quality. It now knows where the boundaries are, but only as a 2024
presidential number attached to them — not as anything that understands why they
were drawn that way.

It is sensitive near the middle, and the new maps moved where the middle is. On
the 2024 lines the chamber changed hands at about **R+2.3** on the dial, so
Democrats could lose the national vote by two points and still take it. Carried
across the new boundaries it changes hands at about **R+0.5**. Incumbency sits on
both sides of that comparison, so the two-point move is the maps and only the
maps.

The cleanest statement of what they are worth is the zero-shift dial above:
re-running the actual 2024 election on the 2026 boundaries gives **D 207 / R 228**
against the real **D 215 / R 220**. Eight seats.

The 22 districts uncontested in 2024 carry meaningless margins but sit far
enough from even that no dial setting flips them.

Live returns land for all 435 districts and the count converges to them as the
night goes on. The 84-district watchlist drives the House *table*; the seat
total spans the full chamber. The watchlist is selected on whichever lines each
district is actually using, so seats the new maps built out of 40-point blowouts
(TN-09, TX-09, TX-35) appear and seats they made safe drop off. **Flips are still only claimed where a district
has actually reported** — a dial setting is an assumption, not a seat changing
hands — but the flip list blends from the same shifted prior, so the two never
disagree about the same district.

**The no-poll prior.** Nobody polls a 30-point state, so half the board has no
average. Those races used to anchor on their 2024 presidential margin with no
adjustment, which, checked against the 16 Senate states that *do* have an
average, ran **11.3 points too Republican** — bias, not noise, sitting inside a
±8 band that assumed a centred prior. They now anchor on the 2024 margin
re-centred on a generic-ballot environment (default **D+9**, adjustable live via
the Environment dial beside the Monte Carlo). Against those same 16 states the
adjusted rule gives MAE 5.8 / RMSE 6.6 at a bias of +0.8, and
sqrt(6.6² + 4.6²) = 8.0 is exactly the ±8 already configured.

It changes no projected winner in either office — it moves margins, bands and
the shape of the Monte Carlo, not the headline. And D+9 cannot be validated from
the polled states without arguing in a circle: the states worth polling are the
states with a candidate story, so their swing overstates the national one. That
is why it is a dial.

The intended source is **FiftyPlusOne** (founded by FiveThirtyEight alumni). The
catch: raw polls are Standard ($100/mo) but the **computed averages are Premium**
($150/mo or $1,500/yr) — the files wanted are `All General Averages` and
`Generic Ballot Average`. Access is arranged by emailing
**data@fiftyplusone.news**, which takes human turnaround, so this is the item
most likely to run out of runway. Any source can fill the CSV; the format is
source-agnostic by design.

### 0.3 The rebuild footgun — **Done**

Editing `data/polling_averages.csv` does **nothing** until the data is rebuilt
and re-bundled: it is frozen into `index.html` at build time. Two steps, and
forgetting the second leaves a page that looks updated in the repo and is not.

That is now one command, which does both and stops if the first fails:

```bash
npm run build
```

It also reports **what changed in the polling**, because "build succeeded" and
"my edit landed" are different claims and only the second one matters at 8am:

```
loaded: 34 rows — 16 Senate, 18 Governor, 0 House
16 name both candidates; the rest resolve the matchup by party
~ 2 changed: senate/GA -10.2 → -9.4, senate/ME -3.2 → -3.9
```

Edit nothing and it says so loudly — `NOTHING CHANGED since the last build` —
which is the signal that you saved the wrong file or commented the rows out.

Two guards on the CSV came out of testing this, both aimed at a block pasted in
under time pressure:

- a **repeated `race_key`** stops the build and names the key. It used to mean
  the last line silently won, which is the wrong default for a file edited in
  a hurry.
- a **key matching no race** warns rather than sitting in the file looking
  loaded — `senate/XX` does nothing, and now says so.

Neither `index.html` nor `build/data.json` is touched when a build fails, so a
bad paste leaves the previous good page in place rather than a half-written one.

### 0.4 Rehearse — **Done, 2 November**

Done the way this section suggested: the snapshot recorder had caught civicAPI's
own rehearsal feed at 06:42 UTC on 2 November, 501 races with votes and 482
called, and that sweep was replayed back through the live board with the clock
set to election night 8pm.

The snapshot stores only margin, votes, called and reporting per race, so the
candidates were rebuilt from the live feed's rosters, with the recorded margin
splitting the recorded vote between whichever two `contenders()` says the race
is between. County breakdowns for 71 races went back in the same way, through a
stub on the per-race endpoint, which is what finally exercised the county panel
against real county data.

**What it found.**

1. **The county table was never cleared when a race had no usable counties.**
   `renderCounties` returned early having cleared only the chart, so the last
   race examined stayed in the table under the new race's heading — selecting
   Alaska after Michigan showed Michigan's 83 counties, Wayne County first,
   titled Alaska. Alaska is the permanent case, having no county baselines at
   all, but the one that would have bitten on the night is ordinary: clicking
   from a state that has counted to one that has not. Fixed.
2. **Nothing else.** Every other panel rendered correctly under a full board.

**What it confirmed**, none of which had been seen with real data before:

- the county panel against genuine county returns — Michigan 83 of 83, swing-
  implied statewide R+0.7, turnout 85% of 2024; South Dakota 65 of 65 and
  correctly reporting one unmatched area, which is Oglala Lakota's 2015 FIPS
  change
- the test_data guard mid-count: flipping the feed to rehearsal with a full
  board on screen reverted the Senate tile from the counted D 49 – R 51 to the
  polling projection D 54 – R 46, dropped flips from 40 to 7, emptied turnout,
  and raised the banner naming 488 suppressed races — with Test feed bringing
  it all back
- suppressed Senate rows showing the matchup and an em dash, never a leader
- turnout, Monte Carlo, seats-votes curve, all three scatters, poll-closing
  countdown and the flip list, all populated and consistent
- a phone at 375px: no horizontal page scroll, header correctly not sticky,
  every table inside a scrolling wrapper, every chart fitting the viewport

**What the rehearsal could not cover.** Thirteen same-party races — ten
California top-two D-vs-D generals plus MA-01, NJ-08 and PA-03 — are absent,
because the harness splits a recorded margin between a Republican and a
non-Republican and there is no Republican to split against. The real feed
carries both candidates, so this is a limit of the fixture, not of the board.

---

## 1. Core features — build these next

### 1.1 Seat flips on the Summary tab — **M** — **Done (Senate + House)**

A flip is a race whose projected winner's party differs from the party that
currently holds the seat. Add to Summary: a net-flip count per chamber and a
compact list of which seats flipped, which way, and whether the race is called
or still projected.

Data availability differs by chamber:

- **Senate** — ready. `lastSenate.winnerParty` is the party that last won that
  seat, which is the current holder in every 2026 case including the
  appointment-then-special seats (OH Vance→Husted, FL Rubio→Moody, NE
  Sasse→Ricketts: all same-party).
- **House** — ready. `house2024[district].winnerParty` is the sitting member's
  party.
- **Governor** — **blocked**. There is no gubernatorial history dataset in the
  project, and none was findable: MEDSL's is guestbook-gated and the
  county-level file carries only house/president/senate. Needs a small reference
  of **current governor party for the 36 states holding races**. That is 36 rows
  — hand-entering it from a reliable source is the pragmatic fix, but it must be
  sourced and dated rather than recalled.

Flips should distinguish **called** from **projected**, because an early-night
projected flip that later reverses is exactly the kind of thing a dashboard
should not state confidently.

### 1.2 Poll-closing countdown and waves — **S** — **Done, with a caveat**

The feed already returns `polls_open` / `polls_close` per race and the board
ignores them entirely. Verified they are real and per-state: GA 23:00Z, MA
00:00Z, TX 01:00Z, OR 03:00Z.

Order races by closing time, show "closes in 12m", and group the night into
waves. This is the cheapest high-value feature on the list and it is what
actually paces an election night.


**Caveat found while building this.** The feed's closing times look about an
hour early for most states. US daylight time ends on 1 November 2026 and the
election is the 3rd, so election day runs on standard time — yet Georgia is
published as 23:00Z, which is 7pm Eastern only under EDT (under EST it would be
00:00Z). Alaska is published at 05:00Z, which *is* right under standard time, so
the feed is not internally consistent either. The displayed value is the feed's
own, with a warning in the UI, and `POLL_TIME_OFFSET_MIN` in the template shifts
every time at once — set it to 60 after checking a couple of states against an
official schedule. Ordering and the closing "waves" are correct regardless.

### 1.3 "What changed" feed — **M**

Nobody can watch 35 races at once. A running list of lead flips, new race calls,
and races crossing a threshold, newest first, with timestamps. The biggest gap
in the board as it currently stands.

Depends on 2.1 for anything historical; a simple version can diff against the
previous refresh in memory.

### 1.4 Flash changed cells — **S**

Briefly highlight any table cell whose value moved since the last refresh. Makes
a 30-second refresh legible instead of invisible.

### 1.5 Surface turnout vs 2024 — **S** — **Done, differently**

Shipped as a **Turnout so far** panel on the Summary tab: votes cast for each
party against what the same races produced last time, per office. Not `k` —
that is a county-level scale against the 2024 presidential vote, and it stays
in the county panel. This compares like offices with like.

The baseline year is not the same for all three, which is the part worth
knowing. House and Governor go against **2022**, the previous midterm with the
same seats. The Senate goes against **2020**, because the seats up in 2026 are
Class 2 and 2022 was Class 3 — a different set of seats that happens to share
19 states. The price is that the Senate row is measured against a presidential
year and sits far below 100% all night; the panel labels every row with its
year and says why.

A race joins at **90% counted**, carrying its own baseline, and is dropped
unless both parties are on the ballot at both ends. The threshold matters more
than it sounds: below it a race contributes its whole baseline to the
denominator and only part of its votes to the numerator, which looks like
turnout collapsing rather than counting continuing. Four Senate
races have no usable 2020 baseline (Arkansas ran no Democrat; Wyoming carries
no party data in MEDSL; Florida and Ohio had no 2020 race, their 2026 contests
being specials), as do 36 House districts that went uncontested in 2022.

---

## 2. Infrastructure

### 2.1 Snapshot recorder — **M** — **Done**

Append every fetched payload to disk with a timestamp. One mechanism unlocks:
margin history and sparklines (3.1), a historical change feed (1.3), replay for
rehearsal (0.4), and post-election analysis of how wrong the projections were
and when.

Built in two halves, because a static page has no backend:

- **`scripts/record.mjs`** — a standalone Node recorder that polls on an interval
  and appends NDJSON to `data/snapshots/`. This is the durable half: it keeps
  going whether or not a browser tab survives. ~3.2 KB per sweep, so about 4.6 MB
  for a 12-hour night at 30s. `--counties` also records county breakdowns, which
  is far heavier — use a 5-10 minute interval with it.
- **In-page history** — one compact snapshot per successful sweep in IndexedDB,
  falling back to memory where storage is blocked. Feeds sparklines (3.1) and the
  change feed (1.3). Exportable from the diagnostics panel. **Off by default**
  since it writes to a visitor's browser on every refresh; the switch is beside
  the export button, and the choice is remembered.

Both write the **same NDJSON shape**, so a replay can read either.

### 2.2 Replay mode — **M** — depends on 2.1

Feed recorded snapshots back through the UI at speed. The only honest way to
test the projection model against a real counting curve.

### 2.3 Last-known-good cache and backoff — **M** — **Done**

`fetch_index.mjs` retries with backoff; the page's `getJSON` does not. civicAPI
is an anonymous operator with no SLA and already returned a 503 once in October.
A run of failures should show stale-data-with-age, never a blank board.

### 2.4 Cycle configuration — **M**

Do this while the structure is fresh. Everything cycle-specific today:

| Hardcoded | Where |
|---|---|
| `SENATE_BASELINE` per-seat baseline years | `scripts/states.mjs` |
| `SENATE = { currentD: 47, majority: 51 }` | template |
| `electionDate: '2026-11-03'` | `build_data.mjs` |
| `PROJ.defaultTurnout: 0.70` (a *midterm* assumption; ~1.0 in a presidential year) | template |
| `trump2024ByState`, `house2024`, "2024 President" label | data keys and UI strings |
| Demo `GOV_STATES` list | template |

Three moves: collapse it into one `config/cycle.json`; **derive Senate baseline
years from seat class** rather than a hand-maintained override map (classes
rotate predictably, and the uncontested + independent-winner guards already
handle the exceptions); and rename data keys generically
(`presBaselineByState`, `houseBaselineByDistrict`) so 2028 never touches render
code.

### 2.5 Source adapter interface — **M**

`marginFromRace()` is already the only function that understands civicAPI's
shape. Formalise that boundary so AP or Decision Desk HQ could drop in. Both are
enterprise-licensed and almost certainly out of reach for 2026, but the seam is
cheap to cut now.

### 2.6 Scalability — only if the link spreads

- **Caching proxy** (e.g. a Cloudflare Worker) in front of civicAPI, so N
  visitors become 1 upstream request per interval. The real answer, and the
  polite one on a free keyless API. **M**
- **Jitter the refresh interval** so simultaneous visitors do not thunder in
  lockstep. **S**
- **Incremental all-counties load** — currently 35 blocking requests over ~7s;
  could render partially as it goes. **M**
- **Splitting out `data.json` is now a weak win.** Pages gzips automatically:
  the whole page is **130 KB on the wire** and `data.json` alone is 97 KB. That
  saves ~97 KB per repeat visit at the cost of the single-file property. Not
  worth it unless traffic is real.

---

## 3. Quality of life

| # | Feature | Effort |
|---|---|---|
| 3.1 | Margin sparklines per race (depends on 2.1) | M |
| 3.2 | Watchlist / pin races to a compact top strip | M |
| 3.3 | Deep links (`#senate/GA`) to share or reopen a race | S |
| 3.4 | Keyboard shortcuts (1–4 tabs, `r` refresh, `/` search) | S |
| 3.5 | Table search / filter | S |
| 3.6 | TV mode — big type for a second monitor | M |
| 3.7 | CSV / PNG export of current state | M |
| 3.8 | Bellwether counties — a named, tracked set | M |
| 3.9 | Per-race notes | S |

---

## 4. Stretch goals

### 4.1 Monte Carlo control probabilities — **L** — **Done**

The board currently reports a point estimate ("D 46 – R 54") with no sense of
how likely that is. Every input for a proper probability already exists: each
race has a projected margin and a σ.

Draw ~10,000 simulations per refresh. The critical detail is that **the error
must be correlated across races** — a national polling miss moves every state
the same direction at once. Independent per-race draws would produce absurdly
confident answers (a 50-race coin-flip set almost never splits 35–15 by chance,
but polling errors are exactly that systematic). So: a shared national error
term plus a smaller per-race idiosyncratic term, with the split tunable in
`PROJ`.

Outputs: P(Senate majority) for each party, a seat-count distribution histogram,
and the tipping-point race by probability rather than by rank. Cheap to compute
in-browser; 10k draws over 35 races is trivial work.

Honest framing matters here more than anywhere else in the project: these would
be probabilities derived from *my own* σ assumptions, not a calibrated forecast.
They should be labelled as such, and `PROJ.pollSigma` is an assumption, not a
measured constant.

### 4.2 House gerrymandering tool — **L** — *seats-votes half shipped*

Quantify how much the map itself, rather than the vote, decides the chamber. All
the inputs are already in the build: 2024 House margins for all 435 districts,
2024 presidential margin by district, and live results as they arrive.

**Shipped: "What the new maps are worth"** on the House tab. It primes all 435
districts twice at the same dial, once on the 2024 boundaries and once on the
2026 ones, and sweeps the dial to get a curve. Both maps go through
`housePriorOn()` so the difference measures the boundaries and not two copies
of a formula. It answers the seats-votes question for the specific comparison
that matters this cycle — the maps are worth about **+8 R seats** at their peak
near R+3, **+3** at the D+9 default, and stop paying at about **D+14.8** (the
seven Republican-drawn states alone: peak +13, break-even D+18.5). Between
**R+2.3 and R+0.5** the two maps seat different parties, which the chart shades.
Every election 1976–2024 is ticked on the same axis from
`DATA.houseNationalByYear`, so "would it take a bigger wave than has ever
happened" is answered by looking: **none of the 25 reached the break-even.**

**Still to do:** the general seats-votes curve for an arbitrary map, and the
asymmetry measures below.

Candidate measures:

- **Efficiency gap** — wasted votes per party, nationally and per state.
- **Mean–median gap** — the difference between the median district's lean and
  the statewide mean.
- **Declination** — an asymmetry measure less sensitive to turnout than the
  efficiency gap.
- **Seats–votes curve** — the headline output: *what national House vote share
  does each party need to reach 218?* If Democrats need 52% for a tied chamber,
  that is the map's thumb on the scale, stated in one number.
- **Live comparison** — as results land, plot actual seats-vs-votes against the
  2024 curve.

Caveats to build in from the start: uncontested races (17 in 2024, plus 5 more
effectively uncontested) badly distort efficiency-gap calculations and need
imputation or explicit exclusion; and the measures disagree with each other by
design, so showing one number alone would be misleading.

---

## 5. Known gaps and accepted limitations

Carried forward from the build. These are documented rather than fixed.

- **House generals needed the type string `House of Representatives`.** This was
  carried for weeks as the project's single biggest risk — "52 records, 50 of
  them primaries" — on the strength of a query that asked for `US House`. The
  correct string returns all 435 districts; see the README for the two traps
  that come with it. The lesson generalises: every apparent upstream gap in this
  feed has turned out to be a wrong query string, the Governor `Statewide` one
  included. Assume the query before the source.
- **State SOS feeds cannot be read from a static page.** Clarity/Scytl returns
  403 with no CORS headers. The manual-override box is the only fallback — worth
  exercising during the rehearsal (0.4).
- **Gubernatorial history is hand-entered, not sourced.** There is no dataset
  for it: MEDSL publishes nothing covering governors at state level across the
  relevant years, and civicAPI carries a prior gubernatorial general for only
  10 of the 36 states. `data/governor_prev.csv` therefore holds one person's
  transcription of the 2022 and 2024 Wikipedia results tables. The build checks
  its shape — all 36 states present and no extras, both finishers R or D,
  percentages in range — but nothing can check the numbers themselves, and only
  the Governor swing chart reads the file. Governor flips are still blocked
  (1.1): knowing the last margin is not knowing who holds the seat now.
- **`percent_reporting` is probably precinct-based, not vote-based.** A precinct
  can report 100% with mail outstanding, which biases both the turnout scale and
  the blend weight. Cannot be verified until real votes flow — **check this
  early on the night.**
- **County `percent_reporting` mid-count is partly verified.** Exercised in the
  2 November dry run (0.4) against a recorded civicAPI sweep carrying counties
  for 71 races at reporting levels from 1% to 100%: the county panel, the
  swing-implied statewide margin and the turnout scale all behaved, and the
  field was populated throughout. That was replayed data rather than a live
  mid-count, so whether it moves sensibly as votes actually arrive is still
  taken on trust.
- **Independent caucus is assumed.** Osborn in Nebraska counts as
  not-Republican; who he would actually caucus with is not in the data, and in a
  50–50 Senate that is the whole ballgame.
- **civicAPI publishes a rehearsal feed, and not only before election day.**
  Every 2026 race carries `test_data: true` and many are served fully counted
  with a declared winner. This was originally guarded on the calendar alone —
  votes cannot exist before election day — which was wrong, because the calendar
  expires on 3 November and the rehearsal feed does not. The recorder caught the
  feed flipping three times in three days, and at **06:42 UTC on 2 November** it
  was serving **501 of 509 races with votes, all 35 Senate races counted and 33
  of them called**, giving the opposite chamber to this board's projection. Five
  hours later the gate would have waved it through.
  The board now reads the feed's own flag as well: the search endpoint does not
  carry `test_data`, but the per-race endpoint does, so `probeTestData()` spends
  one extra request per sweep on it. Either guard alone suppresses a record. A
  probe that fails returns **null, not false** — unknown is not "real" — so the
  calendar still covers it before election day, while after election day an
  unknown is taken at face value rather than blanking a board of real results.
  Rehearsal sweeps are also kept out of IndexedDB, since a poisoned history row
  would outlive the feed flipping back. The **Test feed** button still shows the
  rehearsal data deliberately, behind a red banner.
- **civicAPI candidate metadata has errors** (South Carolina lists "Darline
  Graham"). Margins are computed from vote totals, never names, but displayed
  names may be wrong.
- **NY-21 has no 2024 presidential totals** in the source table; renders as
  unknown rather than guessed.
- **Alaska has no county-level reporting** and is excluded from all county views.
- **The projection band is not a calibrated interval.** It is a visual guide
  built on tunable assumptions (`pollSigma` 4.6, `returnsPriorSigma` 8.0).

---

## 6. Deploy checklist

- [x] Output renamed to `index.html`
- [x] Repo name chosen: **election-night-board**
- [x] Provenance line in the header (personal dashboard, not a race-calling
      operation), visible however the page is entered
- [ ] Push to GitHub, enable Pages, confirm `mikefranze.github.io/election-night-board/`
- [ ] Verify on a phone — the header deliberately stops being sticky below 760px
- [ ] Decide whether to commit `data/raw_*` (~50 MB of third-party source files)
      or `.gitignore` them and document the download commands
- [ ] Confirm `localStorage` works on the live origin (tab choice, manual
      overrides) — it is blocked on some `file://` origins but should be fine
      over HTTPS
- [ ] Consider raising the default refresh interval before sharing widely
