/**
 * ACF group fields become collapsible sections.
 *
 * A group is the one ACF field type that is a container and renders as nothing:
 * Herd strips the border ACF gives it and lays the sub-fields out on the same
 * grid as everything else, so Basic Content's `video` group reads as five loose
 * fields that happen to sit together. Nothing on screen says the theme either
 * ships that object or doesn't.
 *
 * The row is the whole component — a disclosure control that also reports what
 * is inside, the same bargain `./repeater.js` makes for repeater rows. Summary
 * line, status badge, and an incomplete group that forces itself open, because a
 * required field hiding behind a closed row is the one real failure mode here.
 *
 * DOM shape, after decoration:
 *   .acf-field-group.herd-group
 *     > .acf-label                     (hidden; its text is the header title)
 *     > .herd-grouprow                 (button, aria-expanded/aria-controls)
 *     > .acf-input > .acf-fields > .acf-field...
 *
 * One thing here is authored rather than inferred: `data-herd-open="1"` on the
 * wrapper, which the plugin puts there for a group whose field group ticked
 * "Open by default" under Presentation. Everything else this module knows it
 * reads off the shape of ACF's own markup.
 */

import { cleanText, humanize, truncate } from '../summary.js';
import { awakenEditors } from './editor.js';
import { contentFields } from './layout-fields.js';
import { fieldText, hasValue, isReachable } from './values.js';

/* Re-exported: the badge's own tests reach for it here, and this is where it is
   used. ./values.js holds it so ./repeater.js can ask the same question. */
export { hasValue };

/** Two fragments, like the repeater row: a third never survives the ellipsis. */
const SUMMARY_PARTS = 2;
const SUMMARY_LIMIT = 90;

/** Ids have to be unique per element, and a repeater repeats every field key. */
let uid = 0;

/** ACF marks a required field on the wrapper and again with an asterisk. */
function isRequired( field ) {
	return Boolean( field?.classList?.contains( 'is-required' ) );
}

/**
 * What this sub-field is called, for the "Needs …" badge.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {string} The field's label.
 */
export function subLabel( field ) {
	// The asterisk lives in a span inside the label; cleanText leaves it behind.
	const label = cleanText( field?.querySelector?.( ':scope > .acf-label label' )?.textContent ).replace( /\s*\*$/, '' );
	return label || humanize( field?.dataset?.name || '' );
}

/**
 * What a group says about itself on one line.
 *
 * Conditionally hidden sub-fields are off the table entirely: they say nothing,
 * and counting them would badge a group "2 of 5 set" when three of those five
 * are not on offer.
 *
 * @param {HTMLElement[]} fields The group's sub-field wrappers.
 * @return {{summary: string, filled: number, total: number, missing: string}} Group status.
 */
export function describeGroup( fields ) {
	/*
	 * Layout fields are off the table before conditional logic is even consulted.
	 * A spacer is not an empty field, and a group of one filled field beside one
	 * spacer must not badge "Empty" — an editor who learns the badge lies stops
	 * reading it.
	 */
	const reachable = contentFields( fields ).filter( isReachable );

	const parts = [];
	let filled = 0;
	let missing = '';

	reachable.forEach( ( field ) => {
		if ( hasValue( field ) ) filled += 1;
		else if ( ! missing && isRequired( field ) ) missing = subLabel( field );

		if ( parts.length < SUMMARY_PARTS ) {
			const text = fieldText( field );
			if ( text ) parts.push( text );
		}
	} );

	return { summary: truncate( parts.join( ' · ' ), SUMMARY_LIMIT ), filled, total: reachable.length, missing };
}

/**
 * The badge for a group's status.
 *
 * Only the states that need a reader to do something get a badge. A count of
 * filled fields does not: the summary line already shows what is in there, and
 * "2 of 3 set" reads as a problem on a group where the third field is optional.
 *
 * @param {{filled: number, missing: string}} status From `describeGroup`.
 * @return {string} Badge text, or an empty string when there is nothing to say.
 */
export function badgeFor( { filled, missing } ) {
	if ( missing ) return `Needs ${ missing.toLowerCase() }`;
	if ( ! filled ) return 'Empty';
	return '';
}

/**
 * Should this group start open?
 *
 * Two reasons, and either is enough. The field group can ask for it — "Open by
 * default" under Presentation, for the one fold on a block that is worth landing
 * on — and a group with nothing on the form to compare itself against gains
 * nothing by hiding. An incomplete group is not decided here: `refresh()` opens
 * that one and the header refuses to close it.
 *
 * @param {{preferOpen: boolean, only: boolean}} state Authored setting, and whether it stands alone.
 * @return {boolean} True when the group opens on load.
 */
export function opensByDefault( { preferOpen, only } ) {
	return Boolean( preferOpen || only );
}

