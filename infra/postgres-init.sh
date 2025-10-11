#!/bin/bash
# PostgreSQL initialization script
# Creates a non-superuser application role for RLS enforcement
set -e

echo "Creating application user: ${APP_DB_USER}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create non-superuser application role
    CREATE ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER;

    -- Grant database access
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
    GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};

    -- Grant table permissions (for existing tables)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};

    -- Grant future table permissions (for tables created by migrations)
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_USER};

    -- Log success
    SELECT 'Application user ${APP_DB_USER} created successfully' AS status;
EOSQL

echo "Application user setup complete"
