/**
 * Herd's treatment for ACF Accordion sections in the rail.
 *
 * The More Info group is the densest thing in the rail -- 22 fields, 19 of them
 * toggles -- and it is authored as five Accordion sections. ACF renders those
 * itself and drives them itself; Herd has never had a word to say about them, so
 * they arrived as stock admin chrome (a dashicon arrow, a 300ms slide, ACF's own
 * grey) inside a panel styled to Herd's tokens.
 *
 * Almost all of the fix is CSS. What is left here is the two things a stylesheet
 * cannot say:
 *
 *   - the count on a section header, which has to be read from the toggles and
 *     kept current as conditional logic changes which ones are on offer
 *   - Space on a section header, which ACF gives `role="button"` and then does
 *     not implement
 *
 * TIMING. This runs on ACF's `ready`, not alongside the rest of `enhanceBoxes`.
 * The accordion's DOM does not exist until ACF initialises the field: only then
 * does `.acf-label` become `.acf-accordion-title`, `.acf-input` become
 * `.acf-accordion-content`, and the section's fields get moved inside it from
 * where they were rendered as its siblings.
 *
 * WHAT ACF OWNS, because everything here has to survive it:
 *   - `.acf-accordion.-open`, which is the open state and the only thing the
 *     stylesheet needs
 *   - the `<i class="acf-accordion-icon">`, which is REPLACED on every toggle --
 *     see `_acf-accordion.scss` for why Herd's chevron is a pseudo-element
 *   - the inline display/height on `.acf-accordion-content`, written by jQuery's
 *     slideDown and slideUp
 *   - `aria-expanded` on the title
 * Herd appends one node to the title and otherwise reads.
 */

import { isReachable } from './values.js';

/** The badge, and the property that finds it again. */
const BADGE = 'herdAccordionBadge';

/**
 * The toggles a section is currently offering.
 *
 * Descendant search rather than direct children: a toggle can sit inside a
 * `.herd-dep` group (./dep.js) or inside an ACF group's body, and it is still
 * one of this section's settings. A repeater's sub-field toggles are excluded --
 * `primary_cta` belongs to a row, not to the section -- by skipping anything
 * inside a repeater's table.
 *
 * @param {HTMLElement} section The `.acf-accordion` element.
 * @return {HTMLElement[]} True/false field wrappers.
 */
function togglesIn( section ) {
	const content = section.querySelector( ':scope > .acf-accordion-content' );
	if ( ! content ) return [];
	return Array.from( content.querySelectorAll( '.acf-field-true-false' ) ).filter(
		( field ) => ! field.closest( '.acf-repeater' ) && ! field.closest( '.acf-clone' )
	);
}

/**
 * How many of a section's settings are switched on.
 *
 * @param {HTMLElement} section The `.acf-accordion` element.
 * @return {number} The count, over the toggles the section is currently offering.
 */
export function countOn( section ) {
	return togglesIn( section ).filter(
		( field ) => isReachable( field ) && field.querySelector( 'input[type="checkbox"]' )?.checked
	).length;
}

/**
 * Write a section's count onto its badge.
 *
 * "3 on", and nothing at all when none are. A count of what is off would be the
 * same information told the long way round, and a badge reading "0 on" is a
 * badge whose only content is that it has nothing to say.
 *
 * @param {HTMLElement} section The `.acf-accordion` element.
 */
function paint( section ) {
	const badge = section[ BADGE ];
	if ( ! badge ) return;
	const on = countOn( section );
	badge.textContent = `${ on } on`;
	badge.hidden = on === 0;
}

/**
 * Give one section its badge and its Space key.
 *
 * @param {HTMLElement} section The `.acf-accordion` element.
 * @return {Function|null} Disposer, or null when there was nothing to do.
 */
