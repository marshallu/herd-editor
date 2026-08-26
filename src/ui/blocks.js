/** Pure helpers over the parsed block tree. No DOM, no React. */

/** Human title for a block, preferring the registered block type's own title. */
export function titleFor( block, blockTypes = {} ) {
	const title = blockTypes[ block.name ]?.title;
	if ( title ) return title;
	return String( block.name || '' )
		.replace( /^[^/]+\//, '' )
		.split( /[-_]/ )
		.filter( Boolean )
		.map( ( word ) => word.charAt( 0 ).toUpperCase() + word.slice( 1 ) )
		.join( ' ' );
}

/** Saved markup for a block, with the inner-block placeholders removed. */
export function bodyFor( block ) {
	return ( block.innerContent || [] ).filter( ( fragment ) => fragment !== null ).join( '' );
}

/*
 * Whether a block is hidden on the front end.
 *
 * `hide_block` comes from the Block Visibility group in the theme
 * (themes/herdpress/inc/blocks.php), which ACF attaches to every registered
 * block. It is a true/false field, so ACF stores it as the string "1" or "0".
 */
export function isHidden( block ) {
	const value = block?.attributes?.data?.hide_block;
	return value === true || value === 1 || value === '1';
}

/** Flatten the rows the tree currently shows, honouring child disclosure. */
export function visibleRows( blocks, expandedChildren, ancestors = [], path = [], result = [] ) {
	let structuralIndex = 0;
	for ( const block of blocks ) {
		if ( ! block.name ) continue;
		const row = { block, ancestors, path: [ ...path, structuralIndex++ ] };
		result.push( row );
		if ( expandedChildren.has( block.clientId ) ) {
			visibleRows( block.innerBlocks, expandedChildren, [ ...ancestors, block ], row.path, result );
		}
	}
	return result;
}

/** Every named block in the document, in document order. */
export function collectBlocks( blocks, result = [] ) {
	for ( const block of blocks || [] ) {
		if ( block.name ) result.push( block );
		collectBlocks( block.innerBlocks || [], result );
	}
	return result;
}

/** How many of each block type the whole document holds. */
export function blockCounts( blocks, result = {} ) {
	for ( const block of blocks || [] ) {
		if ( block.name ) result[ block.name ] = ( result[ block.name ] || 0 ) + 1;
		blockCounts( block.innerBlocks || [], result );
	}
	return result;
}
