import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
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

/*
 * A real form, and a jQuery stub that records what was bound to it.
 *
 * ACF sets a media or link value with acf.val(), which announces it with
 * jQuery's .trigger( 'change' ) -- a walk of jQuery's own handler list, not a
 * DOM event. The stub's `on` therefore stands in for the only channel those
 * values travel on, and the assertions below are about what reaches the DOM's.
 */
function jqueryHost() {
	const dom = new JSDOM( '<div id="host"></div>' );
	const host = dom.window.document.getElementById( 'host' );
	const bound = [];
	const jquery = () => ( {
		on: ( name, handler ) => bound.push( { name, handler } ),
		off: ( name, handler ) => {
			const index = bound.findIndex( ( entry ) => entry.name === name && entry.handler === handler );
			if ( index > -1 ) bound.splice( index, 1 );
		},
	} );
	return { dom, host, bound, jquery, trigger: ( name, event ) => bound.filter( ( entry ) => entry.name === name ).forEach( ( entry ) => entry.handler( event ) ) };
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

test( 'merges each edit with current controller data rather than the opened block snapshot', async () => {
	const commits = [];
	let current = { title: 'Opened', cards: '1', cards_0_title: 'A', cards_0_hidden: 'Keep' };
	global.window = {
		jQuery: ( value ) => value,
		acf: { doAction() {}, serialize: () => ( { cards: '1', cards_0_title: 'Changed' } ) },
	};
	const bridge = new AcfBlockFormBridge( {
		block: { clientId: 'one', attributes: { data: current } },
		postId: 1,
		getData: () => current,
		onAttributes: ( attributes ) => { commits.push( attributes ); current = { ...current, ...attributes.data }; },
	} );
	bridge.fetchForm = async () => '<div class="acf-block-fields"></div>';
	const { host, listeners } = fakeHost();
	await bridge.mount( host );
	// This represents a second mounted control committing after the panel opened.
	current = { ...current, title: 'Edited elsewhere', recently_added: 'Retain me' };
	listeners.get( 'input' )();
	assert.deepEqual( commits[ 0 ], { data: {
		title: 'Edited elsewhere', recently_added: 'Retain me', cards: '1', cards_0_title: 'Changed', cards_0_hidden: 'Keep',
	} } );
	bridge.dispose();
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

test( 'keeps a nested conditional value but removes an explicitly deleted inner or outer row', () => {
	const previous = {
		sections: '2', sections_0_cards: '2', sections_0_cards_0_title: 'A', sections_0_cards_0_note: 'Hidden', sections_0_cards_1_title: 'B',
		sections_1_cards: '1', sections_1_cards_0_title: 'Outside',
	};
	assert.deepEqual(
		mergeAcfBlockData( previous, { sections: '2', sections_0_cards: '1', sections_0_cards_0_title: 'A', sections_1_cards: '1', sections_1_cards_0_title: 'Outside' } ),
		{ sections: '2', sections_0_cards: '1', sections_0_cards_0_title: 'A', sections_0_cards_0_note: 'Hidden', sections_1_cards: '1', sections_1_cards_0_title: 'Outside' }
	);
	assert.deepEqual(
		mergeAcfBlockData( previous, { sections: '1', sections_0_cards: '2', sections_0_cards_0_title: 'A', sections_0_cards_1_title: 'B' } ),
		{ sections: '1', sections_0_cards: '2', sections_0_cards_0_title: 'A', sections_0_cards_0_note: 'Hidden', sections_0_cards_1_title: 'B' }
	);
} );

test( 'preserves a row key when the field length cannot be read', () => {
	assert.deepEqual(
		mergeAcfBlockData( { cards_0_title: 'A' }, { title: 'New' } ),
		{ title: 'New', cards_0_title: 'A' }
	);
} );

test( 'a value ACF set with jQuery reaches the block data', async () => {
	const { host, jquery, trigger } = jqueryHost();
	const commits = [];
	let input = null;
	global.window = {
		jQuery: jquery,
		acf: { doAction() {}, serialize: () => ( { image: input.value } ) },
	};
	const bridge = new AcfBlockFormBridge( { block: { clientId: 'one', attributes: { data: { image: '' } } }, postId: 1, onAttributes: ( value ) => commits.push( value ) } );
	bridge.fetchForm = async () => '<div class="acf-block-fields"><input type="hidden" name="acf[field_i]" value=""></div>';
	await bridge.mount( host );
	input = host.querySelector( 'input' );

	// What choosing an image in ACF's media popup does: the value, then a
	// jQuery-only announcement of it.
	input.value = '42';
	trigger( 'change', { target: input } );

	assert.deepEqual( commits, [ { data: { image: '42' } } ] );
	bridge.dispose();
} );

test( 'a native change relayed by jQuery is not dispatched a second time', async () => {
	const { host, jquery, trigger } = jqueryHost();
	global.window = { jQuery: jquery, acf: { doAction() {}, serialize: () => ( {} ) } };
	const bridge = new AcfBlockFormBridge( { block: { clientId: 'one' }, postId: 1, onAttributes() {} } );
	bridge.fetchForm = async () => '<div class="acf-block-fields"><input type="text" name="acf[field_t]"></div>';
	await bridge.mount( host );
	const form = host.querySelector( '.acf-block-fields' );
	const input = form.querySelector( 'input' );
	let seen = 0;
	form.addEventListener( 'change', () => { seen += 1; } );

	// jQuery hands its handlers every native event too. Re-dispatching one would
	// be an event this form has already had, and each pass would make another.
	trigger( 'change', { target: input, originalEvent: {} } );
	assert.equal( seen, 0 );

	trigger( 'change', { target: input } );
	assert.equal( seen, 1 );
	bridge.dispose();
} );

test( 'the jQuery relay is unbound with the form', async () => {
	const { host, jquery, bound } = jqueryHost();
	global.window = { jQuery: jquery, acf: { doAction() {}, serialize: () => ( {} ) } };
	const bridge = new AcfBlockFormBridge( { block: { clientId: 'one' }, postId: 1, onAttributes() {} } );
	bridge.fetchForm = async () => '<div class="acf-block-fields"></div>';
	await bridge.mount( host );
	assert.equal( bound.length, 1 );
	bridge.dispose();
	assert.equal( bound.length, 0 );
} );
