import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateIcons, isIconSelect } from '../src/ui/acf/icons.js';

/*
 * A stand-in for what `mu_icons()` publishes: a flat name-to-markup map. The
 * markup only has to be a string — the picker inlines it and never parses it.
 */
const ICONS = {};
const NAMES = [ 'web', 'phone', 'email', 'map', 'announcement', 'book', 'calendar', 'camera', 'chart', 'coffee', 'flag', 'flame' ];
NAMES.forEach( ( name ) => {
	ICONS[ name ] = `<svg data-icon="${ name }"><path d="M0 0"/></svg>`;
} );

/** ACF's select output, reduced to the parts the decorator touches. */
const selectField = ( { choices, label = 'Link icon', name = 'link_icon' } ) => `
<div class="acf-field acf-field-select" data-name="${ name }" data-type="select">
  <div class="acf-label"><label for="acf-${ name }">${ label }</label></div>
  <div class="acf-input">
    <select id="acf-${ name }" name="acf[field_${ name }]">
      ${ choices.map( ( [ value, text ], index ) => `<option value="${ value }"${ index === 0 ? ' selected' : '' }>${ text }</option>` ).join( '' ) }
    </select>
  </div>
</div>`;

/** Billboard's `link_icon`: four icons, each with a name of its own. */
const LINK_CHOICES = [ [ 'web', 'Web Link' ], [ 'phone', 'Phone Link' ], [ 'email', 'Email Link' ], [ 'map', 'Map Link' ] ];
/** A card's icon field: choices keyed name-to-name, so the text is the slug. */
const CARD_CHOICES = NAMES.map( ( name ) => [ name, name ] );

function build( markup ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	global.getComputedStyle = dom.window.getComputedStyle;
	global.HTMLElement = dom.window.HTMLElement;
	// The decorators construct events; jsdom rejects one built from node's own Event.
	global.Event = dom.window.Event;
	/*
	 * jsdom has no popover implementation, and the decorator declines to build
	 * anything without one — a plain select beats a panel clipped out of sight.
	 * These stubs are enough to get past that gate; nothing below opens the panel.
	 */
	dom.window.HTMLElement.prototype.showPopover = function showPopover() {};
	dom.window.HTMLElement.prototype.hidePopover = function hidePopover() {};
	dom.window.HerdEditor = { icons: ICONS };
	return dom.window.document.querySelector( '.acf-block-fields' );
}

const picker = ( form ) => form.querySelector( '.herd-iconpick' );
const tiles = ( form ) => Array.from( form.querySelectorAll( '.herd-icontile' ) );

test( 'recognises an icon select at both sizes', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) + selectField( { choices: CARD_CHOICES, name: 'card_icon' } ) );
	const [ small, big ] = Array.from( form.querySelectorAll( 'select' ) );
	assert.equal( isIconSelect( small ), true );
	assert.equal( isIconSelect( big ), true );
} );

test( 'declines a select whose options are not icon names', () => {
	const form = build( selectField( { choices: [ [ 'left', 'Left' ], [ 'right', 'Right' ], [ 'center', 'Center' ] ], name: 'align' } ) );
	assert.equal( isIconSelect( form.querySelector( 'select' ) ), false );
	decorateIcons( form );
	assert.equal( picker( form ), null );
	// The field ACF rendered is untouched, so the select is still the control.
	assert.equal( form.querySelector( '.acf-field' ).classList.contains( 'herd-has-icons' ), false );
} );

test( 'declines a select with fewer than two choices', () => {
	const form = build( selectField( { choices: [ [ 'web', 'Web Link' ] ] } ) );
	assert.equal( isIconSelect( form.querySelector( 'select' ) ), false );
} );

test( 'the trigger names the icon the way the field does', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Web Link' );
	assert.equal( tiles( form )[ 1 ].getAttribute( 'aria-label' ), 'Phone Link' );
} );

test( 'falls back to humanizing the slug when the option text is the slug', () => {
	const form = build( selectField( { choices: CARD_CHOICES, name: 'card_icon' } ) );
	decorateIcons( form );
	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Web' );
	const announcement = tiles( form ).find( ( tile ) => tile.dataset.value === 'announcement' );
	assert.equal( announcement.getAttribute( 'aria-label' ), 'Announcement' );
} );

test( 'search appears only when there is something to search', () => {
	const small = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( small );
	assert.equal( small.querySelector( '.herd-iconpick__search' ), null );

	const big = build( selectField( { choices: CARD_CHOICES, name: 'card_icon' } ) );
	decorateIcons( big );
	// Same control either way — a trigger and a panel, with or without the box.
	assert.ok( big.querySelector( '.herd-iconpick__search input' ) );
	assert.ok( big.querySelector( '.herd-iconpick__trigger' ) );
	assert.equal( tiles( big ).length, CARD_CHOICES.length );
} );

test( 'search matches the slug and the name alike', () => {
	const form = build( selectField( { choices: CARD_CHOICES, name: 'card_icon' } ) );
	decorateIcons( form );
	const search = form.querySelector( '.herd-iconpick__search input' );
	search.value = 'cam';
	search.dispatchEvent( new global.window.Event( 'input' ) );

	const visible = tiles( form ).filter( ( tile ) => ! tile.hidden );
	assert.deepEqual( visible.map( ( tile ) => tile.dataset.value ), [ 'camera' ] );
	assert.equal( form.querySelector( '.herd-iconpick__empty' ).hidden, true );
	// The one tile left is the way in, so it is the one that is tabbable.
	assert.equal( visible[ 0 ].tabIndex, 0 );
} );

