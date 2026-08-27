/**
 * Normalises ACF's table-layout repeaters into its block layout.
 *
 * ACF renders a repeater one of three ways. In `block` and `row` layout every
 * sub-field of a row lives inside a single `<td class="acf-fields">`. In `table`
 * layout there is no such cell: each sub-field is its own `<td class="acf-field">`,
 * and the labels are hoisted out of the rows into a `<thead>` of `<th class="acf-th">` —
 * which is also the only place a sub-field's authored width appears, because
 * `acf_render_field_wrap()` emits `data-width` for every wrapper element except `tr`
 * and `td`.
 *
 * Herd's repeater work assumes the first shape everywhere. `decorateRepeater`
 * looks for `td.acf-fields` and returns early without it, so a table repeater
 * gets the styled header but no card row, no collapse, no grip and no row tools
 * — while the field decorators still run and drop Herd's tall custom controls
 * (icon picker, link chip, media tile) into ACF's narrow table cells. Nothing
 * lines up, and the `<thead>` that gave the columns their only alignment is
 * hidden by the stylesheet.
 *
 * 28 of this site's 70 block repeaters are authored in table layout, so rather
 * than teach every selector and decorator a second DOM shape, the shape is made
 * uniform once, here. The guide wants a collapsed summary row for repeater items
 * regardless of how the field happens to be configured, and a table row cannot
 * carry one.
 *
 * This must run in `prepare`, before `acf.doAction( 'append' )`: it moves nodes,
 * and moving an already-initialised field tears down what ACF built on it.
 *
 * Safe against ACF's own behaviour:
 *   - Its repeater JS never mentions `acf-fields`, `acf-th`, `thead`, or the
 *     layout modifier; it works on `tr.acf-row`, the order handle's span, and
 *     `.acf-field[data-key]`. All three are preserved.
 *   - Every attribute of the original cell is carried onto the replacement, so
 *     `data-key`, `data-name`, `data-required` and the field classes survive, and
 *     the `data-width` only the header cell had is carried across with them.
 *   - Inputs are moved, never recreated, so `name` attributes and therefore
 *     serialisation are untouched.
 *   - The `.acf-clone` template row is normalised too, so rows added later come
 *     out in the same shape.
 */

/**
 * Rebuild the `.acf-label` that table layout hoisted into the `<thead>`.
 *
 * @param {HTMLElement} field The field wrapper being populated.
 * @param {HTMLElement} th    The matching header cell.
 * @return {HTMLElement} The label block.
 */
function buildLabel( field, th ) {
	const wrap = document.createElement( 'div' );
	wrap.className = 'acf-label';

	const label = document.createElement( 'label' );
	const source = th.querySelector( 'label' );
	// Cloned rather than copied through innerHTML: the required asterisk is an
	// element, and there is no reason to reparse trusted markup already on page.
	if ( source ) {
		Array.from( source.childNodes ).forEach( ( node ) => label.appendChild( node.cloneNode( true ) ) );
	}
	// ACF's `rename` rewrites `for` alongside `id` and `name` when it clones a
	// row, so pointing at the control here survives duplication.
	const control = field.querySelector( 'input:not([type="hidden"]), select, textarea' );
	if ( control?.id ) label.htmlFor = control.id;
	wrap.appendChild( label );

	const description = th.querySelector( '.description' );
	if ( description ) wrap.appendChild( description.cloneNode( true ) );

	return wrap;
}

/**
 * Turn one `<td class="acf-field">` into the `<div class="acf-field">` that
 * block layout would have produced.
 *
 * @param {HTMLElement}      cell The table cell to convert.
 * @param {HTMLElement|null} th   Its header cell, when one was found.
 * @return {HTMLElement} The replacement field.
 */
function toFieldDiv( cell, th ) {
	const field = document.createElement( 'div' );
	Array.from( cell.attributes ).forEach( ( attribute ) => field.setAttribute( attribute.name, attribute.value ) );
	while ( cell.firstChild ) field.appendChild( cell.firstChild );
	if ( th ) {
		/*
		 * ACF drops a sub-field's authored width for a `td` wrapper — the
		 * `$element !== 'td'` test in `acf_render_field_wrap()` — and writes it on the
		 * header cell instead. The `<thead>` is removed a few lines below, so the width
		 * has to move now or it is lost, and every sized sub-field in a table-layout
		 * repeater comes out full width.
		 *
		 * Only `data-width` moves. ACF's companion `style="width:50%"` is for its own
		 * sidebar layout, which Herd throws away wherever it lays fields out itself, so
		 * copying it would only be something else to override.
		 */
		const width = th.getAttribute( 'data-width' );
		if ( width && ! field.hasAttribute( 'data-width' ) ) field.setAttribute( 'data-width', width );
		// After the move, so the label can find the control it names.
		field.insertBefore( buildLabel( field, th ), field.firstChild );
	}
	return field;
}

/**
 * Rewrite every table-layout repeater in a form.
 *
 * @param {HTMLElement} form The un-initialised `.acf-block-fields` element.
 */
export function normalizeTableRepeaters( form ) {
	if ( ! form ) return;
	form.querySelectorAll( '.acf-repeater.-table' ).forEach( ( repeater ) => {
		const table = repeater.querySelector( ':scope > table.acf-table' );
		if ( ! table ) return;

		const head = table.querySelector( ':scope > thead' );
		const headings = new Map();
		head?.querySelectorAll( 'th.acf-th' ).forEach( ( th ) => {
			if ( th.dataset.key ) headings.set( th.dataset.key, th );
		} );

		table.querySelectorAll( ':scope > tbody > tr' ).forEach( ( row ) => {
			const cells = Array.from( row.children ).filter( ( cell ) => cell.classList.contains( 'acf-field' ) );
			if ( ! cells.length ) return;

			const holder = document.createElement( 'td' );
			holder.className = 'acf-fields';
			// Inserted where the first field cell sat, so it stays between the two
			// row handles and the order/remove columns keep their positions.
			cells[ 0 ].before( holder );
			cells.forEach( ( cell ) => {
				holder.appendChild( toFieldDiv( cell, headings.get( cell.dataset.key ) || null ) );
				cell.remove();
			} );
		} );

		head?.remove();
		repeater.classList.remove( '-table' );
		repeater.classList.add( '-block' );
	} );
}
