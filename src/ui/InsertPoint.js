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

/* What the panel asks for when nothing is in its way. */
const PANEL_H = 340;
/* A panel shorter than this is not worth opening, so it never shrinks past it. */
const MIN_H = 200;
/* Breathing room kept between the panel and the edge of the viewport. */
const MARGIN = 12;

export function InsertPoint( { label, isOpen, onOpen, onClose, preferAbove = false, ...inserter } ) {
	const buttonRef = useRef( null );
	const panelRef = useRef( null );
	const [ placement, setPlacement ] = useState( { side: 'below', height: PANEL_H } );

	// Closing returns focus to the button that opened the panel. Inserting does
	// not: App sends focus to the new block's row, which is the more useful place
	// to land.
	const dismiss = () => {
		buttonRef.current?.focus();
		onClose();
	};

	/*
	 * Which way the panel opens, and how tall it is allowed to be, are the same
	 * question: measure the room on both sides of the button, take the preferred
	 * side unless the other one is genuinely roomier, then hand the panel the
	 * space it actually has so the list scrolls instead of leaving the viewport.
	 */
	const measure = () => {
		const box = buttonRef.current?.getBoundingClientRect();
		if ( ! box ) return;
		const room = {
			above: box.top - MARGIN,
			below: window.innerHeight - box.bottom - MARGIN,
		};
		const wanted = preferAbove ? 'above' : 'below';
		const other = preferAbove ? 'below' : 'above';
		const side = room[ wanted ] >= PANEL_H || room[ wanted ] >= room[ other ] ? wanted : other;
		setPlacement( { side, height: Math.min( PANEL_H, Math.max( MIN_H, room[ side ] ) ) } );
	};

	useEffect( () => {
		if ( ! isOpen ) return undefined;
		const onDown = ( event ) => {
			if ( panelRef.current?.contains( event.target ) ) return;
			if ( buttonRef.current?.contains( event.target ) ) return;
			onClose();
		};
		// Scrolling or resizing moves the button relative to the viewport, so the
		// side it opened on can stop being the side with the room.
		document.addEventListener( 'mousedown', onDown );
		window.addEventListener( 'resize', measure );
		window.addEventListener( 'scroll', measure, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown );
			window.removeEventListener( 'resize', measure );
			window.removeEventListener( 'scroll', measure, true );
		};
	}, [ isOpen ] );

	const open = () => {
		measure();
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
		className: `herd-gap__panel is-${ placement.side }`,
		ref: panelRef,
		style: { '--herd-inserter-h': `${ placement.height }px` },
	}, el( Inserter, { ...inserter, onClose: dismiss } ) ) );
}
