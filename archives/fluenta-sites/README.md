# fluenta

fluenta is a private, mobile-first Spanish spaced-repetition study tool. It
uses the signed-in Sites user identity to keep one personal deck synced across
devices through Cloudflare D1 and schedules reviews with `ts-fsrs`.

## Development

```bash
npm install
npm run dev
npm run build
npm run db:generate
```

The deployed site is private. Its API reads `oai-authenticated-user-id` and
`oai-authenticated-user-email` server-side; client requests never choose the
user whose data is read or written.

## Sync API

`GET /api/state` returns the current user’s cards, review logs, settings, and
streak state. `POST /api/state` upserts the same state into D1. The endpoint is
authenticated and ownership is derived from the forwarded Sites identity.

The browser keeps a small local cache for offline recovery, but D1 is the
authoritative source whenever the site is reachable.

## Storage

- `users`, `decks`, `cards`, `review_logs`, and `study_settings` are defined in
  `db/schema.ts`.
- The D1 migrations are in `drizzle/`.
- `.openai/hosting.json` declares the logical `DB` binding.
