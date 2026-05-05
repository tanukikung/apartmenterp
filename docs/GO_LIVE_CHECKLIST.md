# Apartment ERP — Go-Live Configuration Checklist
# Run this checklist before going to production

## STEP 1: Alerting Env Vars (required for production)

# Slack Alerts
SLACK_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_ALERT_CHANNEL=#alerts  # optional override

# PagerDuty Alerts
PAGERDUTY_ROUTING_KEY=your-pagerduty-integration-routing-key
PAGERDUTY_EVENT_URL=https://events.pagerduty.com/v2/enqueue  # default, usually no need to change

# Add to deploy/docker-compose.prod.yml environment section:
#   SLACK_ALERT_WEBHOOK_URL: ${SLACK_ALERT_WEBHOOK_URL}
#   SLACK_ALERT_CHANNEL: ${SLACK_ALERT_CHANNEL:-#alerts}
#   PAGERDUTY_ROUTING_KEY: ${PAGERDUTY_ROUTING_KEY}

---

## STEP 2: WAL Archiving Setup (RPO < 5 min target)

# In postgresql.conf (or via Docker env POSTGRES_PASSWORD):
wal_level = replica           # already set in docker-compose.prod.yml
archive_mode = on
archive_command = 'aws s3 cp %p s3://apt-backups-${env}/pg/wal/%f'
# Or for local: archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'

# S3 bucket policy for WAL:
# {
#   "Version": "2012-10-17",
#   "Statement": [
#     {
#       "Sid": " WALRetention",
#       "Effect": "Allow",
#       "Principal": {"Service": "rds.amazonaws.com"},
#       "Action": ["s3:PutObject", "s3:PutObjectAcl"],
#       "Resource": "arn:aws:s3:::apt-backups-prod/pg/wal/*"
#     }
#   ]
# }

---

## STEP 3: Load Test (k6)

# Install k6: https://k6.io/docs/getting-started/installation/
# Run against staging before production:
APP_BASE_URL=https://staging.apt.example.com \
ADMIN_USER=owner \
ADMIN_PASS=Owner@12345 \
k6 run scripts/load-test.js

# For local dev test:
APP_BASE_URL=http://localhost:3001 \
ADMIN_USER=owner \
ADMIN_PASS=Owner@12345 \
k6 run scripts/load-test.js

---

## STEP 4: DR Drill — run these in order

# 4a. DB restore simulation
./scripts/restore.sh /path/to/latest-backup.dump.gz
# Verify: node scripts/audit-data-integrity.js

# 4b. Redis failure simulation
docker compose -f deploy/docker-compose.prod.yml restart redis
# Verify: redis-cli ping  # should return PONG

# 4c. LINE circuit breaker test
# POST /api/admin/system-health/circuit-breaker/reset (manual close after drill)

---

## STEP 5: Final sign-off

# Run integrity check
node scripts/audit-data-integrity.js

# Expected: 0 reconciliation issues, no duplicate payments, all indexes present