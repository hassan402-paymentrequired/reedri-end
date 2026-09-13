-- CreateEnum
CREATE TYPE "DriverDocumentType" AS ENUM ('DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'PROOF_OF_INSURANCE', 'PROFILE_PHOTO');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- NOTE: false-positive DROP INDEX on the Unsupported-column GiST index,
-- stripped by hand — see 20260912235043_trip_status_and_refresh_tokens
-- for the full explanation. Always check for this after schema changes.

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driver_profile_id" TEXT NOT NULL,
    "type" "DriverDocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driver_profile_id_type_key" ON "driver_documents"("driver_profile_id", "type");

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
