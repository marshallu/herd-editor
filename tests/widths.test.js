import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyWidths, snapWidth, WIDTH_PRESETS } from '../src/ui/acf/widths.js';

/** ACF's own wrapper markup, reduced to the attribute this module reads. */
const form = ( html ) =>
	new JSDOM( `<div class="acf-block-fields">${ html }</div>` ).window.document.querySelector( '.acf-block-fields' );

const field = ( width ) =>
	`<div class="acf-field acf-field-select"${ width === undefined ? '' : ` data-width="${ width }"` }></div>`;

const widths = ( root ) =>
	Array.from( root.querySelectorAll( '.acf-field' ) ).map( ( node ) => node.getAttribute( 'data-herd-width' ) );

test( 'keeps a width that is already a preset', () => {
	for ( const preset of WIDTH_PRESETS ) {
		assert.equal( snapWidth( String( preset ) ), preset, `${ preset }%` );
	}
} );

test( 'snaps the widths this site already holds', () => {
	// Every off-preset width across all 105 field groups, and where each lands.
	assert.equal( snapWidth( '30' ), 33 );
	assert.equal( snapWidth( '34' ), 33 );
	assert.equal( snapWidth( '47' ), 50 );
	assert.equal( snapWidth( '48' ), 50 );
	assert.equal( snapWidth( '49' ), 50 );
	assert.equal( snapWidth( '70' ), 66 );
} );

test( 'breaks a tie toward the wider preset', () => {
	// 29 is 4 from both 25 and 33. Too narrow truncates; too wide only wastes
	// space, so the tie goes to the wider one.
	assert.equal( snapWidth( '29' ), 33 );
	// 62.5 sits midway between 50 and 75; 66 is nearer than either, which is the
	// case that proves this is nearest-wins and not a range table.
	assert.equal( snapWidth( '62.5' ), 66 );
} );

test( 'reads anything unusable as full width', () => {
	for ( const value of [ '', null, undefined, '0', '-10', 'abc', '100', '150', {} ] ) {
		assert.equal( snapWidth( value ), 100, JSON.stringify( value ) );
	}
} );

test( 'publishes a snapped width for the stylesheet to read', () => {
	const root = form( field( 50 ) + field( 47 ) + field( 25 ) );
	applyWidths( root );
	assert.deepEqual( widths( root ), [ '50', '50', '25' ] );
} );

test( 'leaves an unsized field alone so its role still decides', () => {
	// Writing 100 here would promote every compact control to its own line, which
	// is the layout Herd has today for every field group that never set a width.
	const root = form( field() + field( 50 ) );
	applyWidths( root );
	assert.deepEqual( widths( root ), [ null, '50' ] );
} );

test( 'treats an authored 100% as no width rather than as a span', () => {
	const root = form( field( 100 ) );
	applyWidths( root );
	assert.deepEqual( widths( root ), [ null ] );
} );

test( 'clears a stale attribute when the authored width goes away', () => {
	// A duplicated repeater row arrives carrying whatever the source row had.
	const root = form( field( 50 ) );
	applyWidths( root );
	root.querySelector( '.acf-field' ).removeAttribute( 'data-width' );
	applyWidths( root );
	assert.deepEqual( widths( root ), [ null ] );
} );

test( 'reaches sub-fields at every depth', () => {
	// A group body and a repeater row are their own grids, and a width authored
	// on a sub-field is answered by the container that holds it.
	const root = form(
		`<div class="acf-field acf-field-group" data-width="100">
			<div class="acf-input"><div class="acf-fields">${ field( 33 ) + field( 66 ) }</div></div>
		</div>`
	);
	applyWidths( root );
	assert.deepEqual( widths( root ), [ null, '33', '66' ] );
} );

test( 'writes to the clone row every added row is copied from', () => {
	const root = form(
		`<div class="acf-field acf-field-repeater"><div class="acf-input"><div class="acf-repeater"><table><tbody>
			<tr class="acf-clone"><td class="acf-fields">${ field( 33 ) }</td></tr>
		</tbody></table></div></div></div>`
	);
	applyWidths( root );
	assert.deepEqual( widths( root ), [ null, '33' ] );
} );

test( 'applies to a root that is itself a field', () => {
	// `enhanceBlockForm` hands each newly added repeater row to the decorators,
	// and a row's fields are found from the row, not from the form.
	const root = new JSDOM( field( 25 ) ).window.document.querySelector( '.acf-field' );
	applyWidths( root );
	assert.equal( root.getAttribute( 'data-herd-width' ), '25' );
} );

test( 'is idempotent', () => {
	const root = form( field( 47 ) );
	applyWidths( root );
	applyWidths( root );
	assert.deepEqual( widths( root ), [ '50' ] );
	// The authored value is ACF's, and Herd never rewrites it.
	assert.equal( root.querySelector( '.acf-field' ).getAttribute( 'data-width' ), '47' );
} );

test( 'survives a root that cannot be queried', () => {
	assert.doesNotThrow( () => applyWidths( null ) );
	assert.doesNotThrow( () => applyWidths( {} ) );
} );
