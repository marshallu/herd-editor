/**
 * Repeater rows become collapsed summary rows.
 *
 * ACF renders a repeater as a table with every sub-field of every row expanded.
 * Four cards is four walls of fields; the block a person opened the page to
 * change is somewhere below the fold. Collapsed is the default state, and a row
 * carries enough summary that you do not have to open it to know what is inside.
 *
 * Nothing here is moved out of the row. ACF's own `td.acf-row-handle` cells still
 * provide the drag handle, the row number and the add/duplicate/remove actions,
 * and its delegated events still reach them, because the header is inserted
 * inside `td.acf-fields` and the layout is done in CSS.
 */

import { cleanText, humanize, truncate } from '../summary.js';
import { awakenEditors } from './editor.js';
import { iconSvg } from './icons.js';
import { contentFields } from './layout-fields.js';
import { resetMedia } from './media.js';

/** ACF's row actions, restyled as Herd's own. Its handlers bind on `data-event`. */
const ROW_TOOLS = [
	{ event: 'duplicate-row', icon: 'admin-page', label: 'Duplicate card' },
	{ event: 'remove-row', icon: 'no-alt', label: 'Remove card', destructive: true },
];

/** Lucide `grip-vertical`, matching GripIcon in ../primitives.js. */
const GRIP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

const NAME_TYPES = [ 'text', 'textarea', 'wysiwyg' ];
const SUMMARY_LIMIT = 90;

/** A field the active conditional logic has taken off the table says nothing. */
export function isReachable( field ) {
	return field.style.display !== 'none' && ! field.classList.contains( 'acf-hidden' );
}

/** Whatever this field would say about itself on one line. */
export function fieldText( field ) {
	if ( field.classList.contains( 'acf-field-wysiwyg' ) ) return cleanText( field.querySelector( 'textarea' )?.value );
	if ( field.classList.contains( 'acf-field-link' ) ) return cleanText( field.querySelector( '.link-title' )?.textContent );
	if ( field.classList.contains( 'acf-field-select' ) ) {
		const select = field.querySelector( 'select' );
		const option = select?.options[ select.selectedIndex ];
		return option && option.value ? cleanText( option.textContent ) : '';
	}
	if ( field.classList.contains( 'acf-field-button-group' ) ) {
		return cleanText( field.querySelector( 'input[type="radio"]:checked' )?.closest( 'label' )?.textContent );
	}
	const input = field.querySelector( 'input[type="text"], input[type="url"], input[type="email"], textarea' );
	return cleanText( input?.value );
}

function nameType( field ) {
	return NAME_TYPES.some( ( type ) => field.classList.contains( `acf-field-${ type }` ) );
}

/**
 * The name and summary for one row.
 *
 * @param {HTMLElement} cell The row's `td.acf-fields`.
 * @return {{name: string, summary: string}} Row description.
 */
export function describeRow( cell ) {
	// `contentFields` drops the layout fields — a spacer, a message — which hold
	// nothing and so have nothing to contribute to a line describing the row.
	const fields = contentFields( cell.children ).filter( isReachable );

	const parts = [];
	let name = '';
	/*
	 * A link's title names its row as well as a text field would, but only when
	 * nothing better turns up: 18 of this site's repeaters carry no text,
	 * textarea or wysiwyg at all, and 11 of those are lists of links that would
	 * otherwise read "Untitled" all the way down.
	 */
	let linkTitle = '';
	let linkAt = -1;

	fields.forEach( ( field ) => {
		const text = fieldText( field );
		if ( ! text ) return;
		if ( ! name && nameType( field ) ) {
			name = text;
			return;
		}
		if ( ! linkTitle && field.classList.contains( 'acf-field-link' ) ) {
			linkTitle = text;
			linkAt = parts.length;
		}
		parts.push( text );
	} );

	// Promoted, not duplicated: a name is not also a summary fragment.
	if ( ! name && linkTitle ) {
		name = linkTitle;
		parts.splice( linkAt, 1 );
	}

	return { name: truncate( name, 64 ), summary: truncate( parts.join( ' · ' ), SUMMARY_LIMIT ) };
}

/**
 * The row's thumbnail: its image, else its icon, else nothing.
 *
 * Nothing means nothing — no box, no stand-in glyph. A repeater whose rows carry
 * neither an image nor an icon was showing the same grey document on every row,
 * which is a column of noise saying only that the feature exists.
 *
 * @param {HTMLElement} cell  The row's `td.acf-fields`.
 * @param {HTMLElement} thumb The thumbnail element to fill.
 */
