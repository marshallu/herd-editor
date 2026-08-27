/**
 * Command-bar contents owned by the editor app.
 *
 * These are portalled into the PHP-rendered bar so they sit beside the native
 * Update button that src/rail.js relocates there.
 *
 * The right side used to be five separate readouts and controls. It is four
 * now: one line that says what the post is and when it was last saved, a joined
 * undo/redo pair, the View menu, and core's Update button after them.
 */

import { createElement } from '@wordpress/element';
import { IconButton } from './primitives.js';
import { ViewMenu } from './ViewMenu.js';

const el = createElement;

export function BarTools( {
	dirty,
	savedLabel,
	statusLabel,
	isPublished,
	viewUrl,
	singular,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	menuOpen,
	onMenuOpen,
	onMenuClose,
} ) {
	return el( 'span', { className: 'herd-bar__tools' },
		/*
		 * The status and the save state were a pill and a sentence saying two halves
		 * of one thing. They are one sentence now: the state carries the weight, the
		 * timestamp trails it.
		 *
		 * The live region is the tail alone. The status does not change while the
		 * page is open, and a region wrapped around both would read the whole
		 * sentence out again every time the document went clean.
		 */
		el( 'span', { className: `herd-bar__savestate${ dirty ? ' is-dirty' : '' }` },
			el( 'span', { className: `herd-bar__dot${ isPublished ? '' : ' is-draft' }`, 'aria-hidden': true } ),
			el( 'strong', { className: 'herd-bar__state' }, statusLabel ),
			el( 'span', { className: 'herd-bar__saved', role: 'status' }, ` · ${ dirty ? 'unsaved changes' : savedLabel }` ) ),

		el( 'span', { className: 'herd-bar__divider', 'aria-hidden': true } ),

		el( 'span', { className: 'herd-bar__history', role: 'group', 'aria-label': 'History' },
			el( IconButton, { icon: 'undo', label: 'Undo', className: 'herd-iconbtn herd-iconbtn--start', disabled: ! canUndo, onClick: onUndo } ),
			el( IconButton, { icon: 'redo', label: 'Redo', className: 'herd-iconbtn herd-iconbtn--end', disabled: ! canRedo, onClick: onRedo } ) ),

		el( ViewMenu, { viewUrl, singular, isOpen: menuOpen, onOpen: onMenuOpen, onClose: onMenuClose } ) );
}
