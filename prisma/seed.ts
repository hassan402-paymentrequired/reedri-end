import { PrismaClient, Role } from '@prisma/client';
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

  for (const [i, d] of LAGOS_DRIVERS.entries()) {
    const phone = `+234800000${String(i).padStart(4, '0')}`;
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        name: d.name,
        phone,
        password: passwordHash,
        role: Role.DRIVER,
      },
    });

    await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: { currentLat: d.lat, currentLng: d.lng, isOnline: true },
      create: {
        userId: user.id,
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        plateNumber: `LAG-${100 + i}-XY`,
        isOnline: true,
        isVerified: true,
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
