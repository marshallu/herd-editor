import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { countOn, decorateAccordions, resetAccordions } from '../src/ui/acf/accordion.js';

/*
 * ACF's accordion DOM *after* it has initialised, which is the only shape this
 * decorator ever sees. Before ACF runs, a section is a bare `.acf-field-accordion`
 * and its fields are its siblings; the move into `.acf-accordion-content`, the
 * `.acf-accordion-title`, the `role` and the `<i>` are all ACF's doing.
 */
const toggle = ( { key = 'field_a', name = 'a', on = false, hidden = false } = {} ) => `
<div class="acf-field acf-field-true-false" data-key="${ key }" data-name="${ name }" data-type="true_false"${ hidden ? ' style="display: none;"' : '' }>
  <div class="acf-label"><label>${ name }</label></div>
  <div class="acf-input">
    <div class="acf-true-false">
      <input type="hidden" name="acf[${ key }]" value="0">
      <input type="checkbox" name="acf[${ key }]" value="1"${ on ? ' checked' : '' }>
    </div>
  </div>
</div>`;

const section = ( label, fields, open = false ) => `
<div class="acf-field acf-field-accordion acf-accordion${ open ? ' -open' : '' }" data-type="accordion" multi-expand="1">
  <div class="acf-label acf-accordion-title" tabindex="0" role="button" aria-expanded="${ open }">
    <i class="acf-accordion-icon dashicons dashicons-arrow-right"></i>${ label }
  </div>
  <div class="acf-input acf-accordion-content" role="region">
    <div class="acf-fields">${ fields }</div>
  </div>
</div>`;

