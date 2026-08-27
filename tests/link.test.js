import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateLinks, resetLinks } from '../src/ui/acf/link.js';

/*
 * ACF's own link markup, from includes/fields/class-acf-field-link.php: a hidden
 * `.link-node` plus `input-*` fields carrying the value, a "Select Link" button
 * for the empty state, and a `.link-wrap` holding the resolved link. ACF rewrites
 * this field by descendant search on `.link-title`, `.link-url` and `[data-name]`,
 * so the decorator has to leave every one of those reachable.
 */
const linkField = ( { value = true } = {} ) => `
<div class="acf-field acf-field-link" data-name="cta" data-type="link">
  <div class="acf-input">
    <div class="acf-link${ value ? ' -value' : '' }">
      <div class="acf-hidden">
        <a class="link-node" href="https://www.marshall.edu/whymu/" target="_blank">Why Choose Marshall?</a>
        <input type="hidden" class="input-title" name="acf[field_l][title]" value="Why Choose Marshall?">
        <input type="hidden" class="input-url" name="acf[field_l][url]" value="https://www.marshall.edu/whymu/">
        <input type="hidden" class="input-target" name="acf[field_l][target]" value="_blank">
      </div>
      <a href="#" class="button" data-name="add" target="">Select Link</a>
      <div class="link-wrap">
        <span class="link-title">Why Choose Marshall?</span>
        <a class="link-url" href="https://www.marshall.edu/whymu/" target="_blank">https://www.marshall.edu/whymu/</a>
        <i class="acf-icon -link-ext acf-js-tooltip" title="Opens in a new window/tab"></i><a class="acf-icon -pencil -clear acf-js-tooltip" data-name="edit" href="#" title="Edit"></a><a class="acf-icon -cancel -clear acf-js-tooltip" data-name="remove" href="#" title="Remove"></a>
      </div>
    </div>
  </div>
</div>`;

function build( markup ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

test( 'the URL is text, so reading a link cannot navigate away from the post', () => {
	const form = build( linkField() );
	decorateLinks( form );

	const url = form.querySelector( '.link-url' );
	assert.equal( url.tagName, 'SPAN' );
	assert.equal( url.textContent, 'https://www.marshall.edu/whymu/' );
	assert.equal( form.querySelectorAll( '.link-wrap a[href^="http"]' ).length, 0 );
} );

test( 'the row itself opens ACF\'s link modal', () => {
	const form = build( linkField() );
	decorateLinks( form );

	const wrap = form.querySelector( '.link-wrap' );
	let edits = 0;
	// ACF binds the modal to this anchor; the row is only allowed to click it.
	form.querySelector( '[data-name="edit"]' ).addEventListener( 'click', () => edits++ );

	assert.equal( wrap.getAttribute( 'role' ), 'button' );
	assert.equal( wrap.getAttribute( 'tabindex' ), '0' );
	wrap.querySelector( '.link-title' ).dispatchEvent( new global.window.MouseEvent( 'click', { bubbles: true } ) );
	assert.equal( edits, 1 );

	wrap.dispatchEvent( new global.window.KeyboardEvent( 'keydown', { key: 'Enter', bubbles: true } ) );
	assert.equal( edits, 2 );
} );

test( 'clearing is still its own control, and never the row\'s click', () => {
	const form = build( linkField() );
	decorateLinks( form );

	let edits = 0;
	form.querySelector( '[data-name="edit"]' ).addEventListener( 'click', () => edits++ );
	const remove = form.querySelector( '[data-name="remove"]' );
	remove.dispatchEvent( new global.window.MouseEvent( 'click', { bubbles: true } ) );

	assert.equal( edits, 0 );
	assert.equal( remove.getAttribute( 'aria-label' ), 'Clear link' );
} );

test( 'every node ACF rewrites on a value change is still reachable', () => {
	const form = build( linkField() );
	decorateLinks( form );

	const link = form.querySelector( '.acf-link' );
	[ '.link-title', '.link-url', '.link-node', '.input-title', '.input-url', '.input-target', '[data-name="add"]', '[data-name="edit"]', '[data-name="remove"]' ]
		.forEach( ( sel ) => assert.ok( link.querySelector( sel ), `${ sel } is gone` ) );
} );

test( 'an empty field is left with ACF\'s add button and no row wiring', () => {
	const form = build( linkField( { value: false } ) );
	decorateLinks( form );

	const add = form.querySelector( '[data-name="add"]' );
	assert.equal( add.textContent.trim(), 'Choose a link' );
	assert.equal( add.classList.contains( 'button' ), false );
} );

test( 'the title and the URL are one block, and ACF still reaches both', () => {
	const form = build( linkField() );
	decorateLinks( form );

	const stack = form.querySelector( '.herd-link__text' );
	assert.ok( stack, 'the text stack is missing' );
	// ACF rewrites by descendant search from the field, so nesting is invisible
	// to it -- but only as long as both nodes are still inside the stack.
	assert.equal( stack.querySelector( '.link-title' ).textContent, 'Why Choose Marshall?' );
	assert.ok( stack.querySelector( '.link-url' ) );
	assert.equal( form.querySelectorAll( '.link-title' ).length, 1 );
	assert.equal( form.querySelectorAll( '.link-url' ).length, 1 );
} );

test( 'decorating twice leaves one glyph and one text stack', () => {
	const form = build( linkField() );
	decorateLinks( form );
	decorateLinks( form );

	assert.equal( form.querySelectorAll( '.link-wrap .herd-link__glyph' ).length, 1 );
	assert.equal( form.querySelectorAll( '.herd-link__text' ).length, 1 );
} );

/*
 * ACF duplicates a row by cloning its DOM, which copies the class, the glyph and
 * the row's `role="button"` but none of the listeners bound to them. Left alone,
 * the guard in decorateLinks would see the class and skip the row, and the chip
 * would hover and focus like a control and do nothing.
 */
test( 'a cloned chip comes apart and goes back together live', () => {
	const form = build( linkField() );
	decorateLinks( form );

	const copy = form.querySelector( '.acf-field' ).cloneNode( true );
	form.appendChild( copy );
	assert.equal( copy.querySelector( '.acf-link' ).classList.contains( 'herd-link' ), true );

	resetLinks( copy );
	const bare = copy.querySelector( '.link-wrap' );
	assert.equal( copy.querySelector( '.acf-link' ).classList.contains( 'herd-link' ), false );
	assert.equal( copy.querySelectorAll( '.herd-link__glyph' ).length, 0 );
	assert.equal( bare.getAttribute( 'role' ), null );
	assert.equal( bare.getAttribute( 'tabindex' ), null );

	decorateLinks( copy );
	let edits = 0;
	copy.querySelector( '[data-name="edit"]' ).addEventListener( 'click', () => edits++ );
	assert.equal( copy.querySelectorAll( '.link-wrap .herd-link__glyph' ).length, 1 );
	assert.equal( copy.querySelectorAll( '.herd-link__text' ).length, 1 );
	copy.querySelector( '.link-wrap' ).dispatchEvent( new global.window.MouseEvent( 'click', { bubbles: true } ) );
	assert.equal( edits, 1 );
} );

test( 'resetting a root with no decorated links is not an error', () => {
	const form = build( linkField( { value: false } ) );
	resetLinks( form );
	resetLinks( null );
	assert.equal( form.querySelectorAll( '.herd-link' ).length, 0 );
} );
