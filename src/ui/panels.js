/** The three panel bodies: ACF form host, core-block editor, fallback notice. */

import { RichText } from '@wordpress/block-editor';
import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { changeHeadingLevel, replaceWrapperContent, wrapperInfo } from '../adapters.js';
import { AcfBlockFormBridge } from '../acf/bridge.js';
import { contextForBlock } from '../acf/helpers.js';
import { enhanceBlockForm, layoutBlockForm } from './acf/layout.js';
import { bodyFor } from './blocks.js';
import { Field, Notice, Spinner } from './primitives.js';

const el = createElement;

/**
 * Hosts ACF's own server-rendered field form.
 *
 * The bridge mounts on open and disposes on close, so several panels can be open
 * at once without leaving ACF instances behind.
 */
export function AcfForm( { block, ancestors, config, generation, onAttributes } ) {
	const host = useRef();
	const [ state, setState ] = useState( 'loading' );
	const [ error, setError ] = useState( '' );
	const [ retry, setRetry ] = useState( 0 );

	useEffect( () => {
		let active = true;
		setState( 'loading' );
		setError( '' );
		const bridge = new AcfBlockFormBridge( {
			block,
			postId: config.postId,
			context: contextForBlock( ancestors, config.blockTypes, config.postId, config.postType ),
			onAttributes,
			prepare: layoutBlockForm,
			enhance: ( form ) => enhanceBlockForm( form, block.name ),
		} );
		bridge.mount( host.current )
			.then( ( result ) => active && setState( result.status ) )
			.catch( ( reason ) => {
				if ( active && reason.name !== 'AbortError' ) {
					setError( reason.message || 'The ACF form could not be loaded.' );
					setState( 'failed' );
				}
			} );
		return () => {
			active = false;
			bridge.dispose();
		};
	}, [ block.clientId, generation, retry ] );

	return el( 'div', { className: 'herd-editor__field-host', 'aria-live': 'polite' },
		state === 'loading' && el( 'p', { className: 'herd-loading' }, el( Spinner ), 'Loading fields…' ),
		state === 'empty' && el( Notice, { status: 'info' }, 'This block has no editable ACF fields.' ),
		state === 'failed' && el( Notice, { status: 'error' },
			el( 'p', null, error ),
			el( 'button', { type: 'button', className: 'herd-btn', onClick: () => setRetry( ( value ) => value + 1 ) }, 'Retry' ) ),
		el( 'div', { ref: host } ) );
}

/** Focused editors for the four supported core blocks. */
export function CoreEditor( { block, adapterId, onBody, onHeading } ) {
	const body = bodyFor( block );

	if ( adapterId === 'paragraph' ) {
		const wrapper = wrapperInfo( body, 'p' );
		return el( RichText, {
			tagName: 'div',
			className: 'herd-richtext',
			value: wrapper.content,
			onChange: ( value ) => onBody( replaceWrapperContent( body, 'p', value ) ),
			placeholder: 'Write paragraph…',
			'aria-label': 'Paragraph content',
		} );
	}

	if ( adapterId === 'heading' ) {
		const level = Number( block.attributes.level ) || Number( body.match( /^\s*<h([1-6])\b/i )?.[ 1 ] ) || 2;
		const wrapper = wrapperInfo( body, `h${ level }` );
		const levelId = `herd-level-${ block.clientId }`;
		return el( 'div', { className: 'herd-core-fields' },
			el( Field, { label: 'Heading level', htmlFor: levelId, className: 'herd-core-fields__level' },
				el( 'select', {
					id: levelId,
					value: String( level ),
					onChange: ( event ) => onHeading( Number( event.target.value ), changeHeadingLevel( body, event.target.value ) ),
				}, [ 1, 2, 3, 4, 5, 6 ].map( ( option ) => el( 'option', { key: option, value: String( option ) }, `H${ option }` ) ) ) ),
			el( RichText, {
				tagName: 'div',
				className: 'herd-richtext',
				value: wrapper.content,
				onChange: ( value ) => onBody( replaceWrapperContent( body, `h${ level }`, value ) ),
				placeholder: 'Write heading…',
				'aria-label': 'Heading content',
			} ) );
	}

	const isHtml = adapterId === 'html';
	const fieldId = `herd-code-${ block.clientId }`;
	return el( Field, { label: isHtml ? 'HTML' : 'Shortcode', htmlFor: fieldId, className: 'herd-code-field' },
		el( 'textarea', {
			id: fieldId,
			rows: isHtml ? 12 : 4,
			value: body,
			onChange: ( event ) => onBody( event.target.value ),
		} ) );
}

/** Unsupported blocks are preserved untouched and handed to the Block Editor. */
export function FallbackPanel( { blockEditorUrl, path } ) {
	const url = new URL( blockEditorUrl );
	url.searchParams.set( 'herd-block-path', path.join( '.' ) );
	return el( Notice, { status: 'warning' },
		el( 'p', null, 'This block is preserved as read only because Herd Editor has no safe adapter for it.' ),
		el( 'a', { className: 'herd-btn', href: url.toString() }, 'Open in Block Editor' ) );
}
