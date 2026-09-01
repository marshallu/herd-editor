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

import { endSave, reserveSaveWidth, setSaveLabel } from './save-progress.js';

/** Two digits, the way core pads the hour and minute it writes into the stamp. */
const pad = ( value ) => ( '00' + value ).slice( -2 );

export function wirePublishBox() {
	const byId = ( id ) => document.getElementById( id );
	const box = byId( 'submitdiv' );
	if ( ! box ) return;

	const publishButton = byId( 'publish' );
	const saveDraft = byId( 'save-post' );
	/*
	 * Relabelling is also remeasuring. The room reserved on the button is the room
	 * its own labels need -- "Update" has to hold "Updating…" and "Updated" -- and
	 * a draft that has just been published becomes an Update button whose old
	 * reservation was cut for "Publishing…". Left alone, the first save after that
	 * is the one that lurches.
	 */
	const setButton = ( label ) => {
		if ( setSaveLabel( publishButton, label ) ) reserveSaveWidth( publishButton );
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
	const savedStatus = () => ( byId( 'original_post_status' ) || byId( 'hidden_post_status' ) )?.value || '';

	/*
	 * What the summary lines said when the page was rendered, kept so Cancel --
	 * and a date edited back to where it started -- can put them back exactly.
	 * The stamp is nodes rather than text because core prints the date in a <b>.
	 */
	let originalStamp = stamp ? Array.from( stamp.childNodes ).map( ( node ) => node.cloneNode( true ) ) : [];
	let originalVisibility = visibilityDisplay ? visibilityDisplay.textContent : '';

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
	 * Core's date sentence: "Published on: <b>Aug 31, 2026 at 15:54</b>".
	 *
	 * Shared by the editing path and the after-a-save path so a date the editor
	 * has just set and one the server has just confirmed are written by the same
	 * code, and cannot drift into two spellings of the same minute.
	 *
	 * @param {string} publishOn The label before the date, with its colon.
	 * @param {object} parts     The five values core's touch_time() posts.
	 * @return {void}
	 */
	const writeStamp = ( publishOn, { aa, mm, jj, hh, mn } ) => {
		if ( ! stamp ) return;
		const month = byId( 'mm' )?.querySelector( `option[value="${ mm }"]` )?.dataset.text || mm;
		const when = document.createElement( 'b' );
		when.textContent = `${ month } ${ parseInt( jj, 10 ) }, ${ aa } at ${ pad( hh ) }:${ pad( mn ) }`;
		stamp.replaceChildren( document.createTextNode( `${ publishOn } ` ), when );
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
		} else if ( savedStatus() !== 'publish' ) {
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
			writeStamp( publishOn, { aa, mm, jj, hh, mn } );
		}
		return true;
	};

	/*
	 * Core prints the status select with an option for every state the post has
	 * reached and none for the ones it has not: a draft's select has no
	 * "Published" in it at all. That used to be settled by the reload -- a
	 * published post came back with a freshly rendered select -- and a save that
	 * does not reload has to add the option itself, or the status line goes blank
	 * and Cancel has nothing to restore to.
	 *
	 * Prepended, because that is where core puts it.
	 */
	const ensureStatusOption = ( value, label ) => {
		if ( ! statusSelect ) return null;
		let option = statusSelect.querySelector( `option[value="${ value }"]` );
		if ( ! option ) {
			option = document.createElement( 'option' );
			option.value = value;
			statusSelect.prepend( option );
		}
		option.textContent = label;
		return option;
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
			ensureStatusOption( 'publish', 'Privately Published' );
			statusSelect.value = 'publish';
			if ( statusEdit ) statusEdit.style.display = 'none';
		} else {
			if ( savedStatus() === 'future' || savedStatus() === 'draft' ) {
				// Nothing has been published yet, so an option saying so was Private's
				// doing and goes back out with it.
				if ( publishOption ) {
					publishOption.remove();
					statusSelect.value = byId( 'hidden_post_status' )?.value || savedStatus();
				}
			} else {
				ensureStatusOption( 'publish', 'Published' );
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
				const draftLabel = 'pending' === chosen ? 'Save as Pending' : 'Save Draft';
				/* Also when it has never been measured: a hidden control measures
				 * nothing, so a post that opened published reserved no room here, and
				 * this is the moment Save Draft comes back. */
				if ( setSaveLabel( saveDraft, draftLabel ) || ! saveDraft.style.minWidth ) reserveSaveWidth( saveDraft );
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
		 * A date can be made impossible after the press: the editor stays live
		 * while the save request is in flight, so this rejection can arrive with
		 * the button already saying "Publishing…". In practice this listener is
		 * bound before the app's -- assembleRail() runs ahead of render() in
		 * herd-editor.js -- so it usually stops the submission before anything is
		 * dressed. Usually is not a thing to rest correctness on, and the
		 * treatment has exactly one place it comes off.
		 */
		endSave();
	} );

	/*
	 * What a page load used to do for this box.
	 *
	 * A save no longer throws the screen away, so everything here that was true
	 * only of the document as it was rendered is now simply stale: the status the
	 * post was loaded with, and the four sets of hidden mirror fields core prints
	 * for Cancel to restore from. Left alone, a draft that was just published
	 * still offers a Publish button, still says "Publish on", and Cancel on the
	 * date panel still reverts to a date that is no longer the post's.
	 *
	 * The order matters. The mirrors are brought up to date first, and the date
	 * line is written from the server's answer rather than from the fields on
	 * screen -- once the mirrors say the date is unchanged, syncDate() restores
	 * `originalStamp` instead of building a sentence, so that capture has to be
	 * the new one before refresh() runs.
	 */
	const adoptSavedState = ( result ) => {
		const status = result?.postStatus || savedStatus();
		const hiddenStatus = byId( 'hidden_post_status' );
		if ( hiddenStatus ) hiddenStatus.value = status;

		/*
		 * The select still shows whatever it was rendered with -- pressing Publish
		 * never touches it, because it is the button that decides, not the select
		 * (_wp_translate_postdata reads `publish`). So the saved status has to be
		 * put into it here, with an option to hold it if the screen was built
		 * before the post had ever been in that state.
		 *
		 * Private is the odd one: WordPress stores it as its own post status, but
		 * core's select expresses it as `publish` alongside a visibility radio.
		 */
		if ( statusSelect ) {
			const [ value, label ] = {
				publish: [ 'publish', 'Published' ],
				private: [ 'publish', 'Privately Published' ],
				future: [ 'future', 'Scheduled' ],
				pending: [ 'pending', 'Pending Review' ],
			}[ status ] || [ 'draft', 'Draft' ];
			ensureStatusOption( value, label );
			statusSelect.value = value;
		}

		const parts = result?.dateParts || null;
		[ 'mm', 'jj', 'aa', 'hh', 'mn' ].forEach( ( unit ) => {
			const field = byId( unit );
			const mirror = byId( `hidden_${ unit }` );
			/* The server's copy is the authority: a draft's date fields hold
			 * whatever the page was rendered with, which is not when it published. */
			if ( field && parts?.[ unit ] ) field.value = parts[ unit ];
			if ( mirror && field ) mirror.value = field.value;
		} );

		const chosen = chosenVisibility();
		const hiddenVisibility = byId( 'hidden-post-visibility' );
		if ( hiddenVisibility && chosen ) hiddenVisibility.value = chosen;
		const password = byId( 'post_password' );
		const savedPassword = byId( 'hidden-post-password' );
		if ( password && savedPassword ) savedPassword.value = password.value;
		const sticky = byId( 'sticky' );
		const savedSticky = byId( 'hidden-post-sticky' );
		if ( sticky && savedSticky ) savedSticky.checked = sticky.checked;

		if ( stamp && parts ) {
			writeStamp( 'publish' === status ? 'Published on:' : ( 'future' === status ? 'Scheduled for:' : 'Publish on:' ), parts );
			originalStamp = Array.from( stamp.childNodes ).map( ( node ) => node.cloneNode( true ) );
		}

		refresh();
		// Cancel on the visibility panel goes back to what is now on screen.
		if ( visibilityDisplay ) originalVisibility = visibilityDisplay.textContent;
	};

	window.addEventListener( 'herd:saved', ( event ) => adoptSavedState( event.detail ) );
}
