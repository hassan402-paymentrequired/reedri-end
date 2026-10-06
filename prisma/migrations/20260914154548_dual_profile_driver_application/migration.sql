-- CreateEnum
CREATE TYPE "ActiveProfile" AS ENUM ('RIDER', 'DRIVER');

-- CreateEnum
CREATE TYPE "DriverApplicationStatus" AS ENUM ('NOT_STARTED', 'PERSONAL_INFO_SUBMITTED', 'LICENSE_SUBMITTED', 'VEHICLE_SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- AlterEnum
ALTER TYPE "DriverDocumentType" ADD VALUE 'VEHICLE_PHOTO';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "driver_documents" DROP CONSTRAINT "driver_documents_driver_profile_id_fkey";

-- DropIndex
DROP INDEX "driver_documents_driver_profile_id_type_key";

-- DropIndex
DROP INDEX "driver_profiles_plate_number_key";

-- NOTE: `prisma migrate diff` also wanted to drop ride_requests_pickup_location_gist
-- here. That index is created in 20260912234500_postgis_geo_sync and is invisible to
-- the Prisma schema (PostGIS geography columns are Unsupported), so the diff reads it
-- as drift. Dropping it would silently turn MatchingService's radius queries into
-- sequential scans. Deliberately not dropped.

-- AlterTable
ALTER TABLE "driver_documents" DROP COLUMN "driver_profile_id",
ADD COLUMN     "driver_application_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "driver_profiles" DROP COLUMN "is_verified",
DROP COLUMN "plate_number",
DROP COLUMN "vehicle_make",
DROP COLUMN "vehicle_model",
ADD COLUMN     "driver_application_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_profile" "ActiveProfile" NOT NULL DEFAULT 'RIDER',
ALTER COLUMN "role" SET DEFAULT 'USER';

-- CreateTable
CREATE TABLE "driver_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "DriverApplicationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "full_legal_name" TEXT,
    "date_of_birth" DATE,
    "residential_address" TEXT,
    "license_number" TEXT,
    "license_expiry_date" DATE,
    "vehicle_make" TEXT,
    "vehicle_model" TEXT,
    "vehicle_year" INTEGER,
    "vehicle_color" TEXT,
    "plate_number" TEXT,
    "registration_expiry_date" DATE,
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_applications_user_id_key" ON "driver_applications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_applications_plate_number_key" ON "driver_applications"("plate_number");

-- CreateIndex
CREATE INDEX "driver_applications_status_idx" ON "driver_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driver_application_id_type_key" ON "driver_documents"("driver_application_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_driver_application_id_key" ON "driver_profiles"("driver_application_id");

-- AddForeignKey
ALTER TABLE "driver_applications" ADD CONSTRAINT "driver_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_application_id_fkey" FOREIGN KEY ("driver_application_id") REFERENCES "driver_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

