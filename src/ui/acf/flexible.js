/**
 * Flexible-content layouts become the same row as everything else.
 *
 * ACF calls them layouts; this site calls them modules, and the Page with
 * Sidebar block is 25 of them across two fields — 18 in the main column, 7 in
 * the sidebar. It is the heaviest thing an editor opens, and it was the one
 * container Herd had never dressed: a blue bar, a green Add button, and a body
 * laid out in ACF's single narrow column while the block around it was on
 * Herd's grid.
 *
 * Nothing is rebuilt here. ACF already owns collapse, the title, drag, rename,
 * disable, and expand/collapse-all, and it binds all of it on `data-name`
 * attributes and on its own two button classes. So this takes the elements and
 * leaves the behaviour, the way ./repeater.js takes ACF's `data-event` anchors:
 * classes are rewritten, glyphs are replaced, a grip and a summary are added,
 * and every hook ACF listens on is left exactly where it was.
 *
 * The one thing ACF does not provide is the summary line, which is the highest
 * value element in the system — "Cards Collection" three times tells an editor
 * nothing. It is the same line a repeater card row carries, from the same
 * `describeRow`, because a layout body and a repeater row are the same shape.
 */

import { GRIP_ICON } from './grip.js';
import { cleanText, humanize } from '../summary.js';
import { describeRow, singularize } from './values.js';

/**
 * ACF's layout controls, restyled as Herd's own.
 *
 * `data-name` is what ACF's delegated handlers select on, so it is the one thing
 * on these anchors that must survive. Order is the order they are appended in,
 * which is not ACF's: the chevron leaves the tool group and becomes the row's
 * own disclosure, at the end, where the block row and the card row put theirs.
 */
const LAYOUT_TOOLS = [
	{ name: 'add-layout', icon: 'plus-alt2', label: 'Add module below' },
	{ name: 'duplicate-layout', icon: 'admin-page', label: 'Duplicate module' },
	{ name: 'more-layout-actions', icon: 'ellipsis', label: 'More actions' },
	{ name: 'remove-layout', icon: 'no-alt', label: 'Remove module', destructive: true },
];

/** WP core's `.button` carries its own metrics and this site's green. */
const CORE_BUTTON = [ 'button', 'button-primary', 'acf-button', 'acf-btn', 'acf-btn-clear' ];

/**
 * What one of these is called, singular.
 *
 * From ACF's own button label — "Add Module" is authored per field and is the
 * only place a field group says what its layouts are. Falls back to the field
 * name, then to the generic, so a field that left the label at ACF's default
 * still counts in words rather than in nothing.
 *
 * @param {HTMLElement} field The `.acf-field-flexible-content` wrapper.
 * @param {HTMLElement} flex  Its `.acf-flexible-content` container.
 * @return {string} A lower-case singular noun.
 */
export function moduleNoun( field, flex ) {
	const label = ( flex.dataset.buttonLabel || '' ).replace( /^\s*add\s+/i, '' ).trim();
	const noun = label || humanize( field.dataset.name || '' ) || 'module';
	return singularize( noun ).toLowerCase();
}

/** The field's own label, which becomes the header's title. */
function fieldTitle( field ) {
	return cleanText( field.querySelector( ':scope > .acf-label label' )?.textContent )
		|| humanize( field.dataset.name || '' );
}

/** ACF's own layouts, never the templates it clones them from. */
function realLayouts( flex ) {
	const values = flex.querySelector( ':scope > .values' );
	if ( ! values ) return [];
	return Array.from( values.children ).filter( ( node ) => node.classList?.contains( 'layout' ) );
}

/**
 * Demote one of ACF's buttons to Herd's own.
 *
 * `acf-fc-expand-all` and `acf-fc-collapse-all` are the two places in flexible
 * content where ACF binds on a class rather than on `data-name`, so those two
 * are kept and only the styling classes go.
 *
 * @param {HTMLElement} button   The button or anchor.
 * @param {string}      variant  Extra Herd class, if any.
 * @param {string}      relabel  Replacement label, if any.
 */
function demote( button, variant, relabel ) {
	if ( ! button ) return;
	CORE_BUTTON.forEach( ( name ) => button.classList.remove( name ) );
	button.classList.add( 'herd-btn' );
	if ( variant ) button.classList.add( variant );
	// ACF puts a `<i class="acf-icon -plus small">` in the add button; the label
	// is enough, and the icon is drawn in ACF's own sprite.
	button.querySelector( '.acf-icon' )?.remove();
	const text = relabel || cleanText( button.textContent );
	// Sentence case, like every other label in the editor.
	button.textContent = text.charAt( 0 ).toUpperCase() + text.slice( 1 ).toLowerCase();
}

/**
 * Dress the field's top action bar as the header the repeater already has.
 *
 * ACF renders the same Add button twice, above and below the layouts, and hides
 * this header entirely while the field is empty — so the one below is the only
 * way into an empty field. The stylesheet swaps the two over on `-empty` rather
 * than either being removed, because ACF's handler is bound to both.
 *
 * @param {HTMLElement} field The `.acf-field-flexible-content` wrapper.
 * @param {HTMLElement} flex  Its `.acf-flexible-content` container.
 * @return {?HTMLElement} The count node, or null when ACF rendered no top bar.
 */
