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

/*
 * The watchdog and core's own throttling.
 *
 * Core drops its heartbeat to 120s the moment the window loses focus, and counts
 * five idle minutes as losing focus even while the window is frontmost
 * (heartbeat.js:512, :623). Its own note there -- "120 seconds. Post locks expire
 * after 150 seconds" -- is the margin it works to, so the watchdog has to measure
 * against the lock window rather than something shorter, or it condemns a lock
 * core is about to refresh on time.
 */
function watchdogFixture( { lockWindow = 150, focused = true, visibility = 'visible' } = {} ) {
	const { dom, handlers, $ } = fixture();
	const document = dom.window.document;
	document.hasFocus = () => focused;
	Object.defineProperty( document, 'visibilityState', { get: () => visibility, configurable: true } );

	let tick = null;
	let onFocus = null;
	const win = {
		jQuery: $,
		wp: { heartbeat: { interval() {} } },
		HerdEditor: { lockWindow },
		setInterval: ( callback ) => { tick = callback; return 1; },
		clearInterval: () => {},
		addEventListener: ( name, callback ) => { if ( name === 'focus' ) onFocus = callback; },
		removeEventListener: () => {},
		CustomEvent: dom.window.CustomEvent,
		dispatchEvent: () => true,
	};
	installPostLock( { document, window: win, $ } );
	return {
		document,
		handlers,
		run: () => tick && tick(),
		focus: () => onFocus && onFocus(),
		setFocused: ( value ) => { focused = value; },
		lost: () => document.getElementById( 'title' ).disabled,
	};
}

const atTime = ( ms, body ) => {
	const real = Date.now;
	Date.now = () => ms;
	try { body(); } finally { Date.now = real; }
};

test( 'the watchdog leaves a lock alone at core\'s throttled 120s beat', () => {
	const w = watchdogFixture();
	atTime( Date.now() + 120000, w.run );
	assert.equal( w.lost(), false );
} );

test( 'the watchdog condemns a lock once the lock window has passed', () => {
	const w = watchdogFixture();
	atTime( Date.now() + 151000, w.run );
	assert.equal( w.lost(), true );
} );

test( 'the watchdog stands down while the document is unfocused', () => {
	const w = watchdogFixture( { focused: false } );
	atTime( Date.now() + 600000, w.run );
	assert.equal( w.lost(), false );
} );

test( 'the watchdog stands down while the document is hidden', () => {
	const w = watchdogFixture( { visibility: 'hidden' } );
	atTime( Date.now() + 600000, w.run );
	assert.equal( w.lost(), false );
} );

test( 'coming back to the tab resets the clock rather than firing on the way in', () => {
	const w = watchdogFixture( { focused: false } );
	const returned = Date.now() + 600000;
	atTime( returned, () => {
		w.setFocused( true );
		w.focus();
		w.run();
	} );
	assert.equal( w.lost(), false );
} );

test( 'the watchdog measures against the window the server was given', () => {
	const w = watchdogFixture( { lockWindow: 600 } );
	atTime( Date.now() + 300000, w.run );
	assert.equal( w.lost(), false );
} );
