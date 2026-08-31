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
	const watchdog = windowObject.setInterval?.( () => {
		if ( ! lost && documentObject.visibilityState !== 'hidden' && Date.now() - lastHeartbeat > 45000 ) disable( 'heartbeat-timeout' );
	}, 5000 );
	return () => {
		$( documentObject ).off( '.herd-post-lock' );
		form.removeEventListener( 'submit', preventSubmit );
		if ( watchdog ) windowObject.clearInterval?.( watchdog );
	};
}
