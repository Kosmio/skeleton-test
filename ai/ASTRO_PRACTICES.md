# Astro 6 + React 19 Frontend Practices

This guide covers patterns and conventions for the Astro SSR frontend with React components and Tailwind CSS v4.

---

## Architecture Overview

The frontend is a server-rendered Astro application with selective client-side interactivity via React components:

- **Astro pages** handle routing, data fetching, and server rendering
- **Astro components** render static HTML (headers, footers, cards, heroes)
- **React components** handle client-side interactivity (forms, paginated lists)
- **Tailwind CSS v4** provides styling via utility classes
- **Sitemap** auto-generated via `@astrojs/sitemap` for SEO

```
web/
├── astro.config.mjs           # Astro + Vite config (SSR, React, Tailwind)
├── src/
│   ├── styles/app.css         # Tailwind v4 theme (@theme block)
│   ├── layouts/Layout.astro   # Base HTML layout (head, scripts, header/footer)
│   ├── components/            # Astro components (static, server-rendered)
│   ├── react-components/      # React components (client-hydrated)
│   ├── pages/                 # File-based routing
│   │   ├── index.astro
│   │   ├── 404.astro
│   │   ├── contact.astro
│   │   └── articles/
│   │       ├── index.astro
│   │       └── [slug].astro
│   └── lib/
│       ├── strapi.ts          # API client (server + client helpers)
│       └── types.ts           # TypeScript interfaces for API data
└── public/                    # Static assets (favicons, vendored scripts)
```

---

## SSR Pages

All pages are server-rendered. There is no static generation (`getStaticPaths` is not used).

### Data fetching pattern

Fetch data in the frontmatter block. The code runs on the server at request time:

```astro
---
import { getArticles } from "../lib/strapi";

const articles = await getArticles({ limit: 6, start: 0 });
---

<Layout title="Home">
  {articles?.data?.map((article) => (
    <Card title={article.title} slug={article.slug} />
  ))}
</Layout>
```

### Dynamic routes

Dynamic routes use `[param].astro` files. Read the param from `Astro.params`:

```astro
---
const { slug } = Astro.params;
const response = await getArticleBySlug(slug);
const article = response?.data?.[0];

if (!article) {
  return Astro.redirect("/404");
}
---
```

**Rules:**
- Never use `getStaticPaths()` — the app is fully SSR
- Always handle missing data with `Astro.redirect("/404")`
- Fetch only what the page needs (use pagination, filters)

---

## Astro Components vs React Components

### When to use Astro components

Use `.astro` files for components that:
- Render static HTML with no client-side interactivity
- Accept props and produce markup
- Don't need state, effects, or event handlers beyond simple inline scripts

Examples: `Header.astro`, `Footer.astro`, `Hero.astro`, `Card.astro`, `Button.astro`

### When to use React components

Use `.tsx` files for components that:
- Need `useState`, `useEffect`, or other React hooks
- Handle forms with validation and submission
- Manage client-side pagination or filtering
- Need to fetch data from the browser (not the server)

Examples: `ContactForm.tsx`, `ArticleList.tsx`, `MarkdownContent.tsx`

**Markdown rendering:** `MarkdownContent.tsx` uses `react-markdown` with `rehype-sanitize` (not `rehype-raw`) to prevent XSS from CMS content. The default sanitize schema strips `<script>`, event handlers, and dangerous attributes. If you need to allow additional HTML tags (e.g., `<iframe>` for embeds), extend the schema in `MarkdownContent.tsx` -- never switch back to `rehype-raw`

### Client hydration

React components must be explicitly hydrated with a client directive:

```astro
<ContactForm client:visible strapiUrl={strapiUrl} />
```

**Directives:**
- `client:visible` — hydrate when the component enters the viewport (preferred for below-the-fold content)
- `client:load` — hydrate immediately on page load (use sparingly, only for above-the-fold interactive content)

**Rules:**
- Default to `client:visible` unless the component must be interactive immediately
- Pass all data React components need as props — they cannot access `import.meta.env` server vars
- Keep React components focused on interactivity; rendering logic that doesn't need state belongs in Astro

---

## API Client (`src/lib/strapi.ts`)

### Server-side vs client-side

There are two fetch paths, because server and browser have different access:

**Server-side** (used in `.astro` frontmatter):
```ts
const strapiFetch = (targetUrl: string) =>
  fetch(`${import.meta.env.STRAPI_URL}/api${targetUrl}`, {
    headers: { Authorization: `Bearer ${import.meta.env.STRAPI_KEY}` },
  }).then((res) => res.json());
```
- Uses `STRAPI_URL` (server-only, can be internal Docker hostname)
- Uses `STRAPI_KEY` (secret, never sent to browser)

**Client-side** (used in React components):
```ts
const clientFetch = (url: string, key: string, targetUrl: string) =>
  fetch(`${url}/api${targetUrl}`, {
    headers: { Authorization: `Bearer ${key}` },
  }).then((res) => res.json());
```
- Receives URL and key as props from the Astro page
- Uses `REACT_STRAPI_URL` (public URL the browser can reach)

### Env utility (`src/lib/env.ts`)

Environment variables are accessed through a single `env` object that merges `process.env` and `import.meta.env` (import.meta.env takes precedence). This ensures vars resolve in all runtime contexts (Vite dev server, Astro SSR with Node adapter, Docker):

```ts
import { env } from "../lib/env";

// Use it like import.meta.env, but it works everywhere
const strapiUrl = env.REACT_STRAPI_URL || env.STRAPI_URL || "";
const cookieConsent = env.PUBLIC_COOKIE_CONSENT === "true";
```

All env vars used by the app are typed in `src/env.d.ts` via `ImportMetaEnv`.

**Rules:**
- Always use `env` from `src/lib/env.ts` — never use `import.meta.env` or `process.env` directly
- Never import `env` in React components — they run client-side where `process.env` doesn't exist
- Pass env values from Astro pages as props when React needs them
- `PUBLIC_*` env vars are available everywhere; non-prefixed vars are server-only
- When adding a new env var, add it to `ImportMetaEnv` in `src/env.d.ts`

### Strapi v5 response types

Types reflect the flat v5 response format (no `attributes` wrapper):

```ts
export interface Entity {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export type Article = Entity & {
  title: string;
  slug: string;
  content: string;
  image: Image | null;  // direct object, not { data: Image }
};
```

**Rules:**
- Access fields directly: `article.title`, not `article.attributes.title`
- Access media directly: `article.image?.url`, not `article.image?.data?.attributes?.url`
- Use `documentId` for stable identification across Strapi operations

---

## Tailwind CSS v4

### Configuration

Tailwind v4 uses CSS-based configuration instead of a JS config file. The theme is defined in `src/styles/app.css`:

```css
@import "tailwindcss";

/* Self-hosted Inter font (woff2, 4 weights: 400/500/600/700) */
@font-face { font-family: "Inter"; font-weight: 400; src: url("/fonts/inter-400.woff2") format("woff2"); font-display: swap; }
/* ... repeat for 500, 600, 700 */

@theme {
  --color-primary: #1e40af;
  --font-sans: "Inter", system-ui, sans-serif;
  --breakpoint-sm: 480px;
  /* ... */
}
```

**Fonts are self-hosted** in `public/fonts/` (Inter, latin subset, woff2 format). `@font-face` declarations are in `app.css` with `font-display: swap`. Do NOT use Google Fonts CDN — it sends visitor IPs to Google (GDPR violation). If you need to add a weight or change the font, download woff2 files and update the `@font-face` blocks.

The Vite plugin handles everything — no `postcss.config.js` or `tailwind.config.js` needed:

```js
// astro.config.mjs
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
export default defineConfig({
  site: "https://your-domain.com",  // required for sitemap generation
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
```

### Sitemap

The `@astrojs/sitemap` integration auto-generates a `sitemap.xml` at build time listing all pages. The `site` property in `astro.config.mjs` is required — it sets the base URL for all sitemap entries. The `/start` wizard replaces the placeholder with the actual domain.

### Dynamic classes

When Tailwind classes are constructed dynamically (e.g., `bg-${color}`), they won't be detected by the scanner. Force their inclusion with `@source inline()`:

```css
@source inline("bg-secondary bg-white bg-primary hover:text-primary text-white");
```

