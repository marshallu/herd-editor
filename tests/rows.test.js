import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { COLUMNS, isSeparator, ORPHAN_CLASS, pack, spanOf, SPANS, syncRoot, syncSpacers } from '../src/ui/acf/rows.js';

/**
 * One `.acf-field` wrapper.
 *
 * `type` becomes both `data-type` and the class, the way ACF emits it; `width`
 * becomes `data-herd-width`, the way `applyWidths()` does.
 */
const field = ( { type = 'text', width = null, role = null, hidden = false, acfHidden = false } = {} ) => {
	const classes = [ 'acf-field', `acf-field-${ type.replace( /_/g, '-' ) }` ];
	if ( role ) classes.push( `herd-field--${ role }` );
	if ( acfHidden ) classes.push( 'acf-hidden' );
	return `<div class="${ classes.join( ' ' ) }" data-type="${ type }"${ width ? ` data-herd-width="${ width }"` : '' }${
		hidden ? ' style="display: none"' : ''
	}></div>`;
};

const container = ( html ) =>
	new JSDOM( `<div class="acf-block-fields herd-fields">${ html }</div>` ).window.document.querySelector( '.herd-fields' );

const kids = ( root ) => Array.from( root.children );
const orphaned = ( root ) => kids( root ).filter( ( n ) => n.classList.contains( ORPHAN_CLASS ) ).length;

/* ---------- spans agree with the stylesheet ---------- */

test( 'the span map matches src/css/_widths.scss', () => {
	// The two are separate declarations of one fact, so they are checked against
	// each other rather than trusted to stay in step by comment.
	const scss = readFileSync( new URL( '../src/css/_widths.scss', import.meta.url ), 'utf8' );
	const block = scss.slice( scss.indexOf( '$spans: (' ), scss.indexOf( ');', scss.indexOf( '$spans: (' ) ) );
	const fromScss = {};
	for ( const [ , width, span ] of block.matchAll( /"(\d+)":\s*(\d+)/g ) ) fromScss[ width ] = Number( span );

	assert.deepEqual( fromScss, SPANS );
	// And every preset divides the grid, which is the whole reason it is twelve.
	for ( const [ width, span ] of Object.entries( SPANS ) ) {
		assert.equal( span, Math.round( ( Number( width ) / 100 ) * COLUMNS ), `${ width }%` );
	}
} );

test( 'reads the span from the authored width', () => {
	const root = container( field( { width: 33, role: 'controls' } ) );
	assert.equal( spanOf( root.firstElementChild ), 4 );
} );

test( 'gives a field with no authored width the whole row', () => {
	// The role is a placement marker and nothing more: a select and an editor are
	// the same width until the field group says otherwise.
	assert.equal( spanOf( container( field( { role: 'controls' } ) ).firstElementChild ), 12 );
	assert.equal( spanOf( container( field( { role: 'content' } ) ).firstElementChild ), 12 );
	assert.equal( spanOf( container( field() ).firstElementChild ), 12 );
} );

test( 'sizes a toggle in a repeater row the same as anywhere else', () => {
	const cell = ( html ) =>
		new JSDOM( `<table><tr class="acf-row is-open"><td class="acf-fields">${ html }</td></tr></table>` ).window
			.document;

	// A repeater row used to pair two toggles per row. It no longer infers that;
	// a row that wants the pair authors 50% on both.
	assert.equal( spanOf( cell( field( { type: 'true_false' } ) ).querySelector( '.acf-field' ) ), 12 );
	assert.equal( spanOf( cell( field( { type: 'true_false', width: 50 } ) ).querySelector( '.acf-field' ) ), 6 );
	assert.equal( spanOf( container( field( { type: 'true_false' } ) ).firstElementChild ), 12 );
} );

/* ---------- packing matches CSS grid auto-placement ---------- */

const spans = ( rows ) => rows.map( ( row ) => row.map( spanOf ) );

