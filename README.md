# Election Night Board — 3 November 2026

Live at `mikefranze.github.io/election-night-board/` when published.

See [ROADMAP.md](ROADMAP.md) for what is planned and what must happen before
election night.

A single self-contained `index.html`. Open it from disk; it fetches live
results in the browser. No server, no build step at view time.

```
index.html              <- the deliverable (484 KB, open this)
src/dashboard.template.html
scripts/                <- build-time only (Node 18+)
data/                   <- raw downloads + your polling averages
build/data.json         <- generated; inlined into index.html
```

## What it shows

Four tabs, with live counts on the labels so the tabs you are not looking at
still tell you something:

| Tab | Contents |
|---|---|
| **Summary** | Projected Senate, House and governor seat counts, headline tiles, systemic polling error, feed coverage and manual overrides |
| **Senate** | Senate map with the 51st-seat line, the full race table, county detail for a selected race, county swing-vs-lean scatter |
| **House** | The 97-district watchlist |
| **Governor** | All 36 governor races, with projections and county drill-down |

Only the visible tab is rendered. The scatter alone can be a couple of thousand
SVG nodes, and rebuilding it every 30 seconds while nobody is looking at it is
wasted work.

The chosen tab is remembered in `localStorage`. Browsers block that on some
`file://` origins, in which case it simply opens on Summary each time — the same
guard covers the manual-override box.



Margins are stored Republican-positive internally and displayed as `R+n` / `D+n`.
Swings are signed toward the Republican candidate.

## Hosting on GitHub Pages

It works unchanged, and two things get better:

- **`localStorage` becomes reliable.** On a real `https://` origin the tab choice
  and the manual-override box persist properly; from `file://` some browsers
  block it.
- **CORS is fine.** civicAPI returns `access-control-allow-origin: *` for a
  `https://<user>.github.io` origin, preflight included, and redirects HTTP to
  HTTPS — so no mixed-content problem.

Worth knowing before you publish:

- **The page is public.** Everything on it is public data, but the demo toggle
  and the override box are visible to anyone with the link.
- **Every visitor's browser polls civicAPI independently**, at one sweep per 30
  seconds plus one request per race if they load county detail. That is fine for
  a handful of people and inconsiderate at scale, on a free API with no key.
  Consider raising the default refresh interval if you share the link widely.
- Nothing starts with an underscore, so no `.nojekyll` file is needed.
- The header carries a provenance line (personal dashboard, source, not a
  race-calling operation) so it is visible however someone enters the page. It
  stops being sticky below 760px, where it would otherwise eat a quarter of a
  phone screen.
- The whole 484 KB is re-downloaded on each visit, since the data is inlined. If
  that matters, publish `build/data.json` beside the page and `fetch()` it
  instead — the browser will then cache it separately. That trades away the
  single-file property, so it is only worth doing if you are sharing the link.

## First run after cloning

The third-party source datasets are not committed (~50 MB against ~1 MB for the
rest of the project). Fetch them once:

```bash
node scripts/fetch_sources.mjs    # external datasets, ~50 MB, one time
```

`build/data.json` *is* committed, so you can rebuild `index.html` without this
step — you only need the sources to regenerate the baselines from scratch.

## Refreshing before election day

```bash
node scripts/fetch_index.mjs     # re-pull the race index + report feed coverage
node scripts/build_data.mjs      # recompute baselines -> build/data.json
node scripts/bundle.mjs          # inline into index.html
```

Run `fetch_index.mjs` every few days. It prints upstream coverage, which is how
you will know whether the House and Governor gaps below have closed.

## Adding polling averages

`data/polling_averages.csv` ships empty on purpose — no numbers were invented.
Add rows and re-run `build_data.mjs` + `bundle.mjs`:

```csv
race_key,margin,source,as_of
senate/GA,-1.4,FiftyPlusOne,2026-10-28
senate/NC,0.8,FiftyPlusOne,2026-10-28
generic/national,-6.2,FiftyPlusOne,2026-10-28
```

`margin` is **Republican minus Democrat** in points: `R+3` → `3`, `D+3` → `-3`.
Keys are `senate/<ST>`, `gov/<ST>`, `house/<ST>-<DD>`, `generic/national`.
The `source` string is shown in the UI so you can see where each number came from.

