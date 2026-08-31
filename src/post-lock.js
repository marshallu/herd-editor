/**
 * Herd's small client for WordPress's shared post-lock Heartbeat protocol.
 *
 * The server endpoint is core's wp_refresh_post_lock(). Keeping this separate
 * from the React editor means a lost lock disables native meta boxes and Herd
 * controls at the same instant.
 */
export function installPostLock( { document: documentObject = document, window: windowObject = window, $: suppliedJquery } = {} ) {
	const $ = suppliedJquery || windowObject.jQuery;
	const form = documentObject.getElementById( 'post' );
	const dialog = documentObject.getElementById( 'post-lock-dialog' );
	const postId = documentObject.getElementById( 'post_ID' )?.value;
	if ( ! $ || ! form || ! dialog || ! postId ) return () => {};

	let lost = false;
	let latestToken = null;
	let lastHeartbeat = Date.now();
	const lockInput = () => documentObject.getElementById( 'active_post_lock' );
	const diagnose = ( type, detail = {} ) => {
		form.dataset.herdLockState = type;
		if ( windowObject.CustomEvent && windowObject.dispatchEvent ) windowObject.dispatchEvent( new windowObject.CustomEvent( 'herd:recovery-diagnostic', { detail: { type, latestToken, ...detail } } ) );
	};
	const disable = ( reason = 'heartbeat' ) => {
		if ( lost ) return;
		lost = true;
		diagnose( 'lock-lost', { reason } );
		if ( windowObject.CustomEvent && windowObject.dispatchEvent ) windowObject.dispatchEvent( new windowObject.CustomEvent( 'herd:lock-lost', { detail: { reason, latestToken } } ) );
		// Do not let core autosave create a recovery revision after ownership has
		// been lost. It can be resumed only after the user explicitly takes over
		// and reloads, which also refreshes the nonce and lock token.
		windowObject.wp?.autosave?.server?.suspend?.();
		form.classList.add( 'herd-lock-lost' );
		form.querySelectorAll( 'input, select, textarea, button' ).forEach( ( control ) => { control.disabled = true; } );
		form.addEventListener( 'submit', preventSubmit );
	};
	const preventSubmit = ( event ) => event.preventDefault();
	const showLostDialog = ( error = {} ) => {
		dialog.querySelectorAll( '.currently-editing' ).forEach( ( node ) => { node.textContent = error.text || 'Another user has taken over and is currently editing.'; } );
		const avatar = dialog.querySelector( '.post-taken-over .post-locked-avatar' );
		if ( avatar && error.avatar_src ) {
			avatar.replaceChildren( Object.assign( documentObject.createElement( 'img' ), { className: 'avatar avatar-64 photo', width: 64, height: 64, alt: '', src: error.avatar_src } ) );
		}
		dialog.classList.remove( 'hidden' );
		dialog.style.display = 'block';
		dialog.querySelector( '.post-taken-over .wp-tab-first' )?.focus();
	};
	const send = ( event, data ) => {
		const token = lockInput()?.value;
		latestToken = token || latestToken;
		data['wp-refresh-post-lock'] = { post_id: postId, ...( token ? { lock: token } : {} ) };
	};
	const tick = ( event, data ) => {
		const response = data['wp-refresh-post-lock'];
		if ( ! response ) { diagnose( 'heartbeat-missing' ); return; }
		lastHeartbeat = Date.now();
		if ( response.lock_error ) {
			disable( 'rejected' );
			showLostDialog( response.lock_error );
		} else if ( response.new_lock && lockInput() ) {
			lockInput().value = response.new_lock;
			latestToken = response.new_lock;
			diagnose( 'lock-healthy' );
		}
	};

	$( documentObject ).on( 'heartbeat-send.herd-post-lock', send ).on( 'heartbeat-tick.herd-post-lock', tick );
	// A screen opened while another user owns the lock has no usable token. Core
	// would otherwise autosave a per-user revision before the first heartbeat
	// reports that ownership, so suspend it immediately.
	latestToken = lockInput()?.value || null;
	if ( ! lockInput() ) disable( 'missing' );
	if ( windowObject.wp?.heartbeat ) windowObject.wp.heartbeat.interval( 10 );

	/*
	 * Core throttles its own heartbeat, and the watchdog has to allow for it.
	 * Once the window loses focus the interval becomes 120s, and five minutes
	 * without a keystroke counts as losing focus even while the window is
	 * frontmost (heartbeat.js:512 and :623 -- core's own comment there reads
	 * "120 seconds. Post locks expire after 150 seconds", which is the margin it
	 * is working to). A 45s watchdog was inside all of that: it declared the lock
	 * dead 75s before core meant to send the next beat, and disabled the form
	 * under someone who had done nothing but pause.
	 *
	 * So the threshold is the lock window itself -- the same
	 * wp_check_post_lock_window the server uses to decide the question -- and the
	 * check stands down while the document is unfocused, which is exactly when
	 * core is throttling deliberately. Coming back resets the clock, because
	 * refocusing makes core resume and beat again; and if the lock really was
	 * taken while away, the heartbeat answers with lock_error, which is a fact
	 * rather than an inference.
	 */
	const lockWindow = ( Number( windowObject.HerdEditor?.lockWindow ) || 150 ) * 1000;
	const present = () => documentObject.visibilityState !== 'hidden' && ( documentObject.hasFocus?.() ?? true );
	const refocus = () => { lastHeartbeat = Date.now(); };
	windowObject.addEventListener?.( 'focus', refocus );
	const watchdog = windowObject.setInterval?.( () => {
		if ( lost || ! present() ) return;
		if ( Date.now() - lastHeartbeat > lockWindow ) disable( 'heartbeat-timeout' );
	}, 5000 );
	return () => {
		$( documentObject ).off( '.herd-post-lock' );
		form.removeEventListener( 'submit', preventSubmit );
		windowObject.removeEventListener?.( 'focus', refocus );
		if ( watchdog ) windowObject.clearInterval?.( watchdog );
	};
}
