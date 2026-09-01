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
 * The press is one of three states, not two. A save begins (beginSave), comes to
 * rest wearing its own outcome for a moment (settleSave), and only then goes back
 * to being a button (endSave). The middle state is what the command bar's one-word
 * "Saved" could never be: an answer on the control that asked the question.
 *
 * Nothing in that cycle is allowed to change the width of anything. The label a
 * save wears is longer than the label it starts from -- "Update" becomes
 * "Updating…" -- and #publish is the last item in a right-pinned flex row, so a
 * button that grows shoves the View menu, the history pair and the status line
 * sideways and then pulls them back. reserveSaveWidth() measures every label the
 * control will ever wear and reserves the widest, before the press; the icon is
 * laid *over* the button by the stylesheet rather than placed beside it, so it
 * costs nothing to appear. See the grid on #publishing-action in _shell.scss.
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
 * Core's own button labels, each in the tense the action is in at that moment.
 * The button that says Update produces the state that says Updating and the
 * answer that says Updated -- the style guide asks that an action keep its name
 * through the whole flow, so neither of these can be one generic word.
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

const DONE = {
	Publish: 'Published',
	Update: 'Updated',
	Schedule: 'Scheduled',
	'Submit for Review': 'Submitted',
};

/*
 * One word for every button, because there is no tense of "publish" that means
 * it did not happen. What went wrong is the notice's job to say; the button's
 * job is to be clear that nothing was written.
 */
const FAILED = 'Not saved';

const busyLabel = ( resting ) => BUSY[ ( resting || '' ).trim() ] || 'Saving…';
const doneLabel = ( resting ) => DONE[ ( resting || '' ).trim() ] || 'Saved';

/**
 * The label a control comes back to, which is not always the one on its face.
 *
 * A control mid-save is wearing "Publishing…" and one still confirming is wearing
 * "Published", and both of those are labels the maps have no entry for. Reading
 * the face instead of the record is how the second press of a publish is filed
 * as a generic save, and how a button gets restored to "Published" for good.
 *
 * @param {HTMLElement|Object|null} submitter The control.
 * @return {string} The label it rests at.
 */
const restingValue = ( submitter ) => {
	const stored = submitter?.dataset?.herdRestore;
	return undefined !== stored ? stored : ( submitter?.value || '' );
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
		return { label: busyLabel( restingValue( submitter ) ), saveState: 'saving' };
	}
	if ( 'save-post' === id || 'save' === id || 'save' === name ) {
		return { label: 'Saving…', saveState: 'saving-draft' };
	}
	return null;
}

/**
 * The icon laid over the control, created on demand and reused after that.
 *
 * A sibling of the button rather than a child, because the control is an
 * `<input type="submit">` and cannot have one. The stylesheet stacks the two in a
 * single grid cell, so this element has no width of its own to give or take.
 *
 * @param {HTMLElement} submitter The control being dressed.
 * @return {HTMLElement|null} The icon element.
 */
function saveIcon( submitter ) {
	const container = submitter.parentElement;
	if ( ! container ) return null;
	let icon = container.querySelector( '[data-herd-save-icon]' );
	if ( ! icon ) {
		icon = container.ownerDocument.createElement( 'span' );
		icon.dataset.herdSaveIcon = '1';
		icon.setAttribute( 'aria-hidden', 'true' );
		submitter.after( icon );
	}
	return icon;
}

/**
 * Relabel a control that may be in the middle of a save.
 *
 * publish-box.js renames this button as the post's status changes, and one of
 * those renames lands mid-save: a draft that has just been published adopts its
 * new state from herd:saved, which arrives while the button is still wearing
 * "Publishing…" and about to be restored from the record this module keeps. A
 * write to the face would be overwritten by that restore, and the button that had
 * just published a page would go back to saying Publish.
 *
 * So the face belongs to the save and the record belongs to the label: whichever
 * of the two is the resting one is the one written.
 *
 * @param {HTMLElement|null} submitter The control to relabel.
 * @param {string}           label     What it should come to rest saying.
 * @return {boolean} Whether the label actually changed.
 */
export function setSaveLabel( submitter, label ) {
	if ( ! submitter || restingValue( submitter ) === label ) return false;
	if ( undefined !== submitter.dataset.herdRestore ) {
		submitter.dataset.herdRestore = label;
	} else {
		submitter.value = label;
	}
	return true;
}

/**
 * Reserve the room every label this control will ever wear needs.
 *
 * Measured on the control itself rather than on a copy of it. A clone is the
 * tempting way to do this and it is wrong twice over: half the rules that decide
 * how wide this button is are keyed on `#publish` (its weight, and the padding it
 * swaps in to clear a space for the icon), and a copy carrying neither measures
 * about a quarter narrower than the thing it is standing in for -- which reserves
 * a floor the first save immediately walks through. So the labels are tried on
 * the real control and taken off again, all in one synchronous pass: the browser
 * has no opportunity to paint between the first line here and the last.
 *
 * Widest wins, and it is set as a floor rather than a width, so a site whose
 * status label or translation needs more room still gets it.
 *
 * Called before the press -- at boot and again whenever publish-box.js relabels
 * the button -- because measuring at the press is measuring too late.
 *
 * The width is read sub-pixel and rounded up. offsetWidth is a rounded integer,
 * and rounding a 113.33px label down to a 113px floor is a floor the label spills
 * over -- a third of a pixel of movement on every save, which is not visible but
 * is not nothing either.
 *
 * `measure` is injectable because jsdom has no layout engine, and a reservation
 * nothing can assert is a reservation nobody notices breaking.
 *
 * @param {HTMLElement|null}   submitter The control to reserve room for.
 * @param {Function}           measure   How to read a rendered width.
 * @return {number|null} The width reserved, or null if there was nothing to do.
 */
