import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneBlock, createBlock, findBlockByClientId, insertBlock, moveBlock, parseDocument, removeBlock, replaceAttributes, replaceAttributesExact, replaceBlockBody, serializeBlockAttributes, serializeDocument } from '../src/document.js';
import { DocumentController } from '../src/controller.js';

const source = 'before\n<!-- wp:group {  "className":"wide"  } -->\n<p>A</p>\n<!-- wp:acf/hero {"name":"acf/hero","data":{"title":"A \\"quote\\""}} /-->\n<!-- wp:paragraph --> <p>Child</p> <!-- /wp:paragraph -->\n<!-- /wp:group -->\nafter';

test( 'round trips a nested document byte for byte', () => {
	assert.equal( serializeDocument( parseDocument( source ) ), source );
} );

test( 'regenerates only an edited attribute comment', () => {
	const blocks = parseDocument( source );
	const group = blocks.find( ( block ) => block.name === 'core/group' );
	const hero = group.innerBlocks.find( ( block ) => block.name === 'acf/hero' );
	const output = serializeDocument( replaceAttributes( blocks, hero.clientId, { data: { title: 'Changed' } } ) );
	assert.ok( output.includes( '<!-- wp:group {  "className":"wide"  } -->' ) );
	assert.ok( output.includes( '<!-- wp:acf/hero {"name":"acf/hero","data":{"title":"Changed"}} /-->' ) );
	assert.equal( output.replace( /<!-- wp:acf\/hero .*?\/-->/, '<hero>' ), source.replace( /<!-- wp:acf\/hero .*?\/-->/, '<hero>' ) );
} );

test( 'serializes changed attributes with WordPress comment-safe escaping', () => {
	const attributes = {
		comment: 'a -- b', html: '<em>Hi</em>', ampersand: 'one & two', quote: 'a "quote"',
		backslash: 'C:\\sites\\herd', unicode: 'café 🐑',
		data: { repeater_0_title: '<Card> & "one"', repeater_0_link: { url: 'https://example.test/a/b?c=1&d=2' } },
	};
	const expected = '{"comment":"a \\u002d\\u002d b","html":"\\u003cem\\u003eHi\\u003c/em\\u003e","ampersand":"one \\u0026 two","quote":"a \\u0022quote\\u0022","backslash":"C:\\u005csites\\u005cherd","unicode":"café 🐑","data":{"repeater_0_title":"\\u003cCard\\u003e \\u0026 \\u0022one\\u0022","repeater_0_link":{"url":"https://example.test/a/b?c=1\\u0026d=2"}}}';
	assert.equal( serializeBlockAttributes( attributes ), expected );
	assert.deepEqual( JSON.parse( serializeBlockAttributes( attributes ) ), attributes );
	const output = serializeDocument( [ createBlock( 'acf/card', attributes ) ] );
	assert.ok( output.includes( expected ) );
	assert.deepEqual( parseDocument( output )[ 0 ].attributes, attributes );
} );

test( 'keeps untouched comments byte-for-byte while canonicalizing changed ones', () => {
	const original = '<!-- wp:acf/card { "data" : { "title" : "<old> & \\"quote\\"" } } /--><!-- wp:acf/other {  "x":1  } /-->';
	const blocks = parseDocument( original );
	const output = serializeDocument( replaceAttributes( blocks, blocks[ 0 ].clientId, { data: { title: '<new> & "quote"' } } ) );
	assert.match( output, /^<!-- wp:acf\/card \{"data":\{"title":"\\u003cnew\\u003e \\u0026 \\u0022quote\\u0022"\}\} \/-->/ );
	assert.ok( output.endsWith( '<!-- wp:acf/other {  "x":1  } /-->' ) );
} );

test( 'preserves malformed and freeform-only documents', () => {
	for ( const value of [ '<p>classic</p>\n', '<!-- wp:group -->never closed', '<!-- /wp:paragraph -->tail' ] ) assert.equal( serializeDocument( parseDocument( value ) ), value );
} );

