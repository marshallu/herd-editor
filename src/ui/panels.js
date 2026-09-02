/** The three panel bodies: ACF form host, core-block editor, fallback notice. */

import { RichText } from '@wordpress/block-editor';
import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { changeHeadingLevel, replaceWrapperContent, wrapperInfo } from '../adapters.js';
import { AcfBlockFormBridge } from '../acf/bridge.js';
import { contextForBlock } from '../acf/helpers.js';
import { enhanceBlockForm, layoutBlockForm } from './acf/layout.js';
import { anchorOf, normalizeAnchor } from './anchors.js';
import { bodyFor } from './blocks.js';
import { Field, Notice, Spinner } from './primitives.js';

const el = createElement;

/**
 * Hosts ACF's own server-rendered field form.
 *
 * The bridge mounts on open and disposes on close, so several panels can be open
 * at once without leaving ACF instances behind.
 */
export function AcfForm( { block, ancestors, config, generation, validationErrors = [], onAttributes, getData, onBridgeMount } ) {
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
			getData,
			prepare: layoutBlockForm,
			enhance: ( form ) => enhanceBlockForm( form, block.name ),
		} );
		bridge.mount( host.current )
			.then( ( result ) => {
				if ( result.status === 'mounted' ) onBridgeMount?.( bridge );
				if ( active ) setState( result.status );
			} )
			.catch( ( reason ) => {
				if ( active && reason.name !== 'AbortError' ) {
					setError( reason.message || 'The ACF form could not be loaded.' );
					setState( 'failed' );
				}
			} );
		return () => {
			active = false;
			onBridgeMount?.( null, bridge );
			bridge.dispose();
		};
	}, [ block.clientId, generation, retry ] );

	return el( 'div', {
		className: `herd-editor__field-host${ state === 'mounted' ? ' herd-editor__field-host--ready' : '' }`,
		'aria-live': 'polite',
	},
		validationErrors.length > 0 && el( Notice, { status: 'error' }, validationErrors.map( ( error, index ) => el( 'p', { key: `${ error.field }-${ index }` }, error.message ) ) ),
		state === 'loading' && el( 'p', { className: 'herd-loading' }, el( Spinner ), 'Loading fields…' ),
		state === 'empty' && el( Notice, { status: 'info' }, 'This block has no editable ACF fields.' ),
		state === 'failed' && el( Notice, { status: 'error' },
			el( 'p', null, error ),
			el( 'button', { type: 'button', className: 'herd-btn', onClick: () => setRetry( ( value ) => value + 1 ) }, 'Retry' ) ),
		el( 'div', { ref: host, className: 'herd-editor__form' } ) );
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

/**
 * The block's Advanced disclosure: WordPress's HTML anchor, and nothing else yet.
 *
 * The anchor is stored where WordPress stores it -- the block comment's own
 * `anchor` attribute, not an ACF field -- so it is the same value the Block
 * Editor and the theme already read, and it survives Herd being switched off.
 *
 * Closed by default. An anchor is something you go looking for, and a block that
 * has none should not spend a row of the form saying so.
 */
export function AdvancedPanel( { block, permalink, isDuplicate, onAnchor } ) {
	const [ open, setOpen ] = useState( false );
	const [ copied, setCopied ] = useState( false );
	const urlRef = useRef();
	const anchor = anchorOf( block );
	const fieldId = `herd-anchor-${ block.clientId }`;
	const bodyId = `${ fieldId }-body`;
	const url = anchor ? `${ permalink || '' }#${ anchor }` : '';

	useEffect( () => {
		if ( ! copied ) return undefined;
		const timer = window.setTimeout( () => setCopied( false ), 2000 );
		return () => window.clearTimeout( timer );
	}, [ copied ] );

	/* A clipboard write can be refused -- an insecure origin, a permission the
	 * browser withholds. Selecting the text is the honest fallback: the author
	 * still gets the link, they just press the keys themselves. */
	const copy = async () => {
		try {
			await navigator.clipboard.writeText( url );
			setCopied( true );
		} catch {
			const node = urlRef.current;
			if ( ! node ) return;
			const range = document.createRange();
			range.selectNodeContents( node );
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange( range );
		}
	};

	return el( 'div', { className: 'herd-advanced' },
		el( 'button', {
			type: 'button',
			className: 'herd-advanced__toggle',
			'aria-expanded': open,
			'aria-controls': bodyId,
			onClick: () => setOpen( ( value ) => ! value ),
		},
		el( 'span', { className: `dashicons dashicons-arrow-${ open ? 'down' : 'right' }-alt2`, 'aria-hidden': true } ),
		'Advanced',
		// A closed row still has to say whether there is an anchor under it, or
		// auditing a page's jump links means opening every block on it.
		! open && anchor ? el( 'code', { className: 'herd-advanced__peek' }, `#${ anchor }` ) : null ),

		open ? el( 'div', { className: 'herd-advanced__body', id: bodyId },
			isDuplicate ? el( Notice, { status: 'error' },
				`Another block on this page already uses #${ anchor }. A jump link can only reach the first of them, so give one a different anchor.` ) : null,
			el( Field, { label: 'HTML anchor', htmlFor: fieldId, className: 'herd-advanced__field' },
				el( 'input', {
					id: fieldId,
					type: 'text',
					value: anchor,
					spellCheck: false,
					autoComplete: 'off',
					placeholder: 'schedule',
					'aria-describedby': `${ fieldId }-help`,
					onChange: ( event ) => {
						const value = normalizeAnchor( event.target.value );
						onAnchor( value || undefined );
					},
				} ) ),
			anchor
				? el( 'p', { className: 'herd-advanced__link', id: `${ fieldId }-help` },
					el( 'code', { ref: urlRef, className: 'herd-advanced__url' }, url ),
					el( 'button', { type: 'button', className: 'herd-ghost herd-advanced__copy', onClick: copy }, copied ? 'Copied' : 'Copy link' ) )
				: el( 'p', { className: 'herd-advanced__hint', id: `${ fieldId }-help` },
					'Name this block to create a jump link that takes visitors directly to it. Leave blank if you don’t need one.' ) )
			: null );
}

/** Unsupported blocks are preserved untouched and handed to the Block Editor. */
export function FallbackPanel( { blockEditorUrl, path } ) {
	const url = new URL( blockEditorUrl );
	url.searchParams.set( 'herd-block-path', path.join( '.' ) );
	return el( Notice, { status: 'warning' },
		el( 'p', null, 'This block is preserved as read only because Herd Editor has no safe adapter for it.' ),
		el( 'a', { className: 'herd-btn', href: url.toString() }, 'Open in Block Editor' ) );
}
