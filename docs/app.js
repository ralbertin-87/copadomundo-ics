/* ─────────────────────────────────────────────────────────────────────────
   World Cup 2026 — live bracket app
   Fetches openfootball/worldcup.json every 90 s, re-renders in place.
───────────────────────────────────────────────────────────────────────── */

const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const REFRESH_MS = 90_000;

// Global state
let matchById    = {};   // 1-based index → match object
let groupStands  = {};   // "Group A" → sorted standing rows
let rawMatches   = [];

// ── Data fetching ─────────────────────────────────────────────────────────

async function fetchAndRender() {
  try {
    const res = await fetch(DATA_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    rawMatches = json.matches || [];
    processMatches(rawMatches);
    renderGroups();
    renderBracket();
    renderBracketMobile();
    scheduleLinesDraw();
    updateTimestamp();
  } catch (e) {
    console.error('Fetch failed:', e);
    if (!rawMatches.length) {
      document.getElementById('groups-grid').innerHTML =
        `<div class="error-msg">Could not load data. Retrying…</div>`;
    }
  }
}

function processMatches(matches) {
  matchById = {};
  matches.forEach((m, i) => { matchById[i + 1] = m; });

  // Build group standings
  const groups = {};
  matches.forEach(m => {
    if (!m.group) return;
    groups[m.group] = groups[m.group] || [];
    groups[m.group].push(m);
  });
  groupStands = {};
  Object.entries(groups).forEach(([g, ms]) => {
    groupStands[g] = computeStanding(ms);
  });
}

// ── Group standings ───────────────────────────────────────────────────────

function computeStanding(matches) {
  const rows = {};
  matches.forEach(m => {
    for (const t of [m.team1, m.team2]) {
      if (!rows[t]) rows[t] = { team: t, p:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 };
    }
    const s = m.score?.ft;
    if (!s) return;
    const [g1, g2] = s;
    rows[m.team1].p++; rows[m.team2].p++;
    rows[m.team1].gf += g1; rows[m.team1].ga += g2;
    rows[m.team2].gf += g2; rows[m.team2].ga += g1;
    rows[m.team1].gd = rows[m.team1].gf - rows[m.team1].ga;
    rows[m.team2].gd = rows[m.team2].gf - rows[m.team2].ga;
    if (g1 > g2) {
      rows[m.team1].w++; rows[m.team1].pts += 3;
      rows[m.team2].l++;
    } else if (g1 < g2) {
      rows[m.team2].w++; rows[m.team2].pts += 3;
      rows[m.team1].l++;
    } else {
      rows[m.team1].d++; rows[m.team1].pts++;
      rows[m.team2].d++; rows[m.team2].pts++;
    }
  });

  const sorted = Object.values(rows).sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  );

  // Each team plays 3 group matches; games remaining = 3 − played
  sorted.forEach(r => { r.gamesLeft = 3 - r.p; });

  const played = matches.filter(m => m.score?.ft).length;
  const groupComplete = played === matches.length && matches.length > 0;

  if (groupComplete) {
    // Group done — top 2 by standings are definitively through
    sorted.forEach((r, i) => { r.clinched = i < 2; });
  } else {
    // Mathematical clinch: X is safe if at most 1 rival can still
    // accumulate ≥ X's current points (conservative — ignores GD)
    sorted.forEach((r, i) => {
      const rivals = sorted.filter((_, j) => j !== i);
      const canCatch = rivals.filter(rv => rv.pts + 3 * rv.gamesLeft >= r.pts);
      r.clinched = canCatch.length <= 1;
    });
  }

  return sorted;
}

// ── Team resolution ───────────────────────────────────────────────────────

function getWinner(num) {
  const m = matchById[num];
  if (!m) return null;
  const s = m.score;
  if (!s) return null;
  // Extra time / penalties take precedence
  if (s.pen) return s.pen[0] > s.pen[1] ? m.team1 : m.team2;
  if (s.et  && s.et[0]  !== s.et[1])  return s.et[0]  > s.et[1]  ? m.team1 : m.team2;
  if (s.ft  && s.ft[0]  !== s.ft[1])  return s.ft[0]  > s.ft[1]  ? m.team1 : m.team2;
  return null;
}

