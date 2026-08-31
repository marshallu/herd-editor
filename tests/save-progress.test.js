import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beginSave, endSave, guardBusyClicks, submitIntent, watchRestore } from '../src/save-progress.js';

/*
 * The two submit actions as WordPress prints them, in the places src/rail.js
 * leaves them: #publishing-action lifted into the command bar, #save-action
 * still in the rail. Both ship a spinner core never switches on, and the
 * published-post shape of the Update button -- name="save", id="publish",
 * meta-boxes.php:401 -- is the case that decides whether the resolver is right.
 */
const screen = ( { publish = { name: 'publish', value: 'Publish' } } = {} ) => `
<form id="post">
  <span id="herd-bar-native">
    <div id="publishing-action">
      <span class="spinner"></span>
      <input type="submit" name="${ publish.name }" id="publish" class="button button-primary" value="${ publish.value }" />
    </div>
  </span>
  <div id="save-action">
    <input type="submit" name="save" id="save-post" value="Save Draft" class="button" />
    <span class="spinner"></span>
  </div>
</form>`;

function build( markup = screen() ) {
	const dom = new JSDOM( markup, { url: 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42' } );
	global.document = dom.window.document;
	global.window = dom.window;
	return dom.window;
}
const byId = ( win, id ) => win.document.getElementById( id );
const spinning = ( win, selector ) => win.document.querySelector( selector ).classList.contains( 'is-active' );

/* ---------- what a control should say about itself ---------- */

test( 'the publish button names the action it started, in the tense it started it', () => {
	assert.equal( submitIntent( { id: 'publish', name: 'publish', value: 'Publish' } ).label, 'Publishing…' );
	assert.equal( submitIntent( { id: 'publish', name: 'publish', value: 'Schedule' } ).label, 'Scheduling…' );
	assert.equal( submitIntent( { id: 'publish', name: 'publish', value: 'Submit for Review' } ).label, 'Submitting for review…' );
} );

/*
 * The one that matters. Core gives a published post's Update button name="save"
 * and id="publish", so a resolver that reads the name first files every Update
 * on the site under Save draft -- wrong label, wrong save state, and no sign of
 * it until somebody updates a published page.
 */
test( 'an Update on a published post is a publish, not a draft save', () => {
	const intent = submitIntent( { id: 'publish', name: 'save', value: 'Update' } );
	assert.equal( intent.label, 'Updating…' );
	assert.equal( intent.saveState, 'saving' );
} );

test( 'Save draft and the hidden Enter button are draft saves', () => {
	assert.deepEqual( submitIntent( { id: 'save-post', name: 'save', value: 'Save Draft' } ), { label: 'Saving…', saveState: 'saving-draft' } );
	assert.deepEqual( submitIntent( { id: 'save', name: 'save', value: 'Save' } ), { label: 'Saving…', saveState: 'saving-draft' } );
} );

test( 'a translated button falls back to the generic verb rather than to nonsense', () => {
	assert.equal( submitIntent( { id: 'publish', name: 'publish', value: 'Publier' } ).label, 'Saving…' );
} );

/* An implicit submission names no submitter, and Preview and Trash are links. */
test( 'anything that is not a save control is left alone', () => {
	assert.equal( submitIntent( null ), null );
	assert.equal( submitIntent( undefined ), null );
	assert.equal( submitIntent( { id: 'post-preview', name: '', value: 'Preview' } ), null );
} );

/* ---------- dressing the control ---------- */

test( 'the button says what it is doing, and the spinner core printed starts spinning', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );

	assert.equal( byId( win, 'publish' ).value, 'Publishing…' );
	assert.equal( spinning( win, '#publishing-action .spinner' ), true );
} );

/*
 * aria-disabled rather than the property: a disabled control is dropped from the
 * entry list, taking event.submitter with it -- and the handler re-enters itself
 * twice before the form ever posts, reading the submitter each time.
 */
test( 'the button stays in the form, marked busy rather than disabled', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );

	assert.equal( byId( win, 'publish' ).getAttribute( 'aria-disabled' ), 'true' );
	assert.equal( byId( win, 'publish' ).disabled, false );
} );

test( 'what gets posted is what was pressed, not the label it now wears', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );

	const marker = win.document.querySelector( '[data-herd-busy-marker]' );
	assert.equal( marker.name, 'publish' );
	assert.equal( marker.value, 'Publish' );
	// After the button, so a duplicate name resolves to the original on the server.
	assert.ok( button.compareDocumentPosition( marker ) & win.Node.DOCUMENT_POSITION_FOLLOWING );
} );

/* Building a second one is what used to leave #save-action with two spinners. */
test( 'core spinner is reused, never duplicated', () => {
	const win = build();
	beginSave( byId( win, 'save-post' ) );

	assert.equal( win.document.querySelectorAll( '#save-action .spinner' ).length, 1 );
	assert.equal( spinning( win, '#save-action .spinner' ), true );
} );

