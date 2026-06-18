#!/usr/bin/env python3
"""Generate a self-updating iCalendar feed for FIFA World Cup 2026."""

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_URL = (
    "https://raw.githubusercontent.com/openfootball/worldcup.json"
    "/master/2026/worldcup.json"
)
OUTPUT = Path(__file__).parent / "worldcup.ics"

# Team name → ISO 3166-1 alpha-2 code (or literal subdivision emoji string).
# Subdivision flags for England/Scotland/Wales are encoded directly as tag sequences
# because they have no ISO 3166-1 alpha-2 country code.
_ENG = "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f"
_SCO = "\U0001f3f4\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f"
_WAL = "\U0001f3f4\U000e0067\U000e0062\U000e0077\U000e006c\U000e0073\U000e007f"

TEAM_CODES: dict[str, str] = {
    "Algeria": "DZ",
    "Argentina": "AR",
    "Australia": "AU",
    "Austria": "AT",
    "Belgium": "BE",
    "Bosnia & Herzegovina": "BA",
    "Brazil": "BR",
    "Canada": "CA",
    "Cape Verde": "CV",
    "Colombia": "CO",
    "Croatia": "HR",
    "Curaçao": "CW",
    "Czech Republic": "CZ",
    "DR Congo": "CD",
    "Ecuador": "EC",
    "Egypt": "EG",
    "England": _ENG,
    "France": "FR",
    "Germany": "DE",
    "Ghana": "GH",
    "Haiti": "HT",
    "Iran": "IR",
    "IR Iran": "IR",
    "Ivory Coast": "CI",
    "Côte d'Ivoire": "CI",
    "Iraq": "IQ",
    "Japan": "JP",
    "Jordan": "JO",
    "Korea Republic": "KR",
    "South Korea": "KR",
    "Mexico": "MX",
    "Morocco": "MA",
    "Netherlands": "NL",
    "New Zealand": "NZ",
    "Norway": "NO",
    "Panama": "PA",
    "Paraguay": "PY",
    "Portugal": "PT",
    "Qatar": "QA",
    "Saudi Arabia": "SA",
    "Scotland": _SCO,
    "Senegal": "SN",
    "South Africa": "ZA",
    "Spain": "ES",
    "Sweden": "SE",
    "Switzerland": "CH",
    "Tunisia": "TN",
    "Turkey": "TR",
    "Türkiye": "TR",
    "Uruguay": "UY",
    "USA": "US",
    "United States": "US",
    "Uzbekistan": "UZ",
    "Wales": _WAL,
}


def _code_to_emoji(code: str) -> str:
    """Convert ISO 3166-1 alpha-2 code to regional-indicator emoji pair."""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def team_flag(name: str) -> str:
    """Return flag emoji for a team, or '' for unknown/placeholder names."""
    val = TEAM_CODES.get(name)
    if val is None:
        return ""
    # Subdivision flag: already a multi-character emoji string
    if len(val) > 2:
        return val
    return _code_to_emoji(val)


def stage_label(round_name: str) -> str:
    """Map round name to human-readable stage label."""
    if re.fullmatch(r"Matchday \d+", round_name):
        return "Group Stage"
    return round_name


def parse_kickoff_utc(date_str: str, time_str: str) -> datetime:
    """Parse 'YYYY-MM-DD' + 'HH:MM UTC±N' into a UTC-aware datetime."""
    m = re.match(r"(\d{1,2}):(\d{2})\s+UTC([+-]\d+(?:\.\d+)?)", time_str)
    if not m:
        raise ValueError(f"Unrecognised time format: {time_str!r}")
    hour = int(m[1])
    minute = int(m[2])
    offset_hours = float(m[3])
    y, mo, d = (int(x) for x in date_str.split("-"))
    local_dt = datetime(
        y, mo, d, hour, minute,
        tzinfo=timezone(timedelta(hours=offset_hours)),
    )
    return local_dt.astimezone(timezone.utc)


def stable_uid(match: dict) -> str:
    """Derive a stable UID from round + date + venue (survives placeholder resolution)."""
    key = "|".join([
        "worldcup2026",
        match.get("round", ""),
        match.get("date", ""),
        match.get("ground", ""),
    ])
    return hashlib.md5(key.encode()).hexdigest()[:16] + "@worldcup2026.ics"


def ical_fold(line: str) -> str:
    """RFC 5545 §3.1 line folding: lines > 75 octets are wrapped with CRLF + SP."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    chunks = []
    while len(raw) > 75:
        cut = 75
        # Back off to avoid splitting a multi-byte UTF-8 sequence
        while cut > 0 and (raw[cut] & 0xC0) == 0x80:
            cut -= 1
        chunks.append(raw[:cut].decode("utf-8"))
        raw = raw[cut:]
    chunks.append(raw.decode("utf-8"))
    return "\r\n ".join(chunks)


def build_vevent(match: dict, dtstamp: str) -> list[str]:
    """Return a list of iCalendar property lines for one VEVENT."""
    try:
        dtstart = parse_kickoff_utc(match["date"], match["time"])
    except (KeyError, ValueError) as exc:
        print(f"  Skipping {match}: {exc}")
        return []

    dtend = dtstart + timedelta(hours=2)
    stage = stage_label(match.get("round", ""))

    team1 = match.get("team1", "TBD")
    team2 = match.get("team2", "TBD")
    f1 = team_flag(team1)
    f2 = team_flag(team2)

    t1_str = f"{f1} {team1}" if f1 else team1
    t2_str = f"{team2} {f2}" if f2 else team2

    score = match.get("score") or {}
    ft = score.get("ft")
    if ft and len(ft) == 2:
        summary = f"{stage} {t1_str} {ft[0]} x {ft[1]} {t2_str}"
    else:
        summary = f"{stage} {t1_str} x {t2_str}"

    group = match.get("group", "")
    description = f"{group} – {stage}" if group else stage

    return [
        "BEGIN:VEVENT",
        f"UID:{stable_uid(match)}",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART:{dtstart.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTEND:{dtend.strftime('%Y%m%dT%H%M%SZ')}",
        f"SUMMARY:{summary}",
        f"LOCATION:{match.get('ground', '')}",
        f"DESCRIPTION:{description}",
        "END:VEVENT",
    ]


def build_ics(matches: list[dict]) -> str:
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//worldcup2026-ical//FIFA World Cup 2026//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:FIFA World Cup 2026",
        "X-WR-TIMEZONE:UTC",
        "X-WR-CALDESC:Auto-updating schedule for the FIFA World Cup 2026",
    ]
    for match in matches:
        lines.extend(build_vevent(match, dtstamp))
    lines.append("END:VCALENDAR")
    return "\r\n".join(ical_fold(ln) for ln in lines) + "\r\n"


def main() -> None:
    print(f"Fetching {DATA_URL}")
    with urllib.request.urlopen(DATA_URL) as resp:
        data = json.loads(resp.read().decode())

    matches = data.get("matches", [])
    print(f"Found {len(matches)} matches")

    ics = build_ics(matches)
    OUTPUT.write_text(ics, encoding="utf-8")
    print(f"Written → {OUTPUT}  ({OUTPUT.stat().st_size:,} bytes, {len(matches)} events)")


if __name__ == "__main__":
    main()
