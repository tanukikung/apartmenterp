# Apartment ERP — PostgreSQL 16 with WAL archiving
# Based on postgres:16-alpine with awscli for S3 WAL archiving
#
# Build:
#   docker build -f deploy/postgres/Dockerfile -t apartment-erp-postgres:latest .
#
# Or pull from GHCR (if published):
#   docker pull ghcr.io/your-org/apartment-erp-postgres:latest

FROM postgres:16-alpine

# Install awscli + curl for WAL archiving to S3
# (alpine version of postgres doesn't have awscli)
RUN apk add --no-cache \
    aws-cli \
    curl \
    && mkdir -p /var/log/postgres \
    && chmod 777 /var/log/postgres

# Copy the archive helper script
COPY wal-g-archive.sh /usr/local/bin/wal-g-archive.sh
RUN chmod +x /usr/local/bin/wal-g-archive.sh

# Create the postgres run directory for the log
RUN mkdir -p /var/run/postgresql && chmod 777 /var/run/postgresql

# Expose default postgres port
EXPOSE 5432

# No CMD — use docker-compose command override to pass custom wal_level + archive settings