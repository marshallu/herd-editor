# Toggle control audit

Every on/off setting in the block editing surface, classified against one decision rule, with the failures called out and their fixes recorded.

## How to read this

A pill grid is correct when it holds a **set**: a named group of peers that are all self-contained on/off switches, none excluding another, none causing anything else on screen to appear or disappear. The failure mode is a chip sitting alone or in an exclusive pair among labeled form fields — a rounded chip is set grammar, and alone it promises a choice that isn't there.

Rules, applied in order, stopping at the first that fires:

| # | Rule | Failure |
|---|---|---|
| 0 | **Existence** | Duplicates state another control already expresses, or has no consequence at all. Delete it. |
| 0b | **Label sanity** | A bare adjective is a value with its noun missing, which usually means a hidden second option. |
| 1 | **Exclusivity** | Turning it on should turn another off — one decision, not two checkboxes. → segmented (2–3) or select (4+). |
| 2 | **Consequence** | It reveals, hides, or requires another field. Must leave the grid and sit above what it reveals. |
| 3 | **Membership** | Passes 1 and 2 → pill if it's part of a named set; plain checkbox otherwise. |

## Where the toggles actually live

The `herd-editor` plugin **defines no boolean settings an editor ever sees**. It has no `block.json` attribute schemas, no `ToggleControl`, no options screen. It is a shape-driven re-skin of ACF's server-rendered block forms: it fetches form HTML over AJAX, rearranges the DOM, and restyles it. Every toggle in this audit is an ACF `true_false` field in `themes/herdpress/acf-json/`.

One exception, and it is not a content toggle: the plugin registers **Open by default** as an ACF *field setting* on the Group field type (`herd_editor_group_setting()`, `herd-editor.php`), under Presentation. It is seen only in the ACF field group admin, by whoever builds the field group; it decides which fold Herd opens on load and writes nothing to a post. The rules below do not apply to it.

Two consequences follow, and they set the scope of this audit.

**Rules 2 and 3 are already enforced generically.** `roleOf()` (`src/ui/acf/layout.js:61`) reads ACF's own `data-conditions` JSON and routes any `true_false` that *gates* other fields out of the pill row into a full-width `herd-switchrow`, adjacent to what it reveals. Being *gated* is not the test — only gating. Nothing needed building for the consequence rule; 17 of the 167 booleans are already relocated this way.

**The segmented control is already fully generic.** `decorateButtonGroups()` (`src/ui/acf/controls.js:135`) upgrades *any* `.acf-field-button-group` with 2–4 non-colour choices into a real `role="radiogroup"` with roving tabindex and arrow/Home/End keys, dispatching a bubbling native `change` so ACF's conditional logic and the serializer both fire. "Type of Call-to-Action" gets its segmented control for free. **There is no bespoke component and nothing to extract** — converting a `true_false` to a `button_group` produces the target control with zero plugin code.

Scope: `acf/*` **block forms only**. That is the entire pill-row surface — `layoutBlockForm()` early-returns unless the form carries `.acf-block-fields` (`layout.js:96`), so page-level groups (More Info, Theme Settings, Program Page Meta) render as raw ACF switches and never become pills.

There are **65 registered `acf/*` blocks** carrying **167 booleans** between them: 102 declared by the blocks' own field groups, plus the universal `hide_block` on each of the 65. Every count here comes from the runtime ACF registry rather than the `acf-json` files, because the two disagree — six field groups outlive the blocks they were written for.

## Sets report

Every block silently receives a universal `hide_block` pill from `group_herdpress_hide_block` (`themes/herdpress/inc/blocks.php:381-427`), so each block's set count is *its own pills + 1*.

