import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, cardStyleImpact, joinList, profileFor } from '../src/ui/acf/profiles.js';
import { blockSummary } from '../src/ui/summary.js';

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

test( 'names what a style switch keeps and what it clears', () => {
	assert.equal(
		cardStyleImpact( 'minimalist', 'icon', 4 ),
		'Keeps title, content, and link. Clears the image and subtitle on 4 cards.'
	);
	assert.equal(
		cardStyleImpact( 'icon', 'minimalist', 1 ),
		'Keeps title, content, and link. Clears the icon and the color on 1 card.'
	);
} );

test( 'says nothing when a switch costs nothing', () => {
	assert.equal( cardStyleImpact( 'icon', 'icon', 3 ), '' );
	assert.equal( cardStyleImpact( 'icon', 'nonsense', 3 ), '' );
} );

test( 'joins a list the way a sentence does', () => {
	assert.equal( joinList( [ 'title' ] ), 'title' );
	assert.equal( joinList( [ 'title', 'link' ] ), 'title and link' );
	assert.equal( joinList( [ 'title', 'content', 'link' ] ), 'title, content, and link' );
} );

test( 'only the two blocks that need one carry a profile', () => {
	assert.deepEqual( Object.keys( PROFILES ).sort(), [ 'acf/billboard', 'acf/cards-collection' ] );
	assert.equal( profileFor( 'acf/hero' ), null );
} );
