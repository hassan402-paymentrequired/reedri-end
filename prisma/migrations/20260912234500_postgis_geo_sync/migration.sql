-- Keep the PostGIS `geography` columns in sync with their plain lat/lng
-- counterparts automatically, so the application only ever reads/writes
-- currentLat/currentLng and pickupLat/pickupLng through Prisma Client.
-- Geospatial queries (nearest driver, radius search) read the geography
-- columns directly via $queryRaw in MatchingService, backed by GiST indexes.

-- driver_profiles.location <- current_lat/current_lng
CREATE OR REPLACE FUNCTION sync_driver_location() RETURNS trigger AS $$
BEGIN
  IF NEW.current_lat IS NULL OR NEW.current_lng IS NULL THEN
    NEW.location := NULL;
  ELSE
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER driver_profiles_sync_location
  BEFORE INSERT OR UPDATE OF current_lat, current_lng ON driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_driver_location();

-- ride_requests.pickup_location <- pickup_lat/pickup_lng
CREATE OR REPLACE FUNCTION sync_ride_request_pickup_location() RETURNS trigger AS $$
BEGIN
  NEW.pickup_location := ST_SetSRID(ST_MakePoint(NEW.pickup_lng, NEW.pickup_lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ride_requests_sync_pickup_location
  BEFORE INSERT OR UPDATE OF pickup_lat, pickup_lng ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_ride_request_pickup_location();

-- Backfill any rows that existed before the triggers (no-op on a fresh DB).
UPDATE driver_profiles SET current_lat = current_lat WHERE current_lat IS NOT NULL;
UPDATE ride_requests SET pickup_lat = pickup_lat;

-- Spatial indexes for the radius queries in MatchingService.
CREATE INDEX driver_profiles_location_gist
  ON driver_profiles USING GIST (location)
  WHERE is_online = true;

CREATE INDEX ride_requests_pickup_location_gist
  ON ride_requests USING GIST (pickup_location);