function paintThumb( cell, thumb ) {
	const image = cell.querySelector( '.acf-image-uploader img' );
	if ( image && image.getAttribute( 'src' ) ) {
		thumb.className = 'herd-cardrow__thumb has-image';
		thumb.innerHTML = '';
		const copy = document.createElement( 'img' );
		copy.src = image.getAttribute( 'src' );
		copy.alt = '';
		thumb.appendChild( copy );
		return;
	}

	const icon = Array.from( cell.querySelectorAll( 'select' ) )
		.map( ( select ) => iconSvg( select.value ) )
		.find( Boolean );
	thumb.className = 'herd-cardrow__thumb';
	// Icon markup comes from the theme's own PHP, not from user input. Empty when
	// there is no icon, which the stylesheet takes as "do not draw me".
	thumb.innerHTML = icon || '';
}

function buildRowHeader() {
	const header = document.createElement( 'div' );
	header.className = 'herd-cardrow';
	header.tabIndex = 0;
	header.setAttribute( 'role', 'button' );
	header.setAttribute( 'aria-expanded', 'false' );

	const thumb = document.createElement( 'span' );
	thumb.className = 'herd-cardrow__thumb';

	const main = document.createElement( 'span' );
	main.className = 'herd-cardrow__main';
	const name = document.createElement( 'span' );
	name.className = 'herd-cardrow__name';
	const summary = document.createElement( 'span' );
	summary.className = 'herd-cardrow__summary';
	main.append( name, summary );

	const tools = document.createElement( 'span' );
	tools.className = 'herd-cardrow__tools';

	const chev = document.createElement( 'span' );
	chev.className = 'herd-cardrow__chev dashicons dashicons-arrow-down-alt2';
	chev.setAttribute( 'aria-hidden', 'true' );

	header.append( thumb, main, tools, chev );
	return { header, thumb, name, summary, tools };
}

function buildRepeaterHeader( field, repeater ) {
	const head = document.createElement( 'div' );
	head.className = 'herd-repeater__head';

	const title = document.createElement( 'span' );
	title.className = 'herd-repeater__title';
	title.textContent = cleanText( field.querySelector( ':scope > .acf-label label' )?.textContent ) || humanize( field.dataset.name || '' );

	const count = document.createElement( 'span' );
	count.className = 'herd-repeater__count';

	const spacer = document.createElement( 'span' );
	spacer.className = 'herd-repeater__spacer';

	const collapse = document.createElement( 'button' );
	collapse.type = 'button';
	collapse.className = 'herd-btn';
	collapse.textContent = 'Collapse all';

	head.append( title, count, spacer, collapse );

	// ACF's add button is `button-primary`; the only primary on this screen is
	// Update. Moving it stays inside the field, so ACF's delegated event still
	// reaches it.
	const add = repeater.querySelector( ':scope > .acf-actions .acf-repeater-add-row' );
	if ( add ) {
		// `.button` is WP core's and carries its own metrics and the site's green;
		// dropping it lets this match Collapse all exactly. ACF binds on
		// `data-event`, so nothing here depends on the classes.
		add.classList.remove( 'button', 'button-primary', 'acf-button' );
		add.classList.add( 'herd-btn', 'herd-btn--accent' );
		// Sentence case, like every other label in the editor.
		const label = ( add.textContent || 'Add row' ).trim();
		add.textContent = label.charAt( 0 ).toUpperCase() + label.slice( 1 ).toLowerCase();
		head.appendChild( add );
	}

	return { head, count, collapse };
}

/**
 * Strip Herd's decoration from a row ACF has just cloned.
 *
 * Duplicating a row copies its DOM, which includes the pickers and counters Herd
 * built — but not the listeners bound to them. Left in place they would look
 * live and do nothing. Removing them lets the decorators rebuild the row from
 * scratch. Decoration that is pure CSS (swatches, segments) has no listeners and
 * is left alone; the media row is not among them, since it repaints itself from
 * the attachment on every value change.
 */
