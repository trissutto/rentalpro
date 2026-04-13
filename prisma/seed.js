const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // Admin
  const adminPass = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@rental.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@rental.com",
      password: adminPass,
      role: "ADMIN",
      phone: "(11) 99999-0000",
    },
  });

  // Proprietário
  const ownerPass = await bcrypt.hash("owner123", 10);
  const owner = await prisma.user.upsert({
    where: { email: "proprietario@rental.com" },
    update: {},
    create: {
      name: "João Proprietário",
      email: "proprietario@rental.com",
      password: ownerPass,
      role: "OWNER",
      phone: "(11) 98888-1111",
    },
  });

  // Equipe
  const teamPass = await bcrypt.hash("team123", 10);
  await prisma.user.upsert({
    where: { email: "equipe@rental.com" },
    update: {},
    create: {
      name: "Maria Equipe",
      email: "equipe@rental.com",
      password: teamPass,
      role: "TEAM",
      phone: "(11) 97777-2222",
    },
  });

  // Imóveis
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
      description: "Lindo apartamento com vista para o mar.",
      capacity: 4,
      bedrooms: 2,
      bathrooms: 1,
      basePrice: 450.0,
      cleaningFee: 80.0,
      amenities: JSON.stringify(["WiFi", "Ar-condicionado", "Piscina"]),
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
      description: "Casa charmosa próxima ao lago.",
      capacity: 6,
      bedrooms: 3,
      bathrooms: 2,
      basePrice: 380.0,
      cleaningFee: 100.0,
      amenities: JSON.stringify(["WiFi", "Lareira", "Churrasqueira"]),
      ownerId: owner.id,
    },
  });

  const property3 = await prisma.property.upsert({
    where: { slug: "studio-centro" },
    update: {},
    create: {
      name: "Studio Centro",
      slug: "studio-centro",
      address: "Rua XV de Novembro, 300",
      city: "Curitiba",
      state: "PR",
      capacity: 2,
      bedrooms: 1,
      bathrooms: 1,
      basePrice: 180.0,
      cleaningFee: 50.0,
      amenities: JSON.stringify(["WiFi", "Netflix", "Ar-condicionado"]),
      ownerId: owner.id,
    },
  });

  // Faxineiras
  await prisma.cleaner.upsert({
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

  await prisma.cleaner.upsert({
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

  // Reservas
  const today = new Date();
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

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
      totalAmount: 1430.0,
      cleaningFee: 80.0,
      commission: 143.0,
      ownerAmount: 1207.0,
      status: "CHECKED_IN",
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
      totalAmount: 1620.0,
      cleaningFee: 100.0,
      commission: 162.0,
      ownerAmount: 1358.0,
      status: "CONFIRMED",
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
      checkIn: addDays(today, -1),
      checkOut: today,
      nights: 1,
      totalAmount: 230.0,
      cleaningFee: 50.0,
      commission: 23.0,
      ownerAmount: 157.0,
      status: "CHECKED_OUT",
      source: "DIRECT",
      createdById: admin.id,
    },
  });

  // Limpezas
  await prisma.cleaning.upsert({
    where: { reservationId: res3.id },
    update: {},
    create: {
      propertyId: property3.id,
      reservationId: res3.id,
      cleanerId: "cleaner-1",
      scheduledDate: today,
      checkoutTime: today,
      deadline: new Date(today.getTime() + 4 * 3600000),
      status: "PENDING",
    },
  });

  await prisma.cleaning.upsert({
    where: { reservationId: res1.id },
    update: {},
    create: {
      propertyId: property1.id,
      reservationId: res1.id,
      cleanerId: "cleaner-1",
      scheduledDate: addDays(today, 3),
      deadline: new Date(addDays(today, 3).getTime() + 4 * 3600000),
      status: "PENDING",
    },
  });

  // Financeiro
  await prisma.financialTransaction.create({
    data: {
      reservationId: res1.id,
      propertyId: property1.id,
      type: "INCOME",
      category: "RESERVATION_INCOME",
      description: "Reserva RES-001 - Carlos Mendes",
      amount: 1430.0,
      isPaid: true,
      paidAt: today,
      createdById: admin.id,
    },
  });

  await prisma.financialTransaction.create({
    data: {
      reservationId: res1.id,
      propertyId: property1.id,
      type: "EXPENSE",
      category: "OWNER_REPASSE",
      description: "Repasse proprietário - Beira-Mar",
      amount: 1207.0,
      isPaid: false,
      createdById: admin.id,
    },
  });

  console.log("✅ Seed concluído!");
  console.log("\n📋 Usuários:");
  console.log("  Admin:        admin@rental.com / admin123");
  console.log("  Proprietário: proprietario@rental.com / owner123");
  console.log("  Equipe:       equipe@rental.com / team123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
