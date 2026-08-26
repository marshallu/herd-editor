/**
 * Image and file fields become one row.
 *
 * ACF renders the two as unrelated widgets: an image is a preview with Edit and
 * Remove hidden behind a hover overlay sized to it, and a file is a 190px grey
 * slab carrying a generic document icon and three lines of text. A Video panel
 * holding a thumbnail, a video and a backup video therefore reads as three
 * different controls, and none of them lets you check what was actually
 * attached.
 *
 * Both become `.herd-mediarow`: a 120px poster, the file name over a metadata
 * line, and labelled Edit and Remove. A video poster plays the file in place.
 *
 * Two things about ACF's own rendering constrain everything here.
 *
 * ACF re-renders a file field with `this.$('[data-name="filename"]').text(...)`
 * and friends — a descendant search from the control. Its nodes may be moved
 * anywhere inside the uploader, but recreating or dropping one breaks the next
 * value change. Nothing below builds an input, and every `[data-name]` node ACF
 * writes to is relocated rather than replaced.
 *
 * And it renders the icon with `this.$('img').attr({ src, alt, title })`, which
 * jQuery applies to *every* `img` in the control. A poster `<img>` added to a
 * file field would have its src overwritten with a document icon the moment the
 * value changed, so the file poster is a background image on a button. The
 * image field is the opposite case: its single `img` already is the preview, so
 * it is reused and no second one is added.
 */

import { attachmentData } from '../../acf/attachments.js';

/** Lucide `video`, matching the link glyph's weight in ./link.js. */
const VIDEO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';

/** Lucide `file`. */
const FILE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/></svg>';

/** Lucide `image`. */
const IMAGE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L3 21"/></svg>';

/** Extensions ACF's `data-mime_types` may carry that name a playable video. */
const VIDEO_TYPES = [ 'mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'wmv', 'mpg', 'mpeg' ];

function element( tag, className, text ) {
	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text ) node.textContent = text;
	return node;
}

/** The accepted extensions a field was configured with, lowercased. */
function mimeList( uploader ) {
	return ( uploader.getAttribute( 'data-mime_types' ) || '' )
		.split( ',' )
		.map( ( type ) => type.trim().toLowerCase().replace( /^\./, '' ) )
		.filter( Boolean );
}

/**
 * Whether this field is for video.
 *
 * The field's own configuration answers it before anything is uploaded, which
 * is what the empty state needs; a field left unrestricted falls back to the
 * attachment once there is one.
 */
function isVideoField( uploader ) {
	const types = mimeList( uploader );
	return types.length > 0 && types.every( ( type ) => VIDEO_TYPES.includes( type ) );
}

/** "MOV, MP4 or WebM" — the accepted formats, in the order ACF was given them. */
function formatSentence( uploader ) {
	const names = [];
	mimeList( uploader ).forEach( ( type ) => {
		// Every image field lists jpg and jpeg; they are one format to an editor.
		const label = { jpeg: 'JPG', webm: 'WebM', webp: 'WebP' }[ type ] || type.toUpperCase();
		if ( ! names.includes( label ) ) names.push( label );
	} );
	if ( ! names.length ) return '';
	if ( names.length === 1 ) return `${ names[ 0 ] } only.`;
	return `${ names.slice( 0, -1 ).join( ', ' ) } or ${ names[ names.length - 1 ] }.`;
}

/* ---------- preview ---------- */

/**
 * One dialog for the whole screen.
 *
 * A dialog per field would need a disposer per field; the editor only ever
 * plays one video at a time, so a single element on `document.body` is both
 * simpler and immune to the field host being torn down underneath it.
 */
let preview = null;

function previewDialog() {
	if ( preview ) return preview;

	const dialog = element( 'dialog', 'herd-preview' );
	const head = element( 'div', 'herd-preview__head' );
	const name = element( 'strong', 'herd-preview__name' );
	const close = element( 'button', 'herd-preview__close', 'Close' );
	close.type = 'button';
	head.append( name, close );

	const video = document.createElement( 'video' );
	video.className = 'herd-preview__video';
	video.controls = true;
	video.preload = 'metadata';

	dialog.append( head, video );
	document.body.appendChild( dialog );

	const stop = () => {
		video.pause();
		// Releases the connection; without it the file keeps buffering behind a
		// closed dialog.
		video.removeAttribute( 'src' );
		video.load();
	};
	close.addEventListener( 'click', () => dialog.close() );
	// Native `dialog` closes itself on Escape, so this covers that too.
	dialog.addEventListener( 'close', stop );
	dialog.addEventListener( 'click', ( event ) => {
		// The backdrop is the dialog element itself; anything inside it is not.
		if ( event.target === dialog ) dialog.close();
	} );

	preview = { dialog, name, video };
	return preview;
}

