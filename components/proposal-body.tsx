"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

/** Past this height a body is collapsed behind a fade and a control. */
const COLLAPSE_AT = 560;

/**
 * Proposal bodies are markdown — imported ones especially, which arrive with
 * headings, tables and links. Rendering them raw turns a written proposal
 * into a wall of asterisks, so they go through a renderer with the element
 * styles set explicitly rather than relying on a typography plugin.
 *
 * Imported bodies can be very long: one in this space runs to roughly eight
 * thousand pixels of flat paragraphs, which on a phone pushed the vote panel
 * so far down the page that the primary action was effectively unreachable.
 * Anything over a screen and a half is collapsed, and the reader opts in.
 */
export function ProposalBody({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTall(el.scrollHeight > COLLAPSE_AT + 120);
  }, [body]);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="relative overflow-hidden text-sm leading-relaxed"
        style={
          tall && !open
            ? { maxHeight: COLLAPSE_AT, transition: "max-height 320ms var(--ease-out)" }
            : undefined
        }
      >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h2 className="mb-3 mt-6 text-lg font-semibold first:mt-0" {...props} />
          ),
          h2: (props) => (
            <h3 className="mb-2 mt-6 text-base font-semibold first:mt-0" {...props} />
          ),
          h3: (props) => (
            <h4 className="mb-2 mt-5 text-sm font-semibold first:mt-0" {...props} />
          ),
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          ul: (props) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-muted-foreground" {...props} />
          ),
          ol: (props) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...props} />
          ),
          a: (props) => (
            <a
              className="text-primary underline underline-offset-2 hover:no-underline"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          strong: (props) => <strong className="font-semibold" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="mb-3 border-l-2 border-border pl-4 text-muted-foreground"
              {...props}
            />
          ),
          code: (props) => (
            <code
              className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="mb-3 overflow-x-auto rounded-lg bg-secondary p-3 text-xs"
              {...props}
            />
          ),
          hr: () => <hr className="my-5 border-border" />,
          img: (props) => (
            // Proposal bodies are markdown from members, so the sizes an
            // optimised <Image> needs are never known ahead of time.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="my-3 max-w-full rounded-lg" {...props} alt={props.alt ?? ""} />
          ),
          // Wide tables must scroll inside the card, never widen the page.
          table: (props) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th className="border border-border bg-secondary/50 px-2.5 py-1.5 font-medium" {...props} />
          ),
          td: (props) => (
            <td className="border border-border px-2.5 py-1.5 align-top" {...props} />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
      </div>

      {tall && !open && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/85 to-transparent" />
      )}

      {tall && (
        <div className="relative mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Show less" : "Read the full proposal"}
            <ChevronDown
              className={`ml-1.5 size-3.5 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </Button>
        </div>
      )}
    </div>
  );
}
