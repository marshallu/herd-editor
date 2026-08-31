# Herd Editor style guide

The design system for the Herd Editor — the ACF block editing layer that replaces the iframed Gutenberg canvas in WordPress admin.

The editor lives *inside* the WP admin shell, not beside it. Everything here is calibrated to sit next to core admin chrome without looking grafted on: same base font size, same border color, same control heights. The one deliberate departure is the accent, which is Marshall green instead of WordPress blue.

---

## 1. Principles

**Match WP admin metrics, replace WP admin color.** 13px base, 6px radius, `#dcdcde` hairlines. Core blue never appears. If a control looks native but reads green, it's right.

**Weight follows importance.** The failure mode of the old editor was that every metabox, every field, and every revision line had identical visual weight. Nothing should be as loud as the thing an editor actually came to change.

**Collapsed is the default state.** Blocks are rows. Repeater items are rows. A row carries enough summary that you don't have to open it to know what's inside. Opening is a deliberate act, and only one thing needs to be open at a time.

**Green is the only accent.** It marks selection, active state, and the primary action. It never decorates. If two things on screen are green and only one of them is actionable, one of them is wrong.

**Empty is information.** An empty field should be visibly empty and cheap to skip, not a 400px void that costs the same scroll as a full one.

---

## 2. Color

### Tokens

```css
:root{
  --mu-green:      #00B140;  /* brand green — fills, selected swatch, status dot */
  --mu-green-ink:  #04742D;  /* text and primary button — AA on white */
  --mu-green-tint: #E9F7EE;  /* selected background, active segment, notices */
  --mu-green-line: #A9DDBD;  /* border on tinted surfaces */

  --ink:      #1d2327;  /* primary text, admin chrome */
  --ink-2:    #50575e;  /* labels, secondary text, icon buttons */
  --ink-3:    #7d838a;  /* summaries, hints, placeholders, metadata */

  --line:      #dcdcde;  /* default hairline — matches WP core */
  --line-soft: #eceded;  /* internal dividers inside a bordered container */
  --surface:   #ffffff;  /* cards, inputs, block bodies */
  --canvas:    #f0f0f1;  /* page background, thumbnails, hover fills */

  --chrome:   #1d2327;  /* admin bar and menu */
  --chrome-2: #2c3338;  /* admin menu hover */

  --danger:      #b32d2e;  /* error and destructive — "this needs your attention" */
  --danger-tint: #fcf0f1;  /* validation surface: incomplete group header, badge */
  --danger-line: #f0b8b8;  /* border on a validation surface */

  --r:     6px;
  --bar-h: 32px;
}
```

### Rules

`--mu-green` is a fill, `--mu-green-ink` is text. Never set green text on white using `--mu-green` — it fails contrast at 13px.

One red, two meanings, and both of them are "this needs your attention": validation and destructive action.

As **validation**, `--danger` is a resting state — the required asterisk, an errored input, an incomplete group's header and badge. It is the only place the tint and line are used.

As **destructive**, it is a hover state and never a resting one: destructive actions are `--ink-3` at rest and `--danger` on hover. A trash icon that is always red reads as an error state on a page with nothing wrong.

Warnings and empty-state flags use gray (`--line-soft` fill, `--ink-2` text), not amber. Amber is not in the palette, and "this card has two empty fields" is information, not a problem.

Never introduce a color to differentiate content. Card thumbnails, style previews, and placeholder tiles are all `--canvas` with an `--ink-3` glyph. Color that stands in for a photo teaches editors that color means something.

---

## 3. Typography

Inherit the WP admin stack. Do not load a webfont into admin.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title (editable) | 17px | 500 | `--ink` |
| Block name | 13px | 500 | `--ink` |
| Body, inputs, card names | 13px | 400 | `--ink` |
| Buttons, selects, pills | 12px | 400 | `--ink-2` |
| Field labels | 11px | 400 | `--ink-2` |
| Summaries, hints, counts | 11px | 400 | `--ink-3` |
| Slug, URLs | 11px | 400 | mono, `--ink-3` |

Two weights only, 400 and 500. Nothing bolder — 600 and 700 look heavy against core admin.

Sentence case everywhere, including buttons and labels. "Add card", not "Add Card". Proper nouns only.

Never go below 11px. The 11px tier is already the floor and it is only for metadata.

Monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`) is reserved for URLs and slugs — anything the user might need to read character by character.

---

## 4. Spacing and metrics

| Thing | Value |
|---|---|
| Control height (input, select) | 31px |
| Button padding | `5px 11px` |
| Radius, all controls | `6px` |
| Radius, inner previews and thumbnails | `4px` |
| Border, everything | `1px solid var(--line)` |
| Block body padding | `14px` |
| Row padding (block row, card row) | `7–9px 10–11px` |
| Field grid gap | `14px 16px` |
| Field grid columns | 12 |
| Pill gap | `6px` |
| Gap between blocks | `8px` |
| Rail width | `268px` |

### The field grid

The field grid is **twelve equal columns** with `minmax(0, 1fr)` — plain `1fr` lets long select options blow out the track.

Twelve, because every width preset has to divide it exactly:

| Width | Columns |
|---|---|
| 100% | 12 |
| 75% | 9 |
| 66% | 8 |
| 50% | 6 |
| 33% | 4 |
| 25% | 3 |

**A field's width is authored, and only authored.** It comes from ACF's own per-field wrapper width — field → Presentation → Wrapper Attributes → Width — which Herd replaces with a segmented control over the six presets above. Storage stays ACF's, so widths survive export, `acf-json` sync, Clone fields, and uninstalling Herd.

**Where a field group says nothing, the field takes the whole row.** In all four containers, and whatever its type: a select and a WYSIWYG are the same width until somebody says otherwise. Herd infers no width from anything — not the field's type, not its conditional logic, not the container it is in — so laying a block out is a pass through its field group and nothing else. 100% is stored as ACF's empty string rather than as `100`, so "never set" and "set to 100%" are one state with one spelling.

Fields flow left to right in authored order and wrap when the remaining columns can't hold the next span. Two 66% fields do not pair up — the second wraps and the first row keeps 34% of dead space. That is the behavior, not a bug in it, and the Spacer field is how a field group fills that space on purpose. `grid-auto-flow` stays `row`; `dense` would backfill and reorder the screen away from the tab order.

Rows are reset by any full-width field, by a Tab or an Accordion, and by the start of a repeater row or group body — those are separate grids. Conditional logic hiding a field does *not* reset a row; the field leaves the flow and everything after it slides up.

Below 782px every field goes full width, stated as an override on the children. Dropping the container to one column does not clamp a `span 6` — it generates five implicit columns and a horizontal scrollbar.

This supersedes the earlier two-column grid and its `.span2` escape hatch.

---

## 5. Components

### Command bar

Sticky at `top: var(--bar-h)`. Holds title, slug, save state, status, undo/redo, Preview, Update.

In production use `top: var(--wp-admin--admin-bar--height)` rather than a hardcoded 32px, and test at the 782px breakpoint where the admin bar goes static — otherwise the bar floats over content on tablets.

Title and slug are borderless inputs that reveal a `--canvas` fill on hover. They should not look like form fields until you reach for them.

### Buttons

```
.btn           1px --line border, white fill, --ink-2 text
.btn:hover     border #8c8f94, text --ink
.btn-primary   --mu-green-ink fill and border, white text
.btn-icon      transparent, --ink-3, --canvas fill on hover
```

One `.btn-primary` per screen. That is Update. Add card, Add block, and Edit are all `.btn`. A green Add card competes with Update for the same glance.

Verb first, one to two words, no punctuation. "Add card", "Edit", "Keep minimal", "Switch anyway".

### Accordion block

```
.block          bordered card, 6px radius
.block.open     border #c3c4c7, row gets bottom hairline and --canvas-ish fill
.block.off      .brow-main drops to 50% opacity
```

Row anatomy, left to right: grip, type glyph, name + summary, tools, chevron. Tools are `opacity: 0` until row hover or block open.

**The summary line is the highest-value element in the system.** "Cards collection" twice tells an editor nothing. Summary format is the most identifying field, then the configuration that changes how it looks:

```
Meet the Marshall family · Minimal · 4 cards, 3 per row
Static image · Discover what it means to be part of the Marshall family
Stay up to date · Icon · 3 cards, 3 per row
```

Implement as a `herd_editor_block_summary` filter keyed on block name, with a generic fallback (first text-ish field, truncated) so unregistered blocks still get something.

### Repeater card row

Same pattern one level down: grip, index, thumbnail, name + summary, flag, tools, chevron.

The thumbnail is `34px`, `--canvas` fill, `--line` border. For icon-style cards it shows the selected glyph and updates live when the icon changes.

The `2 empty` flag counts empty fields that are *currently reachable* under the active card style. An Icon card has no image field, so a missing image must not be counted.

**A list of links reads as links.** Eleven of this site's repeaters are a link plus one or two settings that qualify it, and the generic row named them from the link title and then joined the settings into one grey sentence — "Apply Now" over "info-circle" — never showing the URL at all. Where every row is one link and nothing that would have named it first, the row says the two things a link is: the title, the URL beneath it in mono, and each remaining setting as a badge on the right.

Badges are 10px caps. A flag that is on is green and is the row's only accent; a flag that is off says nothing, because "not primary" is not a state anybody needs reported. A choice shows its value in grey, and an *empty* choice still shows one — `NO ICON` — because that is a decision somebody can make from the row. Badge text is the field's own name, not its label: two field groups spell the same flag "Primary CTA" and "Primary Call-to-Action", and a badge has room for neither.

This is a property of the field group, not of the surface. A list of links reads the same in a block panel and in the settings rail.

### Media row

Image and file fields are the same component: a `160 × 90` poster, the file name over an `11px` metadata line, then Edit and Remove. A Video panel holding a thumbnail, a video and a backup video should read as three instances of one control, not three widgets.

The poster carries a frame from the image field beside it — resolved by position, not by field name, so a new block gets it for free. With nothing to show it is `--canvas` and an `--ink-3` glyph, never a colour standing in for a photo. On a video it is a button: pressing it plays the file in a dialog, so an editor can confirm they attached the right cut without leaving the screen. Duration sits bottom-right of the poster, where video players put it.

Metadata is format, dimensions, size, and upload date, dot-separated on one line. All of it comes from `wp.media.attachment().fetch()` — the same call ACF makes — so the field states nothing it has not read.

Both actions are labelled. The bare `✕` is gone from media everywhere: nothing destructive should be a guess.

The empty state is an invitation — "Choose a video" — over the accepted formats, parsed from ACF's own `data-mime_types`. It does not name a size limit: ACF never puts `min_size`/`max_size` in the DOM, and a cap the interface cannot enforce is a promise it cannot keep.

Only one thing earns a status line, and it is grey: a video with an empty thumbnail field, because the consequence is invisible from here. There is no matching green "ready" line — green marks selection and the primary action, and a green dot on every filled field is decoration.

### Mini editor

Four buttons: bold, italic, link, list. Plus a character budget and a "Full editor" escape hatch.

Card blurbs do not need `img`, `code`, `more`, or `close tags`. Fifteen toolbar buttons on a two-line field is the interface telling the editor to write more than the design can hold.

Do not instantiate `wp_editor()` per row. Render static styled HTML and initialize TinyMCE lazily on first focus. Four instances at page load is what makes the current editor crawl; fifteen makes it unusable.

### Link field

Resolved state shows title, then URL, then clear. The row is the edit control — clicking anywhere on it opens the link modal, and its border darkens on hover to say so — so there is no Edit button. The URL is text, not an anchor: a live link inside a form is an invitation to leave the post mid-edit. Clearing keeps its own ✕, because destroying a value should never be what a stray click does. Empty state is a dashed border reading "Choose a link".

ACF's link return array already carries `title`, `url`, and `target`. The current "Select Link" button throws all three away regardless of state — rendering the resolved chip is a template change, not a data change.

The chip is the same control wherever a link renders — block panel or rail postbox — so its rules are written once for every field surface. In a rail repeater it is what an opened row holds; the collapsed row above it is a card row, not a chip.

### Swatches

28px circles with the color rendered, label beneath, check mark on the selected one. Selection ring is `0 0 0 2px var(--surface), 0 0 0 3px var(--ink)` so it reads on both the white and the black swatch.

Text buttons labeled "Green / White / Black / Gray" fail the one job a color control has.

### Segmented control

Shared by cards-per-row and heading position. Active segment is `--mu-green-tint` fill with a `--mu-green-line` inset ring.

For cards-per-row the label is a glyph — 2, 3, or 4 vertical bars — not a number. The glyph shows the outcome; the number describes it.

### Card style picker

Card Style remains ACF's native select. Changing it applies immediately, so
ACF's conditional logic updates the available card fields without an intervening
warning or confirmation step.

### Site-restricted choice

A field group offers the same choices on every site in the network, so a choice only one site may use has nowhere to say so. Profiles' Background offers White and Black everywhere; Black is Cyber's.

Choosing it opens a modal — 420px, title, one sentence, one **Got it**:

> **Black is for the Cyber site**
> A black background on Profiles is only allowed on the Cyber site. Everywhere else, use White.

**The notice warns and does not revert.** Herd is not told which site it is running on, so a guardrail that reverted would take Black away from the one site entitled to it. It fires on the change, never on mount: a block that already carries the value was not set that way just now.

A modal is appropriate here because the editor needs to acknowledge a site rule,
not choose between two outcomes.

### Boolean switch

Booleans render as a small switch — a 30×18 track with a 14px knob, `--mu-green` when on, `#c3c4c7` when off, label to the right at 13px/400.

