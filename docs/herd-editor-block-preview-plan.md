# Per-block preview for the Herd Editor — findings and plan

## Context

The Herd Editor (`wp-content/plugins/herd-editor`) is a custom WordPress admin screen that renders a page's ACF blocks as an accordion list. It is not Gutenberg. Editors currently have no way to see what a block looks like without saving and loading the front end, so every layout question costs a save-and-check round trip against live content.

This adds a preview affordance to each block row that opens a right-side drawer showing the block rendered from the editor's **current, unsaved** field values. The design is settled by `docs/herd-editor-block-preview.html`; where it and the task brief disagree, the brief wins.

The load-bearing constraint is trust: a preview sourced from the database, or one that silently falls back to saved content on failure, is worse than none. Everything below is arranged around never showing stale HTML without saying so.

---

# Part 1 — Findings

## 1. What the editor is built in

A mix, with a hard split:

- **PHP renders the shell** — `includes/herd-editor-screen.php` is a real `form#post` posting to `post.php`. The serialized Gutenberg document rides in a hidden `#content` input (line 53). Boot data reaches JS via `wp_add_inline_script` as `window.HerdEditor` (`herd-editor.php:726-753`); `wp_localize_script` is not used.
- **React renders the block list** — `@wordpress/element` + `createElement` (no JSX anywhere), mounted at `#herd-editor-root` by `src/herd-editor.js:34`. `src/ui/App.js` owns the `<ol class="herd-list">`.
- **ACF renders the fields** — its own server-rendered form HTML, fetched over the private `acf/ajax/fetch-block` action and injected into the open accordion panel (`src/acf/bridge.js`).

**The row and its actions** — `src/ui/BlockRow.js`. DOM order inside `.herd-block__row` is **grip → child disclosure → one full-width `.herd-block__open` button (type icon, name, summary, chevron) → `.herd-block__tools`**. Tools hold exactly two `IconButton`s, `admin-page` (duplicate) then `trash` (delete), at lines 101-115, and render only when `structural` is true. Icons are **dashicons** via `primitives.js:67` — `IconButton` takes a dashicon slug only; one-off shapes like the grip are inline SVG components. Styles at `src/css/_blocks.scss:271-305`; the tools are **not** hover-revealed in the shipped CSS, despite what the style guide says, so "always visible" is already true.

## 2. How field values live in the browser before save

There is a real client-side store, and it is authoritative — **the DOM is never re-read at save time.**

```
ACF's rendered form (DOM)
 → 'input'/'change' on .acf-block-fields
 → acf.serialize( jQuery(form), `acf-block_${clientId}` )     src/acf/helpers.js:39
 → mergeAcfBlockData( block.attributes.data, submitted )      src/acf/helpers.js:56
 → onAttributes({ data })                                     src/acf/bridge.js:65-73
 → controller.replaceAttributes( clientId, { data } )         src/ui/App.js:241
 → controller.serialize() → #content.value                    src/ui/App.js:42-47
```

So for any block, open panel or not:

```js
const block = controller.find( clientId );   // src/controller.js:39
block.name                                    // 'acf/alternator'
block.attributes                              // { name, data: { heading, _heading, sections, sections_0_heading, … } }
```

`attributes.data` is already the flat block-comment map `acf_rendered_block()` wants. A never-opened panel holds what was parsed out of `post_content`, which *is* the current unsaved value. The one lag is an unblurred TinyMCE field, which has not written back to its textarea yet. `src/ui/summary.js` already reads this same store, which is why the summary line updates live as you type.

`contextForBlock( ancestors, blockTypes, postId, postType )` (`src/acf/helpers.js:99`) already builds the ACF block context from ancestors and is reusable as-is.

## 3. How ACF blocks render

ACF Pro **6.8.8**. `acf_rendered_block()` at `advanced-custom-fields-pro/pro/blocks.php:753`:

```php
acf_rendered_block( $attributes, $content = '', $is_preview = false, $post_id = 0, $wp_block = null, $context = false, $is_ajax_render = false )
```

It takes an arbitrary attributes array — `[ 'name' => 'acf/x', 'data' => [...] ]` — and is callable outside the loop; ACF's own AJAX endpoint calls it that way (`pro/blocks.php:1488`, passing `null` for `$wp_block`). With `$is_preview = false` it skips the block cache and the form, calls `acf_setup_meta( $block['data'], $block['id'], true )`, then the render callback (`blocks.php:900-970`). That is the same code path the front end uses, so fidelity is exact.

