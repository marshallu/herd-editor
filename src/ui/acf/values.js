/**
 * What a rendered field holds, and what a repeater row is.
 *
 * These questions are asked by ./repeater.js, ./group.js, ./slots.js and
 * ./flexible.js alike — "would this field say anything", "is it on the table
 * right now", "does it hold a value", "is this repeater's row count fixed",
 * "what would you call this". They live here rather than in whichever module
 * happened to need them first, because ./group.js imported the first two from
 * ./repeater.js and ./repeater.js now needs the third back: a cycle that works
 * until the day one of them grows a side effect at module scope.
 */

import { cleanText, humanize, truncate } from '../summary.js';
import { contentFields } from './layout-fields.js';

/**
 * What a repeater calls itself.
 *
 * Its own label, which ./repeater.js and ./slots.js both lift into the header
 * they build, falling back to the field name for a field group that left the
 * label empty.
 *
 * @param {HTMLElement} field The `.acf-field-repeater` wrapper.
 * @return {string} The title.
 */
export function repeaterTitle( field ) {
	return cleanText( field.querySelector( ':scope > .acf-label label' )?.textContent )
		|| humanize( field.dataset.name || '' );
}

/** A field the active conditional logic has taken off the table says nothing. */
export function isReachable( field ) {
	return field.style.display !== 'none' && ! field.classList.contains( 'acf-hidden' );
}

/** Whatever this field would say about itself on one line. */
export function fieldText( field ) {
	if ( field.classList.contains( 'acf-field-wysiwyg' ) ) return cleanText( field.querySelector( 'textarea' )?.value );
	if ( field.classList.contains( 'acf-field-link' ) ) return cleanText( field.querySelector( '.link-title' )?.textContent );
	if ( field.classList.contains( 'acf-field-select' ) ) {
		const select = field.querySelector( 'select' );
		const option = select?.options[ select.selectedIndex ];
		return option && option.value ? cleanText( option.textContent ) : '';
	}
	if ( field.classList.contains( 'acf-field-button-group' ) ) {
		return cleanText( field.querySelector( 'input[type="radio"]:checked' )?.closest( 'label' )?.textContent );
	}
	const input = field.querySelector( 'input[type="text"], input[type="url"], input[type="email"], textarea' );
	return cleanText( input?.value );
}

/**
 * Does this field hold anything?
 *
 * `fieldText` answers what a field would *say*, which is deliberately nothing
 * for an image or a file — a filename is not a summary. This counts what is
 * set, so those types are read from the hidden input carrying the real value.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {boolean} True when the field has a value.
 */
export function hasValue( field ) {
	if ( ! field ) return false;
	if ( field.classList.contains( 'acf-field-true-false' ) ) {
		return Boolean( field.querySelector( 'input[type="checkbox"]' )?.checked );
	}
	if ( field.classList.contains( 'acf-field-link' ) ) {
		return Boolean( cleanText( field.querySelector( 'input.input-url' )?.value ) );
	}
	if ( field.classList.contains( 'acf-field-image' ) || field.classList.contains( 'acf-field-file' ) ) {
		return Boolean( cleanText( field.querySelector( 'input[type="hidden"]' )?.value ) );
	}
	if ( field.classList.contains( 'acf-field-repeater' ) ) {
		/*
		 * Rows are not content. ACF pads a repeater to its `min` server-side with
		 * empty rows (pro/fields/class-acf-repeater-table.php), so counting rows
		 * calls a four-slot photo grid full before a single photo is in it.
		 * ACF keeps a template row in the table too; that is not content either.
		 */
		return Array.from( field.querySelectorAll( 'tr.acf-row:not(.acf-clone)' ) ).some( rowHasValue );
	}
	return Boolean( fieldText( field ) );
}

/**
 * Does this repeater row hold anything?
 *
 * @param {HTMLElement} row A `tr.acf-row`.
 * @return {boolean} True when any of the row's content sub-fields has a value.
 */
