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

/**
 * What the tail of the status line should say.
 *
 * The block editor's PostSavedState answers this in one place and in this order:
 * a save in progress wins, naming itself so an autosave is distinguishable from
 * a deliberate one; then a save that has just landed; then the resting state.
 * Herd keeps the resting state it already had -- a timestamp is more use than
 * the word "Saved" once the moment has passed.
 *
 * @param {string}  saveState  'autosaving', 'saving-draft', 'saving', 'saved', or 'idle'.
 * @param {boolean} dirty      Whether the document has unsaved changes.
 * @param {string}  savedLabel When it was last saved.
 * @return {string} The tail text.
 */
export function saveStateLabel( saveState, dirty, savedLabel ) {
	if ( saveState === 'autosaving' ) return 'Autosaving';
	if ( saveState === 'saving-draft' ) return 'Saving draft…';
	if ( saveState === 'saving' ) return 'Saving';
	if ( saveState === 'saved' ) return 'Saved';
	return dirty ? 'unsaved changes' : savedLabel;
}

export function BarTools( {
	dirty,
	saveState = 'idle',
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
		el( 'span', { className: `herd-bar__savestate${ dirty ? ' is-dirty' : '' }${ saveState !== 'idle' ? ` is-${ saveState }` : '' }` },
			el( 'span', { className: `herd-bar__dot${ isPublished ? '' : ' is-draft' }`, 'aria-hidden': true } ),
			el( 'strong', { className: 'herd-bar__state' }, statusLabel ),
			el( 'span', { className: 'herd-bar__saved', role: 'status' }, ` · ${ saveStateLabel( saveState, dirty, savedLabel ) }` ) ),

		el( 'span', { className: 'herd-bar__divider', 'aria-hidden': true } ),

		el( 'span', { className: 'herd-bar__history', role: 'group', 'aria-label': 'History' },
			el( IconButton, { icon: 'undo', label: 'Undo', className: 'herd-iconbtn herd-iconbtn--start', disabled: ! canUndo, onClick: onUndo } ),
			el( IconButton, { icon: 'redo', label: 'Redo', className: 'herd-iconbtn herd-iconbtn--end', disabled: ! canRedo, onClick: onRedo } ) ),

		el( ViewMenu, { viewUrl, singular, isOpen: menuOpen, onOpen: onMenuOpen, onClose: onMenuClose } ) );
}
