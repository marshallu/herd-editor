import { createElement, useEffect, useMemo, useRef, useState } from '@wordpress/element';

const el = createElement;

export function CommandPalette( { commands, context, onClose } ) {
	const [ query, setQuery ] = useState( '' );
	const [ selected, setSelected ] = useState( 0 );
	const input = useRef( null );
	const choices = useMemo( () => commands.filter( ( command ) => command.available( context ) && command.label.toLowerCase().includes( query.trim().toLowerCase() ) ), [ commands, context, query ] );
	useEffect( () => { input.current?.focus(); }, [] );
	useEffect( () => { setSelected( 0 ); }, [ query ] );
	const run = ( command ) => { onClose(); command.run?.(); };
	return el( 'div', { className: 'herd-modal', role: 'dialog', 'aria-modal': true, 'aria-label': 'Command palette', onMouseDown: ( event ) => event.target === event.currentTarget && onClose(), onKeyDown: ( event ) => {
		if ( event.key === 'Escape' ) { event.preventDefault(); onClose(); }
		if ( event.key === 'ArrowDown' ) { event.preventDefault(); setSelected( ( index ) => Math.min( index + 1, choices.length - 1 ) ); }
		if ( event.key === 'ArrowUp' ) { event.preventDefault(); setSelected( ( index ) => Math.max( index - 1, 0 ) ); }
		if ( event.key === 'Enter' && choices[ selected ] ) { event.preventDefault(); run( choices[ selected ] ); }
	} },
		el( 'div', { className: 'herd-command-palette' },
			el( 'label', { className: 'screen-reader-text', htmlFor: 'herd-command-search' }, 'Search commands' ),
			el( 'input', { ref: input, id: 'herd-command-search', type: 'search', value: query, placeholder: 'Search commands', onChange: ( event ) => setQuery( event.target.value ), 'aria-controls': 'herd-command-results', 'aria-activedescendant': choices[ selected ] ? `herd-command-${ choices[ selected ].id }` : undefined } ),
			el( 'ul', { id: 'herd-command-results', role: 'listbox', 'aria-label': 'Commands' }, choices.length ? choices.map( ( command, index ) => el( 'li', { key: command.id, id: `herd-command-${ command.id }`, role: 'option', 'aria-selected': index === selected }, el( 'button', { type: 'button', tabIndex: index === selected ? 0 : -1, onFocus: () => setSelected( index ), onClick: () => run( command ) }, el( 'span', null, command.label ), command.shortcut && el( 'kbd', null, command.shortcut ) ) ) ) : el( 'li', { className: 'herd-command-palette__empty' }, 'No commands match.' ) ) ) );
}
