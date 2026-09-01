import test from 'node:test';
import assert from 'node:assert/strict';
import { availableCommands, createCommandRegistry } from '../src/ui/commands.js';

test( 'command registry only offers selected-block commands permitted by context', () => {
	const commands = createCommandRegistry( {} );
	const labels = availableCommands( commands, { canInsert: true, validationCount: 0, selected: { canDuplicate: true, canDelete: false, canMove: true, canPreview: false, canVisibility: true } } ).map( ( command ) => command.id );
	assert.ok( labels.includes( 'duplicate' ) && labels.includes( 'move' ) && labels.includes( 'toggle-visibility' ) );
	assert.ok( !labels.includes( 'delete' ) && !labels.includes( 'preview' ) );
} );