function decorateAccordion( section ) {
	if ( section[ BADGE ] ) return null;
	const title = section.querySelector( ':scope > .acf-accordion-title' );
	if ( ! title ) return null;

	/*
	 * Appended, not prepended: ACF prepends its icon on every toggle, and a node
	 * before it would be pushed along one place each time. Nothing ACF does
	 * touches the end of the title.
	 */
	/*
	 * Not `.herd-badge`. That is the row flag — 10px, caps, letter-spaced — and a
	 * section count in caps reads as a shout beside a sentence-case heading.
	 */
	const badge = document.createElement( 'span' );
	badge.className = 'herd-accordion__count';
	title.appendChild( badge );
	section[ BADGE ] = badge;
	paint( section );

	/*
	 * ACF handles Enter (`which === 13`) on this element and stops there, despite
	 * having given it `role="button"` and `tabindex="0"`. Space does nothing but
	 * scroll the rail. Enter is deliberately not handled here, so there is no
	 * second listener for ACF's own to race.
	 *
	 * Split across keydown and keyup the way a native `<button>` behaves: keydown
	 * only cancels the scroll, and the activation happens on release. Acting on
	 * keydown instead would fire once per repeat for as long as the key is held.
	 *
	 * `title.click()` rather than a toggle of our own — ACF's delegated click
	 * handler already keeps `aria-expanded` in step, replaces its icon and honours
	 * `multi-expand`, and a second implementation of that is how the two drift.
	 */
	const isSpace = ( event ) => event.key === ' ' || event.key === 'Spacebar';
	const onKeydown = ( event ) => {
		if ( isSpace( event ) ) event.preventDefault();
	};
	const onKeyup = ( event ) => {
		if ( ! isSpace( event ) ) return;
		event.preventDefault();
		title.click();
	};
	title.addEventListener( 'keydown', onKeydown );
	title.addEventListener( 'keyup', onKeyup );

	return () => {
		title.removeEventListener( 'keydown', onKeydown );
		title.removeEventListener( 'keyup', onKeyup );
		badge.remove();
		delete section[ BADGE ];
	};
}

/**
 * Decorate every accordion section under a root, and keep the counts current.
 *
 * @param {HTMLElement} root  Anything holding `.acf-accordion` elements.
 * @param {Object}      [acf] ACF's global input API, for the conditional-logic actions.
 * @return {Function} Disposer for the listeners this attached.
 */
export function decorateAccordions( root, acf ) {
	if ( ! root ) return () => {};
	const stops = [];

	Array.from( root.querySelectorAll( '.acf-accordion' ) ).forEach( ( section ) => {
		// ACF builds a repeater row from a hidden template; its fields are not on
		// offer and its badge would count values nobody has entered.
		if ( section.closest( '.acf-clone' ) ) return;
		const stop = decorateAccordion( section );
		if ( stop ) stops.push( stop );
	} );

	if ( ! stops.length ) return () => {};

	/*
	 * ACF opens a section with jQuery's `slideDown(300)`. That is an animation over
	 * inline styles, so no media query reaches it and the stylesheet's reduced-motion
	 * block can only settle the chevron. This is the one lever there is.
	 *
	 * Deliberately broader than this component — it also makes ACF's row-removal
	 * collapse instant — which is the honest reading of the preference rather than a
	 * side effect. The previous value is restored by the disposer.
	 */
	const jq = typeof window !== 'undefined' ? window.jQuery : null;
	if ( jq?.fx && window.matchMedia?.( '(prefers-reduced-motion: reduce)' )?.matches ) {
		const wasOff = jq.fx.off;
		jq.fx.off = true;
		stops.push( () => {
			jq.fx.off = wasOff;
		} );
	}

	const refresh = () => {
		Array.from( root.querySelectorAll( '.acf-accordion' ) ).forEach( paint );
	};

	// A toggle the editor flips.
	root.addEventListener( 'change', refresh );
	stops.push( () => root.removeEventListener( 'change', refresh ) );

	/*
	 * And a toggle conditional logic takes away or gives back, which changes the
	 * count without any input on screen having been touched. ACF announces those
	 * rather than firing `change`, so the badge would otherwise keep counting a
	 * setting that is no longer on offer.
	 */
	if ( typeof acf?.addAction === 'function' ) {
		[ 'show_field', 'hide_field', 'append', 'remove' ].forEach( ( action ) => {
			acf.addAction( action, refresh );
			stops.push( () => acf.removeAction?.( action, refresh ) );
		} );
	}

	return () => stops.forEach( ( stop ) => stop && stop() );
}

/**
 * Put every section back the way ACF rendered it.
 *
 * @param {HTMLElement} root Anything holding `.acf-accordion` elements.
 */
export function resetAccordions( root ) {
	if ( ! root ) return;
	Array.from( root.querySelectorAll( '.acf-accordion' ) ).forEach( ( section ) => {
		const badge = section[ BADGE ];
		if ( ! badge ) return;
		badge.remove();
		delete section[ BADGE ];
	} );
}
