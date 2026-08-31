/**
 * Rail assembly.
 *
 * WordPress renders every meta box once, into the hidden staging area at the
 * bottom of the form. This module distributes those .postbox nodes into the rail
 * tabs and relocates the native Preview and Update actions into the command bar.
 *
 * Nothing is cloned and nothing leaves form#post, so every box still posts
 * exactly as WordPress expects. If anything here throws, the staging area is
 * revealed so the publish box is never unreachable.
 */

import { wirePublishBox } from './publish-box.js';

/**
 * The block editor's own slug helper, when WordPress has it on the page.
 *
 * `wp-url` is an enqueue dependency of this screen, so in a browser this is
 * always @wordpress/url's cleanForSlug -- the exact function behind the block
 * editor's permalink. The fallback exists because this module is deliberately
 * free of build-time imports so it can be tested in plain node, and it is a
 * close paraphrase rather than a copy: it decomposes accents instead of pulling
 * in remove-accents' character map. Nothing rests on the difference. The value
 * is only ever displayed, and WordPress derives the real one on save.
 *
 * @param {string} text Text to slugify.
 * @return {string} The slug.
 */
function cleanForSlug( text ) {
	if ( window.wp?.url?.cleanForSlug ) return window.wp.url.cleanForSlug( text );
	if ( ! text ) return '';
	return text
		.normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' )
		.replace( /(&nbsp;|&ndash;|&mdash;)/g, '-' )
		.replace( /[\s./]+/g, '-' )
		.replace( /&\S+?;/g, '' )
		.replace( /[^\p{L}\p{N}_-]+/gu, '' )
		.toLowerCase()
		.replace( /-+/g, '-' )
		.replace( /(^-+)|(-+$)/g, '' );
}

const STORAGE_KEY = 'herd-editor-rail-tab';
const FALLBACK_TAB = 'more';

function readMap() {
	const node = document.getElementById( 'herd-rail-map' );
	if ( ! node ) return {};
	try {
		return JSON.parse( node.textContent ) || {};
	} catch ( error ) {
		return {};
	}
}

/**
 * The Update and Preview buttons belong in the command bar, not the rail.
 *
 * Update goes where it is read. Preview goes to a clipped host beside it and is
 * never looked at: the View menu's "Preview your changes" presses core's own
 * button, so core's handler is what runs and there is no second preview URL to
 * keep in step with the first. Moving the node rather than reading its href also
 * carries the #wp-preview input inside it, which a preview submission needs.
 */
function liftPublishActions() {
	const target = document.getElementById( 'herd-bar-native' );
	if ( ! target ) return;
	const host = document.getElementById( 'herd-bar-preview-host' ) || target;
	[ [ 'preview-action', host ], [ 'publishing-action', target ] ].forEach( ( [ id, into ] ) => {
		const node = document.getElementById( id );
		if ( node ) into.appendChild( node );
	} );
}

function distribute( map ) {
	const staging = document.getElementById( 'herd-staging' );
	const main = document.getElementById( 'herd-main-boxes' );
	if ( ! staging ) return;

	Array.from( staging.querySelectorAll( '.postbox' ) ).forEach( ( box ) => {
		const tab = map[ box.id ] || FALLBACK_TAB;
		const destination = tab === 'main' ? main : document.getElementById( `herd-panel-${ tab }` );
		( destination || document.getElementById( `herd-panel-${ FALLBACK_TAB }` ) || main ).appendChild( box );
	} );

	staging.remove();
}

function selectTab( tabs, panels, name ) {
	tabs.forEach( ( tab ) => {
		const selected = tab.dataset.tab === name;
		tab.setAttribute( 'aria-selected', selected ? 'true' : 'false' );
		tab.tabIndex = selected ? 0 : -1;
	} );
	panels.forEach( ( panel ) => {
		panel.hidden = panel.dataset.panel !== name;
	} );
	try {
		window.localStorage.setItem( STORAGE_KEY, name );
	} catch ( error ) {
		// Private browsing; the tab choice simply is not remembered.
	}
}