| Block | Display options members | Count header reads |
|---|---|---|
| `acf/hero` | 10 + `hide_block` | `N of 11 on` |
| `acf/salesforce-form` | 8 + `hide_block` | `N of 9 on` (see the duplicate-`hide_block` bug) |
| `acf/basic-content` | 6 + `hide_block` | `N of 7 on` |
| `acf/cards-collection` | 4 + `hide_block` | `N of 5 on` |
| `acf/gravity-form` | 4 + `hide_block` | `N of 5 on` |
| `acf/billboard` | `animate` + `hide_block` | `N of 2 on` |

Totals across the 65 registered blocks: **128 pills, 17 switch rows, 22 nested** — 167 in all. The three largest sets after Hero are Salesforce Form (9), Basic Content (7), and Cards Collection and Gravity Form (5 each). Twenty-nine blocks have `hide_block` as their only boolean and show `N of 1 on`.

Judged by section, not by block: Display options is a stable named part of the product whose membership varies by block type, so a block showing "0 of 2 on" is a legitimate set. Low count is not disqualifying — failing rule 1 or 2 is, and those members are already relocated automatically. **No member currently in a pill grid fails rule 2.** The members that fail rule 1 or 0b are listed below.

The denominator is dynamic: `update()` (`layout.js:135-143`) excludes pills that ACF's conditional logic has inline-hidden, so M changes as you toggle upstream fields. A latent edge exists where every pill is hidden and the section renders an empty "0 of 0 on" header, but it is unreachable in practice because `hide_block` is never conditional.

## Production usage

Measured, not assumed — parsed from `post_content` across all 47 site tables of the local multisite (1,138 ACF block instances). Two of these change a migration.

| Check | Result |
|---|---|
| Billboard `background_image_layout` × `modern` | 56 Split · 6 Grid · 5 Modern · **0 invalid** — the both-on combination never occurs |
| Salesforce `online_rfi`/`grad_rfi`/`aviation_rfi` | 26 instances, **never more than one on** — already used as an enum, but nothing enforces it |
| `animate` | on in **0** of 67 Billboards, 0/254 Heroes, 0/47 Cards, 0/164 Basic Content |
| Cards `card_style` | one block stores `standard`, a value **ACF no longer offers** (choices are `minimalist`/`icon`/`enhanced`). `CARD_STYLES` matches ACF exactly, so the orphaned value simply drops out of the summary |

## Highest-impact findings

Ordered by how broken the current state is. Only #1 is implemented in this pass.

1. **Billboard `background_image_layout` + `modern` — rule 1.** Two independent switches encoding one 3-outcome layout decision. `views/blocks/billboard.twig:8,9,92,154` is a nested if/else spanning the whole file, and `source/css/_blocks/billboard.css:1-5` says so outright: *"Three layouts: modern (bg image), classic (split), default (grid)."* **Fixed.**
2. **Salesforce `online_rfi` / `grad_rfi` / `aviation_rfi` — rule 1.** The worst failure in the set: three *independent* pills read as an if/elseif chain (`blocks/salesforce-form/callback.php:21,54`, `salesforce-form.twig:237`). Nothing stops an editor saving all three; `online_rfi` silently wins. → one 4-option select (Default / Online / Graduate / Aviation). Production data makes this migration clean.
3. **`modern` as a bare adjective across five blocks — rule 0b.** Billboard, Billboard Fact Row, Testimonial, Featured Video, Video Grid. Each is a top-level `{% if fields.modern %}` swapping the entire template — i.e. `Style: Classic | Modern`.
4. **Salesforce Form declares its own `hide_block`** (`acf-json/group_6660ae86a5ba1.json:680`) *and* receives the universal one — two identically-labeled pills on one form colliding on the same serialized name. Only the universal one drives the `pre_render_block` short-circuit; `salesforce-form.twig:9` reads whichever ACF wins.
5. **Dead toggles — rule 0**, controls with no consequence at all:
   - `acf/video-grid` `modern` — never read by `video-grid.twig`.
   - `acf/billboard-fact-row` `this_is_a_graphic_not_a_photo` — the twig reads `fields.image_graphic` at `:66`, a name that does not exist in this group.
   - `acf/billboard` `photogrid_placement` — defined and gated, never read.
   - `acf/billboard` `video.show_title` — never passed to `components/video.twig`. **Fixed.**
   - `acf/link-cards` and `acf/multi-cta` — field groups with **no registered block**. Their `hide_buffalo` toggles cannot appear anywhere. Four further orphan groups target unregistered marsha-era blocks (`acf/hero-area`, `acf/image-text-list`, `acf/landing-page-programs`, `acf/solo-text`). Delete the groups or restore the blocks.
