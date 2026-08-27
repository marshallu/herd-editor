/**
 * Herd's own layout for an ACF block form.
 *
 * ACF renders block fields for the Gutenberg sidebar: one narrow column, left
 * label columns on nested groups, and help text wherever the field group happens
 * to put it. Herd imposes its own arrangement instead.
 *
 * Fields keep their authored order. Field groups put a field that reveals others
 * directly above what it reveals, and that adjacency is the most useful thing on
 * the page — hoisting every select to a shared row at the top would strand
 * `hero_cta_type` far from the CTA groups it controls.
 *
 * Role decides *placement*, not width. Width comes from the field group and from
 * nowhere else (src/ui/acf/widths.js); a field that authors none takes the whole
 * row. The roles are:
 *
 *   1. controls - selects, numbers, short text: stay in the flow
 *   2. content  - media, repeaters, editors: stay in the flow
 *   3. options  - true/false toggles that gate nothing: a switch list at the end
 *
 * That list is the single thing that moves, and it moves real DOM nodes rather
 * than using CSS `order`, so keyboard tab order matches what is on screen. It
 * must therefore run BEFORE ACF initialises the form: moving an
 * already-initialised node would blank a TinyMCE iframe.
 */

import { gatingKeys, isStructural } from './conditions.js';
import { isReachable } from './values.js';
import { decorateControls } from './controls.js';
import { decorateEditors } from './editor.js';
import { decorateIcons } from './icons.js';
import { decorateLinks } from './link.js';
import { decorateGroups } from './group.js';
import { decorateFiles, decorateMedia } from './media.js';
import { normalizeTableRepeaters } from './table-repeater.js';
import { applyWidths } from './widths.js';
import { decorateFlexible } from './flexible.js';
import { decorateRepeaters } from './repeater.js';
import { profileFor } from './profiles.js';
import { watchSpacers } from './rows.js';

/** Field types compact enough that a field group can pair them on a row. */
const CONTROL_TYPES = [
	'select',
	'button-group',
	'number',
	'range',
	'date-picker',
	'date-time-picker',
	'time-picker',
	'color-picker',
	'page-link',
	'text',
	'url',
	'email',
	'link',
];

/** ACF drives these by showing and hiding the fields that follow them. */
const SEQUENTIAL_TYPES = [ 'acf-field-tab', 'acf-field-accordion' ];

/**
 * How a field should be sized and where it belongs.
 *
 * @param {HTMLElement}  field  The `.acf-field` wrapper.
 * @param {Set<string>}  gating Field keys that other fields depend on.
 * @return {'controls'|'content'|'options'} The field's role.
 */
export function roleOf( field, gating ) {
	if ( field.classList.contains( 'acf-field-true-false' ) ) {
		// A toggle that reveals other fields cannot live in the flat list at the
		// end — the reveal would happen somewhere the eye isn't.
		return isStructural( field, gating ) ? 'content' : 'options';
	}
	return CONTROL_TYPES.some( ( type ) => field.classList.contains( `acf-field-${ type }` ) ) ? 'controls' : 'content';
}

/**
 * Keep a Display options header counting.
 *
 * Marked on the element rather than in an attribute: ACF builds a new
 * flexible-content layout by cloning a template, and `cloneNode` copies every
 * attribute but no property and no listener. A property is the one flag that
 * tells a freshly cloned section from the one it was cloned from.
 *
 * @param {HTMLElement} container The field flow the section belongs to.
 * @param {HTMLElement} section   The `.herd-fieldopts` element.
 */
