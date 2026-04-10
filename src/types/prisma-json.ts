/* eslint-disable @typescript-eslint/no-explicit-any */
/** Json type for Prisma JSON field assignments - matches Prisma.InputJsonValue */
export type Json = string | number | boolean | null | { [key: string]: string | number | boolean | null | Json } | Json[];
