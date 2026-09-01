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
	window.dispatchEvent( new CustomEvent( 'herd:rail-tab-selected', { detail: { tab: name } } ) );
}

function revisionChangeText( change ) {
	const title = String( change.after?.name || change.before?.name || change.id || 'Block' ).replace( /^acf\//, '' ).replace( /[-_]/g, ' ' );
	if ( change.type === 'added' ) return `${ title } added`;
	if ( change.type === 'removed' ) return `${ title } removed`;
	if ( change.type === 'moved' ) return `${ title } moved`;
	if ( change.type === 'type' ) return `Block changed from ${ change.before } to ${ change.after }`;
	if ( change.type === 'anchor' ) return `${ title } anchor changed`;
	if ( change.type === 'fields' ) return `${ title } fields changed`;
	return `${ title } changed`;
}

/** Load revision metadata only when History is opened, then keep restoration in
 * WordPress's native revision screen. */
export function wireRevisionHistory() {
	const panel = document.getElementById( 'herd-panel-history' );
	const config = window.HerdEditor;
	if ( !panel || !config?.postId || !config?.revisionsNonce ) return;
	let loaded = false;
	const request = async ( action, fields = {} ) => {
		const body = new URLSearchParams( { action, nonce: config.revisionsNonce, postId: String( config.postId ), ...fields } );
		const result = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', body } ).then( ( response ) => response.json() );
		if ( !result?.success ) throw new Error( result?.data?.message || 'History could not be loaded.' );
		return result.data;
	};
	const renderChanges = ( host, changes, restoreUrl ) => {
		host.replaceChildren();
		if ( !changes.length ) host.append( Object.assign( document.createElement( 'p' ), { className: 'herd-history__empty', textContent: 'No block-level changes from the current version.' } ) );
		else {
			const list = document.createElement( 'ul' ); list.className = 'herd-history__changes';
			changes.forEach( ( change ) => {
				const item = Object.assign( document.createElement( 'li' ), { textContent: revisionChangeText( change ) } );
				if ( change.type === 'fields' && change.fields?.length ) {
					const fields = document.createElement( 'ul' );
					change.fields.forEach( ( field ) => fields.append( Object.assign( document.createElement( 'li' ), { textContent: `${ field.label }: ${ field.before || 'empty' } → ${ field.after || 'empty' }` } ) ) );
					item.append( fields );
				}
				list.append( item );
			} );
			host.append( list );
		}
		if ( restoreUrl ) {
			const link = Object.assign( document.createElement( 'a' ), { className: 'button', href: restoreUrl, textContent: 'Open native revision restore' } );
			host.append( link );
		}
	};
	const load = async () => {
		if ( loaded ) return;
		loaded = true;
		const module = document.createElement( 'section' ); module.className = 'herd-history';
		module.append( Object.assign( document.createElement( 'p' ), { textContent: 'Loading revisions…' } ) ); panel.prepend( module );
		try {
			const { revisions } = await request( 'herd_editor_revisions' );
			module.replaceChildren();
			if ( !revisions.length ) { module.append( Object.assign( document.createElement( 'p' ), { textContent: 'No revisions yet.' } ) ); return; }
			const select = document.createElement( 'select' ); select.setAttribute( 'aria-label', 'Compare revision' );
			select.append( Object.assign( document.createElement( 'option' ), { value: '', textContent: 'Choose a revision…' } ) );
			revisions.forEach( ( revision ) => select.append( Object.assign( document.createElement( 'option' ), { value: revision.id, textContent: `${ revision.date } · ${ revision.author }` } ) ) );
			const results = document.createElement( 'div' ); results.className = 'herd-history__results';
			select.addEventListener( 'change', async () => {
				if ( !select.value ) return results.replaceChildren();
				results.textContent = 'Comparing revisions…';
				try { const comparison = await request( 'herd_editor_revision_compare', { revisionId: select.value } ); renderChanges( results, comparison.changes || [], comparison.restoreUrl ); } catch ( error ) { results.textContent = error.message; }
			} );
			module.append( Object.assign( document.createElement( 'h3' ), { textContent: 'Compare revisions' } ), select, results );
		} catch ( error ) { module.textContent = error.message; }
	};
	window.addEventListener( 'herd:rail-tab-selected', ( event ) => { if ( event.detail?.tab === 'history' ) load(); } );
	if ( document.getElementById( 'herd-tab-history' )?.getAttribute( 'aria-selected' ) === 'true' ) load();
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
	const markDirty = ( name ) => {
		const tab = available.find( ( candidate ) => candidate.dataset.tab === name );
		if ( !tab || tab.querySelector( '.herd-rail__dirty' ) ) return;
		const marker = document.createElement( 'span' );
		marker.className = 'herd-rail__dirty';
		marker.textContent = 'Unsaved';
		tab.appendChild( marker );
	};
	/* The originating field identifies its own tab. A domain only says that some
	 * page setting is dirty and must never paint every tab as the old code did. */
	window.addEventListener( 'herd:rail-tab-dirty', ( event ) => markDirty( event.detail?.tab ) );
	window.addEventListener( 'herd:dirty-domains', ( event ) => {
		const dirty = event.detail?.acfMeta || event.detail?.nativeMeta || event.detail?.core;
		if ( !dirty ) available.forEach( ( tab ) => tab.querySelector( '.herd-rail__dirty' )?.remove() );
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

	/*
	 * What the post actually got called.
	 *
	 * Until a post is published its post_name is empty -- wp_insert_post() only
	 * derives one from the title once the status leaves draft -- so a draft save
	 * answers with '' and the display goes on following the title, which is
	 * right. A publish answers with the real slug, and the real slug is not
	 * always the derived one: WordPress uniquifies it, so the second page called
	 * "About" is about-2 and no amount of deriving in the browser would know it.
	 *
	 * Writing it into #post_name pins it, which is the correct outcome from here
	 * on: a published post's slug does not follow its title either.
	 */
	window.addEventListener( 'herd:saved', ( event ) => {
		const saved = event.detail?.slug;
		if ( ! saved || wrap.classList.contains( 'is-editing' ) ) return;
		input.value = saved;
		value.textContent = shown();
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
 * Two ways in. A Herd save answers over AJAX and says what happened in the
 * reply, which arrives here as herd:saved. A save made anywhere else -- Classic,
 * a restored revision -- still comes back on a redirect and says it in the URL,
 * and that one is already on the page by the time this runs.
 *
 * Dismissing has to deal with both: hiding the notice, and taking the message
 * out of the URL. Leave it there and a reload congratulates you again for a save
 * you made ten minutes ago.
 *
 * The button ships hidden, so a bundle that never runs leaves a notice that
 * scrolls away rather than one with a dead control in it.
 */
export function wireSavedNotice() {
	const notice = document.getElementById( 'herd-saved' );
	const button = document.getElementById( 'herd-saved-dismiss' );
	if ( ! notice || ! button ) return;

	/*
	 * A Herd save does not reload the screen any more, so the notice it earns
	 * cannot arrive as part of a fresh document: the save endpoint returns the
	 * same { text, label, url } that herd_editor_saved_notice() prints, and the
	 * shell sitting here hidden is filled in from it.
	 *
	 * The nodes are filled rather than rebuilt because the anchor carries a
	 * dashicon and a screen-reader-text span that have nothing to do with which
	 * save this is -- replacing its innerHTML would throw both away.
	 */
	const show = ( saved ) => {
		if ( ! saved?.text ) return;
		const text = notice.querySelector( '.herd-saved__text' );
		if ( text ) text.textContent = saved.text;
		const link = notice.querySelector( '.herd-saved__link' );
		if ( link ) {
			const label = link.querySelector( '.herd-saved__link-text' );
			if ( label ) label.textContent = saved.label || '';
			if ( saved.url && saved.label ) {
				link.href = saved.url;
				link.hidden = false;
			} else {
				link.hidden = true;
			}
		}
		/* Re-inserted rather than merely unhidden, so role="status" announces a
		 * second save as well as the first: an assistive technology reports what
		 * changes inside a live region, and a notice that was already on screen
		 * saying "Page updated." does not change when it says it again. */
		const parent = notice.parentNode;
		const next = notice.nextSibling;
		notice.remove();
		notice.hidden = false;
		parent?.insertBefore( notice, next );
	};
	window.addEventListener( 'herd:saved', ( event ) => show( event.detail?.notice ) );

	button.hidden = false;
	button.addEventListener( 'click', () => {
		/* Hidden rather than removed: there is another save coming, and a notice
		 * torn out of the document has nothing left for show() to fill in. */
		notice.hidden = true;
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
		wireRevisionHistory();
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
