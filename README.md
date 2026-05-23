# Hebrew Dates

A web app for tracking important Hebrew calendar dates (birthdays, anniversaries, yahrzeits, bar/bat mitzvahs) and syncing them to your Google Calendar with the next 20 years of Gregorian dates.

## Why

Google Calendar can display Hebrew dates but cannot create recurring events anchored to the Hebrew calendar — each year's Gregorian date has to be computed separately. This app does that computation and syncs the resulting events into a dedicated Google Calendar that you can share with family.

## Features

- Add birthdays, anniversaries, yahrzeits, bar/bat mitzvahs by either Hebrew date or Gregorian date
- Hebrew gematria input for days and years (`א ניסן תשפ״ו`) and live preview
- Bar/bat mitzvah calculator: enter date of birth, get the 13th/12th-birthday date and the Shabbat bar/bat mitzvah (with parasha)
- Bilingual UI (English / עברית) with RTL layout
- Two modes:
  - **Google-connected**: events live in your Google Calendar, sync from any device, share with family
  - **Anonymous**: events live in browser localStorage; export as ICS file
- Dedicated calendar (so you don't pollute existing ones) — name editable per user
- Smart sync via `iCalUID` matching: created / updated / removed / unchanged counters
- Calendar sharing via Google ACL (view or edit permission)

## Stack

Plain HTML/CSS/JS. No build step. Uses `@hebcal/core` via ESM CDN for Hebrew↔Gregorian conversion and parasha lookups. OAuth via Google Identity Services.

## Local development

```sh
python3 -m http.server 8765
open http://localhost:8765
```

ES modules require an HTTP server — opening `index.html` via `file://` will not work.

## OAuth setup

This app uses two scopes:

- `https://www.googleapis.com/auth/calendar.app.created` — for managing events on calendars created by this app
- `https://www.googleapis.com/auth/calendar.acls` — for sharing calendars with other users

The Client ID is hardcoded in `googleCalendar.js`. To use your own project, replace the constant `CLIENT_ID`.

## Deployment

Configured for Vercel via `vercel.json`. Run `npx vercel` in the project directory.
