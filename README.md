# FIFA World Cup 2026 — iCalendar Feed

Auto-updating `.ics` calendar for the 2026 FIFA World Cup (USA, Canada, Mexico).  
Updated every 2 hours via GitHub Actions using live data from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json).

## Subscribe

Copy the raw URL below and add it as a **subscribed calendar** in your app:

```
https://raw.githubusercontent.com/<YOUR-GITHUB-USERNAME>/worldcup2026-ical/main/worldcup.ics
```

> Replace `<YOUR-GITHUB-USERNAME>` with your actual GitHub username after you push this repo.

### How to subscribe

| App | Steps |
|-----|-------|
| **Apple Calendar** | File → New Calendar Subscription → paste URL |
| **Google Calendar** | Other calendars → From URL → paste URL |
| **Outlook** | Add calendar → Subscribe from web → paste URL |

## Event format

**Upcoming match:**
```
Group Stage 🇧🇷 Brazil x Croatia 🇭🇷
```

**Finished match:**
```
Group Stage 🇧🇷 Brazil 2 x 1 Croatia 🇭🇷
```

**Knockout (placeholder teams):**
```
Semi-final W97 x W98
```

- All times are in UTC (your calendar app converts them to local time).
- Each event is 2 hours long.
- Stable UIDs mean re-runs update existing events instead of creating duplicates.

## Data source

[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) — open-source, public domain.

## Run locally

```bash
python3 generate_ics.py
```

No dependencies beyond the Python standard library.