The intended source is **FiftyPlusOne** (founded by FiveThirtyEight alumni), which
has a CSV API at `https://fiftyplusone.news/api/csv?api_key=<KEY>&filename=<DATASET>`.
Note their tiering: raw polls are Standard ($100/mo), but the **computed averages
are Premium** ($150/mo or $1,500/yr) — the files you want are `All General Averages`
and `Generic Ballot Average`. Access is arranged by emailing data@fiftyplusone.news.
Nothing in the build depends on them; any source can fill this CSV.

## Reading it on the night — one caveat that matters

Comparing a **partial** statewide count to a polling average is misleading for
hours. Mail and election-day ballots are tallied in different orders by state, so
a race can read as a 20-point polling miss at 30% counted and land near zero.

Two guards are built in:

1. The systemic-error panel only counts races above a **reporting threshold**
   (default 90%). Lower it deliberately, not by accident.
2. The **county swing** panel compares each county to its own 2024 margin and
   weights by 2024 turnout. That compares like with like and is stable far
   earlier than the statewide topline. The "implied statewide" figure is
   `2024 state margin + turnout-weighted county swing`.

For detecting *systemic* polling error, the signed mean across many races is the
signal; a single race is noise.

## The Senate map and the 51st seat

One row per race, sorted by projected margin, most Democratic at the top. Three
marks per row, distinguished by **shape** as well as colour so identity never
rests on hue alone:

- **filled dot + error bar** — projected margin and its band
- **open diamond** — Trump's 2024 margin in that state
- **vertical tick** — the last time that seat was contested

The dashed line is the **51st seat**, drawn in its own band between the two
blocks. Democrats need every race above it.

That position is derived, not hardcoded. The Senate is 53 R / 45 D / 2
independents who caucus with Democrats, with no vacancies. 13 of the 35 seats on
the ballot were last won by Democrats, so Democrats hold **34** seats that are
not up; `51 − 34 = 17` of these 35 are needed for a majority (13 holds plus a
net gain of 4). The 17th row is therefore the tipping point. The dataset derives
the 22 R / 13 D split independently and it matches the published figures.

Chart margins use the **state-level** form of the same blend
(`prior × (1−reporting) + counted × reporting`), which needs only the margin and
`percent_reporting` the search endpoint already returns — so the chart costs no
extra requests. The county-level version stays in the detail panel for whichever
race is selected. With no polling average loaded, the prior falls back to the
2024 presidential margin and the tooltip says "anchored on 2024 result".

Caveat: control is counted from the projected margin's sign, so a winning
independent (Osborn in Nebraska, say) is counted as not-Republican. Who they
would actually caucus with is not something the data can tell you.

## County swing vs lean

A scatter of every reporting county across all Senate races: vertical axis is the
county's 2024 presidential margin, horizontal axis is how far it has moved since,
dot size is 2024 turnout, colour is swing direction.

The question it answers is whether a swing is **uniform or differential**. A
vertical cloud means the whole country moved together; a tilted one means the
move is concentrated in particular kinds of place. The dashed line is a
turnout-weighted least-squares fit, reported in plain language underneath — e.g.
*"0.7 pts more Democratic for every 10 points redder a county was in 2024"*.

**Compare to** switches the vertical axis between the **2024 presidential
margin** and the **previous Senate race**, recomputing each county's swing
against whichever baseline is selected — a real recalculation, not a relabelled
axis.

**State filter**: the dropdown takes any subset, with *All* / *None* /
*Competitive* shortcuts (competitive = within 10 points on the 2024 presidential
margin, which picks out GA, ME, MI, MN, NC, NH, NJ, NM, VA).

### Which Senate race each state is compared against

2020 is the Class 2 cycle, so for most of the 35 seats on the 2026 ballot it is
literally the last time *that seat* was contested. Three states fall back to
their most recent usable race instead, and the legend footnotes exactly which:

| State | Year used | Why |
|---|---|---|
| FL | 2024 | No Class 2 seat — the 2026 contest is a special |
| OH | 2024 | No Class 2 seat — the 2026 contest is a special |
| AR | 2022 | Tom Cotton drew no Democratic opponent in 2020, so every Arkansas county reads R+100 |
| AK | — | Alaska does not report results by county at all |

Two further guards are applied when picking the year:

- **Uncontested races are rejected** (`|margin| > 95`). A swing measured from a
  100-point baseline is meaningless rather than merely large — left in, Arkansas
  stretched the axis to ±120 and skewed the mean swing.