HerdPress blocks are `block.json` + `acf.renderCallback`, `blockVersion: 3`, `mode: edit`, rendering through **Timber/Twig** — e.g. `blocks/alternator/callback.php` → `Timber::render('blocks/alternator.twig')`. 65 blocks, registered by a directory scan at `inc/blocks.php:157-181`. Every callback follows one shape: `Timber::context()`, `get_fields()`, block classes, anchor, render.

Two other block systems exist: `herdpress-child` adds 9 `whitepaper-*` blocks on the same pattern, and the legacy `marsha` theme has 27 blocks on the old API v1 (`acf_register_block_type` + `render_template`, `inc/blocks/marsha.php`). `acf_rendered_block()` handles both.

`Timber::context()` reads the global post and query, so the render needs a real post set up — see the transport decision.

## 4. Which blocks contain repeaters, and where anchors could come from

**38 blocks have a top-level repeater.** Most are trivial (`links`, `photos`, `logos` — one or two sub-fields). The ones with a heading sub-field worth a rail: alternator, scrolling-content, accordion, tabs, timeline, cards-collection, categorized-list, stacked-cards, contact-grid, professor-spotlight, highlights, media-and-text, checklist, rankings, news-lists, price-hero, portraits, video-grid.

For the Alternator: `views/blocks/alternator.twig` → `views/partials/alternator-content.twig` (`{% for section in sections %}`) → `views/components/alternator-item.twig:38-43`, whose wrapper is:

```twig
<div data-media-side="{{ photo_side }}"
     class="group first:pt-0 … z-10 relative …"
     {% if z_index %}style="z-index: {{ z_index }};"{% endif %}
     {% if html_anchor %}id="{{ html_anchor }}"{% endif %}>
```

There is one wrapper `div` per row and it is a direct child of the block root, but there is **no stable per-row class** (only `group` plus Tailwind utilities), **no index attribute** (`loop.index0` is consumed for `photo_side` and `z_index` and never emitted), and the `id` comes from the optional author-supplied `html_anchor` sub-field, which most rows will not have.

Two others were checked to test whether a general rule exists. `views/blocks/accordion.twig` nests rows three levels deep behind a partial; `views/blocks/cards-collection.twig` interleaves rows with headings *and* puts `x-cloak` on them. So "direct children of the block root" is alternator luck, not a pattern.

Worth noting for later: `acf/accordion` and `acf/categorized-list` already emit a guaranteed per-row `id` (`components/accordion-item.twig:1-3,46` derives one from title + index), so those two could get a rail with no template change at all.

## 5. Blocks that need front-end JavaScript

**44 templates use Alpine `x-data`**, including the block roots for cards-collection, categorized-list, expandable-content, feature-video, find-my-counselor, hero, major-search, metro-tuition-checker, moments-grid, portraits, professor-spotlight, program-listing and salesforce-form, plus the shared accordion-item, video, dropdown, tabs, timeline and rankings partials.

Several use `x-cloak`, so **without Alpine those blocks render visibly empty**, not merely non-interactive. Separately, `js/mu-animate.js` registers the IntersectionObserver that reveals every `data-animate="fade-in-up"` element — without it they stay at `opacity-0`.

The theme's entire front-end JS entry is 18 lines — Alpine plus collapse/focus/intersect and one `Alpine.data('accordion')`. No analytics, no nav, no exit overlay. A dozen blocks additionally `wp_enqueue_script()` from *inside* their render callback (`blocks/accordion/callback.php:36` and friends), which the chosen transport picks up for free.

## 6. Block descriptions

`WP_Block_Type::$description` is available, so surfacing it is a one-line addition to `herd_editor_block_metadata()` (`herd-editor.php:446`). The content is the problem. Of 65 HerdPress blocks:

