import test from 'node:test';
import assert from 'node:assert/strict';
import { gatingKeys, isStructural } from '../src/ui/acf/conditions.js';

/** Stand-ins for the `.acf-field` wrappers ACF renders. */
const form = ( conditions ) => ( {
	querySelectorAll: () => conditions.map( ( value ) => ( {
		getAttribute: () => value,
	} ) ),
} );

test( 'collects the fields other fields depend on', () => {
	// ACF nests conditions as OR groups of AND rules.
	const keys = gatingKeys( form( [
		'[[{"field":"field_include_photos","operator":"==","value":"1"}]]',
		'[[{"field":"field_photos_style","operator":"==","value":"grid"}]]',
	] ) );
	assert.deepEqual( [ ...keys ].sort(), [ 'field_include_photos', 'field_photos_style' ] );
} );

test( 'reads every rule in a multi-clause condition', () => {
	const keys = gatingKeys( form( [
		'[[{"field":"field_a","operator":"==","value":"1"},{"field":"field_b","operator":"!=","value":"2"}],[{"field":"field_c","operator":"==","value":"3"}]]',
	] ) );
	assert.deepEqual( [ ...keys ].sort(), [ 'field_a', 'field_b', 'field_c' ] );
} );

test( 'survives a field group that saved something unparseable', () => {
	assert.equal( gatingKeys( form( [ 'not json' ] ) ).size, 0 );
	assert.equal( gatingKeys( form( [ '{"field":"field_a"}' ] ) ).size, 0 );
} );

test( 'answers with no form at all', () => {
	assert.equal( gatingKeys( null ).size, 0 );
} );

test( 'identifies the field a condition points at', () => {
	const keys = new Set( [ 'field_include_video' ] );
	assert.equal( isStructural( { dataset: { key: 'field_include_video' } }, keys ), true );
	assert.equal( isStructural( { dataset: { key: 'field_animate' } }, keys ), false );
	assert.equal( isStructural( { dataset: {} }, keys ), false );
} );