function bindOptionCount( container, section ) {
	if ( section.herdBound ) return;
	section.herdBound = true;

	const count = section.querySelector( '.herd-fieldopts__count' );
	const list = section.querySelector( '.herd-fieldopts__list' );
	if ( ! count || ! list ) return;
	const options = Array.from( list.children ).filter( ( node ) => node.classList?.contains( 'acf-field' ) );

	const update = () => {
		/*
		 * A toggle conditional logic has taken away is not on offer, and belongs in
		 * neither half of the count.
		 *
		 * This asked only about inline `display`, which ACF never writes: `acf.hide()`
		 * adds the `acf-hidden` class and acf-global.css carries the `display: none`.
		 * So nothing was ever excluded and the denominator counted settings that were
		 * not on the table. `isReachable` is the predicate the rest of the editor
		 * already asks — src/ui/acf/values.js — and it tests both.
		 */
		const shown = options.filter( isReachable );
		const on = shown.filter( ( field ) => field.querySelector( 'input[type="checkbox"]' )?.checked ).length;
		count.textContent = `${ on } of ${ shown.length } on`;
	};
	update();
	// The listener dies with the container when the bridge clears the host.
	container.addEventListener( 'change', update );
}

function optionsSection() {
	const section = document.createElement( 'div' );
	section.className = 'herd-fieldopts';

	const head = document.createElement( 'div' );
	head.className = 'herd-fieldopts__head';
	const title = document.createElement( 'span' );
	title.className = 'herd-fieldopts__title';
	title.textContent = 'Display options';
	const count = document.createElement( 'span' );
	count.className = 'herd-fieldopts__count';
	head.append( title, count );

	const list = document.createElement( 'div' );
	list.className = 'herd-fieldopts__list';

	section.append( head, list );
	return { section, list };
}

/**
 * Give one container Herd's field layout.
 *
 * `container` is anything whose `.acf-field` children are a field flow: the
 * block form itself, or a flexible-content layout body, which is the same shape
 * one level down and is its own grid.
 *
 * Runs before ACF initialises the form, because it moves real DOM nodes.
 *
 * @param {HTMLElement} container An `.acf-fields`-shaped element.
 */
export function layoutFields( container ) {
	/*
	 * Already laid out — and, because this is reached again for every layout ACF
	 * clones out of its templates, laid out by a pass whose listener the clone did
	 * not inherit. Rebind the counter and leave the DOM alone.
	 */
	const done = Array.from( container.children ).find( ( node ) => node.classList?.contains( 'herd-fieldopts' ) );
	if ( done ) {
		bindOptionCount( container, done );
		return;
	}

	const fields = Array.from( container.children ).filter( ( node ) => node.classList?.contains( 'acf-field' ) );
	if ( ! fields.length ) return;

	// Tabs and accordions group the fields that follow them; leave those alone.
	if ( fields.some( ( field ) => SEQUENTIAL_TYPES.some( ( type ) => field.classList.contains( type ) ) ) ) return;

	const gating = gatingKeys( container );
	const options = [];

	container.classList.add( 'herd-fields' );
	fields.forEach( ( field ) => {
		const role = roleOf( field, gating );
		// A marker, not a width — the stylesheet sizes every field the same until
		// the field group authors one. It says in the DOM what this pass decided.
		field.classList.add( `herd-field--${ role }` );
		// A structural toggle is a section heading, not a setting; it says so.
		if ( role === 'content' && field.classList.contains( 'acf-field-true-false' ) ) {
			field.classList.add( 'herd-switchrow' );
		}
		if ( role === 'options' ) options.push( field );
	} );

	if ( ! options.length ) return;

	// The switches get their own container so they can pack into columns rather
	// than follow the field flow's gap. ACF finds fields by descendant search, so
	// the extra nesting is invisible to serialization and conditional logic.
	const { section, list } = optionsSection();
	container.appendChild( section );
	options.forEach( ( field ) => list.appendChild( field ) );
	bindOptionCount( container, section );
}

/**
 * Rearrange a freshly fetched ACF block form.
 *
 * @param {HTMLElement} form The `.acf-block-fields` element, before ACF initialises it.
 */
