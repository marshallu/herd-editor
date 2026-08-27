/**
 * The block picker, anchored to an insertion point.
 *
 * This component owns no position of its own — InsertPoint places it against the
 * gap the block will land in. It is mounted only while open, so the search box
 * and the highlight reset for free every time.
 */

import { createElement, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { canAddBlock } from '../adapters.js';
import { iconOf, titleFor } from './blocks.js';
import { BlockIcon } from './primitives.js';

const el = createElement;
let instances = 0;

/** Split a title around the search term so the match can be marked. */
function highlight( name, term, key ) {
	if ( ! term ) return name;
	const at = name.toLowerCase().indexOf( term );
	if ( at < 0 ) return name;
	return [
		name.slice( 0, at ),
		el( 'span', { key, className: 'herd-inserter__mark' }, name.slice( at, at + term.length ) ),
		name.slice( at + term.length ),
	];
}

export function Inserter( { catalog, counts, groupOrder = [], onInsert, onClose } ) {
	const [ query, setQuery ] = useState( '' );
	const [ highlighted, setHighlighted ] = useState( 0 );
	const [ baseId ] = useState( () => `herd-inserter-${ ++instances }` );
	const bodyRef = useRef( null );

	const term = query.trim().toLowerCase();

	/*
	 * `groups` is what gets drawn; `flat` is only the choices arrow keys may land
	 * on, so a block that is already at its single-instance limit can be listed
	 * and explained without ever becoming a dead stop in the keyboard path.
	 */
	const { groups, flat } = useMemo( () => {
		const matches = Object.entries( catalog )
			.filter( ( [ name, metadata ] ) => name.startsWith( 'acf/' ) && metadata.registered )
			// `inserter: false` is an explicit policy decision, unlike a block
			// that is merely at its one-instance limit and should explain why.
			.filter( ( [ , metadata ] ) => metadata.inserter !== false )
			.filter( ( [ name, metadata ] ) => ! term
				|| `${ metadata.title } ${ name } ${ metadata.group }`.toLowerCase().includes( term ) )
			.sort( ( a, b ) => ( a[ 1 ].title || a[ 0 ] ).localeCompare( b[ 1 ].title || b[ 0 ] ) );

		// Any group the order does not name still gets drawn, after the ones it does.
		const seen = matches.map( ( [ , metadata ] ) => metadata.group || '' );
		const labels = [ ...groupOrder, ...seen.filter( ( label ) => ! groupOrder.includes( label ) ) ];

		const nextFlat = [];
		const nextGroups = [];
		for ( const label of [ ...new Set( labels ) ] ) {
			const items = matches
				.filter( ( [ , metadata ] ) => ( metadata.group || '' ) === label )
				.map( ( [ name, metadata ] ) => {
					const disabled = ! canAddBlock( name, metadata, counts );
					const index = disabled ? -1 : nextFlat.length;
					if ( ! disabled ) nextFlat.push( name );
					return { name, metadata, disabled, index };
				} );
			if ( items.length ) nextGroups.push( { label, items } );
		}
		return { groups: nextGroups, flat: nextFlat };
	}, [ catalog, counts, groupOrder, term ] );

	useEffect( () => setHighlighted( 0 ), [ term ] );

	useEffect( () => {
		bodyRef.current
			?.querySelector( `#${ baseId }-opt-${ highlighted }` )
			?.scrollIntoView( { block: 'nearest' } );
	}, [ highlighted ] );

	const move = ( delta ) => setHighlighted( ( current ) =>
		Math.max( 0, Math.min( current + delta, flat.length - 1 ) ) );

	const onSearchKeyDown = ( event ) => {
		if ( event.key === 'Escape' ) {
			event.preventDefault();
			onClose();
		} else if ( event.key === 'ArrowDown' ) {
			event.preventDefault();
			move( 1 );
		} else if ( event.key === 'ArrowUp' ) {
			event.preventDefault();
			move( -1 );
		} else if ( event.key === 'Enter' ) {
			event.preventDefault();
			if ( flat[ highlighted ] ) onInsert( flat[ highlighted ] );
		}
	};

	return el( 'div', {
		className: 'herd-inserter',
		role: 'dialog',
		'aria-label': 'Insert a block',
	},
	el( 'div', { className: 'herd-inserter__search' },
		el( 'label', { className: 'screen-reader-text', htmlFor: `${ baseId }-search` }, 'Search blocks' ),
		el( 'input', {
			id: `${ baseId }-search`,
			type: 'search',
			value: query,
			autoFocus: true,
			autoComplete: 'off',
			placeholder: 'Search blocks',
			role: 'combobox',
			'aria-expanded': true,
			'aria-controls': `${ baseId }-results`,
			'aria-activedescendant': flat.length ? `${ baseId }-opt-${ highlighted }` : undefined,
			onChange: ( event ) => setQuery( event.target.value ),
			onKeyDown: onSearchKeyDown,
		} ) ),

	el( 'div', {
		className: 'herd-inserter__body',
		id: `${ baseId }-results`,
		role: 'listbox',
		'aria-label': 'Blocks',
		ref: bodyRef,
	},
	groups.length
		// A listbox may own groups, but not bare divs, so each heading and the
		// choices under it are wrapped in a labelled role="group".
		? groups.map( ( group ) => el( 'div', {
			key: group.label,
			className: 'herd-inserter__group',
			role: 'group',
			'aria-label': group.label,
		},
		el( 'div', { className: 'herd-inserter__grouplabel', 'aria-hidden': true }, group.label ),
		group.items.map( ( { name, metadata, disabled, index } ) => el( 'button', {
				key: name,
				id: disabled ? undefined : `${ baseId }-opt-${ index }`,
				type: 'button',
				role: 'option',
				'aria-selected': index === highlighted,
				'aria-disabled': disabled || undefined,
				className: `herd-inserter__choice${ index === highlighted ? ' is-selected' : '' }`,
				disabled,
				onMouseEnter: () => { if ( ! disabled ) setHighlighted( index ); },
				onClick: () => onInsert( name ),
			},
			el( BlockIcon, { icon: iconOf( metadata ) } ),
			el( 'span', { className: 'herd-inserter__title' },
				highlight( metadata.title || titleFor( { name } ), term, name ) ),
			disabled && el( 'span', { className: 'herd-badge' }, 'Already added' ) ) ) ) )
		: el( 'p', { className: 'herd-empty' },
			query ? `No block matches “${ query }”.` : 'No matching ACF blocks.' ) ) );
}
