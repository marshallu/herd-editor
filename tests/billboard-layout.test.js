import test from 'node:test';
import assert from 'node:assert/strict';
import { profileSummary } from '../src/ui/acf/profiles.js';
import { PROFILES, installProfiles } from './fixtures/profiles.js';

installProfiles();

/*
 * Billboard's layout used to be resolved by a hand-written function in the
 * plugin. It is a fact about one site's field group, so it now lives in that
 * site's profile as a first-match-wins `oneOf`. These tests assert the
 * declarative form answers exactly as the function did — the mapping table is
 * the same one, including the pair the old form could not reach, where
 * `background_image_layout` off wins because the template's outer condition
 * always read it first.
 */
const summary = ( data ) => profileSummary( 'acf/billboard', data );
const layoutPart = ( data ) => summary( { heading: 'H', type_of_cta: 'links', ...data } )[ 1 ];

test( 'reads the layout field when content has been migrated', () => {
	assert.equal( layoutPart( { layout: 'modern' } ), 'Modern' );
	assert.equal( layoutPart( { layout: 'split', content_place: 'right' } ), 'Right' );
	assert.equal( layoutPart( { layout: 'grid', content_place: 'left' } ), 'Left' );
} );

test( 'backfills every combination of the two booleans layout replaced', () => {
	assert.equal( layoutPart( { background_image_layout: '1', modern: '1' } ), 'Modern' );
	assert.equal( layoutPart( { background_image_layout: '1', modern: '0', content_place: 'left' } ), 'Left' );
	assert.equal( layoutPart( { background_image_layout: '0', modern: '0', content_place: 'left' } ), 'Left' );
	// The unreachable pair: background_image_layout off wins over modern on.
	assert.equal( layoutPart( { background_image_layout: '0', modern: '1', content_place: 'center' } ), 'Centered' );
} );

test( 'contributes no fragment rather than a wrong one', () => {
	// No layout, no placement: the part produces nothing and is dropped, so the
	// summary is the two fragments that did have something to say.
	assert.deepEqual( summary( { heading: 'H', type_of_cta: 'links' } ), [ 'H', 'Links' ] );
	assert.deepEqual( summary( {} ), [] );
} );

test( 'a migrated block summarises the same as the block it was migrated from', () => {
	const before = { heading: 'Find your herd', background_image_layout: '1', modern: '1', type_of_cta: 'links' };
	const after = { heading: 'Find your herd', layout: 'modern', type_of_cta: 'links' };
	assert.deepEqual( summary( after ), summary( before ) );
	assert.deepEqual( summary( after ), [ 'Find your herd', 'Modern', 'Links' ] );

	const split = { heading: 'Visit us', layout: 'split', content_place: 'right', type_of_cta: 'buttons' };
	assert.deepEqual( summary( split ), [ 'Visit us', 'Right', 'Buttons' ] );
} );

test( 'the profile is data, so it survives the trip through JSON', () => {
	// It reaches the browser through wp_json_encode(); a callable would not.
	assert.deepEqual( JSON.parse( JSON.stringify( PROFILES ) ), PROFILES );
} );
