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
	const lockInput = () => documentObject.getElementById( 'active_post_lock' );
	const disable = () => {
		if ( lost ) return;
		lost = true;
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
		data['wp-refresh-post-lock'] = { post_id: postId, ...( token ? { lock: token } : {} ) };
	};
	const tick = ( event, data ) => {
		const response = data['wp-refresh-post-lock'];
		if ( ! response ) return;
		if ( response.lock_error ) {
			disable();
			showLostDialog( response.lock_error );
		} else if ( response.new_lock && lockInput() ) {
			lockInput().value = response.new_lock;
		}
	};

	$( documentObject ).on( 'heartbeat-send.herd-post-lock', send ).on( 'heartbeat-tick.herd-post-lock', tick );
	// A screen opened while another user owns the lock has no usable token. Core
	// would otherwise autosave a per-user revision before the first heartbeat
	// reports that ownership, so suspend it immediately.
	if ( ! lockInput() ) disable();
	if ( windowObject.wp?.heartbeat ) windowObject.wp.heartbeat.interval( 10 );
	return () => {
		$( documentObject ).off( '.herd-post-lock' );
		form.removeEventListener( 'submit', preventSubmit );
	};
}
