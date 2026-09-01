import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { beginSave, clearSettled, endSave, guardBusyClicks, reserveSaveWidth, setSaveLabel, settleSave, submitIntent, watchRestore } from '../src/save-progress.js';

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
const icon = ( win, selector ) => win.document.querySelector( `${ selector } [data-herd-save-icon]` );

/*
 * jsdom has no layout engine, so every offsetWidth it reports is 0. The width a
 * label needs is the whole point of reserveSaveWidth(), so the measurement is
 * injectable and the tests supply one: a character count, which orders the
 * labels exactly the way a real one would.
 */
const byLength = ( node ) => node.value.length;

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

test( 'the button says what it is doing, and wears a ring while it does it', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );

	assert.equal( byId( win, 'publish' ).value, 'Publishing…' );
	assert.equal( icon( win, '#publishing-action' ).className, 'herd-saveicon is-spinning' );
} );

/*
 * Core's spinner is an animated GIF sitting beside the button, and switching it
 * on and off is 20px of reserved space next to a control that has none to give.
 * The ring is laid over the button instead, so it is never switched on again.
 */
test( 'the spinner core printed is left switched off', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );

	assert.equal( win.document.querySelector( '#publishing-action .spinner' ).classList.contains( 'is-active' ), false );
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
test( 'the ring is built once and then reused', () => {
	const win = build();
	const button = byId( win, 'save-post' );
	beginSave( button );
	settleSave( 'saved' );
	beginSave( button );

	assert.equal( win.document.querySelectorAll( '#save-action [data-herd-save-icon]' ).length, 1 );
	assert.equal( icon( win, '#save-action' ).className, 'herd-saveicon is-spinning' );
} );

/*
 * The pass that resolves the intent reads the label, and by pass two the label is
 * "Publishing…", which no map has an entry for. Reading the face rather than the
 * record filed the rest of every publish under the generic verb.
 */
test( 'the passes of one publish all name the same action', () => {
	const win = build();
	const button = byId( win, 'publish' );

	assert.equal( beginSave( button ).label, 'Publishing…' );
	assert.equal( beginSave( button ).label, 'Publishing…' );
	assert.equal( beginSave( button ).saveState, 'saving' );
} );

/* ---------- relabelling a control that is mid-save ---------- */

/*
 * publish-box.js renames this button as the post's status changes, and one of
 * those renames lands mid-save: a draft adopts its published state from
 * herd:saved, which arrives while the button is still wearing "Publishing…" and
 * about to be restored from the record. A write to the face is overwritten by
 * that restore, and the button that had just published a page went back to
 * saying Publish.
 */
test( 'a button relabelled mid-save comes to rest at the new label', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );

	assert.equal( setSaveLabel( button, 'Update' ), true );
	assert.equal( button.value, 'Publishing…', 'the face still belongs to the save' );

	settleSave( 'saved' );
	assert.equal( button.value, 'Updated' );
	endSave( win );
	assert.equal( button.value, 'Update' );
} );

test( 'a button relabelled while it rests is relabelled outright', () => {
	const win = build();
	const button = byId( win, 'publish' );

	assert.equal( setSaveLabel( button, 'Update' ), true );
	assert.equal( button.value, 'Update' );
} );

/* refresh() runs on every keystroke in the publish box; remeasuring on each one
 * is work nobody asked for. */
test( 'relabelling to the word it already says is not a relabel', () => {
	const win = build();
	assert.equal( setSaveLabel( byId( win, 'publish' ), 'Publish' ), false );
	assert.equal( setSaveLabel( null, 'Publish' ), false );
} );

/* ---------- reserving the room, before anything is pressed ---------- */

/*
 * The jump this exists to remove. "Update" becoming "Updating…" widens an
 * <input type="submit">, and #publish is the last item in a right-pinned row, so
 * a button that grows shoves the View menu, the history pair and the status line
 * left and then pulls them back. Every label it will ever wear is measured up
 * front and the widest is reserved as a floor.
 */
test( 'the button reserves room for every label it will ever wear', () => {
	const win = build( screen( { publish: { name: 'save', value: 'Update' } } ) );
	const button = byId( win, 'publish' );

	reserveSaveWidth( button, byLength );

	// 'Updating…' is 9, 'Update' 6, 'Updated' 7, 'Not saved' 9 -- a tie at the top.
	assert.equal( button.style.minWidth, '9px' );
} );

test( 'the room reserved counts the answer as well as the wait', () => {
	const win = build();
	const button = byId( win, 'publish' );

	reserveSaveWidth( button, ( node ) => ( 'Published' === node.value ? 99 : 1 ) );

	assert.equal( button.style.minWidth, '99px' );
} );

/* Measuring at the press is measuring too late, so nothing here may move. */
test( 'a save in flight leaves the reserved room alone', () => {
	const win = build();
	const button = byId( win, 'publish' );
	reserveSaveWidth( button, byLength );
	const reserved = button.style.minWidth;

	beginSave( button );
	assert.equal( button.style.minWidth, reserved );
	settleSave( 'saved' );
	assert.equal( button.style.minWidth, reserved );
	endSave( win );
	assert.equal( button.style.minWidth, reserved );
} );

/*
 * publish-box.js calls this again on every relabel, and a draft that has just
 * been published is relabelled while it is still wearing "Publishing…".
 * Measuring what is on the face would reserve room for "Publishing……".
 */
test( 'remeasuring mid-save measures the label the button rests at', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );

	const seen = [];
	reserveSaveWidth( button, ( node ) => { seen.push( node.value ); return 1; } );

	assert.deepEqual( seen, [ 'Publish', 'Publishing…', 'Published', 'Not saved' ] );
} );