6. **Cards `fancy` / `really_black` — rule 0b.** Bare adjectives; `fancy` (gated to Minimalist) and `searchable` (gated to Enhanced) can never both be visible.

**Nested booleans bypass the rules entirely.** 22 of the 167 sit inside an ACF `group` or `repeater`. `layoutBlockForm()` roles only direct children of `.acf-block-fields` (`layout.js:106`), so a nested `true_false` picks up the pill *styling* (the CSS selector is depth-agnostic) but is never moved into Display options, never counted in the header, and never checked for whether it gates anything. Worth a follow-up; not a per-setting verdict.

## Inventory

Built from the **runtime ACF registry** — `acf_get_field_groups( array( 'block' => ... ) )` for every block in `WP_Block_Type_Registry` — not from the `acf-json` files. The two disagree, and the registry is what the editor actually renders. See "Correction" below.

Verdicts: `keep-pill`, `keep switch row`, `→ segmented`, `→ select`, `→ plain checkbox`, `keep as-is`, `unclear`.

`unclear` is used where the code does not settle the question — a wrong exclusivity call silently deletes a valid configuration, so it is the better answer than a confident guess.

**Counts.** 65 registered `acf/*` blocks, all 65 carrying at least one boolean; **167 booleans** in total. That is 102 declared by the blocks' own field groups plus the universal `hide_block` on each of the 65.

