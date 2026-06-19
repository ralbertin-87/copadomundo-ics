// Team name → ISO 3166-1 alpha-2 code (or subdivision code for home nations)
const TEAM_FLAGS = {
  // Group A
  'Mexico': 'mx', 'South Africa': 'za', 'South Korea': 'kr', 'Czech Republic': 'cz',
  // Group B
  'Canada': 'ca', 'Bosnia & Herzegovina': 'ba', 'Qatar': 'qa', 'Switzerland': 'ch',
  // Group C
  'Brazil': 'br', 'Morocco': 'ma', 'Haiti': 'ht', 'Scotland': 'gb-sct',
  // Group D
  'USA': 'us', 'Paraguay': 'py', 'Australia': 'au', 'Turkey': 'tr',
  // Group E
  'Germany': 'de', 'Ivory Coast': 'ci', 'Ecuador': 'ec', 'Curaçao': 'cw',
  // Group F
  'Netherlands': 'nl', 'Japan': 'jp', 'Sweden': 'se', 'Tunisia': 'tn',
  // Group G
  'Belgium': 'be', 'Egypt': 'eg', 'Iran': 'ir', 'New Zealand': 'nz',
  // Group H
  'Spain': 'es', 'Uruguay': 'uy', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa',
  // Group I
  'France': 'fr', 'Norway': 'no', 'Senegal': 'sn', 'Iraq': 'iq',
  // Group J
  'Argentina': 'ar', 'Algeria': 'dz', 'Austria': 'at', 'Jordan': 'jo',
  // Group K
  'Portugal': 'pt', 'Colombia': 'co', 'DR Congo': 'cd', 'Uzbekistan': 'uz',
  // Group L
  'England': 'gb-eng', 'Croatia': 'hr', 'Ghana': 'gh', 'Panama': 'pa',
  // Alternates that may appear in the dataset
  'IR Iran': 'ir', 'Korea Republic': 'kr', 'Côte d\'Ivoire': 'ci',
  'Türkiye': 'tr', 'United States': 'us',
};

function getFlagUrl(teamName) {
  const code = TEAM_FLAGS[teamName];
  if (!code) return null;
  return `https://flagcdn.com/w40/${code}.png`;
}

function isKnownTeam(name) {
  return name in TEAM_FLAGS;
}

// Bracket topology, 1-based match indices matching the openfootball dataset.
//
// Left bracket  → feeds SF match 101 → Final 104
// Right bracket → feeds SF match 102 → Final 104
//
// Pair arrays: each [a, b] means matches a and b both feed into the
// next-round match immediately following that pair in the r16/qf/sf array.
const BRACKET = {
  final:      104,
  thirdPlace: 103,

  left: {
    sf:       [101],
    qf:       [97, 98],
    r16:      [89, 90, 93, 94],
    r32:      [74, 77, 73, 75, 83, 84, 81, 82],
    r32pairs: [[74,77],[73,75],[83,84],[81,82]],
    r16pairs: [[89,90],[93,94]],
    qfPairs:  [[97,98]],
  },

  right: {
    sf:       [102],
    qf:       [99, 100],
    r16:      [91, 92, 95, 96],
    r32:      [76, 78, 79, 80, 86, 88, 85, 87],
    r32pairs: [[76,78],[79,80],[86,88],[85,87]],
    r16pairs: [[91,92],[95,96]],
    qfPairs:  [[99,100]],
  },
};

// Stage label displayed in the bracket column headers
const STAGE_LABELS = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf:  'Quarter-finals',
  sf:  'Semi-finals',
  final: 'Final',
  thirdPlace: '3rd Place',
};
