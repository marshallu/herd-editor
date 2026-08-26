# Herd Editor

A third editing mode for WordPress, alongside Classic and the Block Editor, built for sites whose pages are ACF blocks. It renders the same Gutenberg document either way — the block list is a set of accordion rows, and opening one mounts that block's real ACF form.

Requires ACF Pro 6.0 or newer. Without it the plugin declines to offer itself and both native editors are unaffected.

---

## Field widths

Every ACF field can be given a width, and Herd lays fields out in rows honouring it.

The setting is **ACF's own**, not Herd's: field → Presentation → Wrapper Attributes → Width, which ACF has stored since 5.0. Herd replaces the freeform number input with a segmented control over six presets — 100%, 75%, 66%, 50%, 33%, 25% — and stores the number exactly where ACF does. Empty is valid and means 100%.

Using ACF's storage is the point. Widths survive field group export and import, `acf-json` sync, Clone fields, ACF upgrades, and deactivating or deleting Herd — after which they are still editable through stock ACF.

**Existing widths are snapped to the nearest preset**, ties going to the wider one. Nothing is discarded silently: the field's own instructions say what it was and what it became, and the `herd_editor_width_snapped` action fires for anything that wants to log it. A snapped width is not written back until you save the field group.

Fields flow left to right in authored order and wrap when the row runs out of room. Two 66% fields do not pair up — the second wraps and the first row keeps 34% of dead space. That is the behaviour, and the Spacer field is how a field group fills that space on purpose.

Below 782px every field takes the full width.

### Extending the preset set

```php
add_filter( 'herd_editor_width_presets', function ( $presets ) {
	$presets[] = 20;
	return $presets;
} );
```

The stylesheet has a rule per preset, keyed on a twelve-column grid. A preset that does not divide twelve — or that the stylesheet has not been extended for — renders full width.

---

## The Spacer field

A field type that holds no data and exists only to consume horizontal space, so the fields around it land where you want them. It is in the field type picker under **Layout**, next to Message, Tab and Accordion.

- **Width** — ACF's wrapper width, the same control as every other field. This is the point of the field.
- **Style** — `Blank` (default) or `Line`, a `#dcdcde` hairline across the spacer.
- **Label** — optional, none by default. A labelled spacer is a section heading, which is arguably the Accordion field's job. It works; it is not encouraged.

A **part-width** spacer fills the rest of a row, so the field after it starts a new one. A 50% select followed by a 50% spacer puts the next field on the row below — the case the field exists for.

A **full-width** spacer (100%, which is also what you get if you leave Width alone) is a row separator: it ends the row before it and starts the row after it. At `Style: Line` that is a rule across the form.

A blank spacer is invisible. It has no border, no background, no label and no height of its own — it takes up grid space and nothing else. It is not focusable, is not in the tab order, and carries `aria-hidden="true"` unless you give it a label, so a screen reader user never lands on an empty field.

### Conditional logic

A field hidden by conditional logic leaves the grid, and the rows re-pack around it. **When every content field sharing a row is hidden, the spacers in that row are hidden too** — otherwise a spacer is left alone in a visibly empty band where a row used to be. This happens on the toggle, not on reload. Full-width separators are exempt: they are never sharing a row, so nothing can strand them.

### Small screens

Below 782px every field is full width and **every spacer is hidden**. A 50% spacer becoming a full-width blank row on a narrow screen would be a hole in the middle of the form.

### What it does not do

A spacer **never holds a value**. It renders no input, so nothing is serialized, no postmeta row is written, and it never appears in `get_fields()`, `get_field_objects()`, a block's `data` attribute, the REST API, or a WPGraphQL schema. It cannot be required and cannot block a save. Adding one to a field group does not change what any block renders on the public site.

It is also excluded from every count and summary Herd derives — the block summary line, repeater row summaries, and a group's status badge. A spacer is not an empty field.

### Repeaters in Table layout

ACF's `table` repeater layout gives every sub-field its own column. A spacer there would be an empty column under an empty heading on every row. A table repeater holding a spacer is therefore **rendered in Block layout instead**, and the field group editor says so in a notice. The field group is not modified — only what is drawn.

---

## Deactivating

**Every stored spacer is converted to an empty ACF Message field.** Widths, positions, labels and field keys are untouched, and reactivating converts them straight back, style included.

This is a write to your field groups, on deactivate, which deserves an explanation.

Left alone, a spacer on a site without Herd is a field of an unregistered type. ACF renders that harmlessly — a stray label over an empty box, no notice, no error, nothing saved. The damage is one step further on. ACF's Field Type select has no option for a type it does not know, so no option is marked selected, so the browser posts the first one: `text`. ACF writes what was posted without merging what was stored. **One Update on an unrelated field in that group would silently turn every spacer into a live Text field with a name**, which then writes postmeta and shows up in `get_fields()`.

Message is the right place to land: ACF ships it, it holds no value, it is out of REST, and an empty one renders as nothing.

### What this does not cover

The conversion can only touch field groups **stored in the database**. Field groups defined in `acf-json` or through `acf_add_local_field_group()` are read-only from here, and the plugin has no business rewriting a file in your theme or an array in your code. Those keep a field of type `spacer` while Herd is off.

They are not lost. Every spacer carries a `herd-spacer` wrapper class, and ACF's field group editor round-trips the wrapper class input for *any* field type, known or not. **Reactivating Herd finds those markers and restores the spacers** — including any that had been corrupted to `text` by a re-save.

The one thing that does not survive a re-save while Herd is deactivated is a Line spacer's style, and only if the wrapper class was also edited by hand.

**While Herd is deactivated, avoid re-saving a field group that contains spacers.** Nothing breaks if you do, and reactivating repairs it, but the round trip is avoidable.

## Uninstalling

Uninstall removes nothing. See `uninstall.php` — the file exists to record that decision, since it is the first place anyone will look.

Herd stores no options, transients, tables or postmeta of its own.

---

## Filters

| Filter | What it changes |
|---|---|
| `herd_editor_width_presets` | The widths offered in the field group editor |
| `herd_editor_width_snapped` | *(action)* Fires when a stored width is moved onto the preset set |
| `herd_editor_layout_field_types` | Field types treated as holding no value when ACF cannot be asked |
| `herd_editor_post_types` | Post types Herd is offered for |
| `herd_editor_user_can_access` | Who may open Herd for a post |
| `herd_editor_block_groups` | Which inserter group each block lands in |
| `herd_editor_block_group_order` | Display order of the inserter's groups |
| `herd_editor_rail_tabs` | Which rail tab each meta box lands in |
| `herd_editor_rail_tab_labels` | The rail's tabs and their labels |
| `herd_editor_icons` | The icon set published to the editor |
| `herd_editor_expand_warn_at` | How many blocks Expand all mounts before confirming |