- **Races won by an independent are rejected.** A Democrat-versus-Republican
  margin there describes a contest that did not happen: Maine 2024 reads as a
  53-point Republican win because Angus King is in neither column.

A couple of counties still have no match — chiefly South Dakota's Oglala Lakota,
whose FIPS code was renumbered in 2015. The legend counts them.

Two things to know about it:

- **It costs one request per Senate race** (35), so it is loaded on demand with
  the **Load all counties** button and cached, never on the 30-second refresh. A
  full load takes about 7 seconds.
- **Both axes are scaled to where the turnout is**, covering 99% of weighted
  votes, with stragglers clamped to the edge. A handful of tiny counties sit near
  ±100 and would otherwise stretch the axis until the bulk of the country was a
  flat smear.

The **Min. counted** filter defaults to 50%. Lightly-counted counties produce
wild swings, so dropping the threshold adds noise rather than information.

## Demo data

The **Demo data** button in the header fills every race with synthetic results
and polling averages, generated in the browser, so the whole board can be
reviewed before real votes exist. A banner stays up the entire time it is on,
and toggling it off clears the synthetic data and restarts the live feed.

Nothing synthetic is ever written to `build/data.json` or to the shipped
`index.html` — the file ships with zero polling rows.

## The projection model

Click a Senate row and the county panel projects a final statewide margin. It
**starts at the polling average and converges to the result** as counting
proceeds.

For each county:

```
expected turnout  = 2024 two-party votes x statewide turnout scale
prior margin      = county 2024 margin + (poll margin - state 2024 margin)
observed margin   = counted margin, de-skewed for early-count bias
projected margin  = prior x (1 - reporting) + observed x reporting
```

Then every county's projected margin is applied to its expected turnout, and the
votes are summed statewide. At 0% reporting this reproduces the polling average
exactly; at 100% it reproduces the count exactly.

Why each piece is there:

1. **The prior comes from polls.** If no polling average is loaded for a race,
   the model falls back to the swing observed in politically similar counties
   and labels itself "anchored on returns" in the panel.
2. **Turnout scale** is estimated from counties that are meaningfully counted,
   so the midterm electorate is sized off observed turnout rather than assumed.
   Before anything reports it defaults to 70% of 2024.
3. **Counted margins are used at face value.** No attempt is made to judge
   whether an early lead is real movement or just the order ballots were counted
   in — see below.

### Margin of error

Each county carries the prior's error scaled by how much of it is still
uncounted. Those are summed across the state, weighted by expected turnout:

```
sigma_county = prior_sigma x (1 - reporting)
sigma_state  = sum( expected_votes_i x sigma_county_i ) / sum( expected_votes_i ) + floor
```

They are **summed, not added in quadrature**, so county errors don't cancel.
That is the right call here anyway: a polling miss hits every county in a state
the same way, so it is systematic, not independent noise.

`prior_sigma` is an **assumption you can tune** in `PROJ`, not a measured
constant: `pollSigma` 5.0 with a polling average, `returnsPriorSigma` 8.0
without one. The band is a visual guide, not a confidence interval.

Behaviour is exact at both ends: at 0% counted the projection equals the polling
average and the band equals `prior_sigma`; at 100% it equals the count and the
band collapses to the floor (0.4).

### On not correcting for count order

An earlier version tried to detect and remove early-count skew by regressing
each county's apparent swing against how much of it was counted. **It was
removed deliberately.**

The problem is that a county that is behind on counting and a county that
genuinely moved look identical from the outside. The correction only worked
under the assumption that, within politically similar counties, counting speed
is unrelated to how people voted. When that fails — big urban counties both
count slowly *and* shifted — it reads real movement as an artifact and erases
it, with no way to tell at the time.

The cost of dropping it is small and bounded. In simulation, with 8 points of
count-order bias injected, the uncorrected projection peaked at about **1 point**
of error mid-count and stayed inside the band throughout. That is a good trade
for never silently deleting a real shift.

So: early numbers can lean toward whichever ballots were counted first, the
board does not pretend otherwise, and the band is what carries that risk.

### Where it breaks

- **If the polls are badly wrong, the early projection is confidently wrong.**
  That is inherent to anchoring on a poll. Raising `PROJ.pollSigma` widens the
  band but does not move the central estimate.
