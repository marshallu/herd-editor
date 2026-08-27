import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateFlexible, moduleNoun } from '../src/ui/acf/flexible.js';
import { layoutBlockForm, layoutFields } from '../src/ui/acf/layout.js';

/*
 * ACF Pro 6.8's flexible-content markup, from
 * src/Pro/Fields/FlexibleContent/{Render,Layout}.php.
 *
 * Two things are stated here rather than paraphrased, because they are what the
 * decorator is built on and what the old stylesheet got wrong:
 *
 *   1. `.acf-fc-layout-actions-wrap` is the bar. Since 6.5 the handle is only
 *      the draggable name area inside it.
 *   2. Every control ACF binds on carries a `data-name`, except Expand All and
 *      Collapse All, which it binds on their classes. Nothing else on these
 *      elements is load bearing.
 */
const layout = ( { name = 'alternator', label = 'Alternator', order = 0, fields = '', collapsed = false } = {} ) => `
  <div class="layout${ collapsed ? ' -collapsed' : '' }" data-id="row-${ order }" data-layout="${ name }" data-enabled="1" data-renamed="0">
    <input type="hidden" name="acf[field_main][row-${ order }][acf_fc_layout]" value="${ name }">
    <div class="acf-fc-layout-actions-wrap">
      <div class="acf-fc-layout-handle" title="Drag to reorder" data-name="collapse-layout">
        <span class="acf-fc-layout-order">${ order + 1 }</span>
        <span class="acf-fc-layout-draggable-icon"></span>
        <span class="acf-fc-layout-title">${ label }</span>
        <span class="acf-fc-layout-original-title">(${ label })</span>
        <span class="acf-layout-disabled">Disabled</span>
      </div>
      <div class="acf-fc-layout-controls">
        <a class="acf-js-tooltip" href="#" data-name="add-layout" data-context="layout" title="Add Module"><span class="acf-icon -plus-alt "></span></a>
        <a class="acf-js-tooltip" href="#" data-name="duplicate-layout" title="Duplicate"><span class="acf-icon -duplicate-alt"></span></a>
        <a class="acf-js-tooltip" href="#" data-name="remove-layout" title="Delete"><span class="acf-icon -trash-alt"></span></a>
        <a class="acf-js-tooltip" aria-haspopup="menu" href="#" data-name="more-layout-actions" title="More layout actions..."><span class="acf-icon -more-actions"></span></a>
        <div class="acf-layout-collapse">
          <a class="acf-icon -collapse -clear" href="#" data-name="collapse-layout" aria-label="Toggle layout"></a>
        </div>
      </div>
    </div>
    <div class="acf-fields">${ fields }</div>
  </div>`;

const textField = ( value ) => `
  <div class="acf-field acf-field-text" data-name="heading" data-type="text" data-key="field_heading">
    <div class="acf-label"><label>Heading</label></div>
    <div class="acf-input"><input type="text" name="acf[field_heading]" value="${ value }"></div>
  </div>`;

const toggleField = ( key ) => `
  <div class="acf-field acf-field-true-false" data-name="${ key }" data-type="true_false" data-key="field_${ key }">
    <div class="acf-label"><label>${ key }</label></div>
    <div class="acf-input"><input type="checkbox" name="acf[field_${ key }]" value="1"></div>
  </div>`;

/*
 * `-empty` is ACF's, and it matters: it is what hides the top bar, which is why
 * the add button below the layouts exists at all.
 */
const flexible = ( layouts, { buttonLabel = 'Add Module', clones = '' } = {} ) => `
  <div class="acf-field acf-field-flexible-content" data-name="main_content" data-type="flexible_content" data-key="field_main">
    <div class="acf-label"><label>Main Content</label></div>
    <div class="acf-input">
      <div class="acf-flexible-content${ layouts.length ? '' : ' -empty' }" data-min="0" data-max="0" data-button-label="${ buttonLabel }">
        <input type="hidden" name="acf[field_main]">
        <div class="acf-actions acf-fc-top-actions">
          <button class="acf-btn acf-btn-clear acf-fc-expand-all">Expand All</button>
          <button class="acf-btn acf-btn-clear acf-fc-collapse-all">Collapse All</button>
          <span class="acf-separator"></span>
          <a class="acf-button button button-primary" href="#" data-name="add-layout" data-context="top-actions"><i class="acf-icon -plus small"></i>${ buttonLabel }</a>
        </div>
        <div class="no-value-message">Click the "${ buttonLabel }" button below to start creating your layout</div>
        <div class="clones">${ clones }</div>
        <div class="values">${ layouts.join( '' ) }</div>
        <div class="acf-actions">
          <a class="acf-button button button-primary" href="#" data-name="add-layout" data-context="bottom-actions"><i class="acf-icon -plus small"></i>${ buttonLabel }</a>
        </div>
      </div>
    </div>
  </div>`;

