/**
 * Top-level reorder maths.
 *
 * controller.blocks holds unnamed freeform nodes between real blocks, so a slot
 * in the visible list is not an index into that array. Everything that moves a
 * block converts through here.
 */

/** Every named top-level block, with its index in the raw array. */
export function topLevelPositions( blocks ) {
	const result = [];
	( blocks || [] ).forEach( ( block, position ) => {
		if ( block && block.name ) result.push( { clientId: block.clientId, position } );
	} );
	return result;
}

/** Slot of a block among the named top-level blocks, or -1. */
export function topLevelSlot( blocks, clientId ) {
	return topLevelPositions( blocks ).findIndex( ( entry ) => entry.clientId === clientId );
}

/**
 * The raw array index to hand to moveBlock() so a block ends up at a slot.
 *
 * moveBlock() expects the index in the pre-removal array and does its own
 * forward-move adjustment, so the target is expressed the same way here.
 *
 * @param {Array}  blocks   Raw top-level blocks.
 * @param {string} clientId Block being moved.
 * @param {number} toSlot   Desired slot among named top-level blocks.
 * @return {number|null} Index for moveBlock, or null when nothing would change.
 */
export function moveTargetIndex( blocks, clientId, toSlot ) {
	const named = topLevelPositions( blocks );
	const fromSlot = named.findIndex( ( entry ) => entry.clientId === clientId );
	if ( fromSlot === -1 ) return null;

	const target = Math.max( 0, Math.min( toSlot, named.length - 1 ) );
	if ( target === fromSlot ) return null;
	if ( target < fromSlot ) return named[ target ].position;

	// Moving forward: land after the block currently occupying the target slot.
	const following = named[ target + 1 ];
	return following ? following.position : blocks.length;
}

/**
 * Which slot a dragged block would land in when dropped against another row.
 *
 * @param {number}  fromSlot Slot the block is being dragged from.
 * @param {number}  overSlot Slot of the row being hovered.
 * @param {boolean} after    Whether the pointer is past that row's midpoint.
 * @return {number} Desired final slot.
 */
export function dropSlot( fromSlot, overSlot, after ) {
	const target = overSlot + ( after ? 1 : 0 );
	return target > fromSlot ? target - 1 : target;
}

/**
 * The raw array index to hand insertBlock() so a new block lands at a slot.
 *
 * Slot N puts the block immediately before the Nth named block, which is after
 * any whitespace node trailing the block before it — that node belongs to the
 * previous block's serialization, so leaving it in place is what keeps the
 * document round-tripping byte for byte.
 *
 * @param {Array}  blocks Raw top-level blocks.
 * @param {number} slot   Desired slot among named top-level blocks.
 * @return {number} Index for insertBlock.
 */
export function insertPositionForSlot( blocks, slot ) {
	const named = topLevelPositions( blocks );
	if ( ! named.length || slot >= named.length ) return ( blocks || [] ).length;
	return named[ Math.max( 0, slot ) ].position;
}

/**
 * Valid final positions for an accessible top-level Move dialog.
 *
 * Each destination carries the target block's own name and summary as separate
 * fields rather than one prebaked sentence, so the dialog can draw a choice the
 * way the block row it names is drawn — the name, then what the block actually
 * says. `label` keeps the whole thing as one string for the button's aria-label,
 * because a screen reader wants the sentence the two ranks add up to.
 *
 * @param {Array}    blocks   Raw top-level blocks.
 * @param {string}   clientId Block being moved.
 * @param {Function} describe Given a clientId, returns { title, summary }.
 * @return {Array} Destinations as { id, slot, relation, name, summary, label }.
 */
export function moveDestinations( blocks, clientId, describe = ( id ) => ( { title: id } ) ) {
	const named = topLevelPositions( blocks );
	const from = named.findIndex( ( entry ) => entry.clientId === clientId );
	if ( from < 0 || named.length < 2 ) return [];
	const edge = ( id, slot, name ) => ( { id, slot, relation: 'edge', name, summary: '', label: name } );
	return named.flatMap( ( entry, slot ) => {
		if ( slot === from ) return [];
		if ( slot === 0 ) return [ edge( 'beginning', slot, 'Beginning of document' ) ];
		if ( slot === named.length - 1 ) return [ edge( 'end', slot, 'End of document' ) ];
		const relation = slot < from ? 'before' : 'after';
		const { title = '', summary = '' } = describe( entry.clientId ) || {};
		const name = `${ relation === 'before' ? 'Before' : 'After' } ${ title }`;
		return [ {
			id: `${ relation }-${ entry.clientId }`,
			slot,
			relation,
			name,
			summary,
			label: summary ? `${ name } — ${ summary }` : name,
		} ];
	} );
}