**Rules:**
- Define all theme values in `src/styles/app.css` under `@theme`
- Do not create `tailwind.config.js` or `postcss.config.js` — they are not used with TW4
- Import `../styles/app.css` in `Layout.astro` to load the theme
- When using dynamic class strings in component props, add them to `@source inline()`
- Prefer static class names over dynamic construction where possible

---

## Layout & Component Patterns

### Layout

`Layout.astro` is the single base layout. It handles:
- HTML boilerplate (lang, meta, fonts, favicon)
- Global CSS import (`src/styles/app.css`)
- SEO meta tags: canonical URL, Open Graph, Twitter Cards
- JSON-LD structured data (via `jsonLd` prop)
- Skip-to-content link for keyboard navigation
- Third-party scripts (Matomo) — conditionally loaded based on env vars
- Header and Footer components
- Cookie consent script

**Props:**
```ts
interface Props {
  title: string;
  description?: string;
  image?: string;             // OG/Twitter image URL (defaults to /assets/skelly.png)
  type?: "website" | "article"; // OG type (defaults to "website")
  jsonLd?: Record<string, unknown>; // JSON-LD structured data
}
```

Pages should pass `type="article"` and a `jsonLd` object for article pages. The home page includes a `WebSite` schema by default.

### Parameterized components

Astro components accept typed props via `export interface Props`:

```astro
---
export interface Props {
  title: string;
  bgColor?: string;
}

const { title, bgColor = "bg-primary" } = Astro.props;
---

<div class={bgColor}>{title}</div>
```

**Rules:**
- Use `export interface Props` for type safety
- Provide defaults for optional props
- Avoid deep prop drilling — if a component needs data, fetch it in the page and pass it down

### Inline scripts

For small interactivity (toggles, form submissions), use `<script>` tags in Astro components:

```astro
<script>
  document.getElementById('toggle')?.addEventListener('click', () => {
    document.getElementById('menu')?.classList.toggle('hidden');
  });
</script>
```

For scripts that need server-side values, use `define:vars`:

```astro
<script define:vars={{ apiUrl: import.meta.env.STRAPI_URL }}>
  fetch(apiUrl + '/api/something');
</script>
```

---

## Naming Conventions

| Element | Pattern | Example |
|---|---|---|
| Astro page | `kebab-case.astro` | `contact.astro`, `[slug].astro` |
| Astro component | `PascalCase.astro` | `Header.astro`, `Hero.astro` |
| React component | `PascalCase.tsx` | `ContactForm.tsx`, `ArticleList.tsx` |
| Lib module | `camelCase.ts` | `strapi.ts`, `types.ts` |
| CSS file | `kebab-case.css` | `app.css` |
| Static asset | `kebab-case` | `cookieconsent.js` |

### Directory conventions

- `src/components/` — Astro-only components (no React)
- `src/react-components/` — React components that need client hydration
- `src/pages/` — File-based routes (each file = a URL)
- `src/lib/` — Shared utilities and API client
- `src/layouts/` — Base layout(s)
- `src/styles/` — Global CSS and Tailwind theme
- `public/` — Static files served as-is (no processing)
- `public/robots.txt` — Search engine crawler rules

---

## Mobile Responsivity

The project is mobile-first. All layouts and components are designed to work from 320px upward. These patterns are established and must be maintained:

### Breakpoints

Custom breakpoints are defined in `src/styles/app.css` under `@theme`:

| Breakpoint | Width | Usage |
|---|---|---|
| `sm` | 480px | Small phones → large phones transition |
| `md` | 768px | Phone → tablet/desktop transition (navigation switch) |
| `lg` | 1024px | Tablet → desktop (3-column grids) |
| `xl` | 1280px | Available but rarely used |
| `2xl` | 1440px | Available but rarely used |

### Spacing pattern

All content containers use `px-4 sm:px-6` for horizontal padding — tighter on small screens, standard on larger ones. This applies to:
- Nav bar (`Header.astro`)
- All page sections (`index.astro`, article pages, contact, etc.)
- Footer
- Hero component

### Typography scaling

Headings use progressive scaling with the `sm:` breakpoint as the first step:

```
h1: text-2xl sm:text-3xl md:text-4xl (compact) or text-3xl sm:text-4xl md:text-5xl lg:text-6xl (hero)
h2: text-2xl sm:text-3xl md:text-4xl
```

