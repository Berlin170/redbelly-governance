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

- `native-balance` — RBNT held at the proposal's snapshot block, wallet plus
  anything staked in the pools listed in `lib/staking.ts` (Reddex's no-lock and
  365-day RBNT pools by default). A staked coin is still the holder's coin, and
  counting only liquid balances would give the least say to the members who
  locked for a year.
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

Then run everything in `supabase/migrations/` in filename order, and
`supabase/003_copeland.sql` — each one is written to be safe to run twice, and
each explains at the top what it is for and why. They are not optional: the
portal degrades quietly without them rather than failing loudly, so a missing
migration shows up as a feature that seems switched off. `006_replay_protection`
is the one to run first on an existing deployment, because until it does every
published vote signature can be posted back to undo a changed vote.

**3. Environment**

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and keys. `NEXT_PUBLIC_CHAIN_ID=151` runs against
Redbelly Mainnet, which is what the live portal uses. Set it to `153` for
Redbelly Testnet if you want a rehearsal environment.

`SUPABASE_SERVICE_ROLE_KEY` is the secret key, not the publishable one. It is
server-only and must never appear in a client component.

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is what makes the portal usable on a
phone. Chrome and Safari on mobile have no wallet extension to connect to, so
without it the only way in from a phone is the browser built into a wallet
app. A project ID is free from https://cloud.reown.com and adds a
WalletConnect option that reaches the wallet app from any mobile browser.

**4. Run**

```bash
npm run dev
```

Open http://localhost:3000. Add Redbelly Mainnet to MetaMask (chain ID 151,
RPC `https://governors.mainnet.redbelly.network`) and connect. On testnet the
chain ID is 153 and the RPC is `https://governors.testnet.redbelly.network`.

## Testing one person, one vote locally

On mainnet `verified-identity` reads Redbelly's access contract and no local
setup is needed. On testnet there is no such contract, so it falls back to the
`verified_addresses` table. Add yourself:

```sql
insert into verified_addresses (address, note)
values (lower('0xYourAddress'), 'local testing');
```

Addresses are stored lowercase.

## On mainnet

The portal runs on Redbelly Mainnet (chain 151).

**Identity verification is on chain.** `verified-identity` reads
`isAllowed(address)` on Redbelly's network access contract,
`0xcb385cD90ca6b219798F57B4a7958897e91A9163`. An address answers true only if
its owner claimed a Receptor access credential, which requires a passport
verified by biometric check, so eligibility comes from the protocol rather than
a list this server keeps. Set `NEXT_PUBLIC_IDENTITY_REGISTRY` only to override
that address.

**The electorate is frozen at the proposal's snapshot block.** `isAllowed` is
read at that block, not at vote time, so an address credentialed after a vote
opens cannot join it. Nobody can watch a live tally and mint the addresses
needed to swing it.

**What is still not proved, and why.** The credential presented to the access
contract is public calldata, and its `credentialSubject` carries exactly one
field: `publicAddress`. Sixty consecutive mainnet requests were decoded to
check — one issuer, no passport hash, no subject DID, and a fresh credential
UUID per issuance, so nothing on chain links two addresses to one person. The
passport check happens off chain at the issuer and the on-chain artifact is
deliberately unlinkable. `verified-identity` therefore means one vote per
verified address, and someone who holds several credentialed addresses from
before the snapshot can still vote more than once.

Closing that needs one thing from Redbelly, and it is a much smaller ask than a
registry address: a per-person nullifier in `RedbellyCredentials` — a
deterministic value derived from the passport plus a context, identical across
every address the same person credentials, revealing nothing about them. Add it
to `credentialSubject`, and the tally can group addresses by nullifier and
count one vote each. Until then, say "one verified address, one vote" and mean
it, rather than claiming a property the chain does not carry.

Two things are still deliberately unfinished, and each is a real decision
rather than a missing line of code.

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
