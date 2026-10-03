# Web Console and SwiftUI Parity

Reference snapshot: Sub2API web console v0.2.13, saved on 2026-10-03.

The iOS app uses native SwiftUI navigation and Liquid Glass rather than copying the desktop layout. Business capabilities and API contracts are mapped as follows.

| Web area | Native iOS implementation |
| --- | --- |
| Dashboard | Balance summary, accounts, API keys, users, request/token/cost totals, RPM/TPM, response time, time range, granularity, model distribution, group distribution, user ranking and token trend |
| Operations | Overview, realtime traffic, runtime resources, account availability, platform/user concurrency, OpenAI token state, error/throughput trends, error distribution, latency histogram, system log health, error records, log cleanup and alert resolution |
| Users | Search/sort, usage summary and trend, API keys, balance operations, status, creation, balance history, subscriptions, attributes, auth identities and platform quota management |
| Groups | Filters, CRUD, usage/capacity, pricing and limits, routing policy, image/peak settings, duplication, composite routes, model allowlist candidates, user multipliers and RPM overrides |
| Accounts | Filters, CRUD, all supported web platforms, API key/OAuth/setup-token/service-account/Bedrock creation, guided authorization, Codex import, scheduling, privacy, quota, models, usage, batch refresh/delete, JSON import/export, billing probes, scheduled tests and platform-specific usage/actions |
| Subscriptions | Listing, assignment, extension, quota reset, revoke and restore |
| Announcements | Listing, creation/editing, deletion and read status |
| IP / proxies | CRUD, connection tests, quality reports, stats and related accounts |
| Redeem codes | Generation, listing, expiry and deletion |
| Promo codes | CRUD and usage records |
| Usage | Statistics, detailed records, resource/model/billing filters, pagination, cleanup task creation and cancellation |
| Audit logs | Listing, detail and TOTP-protected cleanup |
| Channels | Channel CRUD, model pricing access, monitor CRUD, immediate runs, duplication and history |
| System settings | Full settings JSON round trip, version, update check, update and restart operations |
| Personal area | Current account, profile, personal API keys, subscriptions, redeem, available channels and channel monitors when authenticated with a web JWT |

For rapidly evolving web-only fields, native forms expose a JSON override editor. Common fields remain native controls; the override is merged last so every backend field can still be submitted without waiting for an app release.

Admin API Keys can access administrator endpoints. Personal-area endpoints require a web JWT, matching the web console's authentication boundary.
