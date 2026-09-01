/**
 * Row summary derivation.
 *
 * The summary line is read from real block data: an ACF block's own `data`
 * attribute, or a core block's saved body. The derivation below knows no field
 * name this site happens to use, so a block with nothing to say gets no summary.
 *
 * A handful of blocks earn a better line than generic ranking can produce —
 * "4 cards, 3 per row" is not something a flat key/value walk can discover. Those
 * come from the site's own profiles — see `./acf/profiles.js` — and are consulted
 * first; everything else, and anything a profile leaves empty, falls back to the
 * generic path.
 */

import { profileSummary } from './acf/profiles.js';

const PREFERRED_KEYS = [ 'title', 'heading', 'headline', 'label', 'name', 'subheading', 'subhead', 'text', 'content', 'message', 'type', 'style' ];
/** Values that describe an absence, and so say nothing worth a summary slot. */
const EMPTY_VALUES = [ '0', '1', 'none', 'default' ];
const VALUE_LIMIT = 64;
const LINE_LIMIT = 120;
const MAX_PARTS = 3;

/** Strip markup and collapse whitespace. */
export function cleanText( value ) {
	return String( value == null ? '' : value )
		.replace( /<[^>]*>/g, ' ' )
		.replace( /&nbsp;/gi, ' ' )
		.replace( /&amp;/gi, '&' )
		.replace( /\s+/g, ' ' )
		.trim();
}

export function truncate( value, limit = VALUE_LIMIT ) {
	const text = String( value );
	return text.length > limit ? `${ text.slice( 0, limit - 1 ).trimEnd() }…` : text;
}

/** Turn a field name or slug-shaped value into something readable. */
export function humanize( value ) {
	const text = String( value ).replace( /[_-]+/g, ' ' ).trim();
	return text ? text.charAt( 0 ).toUpperCase() + text.slice( 1 ) : '';
}

/** ACF stores repeater and flexible-content rows as `field_0_subfield` siblings. */
function isRowCount( key, value, keys ) {
	if ( ! /^\d+$/.test( String( value ) ) ) return false;
	const prefix = `${ key }_`;
	return keys.some( ( candidate ) => candidate.startsWith( prefix ) && /^\d/.test( candidate.slice( prefix.length ) ) );
}

function rank( key ) {
	const index = PREFERRED_KEYS.findIndex( ( preferred ) => key === preferred || key.endsWith( `_${ preferred }` ) );
	return index === -1 ? PREFERRED_KEYS.length : index;
}

/**
 * Summary fragments for an ACF block's flat `data` map.
 *
 * @param {Object} data ACF block data attribute.
 * @return {string[]} Fragments, most descriptive first.
 */
export function acfSummaryParts( data ) {
	const source = data && typeof data === 'object' ? data : {};
	const keys = Object.keys( source );
	const candidates = [];

	keys.forEach( ( key, order ) => {
		// `_field` keys mirror ACF field keys, and `field_0_sub` keys are row contents.
		if ( ! key || key.charAt( 0 ) === '_' || /_\d+_/.test( key ) ) return;
		const value = source[ key ];
		if ( value == null || typeof value === 'object' ) return;

		if ( isRowCount( key, value, keys ) ) {
			const count = Number( value );
			if ( ! count ) return;
			const noun = humanize( key ).toLowerCase();
			candidates.push( { order, rank: PREFERRED_KEYS.length + 1, text: `${ count } ${ count === 1 ? noun.replace( /s$/, '' ) : noun }` } );
			return;
		}

		const text = cleanText( value );
		// "0" and "1" are true/false fields, which the panel shows as switches; "none"
		// and "default" are a setting explicitly turned off.
		if ( ! text || EMPTY_VALUES.includes( text.toLowerCase() ) ) return;
		// A bare number here is an attachment or post id, which means nothing to a
		// reader. Row counts were already handled above.
		if ( /^\d+$/.test( text ) ) return;
		const readable = /\s/.test( text ) ? text : humanize( text );
		candidates.push( { order, rank: rank( key ), text: truncate( readable ) } );
	} );

	return candidates
		.sort( ( a, b ) => a.rank - b.rank || a.order - b.order )
		.slice( 0, MAX_PARTS )
		.map( ( candidate ) => candidate.text );
}

/**
 * Summary fragments from a block's profile, when it has one.
 *
 * @param {string} blockName Registered block name.
 * @param {Object} data      ACF block data attribute.
 * @return {string[]} Fragments, or an empty list when there is no profile.
 */
export function profileSummaryParts( blockName, data ) {
	let parts;
	try {
		parts = profileSummary( blockName, data );
	} catch ( error ) {
		// A profile is site configuration; a broken one must not blank the row.
		return [];
	}
	return ( Array.isArray( parts ) ? parts : [] )
		.filter( Boolean )
		.map( ( part ) => cleanText( part ) )
		.filter( Boolean )
		.map( ( part ) => truncate( part ) );
}

/**
 * The summary line for one row.
 *
 * @param {Object} block     Parsed block.
 * @param {string} adapterId Adapter handling the block.
 * @param {string} body      Saved body markup for core blocks.
 * @return {string} Summary, or an empty string when the block has nothing to say.
 */
export function blockSummary( block, adapterId, body = '' ) {
	if ( adapterId === 'acf' ) {
		const data = block?.attributes?.data;
		const parts = profileSummaryParts( block?.name, data );
		return truncate( ( parts.length ? parts : acfSummaryParts( data ) ).join( ' · ' ), LINE_LIMIT );
	}
	if ( [ 'paragraph', 'heading', 'html', 'shortcode' ].includes( adapterId ) ) {
		return truncate( cleanText( body ), LINE_LIMIT );
	}
	return '';
}
