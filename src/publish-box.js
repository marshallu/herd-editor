/**
 * The publish box's three editors: status, visibility and the publish date.
 *
 * Core prints each one as a summary line with an Edit link after it, and the
 * panel the link opens ships hidden under `hide-if-js`. What opens them is
 * wp-admin/js/post.js -- a script this screen deliberately does not load,
 * because most of the rest of it is work Herd already does for itself: the post
 * lock (src/post-lock.js), the autosave messages and save state (src/ui/App.js),
 * the permalink editor (wireSlugEditor). Loading it to get three toggles would
 * mean two Heartbeat lock clients answering the same protocol.
 *
 * So this is the #submitdiv half of post.js and nothing else: the same panels,
 * the same restore-on-cancel, and the same bookkeeping afterwards -- the summary
 * lines, the Publish/Schedule/Update button and Save Draft all kept in step with
 * what has been chosen but not yet saved.
 *
 * One departure from core, forced by this screen: the status select is found
 * through #post-status-select rather than by its own id. WordPress gives the
 * select `id="post_status"`, and until the shell's hidden field was renamed to
 * `original_post_status` the same id appeared twice in form#post -- reaching it
 * through the panel that contains it is unambiguous whatever else is on the page.
 *
 * Nothing here is Herd's markup. Every id and class below is WordPress's own,
 * printed by post_submit_meta_box() and touch_time(), so anything absent -- a
 * contributor gets no status select and no date editor at all -- is skipped
 * rather than assumed.
 */

import { endSave } from './save-progress.js';

/** Two digits, the way core pads the hour and minute it writes into the stamp. */
const pad = ( value ) => ( '00' + value ).slice( -2 );

