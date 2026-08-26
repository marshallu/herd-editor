import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateFiles, decorateMedia, resetMedia } from '../src/ui/acf/media.js';

/*
 * ACF's real uploader output, reduced to the parts the decorators touch. Taken
 * from includes/fields/class-acf-field-file.php and class-acf-field-image.php in
 * ACF Pro: a hidden input carrying the attachment ID, a `.show-if-value` wrap,
 * and a `.hide-if-value` slot holding "No file selected <a data-name="add">".
 *
 * The `[data-name]` nodes matter more than the shape around them — ACF rewrites
 * the field by descendant search on those attributes, so a decorator that drops
 * one breaks every value change after it.
 */
const fileUploader = ( { value = '7', mime = 'mov, mp4, webm' } = {} ) => `
<div class="acf-field acf-field-file" data-name="video" data-type="file">
  <div class="acf-input">
    <div class="acf-file-uploader${ value ? ' has-value' : '' }" data-library="all" data-mime_types="${ mime }" data-uploader="wp">
      <input type="hidden" name="acf[field_v]" value="${ value }" data-name="id">
      <div class="show-if-value file-wrap" tabindex="0" role="button">
        <div class="file-icon"><img data-name="icon" src="/wp-includes/images/media/video.png" alt=""/></div>
        <div class="file-info">
          <p><strong data-name="title">v2.1</strong></p>
          <p><strong>File name:</strong> <a data-name="filename" href="/uploads/v2.1.mp4" target="_blank">v2.1.mp4</a></p>
          <p><strong>File size:</strong> <span data-name="filesize">22 MB</span></p>
        </div>
        <div class="acf-actions -hover">
          <a class="acf-icon -pencil dark" data-name="edit" href="#" aria-label="Edit file"></a>
          <a class="acf-icon -cancel dark" data-name="remove" href="#" aria-label="Remove file"></a>
        </div>
      </div>
      <div class="hide-if-value">
        <p>No file selected <a data-name="add" class="acf-button button" href="#">Add File</a></p>
      </div>
    </div>
  </div>
</div>`;