function build( markup ) {
	const dom = new JSDOM( `<div class="acf-block-fields acf-fields">${ markup }</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	// A module ACF adds arrives in `.values`, with no event to hang the summary off.
	global.MutationObserver = dom.window.MutationObserver;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

/** Both phases, in the order src/ui/acf/layout.js runs them. */
function mount( markup ) {
	const form = build( markup );
	layoutBlockForm( form );
	decorateFlexible( form );
	return form;
}

const layouts = ( form ) => Array.from( form.querySelectorAll( '.acf-flexible-content > .values > .layout' ) );

test( 'dresses the bar ACF 6.5 moved the handle into, not the handle', () => {
	const form = mount( flexible( [ layout() ] ) );
	const [ first ] = layouts( form );

	assert.ok( first.querySelector( ':scope > .acf-fc-layout-actions-wrap' ).classList.contains( 'herd-fcrow' ) );
	// The handle is the name area now; a rule left on it paints nothing.
	assert.ok( ! first.querySelector( '.acf-fc-layout-handle' ).classList.contains( 'herd-fcrow' ) );
} );

test( 'gives the row a grip, a name and a summary', () => {
	const form = mount( flexible( [ layout( { fields: textField( 'Meet the Marshall family' ) } ) ] ) );
	const [ first ] = layouts( form );

	assert.ok( first.querySelector( '.herd-fcrow .herd-grip svg' ) );
	const main = first.querySelector( '.herd-fcrow__main' );
	assert.equal( main.querySelector( '.acf-fc-layout-title' ).textContent.trim(), 'Alternator' );
	assert.equal( main.querySelector( '.herd-fcrow__summary' ).textContent, 'Meet the Marshall family' );
} );

test( 'leaves every hook ACF binds on where it was', () => {
	const form = mount( flexible( [ layout() ] ) );
	const [ first ] = layouts( form );
	const bar = first.querySelector( '.herd-fcrow' );

	[ 'add-layout', 'duplicate-layout', 'remove-layout', 'more-layout-actions' ].forEach( ( name ) => {
		assert.ok( bar.querySelector( `.herd-fcrow__tool[data-name="${ name }"]` ), name );
	} );
	// Both the handle and the chevron carry it; ACF toggles on either.
	assert.equal( first.querySelectorAll( '[data-name="collapse-layout"]' ).length, 2 );
	assert.ok( form.querySelector( '.acf-fc-expand-all' ) );
	assert.ok( form.querySelector( '.acf-fc-collapse-all' ) );
} );

test( 'the chevron leaves the tool group without leaving the DOM', () => {
	const form = mount( flexible( [ layout() ] ) );
	const [ first ] = layouts( form );

	const chevron = first.querySelector( '.herd-fcrow__chev' );
	assert.ok( chevron, 'the chevron survived its wrapper being removed' );
	assert.equal( chevron.dataset.name, 'collapse-layout' );
	assert.equal( chevron.parentElement.className, 'acf-fc-layout-controls herd-fcrow__tools' );
	assert.equal( first.querySelectorAll( '.acf-layout-collapse' ).length, 0 );
} );

test( 'destructive is the last tool and says so', () => {
	const form = mount( flexible( [ layout() ] ) );
	const tools = Array.from( layouts( form )[ 0 ].querySelectorAll( '.herd-fcrow__tool' ) );

	assert.deepEqual( tools.map( ( tool ) => tool.dataset.name ), [
		'add-layout', 'duplicate-layout', 'more-layout-actions', 'remove-layout',
	] );
	assert.ok( tools.at( -1 ).classList.contains( 'is-destructive' ) );
	tools.forEach( ( tool ) => assert.ok( tool.getAttribute( 'aria-label' ), 'every icon-only control is labelled' ) );
} );

test( 'drops the classes this site paints green with !important', () => {
	const form = mount( flexible( [ layout() ] ) );
	const add = form.querySelector( '.acf-fc-top-actions [data-name="add-layout"]' );

	assert.equal( add.className, 'herd-btn herd-btn--accent' );
	assert.equal( add.textContent, 'Add module' );
	assert.equal( form.querySelector( '.acf-fc-expand-all' ).textContent, 'Expand all' );
	assert.ok( form.querySelector( '.acf-fc-collapse-all' ).classList.contains( 'herd-btn' ) );
} );

test( 'demotes the add button below the layouts as well as the one above', () => {
	// ACF hides the header while the field is empty, so this is the only one on
	// screen until the first module exists.
	const form = mount( flexible( [] ) );
	const below = form.querySelector( '.acf-actions:not(.acf-fc-top-actions) [data-name="add-layout"]' );

	assert.equal( below.className, 'herd-btn herd-btn--accent' );
	assert.equal( below.textContent, 'Add module' );
} );

test( 'the empty state is an invitation rather than a quoted button label', () => {
	const form = mount( flexible( [] ) );
	assert.equal( form.querySelector( '.no-value-message' ).textContent, 'No modules yet. Add one to start.' );
} );

test( 'an empty field keeps a way to add to it', () => {
	const form = mount( flexible( [] ) );

	// The header is ACF's to hide on `-empty`; what has to survive is the button.
	assert.ok( form.querySelector( '.acf-actions:not(.acf-fc-top-actions) [data-name="add-layout"]' ) );
	// And its label, since no header is on screen to carry the field name.
	assert.ok( form.querySelector( '.acf-field-flexible-content > .acf-label label' ) );
} );

test( 'counts what the field group calls them', () => {
	const form = mount( flexible( [ layout(), layout( { order: 1, label: 'Tabs', name: 'tabs' } ) ] ) );
	assert.equal( form.querySelector( '.herd-flex__count' ).textContent, '2 modules' );
	assert.equal( form.querySelector( '.herd-flex__title' ).textContent, 'Main Content' );

	const one = mount( flexible( [ layout() ], { buttonLabel: 'Add Section' } ) );
	assert.equal( one.querySelector( '.herd-flex__count' ).textContent, '1 section' );
} );

test( 'falls back to the field name when the button label is ACF default', () => {
	const dom = new JSDOM( '<div class="acf-field-flexible-content" data-name="sidebar_content"><div class="acf-flexible-content"></div></div>' );
	const field = dom.window.document.querySelector( '.acf-field-flexible-content' );
	assert.equal( moduleNoun( field, field.querySelector( '.acf-flexible-content' ) ), 'sidebar content' );
} );

test( 'collapsed is the default state', () => {
	const form = mount( flexible( [ layout(), layout( { order: 1 } ) ] ) );
	layouts( form ).forEach( ( node ) => assert.ok( node.classList.contains( '-collapsed' ) ) );
} );

test( 'lays out the fields inside a layout body, and inside the templates it clones from', () => {
	const fields = textField( 'Meet the board' ) + toggleField( 'show_icon' );
	const form = mount( flexible( [ layout( { fields } ) ], { clones: layout( { order: 'acfcloneindex', fields } ) } ) );

	form.querySelectorAll( '.acf-flexible-content .layout > .acf-fields' ).forEach( ( body ) => {
		assert.ok( body.classList.contains( 'herd-fields' ) );
		// A text field is compact enough for a field group to pair it on a row.
		assert.ok( body.querySelector( ':scope > .acf-field-text' ).classList.contains( 'herd-field--controls' ) );
		// A toggle that gates nothing goes to the switch list at the end.
		assert.ok( body.querySelector( '.herd-fieldopts__list > .acf-field-true-false' ) );
		assert.equal( body.querySelector( '.herd-fieldopts__count' ).textContent, '0 of 1 on' );
	} );
} );

test( 'a module ACF clones gets a Display options counter of its own', () => {
	const fields = toggleField( 'show_icon' );
	const form = mount( flexible( [], { clones: layout( { order: 'acfcloneindex', fields } ) } ) );
	const template = form.querySelector( '.clones > .layout' );

	// What ACF does on Add: clone the template, then hand it to the values list.
	const added = template.cloneNode( true );
	added.classList.remove( '-collapsed' );
	form.querySelector( '.values' ).appendChild( added );

	const body = added.querySelector( ':scope > .acf-fields' );
	layoutFields( body );
	const box = added.querySelector( 'input[type="checkbox"]' );
	box.checked = true;
	box.dispatchEvent( new global.window.Event( 'change', { bubbles: true } ) );

	assert.equal( body.querySelector( '.herd-fieldopts__count' ).textContent, '1 of 1 on' );
} );

test( 'decorates a module that arrives after mount', async () => {
	const form = mount( flexible( [ layout() ], { clones: layout( { order: 'acfcloneindex', fields: textField( 'Newly added' ) } ) } ) );
	const added = form.querySelector( '.clones > .layout' ).cloneNode( true );
	form.querySelector( '.values' ).appendChild( added );

	// MutationObserver delivers on a microtask.
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

	assert.ok( added.querySelector( '.herd-fcrow .herd-grip' ) );
	assert.equal( added.querySelector( '.herd-fcrow__summary' ).textContent, 'Newly added' );
	assert.equal( form.querySelector( '.herd-flex__count' ).textContent, '2 modules' );
} );

test( 'the summary follows what the fields are set to', () => {
	const form = mount( flexible( [ layout( { fields: textField( 'Before' ) } ) ] ) );
	const [ first ] = layouts( form );
	const input = first.querySelector( 'input[type="text"]' );

	input.value = 'After';
	input.dispatchEvent( new global.window.Event( 'input', { bubbles: true } ) );

	assert.equal( first.querySelector( '.herd-fcrow__summary' ).textContent, 'After' );
} );

test( 'leaves the templates ACF clones from undecorated', () => {
	const form = mount( flexible( [ layout() ], { clones: layout( { order: 'acfcloneindex' } ) } ) );
	const template = form.querySelector( '.clones > .layout' );

	assert.ok( ! template.querySelector( '.herd-fcrow' ) );
	assert.ok( ! template.querySelector( '.herd-grip' ) );
} );

test( 'runs once on a form mounted twice', () => {
	const form = mount( flexible( [ layout( { fields: textField( 'Meet the board' ) } ) ] ) );
	decorateFlexible( form );

	assert.equal( form.querySelectorAll( '.herd-grip' ).length, 1 );
	assert.equal( form.querySelectorAll( '.herd-flex__count' ).length, 1 );
	assert.equal( form.querySelectorAll( '.herd-fcrow__summary' ).length, 1 );
} );
