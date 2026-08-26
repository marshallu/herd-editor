/**
 * Command-bar contents owned by the editor app.
 *
 * These are portalled into the PHP-rendered bar so they sit beside the native
 * Preview and Update buttons that src/rail.js relocates there.
 */

import { createElement } from '@wordpress/element';
import { IconButton } from './primitives.js';

const el = createElement;

export function BarTools( { dirty, savedLabel, canUndo, canRedo, onUndo, onRedo } ) {
	return el( 'span', { className: 'herd-bar__tools' },
		el( 'span', { className: `herd-bar__savestate${ dirty ? ' is-dirty' : '' }`, role: 'status' },
			el( 'span', { className: 'herd-bar__dot', 'aria-hidden': true } ),
			dirty ? 'Unsaved changes' : savedLabel ),
		el( IconButton, { icon: 'undo', label: 'Undo', className: 'herd-iconbtn', disabled: ! canUndo, onClick: onUndo } ),
		el( IconButton, { icon: 'redo', label: 'Redo', className: 'herd-iconbtn', disabled: ! canRedo, onClick: onRedo } ) );
}
