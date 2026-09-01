import { createElement, useRef, useState } from '@wordpress/element';

const el = createElement;
const cache = new Map();

/** A lazy visual hint for a collapsed row; rendering starts only on intent. */
export function PreviewThumbnail( { preview, nonce, onOpen } ) {
	const [ frameUrl, setFrameUrl ] = useState( '' );
	const [ failed, setFailed ] = useState( false );
	const loading = useRef( false );
	const load = async () => {
		if ( frameUrl || loading.current ) return;
		const key = `${ preview.key }-${ JSON.stringify( preview.context || {} ) }-thumbnail`;
		if ( cache.has( key ) ) { setFrameUrl( cache.get( key ) ); return; }
		loading.current = true;
		try {
			const body = new URLSearchParams( { action: 'herd_editor_create_preview', nonce: nonce || '', postId: String( preview.postId ), blockName: preview.block.name, data: JSON.stringify( preview.block.attributes?.data || {} ) } );
			const result = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', body } ).then( ( response ) => response.json() );
			if ( !result?.success ) throw new Error();
			cache.set( key, result.data.frameUrl ); setFrameUrl( result.data.frameUrl );
		} catch { setFailed( true ); } finally { loading.current = false; }
	};
	return el( 'span', { className: 'herd-block__preview-thumbnail', onMouseEnter: load, onFocus: load },
		frameUrl && el( 'span', { className: 'herd-block__preview-frame', 'aria-hidden': true }, el( 'iframe', { title: '', src: frameUrl, sandbox: 'allow-same-origin', tabIndex: -1 } ) ),
		el( 'button', { type: 'button', className: 'herd-block__preview-open', onFocus: load, onClick: onOpen }, frameUrl ? 'Open preview' : ( failed ? 'Preview unavailable' : 'Preview' ) ) );
}
