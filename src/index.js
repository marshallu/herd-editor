import { PluginMoreMenuItem } from '@wordpress/editor';
import { createElement, useEffect, useRef } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';
import { useDispatch, useSelect } from '@wordpress/data';

const el = createElement;

function Switcher() {
	const blocks = useSelect( ( select ) => select( 'core/block-editor' ).getBlocks(), [] );
	const { selectBlock } = useDispatch( 'core/block-editor' );
	const handledPath = useRef( false );
	useEffect( () => {
		if ( handledPath.current || ! window.HerdEditor.blockPath ) return;
		let siblings = blocks; let block = null;
		for ( const part of window.HerdEditor.blockPath.split( '.' ) ) { block = siblings[ Number( part ) ]; if ( ! block ) return; siblings = block.innerBlocks || []; }
		if ( block ) { selectBlock( block.clientId ); handledPath.current = true; }
	}, [ blocks ] );
	return el( PluginMoreMenuItem, { href: window.HerdEditor.herdUrl }, 'Switch to Herd Editor' );
}

registerPlugin( 'herd-editor-switcher', { render: Switcher } );
