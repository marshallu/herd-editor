# Herd Editor experience roadmap

## Purpose

Herd Editor is most useful when it feels like an editorial workspace rather than a simplified copy of Gutenberg. Its strengths are structure, predictable ACF forms, and a clear view of a page as a sequence of meaningful custom blocks. The features below extend those strengths without introducing a second content model: every change must continue to resolve to ordinary Gutenberg block markup and ordinary ACF block data in `post_content`.

This document describes the desired editor experience, likely implementation boundaries, risks, and a suggested rollout order. It is a product direction rather than a committed release schedule.

## Product principles

- Keep `post_content` authoritative. Search indexes, favorites, outlines, previews, and validation results are derived interface state, not content storage.
- Keep Gutenberg interoperability. A page edited in Herd must remain editable in Gutenberg without conversion.
- Prefer progressive enhancement. A failed preview or optional index must not prevent editing or saving.
- Preserve immediate reopening of visited ACF forms. Performance management should feel automatic and should not make editors repeatedly wait for the same form.
- Make long-page operations keyboard accessible. Dragging is a convenience, not the only way to arrange content.
- Distinguish document safety from editorial advice. Required-field failures may block publishing; recommendations such as duplicate links should usually warn and allow an intentional override.

---

## 1. Page-wide block search and filtering

### Editor need

On a long landing page, editors often remember a phrase, link, anchor, or field value but not which block contains it. Browser find is insufficient because most ACF forms are collapsed and their field markup may never have been mounted.

### Proposed experience

Add a persistent search control above the block list, with a `/` shortcut when focus is not inside a field. Results should match:

- Block title and registered block name.
- The block summary shown in its collapsed row.
- Human-readable ACF field content, including text, choice labels, link titles and URLs, and related post titles when already available.
- HTML anchors.
- Validation messages and state terms such as `hidden` or `invalid`.

While a query is active, nonmatching rows should be filtered out rather than merely highlighted. Matching descendants should reveal their ancestor chain so their location remains understandable. Each visible result should highlight the matched fragment and say where it matched, such as “Heading,” “Link URL,” or “Anchor.” Clearing the query restores expansion state from before the search.

### Implementation direction

Build a client-side search document from parsed block attributes and the existing block metadata/profile system. Do not mount ACF forms to search them. ACF data uses flat field names, so a server-generated field-key/name/label map can improve result labels without exposing or loading form HTML.

Normalize searchable text once per changed block, cache it by client ID, and update only the affected record after an edit. For relationship fields, initially index stored IDs plus any titles already present in boot data; title hydration can be a later, batched enhancement.

### Acceptance criteria

- Search responds within 100 ms on a representative 100-block page.
- Searching never triggers an ACF form request.
- Nested matches retain enough ancestry to explain where they live.
- Keyboard users can enter search, move through results, open a result, and clear search without losing their place.

---

## 2. Persistent outline or minimap

### Editor need

The accordion list is clear locally but provides little sense of position across a very long page. Editors need a compact map for navigation and a quick view of problems.

### Proposed experience

Add a collapsible outline beside the block list. On wide screens it can remain sticky; on narrow screens it becomes a drawer. Each entry shows:

- Block title and concise summary.
- Nesting depth.
- Current selection or viewport position.
- Hidden state.
- Validation error or editorial warning count.
- Unsaved activity when useful.

Selecting an outline entry scrolls to and focuses the corresponding block row. As the editor scrolls, the outline follows the nearest visible block without stealing focus. Filters allow editors to show only hidden blocks, errors, or warnings.

This should be an outline, not a proportional screenshot minimap. Block names and status carry more editorial value than tiny page geometry.

### Implementation direction

Reuse the parsed block tree and `visibleRows()` concepts, but keep outline expansion independent from accordion expansion. Use `IntersectionObserver` over block rows to track location. Validation and hidden-state indicators should consume the same centralized result model as the main list.

### Acceptance criteria

- Outline navigation moves focus as well as scroll position.
- The current block remains apparent without constant state churn while scrolling.
- Hidden and invalid blocks are distinguishable without relying on color alone.
- The outline remains useful with nested blocks and locked structures.

---

## 3. Automatic management of inactive forms

### Editor need

