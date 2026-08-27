import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { enhanceBoxes } from '../src/ui/acf/boxes.js';

/*
 * The shell src/rail.js leaves behind: postboxes on a rail panel, and the block
 * form host beside them. The More Info group's two repeaters are represented as
 * they are authored -- Custom Nav Items in `row` layout, Footer Calls to Action
 * in `table` layout -- because the whole point is that neither is `-block`.
 */
/* The other two sub-fields of Custom Nav Items: a flag and a choice. */
const navSettings = ( { on = false, icon = '' } = {} ) => `
<div class="acf-field acf-field-true-false" data-key="field_cta" data-name="primary_cta" data-type="true_false">
  <div class="acf-label"><label>Primary Call-to-Action</label></div>
  <div class="acf-input">
    <div class="acf-true-false">
      <input type="hidden" name="acf[field_cta]" value="0">
      <input type="checkbox" id="cta" name="acf[field_cta]" value="1"${ on ? ' checked' : '' }>
    </div>
  </div>
</div>
<div class="acf-field acf-field-select" data-key="field_icon" data-name="icon" data-type="select">
  <div class="acf-label"><label>Icon</label></div>
  <div class="acf-input">
    <select name="acf[field_icon]">
      <option value=""${ icon ? '' : ' selected' }>- Select -</option>
      <option value="info-circle"${ icon === 'info-circle' ? ' selected' : '' }>info-circle</option>
      <option value="location"${ icon === 'location' ? ' selected' : '' }>location</option>
    </select>
  </div>
</div>`;

const linkField = ( key = 'field_l' ) => `
<div class="acf-field acf-field-link" data-key="${ key }" data-name="link" data-type="link">
  <div class="acf-input">
    <div class="acf-link -value">
      <div class="acf-hidden">
        <a class="link-node" href="/admissions/apply/">Apply Now</a>
        <input type="hidden" class="input-title" name="acf[${ key }][title]" value="Apply Now">
        <input type="hidden" class="input-url" name="acf[${ key }][url]" value="/admissions/apply/">
      </div>
      <a href="#" class="button" data-name="add">Select Link</a>
      <div class="link-wrap">
        <span class="link-title">Apply Now</span>
        <a class="link-url" href="/admissions/apply/">/admissions/apply/</a>
        <a class="acf-icon -pencil -clear" data-name="edit" href="#"></a><a class="acf-icon -cancel -clear" data-name="remove" href="#"></a>
      </div>
    </div>
  </div>
</div>`;

const screen = ( nav = {} ) => `
<div class="wrap herd-editor-screen">
  <form id="post">
    <div class="herd-rail__panel" data-panel="more">
      <div class="postbox">
        <div class="acf-field acf-field-repeater" data-name="custom_nav_items">
          <div class="acf-input">
            <div class="acf-repeater -row">
              <table class="acf-table">
                <tbody>
                  <tr class="acf-row" data-id="row-0">
                    <td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
                    <td class="acf-fields -left">${ linkField( 'field_nav' ) }${ navSettings( nav ) }</td>
                    <td class="acf-row-handle remove">
                      <a href="#" data-event="add-row"></a><a href="#" data-event="duplicate-row"></a><a href="#" data-event="remove-row"></a>
                    </td>
                  </tr>
                  <tr class="acf-row acf-clone" data-id="acfcloneindex">
                    <td class="acf-row-handle order"></td>
                    <td class="acf-fields -left">${ linkField( 'field_nav' ) }${ navSettings() }</td>
                    <td class="acf-row-handle remove"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="acf-field acf-field-repeater" data-name="footer_cta">
          <div class="acf-input">
            <div class="acf-repeater -table">
              <table class="acf-table">
                <thead>
                  <tr>
                    <th class="acf-row-handle"></th>
                    <th class="acf-th" data-key="field_cta"><label>Link</label></th>
                    <th class="acf-row-handle"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="acf-row" data-id="row-0">
                    <td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
                    <td class="acf-field acf-field-link" data-key="field_cta" data-name="link" data-type="link">
                      <div class="acf-input">
                        <div class="acf-link -value">
                          <a href="#" class="button" data-name="add">Select Link</a>
                          <div class="link-wrap">
                            <span class="link-title">Visit Us</span>
                            <a class="link-url" href="#">#</a>
                            <a class="acf-icon -pencil -clear" data-name="edit" href="#"></a><a class="acf-icon -cancel -clear" data-name="remove" href="#"></a>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="acf-row-handle remove"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="herd-editor__field-host">
      <div class="herd-editor__form">
        <div class="acf-block-fields acf-fields">${ linkField( 'field_block' ) }</div>
      </div>
    </div>
  </form>
</div>`;

