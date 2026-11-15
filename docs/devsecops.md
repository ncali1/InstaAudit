# CI/CD and security checks

Every change reaches `main` through a pull request. The "Protect main" ruleset
(`.github/rulesets/main.json`) requires the five checks below to pass, every review thread to
be resolved, and a squash merge.

## Pipeline

| Workflow | Job (check name) | What it does | Required |
| --- | --- | --- | --- |
| `ci.yml` | `test` | `npm ci`, `npm run test`, `npm run build` (includes `tsc`) | yes |
| `codeql.yml` | `Analyze (javascript-typescript)` | CodeQL static analysis, `security-extended` queries | yes |
| `security.yml` | `Secret scan (gitleaks)` | Scans commits for committed secrets | yes |
| `security.yml` | `SAST (Semgrep)` | Semgrep default, TypeScript, and React rules | yes |
| `security.yml` | `Dependency scan` | `npm audit` on runtime deps, plus dependency review of the PR diff | yes |
| `claude-review.yml` | `review`, `mention` | AI code review on PRs; replies to `@claude` | no |
| `deploy.yml` | `build`, `deploy` | On push to `main`: test, build, publish `site/` to GitHub Pages | n/a |

Dependabot (`.github/dependabot.yml`) opens weekly PRs for npm packages and GitHub Actions.

If a job is renamed, update `required_status_checks` in the ruleset too: a required check that
never reports blocks every PR.

## Triaging a failed security check

Pick one of three outcomes, and say which in the PR:

1. **Fix it.** The default. Change the code, bump the dependency, or rotate and remove the secret.
   A leaked secret must be revoked even after it is removed from the branch.
2. **False positive.** Suppress it narrowly, at the finding, with a reason:
   - Semgrep: `// nosemgrep: <rule-id>` on the line, with a comment saying why
   - gitleaks: a `.gitleaks.toml` allowlist entry for that path or pattern, or `gitleaks:allow` on the line
   - CodeQL: dismiss the alert in the Security tab as "False positive" with a note
3. **Accepted risk.** Real but not worth fixing now (for example a build-tool advisory with no
   fix). Dismiss with "Won't fix" and a note, or open an issue to track it.

Do not disable a workflow or remove a check from the ruleset to get a PR through.

## Dependency audit scope

All packages here are `devDependencies`, because the site is bundled at build time. The gating
`npm audit --omit=dev` step therefore only bites once a runtime dependency exists. The full
audit is printed in the Dependency scan job summary, and Dependabot handles build-tool advisories.
