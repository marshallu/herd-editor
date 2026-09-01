import { createElement } from '@wordpress/element';
import { outlineRecords } from './block-index.js';
const el = createElement;

export function Outline( { records, filter, onFilter, currentId, onSelect, drawer = false, onClose } ) {
	const shown = outlineRecords( records, filter );
	return el( 'aside', { className: `herd-outline${ drawer ? ' herd-outline--drawer' : '' }`, 'aria-label': 'Document outline' },
		el( 'div', { className: 'herd-outline__head' }, el( 'strong', null, 'Outline' ), drawer && el( 'button', { type: 'button', onClick: onClose }, 'Close' ) ),
		el( 'div', { className: 'herd-outline__filters' }, [ 'all', 'hidden', 'errors', 'warnings' ].map( ( item ) => el( 'button', { key: item, type: 'button', className: filter === item ? 'is-active' : '', onClick: () => onFilter( item ) }, item ) ) ),
		el( 'ol', null, shown.map( ( record ) => el( 'li', { key: record.clientId, style: { '--herd-outline-depth': record.ancestors.length } }, el( 'button', { type: 'button', className: currentId === record.clientId ? 'is-current' : '', onClick: () => onSelect( record.clientId ) }, record.title, record.summary && el( 'small', null, record.summary ), ( record.hidden || record.errors.length || record.warning.length ) && el( 'em', null, `${ record.errors.length + record.warning.length }` ) ) ) ) ) );
}
