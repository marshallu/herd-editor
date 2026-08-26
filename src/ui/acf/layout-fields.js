/**
 * Which rendered fields are layout, not content.
 *
 * A layout field draws something in the admin and holds nothing: ACF's Message,
 * Tab and Accordion, and Herd's Spacer. Herd derives a count or a summary from a
 * field group in several places, and a layout field is not one of the things any
 * of them means:
 *
 *   - the block summary line in the collapsed accordion row (../summary.js)
 *   - the repeater row summary (./repeater.js)
 *   - a group's badge, and the filled/total it is derived from (./group.js)
 *
 * They all route through here rather than each testing for `spacer` inline. Six
 * inline checks drift apart across releases, and every one of them would have
 * had to be written twice — once for the new field type, once for Message, which
 * has been counted as a real field the whole time. A group holding one field and
 * one Message badges "Empty" today when the field is filled.
 *
 * The block summary is the exception that needs no change: it reads the block's
 * saved `data` attribute rather than the DOM, and a layout field contributes
 * nothing to that. It is listed above because the next person will look for it.
 *
 * The PHP side of the same question is `herd_editor_is_layout_field()` in
 * includes/herd-editor-layout-fields.php, which asks it of a field array.
 */

/**
 * ACF field types that hold no value.
 *
 * Kept as a list rather than derived, because the DOM does not carry the field
 * type's category — only its name, on `data-type`. `herd_editor_layout_field_types()`
 * in PHP names the same four and is filterable there; a site adding a layout
 * type of its own gets the PHP half for free and needs this one extended.
 */
export const LAYOUT_TYPES = [ 'spacer', 'message', 'tab', 'accordion' ];

/**
 * Does this field hold no value?
 *
 * `data-type` is ACF's own attribute and carries the type exactly.
 * `acf-field-{type}` is the fallback, for the one place the attribute can be
 * missing: a `<th class="acf-th">` in a table repeater, which `./table-repeater.js`
 * reads before it rewrites the row. Underscores become hyphens in the class, so
 * `true_false` is `acf-field-true-false` — none of the layout types has one, but
 * the substitution is done anyway so adding one later is not a trap.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {boolean} True when the field is layout and should not be counted.
 */
export function isLayoutField( field ) {
	if ( ! field?.classList ) return false;
	const type = field.dataset?.type;
	if ( type ) return LAYOUT_TYPES.includes( type );
	return LAYOUT_TYPES.some( ( name ) => field.classList.contains( `acf-field-${ name.replace( /_/g, '-' ) }` ) );
}

/**
 * Drop the layout fields from a list of rendered fields.
 *
 * @param {Iterable<HTMLElement>} fields Field wrappers.
 * @return {HTMLElement[]} The ones that hold a value.
 */
export function contentFields( fields ) {
	return Array.from( fields || [] ).filter(
		( node ) => node?.classList?.contains( 'acf-field' ) && ! isLayoutField( node )
	);
}
