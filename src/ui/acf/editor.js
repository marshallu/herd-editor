/**
 * Rich text fields get a budget and an honest empty state.
 *
 * The expensive half of this is solved server-side: `herd-editor.php` forces
 * `delay` on wysiwyg fields for Herd's own fetch-block requests, so ACF renders
 * a placeholder and only builds TinyMCE when someone clicks into it. Four
 * instances at mount is what makes a cards block crawl; one on demand does not.
 *
 * What is left is presentation — ACF's placeholder reads "Click to initialize
 * TinyMCE", which is a sentence about the implementation — plus the character
 * budget, which tells an editor how much room the design actually has.
 */

import { cleanText } from '../summary.js';

/**
 * Build the editors inside a root that ACF has been told to defer.
 *
 * ACF's delayed wysiwyg builds itself on `mousedown` over the placeholder, so
 * this is the same thing the editor would do by clicking — no ACF API is called
 * and no state is set behind ACF's back.
 *
 * Deferral exists so a collapsed repeater does not build an editor per row. Once
 * a row is open its editor should be ready to type in, not another thing to
 * click, so the caller wakes it at that moment.
 *
 * @param {HTMLElement} root Form, or one repeater row.
 */
export function awakenEditors( root ) {
	if ( ! root ) return;
	const wraps = Array.from( root.querySelectorAll( '.acf-editor-wrap.delay' ) );
	if ( ! wraps.length ) return;
	// A row is opened by a class change on the same tick. TinyMCE measures the
	// container as it builds, so let layout settle before handing it one.
	window.requestAnimationFrame( () => {
		wraps.forEach( ( wrap ) => {
			if ( ! wrap.isConnected || ! wrap.classList.contains( 'delay' ) ) return;
			wrap.dispatchEvent( new MouseEvent( 'mousedown', { bubbles: true, cancelable: true } ) );
		} );
	} );
}

function budgetFor( field, profile ) {
	const limit = profile?.budgets?.[ field.dataset.name ];
	return Number.isFinite( limit ) ? limit : 0;
}

function attachBudget( field, limit ) {
	const label = field.querySelector( ':scope > .acf-label' );
	const area = field.querySelector( 'textarea.wp-editor-area' );
	if ( ! label || ! area ) return;

	const counter = document.createElement( 'span' );
	counter.className = 'herd-budget';
	label.appendChild( counter );

	const update = () => {
		const used = cleanText( area.value ).length;
		counter.textContent = `${ used } / ${ limit }`;
		counter.classList.toggle( 'is-over', used > limit );
	};
	update();
	// TinyMCE writes back to the textarea on change once it is initialised.
	field.addEventListener( 'input', update );
	field.addEventListener( 'change', update );
}

export function decorateEditors( form, profile ) {
	if ( ! form ) return;
	form.querySelectorAll( '.acf-field-wysiwyg' ).forEach( ( field ) => {
		if ( field.classList.contains( 'herd-wysiwyg' ) || field.closest( '.acf-clone' ) ) return;
		field.classList.add( 'herd-wysiwyg' );

		const limit = budgetFor( field, profile );
		if ( limit ) attachBudget( field, limit );

		// A field outside a repeater is on screen the moment the block opens, so
		// there is nothing to defer; only rows earn the delay.
		if ( ! field.closest( '.acf-row' ) ) awakenEditors( field );
	} );
}