function buildHead( field, flex ) {
	const head = flex.querySelector( ':scope > .acf-fc-top-actions' );
	if ( ! head ) return null;
	head.classList.add( 'herd-flex__head' );

	const title = document.createElement( 'span' );
	title.className = 'herd-flex__title';
	title.textContent = fieldTitle( field );

	const count = document.createElement( 'span' );
	count.className = 'herd-flex__count';

	const spacer = document.createElement( 'span' );
	spacer.className = 'herd-flex__spacer';

	head.prepend( title, count, spacer );

	demote( head.querySelector( '.acf-fc-expand-all' ), null, 'Expand all' );
	demote( head.querySelector( '.acf-fc-collapse-all' ), null, 'Collapse all' );
	// ACF's separator was drawing a rule between two controls that now sit in a
	// row of controls; the spacer above is what separates the pair from the title.
	head.querySelector( '.acf-separator' )?.remove();

	return count;
}

/**
 * Dress one layout's action bar as a Herd row.
 *
 * @param {HTMLElement} layout The `.values > .layout` element.
 * @return {?{summary: HTMLElement}} The parts to keep, or null if already done.
 */
function dressRow( layout ) {
	const bar = layout.querySelector( ':scope > .acf-fc-layout-actions-wrap' );
	if ( ! bar || bar.classList.contains( 'herd-fcrow' ) ) return null;
	bar.classList.add( 'herd-fcrow' );

	const handle = bar.querySelector( ':scope > .acf-fc-layout-handle' );
	const title = bar.querySelector( '.acf-fc-layout-title' );
	if ( ! handle || ! title ) return null;

	const grip = document.createElement( 'i' );
	grip.className = 'herd-grip';
	grip.innerHTML = GRIP_ICON;
	handle.prepend( grip );

	/*
	 * Name over summary, the block row and card row anatomy one level down.
	 *
	 * Wrapping the title rather than replacing it: ACF re-renders the layout
	 * title through its `layout_title` filter on every collapse and writes the
	 * result into `.acf-fc-layout-title` by class. Only that element's contents
	 * change, so the wrapper and the summary beside it survive.
	 */
	const main = document.createElement( 'span' );
	main.className = 'herd-fcrow__main';
	title.after( main );
	main.appendChild( title );
	const original = bar.querySelector( '.acf-fc-layout-original-title' );
	if ( original ) main.appendChild( original );

	const summary = document.createElement( 'span' );
	summary.className = 'herd-fcrow__summary';
	main.appendChild( summary );

	const controls = bar.querySelector( '.acf-fc-layout-controls' );
	if ( controls ) {
		controls.classList.add( 'herd-fcrow__tools' );
		LAYOUT_TOOLS.forEach( ( { name, icon, label, destructive } ) => {
			const anchor = controls.querySelector( `[data-name="${ name }"]` );
			if ( ! anchor ) return;
			/*
			 * `acf-js-tooltip` goes with the rest of the class list: ACF's tooltip
			 * reads the same `title` this sets and would float a second copy of it
			 * over a control that already says what it is to a screen reader.
			 */
			anchor.className = `herd-fcrow__tool${ destructive ? ' is-destructive' : '' }`;
			anchor.textContent = '';
			const glyph = document.createElement( 'span' );
			glyph.className = `dashicons dashicons-${ icon }`;
			glyph.setAttribute( 'aria-hidden', 'true' );
			anchor.appendChild( glyph );
			anchor.title = label;
			anchor.setAttribute( 'aria-label', label );
			// Append rather than leave in place: ACF's order puts remove third of
			// four, and destructive belongs at the end of a tool group.
			controls.appendChild( anchor );
		} );

		// The chevron leaves the tool group. It is the row's disclosure, not a tool.
		const chevron = controls.querySelector( '.acf-layout-collapse [data-name="collapse-layout"]' );
		if ( chevron ) {
			const wrap = chevron.parentElement;
			chevron.className = 'herd-fcrow__chev dashicons dashicons-arrow-down-alt2';
			chevron.title = 'Toggle module';
			chevron.setAttribute( 'aria-label', 'Toggle module' );
			// Moved out before its wrapper goes, or it goes with it.
			controls.appendChild( chevron );
			wrap?.remove();
		}
	}

	return { summary };
}

/**
 * Collapse a layout without asking ACF to.
 *
 * ACF's own `closeLayout` fires an AJAX request per layout to re-render the
 * title through the `layout_title` filter. That is right when a person collapses
 * one row; it is 25 requests when a block opens. This makes the same two
 * statements ACF's does — the class, and the `hide` action anything with a
 * measured height listens for — and leaves the title alone, because nothing has
 * changed since the server rendered it.
 *
 * ACF persists the collapsed set on unload, so this becomes what the editor
 * finds next time too.
 *
 * @param {HTMLElement} layout The layout to close.
 */
