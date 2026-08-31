import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { wirePublishBox } from '../src/publish-box.js';

/*
 * WordPress's own publish box, as post_submit_meta_box() and touch_time() print
 * it, inside the rail panel src/rail.js moves it to. The three panels ship
 * hidden under `hide-if-js`, which is what makes the Edit links dead until
 * something wires them.
 *
 * The date fields describe a draft saved on 31 Aug 2026 at 12:33, with "now"
 * pinned to the same minute so a test can move the date either side of it.
 */
const screen = ( {
	status = 'draft',
	visibility = 'public',
	stamp = 'Publish <b>immediately</b>',
	postType = 'page',
} = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <input type="hidden" id="original_post_status" name="original_post_status" value="${ status }" />
    <span id="herd-bar-native">
      <div id="publishing-action">
        <span class="spinner is-active"></span>
        <input type="submit" name="publish" id="publish" class="button button-primary" value="Publish" />
      </div>
    </span>
    <div class="herd-rail__panel" data-panel="page" id="herd-panel-page">
      <div id="submitdiv" class="postbox"><div class="inside"><div class="submitbox" id="submitpost">
        <div id="minor-publishing-actions">
          <div id="save-action">
            <input type="submit" name="save" id="save-post" value="Save Draft" class="button" />
          </div>
        </div>
        <div id="misc-publishing-actions">
          <div class="misc-pub-section misc-pub-post-status">
            Status: <span id="post-status-display">Draft</span>
            <a href="#post_status" class="edit-post-status hide-if-no-js" role="button">Edit</a>
            <div id="post-status-select" class="hide-if-js">
              <input type="hidden" name="hidden_post_status" id="hidden_post_status" value="${ status }" />
              <select name="post_status" id="post_status">
                ${ status === 'publish' ? "<option value='publish' selected>Published</option>" : '' }
                <option value="pending">Pending Review</option>
                <option value="draft"${ status === 'publish' ? '' : ' selected' }>Draft</option>
              </select>
              <a href="#post_status" class="save-post-status hide-if-no-js button">OK</a>
              <a href="#post_status" class="cancel-post-status hide-if-no-js button-cancel">Cancel</a>
            </div>
          </div>

          <div class="misc-pub-section misc-pub-visibility" id="visibility">
            Visibility: <span id="post-visibility-display">Public</span>
            <a href="#visibility" class="edit-visibility hide-if-no-js" role="button">Edit</a>
            <div id="post-visibility-select" class="hide-if-js">
              <input type="hidden" name="hidden_post_password" id="hidden-post-password" value="" />
              ${ postType === 'post' ? '<input type="checkbox" style="display:none" name="hidden_post_sticky" id="hidden-post-sticky" value="sticky" />' : '' }
              <input type="hidden" name="hidden_post_visibility" id="hidden-post-visibility" value="${ visibility }" />
              <input type="radio" name="visibility" id="visibility-radio-public" value="public" ${ visibility === 'public' ? 'checked' : '' } />
              <label for="visibility-radio-public" class="selectit">Public</label>
              ${ postType === 'post' ? '<span id="sticky-span"><input id="sticky" name="sticky" type="checkbox" value="sticky" /> <label for="sticky" class="selectit">Stick this post to the front page</label></span>' : '' }
              <input type="radio" name="visibility" id="visibility-radio-password" value="password" ${ visibility === 'password' ? 'checked' : '' } />
              <label for="visibility-radio-password" class="selectit">Password protected</label>
              <span id="password-span"><label for="post_password">Password:</label> <input type="text" name="post_password" id="post_password" value="" /></span>
              <input type="radio" name="visibility" id="visibility-radio-private" value="private" ${ visibility === 'private' ? 'checked' : '' } />
              <label for="visibility-radio-private" class="selectit">Private</label>
              <p>
                <a href="#visibility" class="save-post-visibility hide-if-no-js button">OK</a>
                <a href="#visibility" class="cancel-post-visibility hide-if-no-js button-cancel">Cancel</a>
              </p>
            </div>
          </div>

          <div class="misc-pub-section curtime misc-pub-curtime">
            <span id="timestamp">${ stamp }</span>
            <a href="#edit_timestamp" class="edit-timestamp hide-if-no-js" role="button">Edit</a>
            <fieldset id="timestampdiv" class="hide-if-js">
              <div class="timestamp-wrap">
                <select id="mm" name="mm">
                  <option value="08" data-text="Aug" selected>08-Aug</option>
                  <option value="09" data-text="Sep">09-Sep</option>
                  <option value="02" data-text="Feb">02-Feb</option>
                </select>
                <input type="text" id="jj" name="jj" value="31" />
                <input type="text" id="aa" name="aa" value="2026" />
                <input type="text" id="hh" name="hh" value="12" />
                <input type="text" id="mn" name="mn" value="33" />
              </div>
              <input type="hidden" id="hidden_mm" name="hidden_mm" value="08" />
              <input type="hidden" id="cur_mm" name="cur_mm" value="08" />
              <input type="hidden" id="hidden_jj" name="hidden_jj" value="31" />
              <input type="hidden" id="cur_jj" name="cur_jj" value="31" />
              <input type="hidden" id="hidden_aa" name="hidden_aa" value="2026" />
              <input type="hidden" id="cur_aa" name="cur_aa" value="2026" />
              <input type="hidden" id="hidden_hh" name="hidden_hh" value="12" />
              <input type="hidden" id="cur_hh" name="cur_hh" value="12" />
              <input type="hidden" id="hidden_mn" name="hidden_mn" value="33" />
              <input type="hidden" id="cur_mn" name="cur_mn" value="33" />
              <p>
                <a href="#edit_timestamp" class="save-timestamp hide-if-no-js button">OK</a>
                <a href="#edit_timestamp" class="cancel-timestamp hide-if-no-js button-cancel">Cancel</a>
              </p>
            </fieldset>
          </div>
        </div>
      </div></div></div>
    </div>
  </form>
</div>`;

function build( markup ) {
	const dom = new JSDOM( markup, { url: 'https://example.test/wp-admin/admin.php?page=herd-editor&post=42' } );
	global.document = dom.window.document;
	global.window = dom.window;
	return dom.window;
}

const byId = ( win, id ) => win.document.getElementById( id );
const open = ( win, id ) => ! byId( win, id ).classList.contains( 'hide-if-js' );
const click = ( win, selector ) => win.document.querySelector( selector ).click();

test( 'the panels ship hidden, which is why the Edit links looked dead', () => {
	const win = build( screen() );
	[ 'post-status-select', 'post-visibility-select', 'timestampdiv' ].forEach( ( id ) => {
		assert.equal( open( win, id ), false );
	} );
} );

test( 'Edit opens the status panel, and takes the link away while it is open', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-post-status' );

	assert.equal( open( win, 'post-status-select' ), true );
	assert.equal( win.document.querySelector( '.edit-post-status' ).style.display, 'none' );
	assert.equal( win.document.activeElement.id, 'post_status' );
} );

test( 'OK on the status panel repeats the choice on the summary line', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-post-status' );
	byId( win, 'post_status' ).value = 'pending';
	click( win, '.save-post-status' );

	assert.equal( open( win, 'post-status-select' ), false );
	assert.equal( byId( win, 'post-status-display' ).textContent, 'Pending Review' );
	assert.equal( byId( win, 'save-post' ).value, 'Save as Pending' );
	assert.equal( win.document.activeElement, win.document.querySelector( '.edit-post-status' ) );
} );

test( 'Cancel puts the status back where it was', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-post-status' );
	byId( win, 'post_status' ).value = 'pending';
	click( win, '.cancel-post-status' );

	assert.equal( byId( win, 'post_status' ).value, 'draft' );
	assert.equal( byId( win, 'post-status-display' ).textContent, 'Draft' );
	assert.equal( byId( win, 'save-post' ).value, 'Save Draft' );
} );

test( 'the visibility panel opens with the sub-fields its choice allows', () => {
	const win = build( screen( { postType: 'post' } ) );
	wirePublishBox();

	click( win, '.edit-visibility' );

	assert.equal( open( win, 'post-visibility-select' ), true );
	assert.equal( byId( win, 'sticky-span' ).style.display, '' );
	assert.equal( byId( win, 'password-span' ).style.display, 'none' );

	byId( win, 'visibility-radio-password' ).checked = true;
	byId( win, 'visibility-radio-password' ).dispatchEvent( new win.Event( 'change', { bubbles: true } ) );

	assert.equal( byId( win, 'sticky-span' ).style.display, 'none' );
	assert.equal( byId( win, 'password-span' ).style.display, '' );
} );

test( 'choosing Private settles the status with it', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-visibility' );
	byId( win, 'visibility-radio-private' ).checked = true;
	click( win, '.save-post-visibility' );

	assert.equal( byId( win, 'post-visibility-display' ).textContent, 'Private' );
	assert.equal( byId( win, 'post_status' ).value, 'publish' );
	assert.equal( byId( win, 'post-status-display' ).textContent, 'Privately Published' );
	assert.equal( byId( win, 'publish' ).value, 'Update' );
	// There is no status left to choose, so the line stops offering one.
	assert.equal( win.document.querySelector( '.edit-post-status' ).style.display, 'none' );
	assert.equal( byId( win, 'save-post' ).style.display, 'none' );
} );

test( 'Cancel on visibility restores the radio, the password and the line', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-visibility' );
	byId( win, 'visibility-radio-password' ).checked = true;
	byId( win, 'post_password' ).value = 'hunter2';
	click( win, '.cancel-post-visibility' );

	assert.equal( byId( win, 'visibility-radio-public' ).checked, true );
	assert.equal( byId( win, 'post_password' ).value, '' );
	assert.equal( byId( win, 'post-visibility-display' ).textContent, 'Public' );
	assert.equal( open( win, 'post-visibility-select' ), false );
} );

test( 'a date in the future turns Publish into Schedule', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'aa' ).value = '2027';
	click( win, '.save-timestamp' );

	assert.equal( open( win, 'timestampdiv' ), false );
	assert.equal( byId( win, 'publish' ).value, 'Schedule' );
	assert.equal( byId( win, 'timestamp' ).textContent, 'Schedule for: Aug 31, 2027 at 12:33' );
} );

test( 'a published post keeps saying Published on, and Update', () => {
	const win = build( screen( { status: 'publish', stamp: 'Published on: <b>Aug 31, 2026 at 12:33</b>' } ) );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'jj' ).value = '30';
	click( win, '.save-timestamp' );

	assert.equal( byId( win, 'publish' ).value, 'Update' );
	assert.equal( byId( win, 'timestamp' ).textContent, 'Published on: Aug 30, 2026 at 12:33' );
} );

test( 'a date edited back to where it started gets its own sentence back', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'jj' ).value = '30';
	click( win, '.save-timestamp' );
	click( win, '.edit-timestamp' );
	byId( win, 'jj' ).value = '31';
	click( win, '.save-timestamp' );

	assert.equal( byId( win, 'timestamp' ).innerHTML, 'Publish <b>immediately</b>' );
} );

test( 'Cancel on the date puts all five fields back', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'mm' ).value = '09';
	byId( win, 'jj' ).value = '01';
	byId( win, 'hh' ).value = '09';
	click( win, '.cancel-timestamp' );

	assert.deepEqual(
		[ 'mm', 'jj', 'aa', 'hh', 'mn' ].map( ( unit ) => byId( win, unit ).value ),
		[ '08', '31', '2026', '12', '33' ]
	);
	assert.equal( open( win, 'timestampdiv' ), false );
} );

test( 'an impossible date holds the panel open rather than collapsing over it', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'mm' ).value = '02';
	byId( win, 'jj' ).value = '31';
	click( win, '.save-timestamp' );

	assert.equal( open( win, 'timestampdiv' ), true );
	assert.ok( win.document.querySelector( '.timestamp-wrap' ).classList.contains( 'form-invalid' ) );
} );

test( 'and it stops the post being submitted, on whichever tab it is hiding', () => {
	const win = build( screen() );
	wirePublishBox();

	click( win, '.edit-timestamp' );
	byId( win, 'mm' ).value = '02';
	byId( win, 'jj' ).value = '31';
	click( win, '.save-timestamp' );

	const submit = new win.Event( 'submit', { bubbles: true, cancelable: true } );
	byId( win, 'post' ).dispatchEvent( submit );

	assert.equal( submit.defaultPrevented, true );
	assert.equal( open( win, 'timestampdiv' ), true );
	assert.equal( win.document.querySelector( '#publishing-action .spinner' ).classList.contains( 'is-active' ), false );
} );

test( 'a real date lets the post through untouched', () => {
	const win = build( screen() );
	wirePublishBox();

	const submit = new win.Event( 'submit', { bubbles: true, cancelable: true } );
	byId( win, 'post' ).dispatchEvent( submit );

	assert.equal( submit.defaultPrevented, false );
} );

test( 'a screen without a publish box is left alone', () => {
	const win = build( '<div class="wrap herd-editor-screen"><form id="post"></form></div>' );
	assert.doesNotThrow( () => wirePublishBox() );
	assert.equal( win.document.getElementById( 'submitdiv' ), null );
} );

/*
 * A save used to be a page load, and everything the box captured at wire time
 * -- the status the post was loaded with, and the hidden mirror fields Cancel
 * restores from -- was refreshed by that reload. It is not now.
 */
const saved = ( win, detail ) => win.dispatchEvent( new win.CustomEvent( 'herd:saved', { detail } ) );

const published = ( over = {} ) => ( {
	ok: true,
	postId: 42,
	postStatus: 'publish',
	dateParts: { aa: '2026', mm: '08', jj: '31', hh: '12', mn: '33' },
	...over,
} );

test( 'a published draft offers Update rather than Publish', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();
	assert.equal( byId( win, 'publish' ).value, 'Publish' );

	byId( win, 'original_post_status' ).value = 'publish';
	saved( win, published() );

	assert.equal( byId( win, 'publish' ).value, 'Update' );
} );

test( 'the date line stops promising and starts reporting', () => {
	const win = build( screen( { status: 'draft', stamp: 'Publish <b>immediately</b>' } ) );
	wirePublishBox();

	byId( win, 'original_post_status' ).value = 'publish';
	saved( win, published() );

	assert.equal( byId( win, 'timestamp' ).textContent, 'Published on: Aug 31, 2026 at 12:33' );
} );

test( 'the date comes from the server, not from the fields the page was rendered with', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();

	byId( win, 'original_post_status' ).value = 'publish';
	// A draft left open: the fields still say 12:33, but it published at 14:05.
	saved( win, published( { dateParts: { aa: '2026', mm: '09', jj: '01', hh: '14', mn: '05' } } ) );

	assert.equal( byId( win, 'timestamp' ).textContent, 'Published on: Sep 1, 2026 at 14:05' );
	assert.equal( byId( win, 'jj' ).value, '01' );
} );

test( 'Cancel on the date panel goes back to the date that was saved, not the one that was loaded', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();

	byId( win, 'original_post_status' ).value = 'publish';
	saved( win, published( { dateParts: { aa: '2026', mm: '09', jj: '01', hh: '14', mn: '05' } } ) );

	// Now edit the date and change your mind.
	byId( win, 'jj' ).value = '15';
	click( win, '.cancel-timestamp' );

	assert.equal( byId( win, 'jj' ).value, '01' );
	assert.equal( byId( win, 'timestamp' ).textContent, 'Published on: Sep 1, 2026 at 14:05' );
} );

test( 'Cancel on the status panel goes back to the status that was saved', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();

	byId( win, 'original_post_status' ).value = 'publish';
	saved( win, published() );

	click( win, '.edit-post-status' );
	byId( win, 'post_status' ).value = 'draft';
	click( win, '.cancel-post-status' );

	assert.equal( byId( win, 'post_status' ).value, 'publish' );
} );

test( 'a scheduled post says so', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();

	byId( win, 'original_post_status' ).value = 'future';
	saved( win, published( { postStatus: 'future', dateParts: { aa: '2026', mm: '09', jj: '01', hh: '09', mn: '00' } } ) );

	assert.equal( byId( win, 'timestamp' ).textContent, 'Scheduled for: Sep 1, 2026 at 09:00' );
} );

test( 'a saved draft is still a draft, and still offers to be published', () => {
	const win = build( screen( { status: 'draft' } ) );
	wirePublishBox();

	saved( win, published( { postStatus: 'draft' } ) );

	assert.equal( byId( win, 'publish' ).value, 'Publish' );
	assert.equal( byId( win, 'hidden_post_status' ).value, 'draft' );
} );

test( 'a save on a screen with no publish box is not an error', () => {
	const win = build( '<div class="wrap herd-editor-screen"><form id="post"></form></div>' );
	wirePublishBox();
	assert.doesNotThrow( () => saved( win, published() ) );
} );