const imageUploader = ( { value = '4' } = {} ) => `
<div class="acf-field acf-field-image" data-name="video_thumbnail" data-type="image">
  <div class="acf-input">
    <div class="acf-image-uploader${ value ? ' has-value' : '' }" data-library="all">
      <input type="hidden" name="acf[field_t]" value="${ value }" data-name="id">
      <div class="show-if-value image-wrap" style="max-width: 300px">
        <img data-name="image" src="${ value ? '/uploads/frame.jpg' : '' }" alt=""/>
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

function build( markup ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	// The decorators read `window.wp` through ../src/acf/attachments.js, which is
	// absent here — the row must render from ACF's own markup regardless.
	global.window = dom.window;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

/** Every node ACF rewrites on a value change, by the selector ACF uses. */
const ACF_HOOKS = [ 'input[type="hidden"]', '[data-name="title"]', '[data-name="filename"]', '[data-name="filesize"]', 'img[data-name="icon"]', '[data-name="edit"]', '[data-name="remove"]', '[data-name="add"]' ];

test( 'builds the shared row on a file field', () => {
	const form = build( fileUploader() );
	decorateFiles( form );

	const wrap = form.querySelector( '.file-wrap' );
	assert.ok( wrap.classList.contains( 'herd-mediarow' ) );
	assert.ok( wrap.querySelector( '.herd-mediarow__poster' ) );
	assert.ok( wrap.querySelector( '.herd-mediarow__body' ) );
	// The name is the filename, not ACF's title — "v2.1" does not say .mp4.
	assert.equal( wrap.querySelector( '.herd-mediarow__name' ).textContent, 'v2.1.mp4' );
} );

test( 'keeps every node ACF rewrites findable from the uploader', () => {
	const form = build( fileUploader() );
	decorateFiles( form );

	const uploader = form.querySelector( '.acf-file-uploader' );
	ACF_HOOKS.forEach( ( selector ) => {
		assert.ok( uploader.querySelector( selector ), `${ selector } survived decoration` );
	} );
} );

test( 'adds no second img to a file field, because ACF writes its icon into all of them', () => {
	const form = build( fileUploader() );
	decorateFiles( form );

	// acf.models.FileField.render() does $('img').attr({ src: icon }), which
	// jQuery applies to every match — a poster <img> here would be overwritten
	// with a document icon on the next value change.
	const images = form.querySelectorAll( '.acf-file-uploader img' );
	assert.equal( images.length, 1 );
	assert.equal( images[ 0 ].getAttribute( 'data-name' ), 'icon' );
} );

test( 'labels both actions rather than leaving Remove as a glyph', () => {
	const form = build( fileUploader() );
	decorateFiles( form );

	const acts = form.querySelector( '.herd-mediarow__acts' );
	assert.ok( ! acts.classList.contains( '-hover' ) );
	assert.equal( acts.querySelector( '[data-name="edit"]' ).textContent, 'Edit' );
	assert.equal( acts.querySelector( '[data-name="remove"]' ).textContent, 'Remove' );
	// Still inside .show-if-value, so the actions follow the value on their own.
	assert.ok( acts.closest( '.show-if-value' ) );
} );

test( 'takes the poster from the image field beside it', () => {
	const form = build( imageUploader() + fileUploader() );
	decorateFiles( form );

	const poster = form.querySelector( '.herd-mediarow__poster' );
	assert.ok( poster.classList.contains( 'has-art' ) );
	assert.match( poster.style.backgroundImage, /frame\.jpg/ );
	assert.equal( poster.disabled, false );
} );

test( 'finds the poster field when the file comes first, as Portraits orders them', () => {
	const form = build( fileUploader() + imageUploader() );
	decorateFiles( form );

	assert.ok( form.querySelector( '.herd-mediarow__poster' ).classList.contains( 'has-art' ) );
} );

test( 'falls back to a glyph rather than a colour when there is no poster', () => {
	const form = build( imageUploader( { value: '' } ) + fileUploader() );
	decorateFiles( form );

	const poster = form.querySelector( '.acf-file-uploader .herd-mediarow__poster' );
	assert.ok( ! poster.classList.contains( 'has-art' ) );
	assert.equal( poster.style.backgroundImage, '' );
	assert.ok( poster.querySelector( '.herd-mediarow__glyph svg' ) );
} );

test( 'says so only when a video has a thumbnail field and nothing in it', () => {
	const warned = build( imageUploader( { value: '' } ) + fileUploader() );
	decorateFiles( warned );
	const status = warned.querySelector( '.acf-file-uploader .herd-mediarow__status' );
	assert.equal( status.hidden, false );
	assert.match( status.textContent, /No thumbnail set/ );

	const quiet = build( imageUploader() + fileUploader() );
	decorateFiles( quiet );
	// No "ready" line: green marks selection and the primary action, never state.
	assert.equal( quiet.querySelector( '.acf-file-uploader .herd-mediarow__status' ).hidden, true );
} );

test( 'derives the accepted formats from the field ACF configured', () => {
	const form = build( fileUploader() );
	decorateFiles( form );

	const add = form.querySelector( '[data-name="add"]' );
	assert.equal( add.querySelector( '.herd-mediarow__invite' ).textContent, 'Choose a video' );
	// The order ACF was configured with, not one this file invents.
	assert.equal( add.querySelector( '.herd-mediarow__formats' ).textContent, 'MOV, MP4 or WebM.' );
	// ACF's "No file selected" restates an empty field the slot already shows.
	assert.ok( ! add.parentNode.textContent.includes( 'No file selected' ) );
	// WP core paints .button green with !important on this site.
	assert.ok( ! add.classList.contains( 'button' ) );
} );

test( 'calls a file field a file when it is not restricted to video', () => {
	const form = build( fileUploader( { mime: 'pdf' } ) );
	decorateFiles( form );

	const add = form.querySelector( '[data-name="add"]' );
	assert.equal( add.querySelector( '.herd-mediarow__invite' ).textContent, 'Choose a file' );
	assert.equal( add.querySelector( '.herd-mediarow__formats' ).textContent, 'PDF only.' );
	// Nothing to play, so the poster is not a button you can press.
	assert.equal( form.querySelector( '.herd-mediarow__poster' ).disabled, true );
} );

test( 'lets the attachment settle a field ACF was given no mime types for', async () => {
	// Basic Content and Featured Video both configure video fields with an empty
	// mime_types, so the field alone cannot say whether there is anything to play.
	// Its own attachment ID: attachments.js caches resolved lookups by ID, and a
	// shared one would leak this stub into the suites after it.
	const form = build( fileUploader( { mime: '', value: '77' } ) );
	global.window.wp = { media: { attachment: () => ( {
		get: () => '/uploads/v2.1.mp4',
		attributes: { type: 'video', subtype: 'mp4', width: 1920, height: 1080, fileLength: '1:47' },
	} ) } };

	decorateFiles( form );
	const poster = form.querySelector( '.herd-mediarow__poster' );
	assert.equal( poster.disabled, true, 'not playable until the attachment says so' );

	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	assert.equal( poster.disabled, false );
	assert.equal( form.querySelector( '.herd-mediarow__dur' ).textContent, '1:47' );
	assert.match( form.querySelector( '.herd-mediarow__meta' ).textContent, /MP4/ );
	assert.match( form.querySelector( '.herd-mediarow__meta' ).textContent, /1920×1080/ );
	delete global.window.wp;
} );

test( 'gives an image field the same row and reuses ACF\'s own preview', () => {
	const form = build( imageUploader() );
	decorateMedia( form );

	const wrap = form.querySelector( '.image-wrap' );
	assert.ok( wrap.classList.contains( 'herd-mediarow' ) );
	assert.ok( wrap.querySelector( 'img' ).classList.contains( 'herd-mediarow__art' ) );
	// repeater.js paints its row thumbnail from `.acf-image-uploader img`.
	assert.equal( form.querySelectorAll( '.acf-image-uploader img' ).length, 1 );
	assert.equal( wrap.querySelector( '[data-name="remove"]' ).textContent, 'Remove' );
} );

test( 'drops the preview-size cap ACF puts on the image wrap', () => {
	const form = build( imageUploader() );
	decorateMedia( form );

	// 300px is the medium preview size every image field on the site is set to.
	// Left in place it holds the poster, the name and both buttons in a third of
	// the width the field owns, and the metadata wraps a chip per line.
	assert.equal( form.querySelector( '.image-wrap' ).style.maxWidth, '' );
} );

test( 'decorates once and skips the row ACF keeps as a template', () => {
	const form = build( fileUploader() );
	decorateFiles( form );
	decorateFiles( form );
	assert.equal( form.querySelectorAll( '.herd-mediarow__poster' ).length, 1 );
	assert.equal( form.querySelectorAll( '.herd-mediarow__body' ).length, 1 );

	const clone = build( `<div class="acf-clone">${ fileUploader() }</div>` );
	decorateFiles( clone );
	assert.equal( clone.querySelectorAll( '.herd-mediarow' ).length, 0 );
} );

test( 'comes apart again without losing the nodes ACF rewrites', () => {
	const form = build( imageUploader() + fileUploader() );
	decorateFiles( form );
	decorateMedia( form );
	resetMedia( form );

	const uploader = form.querySelector( '.acf-file-uploader' );
	assert.ok( ! uploader.classList.contains( 'herd-file' ) );
	assert.equal( form.querySelectorAll( '.herd-mediarow' ).length, 0 );
	assert.equal( form.querySelectorAll( '.herd-mediarow__status' ).length, 0 );
	ACF_HOOKS.forEach( ( selector ) => {
		assert.ok( uploader.querySelector( selector ), `${ selector } survived the reset` );
	} );

	// A cloned row is decorated from whatever shape it is in, so the reset has to
	// leave the field re-decoratable rather than merely tidy.
	decorateFiles( form );
	assert.equal( form.querySelector( '.herd-mediarow__name' ).textContent, 'v2.1.mp4' );
	assert.equal( form.querySelectorAll( '.acf-file-uploader img' ).length, 1 );
} );

test( 'counts jpg and jpeg as one format, as an editor would', () => {
	// Every image field on the site lists both; "JPG, JPEG, PNG or WebP" reads as
	// four choices when there are three.
	const form = build( imageUploader( { value: '' } ).replace( 'data-library="all"', 'data-library="all" data-mime_types="jpg, jpeg, png, webp"' ) );
	decorateMedia( form );

	assert.equal( form.querySelector( '.herd-mediarow__formats' ).textContent, 'JPG, PNG or WebP.' );
	assert.equal( form.querySelector( '.herd-mediarow__invite' ).textContent, 'Choose an image' );
} );
