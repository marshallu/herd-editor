/**
 * Which fields share a row, and what that means for the spacers in it.
 *
 * This solves the bug the Spacer field would otherwise ship with.
 *
 * A field hidden by conditional logic is `display: none` but still in the DOM.
 * A `display: none` grid item is not placed at all, so everything after it
 * slides up and the rows re-pack around the gap. A spacer positioned relative to
 * a field that has just disappeared is now somewhere else — or, in the case that
 * matters, alone in a visibly empty band where a row used to be. Toggle the
 * select at the top of a Hero block and you get a stripe of nothing.
 *
 * So: when every content field in a visual row is hidden, the spacers in that
 * row are hidden too. It has to be reactive, because ACF toggles conditional
 * logic on change and the layout has to answer on the toggle rather than on the
 * next page load.
 *
 * WORKING OUT WHICH FIELDS SHARE A ROW without measuring anything. The grid is
 * twelve columns with `grid-auto-flow: row`, which places each item at the first
 * position at or after the cursor where its span fits, and never moves the
 * cursor backwards. `pack()` below is that rule written out. It has to agree
 * with src/css/_widths.scss, and the two are checked against each other by
 * tests/rows.test.js.
 *
 * Reading `offsetTop` would be the other way to answer the same question. It
 * would also be a forced synchronous layout on every keystroke that changes a
 * conditional, and it would give a different answer while the form is still
 * being built.
 */

import { isLayoutField } from './layout-fields.js';

/** Tracks in the grid. Mirrors `repeat(12, ...)` in src/css/_widths.scss. */
export const COLUMNS = 12;

/** `data-herd-width` to span. Mirrors `$spans` in src/css/_widths.scss. */
export const SPANS = { 75: 9, 66: 8, 50: 6, 33: 4, 25: 3 };

/** Half a row: what a compact control and a repeater row's toggle each get. */
const HALF = 6;

/** Marks a spacer whose row has nothing left in it to space. */
export const ORPHAN_CLASS = 'is-herd-orphan';

/** ACF's class for the field type this module exists to manage. */
const SPACER = 'acf-field-spacer';

/** Below this the grid collapses to one field per row and CSS hides every spacer. */
export const MOBILE = 782;

/** ACF's two ways of saying a field is not on offer; `./repeater.js` reads the same pair. */
function isHidden( field ) {
	return field.style?.display === 'none' || field.classList.contains( 'acf-hidden' );
}

/** A repeater row's own cell, where a toggle takes half a row rather than all of it. */
function inRepeaterRow( field ) {
	const parent = field.parentElement;
	return Boolean( parent && 'TD' === parent.tagName && parent.classList?.contains( 'acf-fields' ) );
}

/**
 * How many of the twelve tracks this field takes.
 *
 * The order is the stylesheet's order: an authored width first, because it
 * outranks everything Herd infers, then the role, then the whole row.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {number} Tracks, 1 to 12.
 */
export function spanOf( field ) {
	const width = field.getAttribute?.( 'data-herd-width' );
	if ( width && SPANS[ width ] ) return SPANS[ width ];
	if ( field.classList?.contains( 'herd-field--controls' ) ) return HALF;
	if ( field.classList?.contains( 'acf-field-true-false' ) && inRepeaterRow( field ) ) return HALF;
	return COLUMNS;
}

/**
 * Group fields into the rows the grid will put them in.
 *
 * @param {HTMLElement[]} fields Visible fields, in DOM order.
 * @return {HTMLElement[][]} One array per visual row.
 */
export function pack( fields ) {
	const rows = [];
	let row = [];
	let cursor = 0;

	fields.forEach( ( field ) => {
		const span = Math.min( Math.max( spanOf( field ), 1 ), COLUMNS );
		// The span does not fit in what is left, so the grid starts a new row and
		// leaves the remainder of this one empty. That dead space is exactly what a
		// spacer is for, which is why it is modelled rather than avoided.
		if ( cursor + span > COLUMNS && row.length ) {
			rows.push( row );
			row = [];
			cursor = 0;
		}
		row.push( field );
		cursor += span;
	} );

	if ( row.length ) rows.push( row );
	return rows;
}

/**
 * Is this spacer a deliberate row separator rather than a gap in a row?
 *
 * A full-width spacer is never sharing a row with anything — it takes all twelve
 * tracks — so it is doing a different job from a 50% one. It ends the row before
 * it and starts the row after it, and at `Style: Line` it draws a rule across
 * the form. That is authored, and it must survive the orphan rule below, which
 * would otherwise see a row holding one layout field and nothing else and hide
 * every separator on every form.
 *
 * A spacer with no authored width at all is full width, and so is a separator
 * too. That is the right way round: somebody who adds a Spacer and saves without
 * touching Width should see the row break they asked for, not a field that
 * silently renders as nothing.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {boolean} True when the spacer owns its row by authoring.
 */
export function isSeparator( field ) {
	return field.classList?.contains( SPACER ) && spanOf( field ) === COLUMNS;
}

