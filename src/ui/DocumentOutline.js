import { createElement } from '@wordpress/element';

const el = createElement;

export function DocumentOutline( { rows, onSelect } ) {
	return el( 'aside', { className: 'herd-outline', 'aria-label': 'Document outline' },
		el( 'strong', { className: 'herd-outline__title' }, 'Outline' ),
		el( 'ol', null, rows.map( ( row ) => el( 'li', { key: row.clientId, style: { '--herd-outline-depth': row.ancestors.length } }, el( 'button', { type: 'button', onClick: () => onSelect( row ) }, row.title, row.hidden && el( 'span', null, ' Hidden' ), row.summary && el( 'small', null, row.summary ) ) ) ) ) );
}
