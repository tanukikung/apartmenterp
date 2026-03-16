export const config = {
  // Application
  app: {
    name: 'Apartment ERP',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // LINE
  line: {
    channelId: process.env.LINE_CHANNEL_ID || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    accessToken: process.env.LINE_ACCESS_TOKEN || '',
    userId: process.env.LINE_USER_ID || '',
  },

  // Auth
  auth: {
    secret: process.env.NEXTAUTH_SECRET || '',
    url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },

  // Billing defaults
  billing: {
    billingDay: 1,
    dueDay: 5,
    overdueDay: 15,
  },

  // Building defaults
  building: {
    totalFloors: 8,
  },
};

export type AppConfig = typeof config;
