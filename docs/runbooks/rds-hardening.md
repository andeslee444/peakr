# RDS Hardening Runbook

> ⚠️ **SUPERSEDED (2026-06-10): peakr no longer uses RDS.** The `peakr-db` RDS
> instance was deleted (final snapshot `final-peakr-db…`, Apr 30 2026; confirmed
> via NXDOMAIN on its endpoint). peakr now runs on **Neon Postgres**, provisioned
> through the Vercel↔Neon integration: TLS-only, no public 5432 port, credentials
> managed by the integration and rotated in the Neon console. The RDS-specific
> hardening below (public-access lockdown, master-password rotation, Terraform
> ingress) **no longer applies** — it's kept for history and in case RDS is ever
> reintroduced. App-side TLS is handled by `buildSslConfig` (verifies the cert for
> any remote host, including Neon). To rotate Neon credentials: Neon console →
> project → Roles → reset password (Vercel auto-updates the managed env vars).

---

> Prepared by the launch-hardening pass. These steps touch **live production
> infrastructure** and your AWS credentials, so they are documented here for you
> to apply rather than applied automatically. Do them in a maintenance window.

The audit found the RDS instance is internet-exposed (`0.0.0.0/0` on 5432), has a
weak master password, no usable backups, no deletion protection, and the app
connected with TLS verification disabled. The Terraform in `terraform/` and the
app code (`src/lib/db.ts` / `src/lib/db-ssl.ts`) have been updated; this runbook
covers the parts that must be applied by hand.

## 1. Rotate the master password (highest priority)

The current password is a short dictionary word stored in `terraform.tfstate`.

```bash
NEW_PW=$(openssl rand -base64 24)
# Apply via Terraform (preferred — keeps state consistent):
cd terraform
terraform apply -var "db_password=$NEW_PW"
# …or in the AWS console: RDS → peakr-db → Modify → New master password → Apply immediately
```

Then update `DATABASE_URL` everywhere it is used:
- Vercel: Project → Settings → Environment Variables → `DATABASE_URL` (Production + Preview)
- Mac Mini: the daemon's environment / `.env`

## 2. Enforce TLS certificate validation

The app no longer uses `rejectUnauthorized: false`. By default it now verifies the
server certificate against Node's trust store (newer RDS certs chain to Amazon
Root CA 1, which is trusted). To pin the RDS CA bundle explicitly:

```bash
curl -o rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
# Set DATABASE_CA_CERT to the file contents in Vercel + Mac Mini env.
```

`DATABASE_SSL_INSECURE=true` exists only as a temporary escape hatch — do not set
it in production.

## 3. Decide the connectivity model, then lock down ingress

Vercel functions have **dynamic egress IPs**, so you cannot simply allowlist them.
Pick one:

| Option | What to do | Tradeoff |
|---|---|---|
| **A. Pooled provider** (recommended) | Move the DB to Neon/Supabase/RDS Proxy with a connection pooler; point `DATABASE_URL` at the pooler. | Best fit for serverless; fixes pool exhaustion too. |
| **B. RDS Proxy + PrivateLink** | Front RDS with RDS Proxy; connect Vercel via a private path. | More AWS plumbing. |
| **C. Keep public, harden** | Strong password (step 1) + TLS verify (step 2) + allowlist only the Mac Mini IP for direct access; rely on credentials for Vercel. | Endpoint still public; weakest. |

Once a private path exists, narrow ingress and disable the public endpoint:

```bash
cd terraform
terraform apply \
  -var 'allowed_cidr_blocks=["<MAC_MINI_IP>/32"]' \
  -var 'db_publicly_accessible=false' \
  -var "db_password=$NEW_PW"
```

## 4. Backups & deletion protection (safe to apply now)

`terraform/main.tf` now sets `backup_retention_period = 7`, `skip_final_snapshot =
false` (final snapshot `peakr-db-final-snapshot`), `deletion_protection = true`,
and `copy_tags_to_snapshot = true`. `terraform apply` enables these without
affecting connectivity. Consider also enabling automated snapshots export and a
longer retention if data volume warrants.

## 4b. Move Terraform state off the laptop

`terraform/terraform.tfstate` holds the DB password in plaintext. It is gitignored
(never committed — verified), but it still lives in the working tree. Move it to a
remote backend so the secret isn't sitting on disk and state is shared safely:

```hcl
# terraform/backend.tf
terraform { backend "s3" { bucket = "peakr-tfstate" key = "rds.tfstate" region = "us-east-1" encrypt = true } }
```
Then `terraform init -migrate-state`. After rotating the password (step 1), the old
local state still contains the old secret — delete it once migrated.

## 5. Verify

```bash
psql "$DATABASE_URL" -c "select 1"                 # connects with TLS
aws rds describe-db-instances --db-instance-identifier peakr-db \
  --query 'DBInstances[0].{public:PubliclyAccessible,backup:BackupRetentionPeriod,delete:DeletionProtection}'
```
