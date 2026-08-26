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
 * `hero_cta_type` far from the CTA groups it controls. Role decides *width*, so
 * neighbouring compact controls pair up on a row without anything moving:
 *
 *   1. controls - selects, numbers, short text: compact, share a row
 *   2. content  - media, repeaters, editors: full width
 *   3. options  - true/false toggles that gate nothing: a switch list at the end
 *
 * That list is the single exception, and it moves real DOM nodes rather than
 * using CSS `order`, so keyboard tab order matches what is on screen. It must
 * therefore run BEFORE ACF initialises the form: moving an already-initialised
 * node would blank a TinyMCE iframe.
 */

import { gatingKeys, isStructural } from './conditions.js';
import { decorateControls } from './controls.js';
import { decorateEditors } from './editor.js';
import { decorateIcons } from './icons.js';
import { decorateLinks } from './link.js';
import { decorateGroups } from './group.js';
import { decorateFiles, decorateMedia } from './media.js';
import { normalizeTableRepeaters } from './table-repeater.js';
import { applyWidths } from './widths.js';
import { decorateRepeaters } from './repeater.js';
import { profileFor } from './profiles.js';
import { watchSpacers } from './rows.js';

/** Field types compact enough to share a row. */
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
	return { section, list, count };
}

/**
 * Rearrange a freshly fetched ACF block form.
 *
 * @param {HTMLElement} form The `.acf-block-fields` element, before ACF initialises it.
 */
export function layoutBlockForm( form ) {
	if ( ! form || ! form.classList?.contains( 'acf-block-fields' ) ) return;

	/*
	 * Before every early return below: a table-layout repeater needs the same
	 * shape whether or not this form qualifies for Herd's field layout. A form
	 * containing a tab bails out a few lines down, and its repeaters would
	 * otherwise keep the DOM the rest of Herd cannot read.
	 */
	normalizeTableRepeaters( form );

	/*
	 * Also before the early returns, and for the same reason: an authored width
	 * is the field group's instruction, and it holds inside a group body and a
	 * repeater row whether or not the form as a whole qualifies for the role
	 * layout below. On a form that bails out, the attribute is written and no
	 * container rule matches it, which is exactly right — ACF's own layout is
	 * running there and it honours its own inline width already.
	 */
	applyWidths( form );

	const fields = Array.from( form.children ).filter( ( node ) => node.classList?.contains( 'acf-field' ) );
	if ( ! fields.length ) return;

	// Tabs and accordions group the fields that follow them; leave those alone.
	if ( fields.some( ( field ) => SEQUENTIAL_TYPES.some( ( type ) => field.classList.contains( type ) ) ) ) return;

	const gating = gatingKeys( form );
	const options = [];

	form.classList.add( 'herd-fields' );
	fields.forEach( ( field ) => {
		const role = roleOf( field, gating );
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
	const { section, list, count } = optionsSection();
	form.appendChild( section );
	options.forEach( ( field ) => list.appendChild( field ) );

	const update = () => {
		// Conditional logic hides fields inline; a hidden toggle is not on offer.
		const shown = options.filter( ( field ) => field.style.display !== 'none' );
		const on = shown.filter( ( field ) => field.querySelector( 'input[type="checkbox"]' )?.checked ).length;
		count.textContent = `${ on } of ${ shown.length } on`;
	};
	update();
	// The listener dies with the form when the bridge clears the host.
	form.addEventListener( 'change', update );
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
	const stopRepeaters = decorateRepeaters( form, decorate );
	/*
	 * After the decorators, because a spacer's row is worked out from what is on
	 * screen and `normalizeTableRepeaters` has by then given every repeater row
	 * the shape the packing assumes.
	 */
	const stopSpacers = watchSpacers( form );

	return () => {
		stopSpacers();
		if ( stopRepeaters ) stopRepeaters();
	};
}