test( 'says so when nothing matches', () => {
	const form = build( selectField( { choices: CARD_CHOICES, name: 'card_icon' } ) );
	decorateIcons( form );
	const search = form.querySelector( '.herd-iconpick__search input' );
	search.value = 'zzz';
	search.dispatchEvent( new global.window.Event( 'input' ) );

	const empty = form.querySelector( '.herd-iconpick__empty' );
	assert.equal( empty.hidden, false );
	assert.match( empty.textContent, /No icons match/ );
} );

test( 'choosing a tile writes the select and fires a bubbling change', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	const select = form.querySelector( 'select' );

	let heard = 0;
	form.addEventListener( 'change', () => heard++ );
	tiles( form ).find( ( tile ) => tile.dataset.value === 'map' ).click();

	// The select is still the value; everything downstream reads it from there.
	assert.equal( select.value, 'map' );
	assert.equal( heard, 1 );
	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Map Link' );
	assert.equal( form.querySelector( '.herd-iconpick__foot' ).textContent, 'Map Link selected' );
} );

test( 'repaints when the value changes without going through the grid', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	const select = form.querySelector( 'select' );

	// Conditional logic and revisions both arrive this way.
	select.value = 'email';
	select.dispatchEvent( new global.window.Event( 'change', { bubbles: true } ) );

	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Email Link' );
	const checked = tiles( form ).filter( ( tile ) => tile.getAttribute( 'aria-checked' ) === 'true' );
	assert.deepEqual( checked.map( ( tile ) => tile.dataset.value ), [ 'email' ] );
} );

test( 'offers no clear when ACF has no empty option to clear to', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	assert.equal( form.querySelector( '.herd-iconpick__clear' ), null );
	assert.equal( picker( form ).classList.contains( 'is-empty' ), false );
} );

test( 'clears to empty where allow_null put an empty option in the select', () => {
	const form = build( selectField( { choices: [ [ '', '- Select -' ], ...LINK_CHOICES ] } ) );
	decorateIcons( form );
	const select = form.querySelector( 'select' );
	// An empty option is not an icon, so it gets no tile.
	assert.equal( tiles( form ).length, LINK_CHOICES.length );

	select.value = 'phone';
	select.dispatchEvent( new global.window.Event( 'change', { bubbles: true } ) );
	const clear = form.querySelector( '.herd-iconpick__clear' );
	assert.equal( clear.hidden, false );

	clear.click();
	assert.equal( select.value, '' );
	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Choose an icon' );
	assert.equal( form.querySelector( '.herd-iconpick__foot' ).textContent, 'Nothing selected' );
	assert.equal( picker( form ).classList.contains( 'is-empty' ), true );
	assert.equal( clear.hidden, true );
} );

test( 'the trigger is named by the field label and the chosen icon', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	const trigger = form.querySelector( '.herd-iconpick__trigger' );
	const ids = trigger.getAttribute( 'aria-labelledby' ).split( ' ' );
	assert.equal( ids.length, 2 );
	assert.equal( form.querySelector( `#${ ids[ 0 ] }` ).textContent, 'Link icon' );
	assert.equal( form.querySelector( `#${ ids[ 1 ] }` ).textContent, 'Web Link' );
	assert.equal( trigger.getAttribute( 'aria-expanded' ), 'false' );
} );

test( 'decorating twice leaves one picker', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	decorateIcons( form );
	assert.equal( form.querySelectorAll( '.herd-iconpick' ).length, 1 );
} );

test( 'never touches the clone row ACF keeps as a template', () => {
	const form = build( `<div class="acf-clone">${ selectField( { choices: LINK_CHOICES } ) }</div>` );
	decorateIcons( form );
	assert.equal( picker( form ), null );
} );

test( 'a row that has been stripped for cloning decorates again cleanly', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	const select = form.querySelector( 'select' );
	select.value = 'map';

	// Exactly what resetDecoration in repeater.js does to a duplicated row.
	form.querySelectorAll( '.herd-iconpick' ).forEach( ( node ) => node.remove() );
	form.querySelectorAll( '.herd-has-icons' ).forEach( ( field ) => field.classList.remove( 'herd-has-icons' ) );

	// The select survived the strip intact, options and value alike.
	assert.equal( select.options.length, LINK_CHOICES.length );
	assert.equal( select.value, 'map' );

	decorateIcons( form );
	assert.equal( form.querySelectorAll( '.herd-iconpick' ).length, 1 );
	assert.equal( form.querySelector( '.herd-iconpick__name' ).textContent, 'Map Link' );
} );

test( 'a duplicated row gets its own label id rather than the original row\'s', () => {
	const form = build( selectField( { choices: LINK_CHOICES } ) );
	decorateIcons( form );
	const first = form.querySelector( '.acf-field' );

	// ACF duplicates a row by copying its DOM, decoration and all; repeater.js
	// then strips what carried listeners and lets the decorators rebuild it.
	const copy = first.cloneNode( true );
	form.appendChild( copy );
	copy.querySelector( '.herd-iconpick' ).remove();
	copy.classList.remove( 'herd-has-icons' );
	decorateIcons( form );

	const labelled = Array.from( form.querySelectorAll( '.herd-iconpick__trigger' ) )
		.map( ( trigger ) => trigger.getAttribute( 'aria-labelledby' ).split( ' ' )[ 0 ] );
	assert.equal( labelled.length, 2 );
	assert.notEqual( labelled[ 0 ], labelled[ 1 ] );
	// Each trigger names the label in its own row.
	assert.equal( first.querySelector( 'label' ).id, labelled[ 0 ] );
	assert.equal( copy.querySelector( 'label' ).id, labelled[ 1 ] );
} );
