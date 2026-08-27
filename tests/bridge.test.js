import test from 'node:test';
import assert from 'node:assert/strict';
import { AcfBlockFormBridge } from '../src/acf/bridge.js';
import { mergeAcfBlockData } from '../src/acf/helpers.js';

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

test( 'preserves legacy ACF data omitted by an unopened or conditional field', () => {
	assert.deepEqual(
		mergeAcfBlockData( { title: 'Old', retired_field: 'Keep', _retired_field: 'field_retired' }, { title: 'New', enabled: '' } ),
		{ title: 'New', retired_field: 'Keep', _retired_field: 'field_retired', enabled: '' }
	);
} );

test( 'drops repeater rows the editor deleted instead of resurrecting them', () => {
	assert.deepEqual(
		mergeAcfBlockData(
			{ cards: '2', _cards: 'field_cards', cards_0_title: 'A', _cards_0_title: 'field_t', cards_1_title: 'B', _cards_1_title: 'field_t' },
			{ cards: '1', _cards: 'field_cards', cards_0_title: 'A', _cards_0_title: 'field_t' }
		),
		{ cards: '1', _cards: 'field_cards', cards_0_title: 'A', _cards_0_title: 'field_t' }
	);
} );

test( 'keeps a conditionally hidden sub-field inside a row that still exists', () => {
	assert.deepEqual(
		mergeAcfBlockData(
			{ cards: '1', cards_0_title: 'A', cards_0_subtitle: 'Hidden', _cards_0_subtitle: 'field_s' },
			{ cards: '1', cards_0_title: 'A' }
		),
		{ cards: '1', cards_0_title: 'A', cards_0_subtitle: 'Hidden', _cards_0_subtitle: 'field_s' }
	);
} );

test( 'empties a repeater completely when its last row is removed', () => {
	assert.deepEqual(
		mergeAcfBlockData( { cards: '1', cards_0_title: 'A' }, { cards: '0' } ),
		{ cards: '0' }
	);
} );

test( 'never mistakes a sibling field for a row of the field it prefixes', () => {
	assert.deepEqual(
		mergeAcfBlockData( { cards: '1', cards_footnote: 'Keep', cards_0_title: 'A' }, { cards: '1', cards_0_title: 'A' } ),
		{ cards: '1', cards_footnote: 'Keep', cards_0_title: 'A' }
	);
} );

test( 'drops a removed flexible-content layout, which serializes as a list', () => {
	assert.deepEqual(
		mergeAcfBlockData(
			{ body: [ 'text', 'quote' ], body_0_copy: 'One', body_1_quote: 'Two' },
			{ body: [ 'text' ], body_0_copy: 'One' }
		),
		{ body: [ 'text' ], body_0_copy: 'One' }
	);
} );

test( 'preserves a row key when the field length cannot be read', () => {
	assert.deepEqual(
		mergeAcfBlockData( { cards_0_title: 'A' }, { title: 'New' } ),
		{ title: 'New', cards_0_title: 'A' }
	);
} );
