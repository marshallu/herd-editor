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

import { awakenEditors } from './editor.js';
import { iconSvg, isIconSelect } from './icons.js';
import { GRIP_ICON } from './grip.js';
import { resetMedia } from './media.js';
import { resetLinks } from './link.js';
import { decorateSlots, isMediaSlots } from './slots.js';
import { describeLinkRow, describeRow, fieldText, isFixed, isLinkList, isReachable, realRows, repeaterTitle, rowHasValue, singularize } from './values.js';

/*
 * Moved to ./values.js so ./group.js, ./slots.js and ./flexible.js can ask the
 * same questions without importing this module and closing a cycle. Re-exported
 * because they are this module's published surface, and its tests'.
 */
export { describeRow, fieldText, isReachable };

/** ACF's row actions, restyled as Herd's own. Its handlers bind on `data-event`. */
const ROW_TOOLS = [
	{ event: 'duplicate-row', icon: 'admin-page', label: 'Duplicate card' },
	{ event: 'remove-row', icon: 'no-alt', label: 'Remove card', destructive: true },
];

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
		.filter( isIconSelect )
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

	/*
	 * Empty on every row but a link list's, and `:empty` is what hides it — the
	 * same contract the thumbnail keeps.
	 */
	const badges = document.createElement( 'span' );
	badges.className = 'herd-cardrow__badges';

	const tools = document.createElement( 'span' );
	tools.className = 'herd-cardrow__tools';

	const chev = document.createElement( 'span' );
	chev.className = 'herd-cardrow__chev dashicons dashicons-arrow-down-alt2';
	chev.setAttribute( 'aria-hidden', 'true' );

	header.append( thumb, main, badges, tools, chev );
	return { header, thumb, name, summary, badges, tools };
}

/**
 * Repaint one row's badges.
 *
 * Rebuilt rather than diffed: a row carries two or three of these and they
 * change on a click, so there is nothing here worth keeping across a repaint.
 *
 * @param {HTMLElement} host   The `.herd-cardrow__badges` element.
 * @param {Array}       badges Descriptions from `describeLinkRow`.
 */
function paintBadges( host, badges ) {
	host.textContent = '';
	badges.forEach( ( { text, tone } ) => {
		const badge = document.createElement( 'span' );
		badge.className = `herd-badge herd-badge--${ tone }`;
		badge.textContent = text;
		host.appendChild( badge );
	} );
}

function buildRepeaterHeader( field, repeater ) {
	const head = document.createElement( 'div' );
	head.className = 'herd-repeater__head';

	const title = document.createElement( 'span' );
	title.className = 'herd-repeater__title';
	title.textContent = repeaterTitle( field );

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
		// Sentence case, like every other label in the editor -- but only ever by
		// raising the first character. Lowercasing the rest would turn a field
		// group's "Add FAQ" into "Add faq" and lose the author's own wording.
		const label = ( add.textContent || 'Add row' ).trim();
		add.textContent = label.charAt( 0 ).toUpperCase() + label.slice( 1 );
		head.appendChild( add );
	}

	return { head, count, collapse, add };
}

/**
 * The same add button again, at the foot of the list.
 *
 * The header's copy is where you look when the list is short. Once it is long
 * enough to scroll — and one open row is most of a screen on its own — it has
 * gone off the top of the window, and adding the next card means scrolling back
 * up to a button you already know the position of. This one is where you were
 * already looking: under the row you have just finished.
 *
 * A proxy rather than a second `data-event="add-row"` anchor. ACF's handler is
 * delegated, so a copy would work, but then two elements claim to be the add
 * button and only one of them is the one ACF renders, disables and reads its
 * label from. Clicking through the real one keeps a single source of truth.
 *
 * @param {HTMLElement} add The repeater's real add button, in the header.
 * @return {HTMLElement} The foot, hidden until there is a list to scroll.
 */
function buildFoot( add ) {
	const foot = document.createElement( 'div' );
	foot.className = 'herd-repeater__foot';

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'herd-btn herd-btn--accent';
	button.textContent = add.textContent;
	button.addEventListener( 'click', () => add.click() );

	foot.appendChild( button );
	return foot;
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
	// A link chip's listeners are on ACF's own `.link-wrap`, so the class and the
	// glyphs come off rather than the node.
	resetLinks( row );
	// A group's header carries its own listeners; the class is what marks it done.
	row.querySelectorAll( '.herd-group' ).forEach( ( group ) => {
		group.classList.remove( 'herd-group', 'herd-group--flat', 'is-open', 'is-incomplete' );
	} );
	delete row.herdParts;
}

