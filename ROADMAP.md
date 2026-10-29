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
| 0.3 | **Rebuild and re-push after any data edit** | S | Process |
| 0.4 | **Rehearse the night once, end to end** | M | Not started |
| 0.5 | **Last-known-good cache + retry backoff in the page** | M | **Done** |
| 0.6 | **Publish to GitHub Pages and verify from a phone** | S | Not started |

### 0.1 Polling averages — the single highest-value item

**34 rows loaded** (2026-10-28): 16 Senate, 18 Governor, 0 House. Those races
anchor on polling at ±4.6. The 19 Senate and 18 Governor races with no row fall
back to the national-environment prior described below, at ±8.

No House polling rows at all, so before any district reports the chamber count
is a pure "if nothing changed" 2024 baseline — 220 R / 215 D — deliberately left
untouched by the environment dial. It is a starting point, not a forecast. Live
returns now land for all 435 districts, so it converges to the count as the
night goes on; the 97-district watchlist drives the House *table*, while the
seat total spans the full chamber.

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

### 0.3 The rebuild footgun

Editing `data/polling_averages.csv` does **nothing** until both steps re-run:

```bash
node scripts/build_data.mjs && node scripts/bundle.mjs
```

The data is frozen into `index.html` at build time. This is easy to forget at
8pm while pasting in final numbers. Worth a one-line `make`-style script, or at
minimum a sticky note.

### 0.4 Rehearse

There is currently no way to see the board under load. Demo mode exercises the
layout but not the real feed's behaviour. Pairs naturally with the snapshot
recorder (2.1) — record once, replay at speed. Do this with enough days left to
fix what it finds.

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

### 1.5 Surface turnout vs 2024 — **S**

`k` (the turnout scale) is already computed and only shown inside the county
panel. Promote it to the Senate table and Summary — on the night, "turnout is
running 80% of 2024" is itself a story.

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
  change feed (1.3). Exportable from the diagnostics panel.

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

### 4.2 House gerrymandering tool — **L**

Quantify how much the map itself, rather than the vote, decides the chamber. All
the inputs are already in the build: 2024 House margins for all 435 districts,
2024 presidential margin by district, and live results as they arrive.

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
- **No gubernatorial history.** Governors compare against Trump 2024 only, and
  governor flips are blocked (1.1).
- **`percent_reporting` is probably precinct-based, not vote-based.** A precinct
  can report 100% with mail outstanding, which biases both the turnout scale and
  the blend weight. Cannot be verified until real votes flow — **check this
  early on the night.**
- **County `percent_reporting` mid-count is unverified.** Confirmed populated on
  a completed race (NC 2020, all 100 counties at 100%), but its behaviour while
  counting is unknown.
- **Independent caucus is assumed.** Osborn in Nebraska counts as
  not-Republican; who he would actually caucus with is not in the data, and in a
  50–50 Senate that is the whole ballgame.
- **civicAPI publishes a rehearsal feed before election day.** Every 2026 race
  carries `test_data: true`, and many are served fully counted with a declared
  winner. The search endpoint — which the sweep uses — does **not** expose that
  flag, so the board guards on the calendar instead: votes cannot exist before
  election day. The gate lifts on 3 November. The **Test feed** button shows the
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