#### `acf/alerts`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `closeable` | Make Closeable | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/alternator`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `use_video` | Use Video | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `sections` — never reaches the pill row (see the nested-fields finding). |
| `image_graphic` | Image is a Graphic | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `sections` — never reaches the pill row (see the nested-fields finding). Conditionally shown. |
| `show_title` | Show Title | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `video` — never reaches the pill row (see the nested-fields finding). |
| `use_dropdown` | Use Dropdown Call to Action | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `sections` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/banner`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `fun_background` | Fun Background | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/basic-content`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `use_background_image` | Use Background Image | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. |
| `fixed_background` | Fixed Background | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `image_graphic` | This is a graphic, not a photo | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `show_whole_photo` | Show Whole Photo | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `show_title` | Show Title | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `video` — never reaches the pill row (see the nested-fields finding). |
| `cta_links` | Call-to-Action Links | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. |
| `list_links` | List Links | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. Conditionally shown. |
| `less_horizontal_padding` | Less Horizontal Padding | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `animate` | Animate | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/billboard`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `include_photos` | Include Photos | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. Conditionally shown. |
| `include_video` | Include Video | switch row | `keep switch row` | 2 | **Fixed** — was a silent no-op in the Split layout; now gated to the layouts that read it. Conditionally shown. |
| `show_title` | Show title | nested — raw ACF toggle | `keep as-is` | 0 | **Fixed** — was dead; now passed through, default corrected 0 → 1. |
| `animate` | Animate | pill | `keep-pill` | 3 | Passes all three. On in **0 of 67** live Billboards. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/billboard-fact-row`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `modern` | Modern | switch row | `→ segmented` | 0b | Bare adjective. `Style: Classic | Modern`. |
| `use_video` | Use Video | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. Conditionally shown. |
| `this_is_a_graphic_not_a_photo` | This is a graphic, not a photo | pill | `unclear` | 0 | Dead — the twig reads `fields.image_graphic`, which does not exist here. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/blog`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/blog-cta`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `cropped_image` | Cropped Image | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/cards-collection`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `searchable` | Searchable | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `animate` | Animate | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `fancy` | Fancy | pill | `→ segmented` | 0b | Bare adjective; gated to Minimalist, exclusive with `searchable`. Conditionally shown. |
| `really_black` | Really Black | pill | `→ segmented` | 0b | Bare adjective — a colour value, not a thing. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/categorized-list`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `pretty_lists` | Pretty Lists | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/checklist`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `display_as_grid` | Display as Grid | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/dean-note`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `minimal` | Minimal | switch row | `→ segmented` | 0b | Bare adjective with a hidden alternative. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/feature-video`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `modern` | Modern | switch row | `→ segmented` | 0b | Bare adjective. |
| `show_title` | Show Title | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `video` — never reaches the pill row (see the nested-fields finding). |
| `video_has_sound` | Video Has Sound | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `video` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/gravity-form`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `rfi_form` | RFI Form | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. |
| `show_title` | Show Title | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `show_description` | Show Description | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `dynamic_form` | Dynamic Form | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `add_top_green_border` | Add Top Green Border | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/hero`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `primary_video` | Primary Button YouTube Video | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `buttons` — never reaches the pill row (see the nested-fields finding). |
| `primary_video_link` | Primary Video Link | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `buttons` — never reaches the pill row (see the nested-fields finding). |
| `secondary_video` | Secondary Button YouTube Video | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `buttons` — never reaches the pill row (see the nested-fields finding). |
| `condensed_height` | Condensed Height | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hide_breadcrumbs` | Hide Breadcrumbs | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `heavy_overlay` | Heavy Overlay | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `live_your_marshall_moment_header` | Live Your Marshall Moment Header | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `short_video` | Short Video | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `animate` | Animate | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `center_heading` | Center Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `show_celebrate_button` | Show Celebrate Button | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `coffee_mug_overlay` | Coffee Mug Overlay | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hero_homepage` | Homepage | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/highlights`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `include_image` | Include Image | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/html`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `put_in_container` | Put in container | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/link-collection`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/major-search`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `use_version_2` | Use Version 2 | pill | `→ segmented` | 0b | Names a version, not a thing it controls. |
| `online_only_programs` | Online Only Programs | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/metro-tuition-checker`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `show_accordions` | Show Accordions | switch row | `keep switch row` | 2 | Gates other fields; already routed out of the pill row by `isStructural`. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/moments`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `on_news_center_page` | On News Center Page | switch row | `unclear` | 1 | Likely exclusive with `on_university_homepage`; both gated on the same layout. Conditionally shown. |
| `on_university_homepage` | On University Homepage | switch row | `unclear` | 1 | See `on_news_center_page`. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/news-lists`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `show_link_to_more` | Show Link to More | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `lists` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/page-with-sidebar`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `use_video` | Use Video | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `sections` — never reaches the pill row (see the nested-fields finding). |
| `use_dropdown` | Use Dropdown Call to Action | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `sections` — never reaches the pill row (see the nested-fields finding). |
| `show_icon` | Show # prior to ranking | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `rankings` — never reaches the pill row (see the nested-fields finding). |
| `display_as_grid` | Display as Grid | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `main_content` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/photo-grid`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `magazine` | Magazine | pill | `→ segmented` | 0b | Bare adjective. `Layout: Grid | Magazine`. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/profiles`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `display_contact_for` | Display Contact For | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `tighter_topbottom_padding` | Tighter Padding | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/program-listing`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `online_only` | Online Only | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `include_doctoral` | Include Doctoral | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `group_by_degree_level` | Group by Degree Level | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/rankings`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `show_icon` | Show # prior to ranking | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `rankings` — never reaches the pill row (see the nested-fields finding). |
| `display_as_grid` | Display as Grid | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/salesforce-form`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `split_panel` | Split Panel | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `required` | Required | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `form_fields` — never reaches the pill row (see the nested-fields finding). |
| `include_sms` | Include SMS Opt-in Checkbox | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `form_fields` — never reaches the pill row (see the nested-fields finding). Conditionally shown. |
| `debug_form` | Debug Form | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `form_data` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `→ plain checkbox` | 0 | **Duplicate** of the universal `hide_block`, same serialized name. Delete this one. |
| `add_top_green_border` | Add Top Green Border | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `online_rfi` | Online RFI | pill | `→ select` | 1 | With `grad_rfi`/`aviation_rfi`, one form-variant decision read as an if/elseif chain. |
| `grad_rfi` | Grad RFI | pill | `→ select` | 1 | See `online_rfi`. `online_rfi` silently wins when both are on. |
| `aviation_rfi` | Aviation RFI | pill | `→ select` | 1 | See `online_rfi`. Read only in the twig, at `:237`. |
| `use_recaptcha` | Use Recaptcha | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `webtocase` | WebToCase | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `→ plain checkbox` | 0 | **Duplicate** of the universal `hide_block`, same serialized name. Delete this one. |

