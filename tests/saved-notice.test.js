import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { wireSavedNotice } from '../src/rail.js';

/*
 * The shell around the notice, from includes/herd-editor-screen.php: the back
 * arrow the dismiss button hands focus to, and the notice itself with its
 * button shipped hidden so a bundle that never runs leaves no dead control.
 */
const screen = ( { notice = true } = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <header class="herd-bar">
      <a class="herd-bar__back" href="/wp-admin/edit.php?post_type=page">&larr;</a>
    </header>
    ${ notice ? `
    <div class="herd-notice is-info herd-saved" id="herd-saved">
      <p class="herd-saved__text">Page updated.</p>
      <a class="herd-saved__link" href="https://example.test/about/" target="_blank" rel="noopener">View page</a>
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
	assert.equal( win.document.getElementById( 'herd-saved' ), null );
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

test( 'survives a screen with nothing to confirm', () => {
	build( screen( { notice: false } ) );
	assert.doesNotThrow( wireSavedNotice );
} );
