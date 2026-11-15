# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: **Security > Report a vulnerability** on this repository
(https://github.com/ncali1/InstaAudit/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You should
get a reply within a week.

## Scope

InstaAudit is a static site: everything runs in the browser and nothing is sent to a server.
Reports are especially welcome for:

- the scan scripts in `src/scripts/`, which run inside a logged-in instagram.com session
- parsing of imported files (`src/shared/parse.ts`, `src/shared/snapshot.ts`)
- anything that could make data leave the browser
