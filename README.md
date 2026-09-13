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

`npm audit` reports high-severity issues in `multer` and `deepmerge-ts`. `deepmerge-ts` is only used by the `prisma` CLI's config loader at dev/build time, never in the running server — low real risk. `multer` is now actually used (driver document uploads) via `@nestjs/platform-express`'s `FileInterceptor`, which hard-pins its own nested `multer` copy — **every** 11.x release of `@nestjs/platform-express` bundles the vulnerable version, so there's no patched release to pin to yet, and bumping the root `multer` package doesn't change what `FileInterceptor` actually uses at runtime (checked: `node_modules/@nestjs/platform-express/node_modules/multer` is a separate copy). Mitigated instead via strict `limits` (`fileSize`, `files: 1`, `fields: 1`, `fieldNameSize`) and a synchronous `fileFilter` (sidesteps the async-fileFilter-race CVE entirely) on the upload endpoint — see `DriversController.uploadDocument`. `npm audit fix --force` would downgrade `@nestjs/core` to v7 to "fix" this, which is worse than the problem. Re-check when `@nestjs/platform-express` ships a patched multer.

## Database & PostGIS

The schema uses a deliberate pattern for geo data: `pickupLat`/`pickupLng` (and `currentLat`/`currentLng` on `DriverProfile`) are the columns the app reads and writes through Prisma Client. A `geography(Point, 4326)` column on each is kept in sync automatically by a Postgres trigger (`prisma/migrations/*_postgis_geo_sync`), and a GiST index backs the actual radius queries in `MatchingService`, run via `$queryRaw` (`ST_DWithin` / `ST_Distance` — Prisma has no native GIS query support, so this one path intentionally drops to raw SQL).

**Migration caveat:** Prisma's diff engine can't see the `Unsupported("geography(...)")` columns' indexes, so every time you run `prisma migrate dev` after a schema change, it will propose `DROP INDEX ..._gist` as a false positive. Strip that line out of the generated migration by hand before applying — there's a comment in the existing migration explaining this.

## Performance & capacity

**The DB connection pool, not missing caching, was the real ceiling.** Verified empirically (not theorized): with `connection_limit` unset, Prisma defaults to a small pool (~9 on an 8-core box) and 2,000 concurrent DB-bound requests hard-fail with `P2024: Timed out fetching a new connection from the connection pool`. `DATABASE_URL` now sets `connection_limit=25&pool_timeout=20` explicitly, and Postgres's `max_connections` is raised to 200 to match (`docker-compose.yml`'s `postgres` service `command`). Re-tested after the fix: 2,000 concurrent now succeeds (queues and completes in ~8.6s instead of failing). A literal, sustained 10,000 concurrent DB-bound load still exceeds this pool size and will still time out — that needs either a bigger pool + PgBouncer, multiple app instances, or fewer DB round-trips per request (see caching below). One instance with one tuned pool is not a path to 10k concurrent on its own.

**Sizing formula, read before changing either number:** `(app instances × connection_limit)` must stay comfortably under Postgres's `max_connections`, leaving headroom for migrations/admin connections. Today: 1 instance × 25 ≪ 200. Scaling to N instances means either raising `max_connections` further or fronting Postgres with PgBouncer in transaction-pooling mode (the standard fix once instance count grows — connection pooling at the proxy layer instead of N× the app-level pool).

**Caching (`src/common/cache`)**: a thin cache-aside `CacheService` (`get`/`set`/`getOrSet`) over the existing shared Redis connection — reduces DB round-trips for the hottest read, it does not fix the pool ceiling itself. First (and currently only) use: `DriversService.findIdentityByUserId`, a narrow `{id, userId}` lookup cached for 300s, used by `setOnlineStatus`, `updateLocation`, and `goOffline` — the three call sites on the driver's hottest path (a location ping every few seconds while online) that only ever needed existence + the stable id, never the volatile `isOnline`/location fields. The cache is deliberately scoped to that narrow shape so it's structurally impossible to read a stale `isOnline` or location value through it; `DriversService.findByUserId` (uncached, full row) still exists for call sites that need freshness. **Do not** apply this pattern to `MatchingService.findNearbyDrivers` — driver positions move every few seconds and matching correctness depends on reading them live; a cached "nearby driver" result could route a ride to someone who already went offline or moved away.

## Architecture notes

