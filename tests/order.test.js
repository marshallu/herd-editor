import test from 'node:test';
import assert from 'node:assert/strict';
import { dropSlot, insertPositionForSlot, moveTargetIndex, topLevelPositions, topLevelSlot } from '../src/ui/order.js';
import { insertBlock, moveBlock } from '../src/document.js';

/** A document with a freeform node between two ACF blocks, as real posts have. */
const document = () => [
	{ clientId: 'A', name: 'acf/a', innerBlocks: [], innerContent: [] },
	{ clientId: 'F', name: null, innerBlocks: [], innerContent: [] },
	{ clientId: 'B', name: 'acf/b', innerBlocks: [], innerContent: [] },
	{ clientId: 'C', name: 'acf/c', innerBlocks: [], innerContent: [] },
];

const slots = ( blocks ) => topLevelPositions( blocks ).map( ( entry ) => entry.clientId );

test( 'ignores unnamed freeform nodes when numbering slots', () => {
	assert.deepEqual( slots( document() ), [ 'A', 'B', 'C' ] );
	assert.equal( topLevelSlot( document(), 'B' ), 1 );
	assert.equal( topLevelSlot( document(), 'missing' ), -1 );
} );

test( 'moves a block forward past a freeform node', () => {
	const blocks = document();
	const index = moveTargetIndex( blocks, 'A', 1 );
	assert.deepEqual( slots( moveBlock( blocks, 'A', null, index ) ), [ 'B', 'A', 'C' ] );
} );

test( 'moves a block to the end', () => {
	const blocks = document();
	const index = moveTargetIndex( blocks, 'A', 2 );
	assert.deepEqual( slots( moveBlock( blocks, 'A', null, index ) ), [ 'B', 'C', 'A' ] );
} );

test( 'moves a block backward to the start', () => {
	const blocks = document();
	const index = moveTargetIndex( blocks, 'C', 0 );
	assert.deepEqual( slots( moveBlock( blocks, 'C', null, index ) ), [ 'C', 'A', 'B' ] );
} );

test( 'reports no move when the slot is unchanged or unknown', () => {
	assert.equal( moveTargetIndex( document(), 'A', 0 ), null );
	assert.equal( moveTargetIndex( document(), 'missing', 1 ), null );
} );

test( 'clamps a slot beyond either end of the list', () => {
	const blocks = document();
	assert.deepEqual( slots( moveBlock( blocks, 'A', null, moveTargetIndex( blocks, 'A', 99 ) ) ), [ 'B', 'C', 'A' ] );
	assert.equal( moveTargetIndex( blocks, 'A', -5 ), null );
} );

test( 'converts a drop against a row into the slot it would land in', () => {
	assert.equal( dropSlot( 0, 2, true ), 2 );
	assert.equal( dropSlot( 2, 0, false ), 0 );
	// Dropping a block immediately before its own successor changes nothing.
	assert.equal( dropSlot( 0, 1, false ), 0 );
	assert.equal( dropSlot( 0, 0, true ), 0 );
} );

/* ---------- insertion ---------- */

const added = ( blocks, slot ) => slots( insertBlock(
	blocks,
	null,
	insertPositionForSlot( blocks, slot ),
	{ clientId: 'N', name: 'acf/n', innerBlocks: [], innerContent: [] }
) );

test( 'lands a new block at the slot an editor pointed at', () => {
	assert.deepEqual( added( document(), 0 ), [ 'N', 'A', 'B', 'C' ] );
	assert.deepEqual( added( document(), 1 ), [ 'A', 'N', 'B', 'C' ] );
	assert.deepEqual( added( document(), 2 ), [ 'A', 'B', 'N', 'C' ] );
} );

test( 'inserting after a block leaves its trailing freeform node with it', () => {
	// The whitespace between A and B belongs to A's serialization, so a block
	// added at slot 1 goes after it, not between A and its own trailing newline.
	const blocks = insertBlock( document(), null, insertPositionForSlot( document(), 1 ), { clientId: 'N', name: 'acf/n', innerBlocks: [], innerContent: [] } );
	assert.deepEqual( blocks.map( ( block ) => block.clientId ), [ 'A', 'F', 'N', 'B', 'C' ] );
} );

test( 'the tail slot appends past every trailing node', () => {
	assert.deepEqual( added( document(), 3 ), [ 'A', 'B', 'C', 'N' ] );
	// A slot beyond the end clamps rather than throwing.
	assert.deepEqual( added( document(), 99 ), [ 'A', 'B', 'C', 'N' ] );
	assert.equal( insertPositionForSlot( document(), 3 ), 4 );
} );

test( 'an empty document inserts at the beginning', () => {
	assert.equal( insertPositionForSlot( [], 0 ), 0 );
	assert.equal( insertPositionForSlot( undefined, 0 ), 0 );
	// A document holding only freeform content still appends after it.
	assert.equal( insertPositionForSlot( [ { clientId: 'F', name: null } ], 0 ), 1 );
} );

test( 'a negative slot clamps to the first block', () => {
	assert.deepEqual( added( document(), -1 ), [ 'N', 'A', 'B', 'C' ] );
} );
