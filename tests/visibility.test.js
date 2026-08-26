import test from 'node:test';
import assert from 'node:assert/strict';
import { isHidden } from '../src/ui/blocks.js';

const block = ( data ) => ( { name: 'acf/hero', attributes: { data } } );

test( 'reads hide_block the way ACF stores a true/false field', () => {
	// ACF serializes true/false as the strings "1" and "0".
	assert.equal( isHidden( block( { hide_block: '1' } ) ), true );
	assert.equal( isHidden( block( { hide_block: '0' } ) ), false );
	assert.equal( isHidden( block( { hide_block: '' } ) ), false );
} );

test( 'accepts the boolean and numeric forms too', () => {
	assert.equal( isHidden( block( { hide_block: true } ) ), true );
	assert.equal( isHidden( block( { hide_block: 1 } ) ), true );
	assert.equal( isHidden( block( { hide_block: false } ) ), false );
	assert.equal( isHidden( block( { hide_block: 0 } ) ), false );
} );

test( 'treats a block without the field as visible', () => {
	// Only registered blocks carry the theme's Block Visibility group, so a core
	// block or an unregistered one has no hide_block key at all.
	assert.equal( isHidden( block( {} ) ), false );
	assert.equal( isHidden( { name: 'core/paragraph', attributes: {} } ), false );
	assert.equal( isHidden( {} ), false );
	assert.equal( isHidden( null ), false );
	assert.equal( isHidden( undefined ), false );
} );
