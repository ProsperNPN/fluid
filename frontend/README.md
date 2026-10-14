# Frontend

FLUID frontend is a scaffolded Next.js App Router application using TypeScript and Tailwind CSS.

## Run locally

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

## Environment variables

- `NEXT_PUBLIC_API_URL` - FastAPI base URL (example: `http://127.0.0.1:8000`)

## Structure
- app/
- components/
- lib/
- services/
- types/
- hooks/

## Public website

The public routes are `/`, `/about`, and `/contact`. Public styles live in
`app/public.css` and are scoped to `.public-site`; authenticated dashboards retain
their existing UI and API integrations. The animated FLUID logo is shared.

`components/public/` contains the SVG connection illustration, scroll reveals,
privacy-safe dashboard previews, founder story, and contact form. Previews reuse
the production sidebar and empty-state components without calling authenticated
APIs. They show placeholders rather than invented live figures. Predictive
inventory intelligence is explicitly marked Coming Soon.

Registration links use `/auth/register?role=donor` and
`/auth/register?role=hospital` to preselect the existing account-type field.

The contact form validates input and opens an email draft to the existing
`hello@fluid.health` address. Visitors send the draft from their own email app;
the form also offers a copy fallback. No message is stored or sent by the server.
Confirm that inbox before public launch. Direct delivery needs a configured form
service or mail endpoint. Add official policy documents and social URLs when
available; the footer currently links policy enquiries to the contact form.

Inter and Poppins are bundled locally under `app/fonts/`, with their licenses,
so font rendering and builds do not depend on external Google Fonts requests.

The homepage hero layers a transparent, fictional donor portrait with the SVG
connection animation and floating workspace cards. The optimized campaign asset
is `public/images/donor-hero.webp`; its generation prompt and provenance are in
`public/images/README.md`. The warm donor and cool hospital section backgrounds
are scoped public styles. All motion remains finite or interaction-triggered,
and reduced-motion preferences disable it.

Validation: `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

### Implementation files

- `app/page.tsx`: redesigned public homepage and page metadata.
- `app/about/page.tsx`: founder story and mission.
- `app/contact/page.tsx`: dedicated contact page and metadata.
- `app/loading.tsx`: accessible route-loading fallback.
- `app/public.css`: scoped design system, responsive layouts, and reduced-motion rules.
- `app/layout.tsx`: public stylesheet and bundled Inter font.
- `app/auth/register/page.tsx`: role preselection using existing registration logic.
- `app/fonts/Inter-Latin.woff2`, `app/fonts/Inter-OFL.txt`: local Inter font and license.
- `components/layout/navbar.tsx`: sticky, compact navigation and mobile menu.
- `components/layout/footer.tsx`: public links and dynamic copyright.
- `components/public/connection-visual.tsx`: finite SVG animation and replay.
- `components/public/dashboard-preview.tsx`: shared previews and accessible interactive tabs.
- `components/public/founder-story.tsx`: reusable founder letter.
- `components/public/contact-form.tsx`: validated email drafts and copy fallback.
- `components/public/reveal.tsx`: progressive scroll reveals.
- `README.md`: behavior, validation, and launch requirements.

Donor and hospital portal workflows and validation: [Portal implementation](../docs/PORTAL_IMPLEMENTATION.md).
