/**
 * An insertion point between two blocks.
 *
 * At rest it is 14px of nothing. Hovering or focusing it draws a hairline and a
 * small round button, and clicking that opens the picker in place — so the block
 * an editor chooses lands where they were pointing, rather than at the bottom of
 * the document.
 */

import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { Inserter } from './Inserter.js';

const el = createElement;

/* Roughly the panel's height. Below this much room, it opens upwards instead. */
const PANEL_H = 340;

export function InsertPoint( { label, isOpen, onOpen, onClose, ...inserter } ) {
	const buttonRef = useRef( null );
	const panelRef = useRef( null );
	const [ placement, setPlacement ] = useState( 'below' );

	// Closing returns focus to the button that opened the panel. Inserting does
	// not: App sends focus to the new block's row, which is the more useful place
	// to land.
	const dismiss = () => {
		buttonRef.current?.focus();
		onClose();
	};

	useEffect( () => {
		if ( ! isOpen ) return undefined;
		const onDown = ( event ) => {
			if ( panelRef.current?.contains( event.target ) ) return;
			if ( buttonRef.current?.contains( event.target ) ) return;
			onClose();
		};
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ isOpen ] );

	const open = () => {
		const box = buttonRef.current?.getBoundingClientRect();
		const below = box ? window.innerHeight - box.bottom : PANEL_H;
		setPlacement( below < PANEL_H && box && box.top > PANEL_H ? 'above' : 'below' );
		onOpen();
	};

	return el( 'li', {
		className: `herd-gap${ isOpen ? ' is-open' : '' }`,
		role: 'presentation',
	},
	el( 'button', {
		type: 'button',
		className: 'herd-gap__btn',
		ref: buttonRef,
		'aria-label': label,
		'aria-haspopup': 'dialog',
		'aria-expanded': isOpen,
		onClick: () => ( isOpen ? dismiss() : open() ),
	}, el( 'span', { 'aria-hidden': true }, '+' ) ),

	isOpen && el( 'div', {
		className: `herd-gap__panel is-${ placement }`,
		ref: panelRef,
	}, el( Inserter, { ...inserter, onClose: dismiss } ) ) );
}
