/**
 * The save itself: what gets posted, and what the answer does to the page.
 *
 * Herd used to save the way Classic does -- form#post posted to post.php, a 302
 * back, and the whole admin screen built again on the far side. That is two to
 * three seconds on a slow host, and it costs the editor everything the page was
 * holding: scroll position, which panels were open, undo history, every mounted
 * ACF form. Gutenberg does not work that way and this screen is close enough to
 * Gutenberg that the reload read as a fault rather than a wait.
 *
 * So the same form is posted to the same kind of save over AJAX instead, and
 * this module is the two ends of that: the request built out of the form the
 * screen already has, and the reconciliation of the reply back into the DOM.
 * herd_editor_ajax_save_post() is what answers.
 *
 * Deliberately free of build-time imports, like save-progress.js,
 * publish-box.js and post-lock.js, so it can be tested in plain node. src/ui/
 * App.js cannot be: it reaches @wordpress/block-editor through panels.js, which
 * does not resolve outside the bundler. The logic worth testing lives here for
 * that reason and not because it does not belong to the app.
 */

/**
 * Whether a submission is asking to publish, rather than to save a draft.
 *
 * This is the one question the server cannot ask for itself, and getting it
 * wrong is silent. Core names the two submit controls inconsistently: a
 * published post's Update button is submit_button( 'Update', …, 'save', …,
 * array( 'id' => 'publish' ) ) -- meta-boxes.php:401 -- so it posts under the
 * name `save` while carrying id="publish". Only the name is posted. By name
 * alone an Update of a live page and a Save draft are the same request, and the
 * case that most needs validating would quietly stop being validated.
 *
 * The id is visible here and nowhere on the server, so the answer travels as a
 * field of its own. submitIntent() in save-progress.js reads the same two
 * attributes in the same order for the same reason.
 *
 * @param {HTMLElement|null|undefined} submitter The control that submitted the form.
 * @return {boolean} Whether the server should validate before saving.
 */
export function isPublishTransition( submitter ) {
	return /publish|schedule/i.test( submitter?.id || submitter?.name || '' );
}

/**
 * The body to post: the whole screen, exactly as post.php would have received it.
 *
 * One thing FormData does not do that requestSubmit() did: include the button
 * that was pressed. It works here anyway, and for free, because beginSave() has
 * already put a hidden input carrying that button's name and original value
 * into the form -- it was added so the busy label ("Updating…") would not be
 * what posted, and it is what carries `save` or `publish` now. So markSaving()
 * has to run before this does. That is a load-bearing side effect of something
 * that otherwise looks purely cosmetic; the ordering is not incidental.
 *
 * @param {HTMLFormElement} form      The screen's form#post.
 * @param {HTMLElement|null} submitter The control that submitted it.
 * @param {string[]}        clientIds Client ids of the ACF blocks, in document order.
 * @return {FormData} The request body.
 */
export function buildSaveRequest( form, submitter, clientIds = [] ) {
	const body = new FormData( form );
	/* Replacing the form's own `action=editpost`, which is what post.php reads
	 * and what admin-ajax.php reads instead. Nothing in the save path wants the
	 * old value: edit_post() ignores it and ACF hangs off save_post. */
	body.set( 'action', 'herd_editor_save_post' );
	if ( isPublishTransition( submitter ) ) {
		body.set( 'herd_validate', '1' );
		/* Only the validating path needs these: they are how an error is traced
		 * back to the block whose panel has to be opened. */
		clientIds.forEach( ( id ) => body.append( 'clientIds[]', id ) );
	}
	return body;
}

/**
 * Classify a save result before the app reconciles it with the editor.
 *
 * A successful response includes the renewed post-lock token. The same `lock`
 * property carries the reason when a lock check fails, so `ok` must distinguish
 * those two cases.
 *
 * @param {object|null|undefined} result The save response data.
 * @return {'lock'|'validation'|'failure'|'success'} The result category.
 */
export function classifySaveResult( result ) {
	if ( result?.ok === false && result.lock ) return 'lock';
	if ( result?.errors?.length ) return 'validation';
	if ( ! result?.ok ) return 'failure';
	return 'success';
}

/** Set a form field's value where the screen has one, and say whether it did. */
function setField( doc, selector, value ) {
	const field = doc.querySelector( selector );
	if ( ! field || undefined === value || null === value ) return false;
	field.value = String( value );
	return true;
}

/**
 * Write a finished save back into the page it was made from.
 *
 * Everything here is state the next save reads out of the DOM rather than out
 * of the app, which is why it cannot wait for a reload that is no longer
 * coming. The nonce and the lock are what let a second save happen at all;
 * `original_post_status` is how the publish box decides between "Publish on"
 * and "Published on"; and `auto_draft` has to stop claiming a post that now
 * exists.
 *
 * @param {object} result The `data` of a successful save response.
 * @param {object} deps   Injection seams for tests.
 * @return {void}
 */
export function applySaveResult( result, { doc = document, win = window } = {} ) {
	if ( ! result || ! result.ok ) return;

	setField( doc, '#post_ID', result.postId );
	setField( doc, 'form#post input[name="_wpnonce"]', result.nonce );
	setField( doc, '#original_post_status', result.postStatus );
	setField( doc, '#active_post_lock', result.lock );
	/* An auto-draft that has been saved is a draft. Leaving this set would have
	 * the next save still describing the post as one nobody had written yet. */
	setField( doc, '#auto_draft', '' );

	/*
	 * A post opened from post-new.php has no `post` in its URL, and after the
	 * first save the address bar should name the thing that now exists -- so a
	 * reload, a bookmark or a copied link all land on the saved post rather
	 * than on a form for a new one. replaceState rather than pushState: this is
	 * the same document, not somewhere else to go back from.
	 */
	if ( result.editUrl && win.history?.replaceState ) {
		try {
			const current = new win.URL( win.location.href );
			const target = new win.URL( result.editUrl, win.location.href );
			/* `message` is core's, and Herd's notice no longer comes from it. An
			 * old one left in the URL would congratulate the editor again on the
			 * next reload for a save they have already been told about. */
			current.searchParams.delete( 'message' );
			current.searchParams.delete( 'revision' );
			if ( current.searchParams.get( 'post' ) !== target.searchParams.get( 'post' ) ) {
				win.history.replaceState( {}, '', target.toString() );
			} else if ( current.toString() !== win.location.href ) {
				win.history.replaceState( {}, '', current.toString() );
			}
		} catch ( error ) {
			// An unparseable URL is not a reason to fail a save that succeeded.
		}
	}
}
