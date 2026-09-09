# sign-platform → signara Convergence Plan

**Status:** Draft v1 — 2026-09-09
**Owner:** Innotel
**Repo:** `innotelinc/sign-platform` (this document drives its retirement)

---

## 1. Executive summary

`sign-platform` (the OpenSign fork, branded **Signara by Innotel**, live at
`sign.innotel.us`) is a stopgap. `signara` (`innotelinc/signara`,
`/usr/src/projects/complete/signara-trust-platform`) is the strategic platform and
becomes the **single** e-signature product. Storage moves to **Onyx**
(`innotelinc/onyx-oss-platform` `onyx-objectstore`), honoring the federation rule:
*Cerulean owns trust, Onyx owns storage, Magnate owns revenue, NPM Edge owns the edge.*

This document defines the target architecture, the data migration mapping, and the
phase plan to retire `sign-platform` with zero data loss.

## 2. Current state (2026-09-09)

### sign-platform (live, stable fallback)
- Stack: Parse Server (Node 22) + MongoDB 7 + Vite/React client, docker compose on
  `192.168.1.11` at `/usr/src/sign-platform` (project `sign-platform`).
- Deployed via `https://sign.innotel.us` → nginx/openresty edge → client `:3000`,
  API `/api/app` → server `:8080`.
- Recent hardening: Signara by Innotel branding end-to-end (UI, emails, signing
  certificates), top-level error boundary, Finish-flow error surfacing,
  `cloudServerUrl` derived from `SERVER_URL` (commit `67c8756d`).
- Storage: `USE_LOCAL=true` (FS adapter → `opensign-files` volume) because the
  DigitalOcean Spaces keys are invalid. Files served via JWT-tokenized
  `/files/...?token=` URLs.
- Signing: self-signed PFX (`CN=Signara by Innotel`) via `PFX_BASE64`/`PASS_PHRASE`.
- Verified: full API-level E2E sign test passed (upload → signPdf → digital
  signature `/ByteRange` → DocumentHash → signed completion certificate).

### signara (target, currently stopped)
- Stack: Next.js web (`apps/web`) + NestJS API (`apps/api`) + PostgreSQL via Prisma
  (`packages/database`) + Redis + Meilisearch + Authentik-native SSO, AGPL-3.0.
- Storage: `apps/api/src/storage/minio.service.ts` — MinIO client against any
  S3-compatible endpoint; tenant-scoped keys `{orgId}/{resource}/{uuid}.{ext}`;
  separate internal/public signing endpoints; bucket default `signara-documents`.
- Core Prisma models: `User, Organization, Membership, Workspace, Document,
  DocumentVersion, Template, TemplateField, SigningRequest, Signer, Signature,
  SignatureEvent, WorkflowRule, SigningCertificate, AuditLog, Notification, Billing…`
- Compose project `signara` currently **down** (stopped 2026-09-08; restart with
  `docker compose -p signara -f docker-compose.prod.yml -f
  docker-compose.override.prod.yml up -d`).

### onyx (storage provider)
- `services/objectstore` (`onyx-objectstore`): **S3-compatible** Go service,
  HTTP listener `0.0.0.0:9000` (public face e.g. `storage.onyx.innotel.us`),
  `S3_ACCESS_KEY` / `S3_SECRET_KEY` (supports `infisical://<name>` references),
  hybrid-cloud endpoint option, state in `onyx-objectstore-state` volume.
- **v0.1 limitation (verified 2026-09-09):** the S3 HTTP endpoint authenticates
  with **HTTP Basic auth only** — AWS SigV4 request signing and presigned URLs
  are explicitly deferred to the S3-gateway milestone (see
  `services/objectstore/http.go`). Consequence: MinIO/AWS SDK clients and
  browser presigned flows **cannot** talk to it yet; onyx is usable today via
  plain S3 REST calls (server-side workers, `mc`-style tools, the ETL), but the
  signara SDK cutover must wait for SigV4. Verified working: bucket
  create/put/get/list/delete against host port 2090
  (`scripts/onyx-objectstore-smoke.sh` in the signara repo).

