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
