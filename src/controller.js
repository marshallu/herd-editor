import { cloneBlock, findBlockByClientId, insertBlock, moveBlock, removeBlock, replaceAttributes, replaceAttributesExact, replaceBlockBody, serializeDocument } from './document.js';
import { duplicateWithProfile } from './duplication.js';

export class DocumentController {
	constructor( blocks, { limit = 50, coalesceMs = 750, now = Date.now } = {} ) {
		this.history = [ blocks ]; this.index = 0; this.cleanSource = serializeDocument( blocks );
		this.limit = limit; this.coalesceMs = coalesceMs; this.now = now; this.lastEdit = null;
	}
	get blocks() { return this.history[ this.index ]; }
	get canUndo() { return this.index > 0; }
	get canRedo() { return this.index < this.history.length - 1; }
	get dirty() { return this.serialize() !== this.cleanSource; }
	serialize() { return serializeDocument( this.blocks ); }
	commit( blocks, editKey = null ) {
		if ( blocks === this.blocks ) return this.blocks;
		const time = this.now();
		if ( editKey && this.lastEdit && this.lastEdit.key === editKey && time - this.lastEdit.time <= this.coalesceMs && this.index > 0 ) this.history[ this.index ] = blocks;
		else {
			this.history = [ ...this.history.slice( 0, this.index + 1 ), blocks ];
			if ( this.history.length > this.limit ) this.history.shift(); else this.index++;
		}
		this.lastEdit = editKey ? { key: editKey, time } : null;
		return this.blocks;
	}
	replaceAttributes( id, attrs ) { return this.commit( replaceAttributes( this.blocks, id, attrs ), id ); }
	replaceAttributesExact( id, attrs ) { return this.commit( replaceAttributesExact( this.blocks, id, attrs ), id ); }
	replaceBlockBody( id, body ) { return this.commit( replaceBlockBody( this.blocks, id, body ), id ); }
	insertBlock( parentId, index, block ) { return this.commit( insertBlock( this.blocks, parentId, index, block ) ); }
	duplicateBlock( id, parentId = null, index = null, profiles = {}, clear = [] ) {
		const block = this.find( id );
		if ( ! block ) return this.blocks;
		const siblings = parentId === null ? this.blocks : this.find( parentId )?.innerBlocks || [];
		const sourceIndex = siblings.findIndex( ( candidate ) => candidate.clientId === id );
		const copy = Object.keys( profiles ).length || clear.length ? duplicateWithProfile( block, profiles, clear ) : cloneBlock( block );
		if ( ! copy ) return this.blocks;
		return this.commit( insertBlock( this.blocks, parentId, index === null ? sourceIndex + 1 : index, copy ) );
	}
	removeBlock( id ) { return this.commit( removeBlock( this.blocks, id ) ); }
	moveBlock( id, parentId, index ) { return this.commit( moveBlock( this.blocks, id, parentId, index ) ); }
	undo() { if ( this.canUndo ) { this.index--; this.lastEdit = null; } return this.blocks; }
	redo() { if ( this.canRedo ) { this.index++; this.lastEdit = null; } return this.blocks; }
	find( id ) { return findBlockByClientId( this.blocks, id ); }
}
