# Reedr Backend

Backend for an inDrive-style ride-hailing app (Nigerian market): rider/driver negotiation, PostGIS-backed matching, live tracking, and trip lifecycle over REST + WebSocket.

## Stack

- **NestJS** (TypeScript) — REST + WebSocket (Socket.io)
- **PostgreSQL + PostGIS** — geo queries via raw SQL (`ST_DWithin`), Prisma for everything else
- **Prisma 6.19** (pinned — v7/v8 moved connection config out of `schema.prisma`; not worth the churn yet)
- **Redis + BullMQ** — reliable delayed jobs for offer expiry / driver-disconnect handling, with retry+backoff
- **JWT auth** with rotating refresh tokens (rider/driver roles)
- **Structured logging** (pino via `nestjs-pino`) — pretty-printed in dev, raw JSON in production, secrets redacted
- **`@nestjs/schedule`** — daily cleanup of expired refresh tokens

## Getting started

```bash
cp .env.example .env          # defaults work with docker-compose as-is
docker compose up -d          # Postgres+PostGIS on :5433, Redis on :6380
npm install --legacy-peer-deps
npx prisma migrate deploy     # applies existing migrations (see caveat below)
npm run prisma:seed           # fake drivers scattered around Lagos
npm run start:dev
```

- API: `http://localhost:3300/api/v1`
- Swagger docs (non-production only): `http://localhost:3300/docs`
- Health check (DB + Redis): `http://localhost:3300/health`

Ports are deliberately non-default (`5433`, `6380`) to avoid clashing with any Postgres/Redis you already run locally for other projects — adjust in `docker-compose.yml` and `.env` if that's not a concern for you.

### Running the whole stack in Docker

`docker compose up -d` starts only Postgres+Redis (fast local dev with hot reload on the host). To run the app itself in a container too:

```bash
docker compose --profile full up -d --build
```

This builds `Dockerfile`, runs pending migrations via `docker-entrypoint.sh`, and serves on `:3300`.

### Why `--legacy-peer-deps`

npm 10.9.4 has a resolver bug (`Cannot read properties of null (reading 'edgesOut')`) that reliably crashes on this dependency graph. `--legacy-peer-deps` sidesteps it. All peer requirements have been manually verified compatible (see the version pins below).

### Dependency version pins (read before bumping)

