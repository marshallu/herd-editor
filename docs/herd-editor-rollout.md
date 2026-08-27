# Herd Editor — release record and production rollout

**Version 1.0.0.** Requires WordPress 7.1+, PHP 7.4+, ACF Pro 6.0+.

## Release status

The code is release-ready. Both release-blocking findings from the August 27, 2026
code audit are closed, along with every medium and low finding that could be
settled by static work. **The remaining gate is the signed-in browser matrix at
the end of this document**, which no automation environment available so far has
been able to run. Nothing below implies a browser result.

### Audit disposition

The audit (`docs/herd-editor-audit.html`) recorded 0 critical, 2 high, 9 medium,
and 2 low findings against a 254-test tree. That report is now historical; this
table is authoritative.

| # | Sev | Finding | Status |
| --- | --- | --- | --- |
| 1 | High | No WordPress post locking; stale overwrites possible | **Closed** |
| 2 | High | Block attributes bypass core comment escaping | **Closed** |
| 3 | Med | Editing one field discards legacy ACF keys | **Closed** |
| 4 | Med | Collapsed ACF blocks escape form validation | **Closed** |
| 5 | Med | Inserter bypasses block eligibility and locking policy | **Closed** |
| 6 | Med | ACF `usePostMeta` storage neither supported nor rejected | **Closed** |
| 7 | Med | Spacer removal not operationally verifiable | **Closed** |
| 8 | Med | No autosave or crash recovery | **Closed**, needs browser check |
| 9 | Med | Save/redirect/starter-content lacks integration coverage | **Open — manual** |
| 10 | Med | DOM adaptations coupled to upstream ACF markup | **Open — by design** |
| 11 | Med | Editor payload and observer cost unmeasured | **Open — manual** |
| 12 | Low | Theme icon set reaches `innerHTML` unsanitized | **Closed** |
| 13 | Low | Repeater add-button normalization damages capitalization | **Closed** |

### How the closed findings were closed

**1 — Post locking.** Herd uses WordPress's own shared lock, so it interlocks with
Gutenberg and Classic rather than running a parallel scheme.
`herd_editor_active_post_lock()` issues a token only when no other user holds one;
`herd_editor_handle_post_lock_takeover()` serves the nonce-checked takeover route
and returns to Herd rather than to `post.php`; `src/post-lock.js` refreshes
ownership over core's `wp-refresh-post-lock` Heartbeat and, on loss, disables every
control in the form, blocks submit, suspends core autosave, and shows the native
takeover dialog. `herd_editor_validate_post_lock_before_save()` then re-checks the
submitted token against `_edit_lock` with `hash_equals()` on `admin_init` and
`wp_die()`s with 409 before `post.php` can write. That last check is deliberately
stricter than core's, which reports only *other* users: it also stops an old tab
belonging to the same user from overwriting a newer session.

**2 — Attribute escaping.** `serializeBlockAttributes()` in `src/document.js` mirrors
core's `serialize_block_attributes()` exactly, converting `--`, `<`, `>`, `&`, and
escaped quotes to Unicode escapes. `tests/document.test.js` asserts the output for a
fixture containing comment terminators, HTML, ampersands, backslashes, quotes,
emoji, and nested repeater values. Untouched blocks still round-trip byte-for-byte.

**3 — Legacy ACF keys.** `mergeAcfBlockData()` in `src/acf/helpers.js` merges ACF's
serialization over the stored data rather than replacing it, so a field that was
renamed, removed from the group, or hidden by conditional logic keeps its stored
value when an unrelated field is edited.

A plain merge would be wrong on its own, because deleting a repeater row also omits
that row's keys and a merge would resurrect them the moment the field grew back to
that length. So an omitted key is dropped when — and only when — it addresses a row
the submitted value no longer has: ACF names sub-values `<field>_<index>_<subfield>`,
and the submitted row count (or, for flexible content, the layout list) decides
whether that index still exists. An index the field still has means the omission is
conditional logic and the value is kept. A field that merely shares a prefix
(`cards_footnote` beside `cards`) is never treated as a row. When the length cannot
be read the key is preserved, because losing a value is worse than carrying a stale
one.

**4 — Whole-document validation.** `herd_editor_validate_document_acf()` walks the
parsed tree and validates every ACF block's serialized data against its field group
on the server, including blocks Herd never mounted, and maps errors back to block
rows.

