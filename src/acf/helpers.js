export function findBlockByClientId( blocks, clientId ) {
	for ( const block of blocks || [] ) {
		if ( block.clientId === clientId ) return block;
		const descendant = findBlockByClientId( block.innerBlocks, clientId );
		if ( descendant ) return descendant;
	}
	return null;
}

export function findFirstBlockByName( blocks, name ) {
	for ( const block of blocks || [] ) {
		if ( block.name === name ) return block;
		const descendant = findFirstBlockByName( block.innerBlocks, name );
		if ( descendant ) return descendant;
	}
	return null;
}

export function isAcfBlock( block ) {
	return Boolean( block && typeof block.name === 'string' && block.name.indexOf( 'acf/' ) === 0 );
}

/** Build the private ACF fetch-block request in exactly one place. */
export function buildFetchBlockPayload( block, postId, context = {} ) {
	return {
		action: 'acf/ajax/fetch-block',
		post_id: postId,
		clientId: block.clientId,
		block: JSON.stringify( block.attributes ),
		context: JSON.stringify( context ),
		query: { form: true, validate: false },
		// Lets `acf/prepare_field` tell a Herd request from a Gutenberg one, so the
		// editors inside repeater rows can be rendered lazily. See herd-editor.php.
		herd_editor: 1,
	};
}

export function dataAttributesFromForm( form, clientId, acf ) {
	const values = acf.serialize( window.jQuery( form ), `acf-block_${ clientId }` );
	return values || {};
}

/**
 * ACF only serializes controls that are currently rendered and enabled.  That
 * is normally correct for a POST, but is destructive for block comment data:
 * a field removed from a group, hidden behind conditional logic, or supplied
 * by a newer version of a field group would otherwise disappear after editing
 * an unrelated field.  Values explicitly submitted by the form (including an
 * empty string or an empty array) always win; omitted values remain intact.
 *
 * Preserving every omission is too blunt on its own.  Deleting a repeater row
 * also omits that row's keys, and keeping them would resurrect the row the
 * moment the field grew back to that length.  So an omitted key is dropped
 * when — and only when — it addresses a row the submitted value no longer has.
 */
export function mergeAcfBlockData( existing = {}, submitted = {} ) {
	const previous = existing && typeof existing === 'object' ? existing : {};
	const next = submitted && typeof submitted === 'object' ? submitted : {};

	// Every field the form rendered.  ACF stores each value beside a companion
	// `_name` entry holding its field key; both describe the same field.
	const rendered = new Set( Object.keys( next ).map( ( key ) => key.replace( /^_/, '' ) ) );

	const result = { ...next };
	for ( const [ key, value ] of Object.entries( previous ) ) {
		if ( Object.prototype.hasOwnProperty.call( next, key ) ) continue;
		if ( addressesRemovedRow( key.replace( /^_/, '' ), next, rendered ) ) continue;
		result[ key ] = value;
	}
	return result;
}

/**
 * Does `name` address a repeater or flexible-content row that the submitted
 * value no longer contains?
 *
 * ACF names sub-values `<field>_<index>_<subfield>`, so a rendered `cards`
 * owns `cards_1_title` but not a sibling field that merely shares the prefix,
 * like `cards_footnote`.  The row count decides: an index the field still has
 * means the omission is conditional logic and the stored value is kept, while
 * an index beyond the field's length belongs to a row the editor deleted.
 * When the length cannot be read the key is preserved, because losing a value
 * is worse than carrying a stale one.
 */
function addressesRemovedRow( name, next, rendered ) {
	for ( const field of rendered ) {
		if ( name.length <= field.length || ! name.startsWith( `${ field }_` ) ) continue;
		const row = /^(\d+)_/.exec( name.slice( field.length + 1 ) );
		if ( ! row ) continue;
		// A repeater serializes its row count; flexible content serializes the
		// list of layouts in play.
		const value = next[ field ];
		/* A number-like scalar is ACF's explicit repeater count. Do not infer a
		 * deletion from a scalar that merely begins with a digit: only the parent
		 * repeater's own count/list is authority to prune descendants. */
		const length = Array.isArray( value ) ? value.length : ( typeof value === 'string' && /^\d+$/.test( value ) ? Number( value ) : null );
		if ( Number.isInteger( length ) && Number( row[ 1 ] ) >= length ) return true;
	}
	return false;
}

export function contextForBlock( ancestors, metadata, postId, postType ) {
	const context = { postId, postType };
	for ( const block of ancestors ) {
		const provided = metadata[ block.name ]?.provides_context || {};
		for ( const [ key, attribute ] of Object.entries( provided ) ) {
			if ( Object.prototype.hasOwnProperty.call( block.attributes || {}, attribute ) ) context[ key ] = block.attributes[ attribute ];
		}
	}
	return context;
}
