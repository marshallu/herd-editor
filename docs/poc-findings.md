# Herd Editor Phase 1 — ACF Hero compatibility spike

## Definition

Herd Editor is a third WordPress editing mode, alongside Block Editor and Classic Editor, for editing the authoritative Gutenberg document already stored in a WordPress post. It is not an ACF field-group editor or frontend renderer.

## Implemented data flow

Herd Editor is served from its own authenticated hidden WordPress admin page. Post/page list tables expose **Edit (Herd Editor)**; Gutenberg exposes **Switch to Herd Editor**; Classic Editor continues to supply its native Classic/Block switch. The Herd screen also displays all three choices.

The screen parses the current WordPress block document only in memory to locate the existing `acf/hero` instance and client ID. It sends that block's actual attributes, client ID, current post ID, and block context to ACF Pro's authenticated `acf/ajax/fetch-block` endpoint. ACF returns its native form markup. The isolated bridge mounts it, runs ACF's `append` lifecycle action, and serializes the form on input/change. The screen replaces only that block's `data` attributes in the in-memory Gutenberg tree. **Save changes** writes the serialized standard block document into the normal WordPress post form and submits it through the usual post-save path.

There is no ACF JSON, field-group, registration, template, or frontend rendering write. Herd saves normal Gutenberg `post_content` through WordPress's regular form path, so existing post meta boxes (including Herd SEO) render in the sidebar and retain their ordinary save hooks.

## API classification

Public/stable enough for this spike: WordPress admin pages, list-table action filters, REST post updates, Gutenberg parse/serialize APIs, and `PluginMoreMenuItem`.

Compatibility-boundary/private ACF details: `acf/ajax/fetch-block`, its payload and response shape, `acf.ajax`, `acf.prepareForAjax`, `acf.serialize`, `acf.$`, and `acf.doAction('append'/'remove')`. Only `src/acf/bridge.js` and `src/acf/helpers.js` touch those APIs.

The standalone Herd route deliberately loads ACF input assets but not ACF's Gutenberg `acf-blocks` bundle. That bundle registers every ACF block in the site and can fail on legacy API-v1 registrations before the Herd form mounts; Herd registers a narrow parser fallback for `acf/hero` instead.

## Version risks and limitations

This was written against WordPress 7.1 and ACF Pro 6.8.8. ACF does not document the fetch endpoint as a public integration API; upgrades can change the request, markup, lifecycle, or serialization contract. Media, TinyMCE, conditional logic, repeaters/groups and select controls rely on the ACF assets and lifecycle. Browser/save validation remains manual integration work.

The plugin intentionally does not attempt to replace Classic Editor's filters or settings. It adds a third route and links into the existing Classic/Block selection flow. The current standalone screen handles one existing Hero block only; block-list work, undo/redo, autosave, revisions UI, and creating blocks remain out of scope.

## Manual integration checklist (dedicated disposable draft page)

Status: pending. This workspace did not expose a browser session or a signed-in local WordPress editor, so the following end-to-end checks have not been represented as passing.

1. Insert `acf/hero` in normal Gutenberg, open **Herd Editor**, expand **Edit Hero fields**, and edit a text field. Confirm the editor becomes dirty.
2. Exercise existing select, conditional, group, image/file, and text controls. Confirm ACF's own UI behavior.
3. Use normal **Update**, reload, and confirm the values remain in the same Hero block.
4. Inspect the document: it must contain only normal ACF block serialization—no Herd marker, meta store, or proprietary payload.
5. Check Gutenberg undo/redo, autosave/revisions where available, and record whether this ACF lifecycle creates one history entry per event or batches them.
6. Deactivate Herd Editor. Reopen the draft, edit the Hero with native ACF Gutenberg UI, and confirm rendering is unchanged.

## Automated coverage

`npm test` covers pure nested block identification and fetch-payload construction. The browser/save flow is deliberately manual because it crosses WordPress, ACF, media, and TinyMCE lifecycles.