**5 — Block eligibility.** `herd_editor_block_metadata()` publishes `allowed`
(from `herd_editor_allowed_block_types()`, which honours the site's
`allowed_block_types_all` policy), `inserter`, `parent`, `ancestor`, `multiple`,
and the post type's `templateLock`. `canAddBlock()` in `src/adapters.js` enforces
all of it in the mutation layer, not only in the UI.

**6 — ACF storage mode.** `herd_editor_acf_storage_mode()` reports `comment`,
`post_meta`, or `unknown`, and `readOnly` is set for any `acf/*` block that is not
`comment`. Unknown is treated as unsupported, so a future ACF storage feature Herd
does not recognize degrades to read-only instead of being silently mis-saved.

**7 — Spacer removal.** `tools/migrate-spacer.php` provides `--dry-run` inventory, a
resumable migration that records completed fields in an option, and `--verify`.
The procedure is written up in `docs/spacer-removal.md`. The shim is deliberately
independent of the editing screen, so turning off the screen never rewrites field
groups.

**8 — Autosave.** Herd enqueues core's `autosave`, which owns its per-user revision
and session-storage recovery. `src/post-lock.js` suspends it the instant ownership
is lost, so autosave cannot become a second stale writer. This is code-complete but
is exactly the kind of behaviour that has to be confirmed in a browser.

**12 — Icon set.** `herd_editor_icon_set()` now passes every icon through the same
`wp_kses()` SVG allowlist used for registered block icons and drops anything that
survives as an empty string, rather than trusting markup because it came from the
theme. The `herd_editor_icons` filter is a supported way in, so the set is only as
safe as whatever last wrote to it.

**13 — Add-button label.** The repeater add button now raises only the first
character and leaves the rest of the authored label alone, so a field group's
"Add FAQ" stays "Add FAQ".

### Open items and accepted risks

- **9 — Save, redirect, and starter-content integration.** The default-editor
  redirect, auto-draft seeding, revision message carry-through, and `post.php`
  round trip depend on WordPress request order and Classic Editor hooks. They
  cannot be established by unit tests. Covered by the matrix below.
- **10 — Coupling to ACF markup.** Herd deliberately moves ACF's own inputs and
  preserves its data attributes rather than recreating controls, so an ACF markup
  or event-hook change could leave controls present but disconnected — most likely
  in table repeaters, flexible layouts, cloned rows, media fields, and nested
  groups. The suite models expected ACF output; it is not a substitute for a smoke
  test against the installed ACF Pro. **Re-run the matrix after any ACF Pro
  upgrade.**
- **11 — Performance.** The built bundle is 377 KiB uncompressed
  (`herd-editor.js` 88.5 KiB, CSS 144 KiB, RTL CSS 144 KiB); webpack warns on the
  entrypoint size. The UI also installs scoped mutation observers. No timing or
  memory benchmark on a long page has been taken. Measure during the pilot.

## Compatibility matrix

| Area | Implementation | Browser status |
| --- | --- | --- |
| All registered ACF blocks | Generic bridge, eligibility-gated | Inventory sweep required |
| Paragraph, Heading, Custom HTML, Shortcode | Adapters and unit coverage complete | Save/reload check required |
| Other registered/unknown blocks | Preserved read only | Round-trip check required |
| ACF `usePostMeta` / unknown storage | Forced read only | Confirm the badge appears |
| Block and Classic Editor interoperability | Standard `post_content` retained | Fixture comparison required |
| Post locking and takeover | Core lock, Heartbeat, server-side recheck | **Two-user race required** |
| Autosave and recovery | Core autosave, suspended on lock loss | Signed-in verification required |
| Draft/update/revisions/preview | Native post form retained | Signed-in verification required |
| Schedule/private posts | Native publish box retained | Signed-in verification required |
| Featured media/page attributes/templates | Native meta boxes retained | Signed-in verification required |
| Page-level ACF fields | Native ACF post boxes retained | Deep-field verification required |
| ACF unavailable / plugin deactivation | Herd declines; content stays standard | Deactivation check required |

## Known exclusions

- Creation of core or unsupported blocks.
- Arbitrary nesting, template manipulation, reusable/synced-pattern structure, and
  structural changes to core or fallback blocks.
- A visual frontend canvas inside Herd Editor.
- A claim of universal support for every block WordPress can register. Support
  targets all registered HerdPress ACF blocks plus the four named core adapters.

## Pilot and release checklist

Run in order. The first group is what the audit called for first.

