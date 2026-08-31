import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { decryptRecovery, encryptRecovery, encryptionKey, nativeFormValues, recoveryRecordId, restoreNativeFormValues } from '../src/recovery.js';

globalThis.crypto ||= webcrypto;

test( 'namespaces recovery records by WordPress user and post', () => {
	assert.equal( recoveryRecordId( 7, 42 ), 'herd:7:42' );
	assert.notEqual( recoveryRecordId( 7, 42 ), recoveryRecordId( 8, 42 ) );
} );

test( 'encrypts and decrypts a recovery payload', async () => {
	const key = await encryptionKey( 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' );
	const encrypted = await encryptRecovery( { content: 'changed', fields: [] }, key );
	assert.notEqual( encrypted.ciphertext, 'changed' );
	assert.deepEqual( await decryptRecovery( encrypted, key ), { content: 'changed', fields: [] } );
} );

test( 'captures and restores native title and meta fields without lock credentials', () => {
	const dom = new JSDOM( '<form><input name="post_title" value="New title"><input name="active_post_lock" value="9:1"><input type="checkbox" name="flag" value="yes" checked><select name="kind"><option value="a">A</option><option value="b" selected>B</option></select></form>' );
	const form = dom.window.document.querySelector( 'form' );
	const values = nativeFormValues( form );
	assert.equal( values.some( ( value ) => value.name === 'active_post_lock' ), false );
	form.querySelector( '[name=post_title]' ).value = 'Server title';
	form.querySelector( '[name=flag]' ).checked = false;
	restoreNativeFormValues( form, values );
	assert.equal( form.querySelector( '[name=post_title]' ).value, 'New title' );
	assert.equal( form.querySelector( '[name=flag]' ).checked, true );
} );