Keeping visited ACF forms mounted makes reopening fast, which is important because the initial server fetch can take several seconds. The tradeoff is that a long session can accumulate repeaters, TinyMCE instances, media controls, observers, and event listeners.

### Proposed experience

Keep recently used forms warm automatically. Editors should not have to understand memory limits or choose a technical cache size.

The default behavior should be:

1. Opened forms remain mounted when collapsed.
2. Forms used recently stay warm.
3. Under memory or count pressure, the least recently used inactive form is flushed and released.
4. Focused forms, active uploads, open media dialogs, unsaved TinyMCE composition, and forms involved in validation remain pinned.
5. Reopening an evicted form fetches it again and restores its current values from the document.

An optional “Collapse inactive forms” command can release all safe inactive forms immediately. It should be framed as tidying the workspace, not as a debugging or memory setting.

### Implementation direction

Introduce a form lifecycle manager above `mountedAcfForms`. Track last interaction, active asynchronous work, and safe-to-dispose state. Start with a conservative count threshold based on actual mounted forms rather than browser-memory heuristics, which are not portable.

Before disposal, synchronously flush the bridge into the document controller. Retain lightweight UI state separately where valuable, such as an open repeater row or scroll position. Instrument mount time, retained form count, and eviction/reload frequency so the threshold can be tuned from real use.

### Acceptance criteria

- No focused or actively uploading form is evicted.
- Eviction cannot lose an unblurred value.
- Typical back-and-forth editing still reopens immediately.
- A long editing session reaches a stable bound in mounted ACF instances.

---

## 4. Move before/after commands

### Editor need

Dragging a block a few positions is convenient. Dragging from the top to the bottom of a long page is slow, imprecise, and difficult for keyboard and assistive-technology users.

### Proposed experience

Add a “Move…” action to each structurally movable block. It opens a searchable destination picker with:

- “Move to beginning” and “Move to end.”
- “Before [block]” and “After [block]” choices.
- Grouping by nearby section or parent when nesting is supported.
- A short preview of each destination using title and summary.

After moving, focus follows the block and an announcement states its new position. Undo restores the original position. The command must honor template locks, parent/ancestor restrictions, and any future role-based structural policy.

### Implementation direction

Reuse the controller’s existing move operation and slot calculations. The destination picker should deal in stable client IDs rather than indexes, because indexes change as filters and nested structures change.

### Acceptance criteria

- Every drag operation has a keyboard-accessible command equivalent.
- Invalid destinations never appear as actionable choices.
- Focus and scroll position follow the moved block.
- Moving does not remount unaffected ACF forms.

---

## 5. Block-level previews

### Editor need

Editors need visual confidence without saving and navigating to a full-page preview. Herd should offer that confidence without becoming another complete Gutenberg canvas.

### Proposed experience

Provide two related modes:

- A thumbnail or compact preview available from the collapsed block row.
- A resizable split preview for the selected block, with desktop, tablet, and phone widths.

The preview must render current unsaved block attributes and clearly report loading, errors, and staleness. It must never silently substitute the saved database version. Interactive theme behavior should work where practical, but editing remains in the ACF form—not inside the preview.

The split view should follow the selected block rather than render the entire page. A separate standard WordPress Preview action remains available for full-page context.

### Implementation direction

The detailed transport and security design belongs in `docs/herd-editor-block-preview-plan.md`. In summary, use an authenticated server render of current attributes in a same-origin iframe so theme CSS and block render callbacks behave normally. Cache previews by a hash of block name, attributes, context, viewport, and relevant theme version. Debounce refreshes while typing and provide an explicit refresh control after an error.

### Acceptance criteria

- Preview output comes from current unsaved values.
- Preview failures never block editing or saving.
- The iframe cannot navigate or modify the parent editor unexpectedly.
- Repeated previewing of an unchanged block uses a cached result.

---

## 6. Block-aware revision comparison

### Editor need

WordPress revisions show textual differences in serialized block comments, which are difficult for editors to interpret. Editors care that a Hero heading changed, a section moved, or a Card block was removed.

### Proposed experience

Provide a revision comparison that reports:

- Blocks added or removed.
- Blocks moved, with old and new positions.
- Block type replacements.
- Changed anchors and visibility.
- Changed fields using ACF labels and human-readable values.
- Changes to nested repeater or flexible-content rows where they can be identified safely.

Editors should be able to expand a changed block, inspect before and after values, and restore either the whole revision or an individual block where structurally safe.

### Implementation direction

Parse both revision documents and match blocks in layers: stable unique attributes when available, then block type plus content fingerprint, then order-aware similarity. Gutenberg block client IDs are not persisted and cannot identify revisions. Avoid claiming a move when matching is ambiguous; represent it as remove/add instead.

Field labels require resolving stored ACF meta names and companion field keys against the current field registry. When a field no longer exists, show its stored name and raw but safely formatted value.

### Acceptance criteria

- Comparison never modifies either revision.
- Ambiguous matching is presented conservatively.
- Sensitive or executable field content is escaped.
- Whole-revision restoration continues to use WordPress’s native revision system.

---

## 7. Safer block duplication

### Editor need

Duplicating a simple content block is predictable. Duplicating blocks containing forms, unique identifiers, relationships, embedded third-party records, or other identity-like values may create subtle errors.

### Proposed experience

Introduce duplication policies:

- **Safe:** duplicate immediately.
- **Review:** show a concise confirmation explaining which fields deserve attention.
- **Blocked:** do not allow duplication when a block or field explicitly declares that copying is unsafe.

The confirmation should name concrete concerns, such as “This block contains a Gravity Form selection and an external campaign ID.” It may offer to clear designated unique fields in the copy. Anchors should continue to be cleared automatically.

Do not warn for every relationship field by default; that would train editors to ignore the dialog. Policies should be driven by field type plus site-configured block profiles.

### Implementation direction

Extend block profiles with declarative duplication rules: field names to warn about, clear, or prohibit; messages; and optional value predicates expressed as data rather than executable browser callbacks. Enforce prohibited duplication in the mutation layer, not only in the button.

### Acceptance criteria

- Ordinary blocks still duplicate in one action.
- Warnings identify the actual copied values of concern.
- Cleared fields are removed from both value and companion-key data correctly.
- The same policy applies through buttons, keyboard commands, and the command palette.

---

## 8. Editorial validation

### Editor need

ACF required-field validation answers whether a block can be saved, not whether the page is editorially ready. Common problems span multiple blocks or depend on related WordPress content.

### Proposed experience

Add an extensible editorial check system for:

- Duplicate internal or external links.
- Images missing alternative text where the image is meaningful.
- Broken or invalid internal links.
- Required page sections that are absent or hidden.
- Relationships pointing to drafts, private content the audience cannot read, trashed posts, or missing records.
- Duplicate anchors and IDs.
- Site-specific content rules supplied by themes or plugins.

Results should have `error`, `warning`, and `suggestion` severities. Errors may block publishing when policy requires it; warnings should allow “Publish anyway” with a reason or acknowledgement if the organization needs an audit trail. Each result links directly to the relevant block and field.

Checks should run incrementally in the browser when possible and perform a definitive server pass before publish. Network-heavy checks, such as URL validation, need caching, timeouts, and a distinction between “invalid” and “could not verify.”

### Implementation direction

Define one normalized result shape: rule ID, severity, block ID, field key/name, message, help text, and optional fix action. Keep ACF required-field failures in this same display model even if their validator remains separate.

Provide PHP filters for registered rules and policies. Avoid making a front-end HTTP request to every external link during each publish; internal links can be resolved locally, while external link checking is better suited to a background service or scheduled audit.

### Acceptance criteria

- Every result has an actionable location or clearly states that it is page-wide.
- A timeout does not falsely label a URL invalid.
- Hidden blocks are checked according to explicit policy.
- Publishing behavior by severity is configurable and consistently enforced server-side.

---

## 9. Recently used and favorite blocks

### Editor need

Large block libraries make editors repeat the same search for a small working set.

### Proposed experience

Add two groups at the top of the inserter:

- **Favorites:** explicitly starred blocks, ordered by the editor.
- **Recent:** the most recently inserted block types, with duplicates removed.

Favorites should be manageable directly in the inserter. Recent items should decay naturally and remain secondary to an active search. Hidden or disallowed blocks must disappear even if previously favorited.

