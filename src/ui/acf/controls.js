/**
 * Choice fields: swatches, segmented controls, and the notice a site-restricted
 * choice raises.
 *
 * ACF's button group renders text radios sized for the Gutenberg sidebar. Herd
 * builds its own control instead of restyling that one — a colour control has to
 * render the colour, and a cards-per-row control has to show the columns.
 *
 * ACF's markup stays in the DOM, hidden. Its radios keep their names and remain
 * the value: selecting a Herd choice checks the matching radio and fires the
 * change ACF's conditional logic and Herd's serializer both listen for. Hidden
 * inputs serialize normally — that is the same reason a field ACF has hidden
 * conditionally still saves.
 *
 * Replacing native radios means replacing what they gave for free, so the group
 * is a real `radiogroup` with a roving tabindex and arrow keys.
 *
 * Site-restricted choices use the block's profile to explain their rule without
 * changing the selected value.
 */

import { humanize } from '../summary.js';

/** Choice values that name a colour rather than a layout. */
const COLORS = {
	green: '#00b140',
	white: '#ffffff',
	black: '#1d2327',
	gray: '#8c8f94',
	grey: '#8c8f94',
};

const SEGMENT_MAX = 4;

/** Arrow keys move the selection, exactly as they would across native radios. */
const STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function labelText( field ) {
	return field.querySelector( ':scope > .acf-label label' )?.textContent?.trim() || humanize( field.dataset.name || '' );
}

/** The text ACF put beside each radio is the choice's name. */
function choiceLabel( radio ) {
	return radio.closest( 'label' )?.textContent?.trim() || humanize( radio.value );
}

/**
 * Build a Herd radio group in front of ACF's.
 *
 * @param {HTMLElement}   field    The `.acf-field` wrapper.
 * @param {HTMLElement[]} radios   ACF's radios, which stay the value.
 * @param {string}        kind     Class suffix: `swatches` or `segments`.
 * @param {Function}      fillItem Renders one choice's contents.
 * @return {HTMLElement} The group.
 */
function buildGroup( field, radios, kind, fillItem ) {
	const group = document.createElement( 'div' );
	group.className = `herd-${ kind }`;
	group.setAttribute( 'role', 'radiogroup' );
	group.setAttribute( 'aria-label', labelText( field ) );

	const buttons = radios.map( ( radio ) => {
		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = `herd-${ kind }__item`;
		button.dataset.value = radio.value;
		button.setAttribute( 'role', 'radio' );
		fillItem( button, radio );
		group.appendChild( button );
		return button;
	} );

	const paint = () => {
		const checked = radios.findIndex( ( radio ) => radio.checked );
		buttons.forEach( ( button, index ) => {
			button.setAttribute( 'aria-checked', String( index === checked ) );
			// With nothing chosen yet the first choice is the way in.
			button.tabIndex = index === ( checked === -1 ? 0 : checked ) ? 0 : -1;
		} );
	};

	const select = ( index, focus ) => {
		const radio = radios[ index ];
		if ( ! radio ) return;
		radio.checked = true;
		// Native, bubbling: ACF's delegated jQuery handlers and Herd's own
		// serializer both hear it.
		radio.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		paint();
		if ( focus ) buttons[ index ].focus();
	};

	group.addEventListener( 'click', ( event ) => {
		const button = event.target.closest( `.herd-${ kind }__item` );
		if ( button ) select( buttons.indexOf( button ), false );
	} );

	group.addEventListener( 'keydown', ( event ) => {
		if ( event.key === 'Home' || event.key === 'End' ) {
			event.preventDefault();
			select( event.key === 'Home' ? 0 : buttons.length - 1, true );
			return;
		}
		const step = STEPS[ event.key ];
		if ( ! step ) return;
		event.preventDefault();
		const current = Math.max( 0, buttons.findIndex( ( button ) => button.tabIndex === 0 ) );
		select( ( current + step + buttons.length ) % buttons.length, true );
	} );

	// Conditional logic and revisions change the value without going through here.
	field.addEventListener( 'change', paint );
	paint();
	return group;
}

/**
 * A colour control has to render the colour. Text buttons labelled
 * "Green / White / Black / Gray" fail the one job a colour control has.
 */
function fillSwatch( button, radio ) {
	const chip = document.createElement( 'span' );
	chip.className = 'herd-swatches__chip';
	chip.style.background = COLORS[ radio.value ];
	chip.setAttribute( 'aria-hidden', 'true' );

	const label = document.createElement( 'span' );
	label.className = 'herd-swatches__label';
	label.textContent = choiceLabel( radio );

	button.append( chip, label );
}