## 3. Target architecture

```
                    ┌─────────────┐
  users ── HTTPS ──▶  NPM Edge    │
                    └──────┬──────┘
                           │
        sign.innotel.us ───▶ signara web (Next.js)
                           │
                    signara API (NestJS)
                    ├── Postgres   (documents, envelopes, audit)
                    ├── Redis      (queue)
                    ├── Meilisearch(search)
                    └── onyx-objectstore (S3)   ◀── replaces MinIO + DO Spaces
                           │
        Authentik (Cerulean) ── identity/SSO for staff + signers where applicable
```

- **signara keeps its MinIO client**; it simply points at the Onyx endpoint
  (`s3.endpoint = http://<host>:9000`, `s3.publicEndpoint = https://storage…`,
  path-style, bucket `signara-documents`). No SDK change required — Onyx is
  S3-compatible by design.
- **sign-platform storage** (`opensign-files` volume) is migrated into the same
  bucket under a `legacy/sign-platform/` prefix so completed documents remain
  downloadable from signara after cutover.

## 4. Data migration mapping (MongoDB → PostgreSQL)

| sign-platform (Parse/Mongo)         | signara (Prisma/Postgres)                          |
|-------------------------------------|----------------------------------------------------|
| `_User` / `contracts_Users`         | `User` (+ `Organization`, `Membership`)            |
| `partners_Tenant`                   | `Organization` / `Setting` (branding, PFX, mail)   |
| `contracts_Document`                | `Document` (+ `DocumentVersion` for the original)  |
| `contracts_Document.Placeholders`   | `TemplateField` / `SigningRequest`                 |
| `contracts_Contactbook` / `Signers` | `Signer`                                           |
| `AuditTrail` (JSON array on doc)    | `SignatureEvent` + `AuditLog` (one row per entry)  |
| `SignedUrl`, `URL`, `CertificateUrl`| object **keys** in Onyx (store keys, never URLs)   |
| `contracts_Signature`               | `Signature` (+ asset object key)                   |
| Email templates / prefs             | `Setting`                                          |
| Files in `opensign-files` volume    | Onyx bucket under `legacy/sign-platform/{docId}/…` |

Notes:
- Mongo JSON blobs (Placeholders, AuditTrail, WidgetsData) are untyped; the ETL
  must normalize into relational rows and reject/flag malformed legacy entries.
- Original (unsigned) PDFs live in `URL`; signed in `SignedUrl`; certificates in
  `CertificateUrl` — all currently local-mode paths with JWT query params. Strip
  tokens during ETL; re-derive access via signara's presigned-URL flow.
- `DocumentHash` (sha256 of signed bytes) maps to a `DocumentVersion.hash` column —
  keep it; it anchors tamper-evidence across the migration.

## 5. Storage cutover to Onyx (phased)

0. **[DONE 2026-09-09]** `onyx-objectstore` deployed standalone (compose service
   `onyx-platform-onyx-objectstore-1`, host port `2090` → container `9000`;
   `:9000` itself is taken by Authentik on this host). Static S3 credentials
   generated and stored in onyx `.env`; bucket `signara-documents` created;
   Basic-auth REST round-trip green. Smoke test saved at
   `signara-trust-platform/scripts/onyx-objectstore-smoke.sh`.
1. **[BLOCKED on onyx S3-gateway milestone]** SDK-grade SigV4 + presigned URLs.
   Track upstream; until then onyx serves batch/ETL workloads only.
2. **Wire signara** → `S3_ENDPOINT` at Onyx (compose override; signara's compose
   hardcodes `http://minio:9000`, so an override file must set the API env
   `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`). Run
   the API test suite against it (upload/presign/download/delete round-trip).
   **Do this only after step 1.**
