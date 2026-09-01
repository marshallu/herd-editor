/**
 * Icon selects become a picker that shows the icons.
 *
 * A site that keeps a named SVG set commonly points several ACF selects at it
 * (see the `herd_editor_icons` filter). Rendered as a select, the control asks an
 * editor to pick a picture by reading its slug. `herd-editor.php` publishes the
 * name-to-SVG map, and any select whose options are mostly icon names is fronted
 * with a trigger that shows the current icon and its name, and a panel that opens
 * on demand. The select keeps the value, so nothing about the save path changes —
 * and if the theme is absent the map is empty and every select stays exactly as
 * ACF rendered it.
 *
 * A restricted field and an unrestricted one are the same control. Billboard's
 * `link_icon` offers four icons and a card's offers seventy-eight; the search box
 * appears on the second only because there is something to search. Our icon set
 * is flat, so there are no category headings to draw.
 *
 * The panel is a native popover. Every icon field on this site sits inside a
 * repeater, and `.herd-repeater` and `.herd-group` are both `overflow: hidden` —
 * an absolutely positioned panel would be clipped at the card's rounded edge. The
 * top layer escapes that while the element stays a DOM child of the field, so the
 * `--herd-*` tokens still inherit and removing the wrapper still cleans it up.
 */

import { humanize } from '../summary.js';
import { labelText } from './controls.js';

/** How much of a select has to look like icons before we treat it as one. */
const MATCH_RATIO = 0.8;
/** Below this there is nothing to search. */
const CHROME_THRESHOLD = 10;
/** Gap between the trigger and the panel. */
const GAP = 6;
/**
 * The room below a trigger that counts as enough. Placement never measures the
 * panel: when it opens upward it is anchored by its bottom edge, so the decision
 * is made from the space available rather than from a height we cannot read
 * until after the browser has already painted it somewhere.
 */
const MIN_SPACE = 220;
/**
 * How narrow the panel is allowed to get. It takes the trigger's width, and a
 * trigger in one column of a repeater row's field grid can be narrower than
 * three icons across. Kept here rather than in CSS so the placement below can
 * see it and keep the panel inside the viewport.
 */
const MIN_WIDTH = 232;

let uid = 0;

function iconMap() {
	const icons = window.HerdEditor?.icons;
	return icons && typeof icons === 'object' ? icons : {};
}

export function hasIcons() {
	return Object.keys( iconMap() ).length > 0;
}

/**
 * The SVG markup for one icon name.
 *
 * @param {string} name Icon key.
 * @return {string} SVG markup, or '' when the name is unknown.
 */
export function iconSvg( name ) {
	const svg = iconMap()[ name ];
	return typeof svg === 'string' ? svg : '';
}

/** Does this select choose from the icon set? */
export function isIconSelect( select ) {
	const values = Array.from( select.options ).map( ( option ) => option.value ).filter( Boolean );
	if ( values.length < 2 ) return false;
	const known = values.filter( ( value ) => iconSvg( value ) ).length;
	return known / values.length >= MATCH_RATIO;
}

/**
 * What this field calls an icon.
 *
 * Billboard already labels its options "Web Link" and "Phone Link"; a card's
 * options are keyed name-to-name, so the text is the slug and says nothing the
 * value doesn't. That second case is what `humanize` is for.
 *
 * @param {HTMLOptionElement} option One of the select's options.
 * @return {string} The icon's name on this field.
 */
function optionLabel( option ) {
	const text = ( option.textContent || '' ).trim();
	return text && text !== option.value ? text : humanize( option.value );
}

/** Search matches the slug and the name alike, so "map pin" finds `map-pin`. */
function normalize( value ) {
	return String( value ).toLowerCase().replace( /-+/g, ' ' ).trim();
}

function tile( value, name ) {
	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'herd-icontile';
	button.dataset.value = value;
	button.title = name;
	button.setAttribute( 'role', 'radio' );
	button.setAttribute( 'aria-label', name );
	button.setAttribute( 'aria-checked', 'false' );
	button.tabIndex = -1;
	// The map is authored in the theme's own PHP, not user input.
	button.innerHTML = iconSvg( value );
	return button;
}

function span( className ) {
	const node = document.createElement( 'span' );
	node.className = className;
	return node;
}

/**
 * Build the trigger and its panel in front of one select.
 *
 * @param {HTMLElement}       field  The `.acf-field` wrapper.
 * @param {HTMLSelectElement} select ACF's select, which stays the value.
 * @return {HTMLElement} The picker.
 */
