import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { Dashicon } from './primitives.js';

const el = createElement;
const previewCache = new Map();

/**
 * A rendered look at one block, in a deliberately isolated iframe: preview markup
 * is the theme's own front-end output and must not inherit editor CSS.
 *
 * It is a modal rather than a drawer parked at the right edge, because that edge
 * already belongs to the rail: a fixed panel there lands on top of the settings
 * you may be previewing the effect of, and the rail -- which is sticky, and so
 * its own stacking context -- was drawing over the panel regardless. App portals
 * this to <body>, which is what the move dialog does and why that one is clear
 * of the rail.
 */
export function PreviewDrawer( { preview, nonce, onClose, onEdit } ) {
	const [ frameUrl, setFrameUrl ] = useState( '' );
	const [ state, setState ] = useState( 'loading' );
	/* Bumped by Try again, so a retry re-runs the request rather than re-pointing the iframe. */
	const [ attempt, setAttempt ] = useState( 0 );
	const [ viewport, setViewport ] = useState( 'desktop' );
	const closeRef = useRef( null );
	useEffect( () => {
		let alive = true;
		const load = async () => {
			setState( 'loading' ); setFrameUrl( '' );
			if ( previewCache.has( preview.key ) ) {
				setFrameUrl( previewCache.get( preview.key ) ); setState( 'ready' ); return;
			}
			try {
				const body = new URLSearchParams( { action: 'herd_editor_create_preview', nonce: nonce || '', postId: String( preview.postId ), blockName: preview.block.name, data: JSON.stringify( preview.block.attributes?.data || {} ) } );
				const result = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', body } ).then( ( response ) => response.json() );
				if ( !result?.success ) throw new Error( result?.data?.message || 'Preview unavailable.' );
				if ( alive ) { previewCache.set( preview.key, result.data.frameUrl ); setFrameUrl( result.data.frameUrl ); setState( result.data.empty ? 'empty' : 'ready' ); }
			} catch ( error ) { if ( alive ) setState( 'error' ); }
		};
		const timer = window.setTimeout( load, 350 );
		return () => { alive = false; window.clearTimeout( timer ); };
	}, [ preview.key, nonce, attempt ] );
	useEffect( () => { closeRef.current?.focus(); return () => preview.origin?.focus?.(); }, [ preview ] );
	return el( 'div', {
		className: 'herd-modal',
		role: 'dialog',
		'aria-modal': true,
		'aria-label': `Preview ${ preview.title }`,
		onKeyDown: ( event ) => {
			if ( event.key !== 'Escape' ) return;
			event.preventDefault();
			onClose();
		},
		onMouseDown: ( event ) => {
			if ( event.target === event.currentTarget ) onClose();
		},
	},
		el( 'div', { className: 'herd-preview-dialog' },
			el( 'header', { className: 'herd-preview-dialog__header' },
				el( 'h2', null, preview.title ),
				el( 'label', { className: 'screen-reader-text', htmlFor: 'herd-preview-viewport' }, 'Preview viewport' ),
				el( 'select', { id: 'herd-preview-viewport', value: viewport, onChange: ( event ) => setViewport( event.target.value ) }, el( 'option', { value: 'desktop' }, 'Desktop' ), el( 'option', { value: 'tablet' }, 'Tablet' ), el( 'option', { value: 'mobile' }, 'Mobile' ) ),
				el( 'button', { ref: closeRef, type: 'button', className: 'herd-preview-dialog__close', onClick: onClose, 'aria-label': 'Close preview' }, el( Dashicon, { icon: 'no-alt' } ) ) ),
			el( 'div', { className: 'herd-preview-dialog__stage' },
				state === 'loading' && el( 'p', { className: 'herd-preview-dialog__note' }, 'Loading preview…' ),
				state === 'empty' && el( 'p', { className: 'herd-preview-dialog__note' }, 'This block has no preview data yet.' ),
				state === 'error' && el( 'p', { className: 'herd-preview-dialog__note' }, 'Preview could not be loaded. ',
					el( 'button', { type: 'button', className: 'button-link', onClick: () => setAttempt( ( count ) => count + 1 ) }, 'Try again' ) ),
				state === 'ready' && frameUrl && el( 'iframe', { className: `is-${ viewport }`, title: `${ preview.title } preview`, src: frameUrl, sandbox: 'allow-same-origin allow-popups allow-forms', loading: 'eager' } ) ),
			el( 'footer', { className: 'herd-preview-dialog__footer' },
				el( 'p', null, 'Rendered with the theme’s own styles.' ),
				el( 'button', { type: 'button', className: 'button button-primary', onClick: onEdit }, 'Edit fields' ) ) ) );
}
