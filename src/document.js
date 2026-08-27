const BLOCK_COMMENT = /<!--[\t\n\r ]+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)[\t\n\r ]+(\{(?:(?:[^}]+|}(?![\t\n\r ]+\/?-->))*)\}[\t\n\r ]+)?(\/)?-->/g;

let nextClientId = 1;

export function createClientId() {
	return `herd-${ Date.now().toString( 36 ) }-${ nextClientId++ }`;
}

function attributesFromToken( token ) {
	if ( ! token.attrsSource ) return {};
	try { return JSON.parse( token.attrsSource.trim() ); } catch { return {}; }
}

function tokenize( source ) {
	const tokens = [];
	BLOCK_COMMENT.lastIndex = 0;
	let match;
	while ( ( match = BLOCK_COMMENT.exec( source ) ) ) {
		tokens.push( {
			start: match.index, end: BLOCK_COMMENT.lastIndex, raw: match[ 0 ],
			closing: Boolean( match[ 1 ] ), name: `${ match[ 2 ] || 'core/' }${ match[ 3 ] }`,
			attrsSource: match[ 4 ] || '', selfClosing: Boolean( match[ 5 ] ), pair: -1,
		} );
	}
	const stack = [];
	for ( let index = 0; index < tokens.length; index++ ) {
		const token = tokens[ index ];
		if ( ! token.closing && ! token.selfClosing ) stack.push( index );
		else if ( token.closing && stack.length ) {
			const opener = stack.pop();
			tokens[ opener ].pair = index;
			token.pair = opener;
		}
	}
	return tokens;
}

function parseLevel( source, tokens, from, to, start, end ) {
	const nodes = [];
	let cursor = start;
	for ( let index = from; index < to; index++ ) {
		const token = tokens[ index ];
		if ( token.start < cursor || token.closing || ( ! token.selfClosing && token.pair < 0 ) ) continue;
		if ( token.start > cursor ) nodes.push( freeformNode( source.slice( cursor, token.start ), cursor, token.start ) );
		if ( token.selfClosing ) {
			nodes.push( blockNode( token, '', [], [], source.slice( token.start, token.end ) ) );
			cursor = token.end;
			continue;
		}
		const close = tokens[ token.pair ];
		const innerBlocks = parseLevel( source, tokens, index + 1, token.pair, token.end, close.start );
		const innerContent = [];
		let innerCursor = token.end;
		for ( const child of innerBlocks ) {
			if ( child.start > innerCursor ) innerContent.push( source.slice( innerCursor, child.start ) );
			if ( child.name === null ) innerContent.push( child.source );
			else innerContent.push( null );
			innerCursor = child.end;
		}
		if ( innerCursor < close.start ) innerContent.push( source.slice( innerCursor, close.start ) );
		const structuralChildren = innerBlocks.filter( ( child ) => child.name !== null );
		nodes.push( blockNode( token, close.raw, structuralChildren, innerContent, source.slice( token.start, close.end ), token.start, close.end ) );
		cursor = close.end;
		index = token.pair;
	}
	if ( cursor < end ) nodes.push( freeformNode( source.slice( cursor, end ), cursor, end ) );
	return nodes;
}

function freeformNode( source, start = 0, end = start + source.length ) {
	return { clientId: createClientId(), name: null, attributes: {}, innerBlocks: [], innerContent: [ source ], opening: '', closing: '', source, start, end, changed: false, attributesChanged: false };
}

function blockNode( token, closing, innerBlocks, innerContent, source, start = token.start, end = token.end ) {
	return { clientId: createClientId(), name: token.name, attributes: attributesFromToken( token ), innerBlocks, innerContent, opening: token.raw, closing, source, start, end, selfClosing: token.selfClosing, changed: false, attributesChanged: false };
}

export function createBlock( name, attributes = {}, { selfClosing = true, body = '' } = {} ) {
	const block = {
		clientId: createClientId(), name, attributes: { ...attributes }, innerBlocks: [],
		innerContent: selfClosing ? [] : [ body ], opening: '', closing: selfClosing ? '' : `<!-- /wp:${ name.startsWith( 'core/' ) ? name.slice( 5 ) : name } -->`,
		source: '', start: 0, end: 0, selfClosing, changed: true, attributesChanged: true,
	};
	block.opening = generatedOpening( block );
	return block;
}

export function parseDocument( source = '' ) {
	const tokens = tokenize( source );
	return parseLevel( source, tokens, 0, tokens.length, 0, source.length );
}

export function findBlockByClientId( blocks, clientId ) {
	for ( const block of blocks || [] ) {
		if ( block.clientId === clientId ) return block;
		const found = findBlockByClientId( block.innerBlocks, clientId );
		if ( found ) return found;
	}
	return null;
}

function generatedOpening( block ) {
	const name = block.name.startsWith( 'core/' ) ? block.name.slice( 5 ) : block.name;
	const json = Object.keys( block.attributes || {} ).length ? ` ${ serializeBlockAttributes( block.attributes ) }` : '';
	return `<!-- wp:${ name }${ json } ${ block.selfClosing ? '/-->' : '-->' }`;
}

/**
 * Mirror WordPress's `serialize_block_attributes()` exactly.
 *
 * JSON.stringify already has the same unescaped slash and Unicode behaviour as
 * WordPress's JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE flags. The
 * replacements must happen in one pass: replacing a backslash first and then
 * replacing an escaped quote would otherwise alter the escape we just wrote.
 */