#### `acf/scrolling-content`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `animate` | Animate | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/shortcode`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `default_vertical_padding` | Default Vertical Padding | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/slate-form`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_slate_title` | Hide Title from Slate | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/social`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/stacked-cards`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `include_note` | Include Note | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `cards` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/table`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `add_border` | Add Border to Table | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `alternate_stripe` | Alternate stripe rows | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/testimonial`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `modern` | Modern | switch row | `→ segmented` | 0b | Bare adjective; one decision with `stacked_vertically`, which is gated on it. |
| `stacked_vertically` | Stacked Vertically | switch row | `→ segmented` | 1 | Only reachable when not Modern. Fold into the same Style control. Conditionally shown. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/timeline`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `hide_heading` | Hide Heading | pill | `keep-pill` | 3 | Dependency-free member of the Display options set. |
| `compact` | Compact | pill | `→ segmented` | 0b | Bare adjective. `Density: Standard | Compact`. |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### `acf/video-grid`

| Setting | Label | Current control | Verdict | Rule | Notes |
|---|---|---|---|---|---|
| `modern` | Modern | switch row | `unclear` | 0 | Dead — `video-grid.twig` never reads it. |
| `show_title` | Show Title | nested — raw ACF toggle | `keep as-is` | 3 | Nested in `videos` — never reaches the pill row (see the nested-fields finding). |
| `hide_block` | Hide Block | pill | `keep-pill` | 3 | Universal member of every Display options set; grey, not green. |

#### Blocks whose only boolean is the universal `hide_block`

All `keep-pill`, rule 3 — each shows a Display options section reading `N of 1 on`.

`acf/accordion`, `acf/accreditation-block`, `acf/blockquote`, `acf/call-to-action`, `acf/contact-grid`, `acf/content-with-sidebar`, `acf/expandable-content`, `acf/feature-items`, `acf/find-my-counselor`, `acf/highlight-list`, `acf/icon-box`, `acf/iframe`, `acf/list-with-content`, `acf/localist`, `acf/logo-grid`, `acf/media-and-text`, `acf/mosaic`, `acf/portraits`, `acf/posts`, `acf/price-hero`, `acf/professor-spotlight`, `acf/program-page-content`, `acf/splash`, `acf/split-feature`, `acf/tabs`, `acf/teaser`, `acf/value`, `acf/visual-editor`


## Template reads verified against the registry

Every `views/blocks/*.twig` was swept for `fields.X` reads and checked against the block's runtime fields. **35 of the 65 templates read at least one field their block does not have**, which always renders as empty rather than erroring — so these fail silently.

Two caveats keep this honest. `alerts.twig` is a **false positive**: its reads of `fields.new` and `fields.general_alert` are deliberate backwards compatibility, documented in the template's own header, exactly like the `background_image_layout` backfill added in this pass. It is the only template in the set that documents such intent. And the sweep reports a *read*, not a *bug* — a handful may be intentional in the same way without saying so.

The findings that were verified individually:

| Block | Dead reads | Note |
|---|---|---|
| `acf/teaser` | `background`, `background_style`, `preheading`, `subheading`, `items`, `image` | **The block has no field group at all** — only the universal Block Visibility. Its entire template is reading fields that were never registered, and there are 3 live instances. |
| `acf/hero` | `meta_infomation`, `program_type`, `custom_nav_over_hero`, `custom_navigation_items` | `get_fields()` in a block callback returns only that block's fields; `meta_information` belongs to the Program Page CPT. `meta_infomation` is also misspelled. |
| `acf/billboard` | `hide_heading`, `content` | Neither is a Billboard field. `sr_only: fields.hide_heading` is therefore always falsy, and the `fields.content` WYSIWYG block never renders. |
| `acf/billboard-fact-row` | `image_graphic`, `hide_heading`, `use_background_image`, `fixed_background` | `image_graphic` is the group's `this_is_a_graphic_not_a_photo` under a different name, so that toggle does nothing. |
| `acf/video-grid` | `hide_heading` | Plus `modern`, which the block *does* declare but the template never reads — confirmed by grep. |

The most common shape is `hide_heading` and `preheading`, each read by roughly twenty templates whose blocks do not declare them — copy-paste drift from the blocks that do. Worth a sweep of its own; it is not a toggle-control question.

## Correction: what the first version of this table got wrong

The first inventory was generated from `themes/herdpress/acf-json/*.json`. Reading the schema files rather than the runtime registry produced four errors, all now fixed above.

- **Two blocks that do not exist.** `acf/link-cards` and `acf/multi-cta` have field groups but no block directory, no entry in the theme's allowlist, and no registration. Their `hide_buffalo` toggles can never appear in any editor. They were listed as real settings. Four more orphan groups point at unregistered marsha-era blocks (`acf/hero-area`, `acf/image-text-list`, `acf/landing-page-programs`, `acf/solo-text`).
- **Twenty-nine registered blocks omitted entirely**, because the table only covered blocks whose *own* field group declared a boolean. Every one of them still shows a Display options section, because every block gets `hide_block`.
- **`acf/page-with-sidebar` omitted**, and it is not trivial — it declares four booleans (`use_video`, `use_dropdown`, `show_icon`, `display_as_grid`) inside flexible-content layouts. The original walk did not descend into `layouts`.
- **`hide_block` missing from every row list.** It was described in prose and counted in the sets table, but never given a row, so each block's per-block count read one short.

The lesson is the same one the editor-load bug taught: `acf-json` is a serialization of intent, not a statement of what is registered. A field group can outlive its block, and a block can load fields the JSON directory does not describe. Verify against the runtime registry.


---

# Changes made

Three changes, all on `acf/billboard`. Written for someone who wasn't in the conversation.

## Layout: three booleans' worth of states, one control

**Was:** two independent pill-shaped switch rows, `Use Background Image` and `Modern`, the second only appearing when the first was on. **Now:** one segmented control, `Layout: Grid | Split | Modern`. **Rule 1 fired** (exclusivity), with rule 0b as the way in — "Modern" is a bare adjective, and a bare adjective is a value whose noun has gone missing, which nearly always means there's an unshown alternative. There was: the not-Modern case renders a 50/50 split, which the CSS has called "classic" all along.

The template was already a three-way switch pretending to be two switches — `billboard.twig` opens with a nested if/else that spans the entire file, and `_blocks/billboard.css` documents it in its header comment as *"Three layouts: modern (bg image), classic (split), default (grid)."* Presenting that as two checkboxes meant an editor had to learn by experiment that Modern silently disables Background Color, Content Placement and Animate, and it left one combination representable that nothing could render. **What the editor can now do:** see all three layouts at once and pick one, instead of discovering the third by turning off a switch. **What they can no longer wrongly do:** save `modern` on with no background image — a state the old form could reach and the front end quietly resolved to the grid.

## Include video: no longer offered where it does nothing

**Was:** a switch row, always shown, revealing a four-field Video group. **Now:** the same switch row, hidden in the Split layout. **Rule 2 fired** (consequence) — inverted: a control that reveals fields whose values are then never read is a control with no consequence, and it should not be on offer. `billboard.twig`'s split branch never reads `include_video` or the video group at all, so an editor could switch it on, fill in a YouTube ID, a title, a poster image and a preview clip, save, and get nothing. Worth knowing for anyone reading the template: `include_video` means three different things across the three layouts — in Modern the video sits *alongside* the background image, in Grid it is mutually exclusive with `include_photos` via an `elseif`, and in Split it was dead. Only the Grid branch passes the poster and preview clip through.

## Show title: a dead control that was also wired backwards

**Was:** a toggle inside the Video group that was never read — `billboard.twig` never passed it to `components/video.twig`, which defaults it to true, so titles always showed. **Now:** passed through at both include sites, and its default corrected from `0` to `1`. **Rule 0 fired** (existence). The correction is the important half: wiring the toggle up while it still defaulted to `0` would have flipped both live videos from showing their title to hiding it — a content regression dressed as a bug fix. The field's default now matches what the component has actually been doing, so existing content is untouched and the toggle does what its label says for the first time.

---

# Verification

The change is safe for existing content because the render path derives `layout` from the old pair whenever the new field is absent (`herdpress_billboard_layout()`), rather than cutting over. `background_image_layout` wins over `modern`, because that is the precedence the template's outer condition already had. That makes the data migration optional, idempotent and reversible, and it means the 99 revision rows restore correctly without being touched.

Both directions were checked against all 67 live Billboard blocks across the 47-site local multisite:

| Check | Result |
|---|---|
| Old data + new code, rendered and diffed against a pre-change baseline | **67/67 byte-identical** |
| Migrated attributes vs. stored attributes, rendered and compared in memory | **67/67 identical, 0 differing** |
| `npm test` | **87 passing**, including a new test covering all four input combinations of the mapping |
| Migration dry run | 6 grid · 56 split · 5 modern = 67, matching the content analysis |
| Editor form value vs. rendered layout, all live blocks | **67/67 match** (61 mismatched before the `pre_load_value` fix) |

`tools/migrate-billboard-layout.php` is dry-run by default and rewrites only the `acf/billboard` block comments it matches, never reserializing the surrounding document. Re-running it is a no-op.

## The gap those checks missed

Rendering was verified on the front end, where the backfill lives in the render callback. The **editor form** loads values by a different path, and it was wrong: ACF substitutes a field's `default_value` *before* `acf/load_value` runs, so an un-migrated block — having no `layout` value at all — loaded as Grid. The segmented control showed Grid for every block the front end renders as Split or Modern, and because the editor serializes the form back into the block, **saving that form would have written Grid over the real layout**. 61 of the 67 live blocks were affected.

Fixed with `herdpress_billboard_pre_load_layout()` on `acf/pre_load_value`, which runs before the default is substituted — the only point where a stored value and a defaulted one can still be told apart. `tools/verify-billboard-layout.php` checks every live block against what it renders, and reports 61 mismatches with the filter removed against 0 with it in place.

The lesson generalises to the rest of this audit: for any boolean collapsed into an enum, a render-path backfill is only half the job. The editor needs the same mapping at `acf/pre_load_value`, or the control lies and then makes the lie true on save.

Still to do, needing a signed-in browser: confirming that Layout renders as a segmented control with arrow-key navigation and a visible focus ring, that switching to Grid reveals Include Photos and hides Background Color, that Display options still reads `N of 2 on`, and that a migrated post round-trips through the Block and Classic editors unchanged.
