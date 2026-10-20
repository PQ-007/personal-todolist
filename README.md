# My Week

A personal weekly planner and to-do list that uses **Google Calendar as its database**.
Every calendar event is a task; its description holds markdown notes with checklists.
It installs on your phone as a PWA.

- Opens on a minimal focus view: just today's tasks (workdays only), with the next open task emphasized and a one-line add box. `←`/`→` step through workdays, `w` switches to the Mon–Fri week grid (dark by default, light toggle)
- Cards preview the notes, show checklist progress (`3/5`) and a spine that fills as items are ticked
- Click a card for rendered notes with live checkboxes, a markdown editor, color, done, dates, delete
- Drag to move, drag the bottom edge to resize (15-minute snap), click an empty slot to create
- Search, “Hide finished”, keyboard shortcuts
- Demo mode (data in this browser only) so you can try it without Google

## Quick start

```bash
npm install
cp .env.example .env      # optional: put your OAuth client ID here
npm run dev               # http://localhost:5173
```

The app starts in **demo mode**. To use Google Calendar, follow the setup below, then open
**Settings → Google Calendar**.

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server on http://localhost:5173        |
| `npm run build`     | Type-check and build to `dist/`            |
| `npm run preview`   | Serve the build on http://localhost:4173   |
| `npm run check`     | Type-check, lint and unit tests            |
| `npm test`          | Unit tests (Vitest)                        |

## Google Calendar setup

You need a Google Cloud project with the Calendar API and an OAuth client ID. This is free.

1. **Create a project.** Go to <https://console.cloud.google.com/>, open the project picker
   and choose **New project** (for example “my-week-planner”).
2. **Enable the Calendar API.** In **APIs & Services → Library**, search for
   **Google Calendar API** and click **Enable**.
3. **Configure the OAuth consent screen.** In **APIs & Services → OAuth consent screen**
   (shown as **Google Auth Platform** in newer consoles):
   - User type: **External**.
   - App name, support email and developer email: anything you like.
   - Scopes: add `https://www.googleapis.com/auth/calendar.events`.
   - Test users: add your own Google account. While the app is in **Testing**, only test
     users can sign in. That's all you need for personal use.
4. **Create an OAuth client ID.** In **APIs & Services → Credentials → Create credentials →
   OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: add every address you open the app from. They must
     match exactly (scheme, host and port, no trailing slash):
     - `http://localhost:5173` (dev server)
     - `http://localhost:4173` (`npm run preview`)
     - `https://YOUR-SITE.netlify.app` (your Netlify URL, see below)
     - your custom domain, if you add one
   - **Authorized redirect URIs**: leave empty. The app uses the token flow, which doesn't need one.
   - Copy the **Client ID** (`…apps.googleusercontent.com`). There is no client secret to
     keep: this app never uses one.
5. **Give the app the client ID.** Either put it in `.env` as `VITE_GOOGLE_CLIENT_ID=…`
   (used as the default) or paste it in **Settings**. Settings win over `.env`.
6. **(Recommended) Use a dedicated “Tasks” calendar.** In Google Calendar, create a new
   calendar (**Other calendars → + → Create new calendar**), then open its settings →
   **Integrate calendar** and copy the **Calendar ID**. Paste it into **Settings → Calendar ID**.
   Leave it as `primary` to use your main calendar.

Origin changes can take a few minutes to apply. If sign-in fails with
`redirect_uri_mismatch` or `origin_mismatch`, re-check step 4.

## Deploying to Netlify

`netlify.toml` already holds the build settings.

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repository.
   Build command `npm run build` and publish directory `dist` are read from `netlify.toml`.
3. **Site configuration → Environment variables**: add `VITE_GOOGLE_CLIENT_ID` with your
   client ID (optional; you can also paste it in Settings).
4. Deploy, then add the site URL (`https://YOUR-SITE.netlify.app`) to the OAuth client's
   **Authorized JavaScript origins** (setup step 4).
5. On your phone, open the site and use **Add to Home Screen** (iOS Safari: Share menu;
   Android Chrome: menu → **Install app**).

Deploy previews and branch deploys get their own URLs, which aren't authorized origins, so
Google sign-in only works on the production URL and localhost. Demo mode works everywhere.

## Secrets

Nothing secret is committed. `.env` is git-ignored; `.env.example` shows the variable. An
OAuth *client ID* isn't a secret (it's visible in the browser anyway); it is kept out of git
so each deployment can use its own.

## How it's built

TypeScript, React and Vite, with `vite-plugin-pwa` for the installable, offline app shell.
No Google SDK: Google Identity Services issues the token and the Calendar REST API is called
directly.

```
src/
  domain/   pure logic, unit-tested: markdown parse/toggle/preview, Google-HTML → markdown,
            overlap layout, date/time form, editor edits, search
  data/     TaskStore interface, Google store (the only code that calls fetch), Google
            sign-in, demo store
  state/    planner state with optimistic updates; settings and theme
  ui/       React components
  styles/   the prototype's CSS
tests/      Vitest tests for domain/ and data/
```

### Data model

| Task field  | Google Calendar event field                          |
| ----------- | ---------------------------------------------------- |
| title       | `summary`                                            |
| notes       | `description` (markdown text)                        |
| color       | `colorId`                                            |
| done        | `extendedProperties.private.done` (`"1"` / `"0"`)    |
| start / end | `start` / `end` (`date` for all-day, else `dateTime`) |

- **Notes are plain markdown**, so Google's own app shows the raw syntax. If you edit a
  description in Google Calendar, Google may save it as HTML. The planner converts that back
  to markdown for display, using an inert parser that keeps only text, structure and
  http(s)/mailto links. It writes the description back to Google only when you change the notes.
- **Rendering is safe by construction.** Markdown is parsed into a tree and rendered as React
  elements; no HTML string is ever injected.
- **Updates send only the fields that changed** and include the event's `etag`. If the event
  was changed elsewhere in the meantime, Google rejects the save. The planner then reloads
  the latest version and tells you, instead of overwriting.
- **Multi-day timed events** keep their length. Moving one shifts both ends, resizing changes
  only the end, and the dialog has an end date (“Ends another day”).

### Keyboard

| Key                     | Action                                    |
| ----------------------- | ----------------------------------------- |
| ← / →                   | Previous / next week                      |
| t                       | This week                                 |
| n                       | New task                                  |
| Enter / Space on a card | Open it                                   |
| Alt + ↑ / ↓             | Move the focused card by 15 minutes       |
| Alt + ← / →             | Move the focused card by a day            |
| Alt + Shift + ↑ / ↓     | Make the focused card shorter / longer    |
| Ctrl/⌘ + Enter          | Save in the task dialog                   |

In the notes editor, Enter continues a list (and an empty item ends it). While a Japanese
(or other) IME is composing, Enter only confirms the conversion: it never continues the list
or saves.

## Roadmap

1. ✅ Project setup, port of the prototype, unit tests for the pure logic
2. IndexedDB cache (Dexie), optimistic updates with an offline queue, incremental sync
   (`syncToken`), token renewal while the app is open
3. Recurring events (“this event / this and following / all events”)
4. Month and day views; 1–3 day view on phones
5. Touch: long-press then drag
6. Quick-add bar (“tomorrow 14:00 review report”) and routine templates
7. Plan vs actual, with a weekly report
