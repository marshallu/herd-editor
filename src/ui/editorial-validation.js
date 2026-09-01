/** Pure, derived editorial checks shared by the editor surfaces. */

import { collectBlocks } from './blocks.js';
import { anchorOf } from './anchors.js';

export function editorialResult( result = {} ) {
	return {
		ruleId: String( result.ruleId || result.rule || 'editorial' ),
		severity: [ 'error', 'warning', 'suggestion' ].includes( result.severity ) ? result.severity : 'error',
		blockId: String( result.blockId || '' ),
		field: result.field ? String( result.field ) : '',
		message: String( result.message || 'This value needs attention.' ),
		help: result.help ? String( result.help ) : '',
		fix: result.fix || null,
	};
}

export function normalizeEditorialResults( results ) {
	return ( Array.isArray( results ) ? results : [] ).map( editorialResult );
}

function empty( value ) {
	return value === null || value === undefined || value === '' || ( Array.isArray( value ) && ! value.length );
}

/** Lightweight checks. More site-specific checks arrive as server results on publish. */
export function validateEditorialDocument( blocks, config = {} ) {
	const results = [];
	const seenAnchors = new Map();
	for ( const block of collectBlocks( blocks ) ) {
		const anchor = anchorOf( block );
		if ( anchor ) {
			const previous = seenAnchors.get( anchor );
			if ( previous ) {
				const result = { ruleId: 'duplicate-anchor', severity: 'error', message: `The anchor “${ anchor }” is used more than once.`, help: 'Anchors must be unique so jump links reach the intended block.' };
				results.push( editorialResult( { ...result, blockId: previous } ), editorialResult( { ...result, blockId: block.clientId } ) );
			} else seenAnchors.set( anchor, block.clientId );
		}
		const fields = config.meaningfulImageFields?.[ block.name ] || [];
		for ( const field of fields ) {
			const value = block.attributes?.data?.[ field ];
			const image = typeof value === 'object' && value ? value : null;
			if ( image && ! image.alt && ! image.alt_text ) results.push( editorialResult( { ruleId: 'missing-alt', severity: 'warning', blockId: block.clientId, field, message: 'This meaningful image has no alternative text.', help: 'Describe the image’s purpose for people who cannot see it.' } ) );
		}
	}
	return results;
}

export function blocksWithEditorialErrors( results ) {
	return new Set( normalizeEditorialResults( results ).filter( ( result ) => result.severity === 'error' ).map( ( result ) => result.blockId ) );
}