function resetDecoration( row ) {
	// The tools are ACF's own anchors; put them back before the header they were
	// moved into is thrown away, or a duplicated row loses them for good.
	const actions = row.querySelector( ':scope > td.acf-row-handle.remove' );
	row.querySelectorAll( '.herd-cardrow [data-event]' ).forEach( ( anchor ) => actions?.appendChild( anchor ) );
	row.querySelectorAll( '.herd-cardrow, .herd-grouprow, .herd-iconpick, .herd-budget' ).forEach( ( node ) => node.remove() );
	row.querySelectorAll( '.herd-has-icons, .herd-wysiwyg' ).forEach( ( field ) => {
		field.classList.remove( 'herd-has-icons', 'herd-wysiwyg' );
	} );
	// The media row owns the order its parts come apart in; media.js knows it.
	resetMedia( row );
	// A group's header carries its own listeners; the class is what marks it done.
	row.querySelectorAll( '.herd-group' ).forEach( ( group ) => {
		group.classList.remove( 'herd-group', 'herd-group--flat', 'is-open', 'is-incomplete' );
	} );
	delete row.herdParts;
}

/** Rows ACF keeps around as templates must never be decorated or counted. */
function realRows( repeater ) {
	return Array.from( repeater.querySelectorAll( ':scope > table > tbody > tr.acf-row' ) )
		.filter( ( row ) => ! row.classList.contains( 'acf-clone' ) );
}