test( 'finds, removes, inserts, and moves nested blocks immutably', () => {
	const blocks = parseDocument( source );
	const group = blocks.find( ( block ) => block.name === 'core/group' );
	const [ hero, paragraph ] = group.innerBlocks;
	assert.equal( findBlockByClientId( blocks, paragraph.clientId ), paragraph );
	const moved = moveBlock( blocks, paragraph.clientId, group.clientId, 0 );
	assert.deepEqual( findBlockByClientId( moved, group.clientId ).innerBlocks.map( ( block ) => block.clientId ), [ paragraph.clientId, hero.clientId ] );
	const removed = removeBlock( moved, hero.clientId );
	assert.equal( findBlockByClientId( removed, hero.clientId ), null );
	const restored = insertBlock( removed, group.clientId, 1, hero );
	assert.deepEqual( findBlockByClientId( restored, group.clientId ).innerBlocks.map( ( block ) => block.clientId ), [ paragraph.clientId, hero.clientId ] );
	assert.equal( moveBlock( restored, group.clientId, hero.clientId, 0 ), restored );
} );

test( 'coalesces history, supports undo/redo, and restores dirty state', () => {
	let time = 1000;
	const controller = new DocumentController( parseDocument( '<!-- wp:acf/card {"data":{"x":"a"}} /-->' ), { now: () => time } );
	const id = controller.blocks[ 0 ].clientId;
	controller.replaceAttributes( id, { data: { x: 'b' } } ); time += 100;
	controller.replaceAttributes( id, { data: { x: 'c' } } );
	assert.equal( controller.history.length, 2 ); assert.equal( controller.dirty, true );
	controller.undo(); assert.equal( controller.dirty, false ); assert.equal( controller.canRedo, true );
	controller.redo(); assert.ok( controller.serialize().includes( '"x":"c"' ) );
} );

test( 'replaces block body while preserving wrapper markup and neighboring bytes', () => {
	const value = 'before<!-- wp:paragraph {"className":"lead"} -->\n<p class="lead">Old</p>\n<!-- /wp:paragraph -->after';
	const blocks = parseDocument( value );
	const changed = replaceBlockBody( blocks, blocks[ 1 ].clientId, '\n<p class="lead">New</p>\n' );
	assert.equal( serializeDocument( changed ), value.replace( 'Old', 'New' ) );
} );

test( 'replaces attributes exactly rather than merging stale keys', () => {
	const blocks = parseDocument( '<!-- wp:acf/card {"name":"acf/card","stale":true,"data":{"x":1}} /-->' );
	const changed = replaceAttributesExact( blocks, blocks[ 0 ].clientId, { name: 'acf/card', data: {} } );
	assert.equal( serializeDocument( changed ), '<!-- wp:acf/card {"name":"acf/card","data":{}} /-->' );
} );

test( 'creates standard ACF markup and clones with fresh recursive client IDs', () => {
	const created = createBlock( 'acf/card', { name: 'acf/card', data: {} } );
	assert.equal( serializeDocument( [ created ] ), '<!-- wp:acf/card {"name":"acf/card","data":{}} /-->' );
	const nested = parseDocument( '<!-- wp:group --><!-- wp:acf/card {"data":{"x":1}} /--><!-- /wp:group -->' )[ 0 ];
	const copy = cloneBlock( nested );
	assert.notEqual( copy.clientId, nested.clientId );
	assert.notEqual( copy.innerBlocks[ 0 ].clientId, nested.innerBlocks[ 0 ].clientId );
	copy.innerBlocks[ 0 ].attributes.data.x = 2;
	assert.equal( nested.innerBlocks[ 0 ].attributes.data.x, 1 );
	assert.equal( serializeDocument( [ copy ] ), serializeDocument( [ nested ] ) );
} );

test( 'controller makes insertion, duplication, deletion, movement, and field edits undoable', () => {
	const controller = new DocumentController( parseDocument( '<!-- wp:acf/a {"data":{"x":1}} /--><!-- wp:acf/b /-->' ) );
	const first = controller.blocks[ 0 ];
	controller.duplicateBlock( first.clientId );
	assert.equal( controller.blocks.filter( ( block ) => block.name === 'acf/a' ).length, 2 );
	controller.undo();
	assert.equal( controller.blocks.filter( ( block ) => block.name === 'acf/a' ).length, 1 );
	controller.redo();
	const duplicate = controller.blocks[ 1 ];
	controller.moveBlock( duplicate.clientId, null, controller.blocks.length );
	controller.removeBlock( duplicate.clientId );
	controller.undo();
	assert.ok( controller.find( duplicate.clientId ) );
} );
