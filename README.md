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

This app uses these scopes:

- `https://www.googleapis.com/auth/calendar.app.created` — for managing events on calendars created by this app
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — for finding this app's dedicated calendars across devices
- `https://www.googleapis.com/auth/calendar.acls` — for sharing calendars with other users

The Client ID is hardcoded in `googleCalendar.js`. To use your own project, replace the constant `CLIENT_ID`.

## Analytics setup

Analytics is wired through Google Analytics 4, but disabled by default.

1. Create a GA4 property and Web data stream in Google Analytics.
2. Copy the stream's Measurement ID (`G-...`).
3. Paste it into `GA_MEASUREMENT_ID` in `analytics.js`.
4. Deploy the site over HTTPS. Local `file://` previews intentionally do not send analytics.

The app only sends aggregate usage events such as app opens, event creation, ICS downloads, Google sync completion, and calendar sharing role. It does not send names, Hebrew/Gregorian dates, emails, calendar IDs, or other event contents.

## Deployment

Configured for Vercel via `vercel.json`. Run `npx vercel` in the project directory.
