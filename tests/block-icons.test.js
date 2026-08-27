import test from 'node:test';
import assert from 'node:assert/strict';
import { iconOf } from '../src/ui/blocks.js';

test( 'draws the SVG a block.json declared', () => {
	assert.deepEqual( iconOf( { icon: { svg: '<svg><path d="M0 0"/></svg>' } } ), { svg: '<svg><path d="M0 0"/></svg>' } );
} );
test( 'draws a dashicon slug as a slug', () => {
	assert.deepEqual( iconOf( { icon: { dashicon: 'calendar' } } ), { slug: 'calendar' } );
} );
test( 'falls back to the default glyph for an unregistered or iconless block', () => {
	assert.deepEqual( iconOf( {} ), { slug: 'block-default' } );
	assert.deepEqual( iconOf( { icon: {} } ), { slug: 'block-default' } );
} );
test( 'still honours a bare string, so a stale payload degrades to the old behaviour', () => {
	assert.deepEqual( iconOf( { icon: 'forms' } ), { slug: 'forms' } );
} );
