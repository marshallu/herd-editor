import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeFor, describeGroup, hasValue, opensByDefault, subLabel } from '../src/ui/acf/group.js';

/**
 * A stand-in for one `.acf-field` wrapper inside a group.
 *
 * Same approach as tests/repeater.test.js: the module reads ACF's rendered
 * markup through a handful of selectors, so the fake answers those and nothing
 * else, which keeps the suite free of a DOM implementation.
 */
function field( {
	type,
	name = '',
	label = null,
	value = '',
	linkUrl = '',
	linkTitle = null,
	checked = false,
	rows = 0,
	required = false,
	hidden = false,
} ) {
	const classes = [ 'acf-field', `acf-field-${ type }` ];
	if ( required ) classes.push( 'is-required' );

	// Image and file carry their attachment id in a hidden input and nothing a
	// summary could use; text-ish types carry a visible one.
	const hasText = [ 'text', 'textarea', 'url', 'email', 'wysiwyg' ].includes( type );

	return {
		dataset: { name },
		style: { display: hidden ? 'none' : '' },
		classList: { contains: ( token ) => classes.includes( token ) },
		querySelectorAll: ( selector ) =>
			selector.includes( 'tr.acf-row' ) ? Array.from( { length: rows }, () => ( {} ) ) : [],
		querySelector: ( selector ) => {
			if ( selector.includes( '.acf-label label' ) ) return label === null ? null : { textContent: label };
			if ( selector.includes( 'input.input-url' ) ) return { value: linkUrl };
			if ( selector.includes( 'input[type="hidden"]' ) ) return { value };
			if ( selector.includes( 'input[type="checkbox"]' ) ) return { checked };
			if ( selector.includes( '.link-title' ) ) return linkTitle === null ? null : { textContent: linkTitle };
			if ( selector === 'textarea' ) return { value };
			if ( selector.includes( 'input[type="text"]' ) ) return hasText ? { value } : null;
			return null;
		},
	};
}

test( 'a partly filled group has nothing to badge', () => {
	const status = describeGroup( [
		field( { type: 'text', value: 'Campus Tour' } ),
		field( { type: 'text', value: 'Tsf5MphHSWA' } ),
		field( { type: 'image', value: '' } ),
	] );
	assert.equal( status.filled, 2 );
	assert.equal( status.total, 3 );
	// The summary line already says what is in there, and an unfilled optional
	// field is not a status worth a pill.
	assert.equal( badgeFor( status ), '' );
} );

test( 'a conditionally hidden field counts against neither side', () => {
	const status = describeGroup( [
		field( { type: 'text', value: 'Campus Tour' } ),
		field( { type: 'text', value: '', hidden: true } ),
		field( { type: 'text', value: '', hidden: true, required: true, label: 'YouTube ID' } ),
	] );
	assert.equal( status.total, 1 );
	assert.equal( status.filled, 1 );
	// A required field that is not on offer cannot be missing.
	assert.equal( status.missing, '' );
	assert.equal( badgeFor( status ), '' );
} );

test( 'says what to do rather than sitting blank', () => {
	const status = describeGroup( [ field( { type: 'text', value: '' } ), field( { type: 'image', value: '' } ) ] );
	assert.equal( status.summary, '' );
	assert.equal( badgeFor( status ), 'Empty' );
} );

test( 'names the first required field still empty', () => {
	const status = describeGroup( [
		field( { type: 'text', value: 'Campus Tour', required: true, label: 'Video Title' } ),
		field( { type: 'text', value: '', required: true, label: 'YouTube ID *' } ),
		field( { type: 'image', value: '', required: true, label: 'Poster image' } ),
	] );
	assert.equal( status.missing, 'YouTube ID' );
	assert.equal( badgeFor( status ), 'Needs youtube id' );
} );