function buildPicker( field, select ) {
	const options = Array.from( select.options ).filter( ( option ) => option.value );
	const names = new Map( options.map( ( option ) => [ option.value, optionLabel( option ) ] ) );
	// Clearing is offered only where ACF has said an empty value is legal. On a
	// field with `allow_null` off, an x would produce a value the save rejects.
	const clearable = Array.from( select.options ).some( ( option ) => ! option.value );
	const id = `herd-icon-${ ++uid }`;

	const picker = document.createElement( 'div' );
	picker.className = `herd-iconpick${ clearable ? ' herd-iconpick--clearable' : '' }`;

	const trigger = document.createElement( 'button' );
	trigger.type = 'button';
	trigger.className = 'herd-iconpick__trigger';
	trigger.setAttribute( 'aria-haspopup', 'dialog' );
	trigger.setAttribute( 'aria-expanded', 'false' );

	const chip = span( 'herd-iconpick__chip' );
	chip.setAttribute( 'aria-hidden', 'true' );
	const nameEl = span( 'herd-iconpick__name' );
	nameEl.id = `${ id }-name`;
	const caret = span( 'herd-iconpick__caret dashicons dashicons-arrow-down-alt2' );
	caret.setAttribute( 'aria-hidden', 'true' );
	trigger.append( chip, nameEl, caret );

	/*
	 * The field's own label plus the chosen icon: "Link icon, Web Link".
	 *
	 * An id we injected earlier is replaced rather than reused: duplicating a
	 * repeater row copies the label with it, and two rows pointing at one id
	 * would name the second row's trigger after the first row's label. An id ACF
	 * or a plugin set is left alone.
	 */
	const label = field.querySelector( ':scope > .acf-label label' );
	if ( label && ( ! label.id || label.id.startsWith( 'herd-icon-' ) ) ) label.id = `${ id }-label`;
	trigger.setAttribute( 'aria-labelledby', [ label?.id, nameEl.id ].filter( Boolean ).join( ' ' ) );

	const panel = document.createElement( 'div' );
	panel.className = 'herd-iconpick__panel';
	panel.id = `${ id }-panel`;
	panel.setAttribute( 'popover', 'auto' );
	panel.setAttribute( 'role', 'dialog' );
	panel.setAttribute( 'aria-label', 'Choose an icon' );
	// The browser owns the toggle. Opening it from a click handler of our own
	// would fight light dismiss, which closes on the same press.
	trigger.setAttribute( 'popovertarget', panel.id );

	let search = null;
	if ( options.length >= CHROME_THRESHOLD ) {
		const wrap = document.createElement( 'div' );
		wrap.className = 'herd-iconpick__search';
		search = document.createElement( 'input' );
		search.type = 'search';
		search.placeholder = `Search ${ options.length } icons`;
		search.setAttribute( 'aria-label', 'Search icons' );
		wrap.appendChild( search );
		panel.appendChild( wrap );
	}

	const grid = document.createElement( 'div' );
	grid.className = 'herd-iconpick__grid';
	grid.setAttribute( 'role', 'radiogroup' );
	grid.setAttribute( 'aria-label', labelText( field ) || 'Icons' );
	const tiles = options.map( ( option ) => {
		const button = tile( option.value, names.get( option.value ) );
		grid.appendChild( button );
		return button;
	} );

	const empty = document.createElement( 'p' );
	empty.className = 'herd-iconpick__empty';
	empty.hidden = true;

	const foot = document.createElement( 'p' );
	foot.className = 'herd-iconpick__foot';
	foot.setAttribute( 'aria-live', 'polite' );

	panel.append( grid, empty, foot );
	picker.append( trigger, panel );

	let clear = null;
	if ( clearable ) {
		clear = document.createElement( 'button' );
		clear.type = 'button';
		clear.className = 'herd-iconpick__clear dashicons dashicons-no-alt';
		clear.setAttribute( 'aria-label', 'Clear icon' );
		// A sibling of the trigger, not a child of it: a button inside a button is
		// neither valid nor reachable.
		picker.insertBefore( clear, panel );
	}

	const shown = () => tiles.filter( ( button ) => ! button.hidden );

	/** One tile at a time is tabbable — the chosen one, or the way in. */
	const roam = () => {
		const list = shown();
		const current = list.find( ( button ) => button.getAttribute( 'aria-checked' ) === 'true' ) || list[ 0 ];
		tiles.forEach( ( button ) => {
			button.tabIndex = button === current ? 0 : -1;
		} );
	};

	const paint = () => {
		const value = select.value;
		const name = names.get( value ) || '';
		const chosen = Boolean( value && name );
		picker.classList.toggle( 'is-empty', ! chosen );
		chip.innerHTML = chosen ? iconSvg( value ) : '';
		nameEl.textContent = chosen ? name : 'Choose an icon';
		foot.textContent = chosen ? `${ name } selected` : 'Nothing selected';
		if ( clear ) clear.hidden = ! chosen;
		tiles.forEach( ( button ) => {
			button.setAttribute( 'aria-checked', String( button.dataset.value === value ) );
		} );
		roam();
	};

	const commit = ( value ) => {
		select.value = value;
		// Native and bubbling: ACF's conditional logic, Herd's serializer and the
		// repeater row's thumbnail all listen for this one.
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		paint();
	};

	const close = () => {
		if ( typeof panel.hidePopover === 'function' ) panel.hidePopover();
	};

	grid.addEventListener( 'click', ( event ) => {
		const button = event.target.closest?.( '.herd-icontile' );
		if ( ! button ) return;
		commit( button.dataset.value );
		close();
		trigger.focus();
	} );

	if ( clear ) {
		clear.addEventListener( 'click', () => {
			commit( '' );
			trigger.focus();
		} );
	}

	/*
	 * The grid wraps, so up and down move by however many columns it currently
	 * has rather than by a number fixed at build time. Arrows move focus only:
	 * selecting as you travel would fire a change event per icon passed, and the
	 * card row thumbnail redraws on every one of them.
	 */
	const columns = () => {
		const template = getComputedStyle( grid ).gridTemplateColumns || '';
		return Math.max( 1, template.split( ' ' ).filter( Boolean ).length );
	};

	grid.addEventListener( 'keydown', ( event ) => {
		const list = shown();
		if ( ! list.length ) return;
		const from = Math.max( 0, list.indexOf( event.target.closest?.( '.herd-icontile' ) ) );
		let next = null;
		if ( event.key === 'Home' ) next = 0;
		else if ( event.key === 'End' ) next = list.length - 1;
		else if ( event.key === 'ArrowRight' ) next = from + 1;
		else if ( event.key === 'ArrowLeft' ) next = from - 1;
		else if ( event.key === 'ArrowDown' ) next = from + columns();
		else if ( event.key === 'ArrowUp' ) next = from - columns();
		if ( next === null ) return;
		event.preventDefault();
		// Clamped, not wrapped: in a grid, wrapping past the last row lands
		// somewhere the eye was not travelling towards.
		const target = list[ Math.min( list.length - 1, Math.max( 0, next ) ) ];
		tiles.forEach( ( button ) => {
			button.tabIndex = button === target ? 0 : -1;
		} );
		target.focus();
	} );

	const filter = () => {
		const term = normalize( search.value );
		tiles.forEach( ( button ) => {
			const hay = normalize( `${ button.dataset.value } ${ names.get( button.dataset.value ) }` );
			button.hidden = Boolean( term ) && ! hay.includes( term );
		} );
		const any = shown().length > 0;
		empty.hidden = any;
		if ( ! any ) empty.textContent = `No icons match “${ search.value.trim() }”. Try a shorter word, like “map”.`;
		roam();
	};
	if ( search ) search.addEventListener( 'input', filter );

	const place = () => {
		if ( ! trigger.isConnected ) return;
		const rect = trigger.getBoundingClientRect();
		const below = window.innerHeight - rect.bottom;
		const flip = below < MIN_SPACE && rect.top > below;
		const width = Math.min( Math.max( rect.width, MIN_WIDTH ), window.innerWidth - GAP * 2 );
		// Aligned with the trigger, but never hanging off the right of the screen.
		panel.style.left = `${ Math.max( GAP, Math.min( rect.left, window.innerWidth - width - GAP ) ) }px`;
		panel.style.width = `${ width }px`;
		if ( flip ) {
			panel.style.top = 'auto';
			panel.style.bottom = `${ window.innerHeight - rect.top + GAP }px`;
			panel.style.maxHeight = `${ rect.top - GAP * 2 }px`;
		} else {
			panel.style.bottom = 'auto';
			panel.style.top = `${ rect.bottom + GAP }px`;
			panel.style.maxHeight = `${ below - GAP * 2 }px`;
		}
	};

	panel.addEventListener( 'beforetoggle', ( event ) => {
		const open = event.newState === 'open';
		trigger.setAttribute( 'aria-expanded', String( open ) );
		if ( open ) {
			if ( search ) {
				search.value = '';
				filter();
			}
			// Synchronous, before the browser paints the panel anywhere else.
			place();
			window.addEventListener( 'scroll', place, true );
			window.addEventListener( 'resize', place );
		} else {
			window.removeEventListener( 'scroll', place, true );
			window.removeEventListener( 'resize', place );
		}
	} );

	// `toggle` is queued, so by the time it runs the panel is displayed and can
	// take focus; `beforetoggle` fires while it is still hidden.
	panel.addEventListener( 'toggle', ( event ) => {
		if ( event.newState !== 'open' ) return;
		if ( search ) search.focus();
		else shown().find( ( button ) => button.tabIndex === 0 )?.focus();
	} );

	// Conditional logic and revisions change the select without touching the grid.
	select.addEventListener( 'change', paint );
	paint();
	return picker;
}

/**
 * Front every icon select in a mounted form with a picker.
 *
 * @param {HTMLElement} form The initialised ACF form.
 */
export function decorateIcons( form ) {
	if ( ! form || ! hasIcons() ) return;
	// Without the top layer the panel would be clipped by the repeater card it
	// opens inside. A plain select an editor can still use beats a picker they
	// cannot see, so the field is left as ACF rendered it.
	if ( typeof HTMLElement === 'undefined' || typeof HTMLElement.prototype.showPopover !== 'function' ) return;
	form.querySelectorAll( '.acf-field-select' ).forEach( ( field ) => {
		if ( field.classList.contains( 'herd-has-icons' ) || field.closest( '.acf-clone' ) ) return;
		const select = field.querySelector( 'select' );
		if ( ! select || ! isIconSelect( select ) ) return;
		field.classList.add( 'herd-has-icons' );
		select.closest( '.acf-input' ).appendChild( buildPicker( field, select ) );
	} );
}
