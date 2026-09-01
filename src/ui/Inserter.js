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
import { BlockIcon, StarIcon } from './primitives.js';
import { orderedEligible } from './inserter-preferences.js';

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

export function Inserter( { catalog, counts, groupOrder = [], favorites = [], recent = [], structuralPolicy = {}, onToggleFavorite, onInsert, onClose } ) {
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
		const candidates = Object.entries( catalog )
			/*
			 * ACF blocks only, and this is load-bearing rather than vestigial:
			 * a panel is ACF's own form, fetched over `acf/ajax/fetch-block`.
			 * A core block has no such form, so offering one here would list a
			 * choice that cannot open. The block's category decides its group,
			 * which means Herd's groups are only ever the categories ACF blocks
			 * declare -- and why the curated-map filter still has a job.
			 */
			.filter( ( [ name, metadata ] ) => name.startsWith( 'acf/' ) && metadata.registered )
			// `inserter: false` is an explicit policy decision, unlike a block
			// that is merely at its one-instance limit and should explain why.
			.filter( ( [ name, metadata ] ) => metadata.inserter !== false && structuralPolicy.insert !== false && structuralPolicy.blocks?.[ name ]?.insert !== false );

		/*
		 * Search is two passes, because a description is too blunt to be part
		 * of the first one: a theme that gives every block "<Theme> <Name>
		 * block." would match its whole catalogue on the theme's own name. So
		 * titles, names, groups and block.json keywords answer first, and the
		 * description only gets a say when that found nothing at all.
		 */
		const primary = ( name, m ) => `${ m.title } ${ name } ${ m.group } ${ ( m.keywords || [] ).join( ' ' ) }`
			.toLowerCase().includes( term );
		const secondary = ( name, m ) => String( m.description || '' ).toLowerCase().includes( term );

		let matches = candidates.filter( ( [ name, m ] ) => ! term || primary( name, m ) );
		if ( term && ! matches.length ) matches = candidates.filter( ( [ name, m ] ) => secondary( name, m ) );
		matches = matches.sort( ( a, b ) => ( a[ 1 ].title || a[ 0 ] ).localeCompare( b[ 1 ].title || b[ 0 ] ) );

		// Any group the order does not name still gets drawn, after the ones it does.
		const seen = matches.map( ( [ , metadata ] ) => metadata.group || '' );
		const labels = [ ...groupOrder, ...seen.filter( ( label ) => ! groupOrder.includes( label ) ) ];

		const nextFlat = [];
		const nextGroups = [];
		/* Preferences are useful browsing shortcuts, never a search-ranking rule. */
		if ( !term ) {
			const preferred = [ [ 'Favorites', orderedEligible( favorites, catalog, counts ) ], [ 'Recent', orderedEligible( recent, catalog, counts ) ] ];
			for ( const [ label, names ] of preferred ) {
				const items = names.map( ( name ) => {
					const metadata = catalog[ name ]; const index = nextFlat.length; nextFlat.push( name );
					return { name, metadata, disabled: false, index };
				} );
				if ( items.length ) nextGroups.push( { label, items, preferred: true } );
			}
		}
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
	}, [ catalog, counts, favorites, recent, groupOrder, term ] );

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
			// Favorites and Recent are shortcuts into the same catalogue below, so
			// they are ruled off from the categories rather than blending into them.
			className: `herd-inserter__group${ group.preferred ? ' is-preferred' : '' }`,
			role: 'group',
			'aria-label': group.label,
		},
		/*
		 * A heading over the only list on screen is noise -- and on a theme
		 * whose blocks all share one category it is also the label most likely
		 * to be a slug nobody meant an editor to read. role="group" keeps its
		 * aria-label either way, so a screen reader loses nothing.
		 */
		groups.length > 1
			? el( 'div', { className: 'herd-inserter__grouplabel', 'aria-hidden': true }, group.label )
			: null,
		/*
		 * The star cannot live inside the choice -- a button may not nest a button
		 * -- so the two sit side by side in a row wrapper. role="presentation"
		 * keeps that wrapper out of the accessibility tree, so the role="group"
		 * still owns the options directly, which is the whole point of the note
		 * above. The wrapper carries `is-selected` only so the highlight spans the
		 * star column too; `aria-selected` stays on the option itself.
		 */
		group.items.map( ( { name, metadata, disabled, index } ) => {
			const starred = favorites.includes( name );
			return el( 'div', {
				key: name,
				className: `herd-inserter__row${ index === highlighted ? ' is-selected' : '' }`,
				role: 'presentation',
			},
			el( 'button', {
				id: disabled ? undefined : `${ baseId }-opt-${ index }`,
				type: 'button',
				role: 'option',
				'aria-selected': index === highlighted,
				'aria-disabled': disabled || undefined,
				className: 'herd-inserter__choice',
				disabled,
				onMouseEnter: () => { if ( ! disabled ) setHighlighted( index ); },
				onClick: () => onInsert( name ),
			},
			el( BlockIcon, { icon: iconOf( metadata ) } ),
			el( 'span', { className: 'herd-inserter__title' },
				highlight( metadata.title || titleFor( { name } ), term, name ) ),
			disabled && el( 'span', { className: 'herd-badge' }, 'Already added' ) ),
			// Enabled even on a block at its limit: what you can favourite and what
			// you can insert right now are different questions.
			onToggleFavorite && el( 'button', {
				type: 'button',
				className: `herd-inserter__favorite${ starred ? ' is-on' : '' }`,
				'aria-pressed': starred,
				'aria-label': starred ? `Remove ${ metadata.title || name } from favorites` : `Add ${ metadata.title || name } to favorites`,
				onClick: () => onToggleFavorite( name ),
			}, el( StarIcon, { filled: starred } ) ) );
		} ) ) )
		: el( 'p', { className: 'herd-empty' },
			query ? `No block matches “${ query }”.` : 'No matching ACF blocks.' ) ) );
}