**A boolean must read as a state in both positions.** This replaced a pill, and the pill's failure is the rule worth keeping: its off state was a white chip with a 1px border and a label inside, which is exactly `.btn`. You had to click it to find out it was a setting and not an action. Green made it worse, because green is also the primary action. Anything proposed for this slot has to survive the same test — cover the on-state and ask whether what is left still looks like a control rather than a button.

The label never changes weight with state. Weight shifts reflow the text as you toggle, and the switch already carries the state.

Grouped under a **Display options** header carrying a count: `2 of 6 on`. The denominator excludes toggles conditional logic has hidden, so it tracks what is actually on offer. Rows pack into `repeat(auto-fill, minmax(210px, 1fr))` columns; at 26px a row, eleven toggles stay one scannable set.

**Only dependency-free booleans go in that list.** A toggle that reveals three more fields when on cannot live in a flat list — the reveal happens somewhere the eye isn't. Those stay in the field flow, directly above what they gate, as a full-width row. This is derived at runtime from ACF's own `data-conditions`, not configured per field.

`Hide block` is the exception to switch coloring — it fills `--ink-3`, since a hidden block is a state, not an enabled feature. It also drops the whole block row to 50% opacity and shows a labeled badge.

The old per-checkbox help text ("When enabled, this block will not be displayed on the frontend") is deleted. It appeared five times on one page and said what the label already said. Where a field does carry instructions, they surface as a hover popover, kept at `opacity: 0` rather than `display: none` so they stay in the AT tree.