function decorateRepeater( field, onRow ) {
	const repeater = field.querySelector( ':scope > .acf-input > .acf-repeater' );
	if ( ! repeater || repeater.classList.contains( 'herd-repeater' ) ) return null;
	repeater.classList.add( 'herd-repeater' );

	/*
	 * A fixed set of rows holding one image each is not a list of anything. The
	 * row has no summary to write and the image is the row, so ./slots.js draws
	 * the rows as the slots they are rather than as cards to open one at a time.
	 */
	if ( isMediaSlots( repeater ) ) return decorateSlots( field, repeater );

	/*
	 * A repeater ACF will not let you add to or remove from is a fixed set of
	 * slots. It still says how many of them you have filled, and an empty one is
	 * named by the position it occupies rather than called untitled.
	 */
	const fixed = isFixed( repeater );
	const slotNoun = singularize( repeaterTitle( field ) );

	/*
	 * A list of links reads as what a link is — where it points, and how it is
	 * flagged — rather than as a title over a joined line of its settings' values.
	 * The class is the hook the row's mono URL and its badges are drawn from.
	 */
	const linkList = isLinkList( repeater );
	if ( linkList ) repeater.classList.add( 'herd-linklist' );

	const { head, count, collapse, add } = buildRepeaterHeader( field, repeater );
	repeater.insertBefore( head, repeater.firstChild );

	// After the table, so it sits under the last row. ACF's own actions bar is
	// what the add button was taken out of, and the stylesheet hides what is left.
	const foot = add ? buildFoot( add ) : null;
	if ( foot ) repeater.appendChild( foot );

	/*
	 * A second add button beside the first says nothing. It earns its place once
	 * the list is taller than the window — more than one row, or one row open,
	 * which is already most of a screen.
	 */
	const paintFoot = () => {
		const rows = realRows( repeater );
		foot?.classList.toggle(
			'is-shown',
			rows.length > 1 || rows.some( ( row ) => row.classList.contains( 'is-open' ) ),
		);
	};

	/*
	 * "Untitled" is true of a card nobody has named yet. It is not true of the
	 * third of three, which is not untitled but empty — and the field group has
	 * already said what belongs there.
	 */
	const placeholder = ( row ) => {
		if ( fixed ) return `${ slotNoun } ${ realRows( repeater ).indexOf( row ) + 1 }`;
		// A link nobody has chosen yet is not untitled; it is empty, and the row
		// already has a Choose a link waiting inside it.
		return linkList ? 'No link yet' : 'Untitled';
	};

	const refreshRow = ( row ) => {
		const cell = row.querySelector( ':scope > td.acf-fields' );
		const parts = row.herdParts;
		if ( ! cell || ! parts ) return;
		const { name, summary, badges } = linkList ? describeLinkRow( cell ) : describeRow( cell );
		parts.name.textContent = name || placeholder( row );
		parts.name.classList.toggle( 'is-placeholder', ! name );
		parts.summary.textContent = summary;
		paintBadges( parts.badges, badges || [] );
		if ( ! linkList ) paintThumb( cell, parts.thumb );
	};

	const setOpen = ( row, open ) => {
		row.classList.toggle( 'is-open', open );
		row.herdParts?.header.setAttribute( 'aria-expanded', String( open ) );
		if ( open ) awakenEditors( row );
		else refreshRow( row );
		paintFoot();
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

	/*
	 * A list reports its length; a fixed set reports its progress. "3 items" on a
	 * repeater ACF padded to three empty rows describes rows that exist rather
	 * than work that is done. ./slots.js says "chosen" for the same fact, because
	 * a photo is chosen and a card is filled in.
	 */
	const paintCount = ( rows ) => {
		if ( fixed ) {
			count.textContent = `${ rows.filter( rowHasValue ).length } of ${ rows.length } filled`;
			return;
		}
		/*
		 * A capped list reports its headroom. Both More Info repeaters stop at three
		 * links, and "3 items" beside an add button that has quietly stopped working
		 * leaves the editor to work out why; "3 of 3 used" says it. ACF puts the cap
		 * on the repeater as `data-max`, and writes nothing when there is none.
		 */
		const max = Number( repeater.dataset.max );
		count.textContent =
			max > 0
				? `${ rows.length } of ${ max } used`
				: `${ rows.length } ${ rows.length === 1 ? 'item' : 'items' }`;
	};

	const refreshAll = () => {
		const rows = realRows( repeater );
		rows.forEach( decorateRow );
		rows.forEach( ( row ) => ! row.classList.contains( 'is-open' ) && refreshRow( row ) );
		paintCount( rows );
		paintFoot();
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
		// The count of a fixed set moves as its rows are filled, not as rows come
		// and go — there is no row change to hang it off.
		if ( fixed ) paintCount( realRows( repeater ) );
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
