# Calpis

A personal weekly planner and to-do list that uses **Google Calendar as its database**.
Every calendar event is a task; its description holds markdown notes with checklists.
It installs on your phone as a PWA.

Two modes, one tool:

- **Focus** (`f`, the default): one calm column for the day. The task to do now, with its checklist, the
  time left and a progress line; the rest of today; your to-dos with a Start button; and one add box
  (`14:00 Review PR` goes on the calendar, anything else becomes a to-do). Completed work folds away.
- **Plan** (`p`): the calendar (Day or 2–7 days, Workdays, Week, Month) between two sidebars: on the left a
  mini month and today's work, on the right the to-do stack (`s`). Drag to-dos onto the calendar, drag
  tasks back, copy last week, paste.
- In both, clicking a task in today's list opens it in place (time, live checklist, Done/Edit); no dialog.

Everywhere:

- **Command palette** (`Ctrl/⌘ K` or `/`): every action and a search over the tasks on screen
- Click a task for a large read view with live checkboxes; right-click for quick actions (color,
  Work/Personal, duplicate, move to the next day, move to the to-do stack, copy, delete with Undo)
- Work and Personal labels and #tags, saved in the event; the label filter applies to every view
- Finished tasks fade; drag to move, drag the bottom edge to resize, `Delete` removes with Undo
- Keys (work with any keyboard layout, e.g. Mongolian or Japanese input): `t` today, `←`/`→` (or `k`/`j`), `d` / `1`–`7` / `x` / `w` / `m` views, `c` new task, `n` add box
- English, Mongolian and Japanese; dark and light; installs as a PWA; demo mode works without Google

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
   and choose **New project** (for example “calpis”).
2. **Enable the Calendar API.** In **APIs & Services → Library**, search for
   **Google Calendar API** and click **Enable**.
3. **Configure the OAuth consent screen.** In **APIs & Services → OAuth consent screen**
   (shown as **Google Auth Platform** in newer consoles):
   - User type: **External**.
   - App name, support email and developer email: anything you like.
   - Scopes: add `https://www.googleapis.com/auth/calendar.events`.
   - Test users: add your own Google account. While the app is in **Testing**, only test
     users can sign in.
   - **Publishing status: In production** (Audience page → **Publish app**) if you deploy the
     sign-in function (see “Staying signed in”). In **Testing**, Google expires the stored
     sign-in after 7 days. You don't need verification for personal use: on sign-in, Google
     shows “Google hasn't verified this app”; choose **Advanced → Go to … (unsafe)**.
4. **Create an OAuth client ID.** In **APIs & Services → Credentials → Create credentials →
   OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: add every address you open the app from. They must
     match exactly (scheme, host and port, no trailing slash):
     - `http://localhost:5173` (dev server)
     - `http://localhost:4173` (`npm run preview`)
     - `https://YOUR-SITE.netlify.app` (your Netlify URL, see below)
     - your custom domain, if you add one
   - **Authorized redirect URIs**: `https://YOUR-SITE.netlify.app/api/auth/callback` (and the
     same for a custom domain). Only the deployed sign-in function uses it.
   - Copy the **Client ID** (`…apps.googleusercontent.com`) and the **Client secret**. The
     secret goes only into Netlify's environment, never into `.env` or the app.
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
   client ID and `GOOGLE_CLIENT_SECRET` with the client secret. Mark the secret as
   **Contains secret values**.
4. Deploy, then add the site URL (`https://YOUR-SITE.netlify.app`) to the OAuth client's
   **Authorized JavaScript origins**, and `https://YOUR-SITE.netlify.app/api/auth/callback` to
   its **Authorized redirect URIs** (setup step 4).
5. On your phone, open the site and use **Add to Home Screen** (iOS Safari: Share menu;
   Android Chrome: menu → **Install app**).

Deploy previews and branch deploys get their own URLs, which aren't authorized origins, so
Google sign-in only works on the production URL and localhost. Demo mode works everywhere.

### Staying signed in

On Netlify, sign-in goes through a small function, `netlify/functions/auth.ts`. You sign in
once per device and stay signed in, across closed windows and restarts, until you press
**Settings → Sign out** or remove the app's access in your Google account. The function keeps
Google's refresh token in an httpOnly, `SameSite=Strict` cookie, which page scripts can't
read, and gives the app a fresh one-hour access token whenever it needs one. The client
secret stays on Netlify.

Without the function (the plain `npm run dev` server, or `GOOGLE_CLIENT_SECRET` not set), the
app falls back to Google's token flow: a sign-in lasts about an hour and survives reloads, but
not closing the tab. To try the function locally, run `npx netlify dev` with
`GOOGLE_CLIENT_SECRET` in `.env`, and add `http://localhost:8888` and
`http://localhost:8888/api/auth/callback` to the OAuth client.

## Secrets

Nothing secret is committed. `.env` is git-ignored; `.env.example` shows the variables. An
OAuth *client ID* isn't a secret (it's visible in the browser anyway); it is kept out of git
so each deployment can use its own. The *client secret* is read only by the Netlify function,
and has no `VITE_` prefix, so it is never built into the app.

## How it's built

TypeScript, React and Vite, with `vite-plugin-pwa` for the installable, offline app shell.
No Google SDK: the sign-in function (or Google Identity Services, without it) issues the
token and the Calendar REST API is called directly.

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
