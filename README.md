# Redbelly Governance Portal

Gasless signature voting for the Redbelly DAO. Self-hosted, no subscription.

Voters sign an EIP-712 message instead of sending a transaction, so voting is
free. The signature is stored alongside the ballot, which means anyone can
re-verify every vote independently without trusting this server.

## Voting systems

| System | What voters do | When to use it |
|---|---|---|
| Single choice | Pick one option | Ordinary yes/no decisions |
| Approval | Approve any number of options; each gets full power | Shortlists, multi-select |
| Weighted | Split power across options as shares | Budget allocation |
| Quadratic | Same input as weighted, square-rooted on tally | Reduces whale dominance |
| Ranked choice | Rank every option; lowest is eliminated each round | Three or more competing options |
| One person, one vote | Every verified identity gets exactly one vote | Anything holdings shouldn't decide |

Ranked choice runs instant-runoff. Each round counts every voter's
highest-ranked option still standing; if nobody has a majority, the weakest
option is eliminated and those ballots transfer. The full round history is
shown on the results panel.

**One person, one vote is the one Snapshot cannot do at any price tier.** It
depends on Redbelly's identity verification, which is the reason to build this
rather than just save a subscription fee.

## Voting power strategies

- `native-balance` — RBNT held at the proposal's snapshot block
- `erc20-balance` — an ERC-20 balance at the snapshot block
- `verified-identity` — 1 per identity-verified address

Balances are read at the block the proposal was created, so buying tokens after
a vote opens does not buy power in it.

## Setup

**1. Install**

```bash
npm install
```

**2. Database**

Create a Supabase project, open the SQL editor, and run `supabase/schema.sql`.
It creates the tables, row level security policies, and seeds the space.

**3. Environment**

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and keys. Leave `NEXT_PUBLIC_CHAIN_ID=153` to run on
Redbelly Testnet while you test.

`SUPABASE_SERVICE_ROLE_KEY` is the secret key, not the publishable one. It is
server-only and must never appear in a client component.

**4. Run**

```bash
npm run dev
```

Open http://localhost:3000. Add Redbelly Testnet to MetaMask (chain ID 153,
RPC `https://governors.testnet.redbelly.network`) and connect.

## Testing one person, one vote locally

Until the on-chain identity registry is wired up, `verified-identity` reads the
`verified_addresses` table. Add yourself:

```sql
insert into verified_addresses (address, note)
values (lower('0xYourAddress'), 'local testing');
```

Addresses are stored lowercase.

## Before mainnet

Three things are deliberately unfinished, and each is a real decision rather
than a missing line of code.

**Identity verification is a table, not a contract.** `lib/voting-power.ts`
falls back to a Supabase table you control. That works for testing, but it
means voters are trusting your list. Point `NEXT_PUBLIC_IDENTITY_REGISTRY` at
Redbelly's on-chain verification registry before running one-person-one-vote
for anything that matters.

**Results are not anchored on chain yet.** The `results_hash` and `anchor_tx`
columns exist for it. Hashing the closed vote set and writing it to a contract
on Redbelly is what turns "trust Berlin's database" into "verify it yourself."
Do this before the DAO depends on the portal.

**Nobody but you can deploy it.** Put the anchoring contract behind a multisig
from day one. It makes the funding proposal easier to pass and takes the
liability off one person.

## Structure

```
app/
  page.tsx                 proposal list, tabbed by state
  create/page.tsx          proposal composer
  proposal/[id]/page.tsx   proposal detail, voting, results
  api/proposals/           list + create (verifies author signature)
  api/proposals/[id]/      single proposal with live tally
  api/votes/               cast vote (verifies signature, reads power)
lib/
  voting.ts                tally engine for all six systems
  voting-power.ts          balance and identity strategies
  eip712.ts                signing domain, types, canonical encoding
  chains.ts                Redbelly mainnet + testnet
components/
  vote-panel.tsx           input UI for every voting system
  results-panel.tsx        scores, quorum, elimination rounds
  ui/                      shadcn components (Progress is customised)
```

## Notes

`components/ui/progress.tsx` takes an `indicatorClassName` prop that the stock
shadcn component does not have, so each choice can carry its own colour. If you
re-run `npx shadcn@latest add progress` it will be overwritten.

The theme lives entirely in `app/globals.css`. The Redbelly red was sampled
from the logo; replace it with the exact brand hex if you get one.
