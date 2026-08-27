/**
 * Namespacing for the widgets ACF attaches to <body>.
 *
 * A select2 dropdown, the jQuery UI datepicker calendar and flexible content's
 * two popups are appended to the document body, not to the field, so they escape
 * every selector scoped under the Herd wrapper. A select that looks right closed
 * drops a stock blue list the moment it opens.
 *
 * Both are namespaced rather than overridden globally: ACF renders the same
 * widgets on its own admin screens elsewhere on this site, and a bare
 * `.select2-dropdown` rule would follow it there. The classes added here are the
 * only hook _acf-portals.scss matches on.
 *
 * Registered once, before ACF initialises any field.
 */

export const SELECT2_CLASS = 'herd-select2';
export const DATEPICKER_CLASS = 'herd-datepicker';
export const FC_POPUP_CLASS = 'herd-fc-popup';

/** Append a class without disturbing whatever ACF or a plugin already set. */
function withClass( existing, added ) {
	const current = typeof existing === 'string' ? existing.trim() : '';
	if ( ! current ) return added;
	return current.split( /\s+/ ).includes( added ) ? current : `${ current } ${ added }`;
}

/**
 * Register the ACF JS filters that carry the namespace onto the portaled nodes.
 *
 * @param {Object} acf ACF's global input API.
 */
export function registerPortalNamespaces( acf ) {
	if ( ! acf || typeof acf.addFilter !== 'function' ) return;

	// Select, taxonomy, post object, page link and user fields with `ui` on.
	acf.addFilter( 'select2_args', ( args ) => ( {
		...args,
		containerCssClass: withClass( args?.containerCssClass, SELECT2_CLASS ),
		dropdownCssClass: withClass( args?.dropdownCssClass, SELECT2_CLASS ),
	} ) );

	/*
	 * The datepicker has no class option — jQuery UI reuses one #ui-datepicker-div
	 * for the whole page. `beforeShow` marks it on open; ACF's own beforeShow, if
	 * a filter upstream set one, still runs.
	 */
	const markCalendar = () => {
		const calendar = document.getElementById( 'ui-datepicker-div' );
		if ( calendar ) calendar.classList.add( DATEPICKER_CLASS );
	};

	const addBeforeShow = ( args ) => {
		const upstream = args?.beforeShow;
		return {
			...args,
			beforeShow( ...params ) {
				markCalendar();
				if ( typeof upstream === 'function' ) upstream.apply( this, params );
			},
		};
	};

	acf.addFilter( 'date_picker_args', addBeforeShow );
	acf.addFilter( 'date_time_picker_args', addBeforeShow );
	acf.addFilter( 'time_picker_args', addBeforeShow );

	watchFlexiblePopups();
}

/**
 * Mark flexible content's layout picker and its more-actions menu.
 *
 * ACF builds both with `acf.newPopup()`, which takes no class option and offers
 * no filter — unlike select2, and unlike the datepicker, which at least has a
 * `beforeShow`. So the body is watched instead. The popup is created on the
 * click that opens it and destroyed on the click that closes it, so this fires
 * once per opening and does nothing else.
 *
 * @return {Function} Disposer, for a caller that has one to give.
 */
export function watchFlexiblePopups() {
	if ( typeof MutationObserver !== 'function' || ! document.body ) return () => {};

	const mark = ( node ) => {
		if ( node.nodeType !== 1 ) return;
		if ( node.classList?.contains( 'acf-fc-popup' ) ) node.classList.add( FC_POPUP_CLASS );
		node.querySelectorAll?.( '.acf-fc-popup' ).forEach( ( popup ) => popup.classList.add( FC_POPUP_CLASS ) );
	};

	const observer = new MutationObserver( ( records ) => {
		records.forEach( ( record ) => record.addedNodes.forEach( mark ) );
	} );
	observer.observe( document.body, { childList: true } );
	return () => observer.disconnect();
}
