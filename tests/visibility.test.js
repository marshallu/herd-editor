import test from 'node:test';
import assert from 'node:assert/strict';
import { isHidden, visibilityField } from '../src/ui/blocks.js';

const block = ( data ) => ( { name: 'acf/hero', attributes: { data } } );

/*
 * The field name belongs to the site, not to Herd: the server publishes it and
 * a site with no visibility field publishes nothing. These tests configure it
 * the way herd_editor_enqueue_assets() does.
 */
const withField = ( name, run ) => {
	const had = 'window' in globalThis;
	const previous = globalThis.window;
	globalThis.window = { HerdEditor: name === null ? {} : { visibilityField: name } };
	try {
		run();
	} finally {
		if ( had ) globalThis.window = previous;
		else delete globalThis.window;
	}
};

test( 'reads the configured field the way ACF stores a true/false', () => {
	withField( 'hide_block', () => {
		// ACF serializes true/false as the strings "1" and "0".
		assert.equal( isHidden( block( { hide_block: '1' } ) ), true );
		assert.equal( isHidden( block( { hide_block: '0' } ) ), false );
		assert.equal( isHidden( block( { hide_block: '' } ) ), false );
	} );
} );

test( 'accepts the boolean and numeric forms too', () => {
	withField( 'hide_block', () => {
		assert.equal( isHidden( block( { hide_block: true } ) ), true );
		assert.equal( isHidden( block( { hide_block: 1 } ) ), true );
		assert.equal( isHidden( block( { hide_block: false } ) ), false );
		assert.equal( isHidden( block( { hide_block: 0 } ) ), false );
	} );
} );

test( 'honours whatever name the site publishes', () => {
	withField( 'fs_hidden', () => {
		assert.equal( isHidden( block( { fs_hidden: '1' } ) ), true );
		// The old hardcoded name is just another field once it is not the one.
		assert.equal( isHidden( block( { hide_block: '1' } ) ), false );
	} );
} );

test( 'a site with no visibility field has no hidden blocks', () => {
	withField( null, () => {
		assert.equal( visibilityField(), '' );
		assert.equal( isHidden( block( { hide_block: '1' } ) ), false );
	} );
} );

test( 'treats a block without the field as visible', () => {
	withField( 'hide_block', () => {
		assert.equal( isHidden( block( {} ) ), false );
		assert.equal( isHidden( { name: 'core/paragraph', attributes: {} } ), false );
		assert.equal( isHidden( {} ), false );
		assert.equal( isHidden( null ), false );
		assert.equal( isHidden( undefined ), false );
	} );
} );

test( 'no window at all is not an error', () => {
	// Plain Node, no jsdom: the module is imported by tests that never build one.
	assert.equal( visibilityField(), '' );
	assert.equal( isHidden( block( { hide_block: '1' } ) ), false );
} );