function openPreview( { url, poster, label } ) {
	if ( ! url ) return;
	const { dialog, name, video } = previewDialog();
	name.textContent = label || 'Preview';
	if ( poster ) video.setAttribute( 'poster', poster );
	else video.removeAttribute( 'poster' );
	video.src = url;
	// jsdom has no dialog implementation; the editor is the only place this runs.
	if ( typeof dialog.showModal === 'function' ) dialog.showModal();
}

/* ---------- poster ---------- */

/**
 * The image field a media field takes its poster from.
 *
 * Every video field on the site sits beside a poster image in the same field
 * container — `video_thumbnail`, `poster_image`, `video_poster_image`,
 * `video_placeholder_image`. Reading the shape rather than the names means a
 * new block gets it for free, and Hero's `video` and `backup_video` both
 * resolve to the one thumbnail above them.
 *
 * Preceding is preferred because that is where all but one block puts it;
 * Portraits puts the file first, so a following sibling is accepted too.
 */
function posterField( field ) {
	if ( ! field ) return null;
	const siblings = Array.from( field.parentNode?.children || [] )
		.filter( ( node ) => node.classList?.contains( 'acf-field-image' ) );
	if ( ! siblings.length ) return null;

	const position = Array.from( field.parentNode.children ).indexOf( field );
	const before = siblings.filter( ( node ) => Array.from( field.parentNode.children ).indexOf( node ) < position );
	return before.length ? before[ before.length - 1 ] : siblings[ 0 ];
}

function posterUrl( imageField ) {
	if ( ! imageField ) return '';
	const uploader = imageField.querySelector( '.acf-image-uploader' );
	if ( ! uploader || ! uploader.classList.contains( 'has-value' ) ) return '';
	return uploader.querySelector( 'img' )?.getAttribute( 'src' ) || '';
}

/* ---------- the row ---------- */

/**
 * Turn ACF's wrap into the shared row.
 *
 * @param {HTMLElement} wrap     `.file-wrap` or `.image-wrap`.
 * @param {HTMLElement} uploader The `.acf-file-uploader` / `.acf-image-uploader`.
 * @return {Object} The row's Herd-owned parts.
 */
function buildRow( wrap, uploader ) {
	wrap.classList.add( 'herd-mediarow' );

	// ACF caps `.image-wrap` at the field's preview_size width — 300px on every
	// image field the site has. That is a picture frame's width, and the row is a
	// component; how wide it gets is _acf-media.scss's to say, not the field's.
	// ACF never rewrites this style, so clearing it once is enough.
	wrap.style.maxWidth = '';

	const actions = wrap.querySelector( ':scope > .acf-actions' );
	if ( actions ) {
		// Out from under the hover overlay, but still inside `.show-if-value` so
		// the actions keep following the value without a rule to re-hide them.
		actions.classList.remove( '-hover' );
		actions.classList.add( 'herd-mediarow__acts' );
		const edit = actions.querySelector( '[data-name="edit"]' );
		// ACF's pencil calls `editAttachment` for both field types — the attachment
		// details modal, where you change the alt text and the caption. "Replace"
		// promised a swap it never performed; the label says what the button does.
		if ( edit ) edit.textContent = 'Edit';
		const remove = actions.querySelector( '[data-name="remove"]' );
		if ( remove ) {
			// A bare ✕ next to a text button makes the destructive action the one
			// you have to guess at.
			remove.textContent = 'Remove';
			remove.setAttribute( 'aria-label', 'Remove file' );
		}
	}

	const body = element( 'div', 'herd-mediarow__body' );
	const name = element( 'p', 'herd-mediarow__name' );
	const meta = element( 'p', 'herd-mediarow__meta' );
	body.append( name, meta );

	return { wrap, body, name, meta, actions };
}

/** Paint the derived chips: format, dimensions, size, upload date. */
function paintMeta( parts, data, sizeNode ) {
	const chips = [];
	if ( data?.subtype ) chips.push( data.subtype === 'webm' ? 'WebM' : data.subtype.toUpperCase() );
	if ( data?.width && data?.height ) chips.push( `${ data.width }×${ data.height }` );

	parts.meta.textContent = '';
	chips.forEach( ( chip ) => parts.meta.appendChild( element( 'span', null, chip ) ) );
	// ACF's own node, moved rather than copied: it rewrites this on every change.
	if ( sizeNode ) parts.meta.appendChild( sizeNode );
	if ( data?.dateFormatted ) parts.meta.appendChild( element( 'span', null, `Added ${ data.dateFormatted }` ) );

	// Only a file row has one; an image has no duration to report.
	if ( parts.duration ) {
		parts.duration.textContent = data?.fileLength || '';
		parts.duration.hidden = ! data?.fileLength;
	}
}

