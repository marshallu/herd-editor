import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateControls } from '../src/ui/acf/controls.js';
import { profileFor } from '../src/ui/acf/profiles.js';
import { installProfiles } from './fixtures/profiles.js';

/*
 * The Profiles block's Background field as ACF renders it: a plain `select`,
 * `ui` off, two choices. Taken from `group_65fc55754b1a6.json`.
 */
const background = ( value = 'white' ) => `
<div class="acf-field acf-field-select" data-name="background" data-type="select">
  <div class="acf-label"><label>Background</label></div>
  <div class="acf-input">
    <select name="acf[field_65fc591d021ec]">
      <option value="white"${ value === 'white' ? ' selected' : '' }>White</option>
      <option value="black"${ value === 'black' ? ' selected' : '' }>Black</option>
    </select>
  </div>
</div>`;

/** Card Style remains ACF's native select so its conditional logic sees changes. */
const cardStyle = ( value = 'minimalist' ) => `
<div class="acf-field acf-field-select" data-name="card_style" data-type="select">
  <div class="acf-label"><label>Card Style</label></div>
  <div class="acf-input">
    <select name="acf[field_card_style]">
      <option value="minimalist"${ value === 'minimalist' ? ' selected' : '' }>Minimalist</option>
      <option value="icon"${ value === 'icon' ? ' selected' : '' }>Icon</option>
      <option value="enhanced"${ value === 'enhanced' ? ' selected' : '' }>Enhanced</option>
    </select>
  </div>
</div>`;

/** Opens counted through the one call jsdom does not implement. */
let opens = 0;

function build( markup ) {
	const dom = new JSDOM( `<div class="wrap herd-editor-screen"><div class="acf-block-fields acf-fields">${ markup }</div></div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	// The profiles ride on window, and each build() installs a fresh one.
	installProfiles();
	opens = 0;
	// jsdom has no dialog implementation, so the editor's one browser call is
	// stubbed rather than worked around in the module under test.
	dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
		this.setAttribute( 'open', '' );
		opens++;
	};
	dom.window.HTMLDialogElement.prototype.close = function close() {
		this.removeAttribute( 'open' );
	};
	return dom.window.document.querySelector( '.acf-block-fields' );
}

/** Choose a value the way an editor does: move the select, then let it change. */
function choose( form, value ) {
	const select = form.querySelector( 'select' );
	select.value = value;
	select.dispatchEvent( new global.window.Event( 'change', { bubbles: true } ) );
}

// Lazy: the profiles live on window, which build() installs per test.
const profile = () => profileFor( 'acf/profiles' );
const dialog = () => global.document.querySelector( '.herd-alert' );

test( 'choosing Black says the background belongs to the Cyber site', () => {
	const form = build( background() );
	decorateControls( form, profile() );

	choose( form, 'black' );

	assert.equal( opens, 1 );
	assert.equal( dialog().querySelector( '.herd-alert__title' ).textContent, 'Black is for the Cyber site' );
	assert.match( dialog().querySelector( '.herd-alert__body' ).textContent, /only allowed on the Cyber site/ );
} );

test( 'the notice warns and nothing more — Black stays chosen', () => {
	const form = build( background() );
	decorateControls( form, profile() );

	choose( form, 'black' );

	// Herd is not told which site it is on. Reverting would take Black away from
	// the one site entitled to it.
	assert.equal( form.querySelector( 'select' ).value, 'black' );
} );

test( 'a block already set to Black does not warn on open', () => {
	// Reopening a post is not a decision to re-examine; only the change is.
	const form = build( background( 'black' ) );
	decorateControls( form, profile() );

	assert.equal( opens, 0 );
	assert.equal( dialog(), null );
} );

test( 'choosing White does not warn', () => {
	const form = build( background( 'black' ) );
	decorateControls( form, profile() );

	choose( form, 'white' );

	assert.equal( opens, 0 );
} );

test( 'the dialog is reused rather than stacked', () => {
	const form = build( background() );
	decorateControls( form, profile() );

	choose( form, 'black' );
	dialog().querySelector( 'button' ).click();
	choose( form, 'white' );
	choose( form, 'black' );

	assert.equal( opens, 2 );
	assert.equal( global.document.querySelectorAll( '.herd-alert' ).length, 1 );
} );

test( 'decorating twice leaves one listener, so one choice is one warning', () => {
	const form = build( background() );
	// A repeater row arriving re-runs the decorators over the whole form.
	decorateControls( form, profile() );
	decorateControls( form, profile() );

	choose( form, 'black' );

	assert.equal( opens, 1 );
} );

test( 'changing Card Style applies immediately without a confirmation strip', () => {
	const form = build( cardStyle() );
	decorateControls( form, profileFor( 'acf/cards-collection' ) );

	choose( form, 'icon' );

	assert.equal( form.querySelector( 'select' ).value, 'icon' );
	assert.equal( form.querySelector( '.herd-confirm' ), null );
} );

test( 'a block with no profile is left alone', () => {
	const form = build( background() );
	decorateControls( form, profileFor( 'acf/billboard' ) );

	choose( form, 'black' );

	assert.equal( opens, 0 );
	assert.equal( dialog(), null );
} );