function build( nav ) {
	const dom = new JSDOM( screen( nav ) );
	global.document = dom.window.document;
	global.window = dom.window;
	// decorateRepeater watches its own table for the rows ACF adds and removes.
	global.MutationObserver = dom.window.MutationObserver;
	return dom.window.document;
}

/** The smallest stand-in for ACF's action bus that `append` needs. */
function fakeAcf() {
	const actions = {};
	return {
		actions,
		addAction: ( name, callback ) => {
			( actions[ name ] = actions[ name ] || [] ).push( callback );
		},
		removeAction: ( name, callback ) => {
			actions[ name ] = ( actions[ name ] || [] ).filter( ( fn ) => fn !== callback );
		},
		doAction: ( name, ...args ) => ( actions[ name ] || [] ).forEach( ( fn ) => fn( ...args ) ),
	};
}

test( 'a link in a rail postbox gets the chip', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	const chip = doc.querySelector( '.herd-rail__panel .acf-link' );
	assert.equal( chip.classList.contains( 'herd-link' ), true );
	assert.ok( chip.querySelector( '.herd-link__text .link-title' ) );
	// The URL is text here for the same reason it is in a block form.
	assert.equal( chip.querySelector( '.link-url' ).tagName, 'SPAN' );
	assert.equal( chip.querySelector( '[data-name="edit"]' ).classList.contains( 'herd-link__edit' ), true );
} );

test( 'the clone row is left alone, so rows added later decorate themselves', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	const clone = doc.querySelector( '.acf-clone .acf-link' );
	assert.equal( clone.classList.contains( 'herd-link' ), false );
} );

test( 'a table-layout repeater is normalised, so one shape reaches the CSS', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	const footer = doc.querySelector( '[data-name="footer_cta"] .acf-repeater' );
	assert.equal( footer.classList.contains( '-table' ), false );
	assert.equal( footer.classList.contains( '-block' ), true );
	assert.equal( footer.querySelector( 'thead' ), null );
	// The label the `<thead>` was holding is now on the field, where the rail's
	// stacked layout can find it.
	const cell = footer.querySelector( 'tr.acf-row > td.acf-fields' );
	assert.ok( cell );
	assert.equal( cell.querySelector( '.acf-field > .acf-label label' ).textContent, 'Link' );
} );

test( 'a rail repeater collapses to card rows, whatever its authored layout', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	doc.querySelectorAll( '.herd-rail__panel .acf-repeater' ).forEach( ( repeater ) => {
		assert.equal( repeater.classList.contains( 'herd-repeater' ), true );
		assert.ok( repeater.querySelector( ':scope > .herd-repeater__head' ), 'no header' );
	} );

	const row = doc.querySelector( '[data-name="custom_nav_items"] tr.acf-row:not(.acf-clone)' );
	assert.equal( row.classList.contains( 'herd-card' ), true );
	assert.equal( row.querySelector( '.herd-cardrow__name' ).textContent, 'Apply Now' );
} );

/*
 * The row says the two things a link is. Anything else on the row is a flag or a
 * choice, and reads as a badge rather than as another clause of a grey sentence.
 */
test( 'a link list reports the URL and badges its settings', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	const repeater = doc.querySelector( '[data-name="custom_nav_items"] .acf-repeater' );
	assert.equal( repeater.classList.contains( 'herd-linklist' ), true );

	const row = repeater.querySelector( 'tr.acf-row:not(.acf-clone)' );
	assert.equal( row.querySelector( '.herd-cardrow__summary' ).textContent, '/admissions/apply/' );

	const badges = Array.from( row.querySelectorAll( '.herd-badge' ) );
	// The flag is off, so it says nothing; the empty choice still does.
	assert.deepEqual( badges.map( ( b ) => b.textContent ), [ 'No icon' ] );
	assert.equal( badges[ 0 ].classList.contains( 'herd-badge--empty' ), true );
} );