### Implementation direction

Store preferences per user using user meta when cross-device consistency matters. Local storage is acceptable for an initial release, but preferences would then differ across browsers and sites. Store only block names and timestamps; eligibility is always recalculated from the current catalog.

### Acceptance criteria

- Favorites follow the signed-in editor if user meta is chosen.
- Removed or disallowed block types do not become dead controls.
- Search results remain ranked by relevance rather than favorite status alone.

---

## 10. Reusable starter sections and patterns

### Editor need

Editors frequently build recognizable sections from several blocks in a standard order. Repeating that composition manually is slow and inconsistent.

### Proposed experience

Extend the inserter with **Sections** alongside individual blocks. A section inserts a predefined sequence or nested tree of ACF blocks with sensible starting values. Examples might include:

- Introductory Hero + Basic Content + Call to Action.
- Program overview with Facts, Requirements, and Contact blocks.
- Testimonial section with heading and supporting CTA.

After insertion, the new section is ordinary blocks. It is not synced to a template and does not depend on Herd to render. Editors can reorder, remove, and edit its blocks normally.

Patterns should support role/post-type eligibility and optional placeholders, but avoid a bespoke template language. WordPress block patterns or the post type’s existing block template should be reused where their semantics fit.

### Implementation direction

Represent patterns as serialized Gutenberg markup or block arrays and parse them through the same document model used for existing content. Generate new client IDs, clear unique anchors, enforce single-instance restrictions, and validate every inserted block against current eligibility before committing the group atomically.

### Acceptance criteria

- Inserting a section results in standard Gutenberg block markup.
- A partially invalid pattern inserts nothing and explains why.
- Patterns remain editable in Gutenberg after Herd is removed.
- Pattern updates do not rewrite previously inserted content.

---

## 11. Command palette

### Editor need

Power users need a fast way to operate without moving between the block list, inserter, outline, and row action buttons.

### Proposed experience

Add a command palette, opened with `Cmd/Ctrl+K`, for:

- Finding and opening blocks.
- Inserting blocks and starter sections.
- Moving the selected block.
- Duplicating or deleting the selected block.
- Toggling the site’s configured hidden field.
- Expanding, collapsing, or opening a block’s Advanced panel.
- Opening preview, validation results, revisions, or the standard WordPress preview.

Commands should be contextual. “Duplicate block” appears only when a block is selected and policy allows it. Destructive commands require confirmation. Recent commands may rank higher, but exact textual matches should win.

### Implementation direction

Create a central command registry rather than wiring the palette directly to component internals. Row buttons, keyboard shortcuts, and the palette should invoke the same command definitions and policy checks. This prevents behavior from drifting across three entry points.

### Acceptance criteria

- All commands remain subject to block, template, capability, and duplication policies.
- Focus returns to the originating control when the palette closes without action.
- Screen readers receive result counts, active result changes, and completion announcements.

---

## 12. Clearer autosave and field-save status

### Editor need

Herd currently has two persistence categories:

- Block content serialized into `post_content`, which core autosave can preserve in a revision.
- Relocated page-level ACF meta boxes and other native post fields, which may remain unsaved until a deliberate save because ACF does not process them during the same autosave path.

A single “Saved” message can therefore imply more protection than actually exists.

### Proposed experience

Use precise document-level status:

- **All changes saved** after a confirmed deliberate save.
- **Block changes autosaved** when the current block document has an autosave but page settings still contain deliberate-save-only edits.
- **Unsaved page settings** when relocated meta boxes are dirty.
- **Saving… / Autosaving blocks… / Save failed** for active operations.

Field-level icons on every input would be noisy. Instead, mark the relevant rail tab or meta box with “Unsaved,” and provide a short status detail popover explaining what is protected. When a deliberate save completes, all successful categories return to clean together.

Longer term, page-level ACF values could receive a dedicated authenticated autosave store, but that should not be implied until restoration and conflict behavior are fully designed.

### Implementation direction

Replace the single native dirty boolean with named dirty domains: block document, core post fields, ACF post meta, and other meta boxes where detectable. Track the snapshot sent by each persistence path and clear only the domains that response actually saved.

