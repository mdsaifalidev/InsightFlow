#!/bin/sh
# Runs once, on first start of an empty data volume.
# Creates one schema per service and a role that can only write its own schema
# (ADR-006). Migrations (drizzle-kit / Alembic) create the tables later.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v auth_user="$AUTH_DB_USER" \
  -v auth_password="$AUTH_DB_PASSWORD" \
  -v data_user="$DATA_DB_USER" \
  -v data_password="$DATA_DB_PASSWORD" \
  -v db_name="$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE :"auth_user" LOGIN PASSWORD :'auth_password';
CREATE ROLE :"data_user" LOGIN PASSWORD :'data_password';

GRANT CONNECT ON DATABASE :"db_name" TO :"auth_user", :"data_user";
-- Migration tools run CREATE SCHEMA IF NOT EXISTS, and Postgres checks this
-- privilege before the existence check. Isolation still holds: each role
-- owns only its schema and has no rights on the other's (ADR-006).
GRANT CREATE ON DATABASE :"db_name" TO :"auth_user", :"data_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Each service owns its schema, so its migrations can create objects there.
CREATE SCHEMA auth AUTHORIZATION :"auth_user";
CREATE SCHEMA analytics AUTHORIZATION :"data_user";

-- Keep each role's search_path on its own schema.
ALTER ROLE :"auth_user" SET search_path = auth, public;
ALTER ROLE :"data_user" SET search_path = analytics, public;
SQL

echo "InsightFlow: created schemas auth, analytics and roles $AUTH_DB_USER, $DATA_DB_USER"