### Right rail

A repeater in a rail postbox is the same component as a repeater in a block: collapsed card rows, a header carrying the count and Collapse all, and the add button as an accent rather than a filled green primary. The rail is where it matters most — ACF's own `row` and `table` layouts put a fixed label gutter or a set of columns into 300px, and Custom Nav Items stacked three labelled fields per link, so three links filled the panel.

Fixed `268px`, sticky below the command bar. Editable fields (parent, template) sit on top; read-only facts (status, visibility, publish date, revisions, author) drop to a key/value list. Revisions open in a modal, never inline — the revision dump previously took more vertical space than the page content.

---

## 6. Icons

The prototypes use unicode glyphs as stand-ins. **Ship dashicons** — already loaded in admin, and the glyphs render inconsistently across Windows and macOS.

| Use | Prototype glyph | Ship |
|---|---|---|
| Drag handle | `⣿` | `dashicons-menu` |
| Hide / show | `◎` | `dashicons-visibility` / `dashicons-hidden` |
| Duplicate | `⧉` | `dashicons-admin-page` |
| Remove | `✕` | `dashicons-no-alt` |
| Chevron | `▼` | `dashicons-arrow-down-alt2` |
| Link | `⚯` | `dashicons-admin-links` |

Icons never appear without a `title` and an `aria-label`. Icon-only buttons are the most common accessibility failure in admin UI.

---

## 7. Content and voice

Sentence case. Contractions fine. No terminal punctuation on labels and buttons; helper text and empty states do take a period.

Name things by what the editor controls, not by how the field is stored. "Call to action", not "CTA link field".

Empty states are invitations: "Choose a link", "Short blurb, two lines or so." Not "No link selected" and never "N/A".

Confirmations say what happened, in past tense, without a first person: "Saved". Never "I saved your changes".

Skip "please", "successfully", "simply", and exclamation marks. Skip help text that restates the label.

An action keeps its name through the whole flow. The button that says Update produces the state that says Updated.

---

## 8. Accessibility floor

Focus is visible everywhere: `2px solid var(--mu-green-ink)` with `1px` offset. Never remove the outline.

Boolean switches are the native `<input type="checkbox">` restyled with `appearance: none`, never a styled div — the control keeps its own role, focus and keyboard behaviour. Accordion rows are focusable and respond to Enter and Space.

Every icon-only control has an `aria-label`.

Color never carries meaning alone. The selected swatch has a check, the active segment has a ring, the switch moves its knob as well as changing colour, and the hidden block has reduced opacity *and* a labeled badge.

Honor `prefers-reduced-motion` — the only motion in the system is the chevron rotation and the switch knob, both of which are disabled under the media query.

Contrast: `--ink-3` on `--surface` is the lightest permitted pairing and it is limited to 11px metadata. `--ink-3` never carries a control label.

---

## 9. Integration notes

Sticky positioning fights `#wpadminbar` and the collapsed menu state. Use `var(--wp-admin--admin-bar--height)` and test the 782px breakpoint.

Drag and drop across accordions requires collapsing blocks on `dragstart` and restoring on `drop`, or the drop targets move under the cursor mid-drag.

The editor renders below 1100px by dropping the rail under the main column. The admin menu collapses on its own at 960px — test both breakpoints together, not separately.

Scope every selector under the editor wrapper. WP admin ships a lot of global CSS and `.button`, `.notice`, and `.card` are all already taken by core.