export function reserveSaveWidth( submitter, measure = ( node ) => node.getBoundingClientRect().width ) {
	if ( ! submitter || ! submitIntent( submitter ) ) return null;
	/*
	 * The resting label, not whatever is on the face: publish-box.js calls this on
	 * every relabel, and a draft that has just been published is relabelled while
	 * it is still wearing "Publishing…".
	 */
	const resting = restingValue( submitter );
	const face = submitter.value;
	const busy = submitter.getAttribute( 'aria-disabled' );
	const floor = submitter.style.minWidth;

	// The widest state, so the padding that clears a space for the icon is counted.
	submitter.style.minWidth = '0px';
	submitter.setAttribute( 'aria-disabled', 'true' );
	let widest = 0;
	[ resting, busyLabel( resting ), doneLabel( resting ), FAILED ].forEach( ( label ) => {
		submitter.value = label;
		widest = Math.max( widest, measure( submitter ) || 0 );
	} );

	submitter.value = face;
	if ( null === busy ) submitter.removeAttribute( 'aria-disabled' );
	else submitter.setAttribute( 'aria-disabled', busy );
	submitter.style.minWidth = widest ? `${ Math.ceil( widest ) }px` : floor;
	return widest || null;
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
	if ( ! submitter ) return null;
	/*
	 * Before the intent is resolved, not after. A press landing inside the moment
	 * the last save is still confirming itself finds a button reading "Published",
	 * and a label read off that face is a generic "Saving…" on a publish and a
	 * button restored to "Published" for good.
	 *
	 * A no-op on the two re-entrant passes of one publish, which have nothing
	 * settled to clear.
	 */
	clearSettled();
	const intent = submitIntent( submitter );
	if ( ! intent ) return null;
	if ( submitter.dataset.herdBusy ) return intent;

	submitter.dataset.herdBusy = '1';
	submitter.dataset.herdRestore = submitter.value;
	submitter.setAttribute( 'aria-disabled', 'true' );
	submitter.value = intent.label;

	/*
	 * Herd's own ring rather than the spinner core printed beside the button
	 * (meta-boxes.php:57 and :377). Core's is an animated GIF that no CSS can slow
	 * down or stop, it sits outside the control, and switching it on and off is
	 * 20px of reserved space beside a button that has none to spare. The
	 * stylesheet hides core's and lays this one over the button's left padding.
	 */
	const icon = saveIcon( submitter );
	if ( icon ) icon.className = 'herd-saveicon is-spinning';

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
 * The answer, on the control that asked.
 *
 * Between the request landing and the button going back to being a button. The
 * `disabled` state comes off immediately -- the save is over, and a control that
 * has finished should be pressable again whatever it is currently saying -- but
 * `data-herd-restore` and the hidden marker both stay, so a press inside this
 * window still posts the name that was pressed rather than the word on the face.
 *
 * @param {string} outcome 'saved' or 'failed'.
 * @return {number} How many controls were settled.
 */
export function settleSave( outcome = 'saved' ) {
	const busy = Array.from( document.querySelectorAll( '[data-herd-busy]' ) );
	busy.forEach( ( control ) => {
		const resting = control.dataset.herdRestore;
		control.value = 'failed' === outcome ? FAILED : doneLabel( resting );
		control.removeAttribute( 'aria-disabled' );
		delete control.dataset.herdBusy;
		control.dataset.herdSettled = outcome;

		const icon = saveIcon( control );
		if ( icon ) icon.className = `herd-saveicon dashicons dashicons-${ 'failed' === outcome ? 'warning' : 'yes' }`;
	} );
	return busy.length;
}

/**
 * Put one dressed control back, whichever state it was wearing.
 *
 * @param {HTMLElement} control The control to undress.
 */
function restoreControl( control ) {
	if ( undefined !== control.dataset.herdRestore ) control.value = control.dataset.herdRestore;
	control.removeAttribute( 'aria-disabled' );
	delete control.dataset.herdBusy;
	delete control.dataset.herdSettled;
	delete control.dataset.herdRestore;
	control.parentElement?.querySelector( '[data-herd-save-icon]' )?.remove();
	control.parentElement?.querySelector( '.spinner' )?.classList.remove( 'is-active' );
}

/**
 * End a confirmation early, without announcing anything.
 *
 * Its own function rather than a flag on endSave() because the two mean different
 * things: this is one save getting out of the way of the next, and says nothing,
 * where endSave() is the cycle coming to rest and is what the command bar listens
 * for. Announcing here would put the bar at rest in the middle of a save.
 *
 * @return {number} How many controls were still confirming.
 */
export function clearSettled() {
	const settled = Array.from( document.querySelectorAll( '[data-herd-settled]' ) );
	settled.forEach( restoreControl );
	if ( settled.length ) {
		document.querySelectorAll( '[data-herd-busy-marker]' ).forEach( ( marker ) => marker.remove() );
	}
	return settled.length;
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
	const dressed = Array.from( document.querySelectorAll( '[data-herd-busy], [data-herd-settled]' ) );
	dressed.forEach( restoreControl );
	document.querySelectorAll( '[data-herd-busy-marker]' ).forEach( ( marker ) => marker.remove() );
	/*
	 * And a sweep of the two containers that hold a submit action, whether or not
	 * a control here was wearing anything. A spinning spinner over a button that
	 * is not saving is the one piece of this that lies outright, and it can be
	 * left behind by a screen that never mounted the app at all.
	 */
	document.querySelectorAll( '#publishing-action .spinner, #save-action .spinner' )
		.forEach( ( spinner ) => spinner.classList.remove( 'is-active' ) );
	if ( ! dressed.length ) return false;
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
 * A control that has settled is deliberately not guarded: the save it is
 * reporting is over, and the press starts a new one.
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