- **Matching logic lives entirely in `MatchingService`** — nothing else queries geo data directly.
- **Domain services never touch Socket.io.** They emit typed domain events (`src/common/events/domain-events.ts`) via `EventEmitter2`; `RealtimeGateway` is the only class that knows about rooms/event names on the wire. This keeps `RideRequestsService`, `OffersService`, etc. unit-testable without a running Socket.io server.
- **Offer expiry and driver-disconnect handling run through BullMQ**, not in-process timers — they survive a server restart and work correctly once this runs as more than one instance.
- **The `activeTripRiderByDriver` map and the WS rate limiters in `RealtimeGateway` are in-memory and single-process.** They exist so location pings don't hit the DB on every message, and so WS messages (which sit outside `ThrottlerGuard`'s reach — it only instruments HTTP) have *some* backpressure. Once this runs across multiple instances, all of this needs to move to Redis, along with Socket.io itself needing a Redis adapter — the spec calls this out as expected future work, not a bug today.
- **Refresh tokens are opaque random strings, hashed (SHA-256) at rest, rotated on every use.** Not JWTs — this makes individual-session revocation possible, which a stateless JWT refresh token doesn't give you. Expired ones are swept nightly by `TokenCleanupService` (`@Cron`, 3am) so the table doesn't grow forever.
- **BullMQ jobs retry** (3 attempts, exponential backoff) — both job handlers re-check state before mutating, so retrying a failed attempt is always safe.
- **CORS is env-driven** (`CORS_ORIGIN`, comma-separated) on both HTTP and the WebSocket gateway, defaulting to `*` when unset. The gateway reads it from `process.env` directly rather than `ConfigService`, because `@WebSocketGateway()`'s options are fixed at class-definition time, before Nest's DI container exists — `import 'dotenv/config'` as the first line of `main.ts` guarantees `.env` is loaded before that decorator runs. If you ever split the gateway into its own file that's imported before `main.ts` runs that import, this breaks silently (origin falls back to `*`) — worth a test if this area gets touched.

## Driver onboarding

Registration (`POST /auth/register`) creates the account and vehicle record, but a driver can't go online until their profile is complete:

1. Upload the 4 required documents — `POST /driver/documents` (`multipart/form-data`: `type` one of `DRIVERS_LICENSE`, `VEHICLE_REGISTRATION`, `PROOF_OF_INSURANCE`, `PROFILE_PHOTO`; `file` a JPEG/PNG/PDF, max `MAX_UPLOAD_SIZE_MB`). Re-uploading a type replaces it (old file deleted from storage).
2. `PATCH /driver/status { isOnline: true }` now checks `DriverDocumentsService.missingRequiredTypes` first and rejects with a 400 listing what's missing until all 4 are present.
3. `GET /driver/documents` lists a driver's own uploads (metadata only — never the storage key).

This is deliberately **not** real identity verification (explicitly out of scope for the MVP) — it's structural completeness only. `DriverProfile.isVerified` is a separate flag, admin-controlled, that doesn't gate anything today; it exists for a real verification workflow to hook into later.

**Admin** (`Role.ADMIN`, `/admin/drivers/*`, guarded by `RolesGuard`): list all drivers with their document/verification status (`GET /admin/drivers`), view and download a driver's uploaded documents (`GET .../documents`, `GET /admin/drivers/documents/:id/file`), and toggle `isVerified` (`PATCH .../verify`). Admins can't be created through public registration — `RegisterDto` only accepts `RIDER`/`DRIVER` (`PUBLIC_REGISTRATION_ROLES`); the first admin comes from `prisma/seed.ts` (`+2348000009999` / `password123`, dev-only).

**Storage**: files go to local disk (`UPLOAD_DIR`, default `./uploads`) behind a `StorageService` abstraction (`src/common/storage`) — swap in an S3 implementation before this ever runs on more than one instance, since local disk doesn't survive a redeploy or scale past one box. Storage keys are never exposed in API responses or served as public URLs; the only read path is the authenticated admin download endpoint, which streams through the service.

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

The unit suite (80 tests) covers every state-machine-heavy service: `OffersService` (submit/accept guards, expiry), `RideRequestsService` (create/view/cancel permission checks), `TripsService` (start/complete transitions), `MatchingService` (radius query construction), `DriversService` (online/offline completeness gate, verification, cache wiring), `DriverDocumentsService` (upload validation, replace-and-cleanup, completeness computation), `CacheService`, `WsRateLimiter`, plus the smaller pure-logic pieces (role guard, JWT payload validation, rating recalculation).

The e2e suite is currently a smoke test (health check + an auth boundary check) — the full negotiation-loop flow (register → match → offer → accept → track → complete → rate) and the driver-disconnect/cancellation/rate-limit edge cases have been manually verified end-to-end against the live stack (both via `npm run start:dev` and the containerized build) but aren't yet codified as automated e2e tests. That's the next thing worth adding before this goes further.

## What's explicitly out of scope (per the MVP spec)

Payments/wallet, package delivery, real driver identity verification (NIN/facial, police character certs), SOS/emergency features, a full admin dashboard (the minimal `/admin/drivers` endpoints exist for the onboarding review workflow, nothing more). `DriverProfile.isVerified` is admin-togglable but does **not** gate matching or accepting offers today — only document completeness does. Wiring `isVerified` into matching, or building real ID verification, is future work pending the validation research the BRD calls out.
