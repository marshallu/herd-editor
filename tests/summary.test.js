import test from 'node:test';
import assert from 'node:assert/strict';
import { acfSummaryParts, blockSummary, cleanText, humanize, truncate } from '../src/ui/summary.js';

test( 'cleans markup and entities out of summary text', () => {
	assert.equal( cleanText( '<p>Hello <strong>there</strong>&nbsp;world</p>' ), 'Hello there world' );
	assert.equal( cleanText( 'Arts &amp; Sciences' ), 'Arts & Sciences' );
	assert.equal( cleanText( null ), '' );
	assert.equal( truncate( 'abcdefghij', 5 ), 'abcd…' );
	assert.equal( truncate( 'abcd', 5 ), 'abcd' );
	assert.equal( humanize( 'static_image' ), 'Static image' );
} );

test( 'prefers descriptive ACF fields and skips ACF bookkeeping keys', () => {
	const parts = acfSummaryParts( {
		_heading: 'field_abc',
		hero_type: 'static_image',
		heading: 'A place where you belong',
		empty_field: '',
	} );
	assert.deepEqual( parts, [ 'A place where you belong', 'Static image' ] );
} );

test( 'reports repeater rows as a count and ignores their row contents', () => {
	const parts = acfSummaryParts( {
		cards: '4',
		cards_0_title: 'Campus life',
		cards_1_title: 'Academics',
		cards_2_title: 'Athletics',
		cards_3_title: 'Research',
	} );
	assert.deepEqual( parts, [ '4 cards' ] );
	assert.deepEqual( acfSummaryParts( { card: '1', card_0_title: 'Only one' } ), [ '1 card' ] );
} );

test( 'leaves true/false fields out of the summary, since the panel shows them as pills', () => {
	assert.deepEqual( acfSummaryParts( { animate: '1', condensed: '0' } ), [] );
} );

test( 'yields nothing for blocks with no data to describe', () => {
	assert.equal( blockSummary( { attributes: {} }, 'acf' ), '' );
	assert.equal( blockSummary( { attributes: {} }, 'fallback', '<figure>image</figure>' ), '' );
} );

test( 'summarises core blocks from their saved body', () => {
	assert.equal( blockSummary( { attributes: {} }, 'paragraph', '<p>Marshall is 12,000 students.</p>' ), 'Marshall is 12,000 students.' );
	assert.equal( blockSummary( { attributes: {} }, 'heading', '<h2>Why Marshall</h2>' ), 'Why Marshall' );
} );

test( 'caps the summary at three fragments', () => {
	const parts = acfSummaryParts( { a: 'one', b: 'two', c: 'three', d: 'four' } );
	assert.equal( parts.length, 3 );
} );

test( 'skips values that describe an absence', () => {
	assert.deepEqual( acfSummaryParts( { hero_type: 'static', cta_type: 'none', layout: 'Default' } ), [ 'Static' ] );
} );

test( 'keeps attachment and post ids out of the summary', () => {
	assert.deepEqual( acfSummaryParts( { hero_image: '4707', heading: 'Meet Marshall' } ), [ 'Meet Marshall' ] );
	// A repeater count is still a number worth showing.
	assert.deepEqual( acfSummaryParts( { cards: '3', cards_0_title: 'x' } ), [ '3 cards' ] );
} );
