import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase";

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
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = supabaseAdmin();

  const [{ data: proposal }, { count }] = await Promise.all([
    db.from("proposals").select("title, start_at, end_at, voting_system").eq("id", id).maybeSingle(),
    db.from("votes").select("id", { count: "exact", head: true }).eq("proposal_id", id),
  ]);

  const now = Date.now();
  const state = !proposal
    ? "Proposal"
    : now < new Date(proposal.start_at).getTime()
      ? "Pending"
      : now > new Date(proposal.end_at).getTime()
        ? "Closed"
        : "Active";

  const accent = state === "Active" ? "#22c55e" : state === "Pending" ? "#eab308" : "#71717a";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0b",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "14px", height: "14px", borderRadius: "999px", backgroundColor: accent }} />
          <div style={{ fontSize: 28, color: accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {state}
          </div>
          <div style={{ fontSize: 28, color: "#52525b" }}>·</div>
          <div style={{ fontSize: 28, color: "#a1a1aa" }}>
            {`${count ?? 0} ${count === 1 ? "vote" : "votes"}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: proposal && proposal.title.length > 70 ? 60 : 76,
            lineHeight: 1.1,
            color: "#fafafa",
            fontWeight: 700,
          }}
        >
          {proposal?.title.slice(0, 140) ?? "Proposal not found"}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ width: "56px", height: "6px", backgroundColor: "#f44e4f" }} />
            <div style={{ fontSize: 32, color: "#fafafa", fontWeight: 600 }}>Redbelly DAO</div>
          </div>
          <div style={{ fontSize: 26, color: "#71717a" }}>Gasless signature voting</div>
        </div>
      </div>
    ),
    size
  );
}
