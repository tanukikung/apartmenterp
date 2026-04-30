/**
 * @deprecated Import from @/lib/config/env.ts for runtime config.
 * This file is kept only for static app metadata used by legacy services.
 */
export const config = {
  app: {
    name: process.env.APP_NAME || 'Apartment ERP',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
  },
};