test( 'fits three 33% fields on one row', () => {
	// The case the twelve-column grid exists for: 4 + 4 + 4 is exactly 12.
	const root = container( field( { width: 33 } ) + field( { width: 33 } ) + field( { width: 33 } ) );
	assert.deepEqual( spans( pack( kids( root ) ) ), [ [ 4, 4, 4 ] ] );
} );

test( 'wraps two 66% fields and leaves the dead space', () => {
	// 8 + 8 does not fit, so the second wraps and row one keeps four tracks of
	// nothing. That is the behaviour the Spacer exists to take charge of.
	const root = container( field( { width: 66 } ) + field( { width: 66 } ) );
	assert.deepEqual( spans( pack( kids( root ) ) ), [ [ 8 ], [ 8 ] ] );
} );

test( 'never backfills a gap', () => {
	// `grid-auto-flow` is `row`, not `dense`: the 25% field does NOT slide up into
	// the four tracks the 66% field left, because that would put it on screen
	// before a field the tab order visits after it.
	const root = container( field( { width: 66 } ) + field( { width: 66 } ) + field( { width: 25 } ) );
	assert.deepEqual( spans( pack( kids( root ) ) ), [ [ 8 ], [ 8, 3 ] ] );
} );

test( 'a full-width field always starts and ends a row', () => {
	const root = container( field( { width: 50 } ) + field( { role: 'content' } ) + field( { width: 50 } ) );
	assert.deepEqual( spans( pack( kids( root ) ) ), [ [ 6 ], [ 12 ], [ 6 ] ] );
} );

test( 'packs a form that authored no widths one field per row', () => {
	// What every field group looks like before somebody lays it out: three
	// compact controls, three rows.
	const root = container( field( { role: 'controls' } ).repeat( 3 ) );
	assert.deepEqual( spans( pack( kids( root ) ) ), [ [ 12 ], [ 12 ], [ 12 ] ] );
} );

test( 'packs nothing into no rows', () => {
	assert.deepEqual( pack( [] ), [] );
} );

/* ---------- the conditional-logic trap ---------- */

test( 'leaves a spacer alone while its row still holds a field', () => {
	const root = container( field( { width: 50 } ) + field( { type: 'spacer', width: 50 } ) );
	assert.equal( syncSpacers( root ), 0 );
	assert.equal( orphaned( root ), 0 );
} );

test( 'hides a spacer left alone in a row by conditional logic', () => {
	// The bug this feature would otherwise ship with: hide the select and the
	// spacer is a stripe of nothing where a row used to be.
	const root = container( field( { width: 50, hidden: true } ) + field( { type: 'spacer', width: 50 } ) + field( { role: 'content' } ) );
	assert.equal( syncSpacers( root ), 1 );
	assert.equal( kids( root )[ 1 ].classList.contains( ORPHAN_CLASS ), true );
} );

test( 'reads ACF\'s other way of hiding a field too', () => {
	const root = container( field( { width: 50, acfHidden: true } ) + field( { type: 'spacer', width: 50 } ) );
	assert.equal( syncSpacers( root ), 1 );
} );

test( 'brings the spacer back when the condition turns back on', () => {
	const root = container( field( { width: 50, hidden: true } ) + field( { type: 'spacer', width: 50 } ) );
	syncSpacers( root );
	assert.equal( orphaned( root ), 1 );

	kids( root )[ 0 ].style.display = '';
	syncSpacers( root );
	assert.equal( orphaned( root ), 0 );
} );

test( 'settles when hiding one spacer strands the next', () => {
	// Hiding a spacer takes it out of the grid, so the rows below re-pack and a
	// second spacer can be stranded by the first one going. One pass would leave
	// it behind.
	const root = container(
		field( { width: 50, hidden: true } ) +
		field( { type: 'spacer', width: 50 } ) +
		field( { width: 50, hidden: true } ) +
		field( { type: 'spacer', width: 50 } )
	);
	assert.equal( syncSpacers( root ), 2 );
} );

