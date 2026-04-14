import { PrismaClient, UserRole, ReservationStatus, CleaningStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, subDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...");

  // Admin user
  const adminPass = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@rental.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@rental.com",
      password: adminPass,
      role: UserRole.ADMIN,
      phone: "(11) 99999-0000",
    },
  });

  // Owner user
  const ownerPass = await bcrypt.hash("owner123", 10);
  const owner = await prisma.user.upsert({
    where: { email: "proprietario@rental.com" },
    update: {},
    create: {
      name: "João Proprietário",
      email: "proprietario@rental.com",
      password: ownerPass,
      role: UserRole.OWNER,
      phone: "(11) 98888-1111",
    },
  });

  // Team user
  const teamPass = await bcrypt.hash("team123", 10);
  await prisma.user.upsert({
    where: { email: "equipe@rental.com" },
    update: {},
    create: {
      name: "Maria Equipe",
      email: "equipe@rental.com",
      password: teamPass,
      role: UserRole.TEAM,
      phone: "(11) 97777-2222",
    },
  });

  // Properties
  const property1 = await prisma.property.upsert({
    where: { slug: "apartamento-beira-mar" },
    update: {},
    create: {
      name: "Apartamento Beira-Mar",
      slug: "apartamento-beira-mar",
      address: "Av. Atlântica, 1200, Apto 501",
      city: "Florianópolis",
      state: "SC",
      zipCode: "88010-000",
      description: "Lindo apartamento com vista para o mar, 2 quartos.",
      capacity: 4,
      bedrooms: 2,
      bathrooms: 1,
      basePrice: 450.00,
      cleaningFee: 80.00,
      amenities: ["WiFi", "Ar-condicionado", "Piscina", "Estacionamento"],
      ownerId: owner.id,
    },
  });

  const property2 = await prisma.property.upsert({
    where: { slug: "casa-lago" },
    update: {},
    create: {
      name: "Casa do Lago",
      slug: "casa-lago",
      address: "Rua das Palmeiras, 45",
      city: "Gramado",
      state: "RS",
      zipCode: "95670-000",
      description: "Casa charmosa próxima ao lago, 3 quartos.",
      capacity: 6,
      bedrooms: 3,
      bathrooms: 2,
      basePrice: 380.00,
      cleaningFee: 100.00,
      amenities: ["WiFi", "Lareira", "Churrasqueira", "Jardim"],
      ownerId: owner.id,
    },
  });

  const property3 = await prisma.property.upsert({
    where: { slug: "studio-centro" },
    update: {},
    create: {
      name: "Studio Centro",
      slug: "studio-centro",
      address: "Rua XV de Novembro, 300, Sala 12",
      city: "Curitiba",
      state: "PR",
      zipCode: "80020-310",
      description: "Studio moderno no centro, ideal para casais.",
      capacity: 2,
      bedrooms: 1,
      bathrooms: 1,
      basePrice: 180.00,
      cleaningFee: 50.00,
      amenities: ["WiFi", "Netflix", "Ar-condicionado"],
      ownerId: owner.id,
    },
  });

  // Cleaners
  const cleaner1 = await prisma.cleaner.upsert({
    where: { id: "cleaner-1" },
    update: {},
    create: {
      id: "cleaner-1",
      name: "Ana Silva",
      phone: "(48) 99111-2233",
      email: "ana@clean.com",
      region: "Florianópolis",
    },
  });

  const cleaner2 = await prisma.cleaner.upsert({
    where: { id: "cleaner-2" },
    update: {},
    create: {
      id: "cleaner-2",
      name: "Rosa Ferreira",
      phone: "(54) 98222-3344",
      email: "rosa@clean.com",
      region: "Gramado",
    },
  });

  // Reservations
  const today = new Date();
  const res1 = await prisma.reservation.upsert({
    where: { code: "RES-001" },
    update: {},
    create: {
      code: "RES-001",
      propertyId: property1.id,
      guestName: "Carlos Mendes",
      guestEmail: "carlos@gmail.com",
      guestPhone: "(11) 98765-4321",
      guestCount: 2,
      checkIn: today,
      checkOut: addDays(today, 3),
      nights: 3,
      totalAmount: 1430.00,
      cleaningFee: 80.00,
      commission: 143.00,
      ownerAmount: 1207.00,
      status: ReservationStatus.CHECKED_IN,
      source: "AIRBNB",
      createdById: admin.id,
    },
  });

  const res2 = await prisma.reservation.upsert({
    where: { code: "RES-002" },
    update: {},
    create: {
      code: "RES-002",
      propertyId: property2.id,
      guestName: "Fernanda Lima",
      guestEmail: "fernanda@outlook.com",
      guestPhone: "(51) 97654-3210",
      guestCount: 4,
      checkIn: addDays(today, 1),
      checkOut: addDays(today, 5),
      nights: 4,
      totalAmount: 1620.00,
      cleaningFee: 100.00,
      commission: 162.00,
      ownerAmount: 1358.00,
      status: ReservationStatus.CONFIRMED,
      source: "BOOKING",
      createdById: admin.id,
    },
  });

  const res3 = await prisma.reservation.upsert({
    where: { code: "RES-003" },
    update: {},
    create: {
      code: "RES-003",
      propertyId: property3.id,
      guestName: "Pedro Costa",
      guestEmail: "pedro@gmail.com",
      guestPhone: "(41) 96543-2100",
      guestCount: 2,
      checkIn: subDays(today, 1),
      checkOut: today,
      nights: 1,
      totalAmount: 230.00,
      cleaningFee: 50.00,
      commission: 23.00,
      ownerAmount: 157.00,
      status: ReservationStatus.CHECKED_OUT,
      source: "DIRECT",
      createdById: admin.id,
    },
  });

  // Cleanings
  await prisma.cleaning.upsert({
    where: { reservationId: res3.id },
    update: {},
    create: {
      propertyId: property3.id,
      reservationId: res3.id,
      cleanerId: cleaner1.id,
      scheduledDate: today,
      checkoutTime: today,
      deadline: new Date(today.getTime() + 4 * 60 * 60 * 1000),
      status: CleaningStatus.PENDING,
    },
  });

  await prisma.cleaning.upsert({
    where: { reservationId: res1.id },
    update: {},
    create: {
      propertyId: property1.id,
      reservationId: res1.id,
      cleanerId: cleaner1.id,
      scheduledDate: addDays(today, 3),
      checkoutTime: addDays(today, 3),
      deadline: new Date(addDays(today, 3).getTime() + 4 * 60 * 60 * 1000),
      status: CleaningStatus.PENDING,
    },
  });

  // Financial transactions
  await prisma.financialTransaction.createMany({
    data: [
      {
        reservationId: res1.id,
        propertyId: property1.id,
        type: "INCOME",
        category: "RESERVATION_INCOME",
        description: "Reserva Carlos Mendes - Beira-Mar",
        amount: 1430.00,
        isPaid: true,
        paidAt: today,
        createdById: admin.id,
      },
      {
        reservationId: res1.id,
        propertyId: property1.id,
        type: "EXPENSE",
        category: "OWNER_REPASSE",
        description: "Repasse proprietário - Beira-Mar",
        amount: 1207.00,
        isPaid: false,
        dueDate: addDays(today, 7),
        createdById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Seed concluído com sucesso!");
  console.log("\n📋 Usuários criados:");
  console.log("  Admin: admin@rental.com / admin123");
  console.log("  Proprietário: proprietario@rental.com / owner123");
  console.log("  Equipe: equipe@rental.com / team123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
