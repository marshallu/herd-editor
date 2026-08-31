import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStateLabel } from '../src/ui/CommandBar.js';

/*
 * The order the block editor's PostSavedState resolves in: a save in progress
 * wins over everything, and an autosave names itself so it is not mistaken for a
 * deliberate one.
 */
test( 'a save in progress outranks the resting state', () => {
	assert.equal( saveStateLabel( 'autosaving', true, '2 minutes ago' ), 'Autosaving' );
	assert.equal( saveStateLabel( 'saving', true, '2 minutes ago' ), 'Saving' );
} );

test( 'an autosave is named, not lumped in with a deliberate save', () => {
	assert.notEqual( saveStateLabel( 'autosaving', true, '' ), saveStateLabel( 'saving', true, '' ) );
} );

test( 'a save that has just landed says so, whatever the dirty flag was', () => {
	assert.equal( saveStateLabel( 'saved', true, '2 minutes ago' ), 'Saved' );
} );

test( 'at rest the timestamp is more use than the word Saved', () => {
	assert.equal( saveStateLabel( 'idle', false, '2 minutes ago' ), '2 minutes ago' );
	assert.equal( saveStateLabel( 'idle', true, '2 minutes ago' ), 'unsaved changes' );
} );