function decorateRepeater( field, onRow ) {
	const repeater = field.querySelector( ':scope > .acf-input > .acf-repeater' );
	if ( ! repeater || repeater.classList.contains( 'herd-repeater' ) ) return null;
	repeater.classList.add( 'herd-repeater' );

	const { head, count, collapse } = buildRepeaterHeader( field, repeater );
	repeater.insertBefore( head, repeater.firstChild );

	const refreshRow = ( row ) => {
		const cell = row.querySelector( ':scope > td.acf-fields' );
		const parts = row.herdParts;
		if ( ! cell || ! parts ) return;
		const { name, summary } = describeRow( cell );
		parts.name.textContent = name || 'Untitled';
		parts.name.classList.toggle( 'is-placeholder', ! name );
		parts.summary.textContent = summary;
		paintThumb( cell, parts.thumb );
	};

	const setOpen = ( row, open ) => {
		row.classList.toggle( 'is-open', open );
		row.herdParts?.header.setAttribute( 'aria-expanded', String( open ) );
		if ( open ) awakenEditors( row );
		else refreshRow( row );
	};

	const decorateRow = ( row ) => {
		if ( row.classList.contains( 'acf-clone' ) || row.herdParts ) return;
		const cell = row.querySelector( ':scope > td.acf-fields' );
		if ( ! cell ) return;

		// A row ACF has just cloned carries none of Herd's field decoration.
		if ( onRow ) onRow( row );

		const handle = row.querySelector( ':scope > td.acf-row-handle.order' );
		if ( handle && ! handle.querySelector( '.herd-grip' ) ) {
			/*
			 * ACF marks the whole cell `cursor: move` and leaves the affordance to
			 * the cursor. A grip says so before you hover.
			 *
			 * Not a `<span>`: ACF renumbers with
			 * `$( row ).find( '> .order > span' ).html( index + 1 )`, which claims
			 * every direct span child of this cell. A grip in a span becomes a
			 * second row number the first time anything re-renders the repeater.
			 */
			const grip = document.createElement( 'i' );
			grip.className = 'herd-grip';
			grip.innerHTML = GRIP_ICON;
			handle.insertBefore( grip, handle.firstChild );
		}

		const parts = buildRowHeader();
		row.herdParts = parts;
		cell.insertBefore( parts.header, cell.firstChild );
		row.classList.add( 'herd-card' );

		/*
		 * ACF's row actions are absolutely positioned sprite icons in their own
		 * cell, revealed on hover and with duplicate hidden behind a held shift
		 * key. Herd takes the elements and leaves the behaviour: ACF binds on
		 * `data-event`, so restyling and moving them changes nothing it relies on,
		 * and keeping the real anchors keeps its remove confirmation anchored to
		 * something on screen.
		 */
		const actions = row.querySelector( ':scope > td.acf-row-handle.remove' );
		ROW_TOOLS.forEach( ( { event, icon, label, destructive } ) => {
			const anchor = actions?.querySelector( `[data-event="${ event }"]` );
			if ( ! anchor ) return;
			anchor.className = `herd-cardrow__tool${ destructive ? ' is-destructive' : '' }`;
			anchor.textContent = '';
			const glyph = document.createElement( 'span' );
			glyph.className = `dashicons dashicons-${ icon }`;
			glyph.setAttribute( 'aria-hidden', 'true' );
			anchor.appendChild( glyph );
			anchor.title = label;
			anchor.setAttribute( 'aria-label', label );
			parts.tools.appendChild( anchor );
		} );

		const toggle = ( event ) => {
			if ( event?.target?.closest?.( '.herd-cardrow__tools' ) ) return;
			const open = ! row.classList.contains( 'is-open' );
			// Only one thing needs to be open at a time.
			if ( open ) realRows( repeater ).forEach( ( other ) => other !== row && setOpen( other, false ) );
			setOpen( row, open );
		};

		parts.header.addEventListener( 'click', toggle );
		parts.header.addEventListener( 'keydown', ( event ) => {
			if ( event.key !== 'Enter' && event.key !== ' ' ) return;
			event.preventDefault();
			toggle();
		} );

		refreshRow( row );
	};

	const refreshAll = () => {
		const rows = realRows( repeater );
		rows.forEach( decorateRow );
		rows.forEach( ( row ) => ! row.classList.contains( 'is-open' ) && refreshRow( row ) );
		count.textContent = `${ rows.length } ${ rows.length === 1 ? 'item' : 'items' }`;
		// A row ACF has just added is the one the editor means to fill in.
		const added = rows.find( ( row ) => row.herdJustAdded );
		if ( added ) {
			delete added.herdJustAdded;
			rows.forEach( ( row ) => setOpen( row, row === added ) );
		}
	};

	collapse.addEventListener( 'click', () => realRows( repeater ).forEach( ( row ) => setOpen( row, false ) ) );

	// ACF adds, duplicates and removes rows without an event Herd can rely on, so
	// watch the table body directly.
	const body = repeater.querySelector( ':scope > table > tbody' );
	const observer = new MutationObserver( ( records ) => {
		/*
		 * jQuery UI reorders by moving the dragged `tr` between its siblings, which
		 * is a childList mutation on every pass under another row. Treating that as
		 * new content tore the row's header off and reopened it mid-drag. Reordering
		 * changes neither the count nor any summary, so there is nothing to do until
		 * the drag is over.
		 */
		if ( body.querySelector( '.ui-sortable-helper' ) ) return;

		records.forEach( ( record ) => Array.from( record.addedNodes ).forEach( ( node ) => {
			if ( node.nodeType !== 1 || ! node.classList.contains( 'acf-row' ) ) return;
			if ( node.classList.contains( 'acf-clone' ) ) return;
			// A row that still carries its parts is the same element moved, not a new
			// one: a DOM move keeps the element, and with it everything on it.
			if ( node.herdParts ) return;
			resetDecoration( node );
			node.herdJustAdded = true;
		} ) );
		refreshAll();
	} );
	if ( body ) observer.observe( body, { childList: true } );

	/*
	 * Collapse before a drag starts. An open row is most of the list's height, so
	 * the drop targets slide out from under the cursor as soon as it moves.
	 * jQuery UI takes `> td.order` as its handle, so a press there is the signal.
	 */
	const onDragStart = ( event ) => {
		if ( ! event.target.closest( 'td.acf-row-handle.order' ) ) return;
		realRows( repeater ).forEach( ( row ) => setOpen( row, false ) );
	};
	repeater.addEventListener( 'mousedown', onDragStart );

	const onEdit = ( event ) => {
		const row = event.target.closest?.( 'tr.acf-row' );
		if ( row && row.herdParts ) refreshRow( row );
	};
	repeater.addEventListener( 'input', onEdit );
	repeater.addEventListener( 'change', onEdit );

	refreshAll();
	realRows( repeater ).forEach( ( row ) => setOpen( row, false ) );

	return () => {
		observer.disconnect();
		repeater.removeEventListener( 'mousedown', onDragStart );
		repeater.removeEventListener( 'input', onEdit );
		repeater.removeEventListener( 'change', onEdit );
	};
}

/**
 * Collapse every repeater in a mounted form.
 *
 * @param {HTMLElement} form  The initialised ACF form.
 * @param {Function}    onRow Called with each row before its header is built, so
 *                            the field decorators can reach a row ACF just added.
 * @return {Function} Disposer for the observers this attached.
 */
export function decorateRepeaters( form, onRow ) {
	const disposers = [];
	if ( ! form ) return () => {};
	form.querySelectorAll( '.acf-field-repeater' ).forEach( ( field ) => {
		if ( field.closest( '.acf-clone' ) ) return;
		const dispose = decorateRepeater( field, onRow );
		if ( dispose ) disposers.push( dispose );
	} );
	return () => disposers.forEach( ( dispose ) => dispose() );
}