- [ ] Connect a signed-in browser to the WordPress site.
- [ ] **Two-user race:** open the same post in Herd and in Gutenberg as different
      users. Confirm the second is refused the lock, the takeover screen appears,
      taking over returns to the editor that was chosen, and the losing session
      disables immediately on the next heartbeat.
- [ ] **Same-user stale tab:** leave a Herd tab open, edit and save the post
      elsewhere, then save the stale tab. Confirm the 409 refusal, not a silent
      overwrite.
- [ ] **Hostile round trip:** author field values containing `-->`, `--`, `<`, `&`,
      `"`, backslashes, and emoji. Save, reload, and open in Gutenberg. Confirm no
      block-recovery prompt and no corruption.
- [ ] **Legacy key preservation:** seed a block with active fields plus removed,
      renamed, conditionally hidden, and unknown keys. Change one visible value,
      save, reload, and assert exactly which keys survived. Then delete a repeater
      row, save, and confirm the row's keys are gone and do not return when a new
      row is added.
- [ ] Create disposable drafts and insert/mount every registered ACF block; confirm
      no failed or leaking form host.
- [ ] Deep-test Page with Sidebar, Hero, and Moments across TinyMCE, flexible
      content, repeaters, media/file, groups, conditional logic, taxonomy, links,
      numbers, and selects.
- [ ] Confirm a block excluded by the site's allowed-block policy is not offered,
      and that a locked block offers no duplicate/delete/reorder control.
- [ ] Save/reload Paragraph, Heading levels, Custom HTML, and Shortcode.
- [ ] Verify insert, duplicate, reorder, delete confirmation, undo/redo,
      single-instance restrictions, keyboard flow, announcements, and large-page
      responsiveness. **Record timings for the performance item above.**
- [ ] Submit a post with an invalid required field inside a collapsed ACF block;
      confirm the save is refused and the affected row opens and focuses.
- [ ] Round-trip identical fixtures through Herd, Block Editor, and Classic Editor;
      compare serialized content and frontend output.
- [ ] Verify update, preview, revisions, autosave recovery, scheduling, privacy,
      featured image, parent/template, page-level ACF, pilot/non-pilot roles, ACF
      unavailable behavior, and Herd deactivation.
- [ ] Dry-run `tools/migrate-spacer.php`, then deactivate Herd and confirm spacers
      became Message fields and reactivation restores them.
- [ ] Record WordPress, ACF Pro, Classic Editor, Herd SEO, theme, browser, and
      device versions used for sign-off.

## Automated verification

As of August 27, 2026: `npm test` passes **321 tests**, `npm run build` succeeds
(two webpack size warnings, no errors), and every PHP file passes `php -l`.
Coverage includes all adapters, core-equivalent attribute serialization with
hostile fixtures, ACF data merge and row-deletion semantics, body and
exact-attribute replacement, cloning and client IDs, unsupported-content
preservation, history behavior, single-instance restrictions, the post-lock
client, and the ACF layout, repeater, flexible, media, link, group, and
conditional-logic decorators.

## Historical phase 1 record

The remainder of this document preserves the original proof-of-concept findings and roadmap for audit history. Statements about “current” scope below describe phase 1 at the time it was written; the release status and compatibility matrix above supersede them.

### Purpose

Herd Editor is a third WordPress editing mode that sits beside Block Editor and Classic Editor. It edits the same WordPress post and the same Gutenberg block document; it does not introduce a parallel page model, post meta payload, or frontend renderer.

Phase 1 is intentionally limited to an existing `acf/hero` block. Its purpose was to prove that ACF Pro can render and operate its own field UI in a dedicated Herd Editor screen while saving the standard block document.

## What was implemented

### Editor selection and route

- Added a dedicated authenticated Herd Editor admin route: `admin.php?page=herd-editor&post={ID}`.
- Added **Edit (Herd Editor)** to post and page list-table actions.
- Added **Switch to Herd Editor** to Gutenberg's editor menu and the native classic publish box.
- Added a three-mode switcher in Herd Editor itself: Herd Editor, Block Editor, and Classic Editor.
- Limited Herd Editor to the filtered post types `page` and `post` by default, and disabled it when ACF Pro is unavailable.

Classic Editor remains responsible for choosing and remembering its own Classic/Block mode. Herd does not replace or modify Classic Editor's settings or filters.

### Native post editing surface

Herd Editor uses a real WordPress post edit form rather than a REST-only save path.

