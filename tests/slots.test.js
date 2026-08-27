import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { decorateMedia } from '../src/ui/acf/media.js';
import { decorateRepeaters } from '../src/ui/acf/repeater.js';
import { inviteText, isMediaSlots, progressText } from '../src/ui/acf/slots.js';
import { isFixed, realRows, rowHasValue, singularize } from '../src/ui/acf/values.js';

/*
 * ACF's real `-block` output for Billboard's `photos` field (group_64a57b24525b4,
 * field_64a57dce9e0e3): min 4, max 4, one `image` sub-field.
 *
 * Two things here are ACF's doing at `max <= min` and are what the slot path is
 * built on, so the fixture states them rather than paraphrasing:
 * `class-acf-repeater-table.php` emits no `.acf-actions` add bar and no
 * `td.acf-row-handle.remove` per row, and `prepare_value()` has already padded
 * the value to four rows before anything reached the browser.
 *
 * The uploader markup is lifted from tests/media.test.js so the two suites agree
 * on what ACF renders.
 */
const imageField = ( value ) => `
  <div class="acf-field acf-field-image" data-name="photo" data-type="image" data-key="field_64a57ddf9e0e4">
    <div class="acf-label"><label>Photo</label></div>
    <div class="acf-input">
      <div class="acf-image-uploader${ value ? ' has-value' : '' }" data-library="all" data-mime_types="jpg, jpeg, png, webp">
        <input type="hidden" name="acf[field_photos][row-x][field_photo]" value="${ value }" data-name="id">
        <div class="show-if-value image-wrap" style="max-width: 300px">
          <img data-name="image" src="${ value ? '/uploads/campus.jpg' : '' }" alt=""/>
          <div class="acf-actions -hover">
            <a class="acf-icon -pencil dark" data-name="edit" href="#"></a>
            <a class="acf-icon -cancel dark" data-name="remove" href="#"></a>
          </div>
        </div>
        <div class="hide-if-value">
          <p>No image selected <a data-name="add" class="acf-button button" href="#">Add Image</a></p>
        </div>
      </div>
    </div>
  </div>`;

const textField = ( value = '' ) => `
  <div class="acf-field acf-field-text" data-name="title" data-type="text" data-key="field_title">
    <div class="acf-label"><label>Title</label></div>
    <div class="acf-input"><input type="text" value="${ value }"></div>
  </div>`;

const spacerField = () => `
  <div class="acf-field acf-field-spacer" data-name="gap" data-type="spacer"><div class="acf-input"></div></div>`;

const row = ( index, body ) => `
  <tr class="acf-row" data-id="row-${ index }">
    <td class="acf-row-handle order"><span class="acf-row-number">${ index + 1 }</span></td>
    <td class="acf-fields">${ body }</td>
  </tr>`;

/**
 * One repeater field.
 *
 * `remove` is what ACF omits at max <= min, so it defaults to off — passing it
 * builds the shape ACF renders for an ordinary, growable repeater.
 */
function repeater( {
	label = 'Photos',
	min = 4,
	max = 4,
	bodies = [ imageField( '' ), imageField( '' ), imageField( '' ), imageField( '' ) ],
	remove = false,
} = {} ) {
	const actions = remove ? '<div class="acf-actions"><a class="acf-button button-primary acf-repeater-add-row" href="#" data-event="add-row">Add Photo</a></div>' : '';
	const handle = remove ? '<td class="acf-row-handle remove"><a class="acf-icon" data-event="duplicate-row"></a><a class="acf-icon" data-event="remove-row"></a></td>' : '';
	const rows = bodies.map( ( body, i ) => row( i, body ).replace( '</tr>', `${ handle }</tr>` ) ).join( '\n' );
	return `
<div class="acf-field acf-field-repeater" data-name="${ label.toLowerCase() }" data-type="repeater" data-key="field_photos">
  <div class="acf-label"><label>${ label }</label></div>
  <div class="acf-input">
    <div class="acf-repeater -block" data-min="${ min }" data-max="${ max }">
      <table class="acf-table">
        <tbody>
          ${ rows }
          <tr class="acf-row acf-clone" data-id="acfcloneindex">
            <td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
            <td class="acf-fields">${ imageField( '' ) }</td>
            ${ handle }
          </tr>
        </tbody>
      </table>
      ${ actions }
    </div>
    <p class="description">The photo grid option requires 4 photos</p>
  </div>
</div>`;
}