- **1 with no `description` key at all:** `acf/highlight-list`
- **40 boilerplate** that restate the title and teach nothing — "HerdPress Basic Content block.", "HerdPress Cards Collection block.", "HerdPress Highlights block." — covering alerts, basic-content, billboard, billboard-fact-row, blog, blog-cta, call-to-action, cards-collection, categorized-list, checklist, contact-grid, content-with-sidebar, expandable-content, feature-items, feature-video, find-my-counselor, gravity-form, highlights, html, icon-box, iframe, link-collection, list-with-content, localist, moments, mosaic, news-lists, page-with-sidebar, photo-grid, portraits, posts, price-hero, program-listing, program-page-content, rankings, salesforce-form, scrolling-content, shortcode, slate-form, social, splash, stacked-cards, table, tabs, teaser, testimonial, timeline, video-grid, visual-editor
- **~24 real:** alternator, accordion, hero, split-feature, metro-tuition-checker, dean-note, blockquote, professor-spotlight, logo-grid, media-and-text, accreditation-block, value, major-search, profiles, banner and a few more

The 9 `herdpress-child` whitepaper blocks all have genuinely good descriptions. Of Marsha's 27, only `major-search` has one at all.

## Two things the brief assumed that are not true here

**No REST namespace exists.** `register_rest_route`, `rest_url`, `apiFetch` — zero hits in the plugin. The one server call is admin-ajax: `wp_ajax_herd_editor_validate_document` (`herd-editor.php:213-222`), called with raw `fetch` + `URLSearchParams` against `window.ajaxurl` and a nonce passed through `window.HerdEditor.validationNonce`.

**There is no preview URL to hang an anchor on.** The header deliberately builds none — `src/ui/ViewMenu.js:94-103` presses core's own `#post-preview` button, which form-POSTs and opens a preview *including unsaved changes*. `herd_editor_view_url()` returns a permalink only for published or private posts and `''` for drafts. So "See it on the page" is a choice between unsaved-accurate-but-anchorless and anchored-but-stale. Blocks do support anchors — every HerdPress block declares `supports.anchor: true` — though three (`acf/hero`, `acf/page-with-sidebar`, `acf/program-page-content`) never actually emit theirs.

---

# Part 2 — Plan

## Decisions taken

| Question | Decision |
|---|---|
| Section anchors | Option 2, scoped to the Alternator — add `data-herd-section` to its row wrapper only |
| Render transport | admin-ajax POST returns a token; the iframe loads a **real front-end request** |
| Front-end JS in the frame | Yes — load the theme's front-end entry (Alpine + 3 plugins, 18 lines) |
| Block descriptions | Render whatever the registry has, verbatim |
| "See it on the page" | Press core's `#post-preview` button; no fragment |

## What already exists and must be reused

- **Unsaved values** — `controller.find(clientId).attributes`, `src/controller.js:39`. **Do not re-read the DOM.**
- **Block context** — `contextForBlock()`, `src/acf/helpers.js:99`.
- **Server call convention** — `herd-editor.php:213-222` and `src/ui/App.js:56-63`. Match it; the plugin registers no REST routes.
- **ACF field objects** — `acf_get_block_fields( [ 'name' => …, 'data' => … ] )`, already used at `herd-editor.php:196`.
- **Render** — `acf_rendered_block( $attributes, '', false, $post_id, null, $context )`, `pro/blocks.php:753`.
- **Theme stylesheet** — do **not** hand-list. The front-end request runs `wp_head()` normally.
- **Dismissal / focus contract** — copy `src/ui/InsertPoint.js:26-47` (outside `mousedown` closes, focus returns to the trigger).
- **Preference storage** — `localStorage` in a `try/catch`, key `herd-editor-*`, per `src/rail.js:13,67-71`.
- **Icons** — dashicons through `IconButton` (`src/ui/primitives.js:67`). `visibility` for the eye; `desktop`/`tablet`/`smartphone` for viewport, `editor-expand`/`editor-contract` for widen, `no-alt` for close, `arrow-left-alt2`/`arrow-right-alt2` for the steppers.
- **Namespace warning** — `.herd-preview` is taken by the media video dialog (`src/css/_acf-media.scss:445`). Use `.herd-bp*`.
- **Prior art to read first** — `themes/herdpress/js/editor-block-refresh.js` documents how ACF v3 preview refresh keying works in Gutenberg; `themes/herdpress/inc/block-showcase.php:959-1088` already builds ACF `data` payloads with recursive field-key pairing. Neither is reused directly, but both are the closest existing thinking about this problem in the repo.

## Server: `includes/herd-editor-preview.php` (new)

Required from `herd-editor.php` beside the other includes.