/* A publish re-enters the submit handler twice before the form posts. */
test( 'the three passes of one publish dress the button once', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );
	beginSave( button );
	beginSave( button );

	assert.equal( win.document.querySelectorAll( '[data-herd-busy-marker]' ).length, 1 );
	assert.equal( button.value, 'Publishing…' );
	assert.equal( button.dataset.herdRestore, 'Publish' );
} );

test( 'nothing to dress is not an error', () => {
	const win = build();
	assert.equal( beginSave( null ), null );
	assert.equal( win.document.querySelector( '[data-herd-busy-marker]' ), null );
} );

/* ---------- taking it back off ---------- */

test( 'a rejected submission gives the button back whole', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );
	endSave( win );

	assert.equal( button.value, 'Publish' );
	assert.equal( button.hasAttribute( 'aria-disabled' ), false );
	assert.equal( button.dataset.herdBusy, undefined );
	assert.equal( win.document.querySelector( '[data-herd-busy-marker]' ), null );
	assert.equal( spinning( win, '#publishing-action .spinner' ), false );
} );

test( 'it says so once, so the command bar has one place to come to rest', () => {
	const win = build();
	let ended = 0;
	win.addEventListener( 'herd:save-ended', () => { ended += 1; } );

	beginSave( byId( win, 'publish' ) );
	assert.equal( endSave( win ), true );
	assert.equal( endSave( win ), false );
	assert.equal( ended, 1 );
} );

/*
 * post-lock.js disables every control in the form when ownership is lost.
 * Handing back a live Publish on a post somebody else is now editing would be
 * worse than the stuck label this is here to clear.
 */
test( 'it restores the label but never the right to press it', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );
	button.disabled = true;
	endSave( win );

	assert.equal( button.value, 'Publish' );
	assert.equal( button.disabled, true );
} );

/* ---------- a second press, and a page handed back ---------- */

test( 'a second press while the first is still running goes nowhere', () => {
	const win = build();
	const button = byId( win, 'publish' );
	guardBusyClicks( win.document );
	let submits = 0;
	byId( win, 'post' ).addEventListener( 'click', () => { submits += 1; } );

	button.click();
	assert.equal( submits, 1 );

	beginSave( button );
	button.click();
	assert.equal( submits, 1, 'the press should not have reached the form' );
} );

/*
 * The heap comes back whole: a button still reading "Publishing…" and -- the
 * part that is not merely cosmetic -- the hidden marker still in form#post,
 * ready to post a second name alongside whatever is pressed next.
 */
test( 'a page handed back by the browser is not still mid-publish', () => {
	const win = build();
	watchRestore( win );
	beginSave( byId( win, 'publish' ) );

	win.dispatchEvent( new win.PageTransitionEvent( 'pageshow', { persisted: true } ) );

	assert.equal( byId( win, 'publish' ).value, 'Publish' );
	assert.equal( win.document.querySelector( '[data-herd-busy-marker]' ), null );
} );

test( 'a page that was never saving is left alone', () => {
	const win = build();
	watchRestore( win );
	let ended = 0;
	win.addEventListener( 'herd:save-ended', () => { ended += 1; } );

	win.dispatchEvent( new win.PageTransitionEvent( 'pageshow', { persisted: false } ) );

	assert.equal( ended, 0 );
	assert.equal( byId( win, 'publish' ).value, 'Publish' );
} );

/* ---------- the form's default button ---------- */

/*
 * The control a browser clicks when Return is pressed in a text field is the
 * first submit in tree order, and every single-line field on this screen -- the
 * title, and every ACF field in every mounted block panel -- is inside form#post.
 *
 * Core keeps that safe with a hidden Save at the top of post_submit_meta_box().
 * src/rail.js lifts #publishing-action into the command bar, which is above the
 * rail core's copy travels to, so Publish took the position and Return published
 * the post. herd-editor-screen.php restores the guarantee where the form starts.
 *
 * Read off the template rather than a fixture, because a fixture written here
 * would only be asserting against itself -- the thing that can regress is the
 * order of the real thing.
 */
test( 'the screen puts a default Save ahead of the lifted publish button', () => {
	const screenTemplate = readFileSync( new URL( '../includes/herd-editor-screen.php', import.meta.url ), 'utf8' );
	const fallback = screenTemplate.indexOf( 'id="herd-default-save"' );
	const bar = screenTemplate.indexOf( 'id="herd-bar-native"' );

	assert.notEqual( fallback, -1, 'the default submit button is gone' );
	assert.ok( fallback < bar, 'Publish is lifted into #herd-bar-native, so the default Save has to come first' );
	assert.match( screenTemplate.slice( fallback - 120, fallback ), /type="submit" name="save"/ );
} );

/* It posts as a draft save, so the bar names it rather than saying nothing. */
test( 'a Return-key submission is a draft save', () => {
	assert.deepEqual(
		submitIntent( { id: 'herd-default-save', name: 'save', value: 'Save' } ),
		{ label: 'Saving…', saveState: 'saving-draft' }
	);
} );
