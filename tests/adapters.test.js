import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor, blockMutationPolicy, canAddBlock, changeHeadingLevel, createAcfBlock, replaceWrapperContent, wrapperInfo } from '../src/adapters.js';
import { serializeDocument } from '../src/document.js';

test( 'dispatches all supported adapters and safely falls back', () => {
	assert.equal( adapterFor( { name: 'acf/hero', innerBlocks: [] }, { registered: true } ).id, 'acf' );
	for ( const [ name, id ] of [ [ 'core/paragraph', 'paragraph' ], [ 'core/heading', 'heading' ], [ 'core/html', 'html' ], [ 'core/shortcode', 'shortcode' ] ] ) {
		assert.equal( adapterFor( { name, innerBlocks: [] }, { registered: true } ).id, id );
	}
	assert.equal( adapterFor( { name: 'core/image', innerBlocks: [] }, { registered: true } ).id, 'fallback' );
	assert.equal( adapterFor( { name: 'core/paragraph', innerBlocks: [ {} ] }, { registered: true } ).id, 'fallback' );
} );

test( 'paragraph and heading helpers preserve unrelated wrapper markup', () => {
	const paragraph = '\n<p class="lead" data-x="1">Old</p>\n';
	assert.deepEqual( wrapperInfo( paragraph, 'p' ), { before: '\n<p class="lead" data-x="1">', content: 'Old', after: '</p>\n' } );
	assert.equal( replaceWrapperContent( paragraph, 'p', '<strong>New</strong>' ), '\n<p class="lead" data-x="1"><strong>New</strong></p>\n' );
	assert.equal( changeHeadingLevel( '<h2 class="title">Hello</h2>', 4 ), '<h4 class="title">Hello</h4>' );
} );

test( 'ACF creation uses empty data and a stable generated client ID', () => {
	const block = createAcfBlock( 'acf/hero' );
	assert.match( block.clientId, /^herd-/ );
	assert.equal( serializeDocument( [ block ] ), '<!-- wp:acf/hero {"name":"acf/hero","data":{}} /-->' );
} );

test( 'single-instance ACF blocks cannot be inserted or duplicated once present', () => {
	const metadata = { registered: true, multiple: false };
	assert.equal( canAddBlock( 'acf/hero', metadata, {} ), true );
	assert.equal( canAddBlock( 'acf/hero', metadata, { 'acf/hero': 1 } ), false );
	assert.equal( canAddBlock( 'acf/card', { registered: true, multiple: true }, { 'acf/card': 2 } ), true );
	assert.equal( canAddBlock( 'core/paragraph', { registered: true }, {} ), false );
} );

test( 'catalog and lock policy prevent unsafe mutations', () => {
	assert.equal( canAddBlock( 'acf/meta', { registered: true, readOnly: true }, {} ), false );
	assert.equal( canAddBlock( 'acf/child', { registered: true, parent: [ 'acf/container' ] }, {} ), false );
	assert.deepEqual( blockMutationPolicy( { attributes: { lock: { move: false } } } ), { move: false, remove: true, insert: true } );
	assert.deepEqual( blockMutationPolicy( {}, 'all' ), { move: false, remove: false, insert: false } );
} );
