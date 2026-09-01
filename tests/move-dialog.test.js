import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock } from '../src/document.js';
import { moveDestinations } from '../src/ui/order.js';
import { moveDialogRows } from '../src/ui/MoveDialog.js';

test( 'move destinations exclude the current position and use stable ids', () => {
	const blocks = [ createBlock( 'acf/a' ), createBlock( 'acf/b' ), createBlock( 'acf/c' ) ];
	const destinations = moveDestinations( blocks, blocks[ 1 ].clientId, ( id ) => ( { title: id } ) );
	assert.deepEqual( destinations.map( ( item ) => item.id ), [ 'beginning', 'end' ] );
	assert.ok( destinations.every( ( item ) => item.slot !== 1 ) );
} );

test( 'move dialog places the non-actionable current position among valid destinations', () => {
	const destinations = [
		{ id: 'beginning', slot: 0, label: 'Beginning of document' },
		{ id: 'end', slot: 3, label: 'End of document' },
	];
	const rows = moveDialogRows( destinations, 1, { title: 'Billboard', summary: 'Discover Our Campus' } );
	assert.deepEqual( rows.map( ( row ) => row.id ), [ 'beginning', 'current-position', 'end' ] );
	assert.equal( rows[ 1 ].current, true );
	assert.equal( rows[ 1 ].summary, 'Discover Our Campus' );
} );

test( 'a destination previews the block it names as separate name and summary', () => {
	const blocks = [ createBlock( 'acf/a' ), createBlock( 'acf/b' ), createBlock( 'acf/c' ), createBlock( 'acf/d' ) ];
	const describe = ( id ) => ( { title: `Title ${ id.slice( 0, 4 ) }`, summary: `Summary ${ id.slice( 0, 4 ) }` } );
	const destinations = moveDestinations( blocks, blocks[ 0 ].clientId, describe );
	const middle = destinations.find( ( item ) => item.slot === 1 );
	assert.equal( middle.relation, 'after' );
	assert.equal( middle.name, `After Title ${ blocks[ 1 ].clientId.slice( 0, 4 ) }` );
	assert.equal( middle.summary, `Summary ${ blocks[ 1 ].clientId.slice( 0, 4 ) }` );
	// The aria-label is the sentence the two visible ranks read as.
	assert.equal( middle.label, `${ middle.name } — ${ middle.summary }` );
	// Document edges name no block, so they carry no summary and no dash.
	const end = destinations.find( ( item ) => item.id === 'end' );
	assert.equal( end.summary, '' );
	assert.equal( end.label, 'End of document' );
} );
