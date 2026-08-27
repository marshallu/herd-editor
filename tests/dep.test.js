import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateDeps, resetDeps } from '../src/ui/acf/dep.js';

/*
 * More Info's real shape, one accordion section deep. ACF prints a field's
 * conditional logic as the `data-conditions` JSON on the wrapper and hides a
 * gated field with an inline `display: none`; both are reproduced exactly,
 * because both are what the decorator reads.
 */
const on = ( key ) => JSON.stringify( [ [ { field: key, operator: '==', value: '1' } ] ] );
const off = ( key ) => JSON.stringify( [ [ { field: key, operator: '!=', value: '1' } ] ] );
const either = ( a, b ) =>
	JSON.stringify( [ [ { field: a, operator: '==', value: '1' } ], [ { field: b, operator: '==', value: '1' } ] ] );

const field = ( { key, name, conditions = null, hidden = false, type = 'true_false' } ) => `
<div class="acf-field acf-field-${ type.replace( /_/g, '-' ) }" data-key="${ key }" data-name="${ name }" data-type="${ type }"${
	conditions ? ` data-conditions='${ conditions }'` : ''
}${ hidden ? ' style="display: none;"' : '' }>
  <div class="acf-label"><label>${ name }</label></div>
  <div class="acf-input"><input type="checkbox" name="acf[${ key }]"></div>
</div>`;

const section = ( fields ) => `
<div class="acf-field acf-field-accordion acf-accordion" data-type="accordion">
  <div class="acf-label acf-accordion-title" tabindex="0" role="button">Navigation</div>
  <div class="acf-input acf-accordion-content" role="region"><div class="acf-fields">${ fields }</div></div>
</div>`;

const mount = ( fields ) => {
	const dom = new JSDOM( `
<div class="wrap herd-editor-screen"><form id="post">
  <div class="herd-rail__panel" data-panel="more">
    <div class="postbox"><div class="inside acf-fields -top">${ section( fields ) }</div></div>
  </div>
</form></div>` );
	global.document = dom.window.document;
	return { dom, panel: dom.window.document.querySelector( '.herd-rail__panel' ) };
};

/* Navigation as authored: one toggle, then the three fields it reveals. */
const NAV = 'field_663cdd6a65bb2';
const TNS = 'field_663cddb845ef0';

const navigation = ( { hidden = false } = {} ) =>
	field( { key: NAV, name: 'display_custom_primary_navigation' } ) +
	field( { key: 'f1', name: 'display_below_page_title', conditions: on( NAV ), hidden } ) +
	field( { key: 'f2', name: 'custom_nav_items', conditions: on( NAV ), hidden, type: 'repeater' } ) +
	field( { key: TNS, name: 'display_take_the_next_step', conditions: on( NAV ), hidden } );

test( 'a field its toggle reveals is grouped under it', () => {
	const { panel } = mount( navigation() );
	decorateDeps( panel );

	const dep = panel.querySelector( '.herd-dep' );
	assert.ok( dep, 'the revealed fields get a container' );
	assert.equal( dep.dataset.herdDep, NAV, 'the container names the toggle it belongs to' );
} );

test( 'a run of revealed fields is one group, not three', () => {
	const { panel } = mount( navigation() );
	decorateDeps( panel );

	assert.equal( panel.querySelectorAll( '.herd-dep' ).length, 1 );
	assert.equal( panel.querySelectorAll( '.herd-dep > .acf-field' ).length, 3 );
} );

test( 'the toggle itself stays outside the group it opens', () => {
	const { panel } = mount( navigation() );
	decorateDeps( panel );

	const toggle = panel.querySelector( `[data-key="${ NAV }"]` );
	assert.equal( toggle.closest( '.herd-dep' ), null );
} );

test( 'a group inside a group nests, because Alternate Apply Now URL is two toggles deep', () => {
	const { panel } = mount(
		navigation() + field( { key: 'url', name: 'alternate_apply_now_url', conditions: on( TNS ), type: 'url' } )
	);
	decorateDeps( panel );

	const inner = panel.querySelector( '.herd-dep .herd-dep' );
	assert.ok( inner, 'the second reveal nests inside the first' );
	assert.equal( inner.dataset.herdDep, TNS );
	assert.equal( inner.querySelector( '[data-name="alternate_apply_now_url"]' ) !== null, true );
} );

test( 'a reveal that runs on a toggle being off is grouped the same way', () => {
	const { panel } = mount(
		field( { key: 'hri', name: 'hide_request_info' } ) +
			field( { key: 'ril', name: 'request_info_link', conditions: off( 'hri' ), type: 'text' } )
	);
	decorateDeps( panel );

	const dep = panel.querySelector( '.herd-dep' );
	assert.ok( dep, 'the operator is not what groups them; the reveal is' );
	assert.equal( dep.dataset.herdDep, 'hri' );
} );

test( 'a field two different toggles reveal is left ungrouped', () => {
	const { panel } = mount(
		field( { key: 'a', name: 'a' } ) + field( { key: 'b', name: 'b', conditions: either( 'a', 'z' ) } )
	);
	decorateDeps( panel );

	assert.equal( panel.querySelectorAll( '.herd-dep' ).length, 0 );
} );

test( 'two toggles revealing two runs get a group each', () => {
	const { panel } = mount(
		field( { key: 'a', name: 'a' } ) +
			field( { key: 'a1', name: 'a1', conditions: on( 'a' ) } ) +
			field( { key: 'b', name: 'b' } ) +
			field( { key: 'b1', name: 'b1', conditions: on( 'b' ) } )
	);
	decorateDeps( panel );

	const deps = panel.querySelectorAll( '.herd-dep' );
	assert.equal( deps.length, 2 );
	assert.deepEqual( Array.from( deps, ( d ) => d.dataset.herdDep ), [ 'a', 'b' ] );
} );

