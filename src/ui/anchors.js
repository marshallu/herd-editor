/** Pure helpers for block anchors. No DOM, no React. */

import { collectBlocks } from './blocks.js';

/**
 * WordPress's own HTML-anchor filter.
 *
 * Whitespace and `#` are the two characters that break a fragment link -- one
 * ends the id, the other starts a new fragment -- so both become a hyphen as the
 * author types. Everything else is left alone: an id may hold almost anything,
 * and silently slugifying what someone typed would break an anchor they had
 * already published.
 *
 * @param {string} value Raw input.
 * @return {string} The anchor as it should be stored.
 */
export function normalizeAnchor( value ) {
	return String( value ?? '' ).replace( /[\s#]/g, '-' );
}

/** A block's anchor, or an empty string. */
export function anchorOf( block ) {
	const anchor = block?.attributes?.anchor;
	return typeof anchor === 'string' ? anchor : '';
}

/**
 * Anchor values more than one block in the document claims.
 *
 * A repeated id is not an error the browser reports: it silently sends every
 * jump link to the first match, so the second block is simply unreachable.
 *
 * @param {Array} blocks The parsed tree.
 * @return {Set<string>} The values in conflict.
 */
export function duplicateAnchors( blocks ) {
	const counts = new Map();
	for ( const block of collectBlocks( blocks ) ) {
		const anchor = anchorOf( block );
		if ( ! anchor ) continue;
		counts.set( anchor, ( counts.get( anchor ) || 0 ) + 1 );
	}
	return new Set( [ ...counts ].filter( ( [ , count ] ) => count > 1 ).map( ( [ anchor ] ) => anchor ) );
}