/**
 * Hide the spacers in every row that has nothing left to space.
 *
 * Iterated to a fixed point, because hiding a spacer takes it out of the grid
 * too and the rows below re-pack around it. Three passes is far more than any
 * real form needs and is a guard against a rule that never settles rather than a
 * budget.
 *
 * Marks with a class rather than setting `style.display`, so the stylesheet
 * keeps ownership of what "hidden" means and there is nothing here to undo at
 * the mobile breakpoint. Every spacer is cleared first, so this is idempotent
 * and a condition turning back on restores the spacer without any bookkeeping.
 *
 * @param {HTMLElement} container An element holding `.acf-field` children.
 * @return {number} How many spacers were hidden.
 */
export function syncSpacers( container ) {
	const fields = Array.from( container.children ).filter( ( node ) => node.classList?.contains( 'acf-field' ) );
	// Separators are not managed here: they own their row by authoring rather
	// than by accident, so there is no arrangement of hidden neighbours that can
	// strand one.
	const spacers = fields.filter( ( field ) => field.classList.contains( SPACER ) && ! isSeparator( field ) );
	if ( ! spacers.length ) return 0;

	spacers.forEach( ( spacer ) => spacer.classList.remove( ORPHAN_CLASS ) );

	for ( let pass = 0; pass < 3; pass++ ) {
		const visible = fields.filter( ( field ) => ! isHidden( field ) && ! field.classList.contains( ORPHAN_CLASS ) );
		let changed = false;

		pack( visible ).forEach( ( row ) => {
			// A row still holding something an editor can fill in is a row the
			// spacers in it are still shaping.
			if ( row.some( ( field ) => ! isLayoutField( field ) ) ) return;
			row.forEach( ( field ) => {
				if ( ! spacers.includes( field ) || field.classList.contains( ORPHAN_CLASS ) ) return;
				field.classList.add( ORPHAN_CLASS );
				changed = true;
			} );
		} );

		if ( ! changed ) break;
	}

	return spacers.filter( ( spacer ) => spacer.classList.contains( ORPHAN_CLASS ) ).length;
}

/**
 * Bring every container under a root up to date.
 *
 * Containers are found from the spacers rather than from a list of selectors:
 * a spacer's parent is its container by definition, whether that is the block
 * form, a group body, an open repeater row or a flexible-content layout. One
 * fewer list to keep in step with the stylesheet.
 *
 * @param {HTMLElement} root Form, or any subtree of one.
 * @return {number} How many spacers are hidden across the root.
 */
export function syncRoot( root ) {
	if ( ! root?.querySelectorAll ) return 0;

	const containers = new Set();
	root.querySelectorAll( '.acf-field-spacer' ).forEach( ( spacer ) => {
		// ACF's template row is not on screen and never will be; the row cloned
		// from it is synced when it arrives.
		if ( spacer.closest( '.acf-clone' ) ) return;
		if ( spacer.parentElement ) containers.add( spacer.parentElement );
	} );

	let hidden = 0;
	containers.forEach( ( container ) => {
		hidden += syncSpacers( container );
	} );
	return hidden;
}

/**
 * Keep spacers in step with conditional logic, live.
 *
 * ACF announces a conditional toggle as `show_field` / `hide_field` with the
 * context `conditional_logic`, which is the precise signal. `change` on the form
 * is listened to as well: a field can be shown or hidden by things ACF does not
 * announce that way, and re-running this is cheap — it reads classes and
 * attributes and touches the DOM only when a row's contents actually changed.
 *
 * Coalesced into one pass per frame. A select that gates six fields fires six
 * `hide_field` actions, and each one would otherwise re-pack every row.
 *
 * Below the mobile breakpoint this does nothing and clears what it did: the grid
 * is one field per row down there and the stylesheet hides every spacer outright,
 * so there is no such thing as an orphaned one.
 *
 * @param {HTMLElement} form The mounted `.acf-block-fields` element.
 * @return {Function} Disposer.
 */
export function watchSpacers( form ) {
	if ( ! form ) return () => {};
	const { acf } = window;

	const narrow = () =>
		typeof window.matchMedia === 'function' && window.matchMedia( `(max-width: ${ MOBILE }px)` ).matches;

	const run = () => {
		if ( narrow() ) {
			form.querySelectorAll( `.${ ORPHAN_CLASS }` ).forEach( ( node ) => node.classList.remove( ORPHAN_CLASS ) );
			return;
		}
		syncRoot( form );
	};

	let frame = null;
	const schedule = () => {
		if ( frame !== null ) return;
		frame = window.requestAnimationFrame( () => {
			frame = null;
			run();
		} );
	};

	run();

	// `append` covers a repeater row arriving, which brings its own spacers and
	// its own conditional logic with it.
	const actions = [ 'show_field', 'hide_field', 'append' ];
	if ( acf?.addAction ) actions.forEach( ( action ) => acf.addAction( action, schedule ) );
	form.addEventListener( 'change', schedule );

	const media = typeof window.matchMedia === 'function' ? window.matchMedia( `(max-width: ${ MOBILE }px)` ) : null;
	media?.addEventListener?.( 'change', schedule );

	return () => {
		if ( frame !== null ) window.cancelAnimationFrame( frame );
		if ( acf?.removeAction ) actions.forEach( ( action ) => acf.removeAction( action, schedule ) );
		form.removeEventListener( 'change', schedule );
		media?.removeEventListener?.( 'change', schedule );
	};
}
