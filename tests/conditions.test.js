import test from 'node:test';
import assert from 'node:assert/strict';
import { controllingKey, gatingKeys, isStructural } from '../src/ui/acf/conditions.js';

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

/*
 * `controllingKey` answers from the dependent end the question `gatingKeys`
 * answers from the controlling end: not "does anything depend on me" but "is
 * there one field I depend on". src/ui/acf/dep.js groups a reveal by it, so a
 * wrong answer draws a rule around fields that do not belong together.
 */
const field = ( conditions ) => ( { getAttribute: () => conditions } );

test( 'names the one field a reveal hangs on', () => {
	const key = controllingKey( field( '[[{"field":"field_a","operator":"==","value":"1"}]]' ) );
	assert.equal( key, 'field_a' );
} );

test( 'does not care which way the test runs, because a reveal is a reveal', () => {
	const key = controllingKey( field( '[[{"field":"field_a","operator":"!=","value":"1"}]]' ) );
	assert.equal( key, 'field_a' );
} );

test( 'two rules naming one field still name one field', () => {
	const key = controllingKey(
		field( '[[{"field":"field_a","operator":"==","value":"1"},{"field":"field_a","operator":"!=","value":"2"}]]' )
	);
	assert.equal( key, 'field_a' );
} );

test( 'reads a condition saved as a flat group, the way older field groups saved them', () => {
	assert.equal( controllingKey( field( '[{"field":"field_a","operator":"==","value":"1"}]' ) ), 'field_a' );
} );

test( 'answers with nothing when two different fields could reveal it', () => {
	const key = controllingKey(
		field( '[[{"field":"field_a","operator":"==","value":"1"}],[{"field":"field_b","operator":"==","value":"1"}]]' )
	);
	assert.equal( key, null );
} );

test( 'answers with nothing when there are no conditions at all', () => {
	assert.equal( controllingKey( field( null ) ), null );
} );

test( 'answers with nothing when the conditions will not parse', () => {
	assert.equal( controllingKey( field( '{oops' ) ), null );
} );