### 1. `herd_editor_ajax_block_preview()` — `wp_ajax_herd_editor_block_preview`

Accepts `nonce`, `postId`, `clientId`, `blockName`, `attributes` (JSON), `context` (JSON).

1. `check_ajax_referer( 'herd_editor_block_preview', 'nonce' )`.
2. `$post = get_post( absint( $_POST['postId'] ) )`; reject unless `$post && herd_editor_supports_post( $post ) && current_user_can( 'edit_post', $post->ID )` — 403.
3. **Validate the block name**: must start with `acf/` *and* be present in `WP_Block_Type_Registry::get_instance()->get_registered()`. Reject anything else — never render an arbitrary name.
4. Sanitize attributes to an allowlist — `name`, `data`, `align`, `className`, `anchor`, `mode`, `id` — and force `name` to the validated string.
5. Mint `$token = wp_generate_password( 32, false )`; `set_transient( "herd_bp_{$token}", [ 'post' => $post->ID, 'user' => get_current_user_id(), 'attributes' => …, 'context' => … ], 5 * MINUTE_IN_SECONDS )`.
6. Return `wp_send_json_success( [ 'token', 'frameUrl', 'description', 'settings', 'sections', 'isEmpty' ] )`.

`frameUrl` = `add_query_arg( 'herd_block_preview', $token, get_preview_post_link( $post ) )`. Using the post's own preview link means WordPress resolves the correct singular main query — including for drafts — before our handler runs, so `Timber::context()` and post-driven blocks (`acf/posts`, `acf/blog`, `acf/news-lists`) see what the front end sees.

### 2. `herd_editor_render_preview_frame()` — on `template_redirect`

Bails unless `herd_block_preview` is set. Then: load the transient, re-check `get_current_user_id()` matches and `current_user_can( 'edit_post', … )`, `nocache_headers()`, `send_frame_options_header()` (same-origin only), and emit a minimal document.

**Render the block first, print the document second** — this ordering is the whole reason the token route was chosen:

```php
$html = acf_rendered_block( $attributes, '', false, $post_id, null, $context );
// then: <!doctype html><html <?php language_attributes(); ?>><head>…<?php wp_head(); ?></head>
//       <body <?php body_class( 'herd-bp-frame' ); ?>><?php echo $html; ?><?php wp_footer(); ?>
```

A dozen theme callbacks call `wp_enqueue_script()` *inside* the render — `blocks/accordion/callback.php:36`, plus tabs, professor-spotlight, portraits, rankings (`mu-carousel.js`), hero, categorized-list, major-search, program-listing, metro-tuition-checker, find-my-counselor, moments, salesforce-form and page-with-sidebar. Rendering before `wp_head()` means every one of those lands in the queue in time to print, so per-block scripts come along for free with nothing hand-listed. The same request also picks up `herdpress-app` (the Vite bundle: Alpine + Tailwind CSS), `herdpress-fonts`, and `js/mu-animate.js`.

Pass `$is_preview = false`. That is not only a fidelity choice: with it true, `acf_rendered_block_v3` reads a request-scoped block cache (`pro/blocks.php:915-920`) and separately builds the entire ACF edit form including `wp_editor()` instances (`:932-960`), neither of which we want.

**Pass `data` through untouched.** `block.attributes.data` is already the flat block-comment map ACF itself wrote (`heading`, `_heading`, `sections`, `sections_0_heading`, `_sections_0_heading`, …) — the same map that would have been saved to `post_content`. Any transformation on the way in is a chance to be wrong about a value the editor is actually holding.

A small inline script in the frame posts `document.documentElement.scrollHeight` to the parent on `load` and from a `ResizeObserver`, so the stage can size itself. Origin-checked both ways.

The transient is re-set rather than deleted on read, so a viewport toggle or a reload inside the same open panel does not 404.

### 3. `herd_editor_preview_settings( $block_name, $data )`

Keys are ACF field **labels** from `acf_get_block_fields()`, in field-group order. Values formatted by type: `true_false` → Yes/No; `select`/`radio`/`button_group` → the choice label; `link` → title or URL; `image`/`file` → attachment title; `post_object`/`relationship`/`taxonomy` → titles; text-ish → stripped and truncated. Repeater and flexible-content contents are **not** walked — they collapse to a count using the field's own label ("Sections: 6"). An empty value returns `null`, which the client renders as *Not set* in muted italic; never a blank row.

