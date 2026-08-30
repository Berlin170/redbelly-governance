import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase";
import { outcomeOf } from "@/lib/outcome";
import { resultsFor } from "@/lib/results";
import { proposalState } from "@/lib/utils";
import type { Proposal, Vote } from "@/lib/types";

export const alt = "Redbelly DAO proposal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a proposal link turns into when someone pastes it in Discord or X.
 *
 * A governance link that unfurls as a bare URL reads as a personal project;
 * one that unfurls with the question, its state and its turnout reads as
 * infrastructure. It is also useful: people decide whether to click based on
 * whether the vote is still open.
 *
 * The state it prints comes from the same two functions the site itself uses —
 * `proposalState` and `outcomeOf`. This card used to compute its own, which
 * meant it only ever said "Closed": a rejected proposal read as "Rejected" in
 * the list, "Rejected" on the page, and "Closed" in the card that gets shared,
 * which is the copy most people see first. Three screens, one question, and
 * the only one that travelled was the one that would not answer it.
 *
 * Colours are the dark theme's tokens as literals. Satori cannot read a CSS
 * variable, and a social card has no theme to follow — it is dark wherever it
 * lands — so the values are copied from `--status-*` in globals.css. Keep them
 * in step with that block by hand.
 */
const INK = {
  background: "#0b0a0b",
  foreground: "#edecec",
  muted: "#9a9495",
  faint: "#4a4546",
  primary: "#f44e4f",
  active: "#55b78a",
  pending: "#d9a441",
  passed: "#55b78a",
  rejected: "#e8736d",
  winner: "#4a90d9",
  neutral: "#9a9495",
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = supabaseAdmin();

  const [{ data: proposal }, { data: votes }] = await Promise.all([
    db.from("proposals").select("*").eq("id", id).maybeSingle(),
    db.from("votes").select("*").eq("proposal_id", id),
  ]);

  const ballots = (votes ?? []) as Vote[];

  // A closed proposal is described by its outcome, not by the fact that it
  // stopped taking votes. While it is open the state is the news, because the
  // only thing a reader wants to know is whether they can still vote.
  let label = "Proposal";
  let accent: string = INK.neutral;
  let voterCount = ballots.length;

  if (proposal) {
    const p = proposal as Proposal;
    const state = proposalState(p.start_at, p.end_at);

    if (state === "active") {
      label = "Active";
      accent = INK.active;
    } else if (state === "pending") {
      label = "Not open yet";
      accent = INK.pending;
    } else {
      const results = resultsFor(p, ballots);
      const outcome = outcomeOf(p, results);

      // An election's outcome label is the winning choice's own name, which
      // reads as a status only if you already know that is what you are
      // looking at — "BUFFY · 27 votes" says nothing about having won, and on
      // a vote with numbered choices it would unfurl as a bare "6". The badge
      // on the site solves this with a trophy; a card that lands in a client
      // that may not render an icon says the word instead.
      label =
        outcome.kind === "winner" ? `Winner: ${outcome.label}` : outcome.label;
      voterCount = results.voterCount;
      accent =
        outcome.kind === "passed"
          ? INK.passed
          : outcome.kind === "rejected"
            ? INK.rejected
            : outcome.kind === "winner"
              ? INK.winner
              : INK.neutral;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: INK.background,
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "14px", height: "14px", borderRadius: "999px", backgroundColor: accent }} />
          <div
            style={{
              display: "flex",
              maxWidth: "700px",
              overflow: "hidden",
              fontSize: 28,
              color: accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 28, color: INK.faint }}>·</div>
          <div style={{ fontSize: 28, color: INK.muted }}>
            {`${voterCount} ${voterCount === 1 ? "vote" : "votes"}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: proposal && proposal.title.length > 70 ? 60 : 76,
            lineHeight: 1.1,
            color: INK.foreground,
            fontWeight: 700,
          }}
        >
          {proposal?.title.slice(0, 140) ?? "Proposal not found"}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ width: "56px", height: "6px", backgroundColor: INK.primary }} />
            <div style={{ fontSize: 32, color: INK.foreground, fontWeight: 600 }}>Redbelly DAO</div>
          </div>
          <div style={{ fontSize: 26, color: INK.muted }}>Gasless signature voting</div>
        </div>
      </div>
    ),
    size
  );
}
