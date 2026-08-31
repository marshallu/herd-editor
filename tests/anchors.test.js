import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, duplicateAnchors, normalizeAnchor } from '../src/ui/anchors.js';
import { parseDocument } from '../src/document.js';

test( 'normalizes only what breaks a fragment link', () => {
	assert.equal( normalizeAnchor( 'apply now' ), 'apply-now' );
	assert.equal( normalizeAnchor( '#deadlines' ), '-deadlines' );
	assert.equal( normalizeAnchor( 'a\tb\nc' ), 'a-b-c' );
	// Case, punctuation and accents are all legal in an id, and rewriting them
	// would break an anchor someone had already published.
	assert.equal( normalizeAnchor( 'Deadlines_2026.v2' ), 'Deadlines_2026.v2' );
	assert.equal( normalizeAnchor( 'café' ), 'café' );
	assert.equal( normalizeAnchor( undefined ), '' );
	assert.equal( normalizeAnchor( null ), '' );
} );

test( 'reads an anchor off a block and tolerates one that is not a string', () => {
	assert.equal( anchorOf( { attributes: { anchor: 'apply' } } ), 'apply' );
	assert.equal( anchorOf( { attributes: {} } ), '' );
	assert.equal( anchorOf( {} ), '' );
	assert.equal( anchorOf( null ), '' );
	assert.equal( anchorOf( { attributes: { anchor: 3 } } ), '' );
} );

test( 'finds a clash at any depth and ignores blocks without an anchor', () => {
	const blocks = parseDocument(
		'<!-- wp:acf/card {"anchor":"apply"} /-->' +
		'<!-- wp:acf/card {"data":{}} /-->' +
		'<!-- wp:group --><!-- wp:acf/card {"anchor":"apply"} /--><!-- wp:acf/card {"anchor":"visit"} /--><!-- /wp:group -->'
	);
	assert.deepEqual( [ ...duplicateAnchors( blocks ) ], [ 'apply' ] );
} );

test( 'a document whose anchors are all distinct reports none', () => {
	const blocks = parseDocument( '<!-- wp:acf/card {"anchor":"apply"} /--><!-- wp:acf/card {"anchor":"visit"} /-->' );
	assert.equal( duplicateAnchors( blocks ).size, 0 );
	assert.equal( duplicateAnchors( [] ).size, 0 );
} );
