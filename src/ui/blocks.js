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

/**
 * The icon a block should draw, as either markup or a dashicon slug.
 *
 * PHP hands us one or the other (herd_editor_block_icon). A plain string is still
 * honoured so a stale payload degrades to the old behaviour rather than to nothing.
 */
export function iconOf( metadata ) {
	const icon = metadata?.icon;
	if ( typeof icon === 'string' ) return { slug: icon || 'block-default' };
	if ( typeof icon?.svg === 'string' && icon.svg ) return { svg: icon.svg };
	return { slug: icon?.dashicon || 'block-default' };
}

/** Saved markup for a block, with the inner-block placeholders removed. */
export function bodyFor( block ) {
	return ( block.innerContent || [] ).filter( ( fragment ) => fragment !== null ).join( '' );
}

/*
 * Whether a block is hidden on the front end.
 *
 * A theme that offers per-block visibility usually does it by attaching one
 * true/false field to every registered block. Herd does not know what that
 * field is called, so the name comes from the server -- see the
 * `herd_editor_visibility_field` filter -- and a site that has no such field
 * publishes nothing, which makes this return false for every block and costs
 * only the pill that would have been drawn.
 *
 * ACF stores a true/false as the string "1" or "0".
 */
export function visibilityField() {
	// `typeof` rather than a bare reference: this module is imported by tests
	// that run in plain Node, where there is no window at all.
	const name = typeof window === 'undefined' ? '' : window.HerdEditor?.visibilityField;
	return typeof name === 'string' && name ? name : '';
}

export function isHidden( block ) {
	const field = visibilityField();
	if ( ! field ) return false;
	const value = block?.attributes?.data?.[ field ];
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