export function rowHasValue( row ) {
	const cell = row?.querySelector?.( ':scope > td.acf-fields' );
	if ( ! cell ) return false;
	return contentFields( cell.children ).some( hasValue );
}

/** The rows of a repeater, less the template ACF keeps in the table. */
export function realRows( repeater ) {
	return Array.from( repeater.querySelectorAll( ':scope > table > tbody > tr.acf-row' ) )
		.filter( ( row ) => ! row.classList.contains( 'acf-clone' ) );
}

/**
 * Is this repeater's row count fixed?
 *
 * ACF writes `min` and `max` onto the wrapper it renders
 * (class-acf-repeater-table.php), and when `max <= min` it also drops the add
 * and remove buttons entirely — so the rows on screen are the only rows there
 * will ever be. Read from the DOM rather than configured per field, so a field
 * group that changes its mind needs no change here.
 *
 * @param {HTMLElement} repeater The `.acf-repeater` element.
 * @return {boolean} True when rows can be reordered but not added or removed.
 */
export function isFixed( repeater ) {
	const min = Number( repeater?.dataset?.min || 0 );
	const max = Number( repeater?.dataset?.max || 0 );
	return max > 0 && max === min;
}

/**
 * The singular of a repeater's own title, for naming one of its slots.
 *
 * Enough English to cover the field titles this site has — "Photos", "Cards",
 * "CTA cards", "Categories". A title that is already singular is left alone.
 *
 * @param {string} title The repeater's label.
 * @return {string} The singular form.
 */
export function singularize( title ) {
	const text = ( title || '' ).trim();
	if ( /ies$/i.test( text ) ) return text.slice( 0, -3 ) + 'y';
	if ( /(ses|xes|zes|ches|shes)$/i.test( text ) ) return text.slice( 0, -2 );
	if ( /[^s]s$/i.test( text ) ) return text.slice( 0, -1 );
	return text;
}

const NAME_TYPES = [ 'text', 'textarea', 'wysiwyg' ];
const SUMMARY_LIMIT = 90;

function nameType( field ) {
	return NAME_TYPES.some( ( type ) => field.classList.contains( `acf-field-${ type }` ) );
}

/**
 * The name and summary for one row.
 *
 * A repeater row's `td.acf-fields` and a flexible-content layout's
 * `.acf-fields` are the same shape — a container whose children are the fields —
 * so both are described by this.
 *
 * @param {HTMLElement} cell The container whose `.acf-field` children to read.
 * @return {{name: string, summary: string}} Row description.
 */
export function describeRow( cell ) {
	// `contentFields` drops the layout fields — a spacer, a message — which hold
	// nothing and so have nothing to contribute to a line describing the row.
	const fields = contentFields( cell.children ).filter( isReachable );

	const parts = [];
	let name = '';
	/*
	 * A link's title names its row as well as a text field would, but only when
	 * nothing better turns up: 18 of this site's repeaters carry no text,
	 * textarea or wysiwyg at all, and 11 of those are lists of links that would
	 * otherwise read "Untitled" all the way down.
	 */
	let linkTitle = '';
	let linkAt = -1;

	fields.forEach( ( field ) => {
		const text = fieldText( field );
		if ( ! text ) return;
		if ( ! name && nameType( field ) ) {
			name = text;
			return;
		}
		if ( ! linkTitle && field.classList.contains( 'acf-field-link' ) ) {
			linkTitle = text;
			linkAt = parts.length;
		}
		parts.push( text );
	} );

	// Promoted, not duplicated: a name is not also a summary fragment.
	if ( ! name && linkTitle ) {
		name = linkTitle;
		parts.splice( linkAt, 1 );
	}

	return { name: truncate( name, 64 ), summary: truncate( parts.join( ' · ' ), SUMMARY_LIMIT ) };
}

/* ---------- link lists ---------- */