Several `@nestjs/*` packages publish a "latest" major that either targets a newer `@nestjs/core` than the rest of this app (`@nestjs/swagger`) or ships as pure ESM, which breaks Jest under our CommonJS toolchain (`@nestjs/config`, `@nestjs/bullmq`, `@nestjs/event-emitter`, `@nestjs/terminus`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/schedule`). Each is pinned to its last CJS-shipping major that still supports `@nestjs/common ^11`. `nestjs-pino` is similarly pinned to its 4.x line (5.x requires pino v10, a very new major) rather than for CJS reasons. Before bumping any of these, check `require(pkg)` doesn't throw `ERR_REQUIRE_ESM` and that peer deps still list `@nestjs/common ^11.x`.

### Known npm audit findings

`npm audit` reports high-severity issues in `multer` (unused — no file-upload endpoints exist in this API, it's a dangling transitive dep of `@nestjs/platform-express`) and `deepmerge-ts` (used only by the `prisma` CLI's config loader at dev/build time, never in the running server). `npm audit fix --force` would downgrade `@nestjs/core` to v7 to "fix" this, which is worse than the problem — left as-is and worth re-checking each time these packages release a compatible major.

## Database & PostGIS

The schema uses a deliberate pattern for geo data: `pickupLat`/`pickupLng` (and `currentLat`/`currentLng` on `DriverProfile`) are the columns the app reads and writes through Prisma Client. A `geography(Point, 4326)` column on each is kept in sync automatically by a Postgres trigger (`prisma/migrations/*_postgis_geo_sync`), and a GiST index backs the actual radius queries in `MatchingService`, run via `$queryRaw` (`ST_DWithin` / `ST_Distance` — Prisma has no native GIS query support, so this one path intentionally drops to raw SQL).

**Migration caveat:** Prisma's diff engine can't see the `Unsupported("geography(...)")` columns' indexes, so every time you run `prisma migrate dev` after a schema change, it will propose `DROP INDEX ..._gist` as a false positive. Strip that line out of the generated migration by hand before applying — there's a comment in the existing migration explaining this.

## Architecture notes

- **Matching logic lives entirely in `MatchingService`** — nothing else queries geo data directly.
- **Domain services never touch Socket.io.** They emit typed domain events (`src/common/events/domain-events.ts`) via `EventEmitter2`; `RealtimeGateway` is the only class that knows about rooms/event names on the wire. This keeps `RideRequestsService`, `OffersService`, etc. unit-testable without a running Socket.io server.
- **Offer expiry and driver-disconnect handling run through BullMQ**, not in-process timers — they survive a server restart and work correctly once this runs as more than one instance.
- **The `activeTripRiderByDriver` map and the WS rate limiters in `RealtimeGateway` are in-memory and single-process.** They exist so location pings don't hit the DB on every message, and so WS messages (which sit outside `ThrottlerGuard`'s reach — it only instruments HTTP) have *some* backpressure. Once this runs across multiple instances, all of this needs to move to Redis, along with Socket.io itself needing a Redis adapter — the spec calls this out as expected future work, not a bug today.
- **Refresh tokens are opaque random strings, hashed (SHA-256) at rest, rotated on every use.** Not JWTs — this makes individual-session revocation possible, which a stateless JWT refresh token doesn't give you. Expired ones are swept nightly by `TokenCleanupService` (`@Cron`, 3am) so the table doesn't grow forever.
- **BullMQ jobs retry** (3 attempts, exponential backoff) — both job handlers re-check state before mutating, so retrying a failed attempt is always safe.
- **CORS is env-driven** (`CORS_ORIGIN`, comma-separated) on both HTTP and the WebSocket gateway, defaulting to `*` when unset. The gateway reads it from `process.env` directly rather than `ConfigService`, because `@WebSocketGateway()`'s options are fixed at class-definition time, before Nest's DI container exists — `import 'dotenv/config'` as the first line of `main.ts` guarantees `.env` is loaded before that decorator runs. If you ever split the gateway into its own file that's imported before `main.ts` runs that import, this breaks silently (origin falls back to `*`) — worth a test if this area gets touched.

## WebSocket protocol

Connect with `io(url, { auth: { token: accessToken } })`. Unauthenticated connections are rejected immediately.

Per-connection rate limits (in-memory, see the architecture note above): `ride:offer:submit` and `ride:offer:accept` at 5 per 5s, `driver:location:update` at 3 per 1s. Exceeding submit/accept emits an `error` event back to the sender; excess location pings are silently dropped (the client will just send another shortly).

| Direction | Event | Payload |
|---|---|---|
| driver → server | `ride:offer:submit` | `{ rideRequestId, offeredFare }` |
| rider → server | `ride:offer:accept` | `{ offerId }` |
| driver → server | `driver:location:update` | `{ lat, lng }` |
| server → nearby drivers | `ride:request:new` | ride request summary |
| server → rider | `ride:offer:new` | the submitted/updated offer |
| server → rider | `ride:offer:expired` | `{ rideRequestId, offerId }` |
| server → both | `ride:matched` | `{ rideRequest, trip }` |
| server → rider | `driver:location:update` | `{ driverId, lat, lng }` |
| server → both | `trip:started` / `trip:completed` | `{ trip }` |
| server → affected parties | `ride:request:cancelled` | `{ rideRequestId }` |

## Testing

```bash
npm run test        # unit tests
npm run test:e2e    # e2e — needs Postgres+Redis running (docker compose up -d)
```

The unit suite (51 tests) covers every state-machine-heavy service: `OffersService` (submit/accept guards, expiry), `RideRequestsService` (create/view/cancel permission checks), `TripsService` (start/complete transitions), `MatchingService` (radius query construction), `WsRateLimiter`, plus the smaller pure-logic pieces (role guard, JWT payload validation, rating recalculation).

The e2e suite is currently a smoke test (health check + an auth boundary check) — the full negotiation-loop flow (register → match → offer → accept → track → complete → rate) and the driver-disconnect/cancellation/rate-limit edge cases have been manually verified end-to-end against the live stack (both via `npm run start:dev` and the containerized build) but aren't yet codified as automated e2e tests. That's the next thing worth adding before this goes further.

## What's explicitly out of scope (per the MVP spec)

Payments/wallet, package delivery, real driver verification (NIN/facial), SOS/emergency features, admin dashboard. `DriverProfile.isVerified` exists as a field for future use but does **not** gate matching today — there's no verification flow to ever set it, so gating on it would make every driver permanently unmatchable.