const screen = ( body ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <div class="herd-rail__panel" data-panel="more">
      <div class="postbox"><div class="inside acf-fields -top">${ body }</div></div>
    </div>
  </form>
</div>`;

/*
 * The decorator builds its badge with `document.createElement`, as every other
 * decorator in src/ui/acf does, so the document goes on the global the same way
 * tests/link.test.js and tests/boxes.test.js put it there.
 */
const mount = ( body ) => {
	const dom = new JSDOM( screen( body ) );
	global.document = dom.window.document;
	return { dom, panel: dom.window.document.querySelector( '.herd-rail__panel' ) };
};

const badgeIn = ( panel, index = 0 ) =>
	panel.querySelectorAll( '.acf-accordion' )[ index ].querySelector( '.herd-accordion__count' );

test( 'a section counts only the toggles it is actually offering', () => {
	const { panel } = mount(
		section( 'Navigation', toggle( { key: 'a', name: 'a', on: true } ) + toggle( { key: 'b', name: 'b' } ) )
	);
	decorateAccordions( panel );
	assert.equal( badgeIn( panel ).textContent, '1 on' );
} );

test( 'a toggle conditional logic has hidden is not in the count', () => {
	const { panel } = mount(
		section(
			'Navigation',
			toggle( { key: 'a', name: 'a', on: true } ) +
				toggle( { key: 'b', name: 'b', on: true, hidden: true } )
		)
	);
	decorateAccordions( panel );
	assert.equal( badgeIn( panel ).textContent, '1 on' );
} );

test( "a repeater row's own toggles belong to the row, not to the section", () => {
	const { panel } = mount(
		section(
			'Navigation',
			`<div class="acf-field acf-field-repeater"><div class="acf-input"><div class="acf-repeater -block">
			   <table><tbody><tr class="acf-row"><td class="acf-fields">${ toggle( {
					key: 'cta',
					name: 'primary_cta',
					on: true,
				} ) }</td></tr></tbody></table>
			 </div></div></div>` + toggle( { key: 'a', name: 'a', on: true } )
		)
	);
	decorateAccordions( panel );
	assert.equal( badgeIn( panel ).textContent, '1 on' );
} );

test( 'a section with nothing on shows no badge', () => {
	const { panel } = mount( section( 'Extras', toggle( { key: 'a', name: 'a' } ) ) );
	decorateAccordions( panel );
	assert.equal( badgeIn( panel ).hidden, true );
} );

test( 'the count follows the switch it is counting', () => {
	const { panel, dom } = mount( section( 'Extras', toggle( { key: 'a', name: 'a' } ) ) );
	decorateAccordions( panel );

	const box = panel.querySelector( 'input[type="checkbox"]' );
	box.checked = true;
	box.dispatchEvent( new dom.window.Event( 'change', { bubbles: true } ) );

	assert.equal( badgeIn( panel ).textContent, '1 on' );
	assert.equal( badgeIn( panel ).hidden, false );
} );

test( 'the badge survives ACF replacing the chevron, because it is appended after it', () => {
	const { panel, dom } = mount( section( 'Navigation', toggle( { key: 'a', name: 'a', on: true } ) ) );
	decorateAccordions( panel );

	// What ACF does on every toggle: build a fresh icon and swap the old one out.
	const title = panel.querySelector( '.acf-accordion-title' );
	const fresh = dom.window.document.createElement( 'i' );
	fresh.className = 'acf-accordion-icon dashicons dashicons-arrow-down';
	title.querySelector( '.acf-accordion-icon' ).replaceWith( fresh );

	assert.equal( title.querySelectorAll( '.herd-accordion__count' ).length, 1 );
	assert.equal( badgeIn( panel ).textContent, '1 on' );
} );

const press = ( dom, title, key ) => {
	const down = new dom.window.KeyboardEvent( 'keydown', { key, bubbles: true, cancelable: true } );
	title.dispatchEvent( down );
	const up = new dom.window.KeyboardEvent( 'keyup', { key, bubbles: true, cancelable: true } );
	title.dispatchEvent( up );
	return down;
};

test( 'Space opens a section, because role="button" says it should', () => {
	const { panel, dom } = mount( section( 'Navigation', toggle() ) );
	decorateAccordions( panel );

	const title = panel.querySelector( '.acf-accordion-title' );
	let clicks = 0;
	title.addEventListener( 'click', () => clicks++ );

	const down = press( dom, title, ' ' );

	assert.equal( clicks, 1 );
	assert.equal( down.defaultPrevented, true, 'Space must not also scroll the rail' );
} );

test( 'holding Space opens a section once, not once per repeat', () => {
	const { panel, dom } = mount( section( 'Navigation', toggle() ) );
	decorateAccordions( panel );

	const title = panel.querySelector( '.acf-accordion-title' );
	let clicks = 0;
	title.addEventListener( 'click', () => clicks++ );

	// Key repeat is a run of keydowns and one keyup, as a native button sees it.
	for ( let i = 0; i < 5; i++ ) {
		title.dispatchEvent( new dom.window.KeyboardEvent( 'keydown', { key: ' ', bubbles: true, cancelable: true } ) );
	}
	title.dispatchEvent( new dom.window.KeyboardEvent( 'keyup', { key: ' ', bubbles: true, cancelable: true } ) );

	assert.equal( clicks, 1 );
} );

test( 'Enter is left to ACF, so a section does not open twice', () => {
	const { panel, dom } = mount( section( 'Navigation', toggle() ) );
	decorateAccordions( panel );

	const title = panel.querySelector( '.acf-accordion-title' );
	let clicks = 0;
	title.addEventListener( 'click', () => clicks++ );
	press( dom, title, 'Enter' );

	assert.equal( clicks, 0 );
} );

test( 'decorating twice leaves one badge', () => {
	const { panel } = mount( section( 'Navigation', toggle( { on: true } ) ) );
	decorateAccordions( panel );
	decorateAccordions( panel );
	assert.equal( panel.querySelectorAll( '.herd-accordion__count' ).length, 1 );
} );

test( "a section inside ACF's clone row is left alone", () => {
	const { panel } = mount( `<div class="acf-clone">${ section( 'Navigation', toggle() ) }</div>` );
	decorateAccordions( panel );
	assert.equal( panel.querySelectorAll( '.herd-accordion__count' ).length, 0 );
} );

test( 'resetting puts the section back the way ACF rendered it', () => {
	const { panel } = mount( section( 'Navigation', toggle( { on: true } ) ) );
	const before = panel.innerHTML;
	decorateAccordions( panel );
	resetAccordions( panel );
	assert.equal( panel.innerHTML, before );
} );

test( 'countOn reads a section on its own, without it having been decorated', () => {
	const { panel } = mount(
		section( 'Navigation', toggle( { key: 'a', on: true } ) + toggle( { key: 'b', on: true } ) )
	);
	assert.equal( countOn( panel.querySelector( '.acf-accordion' ) ), 2 );
} );
