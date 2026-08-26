import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFetchBlockPayload, contextForBlock, findBlockByClientId } from '../src/acf/helpers.js';

test('finds an ACF block nested in the canonical Gutenberg tree', () => {
	const hero = { clientId: 'hero-id', name: 'acf/hero', innerBlocks: [] };
	assert.equal(findBlockByClientId([{ clientId: 'group', innerBlocks: [hero] }], 'hero-id'), hero);
});
test('inherits context provided by ancestors and seeds the post identity', () => {
	const ancestors = [{ name: 'acf/provider', attributes: { recordId: 42 } }];
	assert.deepEqual(contextForBlock(ancestors, { 'acf/provider': { provides_context: { 'herd/record': 'recordId' } } }, 123, 'page'), { postId: 123, postType: 'page', 'herd/record': 42 });
});
test('builds the fetch-block payload with the real client and post identity', () => {
	const result = buildFetchBlockPayload({ clientId: 'hero-id', attributes: { name: 'acf/hero', data: { title: 'Hello' } } }, 123, { postId: 123 });
	assert.deepEqual(result, { action: 'acf/ajax/fetch-block', post_id: 123, clientId: 'hero-id', block: '{"name":"acf/hero","data":{"title":"Hello"}}', context: '{"postId":123}', query: { form: true, validate: false }, herd_editor: 1 });
});
test('flags the request as Herd\'s so PHP can defer the editors it renders', () => {
	// herd_editor_delay_editors() reads this to tell a Herd form from a Gutenberg one.
	assert.equal(buildFetchBlockPayload({ clientId: 'x', attributes: {} }, 1).herd_editor, 1);
});