test( 'a group with nothing visible in it is not on screen', () => {
	const { panel } = mount( navigation( { hidden: true } ) );
	decorateDeps( panel );

	assert.equal( panel.querySelector( '.herd-dep' ).classList.contains( 'is-empty' ), true );
} );

test( 'the group comes back when its toggle reveals the fields again', () => {
	const { panel, dom } = mount( navigation( { hidden: true } ) );
	decorateDeps( panel );

	panel.querySelectorAll( '.herd-dep > .acf-field' ).forEach( ( f ) => f.removeAttribute( 'style' ) );
	panel.dispatchEvent( new dom.window.Event( 'change', { bubbles: true } ) );

	assert.equal( panel.querySelector( '.herd-dep' ).classList.contains( 'is-empty' ), false );
} );

test( 'a repeater keeps its rows when it is grouped', () => {
	const { panel } = mount(
		field( { key: 'a', name: 'a' } ) +
			`<div class="acf-field acf-field-repeater" data-key="r" data-name="custom_nav_items" data-type="repeater" data-conditions='${ on(
				'a'
			) }'><div class="acf-input"><div class="acf-repeater -block"><table><tbody>
			  <tr class="acf-row" data-id="row-0"><td class="acf-fields">kept</td></tr>
			  <tr class="acf-row" data-id="row-1"><td class="acf-fields">kept</td></tr>
			</tbody></table></div></div></div>`
	);
	const repeater = panel.querySelector( '.acf-field-repeater' );
	const body = repeater.querySelector( 'tbody' );

	decorateDeps( panel );

	assert.equal( repeater.closest( '.herd-dep' ) !== null, true, 'it is grouped' );
	assert.equal( repeater.querySelectorAll( 'tr.acf-row' ).length, 2, 'and it still has both rows' );
	assert.equal(
		repeater.querySelector( 'tbody' ),
		body,
		'the same tbody node, so the row observer and jQuery UI survive the move'
	);
} );

test( 'grouping twice leaves one group', () => {
	const { panel } = mount( navigation() );
	decorateDeps( panel );
	decorateDeps( panel );

	assert.equal( panel.querySelectorAll( '.herd-dep' ).length, 1 );
} );

test( "a section inside ACF's clone row is left alone", () => {
	const dom = new JSDOM( `
<div class="wrap herd-editor-screen"><form id="post">
  <div class="herd-rail__panel" data-panel="more">
    <div class="acf-clone">${ section( navigation() ) }</div>
  </div>
</form></div>` );
	global.document = dom.window.document;
	const panel = dom.window.document.querySelector( '.herd-rail__panel' );

	decorateDeps( panel );
	assert.equal( panel.querySelectorAll( '.herd-dep' ).length, 0 );
} );

/*
 * Order is asserted over the field keys rather than over innerHTML. Wrapping
 * moves the `.acf-field` elements and leaves the whitespace between them where
 * it was, so the markup round-trips with its newlines shuffled while every field
 * is exactly where it started -- and it is the fields that ACF serializes.
 */
const keysIn = ( panel ) =>
	Array.from( panel.querySelectorAll( '.acf-field[data-key]' ), ( f ) => f.dataset.key );

test( 'resetting unwraps every group, nested ones included', () => {
	const { panel } = mount(
		navigation() + field( { key: 'url', name: 'alternate_apply_now_url', conditions: on( TNS ), type: 'url' } )
	);
	const before = keysIn( panel );

	decorateDeps( panel );
	resetDeps( panel );

	assert.equal( panel.querySelectorAll( '.herd-dep' ).length, 0 );
	assert.deepEqual( keysIn( panel ), before, 'and the fields are back in their authored order' );
	assert.equal(
		panel.querySelectorAll( '.acf-accordion-content > .acf-fields > .acf-field' ).length,
		before.length,
		'back in the field flow itself, not left one level down'
	);
} );

test( 'grouping does not reorder the fields it moves', () => {
	const { panel } = mount(
		navigation() + field( { key: 'url', name: 'alternate_apply_now_url', conditions: on( TNS ), type: 'url' } )
	);
	const before = keysIn( panel );
	decorateDeps( panel );
	assert.deepEqual( keysIn( panel ), before, 'document order is what ACF and the tab order both read' );
} );

test( 'a group holding nothing but an emptied group is empty too', () => {
	const { panel } = mount(
		field( { key: 'a', name: 'a' } ) +
			field( { key: 'b', name: 'b', conditions: on( 'a' ) } ) +
			field( { key: 'c', name: 'c', conditions: on( 'b' ), hidden: true } )
	);
	decorateDeps( panel );

	// `b` is on screen, so the outer group is live and the inner one is not.
	const outer = panel.querySelector( '.herd-dep' );
	const inner = panel.querySelector( '.herd-dep .herd-dep' );
	assert.equal( inner.classList.contains( 'is-empty' ), true );
	assert.equal( outer.classList.contains( 'is-empty' ), false );

	// Now hide `b` as well: the outer group has nothing left to show either.
	panel.querySelector( '[data-key="b"]' ).classList.add( 'acf-hidden' );
	panel.dispatchEvent( new panel.ownerDocument.defaultView.Event( 'change', { bubbles: true } ) );

	assert.equal( outer.classList.contains( 'is-empty' ), true, 'evaluated innermost first' );
} );
