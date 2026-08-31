import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { wireSavedNotice } from '../src/rail.js';

/*
 * The shell around the notice, from includes/herd-editor-screen.php: the back
 * arrow the dismiss button hands focus to, and the notice itself with its
 * button shipped hidden so a bundle that never runs leaves no dead control.
 */
const screen = ( { notice = true, shell = true } = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <header class="herd-bar">
      <a class="herd-bar__back" href="/wp-admin/edit.php?post_type=page">&larr;</a>
    </header>
    ${ shell ? `
    <div class="herd-notice is-info herd-saved" id="herd-saved" role="status"${ notice ? '' : ' hidden' }>
      <p class="herd-saved__text">${ notice ? 'Page updated.' : '' }</p>
      <a class="herd-saved__link" href="${ notice ? 'https://example.test/about/' : '#' }" target="_blank" rel="noopener"${ notice ? '' : ' hidden' }>
        <span class="herd-saved__link-text">${ notice ? 'View page' : '' }</span>
        <span class="dashicons dashicons-external" aria-hidden="true"></span>
        <span class="screen-reader-text">, opens in a new tab</span>
      </a>
      <button type="button" class="herd-saved__dismiss" id="herd-saved-dismiss" aria-label="Dismiss this notice" hidden></button>
    </div>` : '' }
    <div class="herd-cols"></div>
  </form>
</div>`;

function build( markup, search = '?page=herd-editor&post=42&message=1' ) {
	const dom = new JSDOM( markup, { url: `https://example.test/wp-admin/admin.php${ search }` } );
	global.document = dom.window.document;
	global.window = dom.window;
	return dom.window;
}

test( 'the dismiss button stays hidden until the bundle wires it', () => {
	const win = build( screen() );
	assert.equal( win.document.getElementById( 'herd-saved-dismiss' ).hidden, true );
	wireSavedNotice();
	assert.equal( win.document.getElementById( 'herd-saved-dismiss' ).hidden, false );
} );

test( 'dismissing takes the notice off the screen', () => {
	const win = build( screen() );
	wireSavedNotice();
	win.document.getElementById( 'herd-saved-dismiss' ).click();
	// Hidden rather than gone: the next save has to have something to fill in.
	assert.equal( win.document.getElementById( 'herd-saved' ).hidden, true );
} );

test( 'dismissing takes the message out of the URL, so a reload does not repeat it', () => {
	const win = build( screen(), '?page=herd-editor&post=42&message=5&revision=99' );
	wireSavedNotice();
	win.document.getElementById( 'herd-saved-dismiss' ).click();
	assert.equal( win.location.search.includes( 'message' ), false );
	assert.equal( win.location.search.includes( 'revision' ), false );
} );

test( 'the args that say which post this is survive the dismissal', () => {
	const win = build( screen() );
	wireSavedNotice();
	win.document.getElementById( 'herd-saved-dismiss' ).click();
	const args = new win.URLSearchParams( win.location.search );
	assert.equal( args.get( 'page' ), 'herd-editor' );
	assert.equal( args.get( 'post' ), '42' );
} );

test( 'dismissing hands focus back up the page rather than dropping it', () => {
	const win = build( screen() );
	wireSavedNotice();
	win.document.getElementById( 'herd-saved-dismiss' ).click();
	assert.equal( win.document.activeElement.className, 'herd-bar__back' );
} );

test( 'survives a screen with no notice in it at all', () => {
	build( screen( { shell: false } ) );
	assert.doesNotThrow( wireSavedNotice );
} );

/*
 * A Herd save does not reload the screen, so the confirmation arrives as the
 * `notice` of a herd:saved event rather than as part of a fresh document.
 */
const saved = ( win, notice ) => win.dispatchEvent( new win.CustomEvent( 'herd:saved', { detail: { notice } } ) );

test( 'a save fills in and reveals a notice the page loaded without', () => {
	const win = build( screen( { notice: false } ), '?page=herd-editor&post=42' );
	wireSavedNotice();
	saved( win, { text: 'Page published.', label: 'View page', url: 'https://example.test/about/' } );
	const notice = win.document.getElementById( 'herd-saved' );
	assert.equal( notice.hidden, false );
	assert.equal( notice.querySelector( '.herd-saved__text' ).textContent, 'Page published.' );
	const link = notice.querySelector( '.herd-saved__link' );
	assert.equal( link.hidden, false );
	assert.equal( link.getAttribute( 'href' ), 'https://example.test/about/' );
	assert.equal( link.querySelector( '.herd-saved__link-text' ).textContent, 'View page' );
} );

test( 'the dashicon and the new-tab warning survive being filled in', () => {
	const win = build( screen( { notice: false } ) );
	wireSavedNotice();
	saved( win, { text: 'Page updated.', label: 'View page', url: 'https://example.test/about/' } );
	const link = win.document.getElementById( 'herd-saved' ).querySelector( '.herd-saved__link' );
	assert.ok( link.querySelector( '.dashicons-external' ) );
	assert.equal( link.querySelector( '.screen-reader-text' ).textContent, ', opens in a new tab' );
} );

test( 'a save with nowhere to send anyone shows the sentence and no link', () => {
	const win = build( screen( { notice: false } ) );
	wireSavedNotice();
	saved( win, { text: 'Page draft updated.', label: '', url: '' } );
	const notice = win.document.getElementById( 'herd-saved' );
	assert.equal( notice.hidden, false );
	assert.equal( notice.querySelector( '.herd-saved__text' ).textContent, 'Page draft updated.' );
	assert.equal( notice.querySelector( '.herd-saved__link' ).hidden, true );
} );

test( 'a save brings back a notice that was dismissed', () => {
	const win = build( screen() );
	wireSavedNotice();
	win.document.getElementById( 'herd-saved-dismiss' ).click();
	assert.equal( win.document.getElementById( 'herd-saved' ).hidden, true );
	saved( win, { text: 'Page updated.', label: '', url: '' } );
	assert.equal( win.document.getElementById( 'herd-saved' ).hidden, false );
} );

test( 'the notice is re-inserted, so role="status" reports a second save too', () => {
	const win = build( screen( { notice: false } ) );
	wireSavedNotice();
	const before = win.document.getElementById( 'herd-saved' );
	const parent = before.parentNode;
	const index = Array.from( parent.children ).indexOf( before );
	saved( win, { text: 'Page updated.', label: '', url: '' } );
	const after = win.document.getElementById( 'herd-saved' );
	// Same node, same place -- but taken out and put back, which is the change a
	// live region reports.
	assert.equal( after, before );
	assert.equal( Array.from( parent.children ).indexOf( after ), index );
} );

test( 'a save that says nothing leaves the notice alone', () => {
	const win = build( screen( { notice: false } ) );
	wireSavedNotice();
	saved( win, null );
	assert.equal( win.document.getElementById( 'herd-saved' ).hidden, true );
} );
