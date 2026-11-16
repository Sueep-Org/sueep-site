# Deploys, migrations and secrets

How to ship changes to sueep.com / app.sueep.com safely. Read the "Database and migrations" section of the [README](README.md) first: **local dev and the live site share one database.**

## Normal deploy

1. Work on a branch. Run `npm run lint` and `npx tsc --noEmit`, and try the change locally (`npm run dev`).
2. If the change has a migration, make sure it only **adds** things (new tables, nullable columns, indexes) and that `prisma/schema.prisma` matches.
3. Open a pull request into `main` on GitHub (`Sueep-Org/sueep-site`) and merge it.
4. Vercel builds automatically. The build runs `prisma migrate deploy && prisma generate && next build`, so **pending migrations are applied to the live database during the build**. A migration that fails, fails the deploy.
5. Check the deploy (below).

Preview deploys (other branches or PRs) run the same build. Because they point at the same database, **a preview deploy applies its migrations to the live database too.** Don't push a branch with an unfinished migration.

## Applying a migration before the deploy

Sometimes a migration has to exist before the code ships, e.g. so local dev works:

```bash
npx prisma migrate deploy                     # applies every pending migration in prisma/migrations
# or, for SQL you ran by hand:
npx prisma db execute --file prisma/migrations/<folder>/migration.sql
npx prisma migrate resolve --applied <folder>
npx prisma migrate status                     # should say "Database schema is up to date"
```

Never run `migrate dev`, `migrate reset`, or `db push --force-reset` against this database, and never use its URL as a shadow database.

## After every deploy

- Vercel → Deployments: the build is green.
- Open `app.sueep.com`, sign in, and open the page you changed.
- Vercel → Logs: no new errors in the first few minutes.
- If you touched email: ERP → Email Log shows the sends.
- If you touched a cron: Vercel → Settings → Cron Jobs → run it once, or wait for the next run, and check its log.

## Rollback

Vercel → Deployments → pick the last good deployment → **Promote to Production** (or `vercel promote <url>`). The rollback is instant.

Migrations are **not** rolled back. Since migrations only add things, the older code keeps working against the newer schema. If a migration itself was wrong, write a new migration that fixes it. Don't edit or delete an applied one.

## Environment variables

- Every variable is listed and explained in [.env.example](.env.example).
- Set them in Vercel → Project → Settings → Environment Variables. Changes only take effect on the **next deploy**, so redeploy after editing.
- `NEXT_PUBLIC_*` values are visible in the browser. Never put a secret in one.
- Pull them locally with `vercel env pull .env.local`. Then move `DATABASE_URL`, `DIRECT_URL`, `ERP_ENCRYPTION_KEY` and the `QBO_*` lines into `.env` (see README).
- Local dev uses `QBO_ENVIRONMENT=sandbox` and the localhost `QBO_REDIRECT_URI`. Production uses `production` and `https://app.sueep.com/api/erp/quickbooks/callback`.

## Rotating secrets

Do this when someone with access leaves, or a value may have leaked. Change the value at the service, update Vercel, redeploy, then update local `.env` files.

| Secret | How to rotate | Side effects |
|---|---|---|
| `ERP_SESSION_SECRET` | `openssl rand -hex 32` | Everyone is signed out once |
| `CRON_SECRET` | `openssl rand -hex 32` | None. Vercel sends the new value after the redeploy |
| `HUBSPOT_ACCESS_TOKEN` / `HUBSPOT_CLIENT_SECRET` | HubSpot → Private apps → rotate | Syncs fail until Vercel is updated |
| `QBO_CLIENT_SECRET` | Intuit Developer → app → Keys | Then reconnect QuickBooks from ERP → QuickBooks |
| `RESEND_API_KEY` | resend.com → API keys | Email fails until Vercel is updated |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Checkout fails until Vercel is updated |
| `META_ADS_ACCESS_TOKEN` | See [META_ADS_SETUP.md](META_ADS_SETUP.md) | Ad spend page errors until updated |
| `DATABASE_URL` / `DIRECT_URL` | Neon → reset the role password | Update both, in Vercel and in `.env` |
| `ERP_ENCRYPTION_KEY` | **Don't rotate**, unless you also write a script that decrypts with the old key and re-encrypts with the new one | A changed key makes every stored SSN, bank number, Company Info login and QuickBooks token unreadable |

Company Info logins stored inside the ERP (ERP → Company Info) are separate from these. Change them at each website, then update them in the ERP.

## New machine setup

```bash
git clone https://github.com/Sueep-Org/sueep-site && cd sueep-site
npm install
vercel link && vercel env pull .env.local     # needs access to the Vercel team
# move the DB / encryption / QBO lines into .env (see above)
npm run dev
```
