/** Pure, source-only search helpers. This intentionally knows nothing about ACF forms. */

import { anchorOf } from './anchors.js';
import { bodyFor, isHidden, titleFor } from './blocks.js';
import { blockSummary } from './summary.js';
import { adapterFor } from '../adapters.js';

export function highlightParts( value, term ) {
	const text = String( value || '' ); const query = String( term || '' ).trim();
	if ( !query ) return [ { text, match: false } ];
	const expression = new RegExp( `(${ query.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) })`, 'ig' );
	return text.split( expression ).filter( Boolean ).map( ( text ) => ( { text, match: text.toLowerCase() === query.toLowerCase() } ) );
}

function searchableFields( data, fields ) {
	const values = [];
	Object.entries( data || {} ).forEach( ( [ name, value ] ) => {
		if ( name.startsWith( '_' ) ) return;
		const field = fields?.[ data?.[ `_${ name }` ] ];
		values.push( { location: field?.label || name.replace( /[_-]+/g, ' ' ), value: field?.choices?.[ String( value ) ] || value } );
		if ( value && typeof value === 'object' ) { if ( value.title ) values.push( { location: field?.label || name, value: value.title } ); if ( value.url ) values.push( { location: field?.label || name, value: value.url } ); }
	} );
	return values;
}

export function searchRows( blocks, term, blockTypes = [], { acfFields = {}, validationErrors = [], duplicateIds = new Set() } = {} ) {
	const query = String( term || '' ).trim().toLowerCase();
	const records = [];
	const walk = ( siblings, ancestors = [], path = [] ) => {
		let structuralIndex = 0;
		for ( const block of siblings || [] ) {
			if ( !block.name ) continue;
			const metadata = blockTypes[ block.name ] || {};
			const adapter = adapterFor( block, metadata );
			const title = titleFor( block, blockTypes );
			const summary = blockSummary( block, adapter.id, bodyFor( block ) );
			const validation = validationErrors.filter( ( error ) => error.blockId === block.clientId ).map( ( error ) => error.message || String( error ) );
			const locations = [ { location: 'title', value: title }, { location: 'block', value: block.name }, { location: 'summary', value: summary }, { location: 'anchor', value: anchorOf( block ) }, ...searchableFields( block.attributes?.data, acfFields ), ...( isHidden( block ) ? [ { location: 'status', value: 'hidden' } ] : [] ), ...( duplicateIds.has( anchorOf( block ) ) ? [ { location: 'warning', value: 'duplicate anchor' } ] : [] ), ...validation.map( ( value ) => ( { location: 'validation', value } ) ) ];
			const match = locations.find( ( item ) => String( item.value || '' ).toLowerCase().includes( query ) );
			records.push( { block, ancestors, path: [ ...path, structuralIndex++ ], matches: !query || Boolean( match ), match } );
			walk( block.innerBlocks, [ ...ancestors, block ], path );
		}
	};
	walk( blocks );
	if ( !query ) return records;
	const included = new Set( records.filter( ( record ) => record.matches ).flatMap( ( record ) => [ record.block.clientId, ...record.ancestors.map( ( item ) => item.clientId ) ] ) );
	return records.filter( ( record ) => included.has( record.block.clientId ) );
}
