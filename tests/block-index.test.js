import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock } from '../src/document.js';
import { BlockIndex, outlineRecords } from '../src/ui/block-index.js';
import { moveDestinations } from '../src/ui/order.js';

test( 'the block index searches field labels, choice labels, links, and ancestors', () => {
	const child = createBlock( 'acf/card', { data: { title: 'Summer', _title: 'field_title', link: { title: 'Read more', url: 'https://example.test/story' }, _link: 'field_link', style: 'dark', _style: 'field_style' } } );
	const parent = createBlock( 'acf/section', {}, { selfClosing: false } );
	parent.innerBlocks = [ child ]; parent.innerContent = [ null ];
	const index = new BlockIndex( { blockTypes: { 'acf/card': { title: 'Card' }, 'acf/section': { title: 'Section' } }, acfFields: { field_title: { label: 'Card title' }, field_link: { label: 'Read link' }, field_style: { label: 'Style', choices: { dark: 'Dark mode' } } } } );
	index.update( [ parent ] );
	const results = index.query( 'dark mode' );
	assert.deepEqual( results.map( ( item ) => item.title ), [ 'Section', 'Card' ] );
	assert.equal( index.query( 'example.test/story' )[ 1 ].title, 'Card' );
} );

test( 'index keeps an unchanged record and outline filters statuses', () => {
	const first = createBlock( 'acf/card', { anchor: 'same' } );
	const second = createBlock( 'acf/card', { anchor: 'same' } );
	const index = new BlockIndex( { blockTypes: { 'acf/card': { title: 'Card' } } } );
	const before = index.update( [ first, second ] )[ 0 ];
	const after = index.update( [ first, second ] )[ 0 ];
	assert.equal( before, after );
	assert.equal( outlineRecords( index.all(), 'warnings' ).length, 2 );
} );

test( 'move destinations omit the current placement and use stable destination ids', () => {
	const blocks = [ createBlock( 'acf/a' ), createBlock( 'acf/b' ), createBlock( 'acf/c' ) ];
	const destinations = moveDestinations( blocks, blocks[ 1 ].clientId );
	assert.ok( destinations.every( ( item ) => item.slot !== 1 ) );
	assert.ok( destinations.some( ( item ) => item.id === 'beginning' ) );
	assert.ok( destinations.some( ( item ) => item.id === 'end' ) );
} );