### 4. `herd_editor_preview_sections( $block_name, $data )`

Returns `[ { index, title } ]` only for block types in a filtered map, defaulting to `[ 'acf/alternator' => 'sections' ]` — the one block whose template will emit `data-herd-section`. Titles come from the row's heading sub-field, falling back through `preheading`, `subheading`, then `Section {n}`. Filter: `herd_editor_preview_section_fields`.

### 5. `herd_editor_block_metadata()` — `herd-editor.php:446`

Add one line: `'description' => $type ? (string) $type->description : ''`. Rendered verbatim, per the decision. `acf/highlight-list` has none and so gets the settings list alone; the 40 boilerplate descriptions are worth a copy pass, separately.

### 6. `window.HerdEditor` — `herd-editor.php:749`

Add `'previewNonce' => wp_create_nonce( 'herd_editor_block_preview' )`.

## Theme: the section anchor

Two additive edits in `wp-content/themes/herdpress`:

- `views/partials/alternator-content.twig` — pass `section_index: loop.index0` into the `components/alternator-item.twig` include.
- `views/components/alternator-item.twig:38-43` — on the wrapper `div` that already carries `data-media-side`, add `{% if section_index is defined %}data-herd-section="{{ section_index }}"{% endif %}`.

`alternator-item.twig` is shared — `acf/basic-content` and `acf/scrolling-content` also include it, and so does `views/layouts/alternator.twig`. The guard keeps it inert for all of them: nothing passes `section_index` but the alternator's own loop. Adding a rail to `acf/scrolling-content` later is one line in that template plus one entry in the filter map.

No other theme output changes. No front-end behaviour changes.

## Client

### `src/ui/BlockRow.js`

`.herd-block__tools` currently renders only when `structural` and holds duplicate + delete. Change it to render whenever `canPreview || structural`:

```
[preview] │ [duplicate] [delete]
```

Preview is a `dashicons-visibility` `IconButton` with ``label: `Preview ${title}` `` and an explicit `title: 'Preview block'` (props spread after `title` in `IconButton`, so this overrides). `aria-pressed` when the panel is open for this row, styled `.is-on` with the green tint. The `.herd-block__toolsep` hairline is `aria-hidden` and renders only when duplicate/delete are present.

Ordering note: there is **no standalone expand icon button** in this editor — the expand affordance is the full-width `.herd-block__open` row button with its chevron at the right edge, immediately left of the tools. So left to right the row reads grip → [icon, name, summary, chevron] → preview → │ → duplicate → delete. That honours the brief's intent (looking-at actions before the divider, delete furthest from the new button) without inventing a second expand control.

New props: `canPreview`, `previewActive`, `onPreview`.

### `src/ui/PreviewPanel.js` (new)

Portalled to `document.body`, not into `form#post` — every control is `type="button"` regardless. `role="dialog"`, `aria-labelledby`, **no** `aria-modal`, **no** focus trap. Light scrim (`rgba(29,35,39,.12)`), click-to-close.

Structure, per the prototype: header (kicker `Block N of M · Preview`, block title, widen toggle, close) → toolbar (viewport segmented control left, zoom right, both real `aria-pressed`) → body (rail when sections exist, else the stage takes full width) → "How this block works" collapsed by default → footer (prev/next steppers, "See it on the page", primary "Edit fields").

- **Stage** — an `<iframe>` at `frameUrl`, `width` from the viewport choice (1280 / 834 / 390), `height` from the posted content height. Changing viewport resizes the iframe; it **never** refetches. Fit applies `transform: scale()` with `transform-origin: top left`; 100% also turns widen on. The caption reads `Desktop · 1280px · 84% · uses your unsaved changes`.
- **Widen** — 620px ↔ 1180px, `max-width: 96vw`, persisted to `localStorage` under `herd-editor-preview-wide` in a `try/catch`. Not varied by block type.
- **Rail** — buttons scroll the stage to `[data-herd-section="{i}"]` inside the frame (same-origin, so `contentDocument` reach is fine); an `IntersectionObserver` inside the frame reports the current section back by `postMessage`. Keyboard navigable, `aria-current` on the active item.
- **Keyboard** — `Esc` closes; `↑`/`↓` step blocks while open; steppers disable at the ends.
- **Focus** — to the close button on open, back to the originating preview button on close.
- **States** — loading skeleton with the chrome fully rendered; empty-state message plus an "Edit fields" button (no empty iframe); error state naming what failed with a Retry, chrome still usable, and **never** a fall back to saved content.

