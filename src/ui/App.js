/** Herd Editor application shell: block list, structural editing, command bar. */

import { createElement, createPortal, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { adapterFor, blockMutationPolicy, canAddBlock, createAcfBlock } from '../adapters.js';
import { DocumentController } from '../controller.js';
import { parseDocument } from '../document.js';
import { BarTools } from './CommandBar.js';
import { BlockRow } from './BlockRow.js';
import { InsertPoint } from './InsertPoint.js';
import { AcfForm, CoreEditor, FallbackPanel } from './panels.js';
import { blockCounts, bodyFor, collectBlocks, iconOf, isHidden, titleFor, visibleRows } from './blocks.js';
import { dropSlot, insertPositionForSlot, moveTargetIndex, topLevelPositions, topLevelSlot } from './order.js';
import { blockSummary } from './summary.js';
import { Notice } from './primitives.js';

const el = createElement;
const CORE_ADAPTERS = [ 'paragraph', 'heading', 'html', 'shortcode' ];

export function HerdEditorApp( { config } ) {
	const controller = useRef( new DocumentController( parseDocument( config.postContent ) ) ).current;
	const [ generation, setGeneration ] = useState( 0 );
	const [ formGeneration, setFormGeneration ] = useState( 0 );
	const [ openPanels, setOpenPanels ] = useState( () => new Set() );
	const [ expandedChildren, setExpandedChildren ] = useState( () => new Set() );
	const [ focusedId, setFocusedId ] = useState( null );
	const [ liftedId, setLiftedId ] = useState( null );
	const [ drag, setDrag ] = useState( null );
	const [ nativeDirty, setNativeDirty ] = useState( false );
	const [ announcement, setAnnouncement ] = useState( '' );
	const [ openGap, setOpenGap ] = useState( null );
	const [ validationErrors, setValidationErrors ] = useState( [] );

	const rowRefs = useRef( new Map() );
	const rows = useMemo( () => visibleRows( controller.blocks, expandedChildren ), [ generation, expandedChildren ] );
	const dirty = controller.dirty || nativeDirty;
	const counts = blockCounts( controller.blocks );
	const named = topLevelPositions( controller.blocks );

	const refresh = () => setGeneration( ( value ) => value + 1 );
	const syncContent = () => {
		const content = document.getElementById( 'content' );
		if ( content ) content.value = controller.serialize();
	};

	useEffect( syncContent, [ generation ] );

	useEffect( () => {
		const form = document.getElementById( 'post' );
		let submitting = false;
		const changed = ( event ) => {
			if ( event.target?.id !== 'content' && ! event.target?.closest?.( '#herd-editor-root' ) ) setNativeDirty( true );
		};
		const isPublishTransition = ( submitter ) => /publish|schedule/i.test( submitter?.id || submitter?.name || '' );
		const validate = async () => {
			const body = new URLSearchParams( { action: 'herd_editor_validate_document', nonce: config.validationNonce || '', postId: String( config.postId ), content: controller.serialize() } );
			const ids = collectBlocks( controller.blocks ).filter( ( block ) => block.name?.startsWith( 'acf/' ) ).map( ( block ) => block.clientId );
			ids.forEach( ( id ) => body.append( 'clientIds[]', id ) );
			const response = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body } );
			const payload = await response.json();
			return payload?.success ? payload.data.errors || [] : [ { message: 'Validation could not be completed.' } ];
		};
		const submit = ( event ) => {
			syncContent();
			if ( isPublishTransition( event.submitter ) && form?.dataset.herdValidated !== '1' ) {
				event.preventDefault();
				validate().then( ( errors ) => {
					if ( errors.length ) {
						setValidationErrors( errors );
						const first = errors[ 0 ];
						if ( first.blockId ) { setOpenPanels( ( current ) => new Set( current ).add( first.blockId ) ); focusId( first.blockId ); }
						setAnnouncement( `Publishing blocked: ${ errors.length } ACF validation ${ errors.length === 1 ? 'error' : 'errors' } need attention.` );
						return;
					}
					form.dataset.herdValidated = '1'; form.requestSubmit( event.submitter );
				} ).catch( () => setAnnouncement( 'Publishing blocked because validation could not be completed.' ) );
				return;
			}
			if ( form ) delete form.dataset.herdValidated;
			submitting = true;
			queueMicrotask( () => {
				if ( event.defaultPrevented ) submitting = false;
			} );
		};
		const click = () => syncContent();
		const unload = ( event ) => {
			if ( ( controller.dirty || nativeDirty ) && ! submitting ) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		form?.addEventListener( 'input', changed );
		form?.addEventListener( 'change', changed );
		form?.addEventListener( 'submit', submit );
		form?.addEventListener( 'click', click, true );
		window.addEventListener( 'beforeunload', unload );
		return () => {
			form?.removeEventListener( 'input', changed );
			form?.removeEventListener( 'change', changed );
			form?.removeEventListener( 'submit', submit );
			form?.removeEventListener( 'click', click, true );
			window.removeEventListener( 'beforeunload', unload );
		};
		}, [ nativeDirty ] );

	const toggleIn = ( setter ) => ( id ) => setter( ( current ) => {
		const next = new Set( current );
		if ( next.has( id ) ) next.delete( id ); else next.add( id );
		return next;
	} );
	const togglePanel = toggleIn( setOpenPanels );
	const toggleChildren = toggleIn( setExpandedChildren );

	const focusId = ( id ) => requestAnimationFrame( () => rowRefs.current.get( id )?.focus() );
	const focusAt = ( index ) => focusId( rows[ Math.max( 0, Math.min( index, rows.length - 1 ) ) ]?.block.clientId );
	const mutate = ( message, callback, nextFocus = null ) => {
		callback();
		setFormGeneration( ( value ) => value + 1 );
		refresh();
		setAnnouncement( message );
		if ( nextFocus ) focusId( nextFocus );
	};

	const nameOf = ( block ) => titleFor( block, config.blockTypes );

	/** Title of the named top-level block at a slot, so a gap can say what it follows. */
	const titleAt = ( slot ) => {
		const entry = named[ slot ];
		return entry ? nameOf( controller.find( entry.clientId ) ) : null;
	};

	/** Move a top-level block to a slot among its named siblings. */
	const moveToSlot = ( block, toSlot ) => {
		if ( ! blockMutationPolicy( block, config.templateLock ).move ) return false;
		const index = moveTargetIndex( controller.blocks, block.clientId, toSlot );
		if ( index === null ) return false;
		controller.moveBlock( block.clientId, null, index );
		refresh();
		setAnnouncement( `${ nameOf( block ) } moved to position ${ Math.max( 0, Math.min( toSlot, named.length - 1 ) ) + 1 } of ${ named.length }.` );
		return true;
	};

	/** Add a new block at a slot among the named top-level blocks. */
	const insertAt = ( slot, name ) => {
		if ( ! blockMutationPolicy( null, config.templateLock ).insert || ! canAddBlock( name, config.blockTypes[ name ], counts ) ) return;
		const block = createAcfBlock( name );
		const index = insertPositionForSlot( controller.blocks, slot );
		setOpenGap( null );
		mutate(
			`${ nameOf( block ) } inserted at position ${ slot + 1 } of ${ named.length + 1 }.`,
			() => controller.insertBlock( null, index, block ),
			block.clientId
		);
		setOpenPanels( ( current ) => new Set( current ).add( block.clientId ) );
	};

	/** Props shared by every insertion point; only the slot differs. */
	const insertPointFor = ( slot, afterTitle ) => ( {
		key: `gap-${ slot }`,
		label: afterTitle ? `Insert a block after ${ afterTitle }` : 'Insert a block at the start',
		isOpen: openGap === slot,
		onOpen: () => setOpenGap( slot ),
		onClose: () => setOpenGap( null ),
		catalog: config.blockTypes,
		counts,
		groupOrder: config.blockGroupOrder || [],
		onInsert: ( name ) => insertAt( slot, name ),
	} );

	const onRowKeyDown = ( event, row, index ) => {
		if ( event.target !== event.currentTarget ) return;
		if ( ! [ 'ArrowUp', 'ArrowDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Enter', ' ' ].includes( event.key ) ) return;
		event.preventDefault();
		const id = row.block.clientId;
		if ( event.key === 'ArrowUp' ) focusAt( index - 1 );
		else if ( event.key === 'ArrowDown' ) focusAt( index + 1 );
		else if ( event.key === 'Home' ) focusAt( 0 );
		else if ( event.key === 'End' ) focusAt( rows.length - 1 );
		else if ( event.key === 'ArrowRight' && row.block.innerBlocks.length ) {
			expandedChildren.has( id ) ? focusAt( index + 1 ) : toggleChildren( id );
		} else if ( event.key === 'ArrowLeft' ) {
			if ( expandedChildren.has( id ) ) toggleChildren( id );
			else if ( row.ancestors.length ) focusId( row.ancestors.at( -1 ).clientId );
		} else togglePanel( id );
	};

	const onGripKeyDown = ( event, block ) => {
		const id = block.clientId;
		if ( event.key === ' ' || event.key === 'Enter' ) {
			event.preventDefault();
			if ( liftedId === id ) {
				setLiftedId( null );
				setAnnouncement( `${ nameOf( block ) } dropped.` );
			} else {
				setLiftedId( id );
				setAnnouncement( `${ nameOf( block ) } picked up. Use the arrow keys to move it, then press Enter to drop.` );
			}
			return;
		}
		if ( liftedId !== id ) return;
		if ( event.key === 'Escape' ) {
			event.preventDefault();
			setLiftedId( null );
			setAnnouncement( 'Move cancelled.' );
			return;
		}
		if ( event.key !== 'ArrowUp' && event.key !== 'ArrowDown' ) return;
		event.preventDefault();
		const slot = topLevelSlot( controller.blocks, id );
		// Reordering never changes a block's fields, so mounted ACF forms stay put.
		if ( moveToSlot( block, slot + ( event.key === 'ArrowUp' ? -1 : 1 ) ) ) focusId( id );
	};

	const expandAll = () => {
		const all = collectBlocks( controller.blocks );
		const acfCount = all.filter( ( block ) => adapterFor( block, config.blockTypes[ block.name ] || {} ).id === 'acf' ).length;
		const cap = Number( config.expandWarnAt ) || 8;
		if ( acfCount > cap && ! window.confirm( `Expanding every block loads ${ acfCount } ACF forms at once, which can be slow on a large page. Continue?` ) ) return;
		setExpandedChildren( new Set( all.filter( ( block ) => block.innerBlocks?.length ).map( ( block ) => block.clientId ) ) );
		setOpenPanels( new Set( all.map( ( block ) => block.clientId ) ) );
		setAnnouncement( `${ all.length } blocks expanded.` );
	};

	const collapseAll = () => {
		setOpenPanels( new Set() );
		setAnnouncement( 'All blocks collapsed.' );
	};

	const panelFor = ( row, adapter ) => {
		if ( adapter.id === 'acf' ) {
			return el( AcfForm, {
				block: row.block,
				ancestors: row.ancestors,
				config,
				generation: formGeneration,
				validationErrors: validationErrors.filter( ( error ) => error.blockId === row.block.clientId ),
				onAttributes: ( attributes ) => {
					controller.replaceAttributes( row.block.clientId, attributes );
					refresh();
				},
			} );
		}
		if ( CORE_ADAPTERS.includes( adapter.id ) ) {
			return el( CoreEditor, {
				block: row.block,
				adapterId: adapter.id,
				onBody: ( body ) => {
					controller.replaceBlockBody( row.block.clientId, body );
					refresh();
				},
				onHeading: ( level, body ) => {
					controller.replaceAttributes( row.block.clientId, { level } );
					controller.replaceBlockBody( row.block.clientId, body );
					refresh();
				},
			} );
		}
		return el( FallbackPanel, { blockEditorUrl: config.blockEditorUrl, path: row.path } );
	};

	const barTarget = document.getElementById( 'herd-bar-react' );
	const barTools = el( BarTools, {
		dirty,
		savedLabel: config.modifiedHuman || 'Saved',
		canUndo: controller.canUndo,
		canRedo: controller.canRedo,
		onUndo: () => mutate( 'Change undone.', () => controller.undo() ),
		onRedo: () => mutate( 'Change redone.', () => controller.redo() ),
	} );

	return el( 'main', { className: 'herd-editor', 'aria-label': 'Herd block editor' },
		barTarget && createPortal( barTools, barTarget ),

		el( 'p', { className: 'screen-reader-text', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, announcement ),

		el( 'div', { className: 'herd-listhead' },
			el( 'span', { className: 'herd-listhead__count' }, `${ named.length } ${ named.length === 1 ? 'block' : 'blocks' }` ),
			el( 'span', { className: 'herd-listhead__acts' },
				el( 'button', { type: 'button', className: 'herd-ghost', onClick: collapseAll }, 'Collapse all' ),
				el( 'button', { type: 'button', className: 'herd-ghost', onClick: expandAll }, 'Expand all' ) ) ),

		rows.length === 0 && el( Notice, { status: 'info' }, 'This document has no blocks. Add an ACF block to begin.' ),

		el( 'ol', { className: 'herd-list' }, rows.flatMap( ( row, index ) => {
			const { block } = row;
			const metadata = config.blockTypes[ block.name ] || {};
			const adapter = adapterFor( block, metadata );
			const slot = row.ancestors.length ? -1 : topLevelSlot( controller.blocks, block.clientId );
			const policy = blockMutationPolicy( block, config.templateLock );
			const structural = adapter.structural && slot >= 0 && ( policy.move || policy.remove || policy.insert );
			const title = nameOf( block );

			const blockRow = el( BlockRow, {
				key: block.clientId,
				block,
				depth: row.ancestors.length,
				title,
				summary: blockSummary( block, adapter.id, bodyFor( block ) ),
				icon: iconOf( metadata ),
				badge: adapter.editable ? null : ( metadata.readOnly ? 'Open in Block Editor' : ( metadata.registered ? 'Read only' : 'Unsupported' ) ),
				hidden: isHidden( block ),
				isOpen: openPanels.has( block.clientId ),
				childrenExpanded: expandedChildren.has( block.clientId ),
				hasChildren: block.innerBlocks.length > 0,
				canReorder: structural && policy.move && named.length > 1,
				isLifted: liftedId === block.clientId,
				isDragging: drag?.id === block.clientId,
				dropEdge: drag && drag.overId === block.clientId && drag.id !== block.clientId ? ( drag.after ? 'after' : 'before' ) : null,
				structural,
				duplicateDisabled: ! policy.insert || metadata.multiple === false && counts[ block.name ] > 0,
				deleteDisabled: ! policy.remove,
				tabIndex: focusedId === null ? ( index === 0 ? 0 : -1 ) : ( focusedId === block.clientId ? 0 : -1 ),
				registerRef: ( node ) => node ? rowRefs.current.set( block.clientId, node ) : rowRefs.current.delete( block.clientId ),
				onFocus: () => setFocusedId( block.clientId ),
				onToggle: () => togglePanel( block.clientId ),
				onToggleChildren: () => toggleChildren( block.clientId ),
				onKeyDown: ( event ) => onRowKeyDown( event, row, index ),
				onGripKeyDown: ( event ) => onGripKeyDown( event, block ),
				onGripDragStart: ( event ) => {
					event.dataTransfer.effectAllowed = 'move';
					event.dataTransfer.setData( 'text/plain', block.clientId );
					setLiftedId( null );
					setDrag( { id: block.clientId, overId: null, after: false } );
				},
				onGripDragEnd: () => setDrag( null ),
				onDragOver: ( event ) => {
					if ( ! drag || drag.id === block.clientId ) return;
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move';
					const box = event.currentTarget.getBoundingClientRect();
					const after = event.clientY > box.top + box.height / 2;
					if ( drag.overId !== block.clientId || drag.after !== after ) setDrag( { ...drag, overId: block.clientId, after } );
				},
				onDragLeave: ( event ) => {
					if ( drag?.overId === block.clientId && ! event.currentTarget.contains( event.relatedTarget ) ) {
						setDrag( { ...drag, overId: null } );
					}
				},
				onDrop: ( event ) => {
					if ( ! drag || drag.id === block.clientId ) return;
					event.preventDefault();
					const source = controller.find( drag.id );
					const fromSlot = topLevelSlot( controller.blocks, drag.id );
					setDrag( null );
					if ( ! source || fromSlot === -1 || slot === -1 ) return;
					moveToSlot( source, dropSlot( fromSlot, slot, drag.after ) );
				},
				onDuplicate: () => {
					if ( ! policy.insert ) return;
					const before = new Set( controller.blocks.map( ( candidate ) => candidate.clientId ) );
					controller.duplicateBlock( block.clientId );
					const clone = controller.blocks.find( ( candidate ) => ! before.has( candidate.clientId ) );
					setFormGeneration( ( value ) => value + 1 );
					refresh();
					setAnnouncement( `${ title } duplicated.` );
					if ( clone ) {
						setOpenPanels( ( current ) => new Set( current ).add( clone.clientId ) );
						focusId( clone.clientId );
					}
				},
				onDelete: () => {
					if ( ! policy.remove ) return;
					if ( ! window.confirm( `Delete ${ title }? You can undo this action.` ) ) return;
					const fallback = named[ slot + 1 ] || named[ slot - 1 ];
					setOpenPanels( ( current ) => {
						const next = new Set( current );
						next.delete( block.clientId );
						return next;
					} );
					mutate( `${ title } deleted.`, () => controller.removeBlock( block.clientId ), fallback?.clientId );
				},
			}, openPanels.has( block.clientId ) ? panelFor( row, adapter ) : null );

			// Only top-level rows carry an insertion point; an expanded child row
			// sits inside its parent, where there is no slot to insert into.
			return slot >= 0 && blockMutationPolicy( null, config.templateLock ).insert
				? [ el( InsertPoint, insertPointFor( slot, titleAt( slot - 1 ) ) ), blockRow ]
				: [ blockRow ];
		} ).concat( el( InsertPoint, {
			...insertPointFor( named.length, titleAt( named.length - 1 ) ),
			// The final insertion point sits immediately above the persistent tail
			// control, so keep its menu with the document rather than over it.
			forceAbove: true,
		} ) ) ),

		el( 'button', {
			type: 'button',
			className: 'herd-inserter__tail',
			onClick: () => setOpenGap( named.length ),
		}, '+ Add block at the end' ) );
}
