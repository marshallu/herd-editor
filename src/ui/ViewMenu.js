/**
 * The View menu: everywhere this page can be looked at, under one button.
 *
 * Preview and View were two controls that answered nearly the same question, so
 * they are one menu now. Neither generates a URL of its own. "Preview your
 * changes" presses core's own #post-preview button -- parked out of sight by
 * src/rail.js -- so whatever core has wired to it is what runs, today and after
 * any future release changes its mind. "Open the live page" uses the permalink
 * herd_editor_view_url() already decided this post has, and is absent when it
 * decided it has none.
 *
 * The dismissal behaviour is the block inserter's (see ui/InsertPoint.js): an
 * outside mousedown closes, and closing hands focus back to the trigger. The
 * semantics differ -- the inserter is a dialog, this is a menu -- so this one
 * carries the arrow-key roving a menu is expected to have.
 *
 * Two choices is a short menu. It is a menu anyway because a third belongs here
 * -- previewing at a viewport -- and is not built yet.
 */

import { createElement, useEffect, useRef, useState } from '@wordpress/element';
import { Dashicon } from './primitives.js';

const el = createElement;
/** Chevron (Lucide chevron-down); rotates when the menu is open. */
function Chevron() {
	return el( 'svg', {
		className: 'herd-viewmenu__chevron',
		xmlns: 'http://www.w3.org/2000/svg',
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		'aria-hidden': true,
		focusable: 'false',
	}, el( 'polyline', { points: '6 9 12 15 18 9' } ) );
}

export function ViewMenu( { viewUrl, singular, isOpen, onOpen, onClose } ) {
	const triggerRef = useRef( null );
	const panelRef = useRef( null );

	/*
	 * src/rail.js parks #preview-action before the app renders, so asking for the
	 * button here is safe. It is absent for a post type nobody can view, which is
	 * core's own rule (is_post_type_viewable) and not one worth restating.
	 */
	const [ canPreview ] = useState( () => !! document.getElementById( 'post-preview' ) );

	/** The choices arrow keys may land on, in the order they are drawn. */
	const items = () => Array.from( panelRef.current?.querySelectorAll( '[role="menuitem"]' ) || [] );

	const dismiss = () => {
		triggerRef.current?.focus();
		onClose();
	};

	useEffect( () => {
		if ( ! isOpen ) return undefined;
		const onDown = ( event ) => {
			if ( panelRef.current?.contains( event.target ) ) return;
			if ( triggerRef.current?.contains( event.target ) ) return;
			onClose();
		};
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ isOpen ] );

	// Opening a menu puts you in it; the first choice is where that starts.
	useEffect( () => {
		if ( isOpen ) items()[ 0 ]?.focus();
	}, [ isOpen ] );

	const onKeyDown = ( event ) => {
		if ( event.key === 'Escape' ) {
			event.preventDefault();
			dismiss();
			return;
		}
		const step = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }[ event.key ];
		if ( step === undefined ) return;
		event.preventDefault();
		const all = items();
		if ( ! all.length ) return;
		const current = all.indexOf( document.activeElement );
		let next = 0;
		if ( step === 'last' ) next = all.length - 1;
		else if ( step !== 'first' ) next = ( current + step + all.length ) % all.length;
		all[ next ].focus();
	};

	const preview = canPreview && el( 'button', {
		type: 'button',
		className: 'herd-viewmenu__item',
		role: 'menuitem',
		onClick: () => {
			// Core's button, pressed. Not a second route to the same page.
			document.getElementById( 'post-preview' )?.click();
			dismiss();
		},
	}, 'Preview your changes' );

	const live = viewUrl && el( 'a', {
		className: 'herd-viewmenu__item',
		role: 'menuitem',
		href: viewUrl,
		target: '_blank',
		rel: 'noopener',
		onClick: dismiss,
	},
	'Open the live page',
	el( Dashicon, { icon: 'external', className: 'herd-viewmenu__ext' } ),
	el( 'span', { className: 'screen-reader-text' }, `, ${ singular || 'page' }, opens in a new tab` ) );

	return el( 'span', { className: 'herd-viewmenu' },
		el( 'button', {
			type: 'button',
			className: `herd-viewmenu__trigger${ isOpen ? ' is-open' : '' }`,
			ref: triggerRef,
			'aria-haspopup': 'menu',
			'aria-expanded': isOpen,
			onClick: () => ( isOpen ? dismiss() : onOpen() ),
			onKeyDown: ( event ) => {
				if ( event.key !== 'ArrowDown' || isOpen ) return;
				event.preventDefault();
				onOpen();
			},
		}, 'View', el( Chevron ) ),

		isOpen && el( 'div', {
			className: 'herd-viewmenu__panel',
			role: 'menu',
			ref: panelRef,
			onKeyDown,
		}, preview, live ) );
}
