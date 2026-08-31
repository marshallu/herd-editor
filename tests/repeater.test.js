import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decorateRepeaters, describeRow, fieldText } from '../src/ui/acf/repeater.js';

/**
 * A stand-in for one `.acf-field` wrapper.
 *
 * The module reads ACF's rendered markup through a handful of selectors, so the
 * fake answers those selectors and nothing else — same approach as the other
 * suites here, which keeps the tests free of a DOM implementation.
 */
function field( { type, value = '', linkTitle = null, option = null, radio = null, hidden = false } ) {
	const classes = [ 'acf-field', `acf-field-${ type }` ];
	const inputs = [];
	if ( value !== null ) inputs.push( { type: type === 'image' ? 'hidden' : 'text', value } );
	if ( option ) inputs.push( { type: 'select-one', value: option.value } );
	if ( radio ) inputs.push( { type: 'radio', value: radio.value, checked: true } );

	const select = option ? { selectedIndex: 0, options: [ { value: option.value, textContent: option.label } ] } : null;

	return {
		style: { display: hidden ? 'none' : '' },
		classList: { contains: ( name ) => classes.includes( name ) },
		querySelectorAll: () => inputs,
		querySelector: ( selector ) => {
			if ( selector.includes( '.link-title' ) ) return linkTitle === null ? null : { textContent: linkTitle };
			if ( selector === 'select' ) return select;
			if ( selector.includes( 'radio' ) ) return radio ? { closest: () => ( { textContent: radio.label } ) } : null;
			if ( selector.includes( 'textarea' ) && ! selector.includes( 'input' ) ) return { value };
			if ( selector.includes( 'input[type="text"]' ) ) return { value };
			return null;
		},
	};
}

const cell = ( fields ) => ( { children: fields } );

test( 'reads a field the way an editor would say it', () => {
	assert.equal( fieldText( field( { type: 'text', value: 'Meet the board' } ) ), 'Meet the board' );
	assert.equal( fieldText( field( { type: 'wysiwyg', value: '<p>Short <b>blurb</b></p>' } ) ), 'Short blurb' );
	assert.equal( fieldText( field( { type: 'link', linkTitle: 'Marshall news' } ) ), 'Marshall news' );
	assert.equal( fieldText( field( { type: 'select', option: { value: 'white', label: 'White' } } ) ), 'White' );
	assert.equal( fieldText( field( { type: 'button-group', radio: { value: 'grid', label: 'Grid' } } ) ), 'Grid' );
} );

test( 'a select sitting on its empty option says nothing', () => {
	assert.equal( fieldText( field( { type: 'select', option: { value: '', label: '- Select -' } } ) ), '' );
} );

test( 'names a row after its first text field and summarises the rest', () => {
	const row = describeRow( cell( [
		field( { type: 'text', value: 'Latest news' } ),
		field( { type: 'select', option: { value: 'white', label: 'White' } } ),
		field( { type: 'wysiwyg', value: 'Check out the latest Marshall news.' } ),
	] ) );

	assert.equal( row.name, 'Latest news' );
	assert.equal( row.summary, 'White · Check out the latest Marshall news.' );
} );

test( 'says nothing about a field the active card style has hidden', () => {
	// An Icon card has no image field, and a conditionally hidden select must not
	// leak its default into the summary.
	const row = describeRow( cell( [
		field( { type: 'text', value: 'Meet the board' } ),
		field( { type: 'image', value: '', hidden: true } ),
		field( { type: 'select', option: { value: 'white', label: 'White' }, hidden: true } ),
	] ) );

	assert.equal( row.name, 'Meet the board' );
	assert.equal( row.summary, '' );
} );

test( 'an untitled row still reports what it has', () => {
	const row = describeRow( cell( [
		field( { type: 'text', value: '' } ),
		field( { type: 'select', option: { value: 'green', label: 'Green' } } ),
	] ) );

	assert.equal( row.name, '' );
	assert.equal( row.summary, 'Green' );
} );

test( 'names a row from its link when no text field offers one', () => {
	// The Billboard block's `links` repeater: a select and a link, nothing else.
	const row = describeRow( cell( [
		field( { type: 'select', option: { value: 'web', label: 'Web Link' } } ),
		field( { type: 'link', value: null, linkTitle: 'Apply Now' } ),
	] ) );

	assert.equal( row.name, 'Apply Now' );
	// Promoted to the name, so it must not also appear in the summary.
	assert.equal( row.summary, 'Web Link' );
} );

test( 'still prefers a real text field over a link title', () => {
	const row = describeRow( cell( [
		field( { type: 'link', value: null, linkTitle: 'Apply Now' } ),
		field( { type: 'text', value: 'Admissions' } ),
	] ) );

	assert.equal( row.name, 'Admissions' );
	assert.equal( row.summary, 'Apply Now' );
} );

test( 'leaves a row with nothing to say unnamed', () => {
	const row = describeRow( cell( [ field( { type: 'image', value: '' } ) ] ) );
	assert.equal( row.name, '' );
	assert.equal( row.summary, '' );
} );

/* ---------- layout fields are not fields ---------- */

test( 'leaves a spacer out of the row summary', () => {
	const { name, summary } = describeRow( cell( [
		field( { type: 'text', value: 'Financial aid' } ),
		field( { type: 'spacer' } ),
		field( { type: 'select', option: { value: 'wide', label: 'Wide' } } ),
	] ) );
	assert.equal( name, 'Financial aid' );
	assert.equal( summary, 'Wide' );
} );

