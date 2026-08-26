/**
 * Compatibility boundary for the WordPress media store.
 *
 * `wp.media.attachment( id ).fetch()` is the same call ACF's own file field
 * makes to resolve a value, and it returns everything
 * `wp_prepare_attachment_for_js()` publishes — including the fields the field
 * markup throws away: `subtype`, `width`, `height`, `dateFormatted`, and
 * `fileLength` for audio and video.
 *
 * No UI component should reach for `wp.media` directly, for the same reason
 * ../acf/bridge.js owns ACF's ajax and lifecycle calls: when the vendor moves,
 * one file moves with it. Outside wp-admin — the test suite, chiefly — there is
 * no media store and every lookup resolves to null, which callers must render
 * as "no metadata" rather than an error.
 */

/**
 * Attachments do not change while a form is open, and the same poster image is
 * asked for by every video field that shares a thumbnail.
 */
const cache = new Map();

/**
 * Look up an attachment's full JS representation.
 *
 * @param {string|number} id Attachment ID.
 * @return {Promise<Object|null>} The attachment attributes, or null when the
 *                                media store is absent or the lookup fails.
 */
export function attachmentData( id ) {
	const key = String( id || '' );
	if ( ! key ) return Promise.resolve( null );
	if ( cache.has( key ) ) return cache.get( key );

	// `typeof` rather than a property read: outside a browser there is no
	// `window` binding at all, and a bare reference is a ReferenceError.
	const media = typeof window === 'undefined' ? null : window.wp?.media;
	if ( ! media?.attachment ) return Promise.resolve( null );

	const request = Promise.resolve()
		.then( () => {
			const model = media.attachment( key );
			// Already resolved by an earlier field, or by the media modal that
			// selected it — `fetch()` would still round-trip.
			if ( model.get( 'url' ) ) return model.attributes;
			return Promise.resolve( model.fetch() ).then( () => model.attributes );
		} )
		.catch( () => {
			// A deleted attachment still has an ID in the field. The row renders
			// without metadata rather than not at all.
			cache.delete( key );
			return null;
		} );

	cache.set( key, request );
	return request;
}