### Acceptance criteria

- The interface never says “All changes saved” while known page-level fields remain dirty.
- Editors can understand the distinction without knowing `post_content` or postmeta terminology.
- A failed autosave never clears the dirty state.
- Recovery export contains every domain Herd claims to have backed up.

---

## 13. Role-based structural locking

### Editor need

Some editors should update words, images, and links without changing an approved page composition. WordPress’s post capability is too broad for that distinction, while a completely locked template may be too rigid for administrators and designers.

### Proposed experience

Allow site policy to grant content editing while independently controlling:

- Insert blocks.
- Remove blocks.
- Duplicate blocks.
- Reorder blocks.
- Change anchors or configured visibility.
- Use specific block types or starter sections.

Unavailable actions should be absent or clearly disabled with a short explanation. The page remains editable at the field level. Administrators or designated roles retain structural control.

### Implementation direction

Publish a server-resolved structural policy in the boot configuration, derived from capabilities, post type, post ID, and filters. Treat it as presentation guidance only; deliberate saves must validate structure server-side against the originally loaded document or another authoritative policy check, because browser policy can be bypassed.

Prefer named capabilities such as `herd_editor_reorder_blocks` only if the organization needs WordPress role-management integration. A simpler initial filter can map existing roles/capabilities to policy, but avoid checking role names directly.

### Acceptance criteria

- Structural restrictions apply to buttons, dragging, keyboard actions, patterns, and command-palette commands.
- A crafted request cannot bypass a server-enforced structural restriction.
- Content-only editors can still use every ACF field they are otherwise authorized to edit.
- Gutenberg access is considered in the policy: restricting Herd alone is not an effective site-wide composition lock if the same user can restructure the page in Gutenberg.

---

## Suggested delivery sequence

### Phase 1: Find and navigate

1. Page-wide search and filtering.
2. Persistent outline with hidden and validation indicators.
3. Move before/after commands.

These features share a block index and navigation model, improve long pages immediately, and carry comparatively little persistence risk.

### Phase 2: Performance and clarity

4. Automatic inactive-form management, after instrumentation establishes a sensible threshold.
5. Accurate autosave and dirty-domain messaging.
6. Recently used and favorite inserter items.

### Phase 3: Editorial workflow

7. Editorial validation framework, starting with duplicate anchors, internal links, image alt text, and unpublished relationships.
8. Safer duplication policies.
9. Reusable starter sections and patterns.
10. Command palette over the now-shared command and policy model.

### Phase 4: Rich context and governance

11. Block preview using the existing detailed preview plan.
12. Block-aware revision comparison.
13. Role-based structural locking coordinated with Gutenberg access and server enforcement.

## Shared foundations worth building once

Several features should not invent separate models:

- **Block index:** title, summary, searchable values, anchor, ancestry, visibility, and validation state. Used by search, outline, move picker, and command palette.
- **Command registry:** action label, availability, policy, handler, keyboard metadata, and confirmation behavior. Used by row controls and the command palette.
- **Validation result model:** severity, location, message, and optional fix. Used by publishing, outline, filtering, and previews.
- **Structural policy:** insert/remove/move/duplicate/visibility decisions. Used by all mutation paths and verified on the server where policy requires enforcement.
- **Form lifecycle manager:** mount, retain, flush, pin, and dispose. Used by normal accordion behavior and automatic memory management.
- **Human-readable field resolver:** maps stored ACF data to labels and safe display values. Used by search, revision comparison, duplication warnings, preview settings, and validation.

Building these foundations deliberately will keep the experience coherent: a block considered invalid in the outline should be the same block found by “show errors,” opened by the command palette, and blocked by the publish check.

## Measurement plan

Before and after each phase, test representative pages at roughly 10, 30, 60, and 100 blocks. Record:

- Initial editor load and time to interactive.
- First-open and reopen time for simple and complex ACF forms.
- Keystroke-to-summary latency.
- Search response time.
- Mounted form count and browser memory after a long editing sequence.
- Autosave and deliberate-save duration.
- Preview render and revision-comparison duration when those features exist.
- Task completion time for finding, moving, validating, and previewing a block.

Performance work should be judged by editor-visible latency and session stability, not bundle size alone.
