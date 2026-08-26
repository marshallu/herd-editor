/**
 * Per-field widths, read from ACF and published for the stylesheet.
 *
 * ACF renders a field's authored width twice: as `data-width="50"` on the
 * wrapper, and as an inline `style="width:50%"`. Both are for its own sidebar
 * layout, which floats fields and draws a divider between neighbours. Herd's
 * stylesheet has always thrown both away, and this module is what replaces them:
 * it reads the authored number, snaps it onto Herd's preset set, and writes
 * `data-herd-width`, which the stylesheet turns into a column span.
 *
 * Why a second attribute rather than styling `[data-width]` directly:
 *
 *   1. `data-width` is whatever the field group happens to hold. Six of this
 *      site's sized fields are off-preset, and a stylesheet cannot have a rule
 *      for every integer. Snapping has to happen somewhere, and the DOM is the
 *      one place that sees every container — block form, group body, repeater
 *      row, flexible layout — with one pass.
 *   2. `data-width` belongs to ACF. The Block Editor and the Classic editor read
 *      the same markup, and Herd has no business changing what a field renders
 *      as on screens it does not own. Writing a Herd-owned attribute from Herd's
 *      own JS cannot reach them.
 *
 * Widths are inert data: setting an attribute initialises nothing and destroys
 * nothing, so unlike the field moves in `./layout.js` this can run either side of
 * `acf.doAction( 'append' )`.
 */

/**
 * The widths the stylesheet has a rule for.
 *
 * Kept in step with `herd_editor_width_presets()` in PHP by hand, and by the
 * comment in `_acf.scss` that names the same six numbers. A site that filters the
 * PHP set and does not extend the stylesheet gets full width for the new value,
 * which is the safe direction to be wrong in.
 */
export const WIDTH_PRESETS = [ 100, 75, 66, 50, 33, 25 ];

/**
 * Move an authored width onto the preset set.
 *
 * A tie goes to the wider preset: a field slightly too narrow truncates what it
 * holds, a field slightly too wide only takes dead space. `WIDTH_PRESETS` is
 * ordered widest first, so a strict `<` comparison keeps the first — widest —
 * preset at equal distance.
 *
 * @param {*} value The authored width, as `data-width` gives it.
 * @return {number} A preset percentage; 100 for anything unusable.
 */
export function snapWidth( value ) {
	const width = Number.parseFloat( value );
	if ( ! Number.isFinite( width ) || width <= 0 || width >= 100 ) return 100;
	return WIDTH_PRESETS.reduce(
		( best, preset ) => ( Math.abs( preset - width ) < Math.abs( best - width ) ? preset : best ),
		100
	);
}

/**
 * Publish every field's width under a root.
 *
 * Scoped to fields that are direct children of a container Herd lays out, so a
 * width authored on a sub-field is answered by the group or repeater row that
 * holds it rather than by the block form two levels up. `.acf-clone` is ACF's
 * template row and never renders, but it is the source every row added later is
 * cloned from, so it is written to as well.
 *
 * @param {HTMLElement} root Form, repeater row, or any container holding fields.
 */
export function applyWidths( root ) {
	if ( ! root?.querySelectorAll ) return;

	const fields = [ root, ...root.querySelectorAll( '.acf-field' ) ].filter(
		( node ) => node.classList?.contains( 'acf-field' )
	);

	fields.forEach( ( field ) => {
		const width = snapWidth( field.getAttribute( 'data-width' ) );
		/*
		 * A field with no authored width gets no attribute at all, so the role the
		 * layout inferred for it — half a row for a compact control, the whole row
		 * for everything else — still decides. Writing `100` here would silently
		 * promote every unsized field to its own line.
		 */
		if ( ! field.hasAttribute( 'data-width' ) || width === 100 ) {
			field.removeAttribute( 'data-herd-width' );
			return;
		}
		field.setAttribute( 'data-herd-width', String( width ) );
	} );
}