function getLoser(num) {
  const m = matchById[num];
  if (!m) return null;
  const w = getWinner(num);
  if (!w) return null;
  return w === m.team1 ? m.team2 : m.team1;
}

// Returns { name, flagUrl, isPlaceholder, resolved }
function resolveTeam(raw) {
  if (!raw) return { name: '?', flagUrl: null, isPlaceholder: true, resolved: false };

  // Already a known team name
  if (isKnownTeam(raw)) {
    return { name: raw, flagUrl: getFlagUrl(raw), isPlaceholder: false, resolved: true };
  }

  // "W74" → winner of match 74
  const wm = raw.match(/^W(\d+)$/);
  if (wm) {
    const winner = getWinner(+wm[1]);
    if (winner && isKnownTeam(winner))
      return { name: winner, flagUrl: getFlagUrl(winner), isPlaceholder: false, resolved: true };
    return { name: `Winner M${wm[1]}`, flagUrl: null, isPlaceholder: true, resolved: false };
  }

  // "L101" → loser of match 101
  const lm = raw.match(/^L(\d+)$/);
  if (lm) {
    const loser = getLoser(+lm[1]);
    if (loser && isKnownTeam(loser))
      return { name: loser, flagUrl: getFlagUrl(loser), isPlaceholder: false, resolved: true };
    return { name: `Loser M${lm[1]}`, flagUrl: null, isPlaceholder: true, resolved: false };
  }

  // "1E" → 1st place Group E
  const gm = raw.match(/^([12])([A-L])$/);
  if (gm) {
    const pos = +gm[1] - 1;
    const key = `Group ${gm[2]}`;
    const standing = groupStands[key];
    if (standing && standing[pos] && isKnownTeam(standing[pos].team)) {
      const t = standing[pos].team;
      return { name: t, flagUrl: getFlagUrl(t), isPlaceholder: false, resolved: true };
    }
    const label = pos === 0 ? '1st' : '2nd';
    return { name: `${label} Group ${gm[2]}`, flagUrl: null, isPlaceholder: true, resolved: false };
  }

  // "3A/B/C/D/F" style → best 3rd-place qualifier (can't compute)
  if (/^\d+[A-L\/]+/.test(raw)) {
    return { name: 'Best 3rd Place', flagUrl: null, isPlaceholder: true, resolved: false };
  }

  return { name: raw, flagUrl: null, isPlaceholder: true, resolved: false };
}

function isMatchLive(m) {
  if (!m || m.score?.ft) return false;
  const [y, mo, d] = (m.date || '').split('-').map(Number);
  if (!y) return false;
  const now = new Date();
  return now.getFullYear() === y && (now.getMonth()+1) === mo && now.getDate() === d;
}

function matchScore(m) {
  if (!m?.score) return null;
  const { ft, et, pen } = m.score;
  if (pen) return { s1: ft[0], s2: ft[1], extra: `(${pen[0]}-${pen[1]} pens)` };
  if (et)  return { s1: et[0], s2: et[1], extra: 'AET' };
  if (ft)  return { s1: ft[0], s2: ft[1], extra: null };
  return null;
}

