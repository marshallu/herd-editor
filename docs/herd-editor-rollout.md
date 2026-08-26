# Herd Editor — implementation record and production rollout

## Release status (phases 5–7)

Phases 5 and 6 and the code portion of phase 7 are implemented. The release remains **pilot-blocked** until the signed-in browser matrix below passes. The current automation environment reported no connected browser on August 26, 2026, so no browser result is implied by the unit and build results.

### Completed foundation

- A registry dispatches ACF, Paragraph, Heading, Custom HTML, Shortcode, and fallback adapters.
- The document controller supports byte-preserving round trips, body replacement, merged and exact attribute replacement, recursive cloning with fresh client IDs, insertion, deletion, movement, and bounded undo/redo history.
- Untouched nodes retain their original source bytes. Unknown, malformed, nested, and unsupported content is not rewritten unless an explicitly supported adapter edits it.
- JavaScript receives the complete server-side block registry with title, icon, category, registration state, context declarations, and `supports.multiple`.

### Adapter inventory

| Adapter | Existing content | Creation | Structure | Notes |
| --- | --- | --- | --- | --- |
| ACF (`acf/*`) | Editable | Yes | Top-level move, duplicate, delete | One active ACF form is mounted at a time. |
| Paragraph | Editable | No | No | Rich text; preserves the paragraph wrapper and unrelated attributes. |
| Heading | Editable | No | No | Rich text plus levels 1–6; preserves unrelated wrapper attributes. |
| Custom HTML | Editable | No | No | Focused code textarea. |
| Shortcode | Editable | No | No | Focused text textarea. |
| Fallback | Read only | No | No | Links to the corresponding Block Editor path. |

### ACF structural editing

- The searchable inserter lists every registered ACF block and creates normal self-closing block markup with `name` and empty `data` attributes.
- Move up/down, duplicate, and confirmed delete are available only for top-level ACF blocks.
- `supports.multiple: false` is enforced across the complete document for insertion and duplication. On the current site this applies to Hero and Page with Sidebar.
- Field and structural mutations share Herd history. Destructive actions announce their result and restore focus to a surviving row where possible.

### Hardening completed in code

- ACF private APIs remain isolated in the form bridge. Pending requests are aborted and late responses are ignored when selection changes; disposal runs ACF's remove lifecycle.
- Document content is synchronized before form submit and preview-related clicks. Native form inputs and block edits both drive dirty state and unload protection; canceled submits retain protection.
- The native WordPress post form remains the only persistence endpoint.
- `herd_editor_user_can_access( bool $allowed, WP_User $user, WP_Post $post ): bool` defaults to administrators who can edit the post. Sites can opt pilot editors in through the filter.
- The existing `herd_editor_post_types` filter remains unchanged.
- Rows retain roving keyboard navigation, accessible action labels, status announcements, retryable ACF errors, confirmed deletion, and responsive structural controls.

## Compatibility matrix

| Area | Implementation status | Browser release status |
| --- | --- | --- |
| All registered ACF blocks | Cataloged and handled by generic bridge | Inventory sweep required |
| Paragraph, Heading, Custom HTML, Shortcode | Adapter and unit coverage complete | Save/reload check required |
| Other registered/unknown blocks | Preserved read only | Round-trip check required |
| Block and Classic Editor interoperability | Standard `post_content` retained | Fixture comparison required |
| Draft/update/revisions/preview | Native post form retained | Signed-in verification required |
| Schedule/private posts | Native publish box retained | Signed-in verification required |
| Featured media/page attributes/templates | Native meta boxes retained | Signed-in verification required |
| Page-level ACF fields | Native ACF post boxes retained | Deep-field verification required |
| ACF unavailable / plugin deactivation | Herd access disabled; content stays standard | Deactivation check required |

## Known exclusions

- Autosave and local draft recovery.
- Creation of core or unsupported blocks.
- Arbitrary nesting, template manipulation, reusable/synced-pattern structure, and structural changes to core or fallback blocks.
- A visual frontend canvas inside Herd Editor.
- A claim of universal support for every block WordPress can register; support targets all registered HerdPress ACF blocks plus the four named core adapters.

## Pilot and release checklist

- [ ] Connect a signed-in browser to the local WordPress site.
- [ ] Create disposable drafts and insert/mount every registered ACF block; confirm no failed or leaking form host.
- [ ] Deep-test Page with Sidebar, Hero, and Moments across TinyMCE, flexible content, repeaters, media/file, groups, conditional logic, taxonomy, links, numbers, and selects.
- [ ] Save/reload Paragraph, Heading levels, Custom HTML, and Shortcode.
- [ ] Verify insert, duplicate, reorder, delete confirmation, undo/redo, single-instance restrictions, keyboard flow, announcements, and large-page responsiveness/performance.
- [ ] Round-trip identical fixtures through Herd, Block Editor, and Classic Editor; compare serialized content and frontend output.
- [ ] Verify update, preview, revisions, scheduling, privacy, featured image, parent/template, page-level ACF, pilot/non-pilot roles, ACF unavailable behavior, and Herd deactivation.
- [ ] Record WordPress, ACF Pro, Classic Editor, Herd SEO, theme, browser, and device versions used for sign-off.

## Automated verification

As of August 26, 2026, `npm test` passes 18 tests, `npm run build` succeeds, and both PHP entry files pass `php -l`. Automated coverage includes all adapters, body and exact-attribute replacement, cloning/client IDs, unsupported preservation, history behavior, and single-instance restrictions.

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
