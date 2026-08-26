/**
 * Choice fields: swatches, segmented controls, and the card style picker.
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

/* ---------- destructive style switch ---------- */

/**
 * Guard a style `select` rather than replace it.
 *
 * ACF's conditional logic hides the fields a style no longer reaches instead of
 * clearing them, so an unexplained switch leaves invisible rows in postmeta for
 * good. The select stays exactly as ACF rendered it; changing it puts the value
 * back and asks first.
 *
 * The strip only warns. Nothing here writes to the fields a switch orphans —
 * that data still persists, and now the editor has been told so.
 */
function decorateStyleSwitch( form, profile ) {
	const config = profile?.styleSwitch;
	if ( ! config ) return;

	const field = form.querySelector( `.acf-field-select[data-name="${ config.field }"]` );
	const select = field?.querySelector( 'select' );
	if ( ! select || field.classList.contains( 'herd-has-confirm' ) ) return;
	field.classList.add( 'herd-has-confirm' );

	const strip = document.createElement( 'div' );
	strip.className = 'herd-confirm';
	strip.hidden = true;

	const message = document.createElement( 'span' );
	message.className = 'herd-confirm__text';
	const keep = document.createElement( 'button' );
	keep.type = 'button';
	keep.className = 'herd-btn';
	const proceed = document.createElement( 'button' );
	proceed.type = 'button';
	proceed.className = 'herd-btn herd-btn--primary';
	proceed.textContent = 'Switch anyway';
	strip.append( message, keep, proceed );

	const styleName = ( value ) => config.styles?.[ value ]?.name || humanize( value );

	/** The last value the editor actually agreed to. */
	let settled = select.value;
	let pending = null;

	/** Move the select without treating the result as a fresh request. */
	const setValue = ( value ) => {
		if ( select.value === value ) return;
		select.value = value;
		// ACF's conditional logic follows the select, so this shows and hides the
		// fields the style reaches — including on the way back.
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	};

	const close = ( value ) => {
		settled = value;
		pending = null;
		strip.hidden = true;
		setValue( value );
	};

	select.addEventListener( 'change', () => {
		// Our own revert and confirm come back through here; neither is a new ask.
		if ( select.value === settled ) return;

		const rows = config.rows
			? form.querySelectorAll( `.acf-field[data-name="${ config.rows }"] .acf-row:not(.acf-clone)` ).length
			: 0;
		const impact = typeof config.impact === 'function' ? config.impact( settled, select.value, rows ) : '';
		if ( ! impact ) {
			settled = select.value;
			return;
		}

		pending = select.value;
		message.textContent = impact;
		// An action keeps its name through the whole flow.
		keep.textContent = `Keep ${ styleName( settled ).toLowerCase() }`;
		// Hold the select at the settled value until this is confirmed, then show
		// the ask — `setValue` re-enters this handler and must not clear it.
		setValue( settled );
		strip.hidden = false;
	} );

	keep.addEventListener( 'click', () => close( settled ) );
	proceed.addEventListener( 'click', () => pending && close( pending ) );

	select.closest( '.acf-input' ).appendChild( strip );
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
	decorateStyleSwitch( form, profile );
}
