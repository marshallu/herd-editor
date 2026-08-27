import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { wireSlugEditor } from '../src/rail.js';

/*
 * The slug line from includes/herd-editor-screen.php, in the state it ships in:
 * the input visible and both triggers hidden, so a bundle that never runs leaves
 * an editable slug rather than an unreachable one.
 */
const screen = ( { slug = 'counseling' } = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <header class="herd-bar">
      <p class="herd-bar__slug" id="herd-slug">
        <span class="herd-bar__slug-home">marshall.test/</span>
        <button type="button" class="herd-bar__slug-text" id="herd-slug-text" hidden>
          <span id="herd-slug-value">${ slug || 'slug' }</span>
          <span class="screen-reader-text">Edit the slug</span>
        </button>
        <label class="screen-reader-text" for="post_name">Slug</label>
        <input type="text" name="post_name" value="${ slug }" id="post_name" placeholder="slug" />
        <button type="button" class="herd-bar__slug-edit" id="herd-slug-edit" hidden>Edit</button>
      </p>
    </header>
  </form>
</div>`;

function build( markup ) {
	const dom = new JSDOM( markup, { url: 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42' } );
	global.document = dom.window.document;
	global.window = dom.window;
	return dom.window;
}

const press = ( win, node, key ) => {
	const event = new win.KeyboardEvent( 'keydown', { key, bubbles: true, cancelable: true } );
	node.dispatchEvent( event );
	return event;
};

test( 'the slug ships editable, so a bundle that never runs strands nobody', () => {
	const win = build( screen() );
	assert.equal( win.document.getElementById( 'herd-slug-text' ).hidden, true );
	assert.equal( win.document.getElementById( 'herd-slug-edit' ).hidden, true );
	assert.equal( win.document.getElementById( 'post_name' ).hidden, false );
} );

test( 'wiring inverts that: the slug reads as text until asked for', () => {
	const win = build( screen() );
	wireSlugEditor();
	assert.equal( win.document.getElementById( 'herd-slug-text' ).hidden, false );
	assert.equal( win.document.getElementById( 'herd-slug-edit' ).hidden, false );
	assert.equal( win.document.getElementById( 'post_name' ).hidden, true );
	assert.equal( win.document.getElementById( 'herd-slug-value' ).textContent, 'counseling' );
} );

test( 'the slug is its own edit control', () => {
	const win = build( screen() );
	wireSlugEditor();
	const button = win.document.getElementById( 'herd-slug-text' );
	const input = win.document.getElementById( 'post_name' );

	button.click();

	assert.equal( button.hidden, true );
	assert.equal( win.document.getElementById( 'herd-slug-edit' ).hidden, true );
	assert.equal( input.hidden, false );
	assert.equal( win.document.activeElement, input );
	assert.ok( win.document.getElementById( 'herd-slug' ).classList.contains( 'is-editing' ) );
} );

test( 'so is the Edit link beside it', () => {
	const win = build( screen() );
	wireSlugEditor();
	const input = win.document.getElementById( 'post_name' );

	win.document.getElementById( 'herd-slug-edit' ).click();

	assert.equal( input.hidden, false );
	assert.equal( win.document.activeElement, input );
} );

/* Leaving the field hands you back to the control you left from, not to a fixed one. */
test( 'focus returns to whichever trigger opened the field', () => {
	const win = build( screen() );
	wireSlugEditor();
	const slug = win.document.getElementById( 'herd-slug-text' );
	const edit = win.document.getElementById( 'herd-slug-edit' );
	const input = win.document.getElementById( 'post_name' );

	slug.click();
	press( win, input, 'Enter' );
	assert.equal( win.document.activeElement, slug );

	edit.click();
	press( win, input, 'Enter' );
	assert.equal( win.document.activeElement, edit );
} );

test( 'Enter finishes the field rather than submitting the post', () => {
	const win = build( screen() );
	wireSlugEditor();
	const button = win.document.getElementById( 'herd-slug-text' );
	const input = win.document.getElementById( 'post_name' );

	let submitted = false;
	win.document.getElementById( 'post' ).addEventListener( 'submit', () => {
		submitted = true;
	} );

	button.click();
	input.value = 'why-counseling';
	const event = press( win, input, 'Enter' );

	assert.equal( event.defaultPrevented, true );
	assert.equal( submitted, false );
	assert.equal( button.hidden, false );
	assert.equal( win.document.getElementById( 'herd-slug-value' ).textContent, 'why-counseling' );
	assert.equal( win.document.activeElement, button );
} );

test( 'Escape leaves the field the same way Enter does', () => {
	const win = build( screen() );
	wireSlugEditor();
	const button = win.document.getElementById( 'herd-slug-text' );
	const input = win.document.getElementById( 'post_name' );

	button.click();
	input.value = 'kept';
	press( win, input, 'Escape' );

	assert.equal( button.hidden, false );
	assert.equal( win.document.getElementById( 'herd-slug-value' ).textContent, 'kept' );
} );

test( 'blurring the input collapses it', () => {
	const win = build( screen() );
	wireSlugEditor();
	const input = win.document.getElementById( 'post_name' );

	win.document.getElementById( 'herd-slug-text' ).click();
	input.dispatchEvent( new win.Event( 'blur' ) );

	assert.equal( input.hidden, true );
	assert.equal( win.document.getElementById( 'herd-slug-text' ).hidden, false );
} );

test( 'an empty slug reads as its placeholder, not as nothing', () => {
	const win = build( screen( { slug: '' } ) );
	wireSlugEditor();
	assert.equal( win.document.getElementById( 'herd-slug-value' ).textContent, 'slug' );
} );

/*
 * The value is rewritten on every collapse. It lives in a span of its own so
 * that rewriting cannot take the Edit affordance beside it with it.
 */
test( 'rewriting the slug keeps the control saying what it is', () => {
	const win = build( screen() );
	wireSlugEditor();
	const button = win.document.getElementById( 'herd-slug-text' );

	button.click();
	win.document.getElementById( 'post_name' ).value = 'renamed';
	press( win, win.document.getElementById( 'post_name' ), 'Enter' );

	assert.match( button.textContent, /renamed/ );
	assert.match( button.textContent, /Edit the slug/ );
} );

test( 'a bar without a slug line is left alone', () => {
	build( '<div class="wrap herd-editor-screen"><form id="post"></form></div>' );
	assert.doesNotThrow( () => wireSlugEditor() );
} );