### `src/ui/preview.js` (new, pure — this is where the tests live)

`previewKey( block )` (stable stringify of `{ name, data }`), `formatSetting`, `sectionLabel`, `scaleFor( available, viewportWidth, zoom )`, `stepIndex`. No DOM, no React — matching how every tested module in this repo is written.

### `src/ui/App.js`

- `preview` state: `{ clientId, viewport, zoom, wide, hiw, section }`.
- A `Map<clientId, { key, payload }>` cache so stepping back and forth over unchanged blocks does not refetch; `AbortController` aborts the in-flight request when the user steps away.
- Nothing fetches until the panel opens for that block.
- "Edit fields" closes the panel and adds the clientId to `openPanels`.
- "See it on the page" presses core's `#post-preview` button, the same way `src/ui/ViewMenu.js:94-103` does. That is the only preview route in this codebase reflecting unsaved changes, and it is a form POST with no URL to append a fragment to — so no anchor. Do not build a second preview URL.
- Preview is offered only for rows whose adapter is `acf` and whose type is registered — the endpoint renders nothing else.

### `src/css/_preview.scss` (new) + `@use` in `src/editor.scss`

Existing tokens only: `--herd-green`, `--herd-green-ink`, `--herd-green-tint`, `--herd-line`, `--herd-line-soft`, `--herd-ink*`, `--herd-r`, `--herd-canvas`. 13px base. No new ramps, no new type scale. Focus is `2px solid var(--herd-green-ink)` with 1px offset on every control. `@media (prefers-reduced-motion: reduce)` drops the drawer transform transition, as the other nine stylesheets already do.

Style-guide notes: `docs/herd-editor-style-guide.md` covers colour, focus and icons but says nothing about a drawer, a scrim, an iframe stage, or a segmented viewport control — those are new components. It also specifies weights 400/500 only, where the prototype uses 600/700; the shipped tokens follow the guide, so the drawer will too.

## Verification

1. `npm test` — new `tests/preview.test.js` covers `src/ui/preview.js` in the repo's `node:test` + `assert/strict` style.
2. `php -l` on the new and changed PHP files.
3. `npm run dev` (not `build`), then in a signed-in browser on a page carrying an Alternator:
   - Open the preview on the Alternator without saving. Edit a section heading in the accordion, close it, reopen the preview — the new text must be there. Then reload the page without saving and confirm the preview shows the *old* text, proving it reads the editor and not the database.
   - Step ↑/↓ through every block on the page. Watch the network panel: no refetch for a block already seen, and the in-flight request aborts when you step away.
   - Toggle desktop/tablet/mobile and confirm **zero** new requests, and that the block's own media queries respond.
   - Fit vs 100%; confirm 100% also widens and the caption percentage tracks.
   - Click a rail item, then scroll the stage — the current item must follow.
   - Confirm Alpine is alive in the frame: preview a `cards-collection` and an `accordion` and check the rows are visible and interactive rather than `x-cloak`ed away. Then a `tabs` and a `rankings` in carousel mode, to prove the per-block scripts enqueued inside the render callback actually printed.
   - Confirm `mu-animate.js` revealed the `data-animate` elements — a `splash` or `highlight-list` must not sit at `opacity-0`. The iframe is sized to full content height, so everything should be in view at load; if not, that is the IntersectionObserver root and needs a look.
   - Force a failure (temporarily reject in the handler) and confirm the error state with Retry, the panel staying usable, and no stale HTML.
   - Preview a block with nothing filled in and confirm the empty state, not an empty iframe.
   - Keyboard only: tab to a preview button, Enter, Esc, and confirm focus returns to that button. Confirm the drawer does not trap focus and the rail is reachable.
   - `Edit fields` closes the drawer and expands that row.
   - `See it on the page` opens core's preview in a new tab carrying unsaved changes.
4. Confirm no regression to drag-and-drop, the accordion panels, or the header bar — none of which this touches.

## Out of scope

The header bar, the accordion editing panel, field controls, drag-and-drop, front-end block rendering beyond the one Alternator anchor attribute, full-page preview, header viewport preview, and inserter previews.
