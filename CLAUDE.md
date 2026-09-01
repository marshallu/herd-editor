# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Herd Editor is a WordPress plugin that adds a third editing mode beside Classic and the Block Editor, for sites whose pages are ACF blocks. It renders the *same* Gutenberg `post_content` — the block list is a set of accordion rows, and opening one mounts that block's real ACF form via ACF's own `acf/ajax/fetch-block` endpoint.

`AGENTS.md` holds the repository's contributor conventions (style, commits, PRs); read it too. `README.md` is the user-facing contract and is unusually authoritative — it documents every filter and every deliberate behaviour. If a change contradicts the README, one of the two is wrong.

## Commands

```sh
npm install && composer install     # JS deps, PHP dev tools
npm run start                       # watch/rebuild bundles during local WP dev
npm run build                       # production bundles into build/
npm test                            # all tests (node:test + jsdom, no build step)
node --test tests/document.test.js  # one test file
composer lint                       # PHPCS, WordPress + VIP rules
composer format                     # PHPCBF; review the diff
```

`composer analyse` is declared in `composer.json` but there is **no `phpstan.neon`** in the repo, so it currently fails with "At least one path must be specified to analyse." Either add a config or don't rely on the script.

The `tools/*.php` scripts are WP-CLI acceptance checks run by hand against a real site, never loaded by WordPress (`wp eval-file tools/verify-spacer.php`). They are excluded from PHPCS. Each asserts claims about *ACF's* behaviour rather than this plugin's, which is why they are tools and not unit tests — they need a live ACF.

**`build/` is committed on purpose.** WordPress VIP runs no build step and Composer installs this as plain files, so compiled assets ship with the package. Run `npm run build` before tagging. Never hand-edit `build/`.

## Architecture

### Two bundles

`webpack.config.cjs` builds two entries:

- `src/index.js` — a tiny `@wordpress/plugins` registration that adds a "Switch to Herd Editor" item to the *Block Editor's* More menu, and honours `window.HerdEditor.blockPath` to select the block you came from.
- `src/herd-editor.js` — the Herd screen itself. Boots in a fixed order: register ACF portal namespaces *before* ACF initialises any field, assemble the rail, dress the meta boxes, install the post lock, then render `HerdEditorApp`. The whole boot is wrapped in `try/finally` so the `herd-editor-booting` class always comes off — that class hides the no-JS layout while the DOM is rearranged.

### The document model (`src/document.js`, `src/controller.js`)

