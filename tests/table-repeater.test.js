import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeTableRepeaters } from '../src/ui/acf/table-repeater.js';
import { applyWidths } from '../src/ui/acf/widths.js';

/*
 * ACF's real `-table` output, reduced to the parts the transform touches. Taken
 * from the Billboard block's `links` repeater: labels hoisted into a <thead>,
 * one <td class="acf-field"> per sub-field, and no <td class="acf-fields">.
 *
 * Both sub-fields are authored at 50%, and the <th> is the only place that says
 * so: `acf_render_field_wrap()` skips `data-width` for a `td` wrapper, so the
 * cells below carry no width at all.
 */
const TABLE_REPEATER = `
<div class="acf-field acf-field-repeater" data-name="links" data-type="repeater" data-key="field_rep">
  <div class="acf-label"><label>Links</label></div>
  <div class="acf-input">
    <div class="acf-repeater -table" data-min="0" data-max="0">
      <input type="hidden" class="acf-repeater-hidden-input" name="acf[field_rep]" value="">
      <table class="acf-table">
        <thead>
          <tr>
            <th class="acf-row-handle"></th>
            <th class="acf-th" data-name="link_icon" data-type="select" data-key="field_icon" data-width="50" style="width: 50%;">
              <label>Link Icon <span class="acf-required">*</span></label>
              <p class="description">Pick one</p>
            </th>
            <th class="acf-th" data-name="link" data-type="link" data-key="field_link" data-width="50" style="width: 50%;">
              <label>Link <span class="acf-required">*</span></label>
            </th>
            <th class="acf-row-handle"></th>
          </tr>
        </thead>
        <tbody>
          <tr class="acf-row acf-clone" data-id="acfcloneindex">
            <td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
            <td class="acf-field acf-field-select is-required" data-name="link_icon" data-key="field_icon" data-required="1">
              <div class="acf-input"><select id="acf-field_rep-acfcloneindex-field_icon" name="acf[field_rep][acfcloneindex][field_icon]"><option value="web">Web Link</option></select></div>
            </td>
            <td class="acf-field acf-field-link is-required" data-name="link" data-key="field_link" data-required="1">
              <div class="acf-input"><div class="acf-link"></div></div>
            </td>
            <td class="acf-row-handle remove"><a class="acf-icon" data-event="remove-row"></a></td>
          </tr>
          <tr class="acf-row" data-id="row-0">
            <td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
            <td class="acf-field acf-field-select is-required" data-name="link_icon" data-key="field_icon" data-required="1">
              <div class="acf-input"><select id="acf-field_rep-row-0-field_icon" name="acf[field_rep][row-0][field_icon]"><option value="web">Web Link</option></select></div>
            </td>
            <td class="acf-field acf-field-link is-required" data-name="link" data-key="field_link" data-required="1">
              <div class="acf-input"><div class="acf-link"></div></div>
            </td>
            <td class="acf-row-handle remove"><a class="acf-icon" data-event="remove-row"></a></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`;

