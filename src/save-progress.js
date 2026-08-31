/**
 * What a save in progress looks like, from the press to the answer.
 *
 * App.js intercepts the submission, dresses the control that started it, and
 * posts the form over AJAX; the page stays where it is until the reply lands.
 * The treatment has to start on the press rather than when the request returns,
 * which is the part that was never slow -- and the same pass runs
 * flushAcfForms() and syncContent() synchronously, so anything written in the
 * same tick as a flush of every mounted TinyMCE may never paint at all.
 *
 * Core's post.js owns this on the block and classic editors, and Herd does not
 * enqueue post.js. Save draft had been given the treatment by hand; Publish, the
 * slower of the two, had none.
 *
 * beginSave() also does something the labels do not advertise: the hidden input
 * it leaves in the form, so the busy label is not what posts, is what carries
 * the pressed button's name into a FormData that would not otherwise have it.
 * See buildSaveRequest() in save-request.js.
 *
 * This module is deliberately free of build-time imports, like publish-box.js
 * and post-lock.js, so it can be tested in plain node. App.js cannot: it reaches
 * @wordpress/block-editor through panels.js, which does not resolve outside the
 * bundler.
 */

/*
 * Core's own button labels, each in the tense the action started in. The button
 * that says Update produces the state that says Updating, and post.php's notice
 * afterwards says Updated -- the style guide asks that an action keep its name
 * through the whole flow, so this cannot be one generic word.
 *
 * These are core's translated strings, so a site not running in English falls
 * through to the generic verb. That loses the continuity; telling somebody who
 * pressed "Publier" that Herd is "Publishing…" would lose more.
 */
const BUSY = {
	Publish: 'Publishing…',
	Update: 'Updating…',
	Schedule: 'Scheduling…',
	'Submit for Review': 'Submitting for review…',
};

/**
 * What a submission should do to the control that started it.
 *
 * Returns null for anything that must be left alone, which includes the case of
 * no submitter at all -- an implicit submission from the Enter key names none.
 *
 * Preview and Move to Trash never arrive here: both are `<a href>` (meta-boxes
 * .php:44 and :374), and it is core's post.js that turns a Preview click into a
 * form submission. Herd does not load post.js, so Preview stays a link.
 *
 * @param {HTMLElement|null|undefined} submitter The control that submitted the form.
 * @return {{label: string, saveState: string}|null} The treatment, or null.
 */
export function submitIntent( submitter ) {
	if ( ! submitter ) return null;
	const id = submitter.id || '';
	const name = submitter.name || '';
	/*
	 * The id is asked first because core does not name these two consistently.
	 * A published post's Update button is submit_button( 'Update', …, 'save',
	 * …, array( 'id' => 'publish' ) ) -- meta-boxes.php:401 -- so it posts as
	 * `save` while carrying id="publish". Reading the name first would file
	 * every Update on the site under Save draft.
	 */
	if ( 'publish' === id || 'publish' === name ) {
		return { label: BUSY[ ( submitter.value || '' ).trim() ] || 'Saving…', saveState: 'saving' };
	}
	if ( 'save-post' === id || 'save' === id || 'save' === name ) {
		return { label: 'Saving…', saveState: 'saving-draft' };
	}
	return null;
}

/**
 * Dress a submit control for a submission that has not finished.
 *
 * Idempotent: App.js re-enters its own submit handler twice on the way to a
 * publish, and each pass arrives here again.
 *
 * `aria-disabled`, not the `disabled` property, for two reasons. A disabled
 * control is dropped from the form's entry list -- which in a browser also
 * costs `event.submitter`, and the pass that decides whether to validate reads
 * the submitter. And core paints `.button-primary:disabled` #8a8a8a on #e2e2e2
 * with !important (buttons.css:317), which would both bury Herd's green under a
 * grey that reads as *unavailable* rather than *working*, and drop the label --
 * now the thing carrying the meaning -- to about 2.6:1. Core's own
 * `.button-primary[aria-disabled="true"]` rule changes the cursor and nothing
 * else. A press is swallowed by guardBusyClicks() instead.
 *
 * @param {HTMLElement|null} submitter The control that submitted the form.
 * @return {{label: string, saveState: string}|null} The treatment applied, or null.
 */
