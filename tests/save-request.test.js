import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applySaveResult, buildSaveRequest, classifySaveResult, isPublishTransition } from '../src/save-request.js';
import { beginSave } from '../src/save-progress.js';

/*
 * The parts of form#post a save reads or writes, as
 * includes/herd-editor-screen.php prints them: the nonce under core's own
 * action, the identity fields, the lock token, and the serialized document in
 * the hidden #content input.
 *
 * The two submit controls are both here because core names them
 * inconsistently, and that inconsistency is the thing most of this file is
 * about: a published post's Update button carries id="publish" while posting
 * under the name `save`.
 */
const screen = ( { status = 'draft', autoDraft = '', updateButton = false } = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post" method="post" action="post.php">
    <input type="hidden" name="_wpnonce" value="oldnonce" />
    <input type="hidden" name="action" value="editpost" />
    <input type="hidden" id="post_ID" name="post_ID" value="42" />
    <input type="hidden" id="original_post_status" name="original_post_status" value="${ status }" />
    <input type="hidden" id="auto_draft" name="auto_draft" value="${ autoDraft }" />
    <input type="hidden" id="active_post_lock" name="active_post_lock" value="1000:7" />
    <input type="hidden" name="content" id="content" value="<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->" />
    <div id="publishing-action">
      <input type="submit" name="${ updateButton ? 'save' : 'publish' }" id="publish" value="${ updateButton ? 'Update' : 'Publish' }" />
    </div>
    <div id="save-action">
      <input type="submit" name="save" id="save-post" value="Save Draft" />
    </div>
  </form>
</div>`;

function build( markup, url = 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42' ) {
	const dom = new JSDOM( markup, { url } );
	global.document = dom.window.document;
	global.window = dom.window;
	global.FormData = dom.window.FormData;
	return dom.window;
}

/* ---------- which submissions ask the server to validate ---------- */

test( "an Update on a published post validates, though it posts under the name 'save'", () => {
	const win = build( screen( { status: 'publish', updateButton: true } ) );
	const update = win.document.getElementById( 'publish' );
	// The trap: by name alone this is indistinguishable from Save Draft.
	assert.equal( update.name, 'save' );
	assert.equal( isPublishTransition( update ), true );
} );

test( 'Save Draft does not validate', () => {
	const win = build( screen() );
	assert.equal( isPublishTransition( win.document.getElementById( 'save-post' ) ), false );
} );

test( 'Publish validates', () => {
	const win = build( screen() );
	assert.equal( isPublishTransition( win.document.getElementById( 'publish' ) ), true );
} );

test( 'an implicit submission, which names no submitter, does not validate', () => {
	build( screen() );
	assert.equal( isPublishTransition( null ), false );
	assert.equal( isPublishTransition( undefined ), false );
} );

/* ---------- the body that gets posted ---------- */

test( 'the request is addressed to the plugin, not to post.php', () => {
	const win = build( screen() );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), win.document.getElementById( 'publish' ) );
	assert.equal( body.get( 'action' ), 'herd_editor_save_post' );
} );

test( 'the whole screen travels: nonce, identity, lock and document', () => {
	const win = build( screen() );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), win.document.getElementById( 'publish' ) );
	assert.equal( body.get( '_wpnonce' ), 'oldnonce' );
	assert.equal( body.get( 'post_ID' ), '42' );
	assert.equal( body.get( 'active_post_lock' ), '1000:7' );
	assert.ok( body.get( 'content' ).includes( 'wp:paragraph' ) );
} );

test( "the pressed button's name is posted, carried by the marker beginSave leaves behind", () => {
	const win = build( screen() );
	const publish = win.document.getElementById( 'publish' );
	/*
	 * FormData does not include the submitter, which requestSubmit() used to do
	 * for us. beginSave() has already put a hidden input carrying the button's
	 * name and its original value into the form, so the ordering here -- dress
	 * first, build second -- is what makes `publish` arrive at all.
	 */
	beginSave( publish );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), publish );
	assert.equal( body.get( 'publish' ), 'Publish' );
} );

test( 'the busy label is never what posts', () => {
	const win = build( screen() );
	const publish = win.document.getElementById( 'publish' );
	beginSave( publish );
	assert.equal( publish.value, 'Publishing…' );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), publish );
	assert.equal( body.getAll( 'publish' ).includes( 'Publishing…' ), false );
} );

test( 'a validating save carries the block ids an error is traced back through', () => {
	const win = build( screen() );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), win.document.getElementById( 'publish' ), [ 'a1', 'b2' ] );
	assert.equal( body.get( 'herd_validate' ), '1' );
	assert.deepEqual( body.getAll( 'clientIds[]' ), [ 'a1', 'b2' ] );
} );

test( 'a draft save asks for no validation and sends no ids', () => {
	const win = build( screen() );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), win.document.getElementById( 'save-post' ), [ 'a1' ] );
	assert.equal( body.get( 'herd_validate' ), null );
	assert.deepEqual( body.getAll( 'clientIds[]' ), [] );
} );

/* ---------- what the answer does to the page ---------- */

const result = ( over = {} ) => ( {
	ok: true,
	postId: 42,
	postStatus: 'publish',
	nonce: 'freshnonce',
	lock: '2000:7',
	editUrl: 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42',
	...over,
} );

test( 'a renewed lock token is part of a successful save', () => {
	assert.equal( classifySaveResult( { ok: true, lock: '1788275595:1' } ), 'success' );
} );

test( 'a lock returned with a failed result is lock loss', () => {
	assert.equal( classifySaveResult( { ok: false, lock: 'stale' } ), 'lock' );
} );

test( 'the next save gets a fresh nonce and the renewed lock', () => {
	const win = build( screen() );
	applySaveResult( result(), { doc: win.document, win } );
	assert.equal( win.document.querySelector( 'input[name="_wpnonce"]' ).value, 'freshnonce' );
	assert.equal( win.document.getElementById( 'active_post_lock' ).value, '2000:7' );
} );

test( 'a consecutive save sends the renewed lock', () => {
	const win = build( screen() );
	applySaveResult( result(), { doc: win.document, win } );
	const body = buildSaveRequest( win.document.getElementById( 'post' ), win.document.getElementById( 'save-post' ) );
	assert.equal( body.get( 'active_post_lock' ), '2000:7' );
} );

test( 'the status the post was loaded with becomes the status it was saved with', () => {
	const win = build( screen( { status: 'draft' } ) );
	applySaveResult( result(), { doc: win.document, win } );
	assert.equal( win.document.getElementById( 'original_post_status' ).value, 'publish' );
} );

test( 'a saved auto-draft stops claiming to be one', () => {
	const win = build( screen( { status: 'auto-draft', autoDraft: '1' } ) );
	applySaveResult( result( { postStatus: 'draft' } ), { doc: win.document, win } );
	assert.equal( win.document.getElementById( 'auto_draft' ).value, '' );
} );

test( 'a post saved for the first time takes over the address bar', () => {
	const win = build( screen( { status: 'auto-draft', autoDraft: '1' } ), 'https://example.test/wp-admin/post-new.php?post_type=page' );
	applySaveResult( result( { postStatus: 'draft' } ), { doc: win.document, win } );
	const args = new win.URLSearchParams( win.location.search );
	assert.equal( args.get( 'page' ), 'herd-editor' );
	assert.equal( args.get( 'post' ), '42' );
} );

test( 'a save clears the message a previous page load was congratulated with', () => {
	const win = build( screen(), 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42&message=1&revision=9' );
	applySaveResult( result(), { doc: win.document, win } );
	assert.equal( win.location.search.includes( 'message' ), false );
	assert.equal( win.location.search.includes( 'revision' ), false );
} );

test( 'an unfinished save changes nothing', () => {
	const win = build( screen( { status: 'draft' } ) );
	applySaveResult( { ok: false, lock: 'stale' }, { doc: win.document, win } );
	assert.equal( win.document.querySelector( 'input[name="_wpnonce"]' ).value, 'oldnonce' );
	assert.equal( win.document.getElementById( 'original_post_status' ).value, 'draft' );
} );

test( 'a screen missing a field the answer names is not a failed save', () => {
	const win = build( '<form id="post"><input type="hidden" id="post_ID" value="42" /></form>' );
	assert.doesNotThrow( () => applySaveResult( result(), { doc: win.document, win } ) );
	assert.equal( win.document.getElementById( 'post_ID' ).value, '42' );
} );