function build( markup = TABLE_REPEATER ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

test( 'gives every row the td.acf-fields cell the rest of Herd looks for', () => {
	const form = build();
	// decorateRepeater bails without this cell, which is the whole bug.
	assert.equal( form.querySelectorAll( 'td.acf-fields' ).length, 0 );
	normalizeTableRepeaters( form );

	const rows = form.querySelectorAll( 'tr.acf-row' );
	assert.equal( rows.length, 2 );
	for ( const row of rows ) {
		const cell = row.querySelector( ':scope > td.acf-fields' );
		assert.ok( cell, 'row has an acf-fields cell' );
		assert.equal( cell.querySelectorAll( ':scope > .acf-field' ).length, 2 );
		// It has to sit between the two handles, or the order and remove columns move.
		const kids = Array.from( row.children );
		assert.ok( kids[ 0 ].classList.contains( 'order' ) );
		assert.equal( kids[ 1 ], cell );
		assert.ok( kids[ 2 ].classList.contains( 'remove' ) );
	}
} );

test( 'normalises the clone row too, so rows added later match', () => {
	const form = build();
	normalizeTableRepeaters( form );
	const clone = form.querySelector( 'tr.acf-clone' );
	assert.ok( clone.querySelector( ':scope > td.acf-fields' ) );
} );

test( 'carries every attribute onto the replacement field', () => {
	const form = build();
	normalizeTableRepeaters( form );
	const field = form.querySelector( 'tr[data-id="row-0"] .acf-field-select' );
	assert.equal( field.tagName, 'DIV' );
	assert.equal( field.dataset.name, 'link_icon' );
	assert.equal( field.dataset.key, 'field_icon' );
	assert.equal( field.dataset.required, '1' );
	assert.ok( field.classList.contains( 'is-required' ) );
	assert.ok( field.classList.contains( 'acf-field' ) );
} );

test( 'carries the authored width off the thead, which is the only place ACF put it', () => {
	const form = build();
	// The cell itself never had one: `acf_render_field_wrap()` skips `data-width`
	// for a `td`, and this is the whole reason a 50/50 row came out stacked.
	assert.equal( form.querySelector( 'tr[data-id="row-0"] td.acf-field-select' ).getAttribute( 'data-width' ), null );

	normalizeTableRepeaters( form );

	for ( const id of [ 'row-0', 'acfcloneindex' ] ) {
		const row = form.querySelector( `tr[data-id="${ id }"]` );
		assert.equal( row.querySelector( '.acf-field-select' ).getAttribute( 'data-width' ), '50' );
		assert.equal( row.querySelector( '.acf-field-link' ).getAttribute( 'data-width' ), '50' );
	}
} );

test( 'and turns it into the span the stylesheet reads', () => {
	const form = build();
	normalizeTableRepeaters( form );
	// The order layoutBlockForm uses: normalise, then publish.
	applyWidths( form );
	const row = form.querySelector( 'tr[data-id="row-0"]' );
	assert.equal( row.querySelector( '.acf-field-select' ).getAttribute( 'data-herd-width' ), '50' );
	assert.equal( row.querySelector( '.acf-field-link' ).getAttribute( 'data-herd-width' ), '50' );
} );

test( 'invents no width for a sub-field the field group never sized', () => {
	const form = build( TABLE_REPEATER.replace( / data-width="50" style="width: 50%;"/g, '' ) );
	normalizeTableRepeaters( form );
	const field = form.querySelector( 'tr[data-id="row-0"] .acf-field-select' );
	assert.equal( field.getAttribute( 'data-width' ), null );
	applyWidths( form );
	// No attribute at all is how a field asks for the whole row.
	assert.equal( field.getAttribute( 'data-herd-width' ), null );
} );

test( 'moves inputs rather than recreating them, so nothing about saving changes', () => {
	const form = build();
	const before = Array.from( form.querySelectorAll( '[name]' ) ).map( ( n ) => n.getAttribute( 'name' ) ).sort();
	normalizeTableRepeaters( form );
	const after = Array.from( form.querySelectorAll( '[name]' ) ).map( ( n ) => n.getAttribute( 'name' ) ).sort();
	assert.deepEqual( after, before );
} );

test( 'rebuilds the labels that table layout hoisted into the thead', () => {
	const form = build();
	normalizeTableRepeaters( form );
	const field = form.querySelector( 'tr[data-id="row-0"] .acf-field-select' );
	const label = field.querySelector( ':scope > .acf-label > label' );
	assert.ok( label );
	assert.match( label.textContent, /Link Icon/ );
	// The required marker is an element and has to survive as one.
	assert.ok( label.querySelector( '.acf-required' ) );
	// ACF's rename rewrites `for` on clone, so pointing at the control is safe.
	assert.equal( label.htmlFor, 'acf-field_rep-row-0-field_icon' );
	assert.match( field.querySelector( '.acf-label .description' ).textContent, /Pick one/ );
	// The label belongs above the input, as block layout would have emitted it.
	assert.ok( field.firstElementChild.classList.contains( 'acf-label' ) );
} );

test( 'drops the thead and switches the layout modifier', () => {
	const form = build();
	normalizeTableRepeaters( form );
	assert.equal( form.querySelector( 'thead' ), null );
	const repeater = form.querySelector( '.acf-repeater' );
	assert.ok( repeater.classList.contains( '-block' ) );
	assert.ok( ! repeater.classList.contains( '-table' ) );
} );

test( 'leaves a repeater that is already block layout alone', () => {
	const block = TABLE_REPEATER.replace( 'acf-repeater -table', 'acf-repeater -block' );
	const form = build( block );
	const before = form.innerHTML;
	normalizeTableRepeaters( form );
	assert.equal( form.innerHTML, before );
} );

test( 'survives a repeater with no thead and an empty form', () => {
	const noHead = TABLE_REPEATER.replace( /<thead>[\s\S]*?<\/thead>/, '' );
	const form = build( noHead );
	assert.doesNotThrow( () => normalizeTableRepeaters( form ) );
	// Without headings the fields still get their cell; they just carry no label.
	const field = form.querySelector( 'tr[data-id="row-0"] .acf-field-select' );
	assert.ok( field.closest( 'td.acf-fields' ) );
	assert.equal( field.querySelector( '.acf-label' ), null );
	assert.doesNotThrow( () => normalizeTableRepeaters( null ) );
} );