export function serializeBlockAttributes( attributes ) {
	const replacements = {
		'\\\\': '\\u005c',
		'--': '\\u002d\\u002d',
		'<': '\\u003c',
		'>': '\\u003e',
		'&': '\\u0026',
		'\\"': '\\u0022',
	};
	return JSON.stringify( attributes ).replace( /\\\\|--|<|>|&|\\"/g, ( value ) => replacements[ value ] );
}

export function serializeDocument( blocks ) {
	return ( blocks || [] ).map( serializeNode ).join( '' );
}

function serializeNode( block ) {
	if ( ! block.changed ) return block.source;
	if ( block.name === null ) return block.source;
	if ( block.selfClosing ) return block.attributesChanged ? generatedOpening( block ) : block.opening;
	let childIndex = 0;
	const inner = block.innerContent.map( ( fragment ) => fragment === null ? serializeNode( block.innerBlocks[ childIndex++ ] ) : fragment ).join( '' );
	return ( block.attributesChanged ? generatedOpening( block ) : block.opening ) + inner + block.closing;
}

function mapTree( blocks, clientId, transform ) {
	let found = false;
	const result = blocks.map( ( block ) => {
		if ( block.clientId === clientId ) { found = true; return transform( block ); }
		const children = mapTree( block.innerBlocks || [], clientId, transform );
		if ( ! children.found ) return block;
		found = true;
		return { ...block, innerBlocks: children.blocks, changed: true };
	} );
	return { blocks: result, found };
}

export function replaceAttributes( blocks, clientId, attributes ) {
	return mapTree( blocks, clientId, ( block ) => ( { ...block, attributes: { ...block.attributes, ...attributes }, changed: true, attributesChanged: true } ) ).blocks;
}

export function replaceAttributesExact( blocks, clientId, attributes ) {
	return mapTree( blocks, clientId, ( block ) => ( { ...block, attributes: { ...( attributes || {} ) }, changed: true, attributesChanged: true } ) ).blocks;
}

export function replaceBlockBody( blocks, clientId, body ) {
	return mapTree( blocks, clientId, ( block ) => {
		if ( block.name === null || block.selfClosing ) return block;
		return { ...block, innerBlocks: [], innerContent: [ String( body ) ], changed: true };
	} ).blocks;
}

export function cloneBlock( block ) {
	return {
		...block,
		clientId: createClientId(),
		attributes: structuredClone( block.attributes || {} ),
		innerBlocks: ( block.innerBlocks || [] ).map( cloneBlock ),
	};
}

export function removeBlock( blocks, clientId ) {
	const direct = blocks.findIndex( ( block ) => block.clientId === clientId );
	if ( direct >= 0 ) return [ ...blocks.slice( 0, direct ), ...blocks.slice( direct + 1 ) ];
	for ( let index = 0; index < blocks.length; index++ ) {
		const parent = blocks[ index ];
		const childIndex = parent.innerBlocks.findIndex( ( child ) => child.clientId === clientId );
		if ( childIndex >= 0 ) {
			const innerContent = removeChildPlaceholder( parent.innerContent, childIndex );
			const replacement = { ...parent, innerBlocks: [ ...parent.innerBlocks.slice( 0, childIndex ), ...parent.innerBlocks.slice( childIndex + 1 ) ], innerContent, changed: true };
			return [ ...blocks.slice( 0, index ), replacement, ...blocks.slice( index + 1 ) ];
		}
		const children = removeBlock( parent.innerBlocks, clientId );
		if ( children !== parent.innerBlocks ) {
			const replacement = { ...parent, innerBlocks: children, changed: true };
			return [ ...blocks.slice( 0, index ), replacement, ...blocks.slice( index + 1 ) ];
		}
	}
	return blocks;
}

function placeholderPosition( innerContent, childIndex ) {
	let seen = 0;
	for ( let index = 0; index < innerContent.length; index++ ) if ( innerContent[ index ] === null && seen++ === childIndex ) return index;
	return innerContent.length;
}

function removeChildPlaceholder( innerContent, childIndex ) {
	const position = placeholderPosition( innerContent, childIndex );
	return [ ...innerContent.slice( 0, position ), ...innerContent.slice( position + 1 ) ];
}

export function insertBlock( blocks, parentId, index, block ) {
	if ( parentId === null ) return [ ...blocks.slice( 0, index ), block, ...blocks.slice( index ) ];
	return mapTree( blocks, parentId, ( parent ) => {
		const children = parent.innerBlocks || [];
		const at = Math.max( 0, Math.min( index, children.length ) );
		const position = placeholderPosition( parent.innerContent, at );
		return { ...parent, innerBlocks: [ ...children.slice( 0, at ), block, ...children.slice( at ) ], innerContent: [ ...parent.innerContent.slice( 0, position ), null, ...parent.innerContent.slice( position ) ], changed: true };
	} ).blocks;
}

function locate( blocks, clientId, parentId = null ) {
	for ( let index = 0; index < blocks.length; index++ ) {
		if ( blocks[ index ].clientId === clientId ) return { block: blocks[ index ], parentId, index };
		const found = locate( blocks[ index ].innerBlocks || [], clientId, blocks[ index ].clientId );
		if ( found ) return found;
	}
	return null;
}

export function moveBlock( blocks, clientId, parentId, index ) {
	const source = locate( blocks, clientId );
	if ( ! source || clientId === parentId || findBlockByClientId( source.block.innerBlocks, parentId ) ) return blocks;
	const adjusted = source.parentId === parentId && source.index < index ? index - 1 : index;
	return insertBlock( removeBlock( blocks, clientId ), parentId, adjusted, source.block );
}
