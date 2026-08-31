# Fēn · 分

Fēn is a private, collaborative money dashboard for a student year in China. It combines Tricount-style group accounting with a personal WeChat Pay and Alipay wallet, then turns both into useful year-long analytics.

## What it does

- private email/password accounts for a small invited circle;
- collaborative groups, members, equal splits, balances and settlements;
- personal WeChat Pay and Alipay CSV/XLSX imports;
- preview-before-import, duplicate detection, refunds, status handling and merchant/category normalization;
- private-by-default wallet transactions with an explicit confirmation before sharing to a group;
- yearly budget, monthly trend, category breakdown, top merchant, busiest day and recent activity;
- responsive desktop/mobile UI, background refresh on focus/online and clear loading/offline/error states;
- audit logs and idempotency protection for financial mutations.

All CNY amounts are stored as integer fen. Uploaded source files are parsed in memory and are not retained; normalized import previews expire after 15 minutes.

## Architecture

- Next.js 16, React 19, TypeScript and Tailwind CSS 4;
- Better Auth with the Drizzle adapter;
- Cloudflare Workers through Vinext;
- Cloudflare D1 and Drizzle ORM;
- Recharts for the analytical views;
- Vitest for domain, import, database-schema and security coverage.

The D1 schema covers authentication, groups and memberships, invitations, expenses and shares, settlements, personal wallet transactions, import batches, budgets, FX rates, idempotency records and audit events.

## Local development

Requirements: Node.js 22+ and a Cloudflare account for the full authenticated stack.

```bash
npm install
npm run dev
```

Without `BETTER_AUTH_SECRET`, `npm run dev` opens the realistic local design dataset at [http://localhost:3000](http://localhost:3000). This is useful for UI work without touching personal data.

For the full Workers/D1 runtime, create an uncommitted `.dev.vars`:

```dotenv
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=http://localhost:3001
PRIVATE_SIGNUP_EMAILS=owner@example.com
PRIVATE_SIGNUP_BOOTSTRAP_TOKEN=<at-least-32-random-characters>
```

Then prepare and start the Vinext runtime:

```bash
npx wrangler d1 migrations apply DB --local
npm run dev:vinext
```

The owner bootstrap URL is `/join?token=<PRIVATE_SIGNUP_BOOTSTRAP_TOKEN>&email=<allowlisted-email>`. After that first account exists, create groups and privately share the generated invitation links with friends. There is intentionally no email-delivery provider for this small private deployment.

## Database changes

```bash
npx drizzle-kit check
npx drizzle-kit generate
npx wrangler d1 migrations apply DB --local
```

Never edit a migration that has already been applied remotely; add a new one.

## Verification

```bash
npm run lint
npx next typegen && npm run typecheck
npm test -- --run
npx drizzle-kit check
npx wrangler types --check
npm run build
```

## Cloudflare deployment

The repository contains separate D1 bindings for preview and production.

```bash
# Preview
npx wrangler d1 migrations apply DB --remote --env preview
npm run deploy:preview

# Production
npx wrangler d1 migrations apply DB --remote
npm run deploy:vinext
```

Configure `BETTER_AUTH_SECRET`, `PRIVATE_SIGNUP_EMAILS` and `PRIVATE_SIGNUP_BOOTSTRAP_TOKEN` with `wrangler secret put` in each environment. `BETTER_AUTH_URL` and the D1 bindings are declared in `wrangler.jsonc`; secrets must never be committed.

Production is configured for `https://fen.gregor-sternat.com`. Preview uses the isolated `fen-tricount-china-preview` worker and D1 database.
