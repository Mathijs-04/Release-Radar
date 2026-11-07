# Release Radar

A personal calendar for upcoming game releases, including ones that only have a
quarter, a year or no date at all. It runs completely in the browser: games and
cover images are stored in IndexedDB, so it can be hosted on GitHub Pages.

## Features

- **Fuzzy release dates:** exact day, month, quarter (Q2 2027), half (H1 2027),
  year, or TBA.
- **Early Access and 1.0:** a game can have an Early Access launch and a full
  release, each with its own date.
- **Delay tracking:** when you change a date, the old one is kept in the
  history and the card shows a "Delayed" badge.
- **Quick updates:** every card has an update button with one-click delays
  (+1 week, next quarter, next year, TBA…) or an exact/release date. The
  editor offers the same shortcuts.
- **Review:** release windows that passed without a date ("Q3 2026" in
  November) are flagged, so you can mark them as released or delayed. Games
  that have been out for over a month can be archived in one go.
- **Out now:** a banner announces games that came out in the last two weeks.
- **Portrait covers:** upload, drag-and-drop or paste any image and frame it as
  a 2:3 cover. Wide key art can be fitted with a blurred fill.
- **Image library:** every uploaded cover is kept and can be reused.
- **Timeline view:** a horizontal timeline whose spacing follows your games.
  Months, quarters and years with releases get room, and empty stretches
  shrink. Cards that share a window (all your "2027" games) sit side by side.
  Fuzzy dates show as glowing bands over their window, and exact dates as
  pins. Games without a date sit on an always-visible "To Be Announced" shelf
  below the timeline. Compact / Normal / Large set the card size. Drag to pan
  or jump to a year.
- **Agenda view:** grouped from "Out now", "This week" and "Next month" through
  quarters and years to "To be announced".
- **Filters:** release type (Early Access / full), platform and minimum hype,
  plus search. Filters are remembered.
- **Calendar export:** every exact release date as an all-day event in an
  `.ics` file for Google Calendar, Apple Calendar or Outlook. Importing again
  updates the existing events in apps that support it.
- **Installable and offline:** add it to your home screen or desktop. After
  the first visit it loads without a connection.
- **Keyboard shortcuts:** <kbd>N</kbd> add game · <kbd>/</kbd> search ·
  <kbd>F</kbd> filters · <kbd>T</kbd> timeline · <kbd>A</kbd> agenda.
- **Backup:** export and import everything (games and images) as one JSON file.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # date-logic unit tests
npm run build    # type-check + production build into dist/
```

See [DEPLOY.md](DEPLOY.md) for publishing to GitHub Pages.