function buildHeader( field, bodyId ) {
	const header = document.createElement( 'button' );
	header.type = 'button';
	header.className = 'herd-grouprow';
	header.setAttribute( 'aria-expanded', 'false' );
	header.setAttribute( 'aria-controls', bodyId );

	const title = document.createElement( 'span' );
	title.className = 'herd-grouprow__title';
	title.textContent =
		cleanText( field.querySelector( ':scope > .acf-label label' )?.textContent ).replace( /\s*\*$/, '' ) ||
		humanize( field.dataset.name || '' );

	const summary = document.createElement( 'span' );
	summary.className = 'herd-grouprow__summary';

	const badge = document.createElement( 'span' );
	badge.className = 'herd-badge';

	const chev = document.createElement( 'span' );
	chev.className = 'herd-grouprow__chev dashicons dashicons-arrow-down-alt2';
	chev.setAttribute( 'aria-hidden', 'true' );

	header.append( title, summary, badge, chev );
	return { header, summary, badge };
}

/**
 * The form this group belongs to, for the "only group on the screen" rule.
 *
 * @param {HTMLElement} field The group wrapper.
 * @return {HTMLElement|null} The block form.
 */
function formOf( field ) {
	return field.closest( '.acf-block-fields' );
}

function decorateGroup( field ) {
	const input = field.querySelector( ':scope > .acf-input' );
	const fields = input?.querySelector( ':scope > .acf-fields' );
	// A group with no sub-fields renders nothing at all; there is no container to
	// draw around an empty `.acf-input`.
	if ( ! input || ! fields ) return;

	/*
	 * Two collapsible levels, maximum. A fold inside a fold is a third place for
	 * a required field to hide, so a group inside a group keeps the flat stack.
	 * No block field group nests groups today; this is what holds if one starts.
	 */
	if ( field.parentElement?.closest( '.herd-group' ) ) {
		field.classList.add( 'herd-group--flat' );
		return;
	}

	field.classList.add( 'herd-group' );

	uid += 1;
	const bodyId = `herd-group-${ uid }`;
	input.id = bodyId;

	const { header, summary, badge } = buildHeader( field, bodyId );
	field.insertBefore( header, input );

	let incomplete = false;

	const setOpen = ( open ) => {
		field.classList.toggle( 'is-open', open );
		header.setAttribute( 'aria-expanded', String( open ) );
		// Cheap insurance: no block group holds a wysiwyg directly, but one of the
		// five that hold a repeater could gain a row that does, and TinyMCE built
		// inside a hidden container measures itself at zero.
		if ( open ) awakenEditors( field );
	};

	const refresh = () => {
		const status = describeGroup( fields.children );
		summary.textContent = status.summary;
		const text = badgeFor( status );
		badge.textContent = text;
		// An empty badge is still a pill's worth of border and padding.
		badge.hidden = ! text;
		badge.classList.toggle( 'herd-badge--needs', Boolean( status.missing ) );

		incomplete = Boolean( status.missing );
		field.classList.toggle( 'is-incomplete', incomplete );
		// A group that has just become incomplete opens itself and stays open.
		if ( incomplete && ! field.classList.contains( 'is-open' ) ) setOpen( true );
	};

	header.addEventListener( 'click', () => {
		// Collapsing past a missing required field is the failure this prevents.
		if ( incomplete && field.classList.contains( 'is-open' ) ) return;
		setOpen( ! field.classList.contains( 'is-open' ) );
	} );

	field.addEventListener( 'input', refresh );
	field.addEventListener( 'change', refresh );
	/*
	 * Five groups hold a repeater, and adding or removing a row changes what the
	 * badge should say without firing either of the above. ACF's row actions are
	 * anchors, so the click is the signal — after its own handler has run.
	 */
	field.addEventListener( 'click', () => window.setTimeout( refresh, 0 ) );

	refresh();
	if ( ! incomplete ) {
		// Collapsed is the default state, unless the field group asked otherwise or
		// there is nothing else on the form to compare against.
		const form = formOf( field );
		setOpen(
			opensByDefault( {
				preferOpen: field.dataset.herdOpen === '1',
				only: form ? form.querySelectorAll( '.acf-field-group' ).length === 1 : false,
			} )
		);
	}
}

/**
 * Turn every group in a root into a collapsible section.
 *
 * Reads rendered values — a link's resolved title, an image's attachment id — so
 * it runs after the field decorators have settled, and skips work it has already
 * done so a repeater row that arrives later is decorated on its own.
 *
 * @param {HTMLElement} root Form, or one repeater row.
 */
export function decorateGroups( root ) {
	if ( ! root ) return;
	root.querySelectorAll( '.acf-field-group' ).forEach( ( field ) => {
		// ACF's template row is not content, and a group already done is done.
		if ( field.closest( '.acf-clone' ) ) return;
		if ( field.classList.contains( 'herd-group' ) || field.classList.contains( 'herd-group--flat' ) ) return;
		decorateGroup( field );
	} );
}