- The title and slug are editable at the top of the Herd form.
- The native Publish box is the only save control.
- Core Page settings are rendered in the sidebar: publish/status, featured image, page attributes, and other supported core controls.
- Normal and advanced native postboxes are rendered below the Herd block fields.
- ACF page-level field groups are explicitly registered so that Herd SEO, More Info, On This Page Navigation, and other ACF post field groups appear in their normal postbox positions.

The native form route matters: it preserves the existing post-save hooks used by WordPress, ACF, Herd SEO, and other plugins.

### ACF Hero bridge

The ACF bridge is isolated under `src/acf/`.

1. Herd parses the current Gutenberg document in memory and locates the first `acf/hero` block.
2. It requests ACF Pro's server-rendered field form through the authenticated `acf/ajax/fetch-block` endpoint.
3. The bridge mounts ACF's returned HTML and runs ACF's `append` lifecycle action.
4. On input/change, it serializes the form with ACF and replaces only that block's `data` attribute in Herd's in-memory block tree.
5. Herd continuously serializes the complete tree into the normal post form's hidden `content` field.
6. Native **Update** submits the usual WordPress post form, including the current block document, title, slug, and meta-box values.

No Herd-specific content marker, post meta store, ACF JSON mutation, field-group mutation, or frontend rendering change is written.

## What we learned

### ACF form rendering is viable outside Gutenberg

ACF Pro 6.8.8 successfully returned the existing Hero fields through `acf/ajax/fetch-block`, including select fields, conditional groups, images, files, and switches. This validates the core technical premise of Herd Editor: use ACF's real field UI rather than reimplementing ACF controls.

### ACF's Gutenberg bundle must not be loaded on the dedicated screen

Loading `acf-blocks` on Herd's custom route caused ACF to register every site block and fail on legacy API-v1 blocks. The standalone screen only loads ACF input assets and provides a narrow parser fallback for `acf/hero`; it does not load the Gutenberg block-registration bundle.

The WordPress deprecation notices for legacy blocks such as `acf/feature-items`, `acf/feature-video`, `acf/find-my-counselor`, and `acf/gravity-form` are existing site maintenance work. They are not Herd Editor failures, but they are a compatibility risk for a future iframe-only editor world.

### ACF needs its authenticated AJAX settings before Herd starts

ACF normally prints its AJAX nonce in the admin footer. Herd's application initially ran before that footer action, so the fetch request returned no form. Herd now injects the ACF AJAX URL and nonce immediately before its own script runs.

### Use global jQuery for this ACF boundary

`acf.$` is an ACF model-instance helper, not a global DOM wrapper. The Herd bridge must use `window.jQuery(form)` for ACF `append`, `remove`, and `serialize` calls.

### The native Update button must always receive current content

The first custom implementation only populated the hidden `content` input when Herd's own Save button was clicked. Clicking native **Update** could therefore save an empty document. Herd now initializes that input with the actual saved content and keeps it synchronized after every block change. The duplicate Herd Save button was removed.

This is the most important rollout rule: any Herd UI that changes blocks must synchronize the full standard Gutenberg document before the native post form can submit.

### ACF field groups and core postboxes need explicit custom-screen handling

Core postboxes registered against the custom screen ID and ACF field groups registered against the post type. Rendering only one of those contexts hid some controls. Herd now renders both contexts. ACF's normal post-form field groups also need explicit registration because ACF only auto-registers them on WordPress's native post screen.

## Historical phase 1 scope and limitations

- One existing `acf/hero` block is editable; Herd chooses the first Hero it finds.
- Herd does not yet add, remove, reorder, or choose blocks.
- Herd does not currently offer a block list, nested block navigation, preview canvas, block inserter, autosave UI, or custom undo/redo UI.
- Native post meta boxes save normally, but each must be visually and behaviorally tested in Herd.
- Gutenberg's own undo/redo history does not apply to the standalone screen yet.
- Browser integration checks have been performed iteratively on the local site; repeat save/reload/deactivation checks are required before broad rollout.

## Original roadmap: expand Herd Editor to all blocks

### Phase 2 — stabilize the document controller

Build a single document controller before adding more block UIs.

1. Parse the entire post document into a canonical in-memory block tree.
2. Give every block an explicit Herd row keyed by its Gutenberg `clientId`.
3. Implement immutable helpers for finding, replacing, inserting, removing, and moving nested blocks.
4. Synchronize the serialized document to the hidden native `content` field after every document mutation.
5. Add Herd-local undo/redo snapshots for document mutations; do not claim Gutenberg history support until it is integrated and tested.
6. Add a dirty-state indicator near the native Publish box and an unload warning compatible with normal WordPress saving.
7. Test save, reload, revisions, preview, and Classic/Block Editor round-trips on disposable pages.

