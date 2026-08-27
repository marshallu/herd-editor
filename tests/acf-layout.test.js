import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { layoutFields, roleOf } from '../src/ui/acf/layout.js';

/** ACF field wrappers carry `acf-field acf-field-{type}` classes and a `data-key`. */
const field = ( classes, key ) => ( {
	classList: { contains: ( name ) => [ 'acf-field', ...classes ].includes( name ) },
	dataset: key ? { key } : {},
} );

const NOTHING = new Set();

test( 'reads a compact control as a control', () => {
	for ( const type of [ 'select', 'number', 'range', 'button-group', 'date-picker', 'color-picker' ] ) {
		assert.equal( roleOf( field( [ `acf-field-${ type }` ] ), NOTHING ), 'controls', type );
	}
} );

test( 'reads a short single-line field as a control too', () => {
	for ( const type of [ 'text', 'url', 'email', 'link' ] ) {
		assert.equal( roleOf( field( [ `acf-field-${ type }` ] ), NOTHING ), 'controls', type );
	}
} );

test( 'reads media, editors and containers as content', () => {
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
 * Walk a field group the way `layoutBlockForm()` does.
 *
 * Role no longer decides width — a field with no authored width takes the whole
 * row wherever it is — so the only thing left to assert is placement: what stays
 * in the flow, in the order the field group wrote it, and what leaves for the
 * Display options list at the end.
 */
function split( fields, gating = NOTHING ) {
	const flow = [];
	const options = [];
	fields.forEach( ( [ name, type ] ) => {
		const role = roleOf( field( [ `acf-field-${ type }` ], `field_${ name }` ), gating );
		( role === 'options' ? options : flow ).push( name );
	} );
	return { flow, options };
}

test( 'leaves a cards collection in its authored order, toggles aside', () => {
	assert.deepEqual( split( CARDS_COLLECTION ), {
		flow: [
			'background',
			'background_style',
			'heading',
			'subheading',
			'card_style',
			'cards_per_row',
			'cards',
			'cta',
		],
		// `searchable` gates nothing, so it joins the three at the end.
		options: [ 'searchable', 'animate', 'fancy', 'really_black' ],
	} );
} );

test( 'keeps a gating toggle in the flow, at the point it gates from', () => {
	const gating = new Set( [ 'field_searchable' ] );
	const { flow, options } = split( CARDS_COLLECTION, gating );
	assert.equal( flow.indexOf( 'searchable' ), flow.indexOf( 'card_style' ) + 1 );
	assert.deepEqual( options, [ 'animate', 'fancy', 'really_black' ] );
} );

/*
 * The Display options count, over the DOM `layoutFields` actually builds.
 *
 * The predicate matters more than it looks: ACF hides a conditional field by
 * adding the `acf-hidden` class, never by writing an inline `display`, so a
 * count that tested only `style.display` excluded nothing and told the editor
 * that a setting it cannot reach is one of its choices.
 */
const optionField = ( { key, on = false, hidden = false } ) => `
<div class="acf-field acf-field-true-false${ hidden ? ' acf-hidden' : '' }" data-key="${ key }" data-type="true_false">
  <div class="acf-label"><label>${ key }</label></div>
  <div class="acf-input"><input type="checkbox"${ on ? ' checked' : '' }></div>
</div>`;

const countText = ( fields ) => {
	const dom = new JSDOM( `<div class="acf-block-fields">${ fields }</div>` );
	global.document = dom.window.document;
	const form = dom.window.document.querySelector( '.acf-block-fields' );
	layoutFields( form );
	return form.querySelector( '.herd-fieldopts__count' )?.textContent;
};

test( 'the Display options count is over the toggles that are on offer', () => {
	assert.equal( countText( optionField( { key: 'a', on: true } ) + optionField( { key: 'b' } ) ), '1 of 2 on' );
} );

test( 'a toggle ACF has hidden with a class is in neither half of the count', () => {
	const fields =
		optionField( { key: 'a', on: true } ) +
		optionField( { key: 'b' } ) +
		optionField( { key: 'c', on: true, hidden: true } );
	assert.equal( countText( fields ), '1 of 2 on', 'acf-hidden is how ACF hides, not an inline display' );
} );
