/** A small, DOM-free index of the parsed document used by search and outline. */

import { anchorOf, duplicateAnchors } from './anchors.js';
import { bodyFor, collectBlocks, isHidden, titleFor } from './blocks.js';
import { blockSummary, cleanText, humanize } from './summary.js';
import { adapterFor } from '../adapters.js';

function flatten( value, result = [] ) {
	if ( value == null ) return result;
	if ( Array.isArray( value ) ) { value.forEach( ( item ) => flatten( item, result ) ); return result; }
	if ( typeof value === 'object' ) {
		if ( value.title ) result.push( value.title );
		if ( value.url ) result.push( value.url );
		Object.values( value ).forEach( ( item ) => flatten( item, result ) );
		return result;
	}
	result.push( String( value ) );
	return result;
}

function fieldText( data, fields ) {
	const result = [];
	Object.entries( data || {} ).forEach( ( [ name, value ] ) => {
		if ( name.startsWith( '_' ) ) return;
		const field = fields?.[ data?.[ `_${ name }` ] ];
		result.push( field?.label || humanize( name ) );
		flatten( value ).forEach( ( item ) => {
			const choice = field?.choices?.[ item ];
			result.push( choice || item );
		} );
	} );
	return result;
}

export function highlightText( value, term ) {
	const text = String( value || '' );
	if ( ! term ) return [ { text, match: false } ];
	const expression = new RegExp( `(${ String( term ).replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) })`, 'ig' );
	return text.split( expression ).filter( ( part ) => part !== '' ).map( ( part ) => ( { text: part, match: expression.test( part ) } ) );
}

export class BlockIndex {
	constructor( { blockTypes = {}, acfFields = {} } = {} ) { this.blockTypes = blockTypes; this.acfFields = acfFields; this.records = new Map(); }
	update( blocks, validationErrors = [] ) {
		const duplicates = duplicateAnchors( blocks );
		const errors = new Map();
		validationErrors.forEach( ( error ) => errors.set( error.blockId, [ ...( errors.get( error.blockId ) || [] ), error.message || error ] ) );
		const live = new Set();
		const walk = ( siblings, ancestors = [], path = [] ) => siblings.forEach( ( block, index ) => {
			if ( ! block.name ) return;
			live.add( block.clientId );
			const metadata = this.blockTypes[ block.name ] || {};
			const adapter = adapterFor( block, metadata );
			const warning = duplicates.has( anchorOf( block ) ) ? [ 'Duplicate anchor' ] : [];
			const validation = errors.get( block.clientId ) || [];
			const previous = this.records.get( block.clientId );
			if ( !previous || previous.block !== block || previous.warning.join() !== warning.join() || previous.errors.join() !== validation.join() ) {
				const title = titleFor( block, this.blockTypes );
				const summary = blockSummary( block, adapter.id, bodyFor( block ) );
				const terms = [ title, block.name, summary, anchorOf( block ), ...fieldText( block.attributes?.data, this.acfFields ), isHidden( block ) ? 'hidden' : '', ...warning, ...validation ].map( cleanText ).filter( Boolean );
				this.records.set( block.clientId, { clientId: block.clientId, block, title, summary, anchor: anchorOf( block ), hidden: isHidden( block ), warning, errors: validation, ancestors: ancestors.map( ( item ) => item.clientId ), path: [ ...path, index ], text: terms.join( ' ' ).toLowerCase() } );
			}
			walk( block.innerBlocks || [], [ ...ancestors, block ], [ ...path, index ] );
		} );
		walk( blocks );
		[ ...this.records.keys() ].forEach( ( id ) => { if ( !live.has( id ) ) this.records.delete( id ); } );
		return this.all();
	}
	all() { return [ ...this.records.values() ].sort( ( a, b ) => a.path.join( '.' ).localeCompare( b.path.join( '.' ), undefined, { numeric: true } ) ); }
	query( term ) {
		const query = cleanText( term ).toLowerCase();
		if ( !query ) return this.all();
		const matched = this.all().filter( ( record ) => record.text.includes( query ) );
		const included = new Set( matched.flatMap( ( record ) => [ record.clientId, ...record.ancestors ] ) );
		return this.all().filter( ( record ) => included.has( record.clientId ) ).map( ( record ) => ( { ...record, matched: record.text.includes( query ) } ) );
	}
}

export function outlineRecords( records, filter = 'all' ) {
	return records.filter( ( record ) => filter === 'all' || ( filter === 'hidden' && record.hidden ) || ( filter === 'errors' && record.errors.length ) || ( filter === 'warnings' && record.warning.length ) );
}
