import {
  ActiveProfile,
  DriverApplicationStatus,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// A spread of coordinates around Lagos Island / Mainland for local testing.
const LAGOS_DRIVERS = [
  { name: 'Tunde Bakare', lat: 6.4531, lng: 3.3958, area: 'Yaba' },
  { name: 'Ifeoma Chukwu', lat: 6.4281, lng: 3.4219, area: 'Ikoyi' },
  { name: 'Segun Adeyemi', lat: 6.5833, lng: 3.35, area: 'Ikeja' },
  { name: 'Blessing Okafor', lat: 6.4698, lng: 3.5852, area: 'Lekki' },
  { name: 'Musa Abdullahi', lat: 6.455, lng: 3.3841, area: 'Surulere' },
];

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // Admins can't self-register (see RegisterDto) — this is the only way to
  // create one. Dev-only credential; never reuse this password anywhere real.
  // TODO(admin-portal): admins move to their own admin_users table; this
  // seeded users-table row with Role.ADMIN goes away with it.
  await prisma.user.upsert({
    where: { phone: '+2348000009999' },
    update: {},
    create: {
      name: 'Reedr Admin',
      phone: '+2348000009999',
      password: passwordHash,
      role: Role.ADMIN,
    },
  });
  console.log('Seeded admin user: +2348000009999 / password123');

  for (const [i, d] of LAGOS_DRIVERS.entries()) {
    const phone = `+234800000${String(i).padStart(4, '0')}`;
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        name: d.name,
        phone,
        password: passwordHash,
        activeProfile: ActiveProfile.DRIVER,
      },
    });

    // Fabricates the end state of the driver application flow — an already
    // verified application plus the profile its approval would have created.
    // Fine for seed data, not a path real drivers can take: no documents are
    // uploaded and no review happened (see DriverApplicationService.review).
    const application = await prisma.driverApplication.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        status: DriverApplicationStatus.VERIFIED,
        fullLegalName: d.name,
        dateOfBirth: new Date('1990-01-01'),
        residentialAddress: `${d.area}, Lagos`,
        licenseNumber: `LSD-SEED-${String(i).padStart(4, '0')}`,
        licenseExpiryDate: new Date('2030-01-01'),
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleYear: 2018,
        vehicleColor: 'Silver',
        plateNumber: `LAG-${100 + i}-XY`,
        registrationExpiryDate: new Date('2030-01-01'),
        submittedAt: new Date(),
        reviewedAt: new Date(),
      },
    });

    await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: { currentLat: d.lat, currentLng: d.lng, isOnline: true },
      create: {
        userId: user.id,
        driverApplicationId: application.id,
        isOnline: true,
        currentLat: d.lat,
        currentLng: d.lng,
      },
    });
  }

  console.log(`Seeded ${LAGOS_DRIVERS.length} fake drivers around Lagos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
