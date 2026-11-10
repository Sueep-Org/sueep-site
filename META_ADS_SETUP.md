# Meta ads connection (Facebook / Instagram)

The ERP's **Ad spend** page (`/erp/ads`, linked from Finance → "Where the money went") reads what we spend on Facebook and Instagram ads straight from Meta. This note explains what it connects to and how to fix it if it stops working.

Set up November 2026 by Emma Mazzoni. Edwin Giraldo is the admin on both Meta pieces.

## What it's made of

| Piece | Where it lives | Who must have access |
|---|---|---|
| **Business account** (owns the ad account and the app) | business.facebook.com/settings | At least 2 admins with **Full control** |
| **Ad account** `act_199654023` | Business Settings → Accounts → Ad accounts | — |
| **Developer app** (App ID `1681998286841027`) | developers.facebook.com/apps | At least 2 people under **App roles → Roles → Administrator** |
| **System user `erp-bot`** (owns the token) | Business Settings → Users → System users | Assigned the ad account (**Manage ad account**) and the app (**Manage app**) |
| **Token** | Vercel env var `META_ADS_ACCESS_TOKEN` (and `.env.local` for local dev) | Nobody else. Treat it like a password |

The token belongs to the **business**, not to a person, and is set to **never expire**. People can leave and delete their Facebook accounts without breaking it, **as long as the business and the app always have at least one other admin**. If the last app admin disappears, Meta can disable the app, and the token stops working.

## Environment variables

```
META_ADS_ACCESS_TOKEN=<system user token>
META_AD_ACCOUNT_ID=act_199654023
```

These must be set in **Vercel → Project → Settings → Environment Variables** (Production) as well as locally. The account ID needs the `act_` in front.

## If the Ad spend page shows an error

| Message mentions | Cause | Fix |
|---|---|---|
| "Meta isn't connected" | Env vars missing | Add both variables in Vercel and redeploy |
| "Error validating access token" / "session has been invalidated" | Token revoked, or the app was disabled | Make a new token (below). Check the app still exists and has an admin |
| "(#200)" / "permission" / "does not exist" | `erp-bot` lost access to the ad account, or the ID is wrong | Business Settings → System users → erp-bot → Assign assets → Ad accounts → **Manage ad account**. Check the ID starts with `act_` |

## Make a new token

1. business.facebook.com/settings → **Users → System users → erp-bot**.
2. **Generate new token** → pick the app → expiration **Never**.
3. Tick **ads_read**, **ads_management**, **business_management**.
4. Copy it (Meta shows it once), paste it into Vercel's `META_ADS_ACCESS_TOKEN`, and redeploy.
5. Optional: on the same screen, **Revoke** the old token.

If "No permissions available" appears at step 3, erp-bot isn't assigned to the app: Assign assets → Apps → tick the app → **Manage app**.

## How the numbers work

- Spend, clicks and leads come from Meta's Insights API, cached for 1 hour. Dates follow the ad account's time zone (Pacific).
- **Leads** are Meta's count: forms filled on Facebook plus website forms the Meta Pixel saw (`/franchise`, `/careers`).
- Campaigns are labeled Hiring / Franchise / Other from their **name** (see `campaignKind` in `src/lib/erp/metaAds.ts`). Keep "Hiring" or "Franchise" in new campaign names so they're grouped correctly.
- The "Leads in the ERP" box counts all franchise inquiries and field applications in the same dates **from any source**. The website forms don't record whether someone came from an ad yet, so ERP leads can't be split by campaign.

## No double counting with QuickBooks

Meta charges the company card, the charge reaches QuickBooks through the bank feed, and the bookkeeper files it (usually under **Advertising & Marketing**, sometimes **HR Recruiting** for hiring ads). The Finance dashboard already counts those QuickBooks accounts. So:

- **QuickBooks is the money total.** Meta's numbers are never added to any cost total in the ERP.
- The Finance dashboard's "Where the money went" card shows a **note** under the costs ("Meta ads: $X ... already inside Marketing and Recruiting above, not added again").
- **QuickBooks → details** has a **Meta ads** line each month: Meta's spend next to the QuickBooks charges from Meta/Facebook. A big gap means a charge is missing, booked twice, or filed under the wrong account. Before QuickBooks' transaction detail syncs, it compares against the whole Advertising & Marketing account instead.
- Ask the bookkeeper to file every Meta charge under one vendor name (e.g. "Meta Platforms") so the check can match them exactly.

## Code

- `src/lib/erp/metaAds.ts`: calls Meta and shapes the data.
- `src/app/erp/(shell)/ads/page.tsx`: the page (Admin, PM and Business Manager roles, the same as the Finance dashboard).
- `src/lib/erp/qboCheck.ts`: the `META_ADS` line on QuickBooks → details.
- `src/app/erp/(shell)/_dashboard/FinanceTab.tsx`: the note under "Where the money went".
- The token has `ads_management`, so code *could* change ads. The ERP only reads today. If editing ads is ever added, put it behind admin-only access and a confirm step.
