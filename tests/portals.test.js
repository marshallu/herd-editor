import test from 'node:test';
import assert from 'node:assert/strict';
import { DATEPICKER_CLASS, SELECT2_CLASS, registerPortalNamespaces } from '../src/ui/acf/portals.js';

/** Minimal stand-in for ACF's filter registry. */
function fakeAcf() {
	const filters = new Map();
	return {
		filters,
		addFilter( name, callback ) {
			filters.set( name, callback );
		},
		apply( name, value ) {
			return filters.get( name )( value );
		},
	};
}

test( 'namespaces the select2 container and dropdown', () => {
	const acf = fakeAcf();
	registerPortalNamespaces( acf );
	const args = acf.apply( 'select2_args', {} );
	assert.equal( args.containerCssClass, SELECT2_CLASS );
	assert.equal( args.dropdownCssClass, SELECT2_CLASS );
} );

test( 'keeps classes an upstream filter already set', () => {
	const acf = fakeAcf();
	registerPortalNamespaces( acf );
	const args = acf.apply( 'select2_args', { dropdownCssClass: 'theirs', placeholder: 'Pick one' } );
	assert.equal( args.dropdownCssClass, `theirs ${ SELECT2_CLASS }` );
	// Unrelated select2 options must survive untouched.
	assert.equal( args.placeholder, 'Pick one' );
} );

test( 'does not add the namespace twice', () => {
	const acf = fakeAcf();
	registerPortalNamespaces( acf );
	const once = acf.apply( 'select2_args', {} );
	const twice = acf.apply( 'select2_args', once );
	assert.equal( twice.dropdownCssClass, SELECT2_CLASS );
} );

test( 'marks the shared datepicker div on open and still runs an upstream beforeShow', () => {
	const acf = fakeAcf();
	const marked = [];
	// jQuery UI reuses one #ui-datepicker-div for the whole page.
	global.document = {
		getElementById: ( id ) => ( id === 'ui-datepicker-div' ? { classList: { add: ( c ) => marked.push( c ) } } : null ),
	};
	let upstreamRan = false;
	registerPortalNamespaces( acf );
	const args = acf.apply( 'date_picker_args', { beforeShow: () => { upstreamRan = true; } } );
	args.beforeShow();
	assert.deepEqual( marked, [ DATEPICKER_CLASS ] );
	assert.equal( upstreamRan, true );
	delete global.document;
} );

test( 'covers all three picker variants and survives a missing ACF', () => {
	const acf = fakeAcf();
	registerPortalNamespaces( acf );
	for ( const name of [ 'date_picker_args', 'date_time_picker_args', 'time_picker_args' ] ) {
		assert.equal( typeof acf.filters.get( name ), 'function', name );
	}
	// ACF absent, or too old to expose addFilter: register must be a no-op.
	assert.doesNotThrow( () => registerPortalNamespaces( undefined ) );
	assert.doesNotThrow( () => registerPortalNamespaces( {} ) );
} );