/**
 * Say only what needs saying.
 *
 * A green "ready" line on every filled field is decoration, and green in this
 * editor marks selection and the primary action. The one thing worth a line is
 * a video with no poster, because the consequence is invisible from here.
 */
function paintStatus( parts, { video, hasValue, imageField } ) {
	if ( ! parts.status ) return;
	const missing = video && hasValue && imageField && ! posterUrl( imageField );
	parts.status.hidden = ! missing;
	if ( ! missing ) return;
	if ( parts.status.childNodes.length ) return;

	parts.status.appendChild( document.createTextNode( 'No thumbnail set. Viewers see a black frame until the video loads. ' ) );
	const jump = element( 'button', 'herd-mediarow__jump', 'Add one above' );
	jump.type = 'button';
	jump.addEventListener( 'click', () => {
		imageField.querySelector( '[data-name="add"]' )?.focus();
	} );
	parts.status.appendChild( jump );
}

/** The empty state: an invitation, and the one thing ACF knows to tell you. */
function buildEmptyState( uploader, icon, label ) {
	const add = uploader.querySelector( '.hide-if-value [data-name="add"]' );
	if ( ! add ) return;

	// `.button` is WP core's, and this site's admin CSS paints it green with
	// !important. Dropping the class is cheaper and more honest than out-shouting
	// it; ACF binds on `data-name`, not on the class.
	add.classList.remove( 'button', 'button-primary', 'acf-button' );
	add.textContent = '';

	const glyph = element( 'span', 'herd-mediarow__glyph' );
	glyph.innerHTML = icon;
	add.append( glyph, element( 'span', 'herd-mediarow__invite', label ) );

	const formats = formatSentence( uploader );
	if ( formats ) add.appendChild( element( 'small', 'herd-mediarow__formats', formats ) );

	// ACF wraps the button in "No file selected <a>Add File</a>". The empty slot
	// already says the field is empty; the sentence is the label again.
	Array.from( add.parentNode.childNodes ).forEach( ( node ) => {
		if ( node.nodeType === 3 ) node.remove();
	} );
}

/**
 * Keep a row's derived half in step with its value.
 *
 * `acf.val()` triggers a real `change` on the hidden input whenever ACF renders
 * a new attachment, so one listener covers selecting, replacing and clearing.
 * The listener dies with the form when the bridge clears the host, which is why
 * nothing here needs a disposer — but a duplicated repeater row copies the DOM
 * without it, so ../acf/repeater.js strips this decoration before re-running it.
 */
function bindRepaint( uploader, paint ) {
	const input = uploader.querySelector( 'input[type="hidden"][data-name="id"]' )
		|| uploader.querySelector( 'input[type="hidden"]' );
	input?.addEventListener( 'change', paint );
}

/* ---------- file fields ---------- */

export function decorateFiles( form ) {
	if ( ! form ) return;
	form.querySelectorAll( '.acf-file-uploader' ).forEach( ( uploader ) => {
		if ( uploader.classList.contains( 'herd-file' ) || uploader.closest( '.acf-clone' ) ) return;
		uploader.classList.add( 'herd-file' );

		const wrap = uploader.querySelector( ':scope > .file-wrap' );
		const field = uploader.closest( '.acf-field' );
		const video = isVideoField( uploader );

		buildEmptyState( uploader, video ? VIDEO_ICON : FILE_ICON, video ? 'Choose a video' : 'Choose a file' );
		if ( ! wrap ) return;

		const parts = buildRow( wrap, uploader );
		const imageField = posterField( field );

		parts.duration = element( 'span', 'herd-mediarow__dur' );
		parts.status = element( 'div', 'herd-mediarow__status' );
		parts.status.hidden = true;
		uploader.insertBefore( parts.status, wrap.nextSibling );

		// A button, not an img: ACF's render writes its document icon into every
		// img inside this control. See the file header.
		const poster = element( 'button', 'herd-mediarow__poster' );
		poster.type = 'button';
		const glyph = element( 'span', 'herd-mediarow__glyph' );
		glyph.innerHTML = video ? VIDEO_ICON : FILE_ICON;
		poster.append( glyph, parts.duration );

		wrap.insertBefore( poster, wrap.firstChild );

		// ACF writes to these; they are moved into the row, never rebuilt.
		const filename = uploader.querySelector( 'a[data-name="filename"]' );
		const filesize = uploader.querySelector( '[data-name="filesize"]' );
		if ( filename ) parts.name.appendChild( filename );
		wrap.insertBefore( parts.body, parts.actions || null );

		const paint = () => {
			const id = uploader.querySelector( 'input[type="hidden"]' )?.value || '';
			const hasValue = Boolean( id );
			const url = filename?.getAttribute( 'href' ) || '';
			const art = posterUrl( imageField );

			poster.style.backgroundImage = art ? `url("${ art.replace( /"/g, '%22' ) }")` : '';
			poster.classList.toggle( 'has-art', Boolean( art ) );

			/*
			 * Two of the site's video fields were configured with no mime types at
			 * all, so the field alone cannot say whether this is playable. What is
			 * known synchronously is applied first and the attachment settles it.
			 */
			const settle = ( playable, data ) => {
				glyph.innerHTML = playable ? VIDEO_ICON : FILE_ICON;
				poster.disabled = ! ( playable && hasValue && url );
				poster.setAttribute( 'aria-label', playable && hasValue ? `Preview ${ filename?.textContent || 'video' }` : 'No file selected' );
				paintMeta( parts, data, filesize );
				paintStatus( parts, { video: playable, hasValue, imageField } );
			};

			settle( video, null );

			if ( ! hasValue ) return;
			attachmentData( id ).then( ( data ) => {
				// The form may have been torn down while the lookup was in flight.
				if ( ! uploader.isConnected ) return;
				if ( ( uploader.querySelector( 'input[type="hidden"]' )?.value || '' ) !== id ) return;
				settle( video || data?.type === 'video', data );
			} );
		};

		poster.addEventListener( 'click', () => openPreview( {
			url: filename?.getAttribute( 'href' ),
			poster: posterUrl( imageField ),
			label: filename?.textContent || 'Preview',
		} ) );

		bindRepaint( uploader, paint );
		// The poster follows the thumbnail beside it, without a save in between.
		if ( imageField ) {
			imageField.querySelector( '.acf-image-uploader input[type="hidden"]' )
				?.addEventListener( 'change', paint );
		}
		paint();
	} );
}

