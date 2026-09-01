/** One accordion card in the block list. */

import { createElement } from '@wordpress/element';
import { BlockIcon, Dashicon, GripIcon, IconButton } from './primitives.js';

const el = createElement;

function highlighted( value, term ) {
	if ( !term ) return value;
	const expression = new RegExp( `(${ String( term ).replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) })`, 'ig' );
	return String( value ).split( expression ).filter( Boolean ).map( ( part, index ) => part.toLowerCase() === String( term ).toLowerCase() ? el( 'mark', { key: index }, part ) : part );
}

export function BlockRow( {
	block,
	depth,
	title,
	summary,
	icon,
	badge,
	warning,
	searchMatch,
	matchLabel,
	searchTerm,
	hidden,
	isOpen,
	keepBodyMounted,
	childrenExpanded,
	hasChildren,
	canReorder,
	isLifted,
	isDragging,
	dropEdge,
	structural,
	duplicateDisabled,
	deleteDisabled,
	tabIndex,
	registerRef,
	onFocus,
	onToggle,
	onToggleChildren,
	onKeyDown,
	onGripKeyDown,
	onGripDragStart,
	onGripDragEnd,
	onDragOver,
	onDragLeave,
	onDrop,
	onDuplicate,
	onDelete,
	onMove,
	children,
} ) {
	const classes = [ 'herd-block' ];
	if ( isOpen ) classes.push( 'is-open' );
	if ( isLifted ) classes.push( 'is-lifted' );
	if ( isDragging ) classes.push( 'is-dragging' );
	if ( dropEdge ) classes.push( `is-droptarget-${ dropEdge }` );
	// A hidden block is a state, not a warning: it reads as dimmed plus a labelled
	// pill, never colour alone.
	if ( hidden ) classes.push( 'is-hidden' );

	return el( 'li', {
		className: classes.join( ' ' ),
		style: { '--herd-depth': depth },
		onDragOver: canReorder ? onDragOver : undefined,
		onDragLeave: canReorder ? onDragLeave : undefined,
		onDrop: canReorder ? onDrop : undefined,
	},
		el( 'div', { className: 'herd-block__row' },
		canReorder
			? el( 'button', {
				type: 'button',
				className: 'herd-block__grip',
				draggable: true,
				'aria-pressed': isLifted,
				'aria-label': isLifted ? `Moving ${ title }. Use the arrow keys, then press Enter to drop.` : `Reorder ${ title }. Press Space to pick up, or drag.`,
				onClick: ( event ) => event.preventDefault(),
				onKeyDown: onGripKeyDown,
				onDragStart: onGripDragStart,
				onDragEnd: onGripDragEnd,
			}, el( GripIcon ) )
			: el( 'span', { className: 'herd-block__grip-spacer' } ),

		hasChildren
			? el( IconButton, {
				icon: childrenExpanded ? 'arrow-down-alt2' : 'arrow-right-alt2',
				label: childrenExpanded ? `Collapse children of ${ title }` : `Expand children of ${ title }`,
				className: 'herd-block__disclosure',
				onClick: onToggleChildren,
			} )
			: el( 'span', { className: 'herd-block__disclosure-spacer' } ),

		el( 'button', {
			type: 'button',
			className: 'herd-block__open',
			tabIndex,
			ref: registerRef,
			onFocus,
			onClick: onToggle,
			onKeyDown,
			'aria-expanded': isOpen,
		},
		el( 'span', { className: 'herd-block__icon' }, el( BlockIcon, { icon } ) ),
		el( 'span', { className: 'herd-block__main' },
			el( 'span', { className: 'herd-block__name' },
				el( 'span', { className: 'herd-block__title' }, highlighted( title, searchMatch ? searchTerm : '' ) ),
				hidden && el( 'span', { className: 'herd-badge herd-badge--muted' }, 'Hidden' ),
				badge && el( 'span', { className: 'herd-badge' }, badge ),
				// The one pill that is a problem rather than a state, so it is the one
				// that carries the validation red.
				warning && el( 'span', { className: 'herd-badge herd-badge--danger' }, warning ) ),
			summary && el( 'span', { className: 'herd-block__summary' }, summary, searchMatch && matchLabel && el( 'span', { className: 'herd-search-match' }, ` · ${ matchLabel }` ) ) ),
		el( Dashicon, { icon: 'arrow-down-alt2', className: 'herd-block__chev' } ) ),

		structural && el( 'span', { className: 'herd-block__tools' },
			onMove && el( IconButton, { icon: 'move', label: `Move ${ title }`, className: 'herd-block__tool herd-block__move', onClick: onMove } ),
			el( IconButton, {
				icon: 'admin-page',
				label: `Duplicate ${ title }`,
				className: 'herd-block__tool',
				disabled: duplicateDisabled,
				onClick: onDuplicate,
			} ),
			el( IconButton, {
				icon: 'trash',
				label: `Delete ${ title }`,
				className: 'herd-block__tool is-destructive',
				disabled: deleteDisabled,
				onClick: onDelete,
			} ) ) ),

	/* ACF forms are expensive server-rendered widgets. Their owner can request a
	 * retained body: hidden when collapsed, still mounted and ready on the next
	 * open. Other panels preserve the former mount-on-open behaviour. */
	( isOpen || keepBodyMounted ) && el( 'div', {
		className: 'herd-block__body',
		hidden: ! isOpen,
	}, children ) );
}