function formatDate(m) {
  if (!m?.date) return '';
  const [,mo,d] = m.date.split('-');
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+mo]} ${+d}`;
}

// ── HTML builders ─────────────────────────────────────────────────────────

function teamRowHtml(raw, isT1, score, matchFinished) {
  const t = resolveTeam(raw);
  const flagHtml = t.flagUrl
    ? `<img class="flag-img" src="${t.flagUrl}" alt="${t.name}" loading="lazy">`
    : `<span class="flag-placeholder"></span>`;
  const nameClass = t.isPlaceholder ? 'team-name-text is-placeholder' : 'team-name-text';
  const scoreHtml = matchFinished && score !== null
    ? `<span class="score-val">${score}</span>` : '';
  return `
    <div class="team-row">
      ${flagHtml}
      <span class="${nameClass}">${t.name}</span>
      ${scoreHtml}
    </div>`;
}

function matchCardHtml(num, opts = {}) {
  const m = matchById[num];
  const sc = m ? matchScore(m) : null;
  const finished = !!sc;
  const live = m ? isMatchLive(m) : false;

  const t1raw = m?.team1 || '';
  const t2raw = m?.team2 || '';
  const t1 = resolveTeam(t1raw);
  const t2 = resolveTeam(t2raw);

  // Determine winner/loser for card class
  let winTeam = null, loseTeam = null;
  if (finished) {
    winTeam  = getWinner(num);
    loseTeam = winTeam === t1raw ? t2raw : t1raw;
  }

  function row(raw, score) {
    const t = resolveTeam(raw);
    const isWinner = finished && raw === winTeam;
    const isLoser  = finished && raw === loseTeam;
    const rowClass = isWinner ? 'winner' : (isLoser ? 'loser' : '');
    const flagHtml = t.flagUrl
      ? `<img class="flag-img" src="${t.flagUrl}" alt="${t.name}" loading="lazy">`
      : `<span class="flag-placeholder"></span>`;
    const nameClass = t.isPlaceholder ? 'team-name-text is-placeholder' : 'team-name-text';
    const scoreHtml = finished && score !== null
      ? `<span class="score-val">${score}</span>` : '';
    return `<div class="team-row ${rowClass}">${flagHtml}<span class="${nameClass}">${t.name}</span>${scoreHtml}</div>`;
  }

  const cardClass = [
    'match-card',
    opts.isFinal ? 'final-card' : '',
    finished ? 'is-decided' : '',
    live ? 'is-live' : '',
  ].filter(Boolean).join(' ');

  const metaLeft = live ? `<span class="live-badge">● LIVE</span>` : formatDate(m);
  const metaRight = sc?.extra || `M${num}`;

  return `
    <div class="${cardClass}" data-match="${num}">
      ${row(t1raw, sc?.s1)}
      ${row(t2raw, sc?.s2)}
      <div class="match-meta">
        <span>${metaLeft}</span>
        <span>${metaRight}</span>
      </div>
    </div>`;
}

// ── Group rendering ───────────────────────────────────────────────────────

function renderGroups() {
  const container = document.getElementById('groups-grid');
  const groupOrder = ['Group A','Group B','Group C','Group D','Group E','Group F',
                      'Group G','Group H','Group I','Group J','Group K','Group L'];
  container.innerHTML = groupOrder.map(g => {
    const rows = groupStands[g] || [];
    return `
      <div class="group-card">
        <div class="group-card-header">${g}</div>
        <table class="group-table">
          <colgroup>
            <col class="col-pos">
            <col class="col-team">
            <col class="col-stat"><col class="col-stat"><col class="col-stat"><col class="col-stat">
            <col class="col-stat"><col class="col-stat">
            <col class="col-stat">
            <col class="col-pts">
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th class="th-team">Team</th>
              <th>P</th><th>W</th><th>D</th><th>L</th>
              <th>GF</th><th>GA</th><th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const cls = i < 2 ? 'standing-qualified' : (i === 2 ? 'standing-third' : 'standing-out');
              const flag = getFlagUrl(r.team)
                ? `<img src="${getFlagUrl(r.team)}" alt="${r.team}" width="18" height="13" style="border-radius:2px;object-fit:cover;flex-shrink:0">`
                : `<span class="placeholder-flag"></span>`;
              const gd = r.gd > 0 ? `+${r.gd}` : r.gd;
              const badge = r.clinched
                ? `<span class="clinched-badge" title="Qualified for Round of 32">★</span>`
                : '';
              return `<tr class="${cls}">
                <td class="td-pos">${i+1}</td>
                <td class="td-team"><div class="team-cell">${flag}<span class="team-name">${r.team}</span>${badge}</div></td>
                <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
                <td>${r.gf}</td><td>${r.ga}</td><td>${gd}</td>
                <td class="td-pts">${r.pts}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');
}

// ── Bracket rendering (desktop) ────────────────────────────────────────────

function bracketColHtml(matchNums, totalSlots, opts = {}) {
  // Each match occupies one slot; unused slots are filled with spacers.
  // We use flex space-around on the column, so we just emit the cards.
  return matchNums.map(num => matchCardHtml(num, opts)).join('\n');
}

function renderBracket() {
  const arena = document.getElementById('bracket-arena');
  const { left, right, final, thirdPlace } = BRACKET;

  // Helper: column element
  function col(id, matchNums, height, opts = {}) {
    const style = `height:${height}px`;
    return `<div class="bracket-col" id="${id}" style="${style}">${bracketColHtml(matchNums, matchNums.length, opts)}</div>`;
  }

  const SLOT = 110; // px per R32 match
  const leftH  = 8 * SLOT;  // 880px
  const r16H   = 4 * SLOT;  // but we center the column: use leftH
  const qfH    = 2 * SLOT;
  const sfH    = 1 * SLOT;
  // All left columns same total height so space-around aligns them
  const H = leftH;

  // Trophy + final + third-place center column
  const finalCard     = matchCardHtml(final, { isFinal: true });
  const thirdCard     = matchCardHtml(thirdPlace);
  const trophySvg     = buildTrophySvg();
  const centerHtml = `
    <div class="col-center" style="height:${H}px;">
      <div class="trophy-wrap">
        <div class="trophy-glow"></div>
        ${trophySvg}
      </div>
      <div class="final-label">FINAL</div>
      ${finalCard}
      <div class="third-place-label">Third Place</div>
      ${thirdCard}
    </div>`;

  arena.innerHTML =
    // Left side
    col('col-r32-l',  left.r32, H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-r16-l',  left.r16, H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-qf-l',   left.qf,  H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-sf-l',   left.sf,  H) +
    `<div class="col-gap-spacer"></div>` +
    // Center
    centerHtml +
    // Right side (mirrored)
    `<div class="col-gap-spacer"></div>` +
    col('col-sf-r',   right.sf,  H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-qf-r',   right.qf,  H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-r16-r',  right.r16, H) +
    `<div class="col-gap-spacer"></div>` +
    col('col-r32-r',  right.r32, H);

  // Inject the SVG element for lines (drawn after layout)
  if (!document.getElementById('bracket-lines')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'bracket-lines';
    arena.prepend(svg);
  }
}

// ── Bracket rendering (mobile) ────────────────────────────────────────────

function renderBracketMobile() {
  const el = document.getElementById('bracket-mobile');
  const rounds = [
    { label: 'Final',             nums: [BRACKET.final] },
    { label: '3rd Place',         nums: [BRACKET.thirdPlace] },
    { label: 'Semi-finals',       nums: [...BRACKET.left.sf, ...BRACKET.right.sf] },
    { label: 'Quarter-finals',    nums: [...BRACKET.left.qf, ...BRACKET.right.qf] },
    { label: 'Round of 16',       nums: [...BRACKET.left.r16, ...BRACKET.right.r16] },
    { label: 'Round of 32',       nums: [...BRACKET.left.r32, ...BRACKET.right.r32] },
  ];
  el.innerHTML = rounds.map(r => `
    <div class="mobile-round">
      <div class="mobile-round-header">${r.label}</div>
      <div class="mobile-matches">
        ${r.nums.map(n => matchCardHtml(n, { isFinal: n === BRACKET.final })).join('')}
      </div>
    </div>`).join('');
}

// ── SVG bracket lines ─────────────────────────────────────────────────────

function scheduleLinesDraw() {
  // Wait one frame for layout to settle
  requestAnimationFrame(() => requestAnimationFrame(drawBracketLines));
  window.addEventListener('resize', debounce(drawBracketLines, 150), { once: false });
}

function drawBracketLines() {
  const svg = document.getElementById('bracket-lines');
  const arena = document.getElementById('bracket-arena');
  if (!svg || !arena) return;

  const arenaRect = arena.getBoundingClientRect();
  svg.style.width  = arena.scrollWidth + 'px';
  svg.style.height = arena.offsetHeight + 'px';
  svg.innerHTML = '';

  const LINE_COLOR  = 'rgba(201,162,39,0.3)';
  const STROKE_W    = 1.5;

  function cardCenter(matchNum) {
    const card = arena.querySelector(`[data-match="${matchNum}"]`);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    const ar = arenaRect;
    return {
      x: r.left - ar.left + arena.scrollLeft,
      y: r.top  - ar.top  + window.scrollY - arenaRect.top + arena.scrollTop,
      right:  r.right  - ar.left + arena.scrollLeft,
      left:   r.left   - ar.left + arena.scrollLeft,
      cy:     r.top - ar.top + r.height / 2,
    };
  }

  function line(x1, y1, x2, y2) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', x1); el.setAttribute('y1', y1);
    el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    el.setAttribute('stroke', LINE_COLOR);
    el.setAttribute('stroke-width', STROKE_W);
    svg.appendChild(el);
  }

  // Connect a pair [a, b] (right edge) to winner match c (left edge)
  function connectPair(aNum, bNum, cNum, side) {
    const a = cardCenter(aNum);
    const b = cardCenter(bNum);
    const c = cardCenter(cNum);
    if (!a || !b || !c) return;

    const ax = side === 'left' ? a.right : a.left;
    const bx = side === 'left' ? b.right : b.left;
    const cx = side === 'left' ? c.left  : c.right;

    const midX = side === 'left' ? (ax + cx) / 2 : (bx + cx) / 2;
    const midY = (a.cy + b.cy) / 2;

    // Horizontal stub from each match
    line(ax, a.cy, midX, a.cy);
    line(bx, b.cy, midX, b.cy);
    // Vertical bar connecting the two stubs
    line(midX, a.cy, midX, b.cy);
    // Horizontal connector to next match
    line(midX, midY, cx, midY);
  }

  const { left, right } = BRACKET;

  // Left side
  left.r32pairs.forEach(([a, b], i) => connectPair(a, b, left.r16[i], 'left'));
  left.r16pairs.forEach(([a, b], i) => connectPair(a, b, left.qf[i],  'left'));
  left.qfPairs .forEach(([a, b], i) => connectPair(a, b, left.sf[i],  'left'));

  // Left SF → Final
  const sfL = cardCenter(left.sf[0]);
  const fin = cardCenter(BRACKET.final);
  if (sfL && fin) {
    line(sfL.right, sfL.cy, (sfL.right + fin.left) / 2, sfL.cy);
    line((sfL.right + fin.left) / 2, sfL.cy, fin.left, sfL.cy);
  }

  // Right side (lines go left from each match)
  right.r32pairs.forEach(([a, b], i) => connectPair(a, b, right.r16[i], 'right'));
  right.r16pairs.forEach(([a, b], i) => connectPair(a, b, right.qf[i],  'right'));
  right.qfPairs .forEach(([a, b], i) => connectPair(a, b, right.sf[i],  'right'));

  // Right SF → Final
  const sfR = cardCenter(right.sf[0]);
  if (sfR && fin) {
    line(sfR.left, sfR.cy, (sfR.left + fin.right) / 2, sfR.cy);
    line((sfR.left + fin.right) / 2, sfR.cy, fin.right, sfR.cy);
  }
}

// ── Trophy SVG (original CSS/SVG art) ────────────────────────────────────

function buildTrophySvg() {
  return `
  <svg class="trophy-svg" viewBox="0 0 100 145" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tg1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#ffe066"/>
        <stop offset="45%"  stop-color="#c9a227"/>
        <stop offset="100%" stop-color="#7a5200"/>
      </linearGradient>
      <linearGradient id="tg2" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="#ffe066"/>
        <stop offset="100%" stop-color="#c9a227"/>
      </linearGradient>
      <filter id="tglow">
        <feGaussianBlur stdDeviation="2.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Cup bowl -->
    <path d="M28 12 L72 12 Q78 12 79 18 L73 62 Q68 76 50 80 Q32 76 27 62 L21 18 Q22 12 28 12 Z"
          fill="url(#tg1)" filter="url(#tglow)"/>
    <!-- Left handle -->
    <path d="M28 22 Q12 28 10 44 Q9 57 24 53"
          fill="none" stroke="url(#tg2)" stroke-width="5.5"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Right handle -->
    <path d="M72 22 Q88 28 90 44 Q91 57 76 53"
          fill="none" stroke="url(#tg2)" stroke-width="5.5"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Stem -->
    <rect x="44" y="80" width="12" height="18" rx="2" fill="url(#tg1)"/>
    <!-- Base tier 1 -->
    <rect x="32" y="98" width="36" height="9" rx="3" fill="url(#tg1)"/>
    <!-- Base tier 2 -->
    <rect x="24" y="107" width="52" height="9" rx="3" fill="url(#tg1)"/>
    <!-- Base tier 3 -->
    <rect x="16" y="116" width="68" height="10" rx="4" fill="url(#tg1)"/>
    <!-- Star inside cup -->
    <text x="50" y="54" text-anchor="middle" font-size="22"
          fill="rgba(255,240,120,0.22)" font-family="serif">★</text>
    <!-- Shine line -->
    <line x1="36" y1="22" x2="34" y2="48"
          stroke="rgba(255,255,200,0.18)" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