/* ---------- image fields ---------- */

export function decorateMedia( form ) {
	if ( ! form ) return;
	form.querySelectorAll( '.acf-image-uploader' ).forEach( ( uploader ) => {
		if ( uploader.classList.contains( 'herd-media' ) || uploader.closest( '.acf-clone' ) ) return;
		uploader.classList.add( 'herd-media' );

		const wrap = uploader.querySelector( ':scope > .image-wrap' );

		buildEmptyState( uploader, IMAGE_ICON, 'Choose an image' );
		if ( ! wrap ) return;

		const parts = buildRow( wrap, uploader );
		if ( parts.actions ) {
			parts.actions.querySelector( '[data-name="remove"]' )?.setAttribute( 'aria-label', 'Remove image' );
		}

		// ACF's preview is already an `img` and repeater row thumbnails read it by
		// that selector; it becomes the poster rather than being replaced.
		const image = wrap.querySelector( 'img' );
		image?.classList.add( 'herd-mediarow__art' );
		wrap.insertBefore( parts.body, parts.actions || null );

		const paint = () => {
			const id = uploader.querySelector( 'input[type="hidden"]' )?.value || '';
			if ( ! id ) {
				parts.name.textContent = '';
				paintMeta( parts, null, null );
				return;
			}
			attachmentData( id ).then( ( data ) => {
				if ( ! uploader.isConnected ) return;
				if ( ( uploader.querySelector( 'input[type="hidden"]' )?.value || '' ) !== id ) return;
				parts.name.textContent = data?.filename || '';
				paintMeta( parts, data, null );
			} );
		};

		bindRepaint( uploader, paint );
		paint();
	} );
}

/**
 * Undo this module's decoration so a cloned row can be rebuilt.
 *
 * Duplicating a repeater row copies the DOM but not the `change` listeners the
 * repaint depends on, so a copy left decorated would show whatever the original
 * held and never update. ../acf/repeater.js calls this before re-decorating.
 *
 * The order matters: ACF's `[data-name]` nodes were moved into the row, so they
 * have to be rescued before the row is thrown away.
 */
export function resetMedia( root ) {
	if ( ! root ) return;
	root.querySelectorAll( '.herd-mediarow' ).forEach( ( wrap ) => {
		const keep = wrap.querySelector( '.file-info' ) || wrap;
		wrap.querySelectorAll( '.herd-mediarow__body [data-name]' ).forEach( ( node ) => keep.appendChild( node ) );
		wrap.querySelectorAll( '.herd-mediarow__poster, .herd-mediarow__body' ).forEach( ( node ) => node.remove() );
		wrap.querySelector( ':scope > .acf-actions' )?.classList.remove( 'herd-mediarow__acts' );
		wrap.querySelector( 'img' )?.classList.remove( 'herd-mediarow__art' );
		wrap.classList.remove( 'herd-mediarow' );
	} );
	root.querySelectorAll( '.herd-mediarow__status' ).forEach( ( node ) => node.remove() );
	root.querySelectorAll( '.herd-media, .herd-file' ).forEach( ( uploader ) => {
		uploader.classList.remove( 'herd-media', 'herd-file' );
	} );
}
