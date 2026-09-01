/** A small declarative command registry. Consumers (rows, shortcuts and palette)
 * ask the same availability predicate, so a disabled row action cannot be
 * reached through a keyboard shortcut. */
export function command( definition ) {
	return { id: definition.id, label: definition.label, shortcut: definition.shortcut || '', available: definition.available || ( () => true ), run: definition.run };
}

export function availableCommands( commands, context = {} ) {
	return commands.filter( ( item ) => item.available( context ) );
}

export function createCommandRegistry( actions ) {
	return [
		command( { id: 'find-blocks', label: 'Find blocks', shortcut: '⌘K', run: actions.find } ),
		command( { id: 'expand-all', label: 'Expand all blocks', run: actions.expandAll } ),
		command( { id: 'collapse-all', label: 'Collapse all blocks', run: actions.collapseAll } ),
		command( { id: 'duplicate', label: 'Duplicate selected block', available: ( context ) => !! context.selected?.canDuplicate, run: actions.duplicate } ),
		command( { id: 'delete', label: 'Delete selected block', available: ( context ) => !! context.selected?.canDelete, run: actions.remove } ),
		command( { id: 'move', label: 'Move selected block', available: ( context ) => !! context.selected?.canMove, run: actions.move } ),
		command( { id: 'next-validation', label: 'Next validation result', available: ( context ) => !! context.validationCount, run: actions.nextValidation } ),
	];
}