3. **Migrate legacy files:** copy the `opensign-files` volume contents into
   `signara-documents/legacy/sign-platform/` (can start on Basic-auth REST
   today); verify a sample of signed PDFs + certificates byte-for-byte
   (sha256 vs `DocumentHash`).
4. **Cutover:** signara prod reads/writes only Onyx. MinIO container in the signara
   compose file becomes optional dev-only.
5. **Decommission:** DO Spaces keys revoked (they are already invalid); OpenSign
   `USE_LOCAL` mode retired with the stack.

## 6. Phase plan

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| P0 — Freeze | sign-platform is stable fallback; backups of Mongo dump + `opensign-files` volume scheduled | nightly backup verified restorable |
| P1 — Parity | signara MVP parity checklist: send-for-signature envelope, guest signing flow, templates, completion email, audit trail/certificate, Signara branding, Authentik SSO, SMTP | feature checklist passes on staging |
| P2 — Onyx | signara storage = onyx-objectstore (dev → prod). **Status: partially blocked** — onyx v0.1 lacks SigV4/presigned URLs (S3-gateway milestone); object store itself deployed and REST-verified | round-trip tests green; presigned public URLs work |
| P3 — Migration | ETL: Mongo → Postgres, files → Onyx legacy prefix | counts reconcile; spot-check hashes; pilot tenant reads own history in signara |
| P4 — Cutover | point `sign.innotel.us` at signara; sign-platform scaled down but imageable for 30 days | signers sign successfully on signara |
| P5 — Retire | sign-platform archived; repo marked frozen; volumes kept until backup retention elapses | sign-platform containers removed |

## 7. Risks & mitigations

- **Schema impedance** (JSON arrays → relational): ETL with validation report;
  keep a `legacy_ref` column storing the original Mongo `objectId` for traceability.
- **Certificate continuity:** per-tenant PFX lives in `partners_Tenant.PfxFile`;
  migrate into `SigningCertificate` (or `Setting`) before cutover so historical
  verification still chains. Global PFX (`PFX_BASE64`) → platform default cert.
- **File URL semantics:** Parse `?token=` URLs expire; all legacy links must be
  rewritten to keys + presigned generation at read time.
- **Mail sender reputation:** keep the same `MAILGUN_SENDER`/SMTP identity across
  cutover so completion emails don't land in spam.
- **Edge/DNS:** `sign.innotel.us` vhost move is a config change on NPM Edge; do it
  in a maintenance window, keep old upstream ready for instant rollback.
- **Adoption shock:** run P4 as dual-read (signara serves history; new envelopes
  only in signara) for one week before disabling sign-platform signers.

## 8. Immediate next actions

- [x] Nightly backups on `.11` (2026-09-09): `/usr/local/bin/sign-platform-backup.sh`
      + cron 02:30 — `mongodump` archive + documents-volume tarball, 14-day
      retention, first run verified restorable (gzip integrity + content list).
- [x] Bring signara stack back up and green on this host (2026-09-09): compose
      project `signara`, api + frontend healthy, migrations clean. Currently on
      bundled MinIO until P2 unblocks.
- [x] Stand up `onyx-objectstore` (2026-09-09): host port 2090, credentials in
      onyx `.env`, `signara-documents` bucket created, REST round-trip green.
      **SigV4/presigned gap documented above (P2 blocker).**
- [ ] Write the P3 ETL script (`scripts/migrate-sign-platform/`) in the signara
      repo: Mongo reader → Prisma writer → Onyx uploader + verification report
      (ETL can use onyx Basic-auth REST today).
- [ ] Track/land the onyx S3-gateway (SigV4 + presigned URLs) milestone.
- [ ] Define the signara parity checklist (P1) as GitHub issues in `innotelinc/signara`.

---
*Companion docs: signara `docs/Architecture.md`, `docs/Deployment.md`,
`docs/DisasterRecovery.md`; onyx `docs/design/05-storage-subsystem.md`.*
