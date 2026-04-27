-- Apartment ERP: Initial database setup
-- This runs automatically on first container start

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Optional: Log slow queries for monitoring
ALTER DATABASE test SET log_min_duration_statement = '1000';

-- Create monitoring role (read-only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor') THEN
    CREATE ROLE monito_user WITH LOGIN PASSWORD 'monitor_pass';
    GRANT CONNECT ON DATABASE test TO monito_user;
    GRANT USAGE ON SCHEMA public TO monito_user;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO monito_user;
  END IF;
END
$$;