export function layoutBlockForm( form ) {
	if ( ! form || ! form.classList?.contains( 'acf-block-fields' ) ) return;

	/*
	 * Before the layout pass: a table-layout repeater needs the same shape
	 * whether or not this form qualifies for Herd's field layout. A form
	 * containing a tab bails out inside `layoutFields`, and its repeaters would
	 * otherwise keep the DOM the rest of Herd cannot read.
	 */
	normalizeTableRepeaters( form );

	/*
	 * Also first, and for the same reason: an authored width is the field group's
	 * instruction, and it holds inside a group body and a repeater row whether or
	 * not the form as a whole qualifies for the role layout below. On a form that
	 * bails out, the attribute is written and no container rule matches it, which
	 * is exactly right — ACF's own layout is running there and it honours its own
	 * inline width already.
	 */
	applyWidths( form );

	layoutFields( form );

	/*
	 * A flexible-content layout body is a field flow of its own, and until now it
	 * was the one container Herd left to ACF: `layoutBlockForm` read
	 * `form.children`, and a module's fields are three levels below that. So the
	 * Page with Sidebar block — 25 layouts across two flexible fields — laid its
	 * modules out in ACF's single narrow column while everything around them was
	 * on Herd's grid.
	 *
	 * `.clones` is included deliberately. ACF builds a new module by cloning the
	 * template it keeps there, so laying the templates out now is what makes a
	 * module added later arrive already laid out, with no second pass and no
	 * teardown of a container ACF is about to copy.
	 */
	form.querySelectorAll( '.acf-flexible-content .layout > .acf-fields' ).forEach( layoutFields );
}

/**
 * Dress a form ACF has finished initialising.
 *
 * Everything here reads rendered values — a link's resolved title, an image's
 * preview, the rows a repeater actually has — so none of it can run in
 * `layoutBlockForm`, which sees the form while it is still inert.
 *
 * Each decorator is independent, takes any root element, and skips work it has
 * already done, so a row that arrives later is decorated on its own rather than
 * by re-scanning the form. Watching the whole form would mean re-running every
 * decorator on each keystroke, since the row summaries rewrite themselves as you
 * type.
 *
 * @param {HTMLElement} form      The initialised `.acf-block-fields` element.
 * @param {string}      blockName Registered block name, for profile lookup.
 * @return {Function} Disposer for the observers this attached.
 */
export function enhanceBlockForm( form, blockName ) {
	if ( ! form ) return () => {};
	const profile = profileFor( blockName );

	const decorate = ( root ) => {
		// A repeater row ACF has just added arrives after `layoutBlockForm` has
		// run, so it publishes its own widths.
		applyWidths( root );
		decorateControls( root, profile );
		decorateIcons( root );
		decorateMedia( root );
		decorateFiles( root );
		decorateLinks( root );
		decorateEditors( root, profile );
		// Last within a root: a group's summary and badge read the values the
		// decorators above have just settled.
		decorateGroups( root );
	};

	decorate( form );
	// Last: row summaries read the fields the decorators above have just settled.
	const stops = [ decorateRepeaters( form, decorate ) ];

	/*
	 * A module ACF has just added arrives with its own repeaters, and the pass
	 * above has already been and gone. So a new layout is decorated as a small
	 * form of its own rather than as a row: fields first, then the repeaters
	 * inside it. Every decorator skips what it has already done, so the layouts
	 * that were there at mount cost a scan and nothing else.
	 */
	const decorateLayout = ( layout ) => {
		decorate( layout );
		// Its field flow was laid out on the template it was cloned from, which is
		// the DOM but not the listener that keeps its Display options counting.
		layout.querySelectorAll( ':scope > .acf-fields' ).forEach( layoutFields );
		stops.push( decorateRepeaters( layout, decorate ) );
	};

	/*
	 * After the repeaters: a flexible-content layout can hold one, and the line a
	 * layout row carries is written from what its fields have settled to —
	 * including a repeater's own count.
	 */
	stops.push( decorateFlexible( form, decorateLayout ) );
	/*
	 * After the decorators, because a spacer's row is worked out from what is on
	 * screen and `normalizeTableRepeaters` has by then given every repeater row
	 * the shape the packing assumes.
	 */
	const stopSpacers = watchSpacers( form );

	return () => {
		stopSpacers();
		stops.forEach( ( stop ) => stop && stop() );
	};
}
