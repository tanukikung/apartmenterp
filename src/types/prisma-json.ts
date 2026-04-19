/* eslint-disable @typescript-eslint/no-explicit-any */
/** Json type for Prisma JSON field assignments - matches Prisma.InputJsonValue.
 *  Allows `undefined` in object values because Prisma silently drops them at serialization. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