// ── Bracket headers ───────────────────────────────────────────────────────

function renderBracketHeaders() {
  const wrap = document.getElementById('bracket-headers');
  if (!wrap) return;
  const GAP = '<div class="bracket-header-cell col-gap"></div>';
  wrap.innerHTML = [
    `<div class="bracket-header-cell">${STAGE_LABELS.r32}</div>`, GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.r16}</div>`, GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.qf}</div>`,  GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.sf}</div>`,  GAP,
    `<div class="bracket-header-cell col-final">${STAGE_LABELS.final}</div>`, GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.sf}</div>`,  GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.qf}</div>`,  GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.r16}</div>`, GAP,
    `<div class="bracket-header-cell">${STAGE_LABELS.r32}</div>`,
  ].join('');
}

// ── Timestamp ──────────────────────────────────────────────────────────────

function updateTimestamp() {
  const el = document.getElementById('timestamp');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Background particle canvas ────────────────────────────────────────────

function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const particles = [];
  const COUNT = 55;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.3,
      vx: (Math.random() - .5) * 0.18,
      vy: -Math.random() * 0.25 - 0.05,
      alpha: Math.random() * 0.5 + 0.1,
      da: (Math.random() - .5) * 0.003,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x  += p.vx; p.y  += p.vy;
      p.alpha += p.da;
      if (p.alpha <= 0 || p.alpha >= 0.65) p.da *= -1;
      if (p.y < -5) p.y = canvas.height + 5;
      if (p.x < -5) p.x = canvas.width + 5;
      if (p.x > canvas.width + 5) p.x = -5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,162,39,${p.alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// ── Utility ───────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Entry point ───────────────────────────────────────────────────────────

async function init() {
  initParticles();
  renderBracketHeaders();

  document.getElementById('groups-grid').innerHTML =
    '<div class="loading-msg">Loading live data…</div>';

  await fetchAndRender();
  setInterval(fetchAndRender, REFRESH_MS);

  // Nav tab active state
  const navLinks = document.querySelectorAll('nav a');
  const sections = [document.getElementById('groups'), document.getElementById('bracket')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const link = document.querySelector(`nav a[href="#${e.target.id}"]`);
        if (link) link.classList.add('active');
      }
    });
  }, { threshold: 0.3 });
  sections.forEach(s => s && observer.observe(s));
}

window.addEventListener('DOMContentLoaded', init);
