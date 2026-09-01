import test from 'node:test';
import assert from 'node:assert/strict';
import { profileFor } from '../src/ui/acf/profiles.js';
import { blockSummary } from '../src/ui/summary.js';
import { PROFILES, installProfiles } from './fixtures/profiles.js';

installProfiles();

test( 'reads a cards collection the way the style guide asks', () => {
	const block = {
		name: 'acf/cards-collection',
		attributes: { data: {
			heading: 'Meet the Marshall family',
			card_style: 'minimalist',
			cards_per_row: '3',
			cards: '4',
			background: 'green',
			animate: '1',
		} },
	};
	assert.equal( blockSummary( block, 'acf' ), 'Meet the Marshall family · Minimalist · 4 cards, 3 per row' );
} );

test( 'singularises a one card collection', () => {
	const block = {
		name: 'acf/cards-collection',
		attributes: { data: { heading: 'Visit', card_style: 'icon', cards_per_row: '2', cards: '1' } },
	};
	assert.equal( blockSummary( block, 'acf' ), 'Visit · Icon · 1 card, 2 per row' );
} );

test( 'names the billboard layout an editor chose', () => {
	const block = {
		name: 'acf/billboard',
		attributes: { data: { heading: 'Discover Marshall', content_place: 'left', type_of_cta: 'buttons' } },
	};
	assert.equal( blockSummary( block, 'acf' ), 'Discover Marshall · Left · Buttons' );

	const modern = {
		name: 'acf/billboard',
		attributes: { data: { heading: 'Discover Marshall', background_image_layout: '1', modern: '1', type_of_cta: 'links' } },
	};
	assert.equal( blockSummary( modern, 'acf' ), 'Discover Marshall · Modern · Links' );
} );

test( 'falls back to the generic derivation for a block with no profile', () => {
	const block = { name: 'acf/hero', attributes: { data: { hero_type: 'static_image', hero_image: '4707' } } };
	// Hero has no profile, and the generic path drops the attachment id.
	assert.equal( blockSummary( block, 'acf' ), 'Static image' );
} );

test( 'falls back when a profile has nothing to say about this block', () => {
	const block = { name: 'acf/cards-collection', attributes: { data: { subheading: 'Second line' } } };
	assert.equal( blockSummary( block, 'acf' ), 'Second line' );
} );

test( 'a block the site said nothing about has no profile', () => {
	assert.deepEqual( Object.keys( PROFILES ).sort(), [ 'acf/billboard', 'acf/cards-collection', 'acf/profiles' ] );
	assert.equal( profileFor( 'acf/hero' ), null );
} );

test( 'a site that publishes no profiles is not an error', () => {
	installProfiles( {} );
	assert.equal( profileFor( 'acf/cards-collection' ), null );
	const block = { name: 'acf/cards-collection', attributes: { data: { heading: 'Visit', card_style: 'icon' } } };
	// Straight to the generic derivation, which is the point of the fallback.
	assert.equal( blockSummary( block, 'acf' ), 'Visit \u00b7 Icon' );
	installProfiles();
} );

test( 'Profiles names Black as the Cyber site\'s background', () => {
	// The field group offers White and Black on every site and has nowhere to
	// record that only one of them may use Black, so the rule is stated here.
	assert.deepEqual( PROFILES[ 'acf/profiles' ].choiceNotices.map( ( notice ) => [ notice.field, notice.value ] ), [ [ 'background', 'black' ] ] );
} );
