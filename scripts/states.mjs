export const STATES = {
AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',
VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};
export const NAME_TO_PO = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toUpperCase(), k]));

/**
 * Which prior election is the right "last time this seat was up" baseline.
 * Seats up in 2026 are Class 2 (last contested 2020) except where noted.
 * Verified against MEDSL 1976-2024 rather than recollection.
 */
export const SENATE_BASELINE = {
  _default: { year: 2020, special: false, runoff: false },
  GA: { year: 2021, special: false, runoff: true,  note: 'Ossoff seat decided in the Jan 2021 runoff' },
  FL: { year: 2022, special: false, runoff: false, note: 'Class 3 seat (Rubio); 2026 is a special' },
  OH: { year: 2022, special: false, runoff: false, note: 'Class 3 seat (Vance); 2026 is a special' },
  NE: { year: 2024, special: true,  runoff: false, note: 'Sasse seat; Ricketts won the 2024 special' },
  OK: { year: 2022, special: true,  runoff: false, note: 'Inhofe seat; Mullin won the 2022 special' },
};