Herd does **not** use `@wordpress/blocks` to parse or serialize. `src/document.js` is a hand-written tokenizer over the `<!-- wp:… -->` comment grammar with one governing rule: **untouched blocks round-trip byte for byte**. Only a block whose attributes actually changed gets a regenerated comment (with WordPress's `<`-style escaping, see `serializeBlockAttributes`). This is what lets a Herd save be safe on a document Gutenberg authored.

`DocumentController` wraps an immutable block tree with undo/redo, coalescing rapid edits to the same block within `coalesceMs`. `dirty` is a string comparison against the serialization at load.

`src/adapters.js` decides what Herd can do with each block: `acf/*` blocks get the real ACF form; core Paragraph/Heading/HTML/Shortcode get light editors; anything else is a read-only fallback.

### The ACF boundary

`src/acf/bridge.js` (`AcfBlockFormBridge`) is the **only** place allowed to touch `acf.ajax`, `acf.serialize`, or ACF lifecycle actions. UI components go through it. It fetches a block's form HTML, mounts it, and translates ACF's serialized form back into the block's `data` attribute.

Everything under `src/ui/acf/` re-dresses ACF's own markup in place — ACF renders block fields for Gutenberg's narrow sidebar, and Herd imposes a different arrangement. Two constraints recur:

- `src/ui/acf/layout.js` moves **real DOM nodes** (not CSS `order`) so tab order matches the screen, and therefore must run **before** ACF initialises the form — moving an initialised node blanks a TinyMCE iframe.
- `src/ui/acf/portals.js` namespaces the widgets ACF appends to `<body>` (select2, datepicker, flexible-content popups) rather than styling them globally, because ACF renders the same widgets on other admin screens of the same site.

### The rail (`src/rail.js`, `src/publish-box.js`)

WordPress renders every meta box once, into a hidden staging area in `form#post`. `assembleRail()` *relocates* those `.postbox` nodes into rail tabs and moves the native Preview/Update buttons into the command bar. Nothing is cloned and nothing leaves `form#post`, so every box still posts exactly as WordPress expects. On any throw the staging area is revealed so the publish box stays reachable.

### Saving (`herd-editor.php`, `src/save-request.js`)

`wp_ajax_herd_editor_save_post` is wp-admin/post.php's `editpost` case with the redirect removed: `check_ajax_referer` → capability → lock check → optional ACF validation sweep → `_wp_translate_postdata()` → `edit_post()`. Because it calls `edit_post()`, the save runs through the same meta boxes, `ACF_Form_Post::save_post()`, revisions and `content_save_pre` as the native screen. It folds three former round trips into one and returns the publish box's new state in the same vocabulary as the boot config blob, so the browser reconciles by assignment.

Two server-side pieces exist because there is no form to ask:

- `herd_editor_validate_document_acf()` validates *every* ACF block in the document, including forms Herd never mounted, by normalising block data and rebuilding it through `acf_setup_meta()` per block.
- `herd_editor_field_is_visible()` / `herd_editor_condition_is_met()` reimplement ACF's conditional logic in PHP, because a conditionally hidden field is a disabled input that a browser save never validates. Its JS mirror is `addressesRemovedRow()` in `src/acf/helpers.js` — **keep the two in step**.

Post locking is stricter than core's: core reports only *other* users, while Herd also rejects a stale token from the same user's older tab (`herd_editor_post_lock_reason`). `src/recovery.js` keeps an encrypted IndexedDB copy keyed to a per-user server-minted key, so a lost save is recoverable.

### PHP side (`includes/`)

Load order in `herd-editor.php` is deliberate and commented per include. The shape to know:

- `herd-editor-settings.php` — every filter's default comes from a stored setting, so this loads first. One option, `herd-editor-settings-site`, network-wide on multisite. **A filter always beats the settings screen**, and the screen says so where that is happening.
- `herd-editor-width.php`, `herd-editor-spacer.php`, `herd-editor-layout-fields.php`, `class-herd-editor-field-spacer.php` — load on *every* request, not just Herd's screen: they modify the ACF field group editor and register a field type that must exist wherever a field group renders.
- `herd-editor-default.php`, `herd-editor-saved.php` — which editor opens, and what a save reports; both hook early enough to beat `post.php`'s own editor choice and redirect.
- `herd-editor-screen.php` — the shell. Every control is a real WordPress control posting under its native name; `#content` is a hidden input carrying the serialized document.

## Invariants worth not breaking

- **Herd stores nothing of its own.** A field width lives in ACF's `wrapper['width']`; an anchor is WordPress's `anchor` block attribute; a Spacer holds no value. All of it survives deactivation and stays editable in stock ACF/Gutenberg. Uninstall removes only the two options Herd owns.
- **Herd never reads `acf-json` and never names a field key.** It asks the runtime registry (`acf_get_block_fields`) and reads what blocks already declare (`title`, `icon`, `category`, `keywords`, `supports.anchor`). A changed field group is simply a form that renders differently next time.
- **Deactivation converts stored Spacers to empty Message fields** and reactivation converts them back, because ACF's Field Type select would silently rewrite an unknown type to `text` on the next save of that group. See the README's Spacer section before touching `herd-editor-spacer.php`.
- **Modules under test must import cleanly in plain Node.** `npm test` runs `src/` directly with no build, so files like `src/rail.js` deliberately avoid build-time imports and read `window.wp.url` at runtime with a fallback.
- PHPCS excludes formatting families on purpose (see the rationale in `phpcs.xml.dist`); enforced rules are the ones about correctness, escaping and VIP restrictions. Don't "fix" the excluded families.
- Prose comments carry the *why* and are the house style here — many decisions are only recorded in a comment above the code. Match that density rather than stripping it.
