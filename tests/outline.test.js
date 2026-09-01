import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock } from '../src/document.js';
import { outlineRows } from '../src/ui/outline-data.js';

test( 'outline rows preserve tree order and ancestry', () => {
	const child = createBlock( 'acf/card', { data: { title: 'Summer' } } );
	const parent = createBlock( 'acf/section', {}, { selfClosing: false } );
	parent.innerBlocks = [ child ]; parent.innerContent = [ null ];
	const rows = outlineRows( [ parent ], { 'acf/card': { title: 'Card', registered: true }, 'acf/section': { title: 'Section', registered: true } } );
	assert.deepEqual( rows.map( ( row ) => row.title ), [ 'Section', 'Card' ] );
	assert.deepEqual( rows[ 1 ].ancestors, [ parent.clientId ] );
} );
