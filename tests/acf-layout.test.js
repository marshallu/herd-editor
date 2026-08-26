import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOf } from '../src/ui/acf/layout.js';

/** ACF field wrappers carry `acf-field acf-field-{type}` classes and a `data-key`. */
const field = ( classes, key ) => ( {
	classList: { contains: ( name ) => [ 'acf-field', ...classes ].includes( name ) },
	dataset: key ? { key } : {},
} );

const NOTHING = new Set();

test( 'sorts compact controls onto a shared row', () => {
	for ( const type of [ 'select', 'number', 'range', 'button-group', 'date-picker', 'color-picker' ] ) {
		assert.equal( roleOf( field( [ `acf-field-${ type }` ] ), NOTHING ), 'controls', type );
	}
} );

test( 'treats short single-line fields as compact too', () => {
	for ( const type of [ 'text', 'url', 'email', 'link' ] ) {
		assert.equal( roleOf( field( [ `acf-field-${ type }` ] ), NOTHING ), 'controls', type );
	}
} );

test( 'gives content fields the full width', () => {
	for ( const type of [ 'textarea', 'wysiwyg', 'image', 'repeater', 'flexible-content', 'group' ] ) {
		assert.equal( roleOf( field( [ `acf-field-${ type }` ] ), NOTHING ), 'content', type );
	}
} );

test( 'sends true/false fields to the display options row', () => {
	assert.equal( roleOf( field( [ 'acf-field-true-false' ], 'field_animate' ), NOTHING ), 'options' );
} );

test( 'keeps a toggle that reveals other fields out of the pill row', () => {
	// Billboard's `include_photos` decides whether five more fields exist. The
	// reveal has to happen where the eye already is.
	const gating = new Set( [ 'field_include_photos' ] );
	assert.equal( roleOf( field( [ 'acf-field-true-false' ], 'field_include_photos' ), gating ), 'content' );
} );

test( 'being gated is not the test — only gating others is', () => {
	// Hero's `short_video` carries conditional logic but nothing depends on it,
	// so it stays a pill alongside the rest of Hero's toggles.
	const gating = new Set( [ 'field_hero_type' ] );
	assert.equal( roleOf( field( [ 'acf-field-true-false' ], 'field_short_video' ), gating ), 'options' );
} );

test( 'treats an unrecognised field type as content rather than guessing', () => {
	assert.equal( roleOf( field( [ 'acf-field-some-custom-type' ] ), NOTHING ), 'content' );
} );

/**
 * The Cards Collection field group, in its authored order.
 *
 * Source: themes/herdpress/acf-json/group_64a57f86baa8d.json.
 */
const CARDS_COLLECTION = [
	[ 'background', 'button-group' ],
	[ 'background_style', 'select' ],
	[ 'heading', 'text' ],
	[ 'subheading', 'text' ],
	[ 'card_style', 'select' ],
	[ 'searchable', 'true-false' ],
	[ 'cards_per_row', 'button-group' ],
	[ 'cards', 'repeater' ],
	[ 'cta', 'link' ],
	[ 'animate', 'true-false' ],
	[ 'fancy', 'true-false' ],
	[ 'really_black', 'true-false' ],
];

/**
 * Walk a field group the way the two-column grid does: compact controls take one
 * cell each and pair up, full-width fields break the row, and the toggles leave
 * the flow for the pill row.
 */
function rows( fields, gating = NOTHING ) {
	const laid = [];
	let row = [];
	fields.forEach( ( [ name, type ] ) => {
		const role = roleOf( field( [ `acf-field-${ type }` ], `field_${ name }` ), gating );
		if ( role === 'options' ) return;
		if ( role === 'content' ) {
			if ( row.length ) laid.push( row );
			laid.push( [ name ] );
			row = [];
			return;
		}
		row.push( name );
		if ( row.length === 2 ) {
			laid.push( row );
			row = [];
		}
	} );
	if ( row.length ) laid.push( row );
	return laid;
}

test( 'lays a cards collection out in the pairs the design asks for', () => {
	assert.deepEqual( rows( CARDS_COLLECTION ), [
		[ 'background', 'background_style' ],
		[ 'heading', 'subheading' ],
		// `searchable` is a plain toggle and leaves for the pill row, so the card
		// style lands beside cards per row.
		[ 'card_style', 'cards_per_row' ],
		[ 'cards' ],
		[ 'cta' ],
	] );
} );