Body text that uses `text-lg` on desktop should use `text-base sm:text-lg` to avoid overflow on small screens.

### Grid layouts

Grids follow a mobile-first stacking pattern:

```
1 col (default) → 2 cols at sm → 3 cols at lg
grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8
```

### Navigation

- Desktop nav: horizontal links, visible at `md:` and above
- Mobile nav: hamburger button visible below `md:`, triggers an animated slide-down menu with `max-height` transition
- Mobile menu links have `py-3` for 44px+ touch targets

### Touch targets

`app.css` enforces `min-height: 44px` on all interactive elements when `pointer: coarse` is detected (WCAG 2.5.8).

### Footer newsletter form

The email input + button layout stacks vertically on small screens (`flex-col`) and goes horizontal at `sm:` (`sm:flex-row`). Border radii adjust accordingly.

### Code blocks (MarkdownContent)

Code blocks use smaller text and padding on mobile: `text-xs sm:text-sm`, `p-3 sm:p-4`.

### Tables

Tables use `display: block; overflow-x: auto` on mobile (defined globally in `app.css`) to prevent horizontal page overflow. They revert to `display: table` at `md:`.

### Viewport meta

Layout includes `width=device-width, initial-scale=1` — both parts are required for correct mobile rendering.

### Rules
- Always design mobile-first: start with the smallest screen, add breakpoints upward
- Use `px-4 sm:px-6` for container padding, not a fixed `px-6`
- Scale headings with at least one intermediate breakpoint (`sm:` or `md:`)
- Ensure all interactive elements are at least 44×44px on touch devices
- Test layouts at 320px, 375px, 768px, and 1024px
- Use `overflow-x: auto` on wide content (tables, code blocks) instead of letting them overflow the page
- Prefer `flex-col sm:flex-row` over fixed horizontal layouts for inline form groups

---

## Accessibility Patterns

The project follows WCAG 2.1 AA. These patterns are established and must be maintained:

- **Skip-to-content link**: First child of `<body>` in Layout.astro, visually hidden until focused (`sr-only focus:not-sr-only`)
- **Landmarks**: `<main id="main-content">` wraps page content; `<header>`, `<nav>`, `<footer>` are semantic
- **Form labels**: All form inputs must have an associated `<label>` or `aria-label`. Newsletter input uses `aria-label` since it has no visible label
- **Status messages**: Success/error alerts use `role="alert"` so screen readers announce them (`ContactForm.tsx`, `Footer.astro`)
- **Mobile menu**: Toggle button has `aria-expanded` (toggled via JS) and `aria-controls` pointing to the menu element
- **Decorative images**: Logo `<img>` inside links with text uses `alt=""` (redundant alt avoided). Decorative SVG icons use `aria-hidden="true"`
- **Color contrast**: All text meets 4.5:1 minimum ratio. Newsletter button uses `bg-primary` (not `bg-primary-light`), footer copyright uses `text-gray-400`
- **Focus styles**: Global `*:focus-visible` outline defined in `app.css` (2px solid primary, 2px offset)
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all animations and transitions globally in `app.css`

---

## SEO Patterns

- **Canonical URL**: Auto-generated from `Astro.url.pathname` + `Astro.site` in Layout.astro
- **Open Graph**: `og:title`, `og:description`, `og:url`, `og:type`, `og:image`, `og:locale`, `og:site_name` on all pages
- **Twitter Cards**: `summary_large_image` card with title, description, image on all pages
- **JSON-LD**: Pass structured data via the `jsonLd` prop on Layout. Home uses `WebSite` schema, article pages use `Article` schema
- **robots.txt**: `web/public/robots.txt` allows all paths except `/strapi/`, includes Sitemap directive
- **Sitemap**: Auto-generated by `@astrojs/sitemap` at build time (not available during `astro dev`)

---

## GDPR Patterns

- **Privacy policy page**: `src/pages/politique-de-confidentialite.astro` with Art. 13/14 required sections. Contains `[TODO]` placeholders for project-specific details (controller identity, contact, etc.)
- **Footer privacy link**: "Confidentialité" link in footer navigation
- **Contact form**: Purpose statement + privacy policy link below the form (`ContactForm.tsx`)
- **Newsletter form**: Consent text + privacy policy link below the input (`Footer.astro`)