function collapse( layout ) {
	if ( layout.classList.contains( '-collapsed' ) ) return;
	layout.classList.add( '-collapsed' );
	const jq = window.jQuery;
	if ( jq && window.acf?.doAction ) window.acf.doAction( 'hide', jq( layout ), 'collapse' );
}

/**
 * Dress every flexible-content field in a mounted form.
 *
 * @param {HTMLElement} form     The initialised ACF form.
 * @param {Function}    onLayout Called with each layout ACF adds, so the field
 *                               decorators can reach it.
 * @return {Function} Disposer for the observers this attached.
 */
export function decorateFlexible( form, onLayout ) {
	const disposers = [];
	if ( ! form ) return () => {};
	form.querySelectorAll( '.acf-field-flexible-content' ).forEach( ( field ) => {
		// `.acf-clone` is a repeater's template row and `.clones` is this field's
		// own; neither renders, and both are copied from rather than edited.
		if ( field.closest( '.acf-clone, .clones' ) ) return;
		const dispose = decorateField( field, onLayout );
		if ( dispose ) disposers.push( dispose );
	} );
	return () => disposers.forEach( ( dispose ) => dispose() );
}

function decorateField( field, onLayout ) {
	const flex = field.querySelector( ':scope > .acf-input > .acf-flexible-content' );
	if ( ! flex || flex.classList.contains( 'herd-flex' ) ) return null;
	flex.classList.add( 'herd-flex' );

	const noun = moduleNoun( field, flex );
	const count = buildHead( field, flex );

	/*
	 * Both add buttons, not just the header's. ACF hides the header while the
	 * field is empty, so the one below the empty state is the only one on screen
	 * until the first module exists — and it is the one that was still arriving
	 * as a green `button-primary`.
	 */
	flex.querySelectorAll( ':scope > .acf-actions > [data-name="add-layout"]' )
		.forEach( ( add ) => demote( add, 'herd-btn--accent' ) );

	/*
	 * ACF's empty state quotes the button label back at you — `Click the "Add
	 * Module" button below to start creating your layout` — which stopped being
	 * true the moment the button above went to sentence case, and was never an
	 * invitation to begin with.
	 */
	const empty = flex.querySelector( ':scope > .no-value-message' );
	if ( empty ) empty.textContent = `No ${ noun }s yet. Add one to start.`;

	const refresh = ( layout ) => {
		const summary = layout.herdSummary;
		const body = layout.querySelector( ':scope > .acf-fields' );
		if ( ! summary || ! body ) return;
		const described = describeRow( body );
		/*
		 * A layout's name is its own title, which ACF renders and renames; the
		 * summary is everything the name is not. So unlike a repeater row, the
		 * name `describeRow` finds is a summary fragment here rather than a
		 * heading, and is put back at the front of the line.
		 */
		summary.textContent = [ described.name, described.summary ].filter( Boolean ).join( ' · ' );
	};

	const paintCount = ( layouts ) => {
		if ( ! count ) return;
		count.textContent = `${ layouts.length } ${ layouts.length === 1 ? noun : `${ noun }s` }`;
	};

	const refreshAll = () => {
		const layouts = realLayouts( flex );
		layouts.forEach( ( layout ) => {
			if ( layout.herdSummary ) return;
			if ( onLayout ) onLayout( layout );
			const parts = dressRow( layout );
			if ( parts ) layout.herdSummary = parts.summary;
		} );
		layouts.forEach( refresh );
		paintCount( layouts );
	};

	const values = flex.querySelector( ':scope > .values' );
	const observer = new MutationObserver( () => {
		/*
		 * jQuery UI reorders by moving the dragged element between its siblings,
		 * which is a childList mutation on every pass under another layout.
		 * Reordering changes neither the count nor any summary.
		 */
		if ( values.querySelector( '.ui-sortable-helper' ) ) return;
		refreshAll();
	} );
	if ( values ) observer.observe( values, { childList: true } );

	const onEdit = ( event ) => {
		const layout = event.target.closest?.( '.layout' );
		if ( layout && layout.herdSummary ) refresh( layout );
	};
	flex.addEventListener( 'input', onEdit );
	flex.addEventListener( 'change', onEdit );

	/*
	 * Collapse before a drag starts, for the reason the repeater does: an open
	 * layout is most of the list's height, so the drop targets slide out from
	 * under the cursor as soon as it moves. ACF takes the handle as its sortable
	 * handle, so a press there is the signal.
	 */
	const onDragStart = ( event ) => {
		if ( ! event.target.closest( '.acf-fc-layout-handle' ) ) return;
		realLayouts( flex ).forEach( collapse );
	};
	flex.addEventListener( 'mousedown', onDragStart );

	refreshAll();
	// Collapsed is the default state, here as everywhere.
	realLayouts( flex ).forEach( collapse );

	return () => {
		observer.disconnect();
		flex.removeEventListener( 'input', onEdit );
		flex.removeEventListener( 'change', onEdit );
		flex.removeEventListener( 'mousedown', onDragStart );
	};
}
