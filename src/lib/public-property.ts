import type { Prisma } from "@prisma/client";

/** Explicit catalogue allow-list: never expose credentials or internal contacts. */
export const PUBLIC_PROPERTY_SELECT = {
  id: true, name: true, slug: true, address: true, city: true, state: true,
  description: true, capacity: true, bedrooms: true, bathrooms: true,
  basePrice: true, cleaningFee: true, photos: true, coverPhoto: true,
  amenities: true, rules: true, idealGuests: true,
  maxGuests: true, extraGuestFee: true, checkInTime: true, checkOutTime: true,
} satisfies Prisma.PropertySelect;
