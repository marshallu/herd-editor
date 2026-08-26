import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { contentFields, isLayoutField, LAYOUT_TYPES } from '../src/ui/acf/layout-fields.js';

const dom = ( html ) => new JSDOM( `<div id="root">${ html }</div>` ).window.document.getElementById( 'root' );

/** ACF's wrapper: the type is on `data-type` and again in a class. */
const wrapper = ( type ) =>
	`<div class="acf-field acf-field-${ type.replace( /_/g, '-' ) }" data-type="${ type }"></div>`;

/** A `<th class="acf-th">` in a table repeater carries no `data-type`. */
const classOnly = ( type ) => `<div class="acf-field acf-field-${ type.replace( /_/g, '-' ) }"></div>`;

test( 'names every ACF field type that holds no value', () => {
	assert.deepEqual( LAYOUT_TYPES, [ 'spacer', 'message', 'tab', 'accordion' ] );
} );

test( 'reads a layout field off data-type', () => {
	for ( const type of LAYOUT_TYPES ) {
		assert.equal( isLayoutField( dom( wrapper( type ) ).firstElementChild ), true, type );
	}
} );

test( 'falls back to the class when data-type is missing', () => {
	for ( const type of LAYOUT_TYPES ) {
		assert.equal( isLayoutField( dom( classOnly( type ) ).firstElementChild ), true, type );
	}
} );

test( 'leaves fields that hold a value alone', () => {
	for ( const type of [ 'text', 'select', 'image', 'repeater', 'group', 'true_false', 'wysiwyg' ] ) {
		assert.equal( isLayoutField( dom( wrapper( type ) ).firstElementChild ), false, type );
	}
} );

test( 'is not fooled by a field whose name looks like a layout type', () => {
	// `acf-field-{key}` is also on the wrapper, and a field group is free to name
	// a field `spacer`. The type is what decides, not the name.
	const node = dom( '<div class="acf-field acf-field-text acf-field-spacer_note" data-type="text" data-name="spacer"></div>' ).firstElementChild;
	assert.equal( isLayoutField( node ), false );
} );

test( 'survives a node that is not a field', () => {
	assert.equal( isLayoutField( null ), false );
	assert.equal( isLayoutField( undefined ), false );
	assert.equal( isLayoutField( {} ), false );
} );

test( 'drops layout fields and keeps the rest, in order', () => {
	const root = dom( wrapper( 'text' ) + wrapper( 'spacer' ) + wrapper( 'message' ) + wrapper( 'select' ) );
	assert.deepEqual(
		contentFields( root.children ).map( ( node ) => node.dataset.type ),
		[ 'text', 'select' ]
	);
} );

test( 'drops anything that is not a field at all', () => {
	// A repeater row's `td.acf-fields` also holds Herd's own header element.
	const root = dom( '<span class="herd-cardrow"></span>' + wrapper( 'text' ) );
	assert.equal( contentFields( root.children ).length, 1 );
} );

test( 'survives being given nothing', () => {
	assert.deepEqual( contentFields( null ), [] );
	assert.deepEqual( contentFields( undefined ), [] );
} );
