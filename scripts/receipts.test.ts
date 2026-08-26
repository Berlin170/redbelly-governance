/**
 * IPFS receipt tests. Run with:  npm run test
 *
 * A receipt exists so a stranger can check a vote without asking this server
 * for anything, which puts two properties under test that are easy to lose
 * silently:
 *
 *   1. The signed half is tamper-evident and the unsigned half is not, and the
 *      boundary between them is exactly where the file says it is. If editing
 *      `meta` broke verification we would be implying our own bookkeeping was
 *      signed by the voter. If editing `data` did not break it, the receipt
 *      would prove nothing at all.
 *
 *   2. A row can be turned back into the payload its author signed. The sweep
 *      and the rebuild script both depend on this, and the reconstruction runs
 *      through JSON and the database on the way — a choice object whose keys
 *      come back in another order, a null reason that was signed as "", and
 *      the receipt stops verifying.
 *
 * Signatures here are real, from a fixed test key. Nothing is stubbed: a test
 * that mocks the verification is a test of the mock.
 */

import { privateKeyToAccount } from "viem/accounts";
import { domain, voteTypes, proposalTypes } from "../lib/eip712";
import {
  voteReceipt,
  proposalReceipt,
  verifyReceipt,
  voteMessageFromRow,
  proposalMessageFromRow,
  type VoteMessageJson,
  type ProposalMessageJson,
} from "../lib/receipts";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}\n          got  ${a}\n          want ${e}`);
}

const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);
const other = privateKeyToAccount(
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
);

const PROPOSAL_ID = "8f14e45f-ceea-467a-9c3f-fb2c4a41f0f1";

const voteMessage: VoteMessageJson = {
  from: account.address,
  space: "redbelly-dao",
  proposal: PROPOSAL_ID,
  // Weighted, because its canonical form is the one a database round trip can
  // quietly reorder.
  choice: '{"1":2,"3":1}',
  reason: "Funding the audit first.",
  timestamp: 1_756_000_000,
};

const proposalMessage: ProposalMessageJson = {
  from: account.address,
  space: "redbelly-dao",
  title: "Fund an independent audit",
  body: "Body text.",
  choices: '["For","Against","Abstain"]',
  votingSystem: "weighted",
  strategy: "native-balance",
  requireVerified: true,
  start: 1_756_000_100,
  end: 1_756_600_100,
  timestamp: 1_756_000_000,
};

async function signVote(message: VoteMessageJson, signer = account) {
  return signer.signTypedData({
    domain,
    types: voteTypes,
    primaryType: "Vote",
    message: {
      ...message,
      from: message.from as `0x${string}`,
      timestamp: BigInt(message.timestamp),
    },
  });
}

async function signProposal(message: ProposalMessageJson, signer = account) {
  return signer.signTypedData({
    domain,
    types: proposalTypes,
    primaryType: "Proposal",
    message: {
      ...message,
      from: message.from as `0x${string}`,
      start: BigInt(message.start),
      end: BigInt(message.end),
      timestamp: BigInt(message.timestamp),
    },
  });
}

const meta = { proposal_id: PROPOSAL_ID, voting_power: 1234.5 };

async function run() {
  console.log("\na receipt over a real signature");
  {
    const sig = await signVote(voteMessage);
    const r = voteReceipt(voteMessage, sig, meta);
    check("verifies", await verifyReceipt(r), { ok: true, ours: true });
    check("names the signer", r.address, account.address);
  }

  console.log("\nthe signed half is tamper-evident");
  {
    const sig = await signVote(voteMessage);

    const flipped = voteReceipt(voteMessage, sig, meta);
    flipped.data.message.choice = '{"2":1}';
    check("a changed choice fails", (await verifyReceipt(flipped)).ok, false);

    const backdated = voteReceipt(voteMessage, sig, meta);
    backdated.data.message.timestamp = voteMessage.timestamp - 1;
    check("a changed timestamp fails", (await verifyReceipt(backdated)).ok, false);

    const moved = voteReceipt(voteMessage, sig, meta);
    moved.data.message.space = "some-other-dao";
    check("a changed space fails", (await verifyReceipt(moved)).ok, false);

    // The envelope repeats the author outside the signed payload. Rewriting
    // only that would let a receipt be filed under someone else's name while
    // still verifying against the real signer, so it is checked, not trusted.
    const misattributed = voteReceipt(voteMessage, sig, meta);
    misattributed.address = other.address;
    check(
      "a rewritten envelope address fails",
      (await verifyReceipt(misattributed)).ok,
      false
    );

    const forged = voteReceipt(
      { ...voteMessage, from: other.address },
      sig,
      meta
    );
    check("another address's signature fails", (await verifyReceipt(forged)).ok, false);
  }

  console.log("\nthe unsigned half is not, and must not be");
  {
    const sig = await signVote(voteMessage);
    const r = voteReceipt(voteMessage, sig, meta);
    r.meta.voting_power = 999_999;
    // Not a bug. meta is this server's record, never the voter's claim, and a
    // receipt that appeared to vouch for it would be lending a signature to
    // numbers nobody signed. Re-checking voting power means replaying balances
    // at the snapshot block, not reading it out of a file we wrote.
    check("editing meta still verifies", (await verifyReceipt(r)).ok, true);
  }

  console.log("\na signature over someone else's domain");
  {
    const foreign = { name: "Someone Else Governance", version: "1", chainId: 1 };
    const sig = await account.signTypedData({
      domain: foreign,
      types: voteTypes,
      primaryType: "Vote",
      message: {
        ...voteMessage,
        from: voteMessage.from as `0x${string}`,
        timestamp: BigInt(voteMessage.timestamp),
      },
    });
    const r = voteReceipt(voteMessage, sig, meta);
    r.data.domain = foreign;
    // Real signature, real signer, not a Redbelly ballot. Both facts are
    // reported, because collapsing them would let any EIP-712 app's votes be
    // presented as this DAO's.
    check("is valid but not ours", await verifyReceipt(r), { ok: true, ours: false });
  }

  console.log("\nrebuilding a vote from its stored row");
  {
    const sig = await signVote(voteMessage);
    // The row as the database hands it back: choice parsed out of jsonb, an
    // empty reason stored as null, the address checksummed on the way in.
    const rebuilt = voteMessageFromRow(
      {
        voter: account.address.toLowerCase(),
        choice: { "3": 1, "1": 2 },
        reason: "Funding the audit first.",
        signed_at: voteMessage.timestamp,
      },
      { id: PROPOSAL_ID, space_id: "redbelly-dao" }
    )!;
    check(
      "the reconstruction verifies",
      (await verifyReceipt(voteReceipt(rebuilt, sig, meta))).ok,
      true
    );

    const blank = { ...voteMessage, reason: "" };
    const blankSig = await signVote(blank);
    const fromNull = voteMessageFromRow(
      {
        voter: account.address,
        choice: { "1": 2, "3": 1 },
        reason: null,
        signed_at: blank.timestamp,
      },
      { id: PROPOSAL_ID, space_id: "redbelly-dao" }
    )!;
    // An absent reason was signed as "", so it has to come back as "".
    check(
      "a null reason rebuilds as the empty string it was signed as",
      (await verifyReceipt(voteReceipt(fromNull, blankSig, meta))).ok,
      true
    );

    check(
      "a ballot with no signed timestamp cannot be rebuilt",
      voteMessageFromRow(
        {
          voter: account.address,
          choice: 1,
          reason: null,
          signed_at: null,
        },
        { id: PROPOSAL_ID, space_id: "redbelly-dao" }
      ),
      null
    );
  }

  console.log("\nrebuilding a proposal from its stored row");
  {
    const sig = await signProposal(proposalMessage);
    const rebuilt = proposalMessageFromRow({
      id: PROPOSAL_ID,
      space_id: "redbelly-dao",
      author: account.address,
      title: proposalMessage.title,
      body: proposalMessage.body,
      choices: ["For", "Against", "Abstain"],
      voting_system: "weighted",
      strategy: "native-balance",
      require_verified: true,
      start_at: new Date(proposalMessage.start * 1000).toISOString(),
      end_at: new Date(proposalMessage.end * 1000).toISOString(),
      signed_at: proposalMessage.timestamp,
    })!;
    check(
      "the reconstruction verifies",
      (
        await verifyReceipt(
          proposalReceipt(rebuilt, sig, { proposal_id: PROPOSAL_ID })
        )
      ).ok,
      true
    );

    check(
      "a proposal with no signed timestamp cannot be rebuilt",
      proposalMessageFromRow({
        id: PROPOSAL_ID,
        space_id: "redbelly-dao",
        author: account.address,
        title: proposalMessage.title,
        body: proposalMessage.body,
        choices: ["For", "Against", "Abstain"],
        voting_system: "weighted",
        strategy: "native-balance",
        require_verified: true,
        start_at: new Date(proposalMessage.start * 1000).toISOString(),
        end_at: new Date(proposalMessage.end * 1000).toISOString(),
        signed_at: null,
      }),
      null
    );
  }

  console.log("\nmalformed receipts are refused, not thrown at");
  {
    check("null", (await verifyReceipt(null)).ok, false);
    check("an empty object", (await verifyReceipt({})).ok, false);
    check(
      "a receipt with no signature",
      (await verifyReceipt({ kind: "vote", data: { message: {}, types: {} } })).ok,
      false
    );
  }

  console.log(
    failures === 0
      ? `\n${checks} checks passed.\n`
      : `\n${failures} of ${checks} checks FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

run();
