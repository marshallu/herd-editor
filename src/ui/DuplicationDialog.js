import { createElement, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { duplicationReviewValues } from '../duplication.js';

const el = createElement;

export function DuplicationDialog( { block, title, profiles, fields = {}, onDuplicate, onClose } ) {
	const profile = profiles?.[ block.name ] || {};
	const choices = useMemo( () => duplicationReviewValues( block, profiles ).map( ( name ) => ( { name, label: fields[ block.attributes?.data?.[ `_${ name }` ] ]?.label || name } ) ), [ block, profiles, fields ] );
	const [ clear, setClear ] = useState( () => new Set( ( profile.clear || [] ).filter( ( name ) => choices.some( ( choice ) => choice.name === name ) ) ) );
	const primary = useRef( null );
	useEffect( () => primary.current?.focus(), [] );
	return el( 'div', { className: 'herd-modal', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'herd-duplicate-title', onMouseDown: ( event ) => event.target === event.currentTarget && onClose(), onKeyDown: ( event ) => event.key === 'Escape' && onClose() },
		el( 'div', { className: 'herd-duplicate-dialog' },
			el( 'h2', { id: 'herd-duplicate-title' }, `Duplicate ${ title }` ),
			el( 'p', null, profile.message || 'Review values that should not be copied.' ),
			choices.length ? el( 'fieldset', null, el( 'legend', null, 'Clear from the copy' ), choices.map( ( choice ) => el( 'label', { key: choice.name }, el( 'input', { type: 'checkbox', checked: clear.has( choice.name ), onChange: () => setClear( ( current ) => { const next = new Set( current ); next.has( choice.name ) ? next.delete( choice.name ) : next.add( choice.name ); return next; } ) } ), ` ${ choice.label }` ) ) ) : null,
			el( 'div', { className: 'herd-duplicate-dialog__actions' }, el( 'button', { type: 'button', className: 'button', onClick: onClose }, 'Cancel' ), el( 'button', { ref: primary, type: 'button', className: 'button button-primary', onClick: () => onDuplicate( [ ...clear ] ) }, 'Duplicate block' ) ) ) );
}
