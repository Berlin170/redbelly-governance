"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { voteTypes, domain } from "@/lib/eip712";
import { activeChain } from "@/lib/chains";
import { ShieldCheck, XCircle, CheckCircle2, Eye } from "lucide-react";

/**
 * The page that answers "why should I connect my wallet to this?".
 *
 * Written as evidence rather than reassurance. Anyone can claim to be safe;
 * what earns trust is naming the exact things this site can and cannot do, and
 * showing the literal message a wallet will be asked to sign so a voter can
 * compare it against the popup in front of them. The signing types are
 * imported from lib/eip712 rather than retyped, so this page cannot drift out
 * of date with what the code actually asks for.
 */

const NEVER = [
  ["approve / permit", "Lets a contract spend your tokens. This is how most wallets get drained."],
  ["setApprovalForAll", "Hands over every NFT in a collection."],
  ["transfer / send", "Moves your funds."],
  ["Any transaction at all", "Voting here costs no gas because nothing is ever sent to the chain."],
] as const;

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connecting your wallet
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Voting here works the same way it does on Snapshot: you sign a
          message, you never send a transaction. This page explains exactly
          what that means, because &ldquo;trust us&rdquo; is not a security
          model.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4 text-primary" />
            What connecting actually does
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Connecting shares one thing: your public address. The same string
            you would paste into a block explorer. It gives this site no
            permission to move anything, and your private key never leaves your
            wallet — it is not sent, not stored, and never seen by this server.
          </p>
          <p>
            From that address we read public information: your RBNT balance and
            your stake, both of which anyone can already look up on{" "}
            {activeChain.blockExplorers?.default.name}. Disconnecting takes one
            click and leaves nothing behind, because nothing was granted.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <XCircle className="size-4 text-destructive" />
            What this site will never ask for
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2.5">
            {NEVER.map(([name, why]) => (
              <li key={name} className="flex gap-3 text-sm">
                <code className="mt-0.5 h-fit shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {name}
                </code>
                <span className="text-muted-foreground">{why}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
            If this site ever shows you an approval or a transaction popup,{" "}
            <span className="font-medium text-foreground">reject it</span> and
            tell the DAO. It would mean you are not on the real site.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-primary" />
            The only thing you ever sign
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A vote is this structure and nothing else. Your wallet will show you
            these exact fields before you approve — compare them against what is
            below.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3">
            <pre className="text-xs leading-relaxed">
              <code>{`domain: {
  name:    "${domain.name}",
  version: "${domain.version}",
  chainId: ${domain.chainId}
}

Vote: {
${voteTypes.Vote.map((f) => `  ${f.name.padEnd(9)} ${f.type}`).join("\n")}
}`}</code>
            </pre>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            There is no amount, no recipient, and no spender in that structure,
            because it is not a payment instruction. A signature over it is
            proof that a particular address chose a particular option on a
            particular proposal. Presented anywhere else it means nothing: the
            domain binds it to this application, and the fields do not describe
            a transfer of anything.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            Checking for yourself
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Read the popup before signing. A wallet always shows the message it
            is being asked to sign, and a governance vote looks nothing like an
            approval. This holds on every site, not only this one.
          </p>
          <p>
            Your signature is stored with your ballot, so anyone can re-verify
            that your vote was really yours without trusting this server. The
            same works in reverse: nobody can add a vote in your name, because
            they cannot produce your signature.
          </p>
          <p>
            Gas is the tell. Voting here is free. If something asks you to pay a
            fee to vote, it is not this site.
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Still unsure? Connect, then vote from a wallet holding almost nothing.
        You will see the whole flow costs no gas and moves nothing.{" "}
        <Link href="/proposals" className="underline hover:text-foreground">
          Browse proposals
        </Link>
      </p>
    </div>
  );
}
