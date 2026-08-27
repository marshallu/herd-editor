/**
 * Small presentational primitives.
 *
 * Herd deliberately does not use @wordpress/components here: the wp-components
 * stylesheet is not enqueued on this screen, and the design wants full control
 * of these few controls anyway.
 */

import { createElement } from '@wordpress/element';

const el = createElement;

export function Notice( { status = 'info', children } ) {
	return el( 'div', { className: `herd-notice is-${ status }` }, children );
}

export function Spinner() {
	return el( 'span', { className: 'herd-spinner', 'aria-hidden': true } );
}

export function Dashicon( { icon, className = '' } ) {
	return el( 'span', { className: `dashicons dashicons-${ icon || 'block-default' } ${ className }`.trim(), 'aria-hidden': true } );
}

/**
 * A block type's own icon: a dashicon slug, or the SVG its block.json declared.
 *
 * The markup is inlined rather than parsed. It arrives from the block registry
 * already run through an allowlist in PHP, the same trust `window.HerdEditor.icons`
 * already carries for the theme's icon set.
 */
export function BlockIcon( { icon, className = '' } ) {
	if ( icon?.svg ) {
		return el( 'span', {
			className: `herd-icon ${ className }`.trim(),
			'aria-hidden': true,
			dangerouslySetInnerHTML: { __html: icon.svg },
		} );
	}
	return el( Dashicon, { icon: icon?.slug, className } );
}

/** Drag handle glyph (Lucide grip-vertical). */
export function GripIcon() {
	return el( 'svg', {
		xmlns: 'http://www.w3.org/2000/svg',
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		'aria-hidden': true,
		focusable: 'false',
	},
	[ [ 9, 5 ], [ 9, 12 ], [ 9, 19 ], [ 15, 5 ], [ 15, 12 ], [ 15, 19 ] ].map(
		( [ cx, cy ] ) => el( 'circle', { key: `${ cx }-${ cy }`, cx, cy, r: 1 } )
	) );
}

export function Field( { label, htmlFor, className = '', children } ) {
	return el( 'div', { className: `herd-f ${ className }`.trim() },
		label && el( 'label', { htmlFor }, label ),
		children );
}

export function IconButton( { icon, label, className = '', ...props } ) {
	return el( 'button', { type: 'button', className, title: label, 'aria-label': label, ...props }, el( Dashicon, { icon } ) );
}
