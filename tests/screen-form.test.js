import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Invariants about form#post itself.
 *
 * Read off includes/herd-editor-screen.php rather than a fixture, because a
 * fixture written here would only be asserting against itself. What can regress
 * is the real template: both of these are things the form has to contain, and
 * one of them is order-dependent.
 */
const screen = readFileSync( new URL( '../includes/herd-editor-screen.php', import.meta.url ), 'utf8' );
/*
 * Comments stripped first. This file explains itself at length, and every name
 * these tests look for is also written in prose a few lines above the code that
 * uses it -- so an assertion against the raw text passes on the explanation
 * alone, and goes on passing after the code it describes has been deleted.
 */
const code = ( text ) => text.replace( /\/\*[\s\S]*?\*\//g, '' ).replace( /^\s*\/\/.*$/gm, '' );
const form = code( screen.slice( screen.indexOf( '<form id="post"' ), screen.indexOf( '</form>' ) ) );

/*
 * ACF_Form_Post::save_post() opens with acf_verify_nonce( 'post' ) and returns
 * without writing anything when it fails. The nonce comes from acf_form_data(),
 * which on a post screen is only ever called by
 * ACF_Form_Post::edit_form_after_title() -- and that hook belongs to wp-admin's
 * edit-form-advanced.php, which this screen replaces. Without this call every
 * ACF field in a relocated meta box posts its value to a handler that discards
 * it, silently and with the post's modified date updated as if it had worked.
 */
test( 'the form carries the hidden inputs ACF needs to save a meta box', () => {
	assert.match( form, /acf_form_data\(/, 'no acf_form_data() call inside form#post' );
	assert.match( form, /'screen'\s*=>\s*'post'/ );
	assert.match( form, /'post_id'\s*=>\s*\$post->ID/ );
} );

/*
 * Off deliberately. This is ACF's *client-side* AJAX validation, and switching
 * it on hangs acf.validation's own submit handler off a form that already has
 * one in src/ui/App.js -- which preflights the lock, validates the document and
 * re-submits itself twice. The server validates a published post regardless.
 */
test( "ACF's own submit interception stays off", () => {
	assert.match( form, /'validation'\s*=>\s*false/ );
} );

/*
 * The control a browser clicks when Return is pressed in a text field is the
 * first submit in tree order, and every single-line field on this screen -- the
 * title, and every ACF field in every mounted block panel -- is inside this
 * form. src/rail.js lifts #publishing-action into the command bar, which is
 * above the rail core's own hidden Save travels to, so Publish took the position
 * and Return published the post.
 */
test( 'the screen puts a default Save ahead of the lifted publish button', () => {
	const fallback = form.indexOf( 'id="herd-default-save"' );
	const bar = form.indexOf( 'id="herd-bar-native"' );

	assert.notEqual( fallback, -1, 'the default submit button is gone' );
	assert.ok( fallback < bar, 'Publish is lifted into #herd-bar-native, so the default Save has to come first' );
	assert.match( form.slice( fallback - 120, fallback ), /type="submit" name="save"/ );
} );