export function wirePublishBox() {
	const byId = ( id ) => document.getElementById( id );
	const box = byId( 'submitdiv' );
	if ( ! box ) return;

	const publishButton = byId( 'publish' );
	const saveDraft = byId( 'save-post' );
	const setButton = ( label ) => {
		if ( publishButton ) publishButton.value = label;
	};

	const statusPanel = byId( 'post-status-select' );
	const statusSelect = statusPanel?.querySelector( 'select[name="post_status"]' ) || null;
	const statusEdit = box.querySelector( '.edit-post-status' );
	const statusDisplay = byId( 'post-status-display' );

	const visibilityPanel = byId( 'post-visibility-select' );
	const visibilityEdit = box.querySelector( '#visibility .edit-visibility' );
	const visibilityDisplay = byId( 'post-visibility-display' );
	const radios = visibilityPanel ? Array.from( visibilityPanel.querySelectorAll( 'input[name="visibility"]' ) ) : [];
	const chosenVisibility = () => radios.find( ( radio ) => radio.checked )?.value;

	const datePanel = byId( 'timestampdiv' );
	const dateEdit = box.querySelector( '.edit-timestamp' );
	const stamp = byId( 'timestamp' );

	/*
	 * The status the post was loaded with, which is not the same question as the
	 * status now selected: it is how the date line decides between "Publish on"
	 * and "Published on", and whether the Published option in the select is real
	 * yet. #hidden_post_status answers the same thing where the shell's field is
	 * missing; it differs only in reporting an auto-draft as a draft, which none
	 * of the comparisons below can tell apart.
	 */
	const savedStatus = ( byId( 'original_post_status' ) || byId( 'hidden_post_status' ) )?.value || '';

	/*
	 * What the summary lines said when the page was rendered, kept so Cancel --
	 * and a date edited back to where it started -- can put them back exactly.
	 * The stamp is nodes rather than text because core prints the date in a <b>.
	 */
	const originalStamp = stamp ? Array.from( stamp.childNodes ).map( ( node ) => node.cloneNode( true ) ) : [];
	const originalVisibility = visibilityDisplay ? visibilityDisplay.textContent : '';

	/*
	 * Core's panels ship hidden under `hide-if-js` and post.js slides them open,
	 * which leaves an inline display behind on markup the stylesheet is otherwise
	 * in charge of. Herd toggles the class instead. The Edit link is the one
	 * thing set inline, because core already sets it inline: a privately
	 * published post is rendered with the status link hidden.
	 */
	const isOpen = ( panel ) => !! panel && ! panel.classList.contains( 'hide-if-js' );
	const open = ( panel, trigger, focus ) => {
		if ( ! panel || isOpen( panel ) ) return;
		panel.classList.remove( 'hide-if-js' );
		if ( trigger ) trigger.style.display = 'none';
		focus?.();
	};
	const close = ( panel, trigger ) => {
		if ( ! panel ) return;
		panel.classList.add( 'hide-if-js' );
		if ( ! trigger ) return;
		trigger.style.display = '';
		trigger.focus();
	};

	/**
	 * The date line, and the button label that follows from it.
	 *
	 * @return {boolean} False when the fields do not describe a real date.
	 */
	const syncDate = () => {
		if ( ! datePanel || ! byId( 'aa' ) ) return true;
		const value = ( id ) => byId( id )?.value ?? '';
		const [ aa, mm, jj, hh, mn ] = [ 'aa', 'mm', 'jj', 'hh', 'mn' ].map( value );
		const wrap = datePanel.querySelector( '.timestamp-wrap' );

		/*
		 * A 31st of February does not fail -- it rolls forward into March -- so
		 * the only way to catch one is to build the date and ask what it became.
		 */
		const attempted = new Date( aa, mm - 1, jj, hh, mn );
		if (
			attempted.getFullYear() !== Number( aa ) ||
			attempted.getMonth() + 1 !== Number( mm ) ||
			attempted.getDate() !== Number( jj ) ||
			attempted.getMinutes() !== Number( mn )
		) {
			wrap?.classList.add( 'form-invalid' );
			return false;
		}
		wrap?.classList.remove( 'form-invalid' );

		const original = new Date( value( 'hidden_aa' ), value( 'hidden_mm' ) - 1, value( 'hidden_jj' ), value( 'hidden_hh' ), value( 'hidden_mn' ) );
		const now = new Date( value( 'cur_aa' ), value( 'cur_mm' ) - 1, value( 'cur_jj' ), value( 'cur_hh' ), value( 'cur_mn' ) );

		let publishOn;
		if ( attempted > now ) {
			publishOn = 'Schedule for:';
			setButton( 'Schedule' );
		} else if ( savedStatus !== 'publish' ) {
			publishOn = 'Publish on:';
			setButton( 'Publish' );
		} else {
			publishOn = 'Published on:';
			setButton( 'Update' );
		}

		if ( ! stamp ) return true;
		if ( original.toUTCString() === attempted.toUTCString() ) {
			// Back where it started, so the sentence PHP wrote is the right one --
			// including "Publish immediately", which no date can be rewritten into.
			stamp.replaceChildren( ...originalStamp.map( ( node ) => node.cloneNode( true ) ) );
		} else {
			const month = byId( 'mm' )?.querySelector( `option[value="${ mm }"]` )?.dataset.text || mm;
			const when = document.createElement( 'b' );
			when.textContent = `${ month } ${ parseInt( jj, 10 ) }, ${ aa } at ${ pad( hh ) }:${ pad( mn ) }`;
			stamp.replaceChildren( document.createTextNode( `${ publishOn } ` ), when );
		}
		return true;
	};

	/** The status line, the Published option, and whether Save Draft applies. */
	const syncStatus = () => {
		if ( ! statusSelect ) return;
		const publishOption = statusSelect.querySelector( 'option[value="publish"]' );

		if ( chosenVisibility() === 'private' ) {
			/*
			 * Private is a status as far as WordPress is concerned, so choosing it
			 * settles the status too: the select is moved to it, and the status line
			 * loses its Edit link because there is no longer a choice to make there.
			 */
			setButton( 'Update' );
			if ( publishOption ) {
				publishOption.textContent = 'Privately Published';
			} else {
				const option = document.createElement( 'option' );
				option.value = 'publish';
				option.textContent = 'Privately Published';
				statusSelect.append( option );
			}
			statusSelect.value = 'publish';
			if ( statusEdit ) statusEdit.style.display = 'none';
		} else {
			if ( savedStatus === 'future' || savedStatus === 'draft' ) {
				// Nothing has been published yet, so an option saying so was Private's
				// doing and goes back out with it.
				if ( publishOption ) {
					publishOption.remove();
					statusSelect.value = byId( 'hidden_post_status' )?.value || savedStatus;
				}
			} else if ( publishOption ) {
				publishOption.textContent = 'Published';
			}
			// Give the link back only when the panel it opens is closed, or it and
			// the open panel would both be on screen.
			if ( statusEdit && ! isOpen( statusPanel ) ) statusEdit.style.display = '';
		}

		const selected = statusSelect.options[ statusSelect.selectedIndex ];
		if ( statusDisplay && selected ) statusDisplay.textContent = selected.textContent.trim();

		if ( saveDraft ) {
			const chosen = statusSelect.value;
			if ( 'publish' === chosen || 'private' === chosen ) {
				saveDraft.style.display = 'none';
			} else {
				saveDraft.style.display = '';
				saveDraft.value = 'pending' === chosen ? 'Save as Pending' : 'Save Draft';
			}
		}
	};

	const refresh = () => {
		const valid = syncDate();
		syncStatus();
		return valid;
	};

	/** Sticky belongs to public alone, and a password to password alone. */
	const syncVisibilityFields = () => {
		const chosen = chosenVisibility();
		const sticky = byId( 'sticky' );
		if ( 'public' !== chosen && sticky ) sticky.checked = false;
		const stickySpan = byId( 'sticky-span' );
		if ( stickySpan ) stickySpan.style.display = 'public' === chosen ? '' : 'none';
		const passwordSpan = byId( 'password-span' );
		if ( passwordSpan ) passwordSpan.style.display = 'password' === chosen ? '' : 'none';
	};

	/* ---------- status ---------- */

	statusEdit?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		open( statusPanel, statusEdit, () => statusSelect?.focus() );
	} );

	statusPanel?.querySelector( '.save-post-status' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		close( statusPanel, statusEdit );
		refresh();
	} );

	statusPanel?.querySelector( '.cancel-post-status' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		const saved = byId( 'hidden_post_status' )?.value;
		if ( statusSelect && saved ) statusSelect.value = saved;
		close( statusPanel, statusEdit );
		refresh();
	} );

	/* ---------- visibility ---------- */

	visibilityEdit?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		syncVisibilityFields();
		open( visibilityPanel, visibilityEdit, () => radios[ 0 ]?.focus() );
	} );

	radios.forEach( ( radio ) => radio.addEventListener( 'change', syncVisibilityFields ) );

	visibilityPanel?.querySelector( '.save-post-visibility' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		const chosen = chosenVisibility();
		close( visibilityPanel, visibilityEdit );
		refresh();

		const sticky = byId( 'sticky' );
		if ( 'public' !== chosen && sticky ) sticky.checked = false;
		if ( ! visibilityDisplay ) return;
		if ( 'private' === chosen ) {
			visibilityDisplay.textContent = 'Private';
		} else if ( 'password' === chosen ) {
			visibilityDisplay.textContent = 'Password Protected';
		} else {
			visibilityDisplay.textContent = sticky?.checked ? 'Public, Sticky' : 'Public';
		}
	} );

	visibilityPanel?.querySelector( '.cancel-post-visibility' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		const saved = byId( 'hidden-post-visibility' )?.value;
		const restore = radios.find( ( radio ) => radio.value === saved );
		if ( restore ) restore.checked = true;

		const password = byId( 'post_password' );
		const savedPassword = byId( 'hidden-post-password' );
		if ( password && savedPassword ) password.value = savedPassword.value;

		const sticky = byId( 'sticky' );
		const savedSticky = byId( 'hidden-post-sticky' );
		if ( sticky && savedSticky ) sticky.checked = savedSticky.checked;

		if ( visibilityDisplay ) visibilityDisplay.textContent = originalVisibility;
		close( visibilityPanel, visibilityEdit );
		refresh();
	} );

	/* ---------- publish date ---------- */

	dateEdit?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		open( datePanel, dateEdit, () => datePanel.querySelector( '.timestamp-wrap select, .timestamp-wrap input' )?.focus() );
	} );

	datePanel?.querySelector( '.save-timestamp' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		// An impossible date keeps the panel open, marked invalid, rather than
		// collapsing back to a summary line that would have to lie about it.
		if ( refresh() ) close( datePanel, dateEdit );
	} );

	datePanel?.querySelector( '.cancel-timestamp' )?.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		[ 'mm', 'jj', 'aa', 'hh', 'mn' ].forEach( ( unit ) => {
			const field = byId( unit );
			const saved = byId( `hidden_${ unit }` );
			if ( field && saved ) field.value = saved.value;
		} );
		close( datePanel, dateEdit );
		refresh();
	} );

	/*
	 * And the last stop: an impossible date must not be posted. Core opens the
	 * date panel and hands the buttons back; here the panel may also be sitting
	 * in a rail tab that is not the one on screen, so the tab is selected first
	 * -- pressing its own button, so the rail stays the only thing that knows how
	 * tabs work.
	 */
	byId( 'post' )?.addEventListener( 'submit', ( event ) => {
		if ( refresh() ) return;
		event.preventDefault();
		const panel = box.closest( '.herd-rail__panel' );
		if ( panel?.hidden ) byId( `herd-tab-${ panel.dataset.panel }` )?.click();
		open( datePanel, dateEdit );
		/*
		 * A date can be made impossible after the press: the editor stays live while
		 * the lock preflight and the document validation run, so this rejection can
		 * arrive with the button already saying "Publishing…". In practice this
		 * listener is bound before the app's -- assembleRail() runs ahead of
		 * render() in herd-editor.js -- so it usually stops the submission before
		 * anything is dressed. Usually is not a thing to rest correctness on, and
		 * the treatment has exactly one place it comes off.
		 */
		endSave();
	} );
}
