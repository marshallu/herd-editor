import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock } from '../src/document.js';
import { searchRows } from '../src/ui/search.js';

test( 'search retains a matched block’s ancestors without mounting a form', () => {
	const child = createBlock( 'acf/card', { data: { title: 'Summer programme' } } );
	const parent = createBlock( 'acf/section', {}, { selfClosing: false } );
	parent.innerBlocks = [ child ]; parent.innerContent = [ null ];
	const rows = searchRows( [ parent ], 'summer', { 'acf/card': { title: 'Card', registered: true }, 'acf/section': { title: 'Section', registered: true } } );
	assert.deepEqual( rows.map( ( row ) => row.block.clientId ), [ parent.clientId, child.clientId ] );
	assert.equal( rows[ 0 ].matches, false );
	assert.equal( rows[ 1 ].matches, true );
} );

test( 'search resolves ACF labels, choice labels, link values, and warnings', () => {
	const block = createBlock( 'acf/card', { anchor: 'same', data: { style: 'dark', _style: 'field_style', link: { title: 'Read story', url: 'https://example.test/story' }, _link: 'field_link' } } );
	const options = { acfFields: { field_style: { label: 'Colour scheme', choices: { dark: 'Dark mode' } }, field_link: { label: 'Feature link' } }, duplicateIds: new Set( [ 'same' ] ) };
	assert.equal( searchRows( [ block ], 'dark mode', { 'acf/card': { registered: true } }, options )[ 0 ].match.location, 'Colour scheme' );
	assert.equal( searchRows( [ block ], 'example.test', { 'acf/card': { registered: true } }, options )[ 0 ].match.location, 'Feature link' );
	assert.equal( searchRows( [ block ], 'duplicate anchor', { 'acf/card': { registered: true } }, options )[ 0 ].match.location, 'warning' );
} );
