import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installPostLock } from '../src/post-lock.js';

function fixture() {
	const dom = new JSDOM( '<form id="post"><input id="post_ID" value="42"><input id="active_post_lock" name="active_post_lock" value="10:7"><input id="title"><button id="publish">Update</button></form><div id="post-lock-dialog" class="hidden"><div class="post-taken-over"><div class="post-locked-avatar"></div><p class="wp-tab-first" tabindex="0"><span class="currently-editing"></span></p><p><a class="button button-primary wp-tab-last" href="/wp-admin/edit.php">Posts</a></p></div></div>' );
	const handlers = {};
	const $ = () => ( {
		on: ( name, callback ) => { handlers[ name ] = callback; return $( dom.window.document ); },
		off: () => $( dom.window.document ),
	} );
	return { dom, handlers, $ };
}

test( 'post lock heartbeat refreshes the active token', () => {
	const { dom, handlers, $ } = fixture();
	installPostLock( { document: dom.window.document, window: { jQuery: $, wp: { heartbeat: { interval() {} } } }, $ } );
	const sent = {};
	handlers['heartbeat-send.herd-post-lock']( null, sent );
	assert.deepEqual( sent['wp-refresh-post-lock'], { post_id: '42', lock: '10:7' } );
	handlers['heartbeat-tick.herd-post-lock']( null, { 'wp-refresh-post-lock': { new_lock: '11:7' } } );
	assert.equal( dom.window.document.getElementById( 'active_post_lock' ).value, '11:7' );
} );

test( 'lock loss disables the form, rejects submits, and shows the core dialog', () => {
	const { dom, handlers, $ } = fixture();
	installPostLock( { document: dom.window.document, window: { jQuery: $, wp: { heartbeat: { interval() {} } } }, $ } );
	handlers['heartbeat-tick.herd-post-lock']( null, { 'wp-refresh-post-lock': { lock_error: { text: 'Ada has taken over.' } } } );
	const document = dom.window.document;
	assert.equal( document.getElementById( 'title' ).disabled, true );
	assert.equal( document.getElementById( 'publish' ).disabled, true );
	assert.equal( document.getElementById( 'post-lock-dialog' ).style.display, 'block' );
	assert.equal( document.querySelector( '.currently-editing' ).textContent, 'Ada has taken over.' );
	assert.equal( document.getElementById( 'post' ).dispatchEvent( new dom.window.Event( 'submit', { cancelable: true } ) ), false );
} );
