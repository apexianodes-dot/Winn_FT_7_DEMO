# WINN FT 7 — Replit development setup

This is the imported React/Vite frontend and Express/PostgreSQL API. Preserve the existing `apps/web`, `apps/api`, and `db` structure. This app is demo-only: credits are fictional, non-convertible, and no real-money payments or prizes are enabled.

## Running

Use the **Start application** workflow. It runs both existing npm development scripts:
- Frontend: `npm --prefix apps/web run dev`, listening on `0.0.0.0:5000`.
- API: `NODE_ENV=development PORT=4000 npm --prefix apps/api run dev`.

Vite proxies `/api` to the local Express server. Browser API requests use relative URLs; no public backend URL is required.

Dependencies are installed separately in `apps/web` and `apps/api`. Their package-lock files pin the installed versions.

## Database and secrets

The development database uses Replit's managed `DATABASE_URL`. The imported `db/schema.sql` was applied once during setup; do not run schema creation on every app start.

JWT signing uses `JWT_SECRET` if provided, otherwise the existing `SESSION_SECRET`. These values belong in Replit Secrets, never in code or committed `.env` files.

## Trying the demo

Choose **REGISTRARME**, enter a Mexican phone in `+52` plus 10 digits format, a display name, and a password of at least 10 characters. Accept the demo terms. Development registration displays the simulated verification code `123456`; no SMS is sent. New accounts receive 10,000 fictional credits.

## Checks and limitations

Build the frontend with `npm --prefix apps/web run build`. Health is available at `/api/health`.

This setup is for development, not a production launch. The demo verification endpoint is enabled only with `NODE_ENV=development`; production registration requires the SMS verification work documented in the README. No new authentication provider or payment service has been added.