test( 'does not strand a spacer that is still doing its job', () => {
	// Row one loses its select, so the spacer joins the two 50% texts. It keeps
	// the second of them on its own line, which is what it was added to do.
	const root = container(
		field( { width: 50, hidden: true } ) +
		field( { type: 'spacer', width: 50 } ) +
		field( { width: 50 } ) +
		field( { width: 50 } )
	);
	assert.equal( syncSpacers( root ), 0 );
} );

test( 'a full-width spacer is a separator and is left alone', () => {
	// It ends the row before it and starts the row after it, so it is never
	// sharing a row and can never be stranded. The orphan rule would otherwise
	// see a row of one layout field and hide every separator on every form.
	const root = container( field( { width: 100 } ) + field( { type: 'spacer' } ) + field( { role: 'content' } ) );
	assert.equal( syncSpacers( root ), 0 );
	assert.equal( orphaned( root ), 0 );
} );

test( 'a spacer with no authored width is a separator too', () => {
	// Somebody who adds a Spacer and saves without touching Width has asked for a
	// row break. Rendering that as nothing at all is indistinguishable from a bug.
	const root = container( field( { type: 'spacer' } ) );
	assert.equal( isSeparator( root.firstElementChild ), true );
	assert.equal( syncSpacers( root ), 0 );
} );

test( 'a separator survives its neighbours being hidden', () => {
	const root = container( field( { width: 50, hidden: true } ) + field( { type: 'spacer' } ) + field( { width: 50, hidden: true } ) );
	assert.equal( syncSpacers( root ), 0 );
} );

test( 'a part-width spacer is not a separator', () => {
	const root = container( field( { type: 'spacer', width: 50 } ) );
	assert.equal( isSeparator( root.firstElementChild ), false );
} );

test( 'a row of nothing but layout fields keeps no spacers', () => {
	const root = container( field( { type: 'message', width: 50 } ) + field( { type: 'spacer', width: 50 } ) );
	assert.equal( syncSpacers( root ), 1 );
	// The message is content somebody wrote; only the spacer goes.
	assert.equal( kids( root )[ 0 ].classList.contains( ORPHAN_CLASS ), false );
} );

test( 'does nothing to a container with no spacers in it', () => {
	const root = container( field( { width: 50, hidden: true } ) + field( { width: 50 } ) );
	assert.equal( syncSpacers( root ), 0 );
} );

/* ---------- finding containers ---------- */

test( 'syncs a group body and a repeater row, not just the form', () => {
	const doc = new JSDOM( `<div class="acf-block-fields herd-fields">
		<div class="acf-field acf-field-group" data-type="group"><div class="acf-input"><div class="acf-fields">
			${ field( { width: 50, hidden: true } ) }${ field( { type: 'spacer', width: 50 } ) }
		</div></div></div>
		<div class="acf-field acf-field-repeater" data-type="repeater"><div class="acf-input"><div class="acf-repeater"><table><tbody>
			<tr class="acf-row is-open"><td class="acf-fields">
				${ field( { width: 50, hidden: true } ) }${ field( { type: 'spacer', width: 50 } ) }
			</td></tr>
		</tbody></table></div></div></div>
	</div>` ).window.document;
	assert.equal( syncRoot( doc.querySelector( '.herd-fields' ) ), 2 );
} );

test( 'never touches the clone row ACF keeps as a template', () => {
	const doc = new JSDOM( `<div class="acf-block-fields herd-fields"><table><tbody>
		<tr class="acf-clone"><td class="acf-fields">
			${ field( { width: 50, hidden: true } ) }${ field( { type: 'spacer', width: 50 } ) }
		</td></tr>
	</tbody></table></div>` ).window.document;
	assert.equal( syncRoot( doc.querySelector( '.herd-fields' ) ), 0 );
} );

test( 'survives a root that cannot be queried', () => {
	assert.equal( syncRoot( null ), 0 );
	assert.equal( syncRoot( {} ), 0 );
} );
