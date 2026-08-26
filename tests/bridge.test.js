import test from 'node:test';
import assert from 'node:assert/strict';
import { AcfBlockFormBridge } from '../src/acf/bridge.js';

function fakeHost() {
	const listeners = new Map();
	const form = {
		addEventListener: ( name, handler ) => listeners.set( name, handler ),
		removeEventListener: ( name ) => listeners.delete( name ),
	};
	return { host: { innerHTML: '', querySelector: () => form, replaceChildren() { this.innerHTML = ''; }, }, form, listeners };
}

test( 'accepts a fieldless response', async () => {
	const bridge = new AcfBlockFormBridge( { block: { clientId: 'one' }, postId: 1, onAttributes() {} } );
	bridge.fetchForm = async () => '';
	const { host } = fakeHost();
	assert.deepEqual( await bridge.mount( host ), { status: 'empty' } );
	bridge.dispose();
} );

test( 'suppresses duplicate input/change commits and disposes ACF lifecycle', async () => {
	const actions = []; const commits = [];
	global.window = {
		jQuery: ( value ) => value,
		acf: { doAction: ( name ) => actions.push( name ), serialize: () => ( { field: 'value' } ) },
	};
	const bridge = new AcfBlockFormBridge( { block: { clientId: 'one' }, postId: 1, onAttributes: ( value ) => commits.push( value ) } );
	bridge.fetchForm = async () => '<div class="acf-block-fields"></div>';
	const { host, listeners } = fakeHost();
	assert.deepEqual( await bridge.mount( host ), { status: 'mounted' } );
	listeners.get( 'input' )(); listeners.get( 'change' )();
	assert.deepEqual( commits, [ { data: { field: 'value' } } ] );
	bridge.dispose();
	assert.deepEqual( actions, [ 'append', 'remove' ] );
	assert.equal( listeners.size, 0 );
} );

test( 'decorates only after ACF has initialised, and unwinds on dispose', async () => {
	// `prepare` moves DOM and must see an inert form; `enhance` reads rendered
	// values and must not run until ACF has built them. The order below is the
	// contract src/ui/acf/layout.js is written against.
	const order = [];
	global.window = {
		jQuery: ( value ) => value,
		acf: { doAction: ( name ) => order.push( `acf:${ name }` ), serialize: () => ( {} ) },
	};
	const bridge = new AcfBlockFormBridge( {
		block: { clientId: 'one' },
		postId: 1,
		onAttributes() {},
		prepare: () => order.push( 'prepare' ),
		enhance: () => {
			order.push( 'enhance' );
			return () => order.push( 'teardown' );
		},
	} );
	bridge.fetchForm = async () => '<div class="acf-block-fields"></div>';
	const { host } = fakeHost();

	await bridge.mount( host );
	assert.deepEqual( order, [ 'prepare', 'acf:append', 'enhance' ] );

	bridge.dispose();
	assert.deepEqual( order.slice( -2 ), [ 'teardown', 'acf:remove' ] );
} );

test( 'a form with nothing to decorate still disposes cleanly', async () => {
	global.window = {
		jQuery: ( value ) => value,
		acf: { doAction: () => {}, serialize: () => ( {} ) },
	};
	const bridge = new AcfBlockFormBridge( {
		block: { clientId: 'one' },
		postId: 1,
		onAttributes() {},
		// A decorator that finds nothing returns no disposer.
		enhance: () => undefined,
	} );
	bridge.fetchForm = async () => '<div class="acf-block-fields"></div>';
	await bridge.mount( fakeHost().host );
	assert.doesNotThrow( () => bridge.dispose() );
} );