function fillSegment( button, radio ) {
	button.textContent = choiceLabel( radio );
}

/** Every button group in the form becomes a swatch row or a segmented control. */
function decorateButtonGroups( form ) {
	form.querySelectorAll( '.acf-field-button-group' ).forEach( ( field ) => {
		if ( field.classList.contains( 'herd-has-choices' ) ) return;
		if ( field.closest( '.acf-clone' ) ) return;

		const acfGroup = field.querySelector( '.acf-button-group' );
		const radios = acfGroup ? Array.from( acfGroup.querySelectorAll( 'input[type="radio"]' ) ) : [];
		// One choice is not a decision. Cards Collection's `card_color` offers only
		// white, and a lone swatch reads as a control that has failed to load.
		if ( radios.length < 2 ) return;

		let group = null;
		if ( radios.every( ( radio ) => COLORS[ radio.value ] ) ) {
			group = buildGroup( field, radios, 'swatches', fillSwatch );
		} else if ( radios.length <= SEGMENT_MAX ) {
			group = buildGroup( field, radios, 'segments', fillSegment );
		}
		if ( ! group ) return;

		field.classList.add( 'herd-has-choices' );
		acfGroup.after( group );
	} );
}

/* ---------- site-restricted choices ---------- */

/**
 * The dialog the notices share, built on first use.
 *
 * It lives on the screen root rather than on `document.body` so the Herd tokens
 * resolve, and it is found by class rather than held in a module variable so a
 * second mount reuses the one already there.
 */
function alertDialog() {
	const found = document.querySelector( '.herd-alert' );
	if ( found ) return found;

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'herd-alert';

	const title = document.createElement( 'strong' );
	title.className = 'herd-alert__title';
	title.id = 'herd-alert-title';
	dialog.setAttribute( 'aria-labelledby', title.id );

	const body = document.createElement( 'p' );
	body.className = 'herd-alert__body';

	const actions = document.createElement( 'div' );
	actions.className = 'herd-alert__actions';

	const ok = document.createElement( 'button' );
	ok.type = 'button';
	ok.className = 'herd-btn herd-btn--primary';
	ok.textContent = 'Got it';
	// The message has one way out, so it is what the dialog opens focused on.
	ok.autofocus = true;
	actions.appendChild( ok );

	dialog.append( title, body, actions );
	( document.querySelector( '.herd-editor-screen' ) || document.body ).appendChild( dialog );

	ok.addEventListener( 'click', () => dialog.close() );
	dialog.addEventListener( 'click', ( event ) => {
		// The backdrop is the dialog element itself; anything inside it is not.
		if ( event.target === dialog ) dialog.close();
	} );

	return dialog;
}

function openAlert( notice ) {
	const dialog = alertDialog();
	dialog.querySelector( '.herd-alert__title' ).textContent = notice.title;
	dialog.querySelector( '.herd-alert__body' ).textContent = notice.body;
	// jsdom has no dialog implementation; the editor is the only place this runs.
	if ( typeof dialog.showModal === 'function' ) dialog.showModal();
}

/** What a field is currently set to, whether ACF drew it as a select or radios. */
function fieldValue( field ) {
	const select = field.querySelector( 'select' );
	if ( select ) return select.value;
	return field.querySelector( 'input[type="radio"]:checked' )?.value || '';
}

/**
 * Say the rule at the moment it is broken.
 *
 * Some choices a field group offers are only for one site, and the field group
 * has nowhere to record that — every site gets the same choices. The notice
 * fires on the change, not on mount: a block that already carries the value was
 * not set that way just now, and reopening it is not a decision to re-examine.
 *
 * It warns and nothing more. The value stays, because the editor who chose it
 * may be the one entitled to.
 */
function decorateChoiceNotices( form, profile ) {
	( profile?.choiceNotices || [] ).forEach( ( notice ) => {
		const field = form.querySelector( `.acf-field[data-name="${ notice.field }"]` );
		if ( ! field || field.classList.contains( 'herd-has-notice' ) ) return;
		if ( field.closest( '.acf-clone' ) ) return;
		field.classList.add( 'herd-has-notice' );

		field.addEventListener( 'change', () => {
			if ( fieldValue( field ) === notice.value ) openAlert( notice );
		} );
	} );
}

/**
 * Decorate every choice control in a mounted form.
 *
 * @param {HTMLElement} form    The initialised ACF form.
 * @param {Object|null} profile The block's profile, when it has one.
 */
export function decorateControls( form, profile ) {
	if ( ! form ) return;
	decorateButtonGroups( form );
	decorateChoiceNotices( form, profile );
}