export function beginSave( submitter ) {
	const intent = submitIntent( submitter );
	if ( ! intent ) return null;
	if ( submitter.dataset.herdBusy ) return intent;

	submitter.dataset.herdBusy = '1';
	submitter.dataset.herdRestore = submitter.value;
	submitter.setAttribute( 'aria-disabled', 'true' );
	submitter.value = intent.label;

	/*
	 * Both #publishing-action and #save-action already hold a spinner core
	 * printed and nothing ever switched on (meta-boxes.php:57 and :377). Use it.
	 * Building a second one is what used to leave #save-action with two.
	 */
	const container = submitter.parentElement;
	let spinner = container?.querySelector( '.spinner' );
	if ( container && ! spinner ) {
		spinner = document.createElement( 'span' );
		spinner.className = 'spinner';
		submitter.after( spinner );
	}
	spinner?.classList.add( 'is-active' );

	/*
	 * The label is now sitting in the control's value, and the value is what gets
	 * posted. Core reads `publish` and `save` for presence rather than content
	 * (_wp_translate_postdata tests '' !== $post_data['publish']), so the busy
	 * label would do no harm -- but a duplicate name wins on the last one, and
	 * this marker goes after the button, so what arrives is what was pressed.
	 */
	const marker = document.createElement( 'input' );
	marker.type = 'hidden';
	marker.name = submitter.name;
	marker.value = submitter.dataset.herdRestore;
	marker.dataset.herdBusyMarker = '1';
	submitter.after( marker );

	return intent;
}

/**
 * Put every dressed control back, and say so.
 *
 * The DOM is the record rather than a closure variable, because the caller that
 * matters most -- a page handed back by the back/forward cache -- is running
 * against a heap it did not build.
 *
 * Nothing here touches the `disabled` property. post-lock.js disables every
 * control in the form outright when ownership is lost, and handing back a live
 * Publish on a post somebody else is now editing would be a worse outcome than
 * the stuck label this exists to clear.
 *
 * @param {Window} win The window to announce on.
 * @return {boolean} Whether anything was actually wearing a save.
 */
export function endSave( win = typeof window === 'undefined' ? null : window ) {
	const busy = Array.from( document.querySelectorAll( '[data-herd-busy]' ) );
	busy.forEach( ( control ) => {
		if ( undefined !== control.dataset.herdRestore ) control.value = control.dataset.herdRestore;
		control.removeAttribute( 'aria-disabled' );
		delete control.dataset.herdBusy;
		delete control.dataset.herdRestore;
		control.parentElement?.querySelector( '.spinner' )?.classList.remove( 'is-active' );
	} );
	document.querySelectorAll( '[data-herd-busy-marker]' ).forEach( ( marker ) => marker.remove() );
	/*
	 * And a sweep of the two containers that hold a submit action, whether or not
	 * a control here was wearing anything. A spinning spinner over a button that
	 * is not saving is the one piece of this that lies outright, and it can be
	 * left behind by a screen that never mounted the app at all.
	 */
	document.querySelectorAll( '#publishing-action .spinner, #save-action .spinner' )
		.forEach( ( spinner ) => spinner.classList.remove( 'is-active' ) );
	if ( ! busy.length ) return false;
	if ( win?.CustomEvent && win.dispatchEvent ) win.dispatchEvent( new win.CustomEvent( 'herd:save-ended' ) );
	return true;
}

/**
 * Swallow a second press of a control that is already saving.
 *
 * This is what stands in for the `disabled` property, and it is core's own
 * approach (post.js:355). Capture phase, so it lands before the form's submit
 * path; and a click rather than a submit, because that is what both a pointer
 * and the Enter key on a focused submit button fire.
 *
 * @param {Document} doc The document to guard.
 * @return {Function} Teardown.
 */
export function guardBusyClicks( doc = document ) {
	const form = doc.getElementById( 'post' );
	const swallow = ( event ) => {
		if ( ! event.target?.closest?.( '[data-herd-busy]' ) ) return;
		event.preventDefault();
		event.stopPropagation();
	};
	form?.addEventListener( 'click', swallow, true );
	return () => form?.removeEventListener( 'click', swallow, true );
}

/**
 * A page that comes back from history comes back mid-save.
 *
 * The heap is restored whole: a button still reading "Publishing…", still
 * aria-disabled, and -- the part that is not merely cosmetic -- the hidden
 * marker still sitting in form#post, ready to post a second name alongside
 * whatever is pressed next. Core never meets this because it never rewrites a
 * value and leaves nothing behind in the form; its only pageshow listener is
 * heartbeat.js:238, restarting the beat.
 *
 * Bound unconditionally rather than gated on event.persisted: pageshow fires on
 * every load, a page that was not saving has nothing marked busy and endSave()
 * returns without a word, and Firefox restores form state on plain history
 * navigation with no bfcache involved at all.
 *
 * @param {Window} win The window to watch.
 * @return {Function} Teardown.
 */
export function watchRestore( win = window ) {
	const onShow = () => endSave( win );
	win.addEventListener( 'pageshow', onShow );
	return () => win.removeEventListener( 'pageshow', onShow );
}