test( 'a filename or an attachment id is never the summary', () => {
	const status = describeGroup( [
		field( { type: 'image', value: '4821' } ),
		field( { type: 'file', value: '4822' } ),
		field( { type: 'text', value: 'Campus Tour' } ),
	] );
	assert.equal( status.summary, 'Campus Tour' );
	assert.equal( status.filled, 3 );
} );

test( 'stops at two fragments', () => {
	const status = describeGroup( [
		field( { type: 'text', value: 'One' } ),
		field( { type: 'text', value: 'Two' } ),
		field( { type: 'text', value: 'Three' } ),
	] );
	assert.equal( status.summary, 'One · Two' );
} );

test( 'reads the value of the types a summary has nothing to say about', () => {
	assert.equal( hasValue( field( { type: 'image', value: '4821' } ) ), true );
	assert.equal( hasValue( field( { type: 'image', value: '' } ) ), false );
	assert.equal( hasValue( field( { type: 'true-false', checked: true } ) ), true );
	assert.equal( hasValue( field( { type: 'true-false', checked: false } ) ), false );
	assert.equal( hasValue( field( { type: 'repeater', rows: 2 } ) ), true );
	assert.equal( hasValue( field( { type: 'repeater', rows: 0 } ) ), false );
	// A link with a title but no url is not a link.
	assert.equal( hasValue( field( { type: 'link', linkTitle: 'Visit', linkUrl: '' } ) ), false );
	assert.equal( hasValue( field( { type: 'link', linkTitle: 'Visit', linkUrl: 'https://x.test' } ) ), true );
} );

test( 'falls back to the field name when ACF rendered no label', () => {
	assert.equal( subLabel( field( { type: 'text', label: 'YouTube ID *' } ) ), 'YouTube ID' );
	assert.equal( subLabel( field( { type: 'text', name: 'video_youtube_id' } ) ), 'Video youtube id' );
} );

test( 'a group opens on load when the field group asked, or when it stands alone', () => {
	// "Open by default" under Presentation, whatever else is on the form.
	assert.equal( opensByDefault( { preferOpen: true, only: false } ), true );
	// Nothing to compare against, so hiding it buys nothing.
	assert.equal( opensByDefault( { preferOpen: false, only: true } ), true );
	assert.equal( opensByDefault( { preferOpen: true, only: true } ), true );
	// Neither reason: collapsed, which is what every group did before the setting.
	assert.equal( opensByDefault( { preferOpen: false, only: false } ), false );
} );

/* ---------- layout fields are not fields ---------- */

test( 'does not count a spacer as an empty field', () => {
	// The failure this prevents: every group carrying a spacer badges "Empty"
	// alongside a filled field, and an editor who learns the badge lies stops
	// reading it.
	const status = describeGroup( [ field( { type: 'text', value: 'Marshall' } ), field( { type: 'spacer' } ) ] );
	assert.equal( status.total, 1 );
	assert.equal( status.filled, 1 );
	assert.equal( badgeFor( status ), '' );
} );

test( 'does not count a message as an empty field either', () => {
	// Message predates the spacer and has been counted the whole time.
	const status = describeGroup( [ field( { type: 'text', value: 'Marshall' } ), field( { type: 'message' } ) ] );
	assert.equal( status.total, 1 );
	assert.equal( badgeFor( status ), '' );
} );

test( 'a spacer never makes a group look incomplete', () => {
	// `is-required` on a spacer can only arrive through an import or a
	// hand-written array, and it must not open the group or block anything.
	const status = describeGroup( [ field( { type: 'spacer', required: true } ), field( { type: 'text', value: 'Set' } ) ] );
	assert.equal( status.missing, '' );
	assert.equal( badgeFor( status ), '' );
} );

test( 'a group of nothing but spacers is still empty', () => {
	const status = describeGroup( [ field( { type: 'spacer' } ), field( { type: 'spacer' } ) ] );
	assert.equal( status.total, 0 );
	assert.equal( badgeFor( status ), 'Empty' );
} );