function build( markup ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	// The card path watches ACF's tbody for rows it adds and removes.
	global.MutationObserver = dom.window.MutationObserver;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

/**
 * Decorate a form the way src/ui/acf/layout.js does.
 *
 * The order is the point: `decorateMedia` runs over the whole form first, so a
 * repeater finds `.herd-mediarow` and the rewritten invitation already built by
 * the time it decides what shape to lay its rows out in.
 */
function enhance( markup ) {
	const form = build( markup );
	decorateMedia( form );
	decorateRepeaters( form );
	return form;
}

const el = ( markup ) => build( markup ).querySelector( '.acf-repeater' );

/* ---------- reading the limits off ACF's own markup ---------- */

test( 'a repeater is fixed when ACF gave it the same floor and ceiling', () => {
	assert.equal( isFixed( el( repeater( { min: 4, max: 4 } ) ) ), true );
	assert.equal( isFixed( el( repeater( { min: 0, max: 4, remove: true } ) ) ), false );
	assert.equal( isFixed( el( repeater( { min: 4, max: 0, remove: true } ) ) ), false );
	assert.equal( isFixed( el( repeater( { min: 2, max: 4, remove: true } ) ) ), false );
	// An ordinary repeater carries `0`/`0`, which is not a set of nothing.
	assert.equal( isFixed( el( repeater( { min: 0, max: 0, remove: true } ) ) ), false );
} );

test( 'the clone row ACF keeps in the table is not one of the slots', () => {
	const rows = realRows( el( repeater() ) );
	assert.equal( rows.length, 4 );
	assert.ok( rows.every( ( node ) => ! node.classList.contains( 'acf-clone' ) ) );
} );

/* ---------- which repeaters become a slot grid ---------- */

test( 'a fixed set of single image fields is a slot grid', () => {
	assert.equal( isMediaSlots( el( repeater() ) ), true );
} );

test( 'layout fields do not stop a row from being a slot', () => {
	// A spacer holds nothing, so a row carrying one still holds one image.
	assert.equal( isMediaSlots( el( repeater( {
		bodies: Array.from( { length: 4 }, () => imageField( '' ) + spacerField() ),
	} ) ) ), true );
} );

test( 'a row that holds anything besides its image is not a slot', () => {
	assert.equal( isMediaSlots( el( repeater( {
		bodies: Array.from( { length: 4 }, () => imageField( '' ) + textField() ),
	} ) ) ), false );
} );

test( 'a repeater rows can be added to is never a slot grid', () => {
	// The whole premise is that the slots on screen are the only slots there are.
	assert.equal( isMediaSlots( el( repeater( { min: 0, max: 0, remove: true } ) ) ), false );
} );

/* ---------- what a row and a set say about themselves ---------- */

test( 'a row holds something when one of its fields does', () => {
	const rows = realRows( el( repeater( {
		bodies: [ imageField( '91' ), imageField( '' ), imageField( '' ), imageField( '' ) ],
	} ) ) );
	assert.equal( rowHasValue( rows[ 0 ] ), true );
	assert.equal( rowHasValue( rows[ 1 ] ), false );
} );

test( 'a fixed set reports progress, not inventory', () => {
	const rows = realRows( el( repeater( {
		bodies: [ imageField( '91' ), imageField( '92' ), imageField( '' ), imageField( '' ) ],
	} ) ) );
	assert.equal( progressText( rows ), '2 of 4 chosen' );
	assert.equal( progressText( [] ), '0 of 0 chosen' );
} );

test( 'the empty slot names what belongs in it', () => {
	assert.equal( inviteText( 'Photo' ), 'Choose a photo' );
	assert.equal( inviteText( 'Image' ), 'Choose an image' );
	assert.equal( inviteText( '' ), 'Choose an image' );
} );

test( 'a repeater title says its slots in the singular', () => {
	assert.equal( singularize( 'Photos' ), 'Photo' );
	assert.equal( singularize( 'Cards' ), 'Card' );
	assert.equal( singularize( 'CTA cards' ), 'CTA card' );
	assert.equal( singularize( 'Categories' ), 'Category' );
	// Already singular, and a word ending in a doubled s is not a plural.
	assert.equal( singularize( 'Photo' ), 'Photo' );
	assert.equal( singularize( 'Address' ), 'Address' );
} );

/* ---------- the decorated result ---------- */

test( 'a fixed image repeater is laid out as slots, not as cards', () => {
	const form = enhance( repeater() );
	const acf = form.querySelector( '.acf-repeater' );

	assert.ok( acf.classList.contains( 'herd-repeater' ) );
	assert.ok( acf.classList.contains( 'herd-slots' ) );
	// The row header is the whole card pattern; a tile has none of it.
	assert.equal( form.querySelectorAll( '.herd-cardrow' ).length, 0 );
	assert.equal( acf.querySelector( '.herd-repeater__count' ).textContent, '0 of 4 chosen' );
	// Nothing to collapse, so nothing offers to.
	assert.equal( acf.querySelector( '.herd-repeater__head .herd-btn' ), null );
} );

test( 'the column count is the slot count', () => {
	const form = enhance( repeater() );
	assert.equal( form.querySelector( '.acf-repeater' ).style.getPropertyValue( '--herd-slot-cols' ), '4' );
} );

test( 'the count follows the photos as they are chosen', () => {
	const form = enhance( repeater() );
	const acf = form.querySelector( '.acf-repeater' );

	const input = realRows( acf )[ 0 ].querySelector( 'input[data-name="id"]' );
	input.value = '91';
	input.dispatchEvent( new window.Event( 'change', { bubbles: true } ) );

	assert.equal( acf.querySelector( '.herd-repeater__count' ).textContent, '1 of 4 chosen' );
} );

test( 'the grip goes in an <i>, because ACF claims every span in that cell', () => {
	const form = enhance( repeater() );

	realRows( form.querySelector( '.acf-repeater' ) ).forEach( ( node ) => {
		const cell = node.querySelector( ':scope > td.acf-row-handle.order' );
		// ACF renumbers with `$( row ).find( '> .order > span' ).html( index + 1 )`.
		// A grip in a span becomes a second row number on the next render.
		assert.equal( cell.querySelectorAll( ':scope > span' ).length, 1 );
		assert.equal( cell.querySelectorAll( ':scope > i.herd-grip' ).length, 1 );
	} );
} );

test( 'every node ACF writes to is still where ACF looks for it', () => {
	// This is the test that catches somebody "improving" the tile by moving DOM:
	// media.js documents that ACF re-renders through descendant `[data-name]`
	// lookups from the uploader and through `this.$( 'img' ).attr( ... )`.
	const form = enhance( repeater() );

	realRows( form.querySelector( '.acf-repeater' ) ).forEach( ( node ) => {
		const uploader = node.querySelector( '.acf-image-uploader' );
		[ 'input[type="hidden"][data-name="id"]', '[data-name="add"]', '[data-name="edit"]', '[data-name="remove"]', 'img' ]
			.forEach( ( selector ) => {
				const found = uploader.querySelector( selector );
				assert.ok( found, selector );
				assert.equal( found.closest( '.acf-image-uploader' ), uploader, selector );
			} );
		assert.deepEqual(
			Array.from( node.children ).map( ( child ) => child.className ),
			[ 'acf-row-handle order', 'acf-fields' ]
		);
	} );
} );

test( 'the empty slot is invited by name', () => {
	const form = enhance( repeater() );
	assert.equal( form.querySelector( '.herd-mediarow__invite' ).textContent, 'Choose a photo' );
} );

test( 'decorating twice changes nothing', () => {
	const form = enhance( repeater() );
	decorateRepeaters( form );

	assert.equal( form.querySelectorAll( '.herd-repeater__head' ).length, 1 );
	assert.equal( form.querySelectorAll( '.herd-grip' ).length, 4 );
} );

/* ---------- the fixed repeaters that stay card lists ---------- */

test( 'a fixed set that is not media keeps its cards, and counts them filled', () => {
	const form = enhance( repeater( {
		label: 'Cards',
		min: 3,
		max: 3,
		bodies: [ textField( 'Apply' ), textField(), textField() ],
	} ) );
	const acf = form.querySelector( '.acf-repeater' );

	assert.ok( ! acf.classList.contains( 'herd-slots' ) );
	assert.equal( acf.querySelectorAll( '.herd-cardrow' ).length, 3 );
	assert.equal( acf.querySelector( '.herd-repeater__count' ).textContent, '1 of 3 filled' );
} );

test( 'an empty slot in a fixed set is named by its position, not called untitled', () => {
	const form = enhance( repeater( {
		label: 'Cards',
		min: 3,
		max: 3,
		bodies: [ textField( 'Apply' ), textField(), textField() ],
	} ) );

	const names = Array.from( form.querySelectorAll( '.herd-cardrow__name' ) ).map( ( node ) => node.textContent );
	assert.deepEqual( names, [ 'Apply', 'Card 2', 'Card 3' ] );
} );

test( 'a repeater rows can be added to still says Untitled', () => {
	// The row exists because somebody added it, and they have not named it yet.
	const form = enhance( repeater( {
		label: 'Links',
		min: 0,
		max: 0,
		bodies: [ textField() ],
		remove: true,
	} ) );

	assert.equal( form.querySelector( '.herd-cardrow__name' ).textContent, 'Untitled' );
	assert.equal( form.querySelector( '.herd-repeater__count' ).textContent, '1 item' );
} );

/* ---------- two declarations of one fact ---------- */

test( 'the slot grid floats its rows, because jQuery UI sortable requires it', () => {
	/*
	 * wp-includes/js/jquery/ui/sortable.min.js picks horizontal-vs-vertical with
	 * `_isFloating`, which reads `float` and `display` and knows nothing about
	 * grid. Swapping this for `display: grid` on the tbody breaks reordering in a
	 * way no jsdom test can see — and reordering decides which photo the theme's
	 * offset layout renders double-width — so the declaration is pinned here.
	 */
	const scss = readFileSync( new URL( '../src/css/_acf-repeater.scss', import.meta.url ), 'utf8' );
	const rule = scss.slice( scss.indexOf( 'in-surfaces(".herd-slots tr.acf-row:not(.acf-clone)")' ) );
	assert.match( rule.slice( 0, rule.indexOf( '}' ) ), /float:\s*left/ );
} );

test( 'the collapse rule leaves the slot grid alone', () => {
	// A slot row is never `.is-open`, so a collapse rule that reached it would
	// hide every tile — four empty boxes and no error anywhere.
	const scss = readFileSync( new URL( '../src/css/_acf-repeater.scss', import.meta.url ), 'utf8' );
	assert.match(
		scss,
		/in-surfaces\("\.herd-repeater:not\(\.herd-slots\) tr\.acf-row:not\(\.is-open\) > td\.acf-fields > \.acf-field"\) \{\n\tdisplay: none !important;/
	);
} );

/* ---------- the add button's label belongs to the field group ---------- */

test( 'the add button keeps the capitalisation a field group authored', () => {
	const form = enhance( repeater( { min: 0, max: 4, remove: true } ).replace( '>Add Photo<', '>Add FAQ<' ) );
	assert.equal( form.querySelector( '.acf-repeater-add-row' ).textContent, 'Add FAQ' );
} );

test( 'the add button still raises a lowercase first character', () => {
	const form = enhance( repeater( { min: 0, max: 4, remove: true } ).replace( '>Add Photo<', '>add photo<' ) );
	assert.equal( form.querySelector( '.acf-repeater-add-row' ).textContent, 'Add photo' );
} );