/*
 * Eleven of this site's repeaters are lists of links: a link, and one or two
 * settings that qualify it. `describeRow` names such a row from the link title
 * and then joins whatever the settings say into one grey line — so a row reads
 * "Apply Now" over "info-circle", which is a field's value pretending to be a
 * sentence, and never shows the URL at all.
 *
 * A link list says the two things a link is — where it points, and how it is
 * flagged — as the two things they are. The URL becomes the row's second line,
 * and each remaining setting becomes a badge.
 *
 * This is a property of the field group, not of the surface it renders on: a
 * repeater whose rows are named by a link reads the same in a block panel and in
 * the settings rail.
 */

/** Choices and flags earn a badge; a URL or a number would just be more text. */
const BADGE_TYPES = [ 'true-false', 'select', 'button-group', 'radio' ];

function badgeType( field ) {
	return BADGE_TYPES.some( ( type ) => field.classList.contains( `acf-field-${ type }` ) );
}

/**
 * The row ACF would clone to make the next one.
 *
 * Read in preference to a real row because it is there before the first row is,
 * so an empty repeater is still recognisable as the list of links it will be.
 *
 * @param {HTMLElement} repeater The `.acf-repeater` element.
 * @return {HTMLElement|null} The row's field cell.
 */
function templateCell( repeater ) {
	const row = repeater.querySelector( ':scope > table > tbody > tr.acf-clone' ) || realRows( repeater )[ 0 ];
	return row?.querySelector( ':scope > td.acf-fields' ) || null;
}

/**
 * Is every row of this repeater a link and its settings?
 *
 * One link, and nothing that would have named the row ahead of it — a text,
 * textarea or wysiwyg field means the field group had something else in mind.
 *
 * @param {HTMLElement} repeater The `.acf-repeater` element.
 * @return {boolean} True for a list of links.
 */
export function isLinkList( repeater ) {
	const cell = templateCell( repeater );
	if ( ! cell ) return false;
	const fields = contentFields( cell.children );
	const links = fields.filter( ( field ) => field.classList.contains( 'acf-field-link' ) );
	return links.length === 1 && ! fields.some( nameType );
}

/**
 * What one badge says.
 *
 * The text is the field's own name rather than its label: two field groups
 * spell the same flag "Primary CTA" and "Primary Call-to-Action", and a badge
 * has room for neither. `primary_cta` is what both of them are.
 *
 * A flag that is off says nothing — it is not a state anybody needs reported. A
 * choice that is empty does, because a link with no icon is a decision somebody
 * can still make from the row.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {{text: string, tone: string}|null} The badge, or null for no badge.
 */
function badgeFor( field ) {
	const name = humanize( field.dataset.name || '' );
	if ( field.classList.contains( 'acf-field-true-false' ) ) {
		return hasValue( field ) ? { text: name, tone: 'on' } : null;
	}
	const text = fieldText( field );
	return text ? { text, tone: 'set' } : { text: `No ${ name.toLowerCase() }`, tone: 'empty' };
}

/**
 * The name, URL and badges for one row of a link list.
 *
 * @param {HTMLElement} cell The row's `td.acf-fields`.
 * @return {{name: string, summary: string, badges: Array}} Row description.
 */
export function describeLinkRow( cell ) {
	const fields = contentFields( cell.children ).filter( isReachable );
	const link = fields.find( ( field ) => field.classList.contains( 'acf-field-link' ) );

	return {
		name: truncate( cleanText( link?.querySelector( '.link-title' )?.textContent ), 64 ),
		// The hidden input, not the rendered `.link-url`: src/ui/acf/link.js turns
		// that into a span and ACF writes to both, but only one of them is the value.
		summary: truncate( cleanText( link?.querySelector( 'input.input-url' )?.value ), SUMMARY_LIMIT ),
		badges: fields.filter( ( field ) => field !== link && badgeType( field ) ).map( badgeFor ).filter( Boolean ),
	};
}
