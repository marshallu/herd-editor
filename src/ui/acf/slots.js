/**
 * A fixed set of image fields becomes a grid of slots.
 *
 * ACF pads a repeater to its `min` server-side, so a field with `min` and `max`
 * both 4 arrives as four rows before anyone has touched it, and — because
 * `max <= min` also drops the add and remove buttons — those four rows are the
 * only rows there will ever be. Billboard's photo grid is the case: four rows,
 * one image field each, and the theme's offset layout hardcodes which of the
 * four is double-width.
 *
 * ./repeater.js renders a row as a collapsed summary line, which is the right
 * bargain for a card carrying a title, a blurb and a link. It is the wrong one
 * here twice over. A row whose only content is an image has nothing to
 * summarize — `describeRow` finds no text field and the row reads "Untitled" —
 * and since only one row opens at a time, attaching four photos costs eight
 * clicks. The image *is* the row, so the row is drawn as the image.
 *
 * Nothing is moved out of ACF's table. `tbody` becomes a grid and each
 * `tr.acf-row` becomes a tile, the same trick _acf-repeater.scss already plays
 * one level down — which keeps ACF's sortable, its `[data-name]` descendant
 * lookups and its row renumbering all working. The tile itself is the
 * `.herd-mediarow` ./media.js has already built; only its axis changes.
 *
 * DOM shape, after decoration:
 *   .acf-repeater.herd-repeater.herd-slots
 *     > .herd-repeater__head              (title, "2 of 4 chosen")
 *     > table > tbody                     (display: grid)
 *         > tr.acf-row                    (one tile)
 *             > td.acf-row-handle.order   (the grip, floated over the tile)
 *             > td.acf-fields > .acf-field-image > ... .herd-mediarow
 */

import { GRIP_ICON } from './grip.js';
import { contentFields } from './layout-fields.js';
import { isFixed, realRows, repeaterTitle, rowHasValue, singularize } from './values.js';

/** The sub-field types a slot can hold. One of them, and nothing else. */
const MEDIA_TYPES = [ 'acf-field-image', 'acf-field-file' ];

/**
 * Is this repeater a fixed set of single media fields?
 *
 * Every row has to qualify, not just the first: a repeater whose rows disagree
 * about their shape is not something this module has a layout for.
 *
 * @param {HTMLElement} repeater The `.acf-repeater` element.
 * @return {boolean} True when the slot grid applies.
 */
export function isMediaSlots( repeater ) {
	if ( ! isFixed( repeater ) ) return false;
	const rows = realRows( repeater );
	if ( ! rows.length ) return false;
	return rows.every( ( row ) => {
		const cell = row.querySelector( ':scope > td.acf-fields' );
		if ( ! cell ) return false;
		const fields = contentFields( cell.children );
		return fields.length === 1 && MEDIA_TYPES.some( ( type ) => fields[ 0 ].classList.contains( type ) );
	} );
}

/**
 * How many of these slots are filled, said out loud.
 *
 * Grey, and phrased as progress rather than as a fault. The block is unfinished,
 * which is information; red in this editor is for validation and for destructive
 * actions, and a half-built block is neither.
 *
 * @param {HTMLElement[]} rows The repeater's real rows.
 * @return {string} The count.
 */
export function progressText( rows ) {
	return `${ rows.filter( rowHasValue ).length } of ${ rows.length } chosen`;
}

/**
 * The invitation an empty slot shows.
 *
 * ./media.js writes a generic "Choose an image" into every empty media field.
 * In a slot grid the field's own label is hidden — four labels reading "Photo"
 * under a header reading "Photos" is the label said five times — so the noun
 * moves into the invitation, which is the one line an empty slot has.
 *
 * @param {string} noun The singular of the repeater's title.
 * @return {string} The invitation.
 */
export function inviteText( noun ) {
	const word = ( noun || 'image' ).toLowerCase();
	return `Choose ${ /^[aeiou]/.test( word ) ? 'an' : 'a' } ${ word }`;
}

function buildHead( title ) {
	const head = document.createElement( 'div' );
	head.className = 'herd-repeater__head';

	const name = document.createElement( 'span' );
	name.className = 'herd-repeater__title';
	name.textContent = title;

	const count = document.createElement( 'span' );
	count.className = 'herd-repeater__count';

	head.append( name, count );
	return { head, count };
}

/**
 * Lay a fixed media repeater out as slots.
 *
 * No row headers, no chevrons, no "Collapse all": there is nothing to collapse,
 * since a tile shows everything the row holds. No MutationObserver either —
 * ACF renders no add or remove control for a fixed repeater, so the only thing
 * that can happen to this list is a reorder, which changes no count and no
 * summary.
 *
 * @param {HTMLElement} field    The `.acf-field-repeater` wrapper.
 * @param {HTMLElement} repeater The `.acf-repeater` element, already marked.
 * @return {Function} Disposer for the listeners this attached.
 */
export function decorateSlots( field, repeater ) {
	repeater.classList.add( 'herd-slots' );

	const title = repeaterTitle( field );
	const { head, count } = buildHead( title );
	repeater.insertBefore( head, repeater.firstChild );

	const invite = inviteText( singularize( title ) );
	const rows = realRows( repeater );

	/*
	 * How many tiles fit across is the number of slots there are, which is a fact
	 * about the field rather than about the stylesheet — four photos want a row of
	 * four, and the front end renders them that way. Capped at four so a longer
	 * fixed set wraps instead of shrinking past the point of being a preview.
	 */
	repeater.style.setProperty( '--herd-slot-cols', String( Math.min( rows.length, 4 ) ) );

	rows.forEach( ( row ) => {
		/*
		 * Not a `<span>`: ACF renumbers with
		 * `$( row ).find( '> .order > span' ).html( index + 1 )`, which claims every
		 * direct span child of this cell.
		 */
		const handle = row.querySelector( ':scope > td.acf-row-handle.order' );
		if ( handle && ! handle.querySelector( '.herd-grip' ) ) {
			const grip = document.createElement( 'i' );
			grip.className = 'herd-grip';
			grip.innerHTML = GRIP_ICON;
			handle.insertBefore( grip, handle.firstChild );
		}

		const label = row.querySelector( '.herd-mediarow__invite' );
		if ( label ) label.textContent = invite;
	} );

	const paint = () => {
		count.textContent = progressText( realRows( repeater ) );
	};

	// A photo is chosen through the media modal, which lands as a `change` on the
	// field's hidden input — the same event ./media.js repaints the poster from.
	repeater.addEventListener( 'change', paint );
	paint();

	return () => repeater.removeEventListener( 'change', paint );
}
