/**
 * Link fields show the link they already have.
 *
 * ACF's return array carries `title`, `url` and `target`, and its markup already
 * puts them in `.link-title` and `.link-url` and flags the field with `-value`.
 * The stock rendering shows a "Select Link" button either way, so a resolved
 * link looks exactly like an empty one. This is a presentation change only — no
 * input is added, moved or renamed.
 */

/** Lucide `link`, matching the grip glyph in ../primitives.js. */
const LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function glyph() {
	const span = document.createElement( 'span' );
	span.className = 'herd-link__glyph';
	span.innerHTML = LINK_ICON;
	return span;
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

		const edit = link.querySelector( '.link-wrap [data-name="edit"]' );
		if ( edit ) {
			edit.classList.add( 'herd-link__edit' );
			edit.textContent = 'Edit';
		}

		const remove = link.querySelector( '.link-wrap [data-name="remove"]' );
		if ( remove ) {
			remove.setAttribute( 'aria-label', 'Clear link' );
			remove.textContent = '✕';
		}
	} );
}
