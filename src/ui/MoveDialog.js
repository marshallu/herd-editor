import { createElement, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { Dashicon } from './primitives.js';

const el = createElement;

/** Put the non-actionable current position back into the otherwise valid choices. */
export function moveDialogRows( destinations, currentPosition, current ) {
	const rows = [];
	( destinations || [] ).forEach( ( destination ) => {
		if ( destination.slot > currentPosition && ! rows.some( ( row ) => row.current ) ) {
			rows.push( { id: 'current-position', current: true, ...current } );
		}
		rows.push( destination );
	} );
	if ( ! rows.some( ( row ) => row.current ) ) rows.push( { id: 'current-position', current: true, ...current } );
	return rows;
}

export function MoveDialog( { title, summary, position, total, destinations, onMove, onClose } ) {
	const [ selected, setSelected ] = useState( 0 );
	const destinationRefs = useRef( [] );
	const rows = useMemo( () => moveDialogRows( destinations, position - 1, { title, summary } ), [ destinations, position, title, summary ] );

	useEffect( () => {
		destinationRefs.current[ selected ]?.focus();
	}, [ selected ] );

	const browse = ( direction ) => {
		if ( ! destinations.length ) return;
		setSelected( ( current ) => ( current + direction + destinations.length ) % destinations.length );
	};
	/*
	 * Arrow keys are handled on the dialog so they work from the close and cancel
	 * buttons too. Enter deliberately is not: focus already sits on a real
	 * destination button, so the browser fires its onClick, and handling Enter
	 * here as well would move the block when you meant to press Cancel.
	 */
	const onKeyDown = ( event ) => {
		if ( event.key === 'Escape' ) {
			event.preventDefault();
			onClose();
		} else if ( event.key === 'ArrowDown' ) {
			event.preventDefault();
			browse( 1 );
		} else if ( event.key === 'ArrowUp' ) {
			event.preventDefault();
			browse( -1 );
		} else if ( event.key === 'Home' ) {
			event.preventDefault();
			if ( destinations.length ) setSelected( 0 );
		} else if ( event.key === 'End' ) {
			event.preventDefault();
			if ( destinations.length ) setSelected( destinations.length - 1 );
		}
	};

	return el( 'div', {
		className: 'herd-modal',
		role: 'dialog',
		'aria-modal': true,
		'aria-labelledby': 'herd-move-dialog-title',
		onKeyDown,
		onMouseDown: ( event ) => {
			if ( event.target === event.currentTarget ) onClose();
		},
	},
		el( 'div', { className: 'herd-move-dialog' },
			el( 'header', { className: 'herd-move-dialog__header' },
				el( 'div', { className: 'herd-move-dialog__heading' },
					el( 'h2', { id: 'herd-move-dialog-title' }, `Move ${ title }` ),
					el( 'p', null, `${ summary || title } · position ${ position } of ${ total }` ) ),
				el( 'button', { type: 'button', className: 'herd-move-dialog__close', onClick: onClose, 'aria-label': 'Close move dialog' }, el( Dashicon, { icon: 'no-alt' } ) ) ),
			el( 'ol', { className: 'herd-move-dialog__destinations', role: 'list' }, rows.map( ( row ) => {
				if ( row.current ) {
					return el( 'li', { key: row.id, className: 'herd-move-dialog__current' },
						el( 'span', { className: 'herd-badge herd-badge--accent' }, 'Current position' ),
						el( 'span', { className: 'herd-move-dialog__name' }, row.title ),
						row.summary && el( 'span', { className: 'herd-move-dialog__desc' }, row.summary ) );
				}
				/* The index is into destinations, not rows: the current-position row is not focusable. */
				const index = destinations.indexOf( row );
				return el( 'li', { key: row.id }, el( 'button', {
					type: 'button',
					className: index === selected ? 'is-selected' : undefined,
					/* The visible text is two ranks; the label is the sentence they read as. */
					'aria-label': row.label,
					ref: ( node ) => { destinationRefs.current[ index ] = node; },
					tabIndex: index === selected ? 0 : -1,
					onFocus: () => setSelected( index ),
					onClick: () => onMove( row.slot ),
				},
					el( 'span', { className: 'herd-move-dialog__name' }, row.name ),
					row.summary && el( 'span', { className: 'herd-move-dialog__desc' }, row.summary ) ) );
			} ) ),
			el( 'footer', { className: 'herd-move-dialog__footer' },
				el( 'p', null, '↑↓ to browse · Enter to move' ),
				el( 'button', { type: 'button', className: 'herd-btn', onClick: onClose }, 'Cancel' ) ) ) );
}