**Exit criterion:** changing, reordering, and deleting a small mixed block document saves once through native Update and reopens identically in both Block Editor and Classic Editor.

### Phase 3 — generalize the ACF form host

Turn the Hero-only bridge into a generic ACF block host.

1. Identify all `acf/*` blocks in the tree.
2. For each selected row, send the real attributes, client ID, post ID, and context to `acf/ajax/fetch-block`.
3. Cache only the mounted form for the active row; dispose ACF instances on collapse, selection change, and unmount.
4. Cover representative ACF field types: text, WYSIWYG/TinyMCE, select, true/false, group, repeater, flexible content, link, image, file, gallery, relationship, post object, date/time, map, and conditional logic.
5. Handle ACF block variants and field groups with no fields without treating them as errors.
6. Verify that each generated ACF form uses the block's exact client ID prefix and that updates affect only that block.

**Exit criterion:** a representative cross-section of existing ACF blocks saves/reloads/deactivates cleanly with no duplicate state and no lifecycle leaks.

### Phase 4 — render a complete Herd block list

Build the Herd editing experience around the document controller.

1. Render all top-level blocks in document order, including a clear label, icon, and selection state.
2. Support expand/collapse, keyboard navigation, and nested inner-block disclosure.
3. Provide each ACF block's native ACF field host when expanded.
4. Provide a safe fallback row for unsupported blocks with an **Open in Block Editor** link that selects the matching block where possible.
5. Preserve the actual document order and hierarchy; never derive the list from post content string matching.

**Exit criterion:** editors can inspect a real page's full structure and edit supported blocks without losing unknown or unsupported blocks.

### Phase 5 — support non-ACF blocks deliberately

Classify every active block before attempting a universal UI.

| Block category | Herd approach |
| --- | --- |
| ACF block (`acf/*`) | Use the generic server-rendered ACF form host. |
| Core block | Build a focused Herd control only when the editorial value justifies it; otherwise provide an explicit Block Editor fallback. |
| Theme custom block with `block.json` | Prefer its declared attributes and an adapter specific to that block. |
| Dynamic/server-rendered non-ACF block | Start as a read-only row plus Block Editor fallback; add a custom adapter only after save/reload tests. |
| InnerBlocks container | Present children in the tree and add mutation controls only after lock/template behavior is understood. |

Create an inventory of the current theme and plugin block registrations, then prioritize by editorial frequency and field complexity. Do not automatically convert every registered block solely because it exists.

### Phase 6 — block creation and structural editing

After existing-block editing is stable:

1. Add an inserter limited to block types with a tested Herd adapter.
2. Create blocks with the same attributes and field-key defaults expected by ACF/Gutenberg.
3. Support duplicate, delete, move, and nesting operations through the document controller.
4. Respect `supports.multiple`, allowed blocks, template locks, reusable blocks, synced patterns, and permissions.
5. Add confirm/undo behavior for destructive actions.

**Exit criterion:** a disposable page can be built entirely in Herd, saved through native Update, and edited afterward in Gutenberg without repair.

### Phase 7 — production hardening

1. Add browser integration coverage for each adapter and field family.
2. Test autosaves, revisions, scheduled posts, private posts, previews, featured media, templates, parent pages, and user roles.
3. Test plugin deactivation: every page must remain standard WordPress/Gutenberg content.
4. Audit accessibility: semantic navigation, focus management, keyboard actions, field labels, error summaries, and screen-reader announcements.
5. Measure large-page performance and add form mounting/caching limits where needed.
6. Maintain a version matrix for WordPress, ACF Pro, Classic Editor, Herd SEO, and the theme's block set.

## Guardrails for every future block adapter

- Gutenberg post content remains the only document source of truth.
- Save through the normal WordPress post form unless a replacement path is explicitly designed and tested.
- Never write a Herd-only serialization format.
- Keep all ACF private APIs in the compatibility layer.
- Preserve unknown blocks exactly when Herd does not support them.
- Test the same page in Herd, Block Editor, Classic Editor, and with Herd deactivated.
- Treat media, TinyMCE, repeaters, flexible content, conditional logic, and nested blocks as integration tests, not assumptions.