- **The prior is displaced purely by `reporting`, not by relative precision.** A
  precision-weighted blend would shed a stale prior faster; this follows the
  simpler rule.
- `percent_reporting` is most likely **precinct**-based, not vote-based. A
  precinct can report 100% with mail still outstanding, which biases both the
  turnout scale and the blend weight.
- No demographic data beyond 2024 lean and turnout. Real decision desks stratify
  on demographics; lean is a decent proxy but only a proxy.
- The simulation is my own construction. It does not model late mail dumps,
  curing or correlated county errors, so real-world accuracy will be worse.

## Data sources

| Data | Source |
|---|---|
| Live results, race calls, county breakdowns | [civicAPI](https://civicapi.org) — free, no key, attribution requested |
| 2024 presidential by county + state | [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) |
| 2024 presidential by congressional district | The Downballot, via the [jaytimm](https://github.com/jaytimm/PresElectionResults) mirror |
| Senate history 1976–2024 | MIT Election Data + Science Lab, `doi:10.7910/DVN/PEJ5QU` |
| House history 1976–2024 | MIT Election Data + Science Lab, `doi:10.7910/DVN/IG0UN2` |
| **County-level** Senate 2016–2024 | [pmheideman/us-county-election-results](https://github.com/pmheideman/us-county-election-results) v1.0.0 — MEDSL's county-level Senate files sit behind a Dataverse guestbook. Cross-checked against the MEDSL statewide file: GA R+1.8, NC R+1.8, MI D+1.7, CO D+9.5 all agree |

Verified on build: national 2024 two-party margin computes to Trump **+1.50**,
Georgia **+2.21**, North Carolina **+3.26**, Michigan **+1.44** — all matching the
certified results.

## Known gaps and limitations

- **House races are not in the feed.** As of the last index pull the feed carries
  52 US House records in total, 50 of them primaries, leaving 2 generals (a GA-13
  runoff and a CA-14 special). This was checked without the `election_type`
  filter, so it is a genuine upstream gap, not a query problem. Senate is 36/35
  and Governor 36/36. If upstream never publishes the House generals, that tab
  keeps showing 2024 baselines and blank live columns — the single biggest
  remaining risk.
- **Governor races use `election_type: "Statewide"`, not `"General"`.** Senate
  generals are `"General"`; filtering governors the same way returned zero and
  made the Governor tab look empty when all 36 races were in fact published.
- **State SOS feeds cannot be used from a static file.** Clarity/Scytl endpoints
  return `403` with no CORS headers, so a `file://` page cannot read them. The
  fallback is the **manual override** box (bottom of the page), which accepts
  `race_key, margin, percent_reporting` per line and overrides the feed.
  Overrides are stored in that browser only.
- **No last-gubernatorial-margin baseline.** No fetchable statewide governor
  history dataset was found, so governors are compared to Trump 2024 and polling
  only, rather than showing a half-sourced number.
- **NY-21** has no published 2024 presidential totals in the source table; it
  renders as unknown rather than guessed.
- **civicAPI candidate metadata has errors** (duplicate entries, at least one
  wrong first name in SC). Margins are therefore computed from the **top two vote
  totals**, never from candidate labels or a `major_candidate` flag.
- **County `fips` is not guaranteed.** 34 of the 35 2026 Senate races carry it,
  but some races (and most historical ones, e.g. NC 2020) return regions with no
  `fips` at all. Counties are therefore matched on FIPS first and on **normalised
  name** second; anything still unmatched is counted and shown in the panel
  rather than silently dropped. Alaska returns a single `type: "State"` region —
  it does not report by county — and is skipped with a note.
- Senate "last race" baselines are per-seat, not per-state: Georgia uses the
  **2021 runoff**, Florida and Ohio use **2022** (both are Class 3 specials),
  Nebraska uses the **2024 special**, Oklahoma the **2022 special**. Hover the
  column to see which contest each number is from.
- `build/warnings.txt` lists every row the build could not fully resolve.

## Colour

Party colours are the blue↔red diverging pair with green for independents
(`#3987e5` / `#e66767` / `#008300`), validated for colour-vision deficiency
against the dark surface — the pairing passes CVD ΔE 8.6 and normal-vision ΔE 29.
Violet and yellow were tested first and failed. There is a light theme behind the
◐ button.
