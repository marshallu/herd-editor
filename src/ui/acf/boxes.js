/**
 * Herd's field treatment for ACF groups that render as native postboxes.
 *
 * Six page-level field groups render as ordinary meta boxes rather than through
 * the block form host, and src/rail.js distributes them into the rail tabs. The
 * whole block pipeline — layout, widths, icon pickers, media rows — is built on
 * the block form's DOM and its bridge lifecycle, and none of it is offered here.
 * What is offered is the components whose treatment is Herd's own and whose
 * markup is ACF's everywhere: the link chip, and the repeater as a list of
 * collapsed card rows.
 *
 * Two things are offered here and nowhere else, because a block form never
 * reaches them — ../layout.js bails out of Herd's layout the moment it sees a
 * Tab or an Accordion, so a field group carrying either keeps ACF's own
 * sequential arrangement, and in practice only the rail groups carry one:
 *
 *   - ./accordion.js, the count on a section header and the Space key ACF's
 *     `role="button"` promises and does not implement
 *   - ./dep.js, the fields a toggle reveals, grouped under the toggle
 *
 * A link in the More Info group had none of it. Its title, URL and clear button
 * wrapped onto three lines inside a row ACF drew with the site's black rules,
 * while the same field one panel over rendered as a chip — and the row around it
 * stacked three labelled fields to 240px, so three links filled the panel.
 *
 * Timing: herd-editor.php enqueues the bundle in the footer with no defer, so
 * this runs synchronously before jQuery's `ready` — which is when ACF initialises
 * a postbox's fields. The rail decorates the stable controls ACF renders, but
 * deliberately does not rebuild table-layout repeaters: their Link controls own
 * several hidden inputs which must remain in ACF's original DOM for saving.
 */

import { decorateAccordions } from './accordion.js';
import { decorateDeps } from './dep.js';
import { applyWidths } from './widths.js';
import { decorateLinks, resetLinks } from './link.js';
import { decorateRepeaters } from './repeater.js';

/** The two surfaces src/rail.js puts postboxes on; see src/css/_boxes.scss. */
export const BOX_SURFACES = '.herd-rail__panel, .herd-main__boxes';

/*
 * The repeater work is the rail's alone. `main` is the escape hatch a field group
 * too wide for the rail is routed to, so a table repeater sent there is one
 * somebody wanted columns for, and collapsing it to card rows would take away the
 * reason it was sent. A link chip is the same control on both.
 */
const RAIL = '.herd-rail__panel';

/**
 * Everything a row of a rail repeater needs before it can be summarised.
 *
 * The block form's decorators that are about a *block* — icons, media, groups,
 * flexible layouts — are not offered here. What is left is what the card row
 * reads from and what the open row lays out against.
 *
 * @param {HTMLElement} row A `tr.acf-row` ACF has rendered or just cloned.
 */
function decorateRow( row ) {
	// A duplicated row arrives carrying the decoration but none of its listeners.
	resetLinks( row );
	applyWidths( row );
	decorateLinks( row );
}

/**
 * Dress the postbox surfaces, and keep dressing rows added later.
 *
 * @param {Object} acf ACF's global input API, for the `append` action.
 * @return {Function} Disposer, for a caller that has one to give.
 */
export function enhanceBoxes( acf ) {
	const stops = [];
	// Links outside a repeater get the chip and nothing else; there is no row for
	// them to collapse into.
	document.querySelectorAll( BOX_SURFACES ).forEach( decorateLinks );
	document.querySelectorAll( RAIL ).forEach( ( panel ) => {
		stops.push( decorateRepeaters( panel, decorateRow ) );
	} );

	if ( typeof acf?.addAction !== 'function' ) return () => stops.forEach( ( stop ) => stop && stop() );

	/*
	 * A link ACF renders outside a repeater — there is no such field in More Info
	 * today, but a field group is free to add one. Rows inside a repeater are
	 * handled by `decorateRepeaters`, which watches its own table.
	 *
	 * `append` fires for block forms too — the bridge raises it itself — so the
	 * surface is checked rather than assumed; a block form has its own pipeline
	 * and does not want a second one.
	 */
	const onAppend = ( $el ) => {
		const node = $el?.[ 0 ] || $el;
		if ( ! node?.closest?.( BOX_SURFACES ) ) return;
		if ( node.closest?.( '.acf-repeater' ) ) return;
		resetLinks( node );
		decorateLinks( node );
	};

	acf.addAction( 'append', onAppend );
	stops.push( () => acf.removeAction?.( 'append', onAppend ) );

	/*
	 * The accordion work waits for `ready`, because until ACF has initialised the
	 * field there is no accordion to decorate: `.acf-label` is still a label,
	 * `.acf-input` is still an empty div, and the section's fields are still its
	 * siblings rather than its contents.
	 *
	 * That is also why the dep grouping runs here rather than above. It reads the
	 * fields inside a section, and it moves them -- so it has to come after ACF
	 * has moved them in, and after `decorateRepeaters` has decorated the two
	 * repeaters in their original place.
	 */
	const onReady = () => {
		document.querySelectorAll( RAIL ).forEach( ( panel ) => {
			stops.push( decorateDeps( panel, acf ) );
			stops.push( decorateAccordions( panel, acf ) );
		} );
	};
	/*
	 * Priority 5, and the number is load-bearing. Every ordinary field defers its
	 * own `initialize()` to `ready` at priority 10 — `acf.Model.prototype.priority`
	 * — which is where a repeater gets its jQuery UI sortable. Running at 5 puts
	 * the dep grouping's node moves before any of that is built, so there is
	 * nothing yet to tear down. At the default priority it would work today by
	 * registration order alone, and stop working the moment this bundle is
	 * deferred or enqueued somewhere else.
	 */
	acf.addAction( 'ready', onReady, 5 );
	stops.push( () => acf.removeAction?.( 'ready', onReady ) );

	return () => stops.forEach( ( stop ) => stop && stop() );
}