test( 'a flag that is on is the row\'s one accent', () => {
	const doc = build( { on: true, icon: 'info-circle' } );
	enhanceBoxes( fakeAcf() );

	const row = doc.querySelector( '[data-name="custom_nav_items"] tr.acf-row:not(.acf-clone)' );
	const badges = Array.from( row.querySelectorAll( '.herd-badge' ) );
	// The choice reports its own value; the caps are the stylesheet's doing.
	assert.deepEqual( badges.map( ( b ) => b.textContent ), [ 'Primary cta', 'info-circle' ] );
	assert.equal( badges[ 0 ].classList.contains( 'herd-badge--on' ), true );
	assert.equal( badges[ 1 ].classList.contains( 'herd-badge--set' ), true );
} );

/* A row opens on a click and closes the one that was open. */
test( 'a card row opens in place', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );

	const row = doc.querySelector( '[data-name="custom_nav_items"] tr.acf-row:not(.acf-clone)' );
	const header = row.querySelector( '.herd-cardrow' );
	assert.equal( header.getAttribute( 'aria-expanded' ), 'false' );
	header.dispatchEvent( new global.window.MouseEvent( 'click', { bubbles: true } ) );
	assert.equal( row.classList.contains( 'is-open' ), true );
	assert.equal( header.getAttribute( 'aria-expanded' ), 'true' );
	// The chip is inside, decorated, waiting.
	assert.ok( row.querySelector( '.acf-link.herd-link .herd-link__text' ) );
} );

/*
 * `append` is ACF's, and the bridge raises it for block forms too. A block form
 * runs its own pipeline on its own schedule; a second one arriving through here
 * would decorate the same nodes twice and, worse, out of order.
 */
test( 'append only reaches postbox surfaces', () => {
	const doc = build();
	const acf = fakeAcf();
	enhanceBoxes( acf );

	const block = doc.querySelector( '.acf-block-fields' );
	block.querySelector( '.acf-link' ).classList.remove( 'herd-link' );
	acf.doAction( 'append', [ block ] );

	assert.equal( block.querySelector( '.acf-link' ).classList.contains( 'herd-link' ), false );
} );

/*
 * A row inside a repeater is the repeater's own business: decorateRepeaters
 * watches its table, so the surface-wide `append` handler steps back rather than
 * decorating the same row from two directions.
 */
test( 'a row ACF adds to a rail repeater becomes a card row', async () => {
	const doc = build();
	const acf = fakeAcf();
	enhanceBoxes( acf );

	const tbody = doc.querySelector( '[data-name="custom_nav_items"] tbody' );
	const added = doc.querySelector( '[data-name="custom_nav_items"] tr.acf-clone' ).cloneNode( true );
	added.classList.remove( 'acf-clone' );
	added.setAttribute( 'data-id', 'row-1' );
	tbody.appendChild( added );
	acf.doAction( 'append', [ added ] );

	// MutationObserver delivers on a microtask.
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

	assert.equal( added.classList.contains( 'herd-card' ), true );
	assert.equal( added.querySelectorAll( '.herd-cardrow' ).length, 1 );
	assert.equal( added.querySelectorAll( '.link-wrap .herd-link__glyph' ).length, 1 );

	let edits = 0;
	added.querySelector( '[data-name="edit"]' ).addEventListener( 'click', () => edits++ );
	added.querySelector( '.link-wrap' ).dispatchEvent( new global.window.MouseEvent( 'click', { bubbles: true } ) );
	assert.equal( edits, 1 );
} );

test( 'the append handler is disposable, and a bus-less ACF is not an error', () => {
	const doc = build();
	const acf = fakeAcf();
	enhanceBoxes( acf )();
	assert.equal( acf.actions.append.length, 0 );
	assert.ok( doc.querySelector( '.herd-cardrow' ) );

	assert.doesNotThrow( () => enhanceBoxes( undefined )() );
} );

/*
 * A capped repeater reports its headroom, not just its length.
 *
 * Both More Info repeaters stop at three links. "3 items" beside an add button
 * that has quietly stopped working leaves the editor to work out why.
 */
test( 'a repeater with a cap says how much of it is used', () => {
	const doc = build();
	doc.querySelector( '[data-name="custom_nav_items"] .acf-repeater' ).dataset.max = '3';

	enhanceBoxes( fakeAcf() );

	assert.equal( doc.querySelector( '.herd-repeater__count' ).textContent, '1 of 3 used' );
} );

test( 'a repeater with no cap just counts, because there is no headroom to report', () => {
	const doc = build();
	enhanceBoxes( fakeAcf() );
	assert.equal( doc.querySelector( '.herd-repeater__count' ).textContent, '1 item' );
} );