test( 'a row of one field and one spacer still names itself', () => {
	const { name, summary } = describeRow( cell( [
		field( { type: 'spacer' } ),
		field( { type: 'text', value: 'Housing' } ),
	] ) );
	assert.equal( name, 'Housing' );
	assert.equal( summary, '' );
} );

/* ---------- row thumbnails ---------- */

function repeaterThumbForm( fields ) {
	const dom = new JSDOM( `
		<div class="acf-block-fields acf-fields">
			<div class="acf-field acf-field-repeater" data-name="contacts" data-type="repeater">
				<div class="acf-label"><label>Contacts</label></div>
				<div class="acf-input"><div class="acf-repeater -block" data-min="0" data-max="0">
					<table><tbody><tr class="acf-row">
						<td class="acf-row-handle order"><span class="acf-row-number">1</span></td>
						<td class="acf-fields">${ fields }</td>
					</tr></tbody></table>
					<div class="acf-actions"><a class="acf-repeater-add-row" data-event="add-row"></a></div>
				</div></div>
			</div>
		</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	global.MutationObserver = dom.window.MutationObserver;
	window.HerdEditor = {
		icons: {
			email: '<svg data-icon="email"></svg>',
			phone: '<svg data-icon="phone"></svg>',
			web: '<svg data-icon="web"></svg>',
		},
	};
	return dom.window.document.querySelector( '.acf-block-fields' );
}

const select = ( name, choices ) => `
	<div class="acf-field acf-field-select" data-name="${ name }" data-type="select">
		<div class="acf-label"><label>${ name }</label></div>
		<div class="acf-input"><select>${ choices.map( ( value, index ) => `<option value="${ value }"${ index === 0 ? ' selected' : '' }>${ value }</option>` ).join( '' ) }</select></div>
	</div>`;

test( 'only paints a repeater icon thumbnail for an icon-choice select', () => {
	const form = repeaterThumbForm(
		select( 'email', [ 'email', 'text', 'none' ] )
		+ select( 'mobile', [ 'phone', 'text', 'none' ] ),
	);

	decorateRepeaters( form );

	const thumb = form.querySelector( '.herd-cardrow__thumb' );
	assert.equal( thumb.innerHTML, '' );
	assert.equal( thumb.matches( ':empty' ), true );
} );

test( 'paints a repeater thumbnail for a recognised icon picker', () => {
	const form = repeaterThumbForm( select( 'link_icon', [ 'phone', 'web' ] ) );

	decorateRepeaters( form );

	assert.equal( form.querySelector( '.herd-cardrow__thumb svg' ).dataset.icon, 'phone' );
} );

/* ---------- the add button at the foot ---------- */

/**
 * A repeater of `count` one-field rows, mounted in a JSDOM window.
 *
 * @param {number} count How many rows the list holds.
 * @return {HTMLElement} The form to decorate.
 */
function repeaterListForm( count ) {
	const rows = Array.from( { length: count }, ( _, index ) => `
		<tr class="acf-row">
			<td class="acf-row-handle order"><span class="acf-row-number">${ index + 1 }</span></td>
			<td class="acf-fields">
				<div class="acf-field acf-field-text" data-name="title" data-type="text">
					<div class="acf-input"><input type="text" value="Card ${ index + 1 }"></div>
				</div>
			</td>
			<td class="acf-row-handle remove"></td>
		</tr>` ).join( '' );

	const dom = new JSDOM( `
		<div class="acf-block-fields acf-fields">
			<div class="acf-field acf-field-repeater" data-name="cards" data-type="repeater">
				<div class="acf-label"><label>Cards</label></div>
				<div class="acf-input"><div class="acf-repeater -block" data-min="0" data-max="0">
					<table><tbody>${ rows }</tbody></table>
					<div class="acf-actions"><a class="acf-repeater-add-row button button-primary" href="#" data-event="add-row">Add Card</a></div>
				</div></div>
			</div>
		</div>` );
	global.document = dom.window.document;
	global.window = dom.window;
	global.MutationObserver = dom.window.MutationObserver;
	return dom.window.document.querySelector( '.acf-block-fields' );
}

const foot = ( form ) => form.querySelector( '.herd-repeater__foot' );

test( 'one collapsed row does not get the same add button twice', () => {
	const form = repeaterListForm( 1 );

	decorateRepeaters( form );

	assert.equal( foot( form ).classList.contains( 'is-shown' ), false );
} );

test( 'a list you have to scroll gets an add button at its foot', () => {
	const form = repeaterListForm( 3 );

	decorateRepeaters( form );

	assert.equal( foot( form ).classList.contains( 'is-shown' ), true );
	assert.equal( foot( form ).querySelector( 'button' ).textContent, 'Add Card' );
} );

test( 'an open row is tall enough to earn the foot on its own', () => {
	const form = repeaterListForm( 1 );
	decorateRepeaters( form );

	form.querySelector( '.herd-cardrow' ).click();

	assert.equal( foot( form ).classList.contains( 'is-shown' ), true );
} );

test( "the foot's button clicks ACF's own, so one element stays the add button", () => {
	const form = repeaterListForm( 3 );
	decorateRepeaters( form );

	let added = 0;
	form.querySelector( '.acf-repeater-add-row' ).addEventListener( 'click', () => added++ );
	foot( form ).querySelector( 'button' ).click();

	assert.equal( added, 1 );
} );
