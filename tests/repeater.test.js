import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRow, fieldText } from '../src/ui/acf/repeater.js';

/**
 * A stand-in for one `.acf-field` wrapper.
 *
 * The module reads ACF's rendered markup through a handful of selectors, so the
 * fake answers those selectors and nothing else — same approach as the other
 * suites here, which keeps the tests free of a DOM implementation.
 */
function field( { type, value = '', linkTitle = null, option = null, radio = null, hidden = false } ) {
	const classes = [ 'acf-field', `acf-field-${ type }` ];
	const inputs = [];
	if ( value !== null ) inputs.push( { type: type === 'image' ? 'hidden' : 'text', value } );
	if ( option ) inputs.push( { type: 'select-one', value: option.value } );
	if ( radio ) inputs.push( { type: 'radio', value: radio.value, checked: true } );

	const select = option ? { selectedIndex: 0, options: [ { value: option.value, textContent: option.label } ] } : null;

	return {
		style: { display: hidden ? 'none' : '' },
		classList: { contains: ( name ) => classes.includes( name ) },
		querySelectorAll: () => inputs,
		querySelector: ( selector ) => {
			if ( selector.includes( '.link-title' ) ) return linkTitle === null ? null : { textContent: linkTitle };
			if ( selector === 'select' ) return select;
			if ( selector.includes( 'radio' ) ) return radio ? { closest: () => ( { textContent: radio.label } ) } : null;
			if ( selector.includes( 'textarea' ) && ! selector.includes( 'input' ) ) return { value };
			if ( selector.includes( 'input[type="text"]' ) ) return { value };
			return null;
		},
	};
}

const cell = ( fields ) => ( { children: fields } );

test( 'reads a field the way an editor would say it', () => {
	assert.equal( fieldText( field( { type: 'text', value: 'Meet the board' } ) ), 'Meet the board' );
	assert.equal( fieldText( field( { type: 'wysiwyg', value: '<p>Short <b>blurb</b></p>' } ) ), 'Short blurb' );
	assert.equal( fieldText( field( { type: 'link', linkTitle: 'Marshall news' } ) ), 'Marshall news' );
	assert.equal( fieldText( field( { type: 'select', option: { value: 'white', label: 'White' } } ) ), 'White' );
	assert.equal( fieldText( field( { type: 'button-group', radio: { value: 'grid', label: 'Grid' } } ) ), 'Grid' );
} );

test( 'a select sitting on its empty option says nothing', () => {
	assert.equal( fieldText( field( { type: 'select', option: { value: '', label: '- Select -' } } ) ), '' );
} );

test( 'names a row after its first text field and summarises the rest', () => {
	const row = describeRow( cell( [
		field( { type: 'text', value: 'Latest news' } ),
		field( { type: 'select', option: { value: 'white', label: 'White' } } ),
		field( { type: 'wysiwyg', value: 'Check out the latest Marshall news.' } ),
	] ) );

	assert.equal( row.name, 'Latest news' );
	assert.equal( row.summary, 'White · Check out the latest Marshall news.' );
} );

test( 'says nothing about a field the active card style has hidden', () => {
	// An Icon card has no image field, and a conditionally hidden select must not
	// leak its default into the summary.
	const row = describeRow( cell( [
		field( { type: 'text', value: 'Meet the board' } ),
		field( { type: 'image', value: '', hidden: true } ),
		field( { type: 'select', option: { value: 'white', label: 'White' }, hidden: true } ),
	] ) );

	assert.equal( row.name, 'Meet the board' );
	assert.equal( row.summary, '' );
} );

test( 'an untitled row still reports what it has', () => {
	const row = describeRow( cell( [
		field( { type: 'text', value: '' } ),
		field( { type: 'select', option: { value: 'green', label: 'Green' } } ),
	] ) );

	assert.equal( row.name, '' );
	assert.equal( row.summary, 'Green' );
} );

test( 'names a row from its link when no text field offers one', () => {
	// The Billboard block's `links` repeater: a select and a link, nothing else.
	const row = describeRow( cell( [
		field( { type: 'select', option: { value: 'web', label: 'Web Link' } } ),
		field( { type: 'link', value: null, linkTitle: 'Apply Now' } ),
	] ) );

	assert.equal( row.name, 'Apply Now' );
	// Promoted to the name, so it must not also appear in the summary.
	assert.equal( row.summary, 'Web Link' );
} );

test( 'still prefers a real text field over a link title', () => {
	const row = describeRow( cell( [
		field( { type: 'link', value: null, linkTitle: 'Apply Now' } ),
		field( { type: 'text', value: 'Admissions' } ),
	] ) );

	assert.equal( row.name, 'Admissions' );
	assert.equal( row.summary, 'Apply Now' );
} );

test( 'leaves a row with nothing to say unnamed', () => {
	const row = describeRow( cell( [ field( { type: 'image', value: '' } ) ] ) );
	assert.equal( row.name, '' );
	assert.equal( row.summary, '' );
} );
