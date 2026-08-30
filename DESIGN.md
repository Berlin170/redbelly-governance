# Design system

The portal's visual language, and the reasoning behind the parts of it that are
not obvious. Written for whoever changes this next.

---

## Type

| Role | Face | Where |
|---|---|---|
| Display | **Archivo** (variable, `wght` + `wdth`) | `.display`, `.display-wide`, `.eyebrow`, `.figure` |
| Body | **Geist Sans** | `body` default |
| Numerals, addresses, hashes | **Geist Mono** | `.tabular` |

Archivo carries a width axis, which is the reason for it over any other
grotesque: a heading gains presence by being widened rather than only made
heavier, and a small label can be set wide instead of merely bold. Geist on its
own is Vercel's default pairing, which is a large part of why a competent build
still reads as a template.

`next/font` self-hosts Archivo under a generated family name, exposed as
`--font-archivo`. The literal string `"Archivo"` will not match it. Everything
reads `--font-display-stack`, assembled once in `:root`.

The four classes:

- `.display` — headings and card titles.
- `.display-wide` — page titles and the space name. Widened; only works at size.
- `.eyebrow` — small uppercase section labels. Width does the work weight would.
- `.figure` — numbers large enough to read as a headline, e.g. the stat strip.

## Colour — "Ember"

Brand red is `#F44E4F` from the logo, darkened to `#CE332E` on light surfaces:
`#F44E4F` carries white text at about 3.4:1, which fails, and `#CE332E` clears
4.9:1 while still reading as the same red.

The neutrals are not grey — every one is pulled a few degrees toward the red.
Small enough that nothing looks tinted, large enough that the red belongs to
the palette instead of being an accent bolted onto a stock grey theme.

Surfaces ladder `background` → `card` → `raised` → `popover`. `--border-strong`
exists for edges that must survive on a white card rather than merely divide.

`--primary-rgb` is a space-separated triple so gradients and glows can be
written `rgb(var(--primary-rgb) / 0.2)`.

## Motion

Tokens live in `@theme inline`:

```
--ease-out:     cubic-bezier(0.23, 1, 0.32, 1)   /* anything entering */
--ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1)  /* movement across the screen */
--ease-drawer:  cubic-bezier(0.32, 0.72, 0, 1)
```

There is deliberately no `ease-in`. It delays the first frame, which is the
frame the eye is on.

Rules the code follows:

- UI transitions stay under 300ms; press feedback is 140ms.
- Entrances start at `scale(0.95)` with opacity, never `scale(0)`.
- Exits are faster than entrances — the decision is already made.
- `.pressable` scales to 0.97 on `:active`. Put it on anything clickable.
- List entrances stagger 40ms via `.stagger` and a `--i` index. Decoration
  only; it never gates input.
- Transitions over keyframes wherever a state can be re-triggered mid-flight —
  a transition retargets, a keyframe restarts from zero.
- Hover effects are gated behind `@media (hover: hover) and (pointer: fine)`
  where they matter; touch fires hover on tap.
- `prefers-reduced-motion` drops movement and keeps opacity and colour.

The one place motion carries meaning rather than polish: the result bars in
`results-panel.tsx` grow from zero on first paint. A bar that arrives full is a
picture; a bar that fills is a count.

## Art

`components/art/lattice.tsx`. Every illustrative surface is SVG and gradients —
no raster assets anywhere.

- `LatticeHero` — the banner. Hex mark, node graph, red bloom, faint ruling.
- `LatticePanel` — a quieter version for panels.
- `EmptyArt` — drawn empty states.

Three reasons this is not an image file:

1. **It themes.** The previous banner was a dark PNG, so the light theme showed
   a black rectangle at the top of a white page. These read the `--art-*`
   tokens and are correct in both themes by construction.
2. Nothing to wait for, nothing to lay out around, no second request.
3. It scales to any width without a crop through the middle of the subject.

The mesh geometry is a fixed table, never generated. Random values would differ
between the server render and the client one and tear hydration — and a mesh
that reshuffles every visit is not an identity. The slice is anchored left
(`xMinYMid`), so a phone-width hero keeps the logo mark and loses the tail of
the network rather than the reverse.

If the DAO ever wants a photographic banner back, render `space.banner_url`
above `<LatticeHero>` in `space-header.tsx` — but it will need a light-theme
variant.

## Modals

`components/ui/dialog.tsx`. Four in the product, each earning its place:

| Modal | Where | Why |
|---|---|---|
| Confirm your vote | `vote-panel.tsx` | A signature on an unfamiliar site is where a careful person stops. The wallet's own prompt shows a payload most people cannot read; this states the ballot in words first. |
| Connect a wallet | `connect-wallet.tsx` | Was a dropdown — 32px rows and 16px icons for the moment a visitor decides whether to trust the site. |
| How voting works | `how-voting-works.tsx` | The first-time visitor's missing answer. Previously one line of small print. |
| Preview | `create/page.tsx` | A published proposal cannot be edited, and the body is markdown nobody has seen rendered. |

Content scales from 0.96 and keeps a centred origin — popovers should scale
from their trigger, but a modal is not anchored to one.

## The frontend gate

```bash
node scripts/ui-audit.mjs [baseUrl] [outDir]
```

Runs every route across both themes and both a desktop and a phone width — 20
combinations — and checks:

- **Text contrast.** Walks every element that owns text, resolves the effective
  background by compositing translucent layers up the ancestor chain, and fails
  anything under WCAG AA. Text over a gradient or image is skipped rather than
  guessed at.
- **Horizontal overflow**, and which elements cause it.
- **Tap targets** under 24×24, with WCAG 2.5.8's inline exception for links
  sitting inside a sentence.

Text inside an `aria-hidden` subtree is bucketed as decorative and reported
without failing the run, mirroring WCAG's exemption for incidental content.
Bucketed rather than dropped: an `aria-hidden` hiding real content is its own
bug and should stay visible in the report.

Exits non-zero on a contrast or overflow failure, so it works as a gate.

## Working on this without database credentials

`next dev` can render live production data with no secrets on the machine.
Set in `.env.local` (gitignored):

```
NEXT_PUBLIC_API_PROXY=https://redbelly-governance.vercel.app
```

`next.config.ts` then rewrites `/api/*` to that deployment. It is a
`beforeFiles` rewrite on purpose — the local route files exist and would
otherwise win the match and then fail for want of a database. Unset, which is
how it is deployed, the rewrite list is empty and the app serves its own routes
exactly as before.

The one route this does not cover is `/proposal/[id]`, whose `layout.tsx`
resolves share metadata server-side and so imports the Supabase client
directly. It throws at import with no URL, so `.env.local` also needs
placeholder values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `SUPABASE_SERVICE_ROLE_KEY`. The query 401s and `generateMetadata` falls
back to its default title, which is all UI work needs.