function buildTabs() {
	const tablist = document.querySelector( '.herd-rail__tabs' );
	if ( ! tablist ) return;
	const panels = Array.from( document.querySelectorAll( '.herd-rail__panel' ) );
	const tabs = Array.from( tablist.querySelectorAll( '.herd-rail__tab' ) );

	const available = tabs.filter( ( tab ) => {
		const panel = panels.find( ( candidate ) => candidate.dataset.panel === tab.dataset.tab );
		if ( ! panel ) return false;
		if ( panel.children.length ) return true;
		// Core only registers the revisions box once a post has revisions.
		if ( tab.dataset.tab === 'history' ) {
			const empty = document.createElement( 'p' );
			empty.className = 'herd-rail__empty';
			empty.textContent = 'No revisions yet.';
			panel.appendChild( empty );
			return true;
		}
		return false;
	} );

	if ( ! available.length ) return;

	available.forEach( ( tab ) => {
		tab.hidden = false;
	} );
	tablist.hidden = false;

	let stored = null;
	try {
		stored = window.localStorage.getItem( STORAGE_KEY );
	} catch ( error ) {
		stored = null;
	}
	const initial = available.find( ( tab ) => tab.dataset.tab === stored ) || available[ 0 ];
	selectTab( available, panels, initial.dataset.tab );

	tablist.addEventListener( 'click', ( event ) => {
		const tab = event.target.closest( '.herd-rail__tab' );
		if ( tab && ! tab.hidden ) selectTab( available, panels, tab.dataset.tab );
	} );

	tablist.addEventListener( 'keydown', ( event ) => {
		const step = { ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last' }[ event.key ];
		if ( step === undefined ) return;
		event.preventDefault();
		const current = available.findIndex( ( tab ) => tab.getAttribute( 'aria-selected' ) === 'true' );
		let next = 0;
		if ( step === 'last' ) next = available.length - 1;
		else if ( step !== 'first' ) next = ( current + step + available.length ) % available.length;
		selectTab( available, panels, available[ next ].dataset.tab );
		available[ next ].focus();
	} );
}

/**
 * The slug reads as text until asked for, and there are two ways to ask.
 *
 * The slug itself is a button, and the Edit link after it is another. The link
 * is what makes the line look editable at a glance; the slug's own hover border
 * is a hint you have to go looking for. Leaving is the reverse: focus goes back
 * to whichever of the two opened the field, not always to the same one.
 *
 * The visible value lives in a span of its own so rewriting it on every collapse
 * cannot take the slug button's name with it.
 *
 * The markup ships in its no-JS state -- the input visible, the slug and the link
 * hidden -- so a bundle that never runs leaves an editable slug rather than an
 * unreachable one. This inverts that once, then toggles.
 */
export function wireSlugEditor() {
	const wrap = document.getElementById( 'herd-slug' );
	const slug = document.getElementById( 'herd-slug-text' );
	const value = document.getElementById( 'herd-slug-value' );
	const edit = document.getElementById( 'herd-slug-edit' );
	const input = document.getElementById( 'post_name' );
	const title = document.getElementById( 'title' );
	if ( ! wrap || ! slug || ! value || ! edit || ! input ) return;

	const placeholder = input.getAttribute( 'placeholder' ) || '';
	let opener = edit;

	/*
	 * The same answer the block editor gives, in the same order: the slug that
	 * has been saved, else one derived from the title, else the placeholder.
	 * (getEditedPostSlug() in @wordpress/editor, which falls back to the post id
	 * where Herd already has something better to show.)
	 *
	 * Derived only for display. Writing it into #post_name would post it as a
	 * deliberate choice and pin the slug, so a title changed before publishing
	 * would no longer be reflected -- WordPress derives the same value on save
	 * anyway, and uniquifies it, which the browser cannot.
	 */
	const derived = () => cleanForSlug( title?.value || '' );
	const shown = () => input.value || derived() || placeholder;

	const collapse = () => {
		/*
		 * Nothing was really chosen if the field still holds exactly what the
		 * title would have produced, so hand it back empty and let the slug keep
		 * following the title.
		 */
		if ( input.value && input.value === derived() ) input.value = '';
		value.textContent = shown();
		slug.hidden = false;
		edit.hidden = false;
		input.hidden = true;
		wrap.classList.remove( 'is-editing' );
	};

	const expand = ( event ) => {
		opener = event?.currentTarget || edit;
		// Open on the derived slug rather than an empty box, so it is edited, not authored.
		if ( ! input.value ) input.value = derived();
		slug.hidden = true;
		edit.hidden = true;
		input.hidden = false;
		wrap.classList.add( 'is-editing' );
		input.focus();
		input.select();
	};

	collapse();

	// Live, the way the block editor's permalink follows the title as it is typed.
	title?.addEventListener( 'input', () => {
		if ( ! wrap.classList.contains( 'is-editing' ) ) value.textContent = shown();
	} );

	slug.addEventListener( 'click', expand );
	edit.addEventListener( 'click', expand );
	input.addEventListener( 'blur', collapse );
	input.addEventListener( 'keydown', ( event ) => {
		if ( event.key !== 'Enter' && event.key !== 'Escape' ) return;
		// Enter inside form#post would submit the post; this field is done instead.
		event.preventDefault();
		collapse();
		opener.focus();
	} );
}

/**
 * The post-save notice, and getting rid of it.
 *
 * The confirmation lives in the URL -- it is how a form POST tells the page it
 * came back to what happened -- so dismissing has to take it out of the URL as
 * well as out of the DOM. Leave it there and a reload congratulates you again
 * for a save you made ten minutes ago.
 *
 * The button ships hidden, so a bundle that never runs leaves a notice that
 * scrolls away rather than one with a dead control in it.
 */
export function wireSavedNotice() {
	const notice = document.getElementById( 'herd-saved' );
	const button = document.getElementById( 'herd-saved-dismiss' );
	if ( ! notice || ! button ) return;

	button.hidden = false;
	button.addEventListener( 'click', () => {
		notice.remove();
		// Dismissing must not drop focus to the body; the back arrow is the
		// nearest thing above where the notice was.
		document.querySelector( '.herd-bar__back' )?.focus();
		try {
			const url = new URL( window.location.href );
			url.searchParams.delete( 'message' );
			url.searchParams.delete( 'revision' );
			window.history.replaceState( {}, '', url.toString() );
		} catch ( error ) {
			// An unparseable URL is not a reason to keep the notice on screen.
		}
	} );
}

export function assembleRail() {
	try {
		liftPublishActions();
		distribute( readMap() );
		buildTabs();
		wirePublishBox();
		wireSlugEditor();
		wireSavedNotice();
	} catch ( error ) {
		// Never strand the editor without a publish box, and never leave the
		// boot guard holding back a rail that will now never be assembled.
		const staging = document.getElementById( 'herd-staging' );
		if ( staging ) staging.style.display = 'block';
		document.querySelector( '.herd-editor-screen' )?.classList.remove( 'herd-editor-booting' );
		// eslint-disable-next-line no-console
		console.error( 'Herd Editor could not assemble the settings rail.', error );
	}
}
