import test from 'node:test';
import assert from 'node:assert/strict';
import { billboardLayout, PROFILES } from '../src/ui/acf/profiles.js';

test( 'reads the layout field when content has been migrated', () => {
	assert.equal( billboardLayout( { layout: 'grid' } ), 'grid' );
	assert.equal( billboardLayout( { layout: 'split' } ), 'split' );
	assert.equal( billboardLayout( { layout: 'modern' } ), 'modern' );
} );

test( 'backfills every combination of the two booleans layout replaced', () => {
	// The full mapping table, including the pair the old form could not reach:
	// background_image_layout off wins, because the template's outer condition
	// always read it first.
	assert.equal( billboardLayout( { background_image_layout: '1', modern: '1' } ), 'modern' );
	assert.equal( billboardLayout( { background_image_layout: '1', modern: '0' } ), 'split' );
	assert.equal( billboardLayout( { background_image_layout: '0', modern: '0' } ), 'grid' );
	assert.equal( billboardLayout( { background_image_layout: '0', modern: '1' } ), 'grid' );
} );

test( 'falls back to grid for absent or unrecognised values', () => {
	assert.equal( billboardLayout( {} ), 'grid' );
	assert.equal( billboardLayout(), 'grid' );
	assert.equal( billboardLayout( { layout: 'classic' } ), 'grid' );
} );

test( 'a migrated block summarises the same as the block it was migrated from', () => {
	const summary = PROFILES[ 'acf/billboard' ].summary;
	const before = { heading: 'Find your herd', background_image_layout: '1', modern: '1', type_of_cta: 'links' };
	const after = { heading: 'Find your herd', layout: 'modern', type_of_cta: 'links' };
	assert.deepEqual( summary( after ), summary( before ) );
	assert.deepEqual( summary( after ), [ 'Find your herd', 'Modern', 'Links' ] );

	const split = { heading: 'Visit us', layout: 'split', content_place: 'right', type_of_cta: 'buttons' };
	assert.deepEqual( summary( split ), [ 'Visit us', 'Right', 'Buttons' ] );
} );