test( 'nothing that is not a save control is measured', () => {
	const win = build();
	assert.equal( reserveSaveWidth( null, byLength ), null );
	assert.equal( reserveSaveWidth( byId( win, 'post' ), byLength ), null );
} );

/*
 * The labels are tried on the real control, so the pass has to put it back
 * exactly as it found it -- including a control that was mid-save when
 * publish-box.js relabelled it, which is the case that actually happens.
 */
test( 'measuring a button leaves it saying what it was saying', () => {
	const win = build();
	const button = byId( win, 'publish' );
	reserveSaveWidth( button, byLength );

	assert.equal( button.value, 'Publish' );
	assert.equal( button.hasAttribute( 'aria-disabled' ), false );
} );

test( 'measuring a button mid-save leaves it mid-save', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );

	reserveSaveWidth( button, byLength );

	assert.equal( button.value, 'Publishing…' );
	assert.equal( button.getAttribute( 'aria-disabled' ), 'true' );
	assert.equal( button.dataset.herdBusy, '1' );
} );

/* A measurement that came back with nothing must not throw the floor away. */
test( 'a control that measures nothing keeps the room it already had', () => {
	const win = build();
	const button = byId( win, 'publish' );
	reserveSaveWidth( button, byLength );
	const reserved = button.style.minWidth;

	assert.equal( reserveSaveWidth( button, () => 0 ), null );
	assert.equal( button.style.minWidth, reserved );
} );

/* ---------- the answer, on the control that asked ---------- */

test( 'a finished publish says it published', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );
	settleSave( 'saved' );

	assert.equal( byId( win, 'publish' ).value, 'Published' );
	assert.equal( icon( win, '#publishing-action' ).className, 'herd-saveicon dashicons dashicons-yes' );
} );

test( 'a finished update says it updated', () => {
	const win = build( screen( { publish: { name: 'save', value: 'Update' } } ) );
	beginSave( byId( win, 'publish' ) );
	settleSave( 'saved' );

	assert.equal( byId( win, 'publish' ).value, 'Updated' );
} );

test( 'a finished draft save says it saved', () => {
	const win = build();
	beginSave( byId( win, 'save-post' ) );
	settleSave( 'saved' );

	assert.equal( byId( win, 'save-post' ).value, 'Saved' );
} );

/* There is no tense of "publish" that means it did not happen. */
test( 'a save that failed says so on the button that started it', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );
	settleSave( 'failed' );

	assert.equal( byId( win, 'publish' ).value, 'Not saved' );
	assert.equal( icon( win, '#publishing-action' ).className, 'herd-saveicon dashicons dashicons-warning' );
} );

/* The save is over. Whatever the face currently says, the control works again. */
test( 'a button reporting an outcome can be pressed again', () => {
	const win = build();
	const button = byId( win, 'publish' );
	guardBusyClicks( win.document );
	let submits = 0;
	byId( win, 'post' ).addEventListener( 'click', () => { submits += 1; } );

	beginSave( button );
	settleSave( 'saved' );

	assert.equal( button.hasAttribute( 'aria-disabled' ), false );
	button.click();
	assert.equal( submits, 1 );
} );

/*
 * The marker is what carries the pressed button's name into the FormData. A
 * press inside the confirmation window has to post the name that was pressed,
 * not the word the button happens to be wearing.
 */
test( 'a button reporting an outcome still posts the name that was pressed', () => {
	const win = build();
	beginSave( byId( win, 'publish' ) );
	settleSave( 'saved' );

	const marker = win.document.querySelector( '[data-herd-busy-marker]' );
	assert.equal( marker.name, 'publish' );
	assert.equal( marker.value, 'Publish' );
} );

/* Otherwise the button is restored to "Published" and stays there for good. */
test( 'pressing again during the confirmation restores the real label first', () => {
	const win = build();
	const button = byId( win, 'publish' );
	beginSave( button );
	settleSave( 'saved' );

	beginSave( button );

	assert.equal( button.value, 'Publishing…' );
	assert.equal( button.dataset.herdRestore, 'Publish' );
	assert.equal( win.document.querySelectorAll( '[data-herd-busy-marker]' ).length, 1 );
} );

/* One save getting out of the way of the next is not the bar coming to rest. */
test( 'clearing a confirmation early says nothing', () => {
	const win = build();
	let ended = 0;
	win.addEventListener( 'herd:save-ended', () => { ended += 1; } );
	beginSave( byId( win, 'publish' ) );
	settleSave( 'saved' );

	assert.equal( clearSettled(), 1 );
	assert.equal( byId( win, 'publish' ).value, 'Publish' );
	assert.equal( ended, 0 );
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
	assert.equal( icon( win, '#publishing-action' ), null );
} );

test( 'the confirmation comes off too, and that is what puts the bar at rest', () => {
	const win = build();
	const button = byId( win, 'publish' );
	let ended = 0;
	win.addEventListener( 'herd:save-ended', () => { ended += 1; } );

	beginSave( button );
	settleSave( 'saved' );
	assert.equal( endSave( win ), true );

	assert.equal( button.value, 'Publish' );
	assert.equal( button.dataset.herdSettled, undefined );
	assert.equal( icon( win, '#publishing-action' ), null );
	assert.equal( ended, 1 );
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

/* Including one handed back in the two seconds it was showing its answer. */
test( 'a page handed back mid-confirmation is not left confirming', () => {
	const win = build();
	watchRestore( win );
	beginSave( byId( win, 'publish' ) );
	settleSave( 'saved' );

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

/* It posts as a draft save, so the bar names it rather than saying nothing. */
test( 'a Return-key submission is a draft save', () => {
	assert.deepEqual(
		submitIntent( { id: 'herd-default-save', name: 'save', value: 'Save' } ),
		{ label: 'Saving…', saveState: 'saving-draft' }
	);
} );
