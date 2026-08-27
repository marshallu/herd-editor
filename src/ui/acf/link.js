/**
 * Link fields show the link they already have.
 *
 * ACF's return array carries `title`, `url` and `target`, and its markup already
 * puts them in `.link-title` and `.link-url` and flags the field with `-value`.
 * The stock rendering shows a "Select Link" button either way, so a resolved
 * link looks exactly like an empty one. This is a presentation change only — no
 * input is added, moved or renamed.
 *
 * A set link reads as one control: the row itself opens the link modal, so the
 * URL is text rather than a live anchor — following it would leave the post —
 * and the separate Edit button is gone. Clearing still has its own ✕, because
 * destroying a value should never be the thing a stray click does.
 *
 * The title and the URL are wrapped together so the chip can lay them out as a
 * line or, in the rail's ~230px, as a stack — without either arrangement having
 * to reason about the glyph and the ✕ that flank them. ACF rewrites both nodes by
 * descendant search (`this.$('.link-title').html()`, `this.$('.link-url').text()`),
 * so the extra level is invisible to it.
 */

/** Lucide `link`, matching the grip glyph in ../primitives.js. */
const LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function glyph() {
	const span = document.createElement( 'span' );
	span.className = 'herd-link__glyph';
	span.innerHTML = LINK_ICON;
	return span;
}

/**
 * Put the title and the URL in one block, so the chip can stack them.
 *
 * Inserted where the title stood, so ACF's `-link-ext` icon, the edit anchor and
 * the ✕ keep their order after it.
 *
 * @param {HTMLElement|null} wrap The `.link-wrap` being decorated.
 */
function stackText( wrap ) {
	if ( ! wrap || wrap.querySelector( '.herd-link__text' ) ) return;
	const title = wrap.querySelector( '.link-title' );
	const url = wrap.querySelector( '.link-url' );
	if ( ! title || ! url ) return;

	const text = document.createElement( 'span' );
	text.className = 'herd-link__text';
	title.before( text );
	text.append( title, url );
}

export function decorateLinks( form ) {
	if ( ! form ) return;
	form.querySelectorAll( '.acf-link' ).forEach( ( link ) => {
		if ( link.classList.contains( 'herd-link' ) || link.closest( '.acf-clone' ) ) return;
		link.classList.add( 'herd-link' );

		const add = link.querySelector( ':scope > [data-name="add"]' );
		if ( add ) {
			// `.button` is WP core's, and this site's admin CSS paints it green with
			// !important — which is why an empty field read as the loudest thing on
			// the row. ACF binds on `data-name`, so the class is safe to drop.
			add.classList.remove( 'button', 'button-primary' );
			// An empty state is an invitation, not a report.
			add.textContent = 'Choose a link';
			add.prepend( glyph() );
		}

		const wrap = link.querySelector( '.link-wrap' );
		if ( wrap ) wrap.prepend( glyph() );

		stackText( wrap );

		// ACF binds the modal to its own edit anchor, so that anchor stays in the
		// DOM and keeps the binding; the row forwards to it rather than reaching
		// for `acf.wpLink` behind ACF's back. CSS hides it.
		const edit = link.querySelector( '.link-wrap [data-name="edit"]' );
		if ( edit ) edit.classList.add( 'herd-link__edit' );

		if ( wrap && edit ) {
			wrap.setAttribute( 'role', 'button' );
			wrap.setAttribute( 'tabindex', '0' );
			wrap.setAttribute( 'aria-label', 'Edit link' );
			wrap.addEventListener( 'click', ( event ) => {
				// ✕ is inside the row and means the opposite thing.
				if ( event.target.closest( '[data-name="remove"]' ) ) return;
				// Someone selecting the title to copy it is not asking for a modal.
				if ( ! window.getSelection()?.isCollapsed ) return;
				event.preventDefault();
				edit.click();
			} );
			wrap.addEventListener( 'keydown', ( event ) => {
				if ( event.key !== 'Enter' && event.key !== ' ' ) return;
				if ( event.target !== wrap ) return;
				event.preventDefault();
				edit.click();
			} );
		}

		// A URL that is a live anchor invites a click that leaves the post — and
		// the row's own click is the edit modal. ACF only ever writes to this
		// node (`.text()`, and an `href` a span ignores), so a span is safe.
		const url = link.querySelector( '.link-wrap .link-url' );
		if ( url && url.tagName === 'A' ) {
			const text = document.createElement( 'span' );
			text.className = url.className;
			text.textContent = url.textContent;
			url.replaceWith( text );
		}

		const remove = link.querySelector( '.link-wrap [data-name="remove"]' );
		if ( remove ) {
			remove.setAttribute( 'aria-label', 'Clear link' );
			remove.textContent = '✕';
		}
	} );
}

/**
 * Strip the decoration from links in a row ACF has just cloned.
 *
 * Duplicating a row copies the class, the glyphs and the row's `role="button"` —
 * but not the click and keydown listeners bound above, and the `herd-link` guard
 * then makes `decorateLinks` skip the row. What is left hovers and focuses like a
 * control and does nothing. Removing the marks lets the decorator rebuild it.
 *
 * Only the parts that carry listeners or would double up are undone. The `<span>`
 * the URL became, the ✕'s text and the add button's label are all idempotent, and
 * the hidden inputs ACF serialises are never touched either way.
 *
 * @param {HTMLElement} root Any element holding link fields.
 */
export function resetLinks( root ) {
	if ( ! root ) return;
	root.querySelectorAll( '.acf-link.herd-link' ).forEach( ( link ) => {
		link.classList.remove( 'herd-link' );
		link.querySelectorAll( '.herd-link__glyph' ).forEach( ( node ) => node.remove() );
		const wrap = link.querySelector( '.link-wrap' );
		if ( ! wrap ) return;
		wrap.removeAttribute( 'role' );
		wrap.removeAttribute( 'tabindex' );
		wrap.removeAttribute( 'aria-label' );
	} );
}
