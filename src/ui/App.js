/** Herd Editor application shell: block list, structural editing, command bar. */

import { createElement, createPortal, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { adapterFor, blockMutationPolicy, canAddBlock, createAcfBlock } from '../adapters.js';
import { DocumentController } from '../controller.js';
import { changedAttributeIds, parseDocument } from '../document.js';
import { BarTools } from './CommandBar.js';
import { BlockRow } from './BlockRow.js';
import { InsertPoint } from './InsertPoint.js';
import { AcfForm, CoreEditor, FallbackPanel } from './panels.js';
import { blockCounts, bodyFor, collectBlocks, iconOf, isHidden, titleFor, visibleRows } from './blocks.js';
import { dropSlot, insertPositionForSlot, moveTargetIndex, topLevelPositions, topLevelSlot } from './order.js';
import { blockSummary } from './summary.js';
import { Notice } from './primitives.js';
import { decryptRecovery, deleteRecovery, downloadRecovery, encryptionKey, nativeFormValues, readRecovery, recoveryRecordId, restoreNativeFormValues, writeRecovery, encryptRecovery } from '../recovery.js';

const el = createElement;
const CORE_ADAPTERS = [ 'paragraph', 'heading', 'html', 'shortcode' ];

export function HerdEditorApp( { config } ) {
	const controller = useRef( new DocumentController( parseDocument( config.postContent ) ) ).current;
	const [ generation, setGeneration ] = useState( 0 );
	const [ formVersions, setFormVersions ] = useState( () => ( {} ) );
	const [ openPanels, setOpenPanels ] = useState( () => new Set() );
	const [ expandedChildren, setExpandedChildren ] = useState( () => new Set() );
	const [ focusedId, setFocusedId ] = useState( null );
	const [ liftedId, setLiftedId ] = useState( null );
	const [ drag, setDrag ] = useState( null );
	const [ nativeDirty, setNativeDirty ] = useState( false );
	const [ nativeVersion, setNativeVersion ] = useState( 0 );
	const [ announcement, setAnnouncement ] = useState( '' );
	const [ openGap, setOpenGap ] = useState( null );
	// The bar's View menu, held here so it and an inserter cannot both be open.
	const [ menuOpen, setMenuOpen ] = useState( false );
	const [ validationErrors, setValidationErrors ] = useState( [] );
	const [ recovery, setRecovery ] = useState( { state: 'loading', payload: null, key: null } );
	const [ lockFailure, setLockFailure ] = useState( null );

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
	const recoveryId = recoveryRecordId( config.currentUserId, config.postId );
	const recoveryPayload = () => ( { content: controller.serialize(), fields: nativeFormValues( document.getElementById( 'post' ) ), savedMarker: config.saveMarker, createdAt: Date.now() } );
	const persistRecovery = async () => {
		if ( ! recovery.key || !( controller.dirty || nativeDirty ) ) return;
		try {
			const payload = recoveryPayload();
			const encrypted = await encryptRecovery( payload, recovery.key );
			await writeRecovery( { id: recoveryId, createdAt: payload.createdAt, ...encrypted } );
		} catch ( error ) {
			window.dispatchEvent( new CustomEvent( 'herd:recovery-diagnostic', { detail: { type: 'recovery-write-failed', error: String( error ) } } ) );
		}
	};

	useEffect( syncContent, [ generation ] );

	/* Recovery key retrieval is authenticated and the document never leaves this
	 * browser: only ciphertext is committed to IndexedDB. */
	useEffect( () => {
		let alive = true;
		(async () => {
			try {
				const body = new URLSearchParams( { action: 'herd_editor_get_recovery_key', nonce: config.recoveryNonce || '', postId: String( config.postId ) } );
				const response = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body } );
				const result = await response.json();
				if ( ! result?.success ) throw new Error( 'Recovery key was rejected.' );
				const key = await encryptionKey( result.data.key );
				if ( config.successfulSave ) await deleteRecovery( recoveryId );
				const record = config.successfulSave ? null : await readRecovery( recoveryId );
				const payload = record ? await decryptRecovery( record, key ) : null;
				if ( ! alive ) return;
				const newer = payload && Number( payload.createdAt ) > Number( config.saveMarker || 0 ) * 1000;
				setRecovery( { state: newer ? 'available' : 'ready', payload: newer ? payload : null, key } );
			} catch ( error ) {
				if ( alive ) setRecovery( { state: 'ready', payload: null, key: null } );
			}
		})();
		return () => { alive = false; };
	}, [] );

	useEffect( () => {
		if ( recovery.state !== 'ready' || ! recovery.key ) return undefined;
		const timer = window.setTimeout( persistRecovery, 600 );
		const immediate = () => { persistRecovery(); };
		const onVisibility = () => { if ( document.visibilityState === 'hidden' ) immediate(); };
		window.addEventListener( 'pagehide', immediate );
		document.addEventListener( 'visibilitychange', onVisibility );
		return () => { window.clearTimeout( timer ); window.removeEventListener( 'pagehide', immediate ); document.removeEventListener( 'visibilitychange', onVisibility ); };
	}, [ generation, nativeDirty, nativeVersion, recovery.state, recovery.key ] );

	useEffect( () => {
		const form = document.getElementById( 'post' );
		let submitting = false;
		const changed = ( event ) => {
			if ( event.target?.id !== 'content' && ! event.target?.closest?.( '#herd-editor-root' ) ) {
				setNativeDirty( true );
				setNativeVersion( ( value ) => value + 1 );
			}
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
		const preflight = async () => {
			const token = document.getElementById( 'active_post_lock' )?.value || '';
			const body = new URLSearchParams( { action: 'herd_editor_check_post_lock', nonce: config.lockPreflightNonce || '', postId: String( config.postId ), lock: token } );
			const response = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body } );
			const result = await response.json();
			return result?.success && result.data?.valid ? null : ( result?.data?.reason || 'connection' );
		};
		const submit = ( event ) => {
			syncContent();
			if ( form?.dataset.herdPreflight !== '1' ) {
				event.preventDefault();
				persistRecovery().then( preflight ).then( ( reason ) => {
					if ( reason ) {
						setLockFailure( reason );
						window.dispatchEvent( new CustomEvent( 'herd:lock-lost', { detail: { reason } } ) );
						return;
					}
					form.dataset.herdPreflight = '1'; form.requestSubmit( event.submitter );
				} ).catch( () => setLockFailure( 'connection' ) );
				return;
			}
			delete form.dataset.herdPreflight;
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
		const onLost = ( event ) => { setLockFailure( event.detail?.reason || 'heartbeat' ); persistRecovery(); };
		window.addEventListener( 'herd:lock-lost', onLost );
		window.addEventListener( 'beforeunload', unload );
		return () => {
			form?.removeEventListener( 'input', changed );
			form?.removeEventListener( 'change', changed );
			form?.removeEventListener( 'submit', submit );
			form?.removeEventListener( 'click', click, true );
			window.removeEventListener( 'herd:lock-lost', onLost );
			window.removeEventListener( 'beforeunload', unload );
		};
		}, [ nativeDirty, recovery.key ] );

	const restoreRecovery = () => {
		if ( ! recovery.payload ) return;
		controller.history = [ parseDocument( recovery.payload.content || '' ) ];
		controller.index = 0;
		controller.cleanSource = config.postContent;
		restoreNativeFormValues( document.getElementById( 'post' ), recovery.payload.fields );
		setNativeDirty( true ); refresh(); setRecovery( ( current ) => ( { ...current, state: 'ready' } ) );
	};
	const discardRecovery = async () => { await deleteRecovery( recoveryId ); setRecovery( ( current ) => ( { ...current, state: 'ready', payload: null } ) ); };

	const toggleIn = ( setter ) => ( id ) => setter( ( current ) => {
		const next = new Set( current );
		if ( next.has( id ) ) next.delete( id ); else next.add( id );
		return next;
	} );
	const togglePanel = toggleIn( setOpenPanels );
	const toggleChildren = toggleIn( setExpandedChildren );

	const focusId = ( id ) => requestAnimationFrame( () => rowRefs.current.get( id )?.focus() );
	const focusAt = ( index ) => focusId( rows[ Math.max( 0, Math.min( index, rows.length - 1 ) ) ]?.block.clientId );
	// Inserting, duplicating and deleting rearrange the list without touching any
	// other block's data, so the forms already mounted are still correct and stay
	// exactly as the author left them.
	const mutate = ( message, callback, nextFocus = null ) => {
		callback();
		refresh();
		setAnnouncement( message );
		if ( nextFocus ) focusId( nextFocus );
	};

	/**
	 * Undo and redo swap the whole tree, so a mounted ACF form can be left showing
	 * values the document no longer holds.  Only the blocks whose attributes
	 * actually moved need fetching again; the rest keep the DOM they have, along
	 * with focus, caret, and any repeater rows the author had opened.
	 */
	const jump = ( message, callback ) => {
		const before = controller.blocks;
		callback();
		const changed = changedAttributeIds( before, controller.blocks );
		if ( changed.length ) {
			setFormVersions( ( current ) => {
				const next = { ...current };
				changed.forEach( ( id ) => { next[ id ] = ( next[ id ] || 0 ) + 1; } );
				return next;
			} );
		}
		refresh();
		setAnnouncement( message );
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
		onOpen: () => {
			setOpenGap( slot );
			setMenuOpen( false );
		},
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
				generation: formVersions[ row.block.clientId ] || 0,
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
	if ( recovery.state === 'loading' || recovery.state === 'available' ) {
		return el( 'main', { className: 'herd-editor', 'aria-label': 'Herd recovery' },
			el( Notice, { status: 'info' }, recovery.state === 'loading' ? 'Checking for a recoverable copy…' : 'A newer browser recovery copy is available. Restore it before editing this server version.' ),
			recovery.state === 'available' && el( 'p', { className: 'herd-recovery-actions' },
				el( 'button', { type: 'button', className: 'button button-primary', onClick: restoreRecovery }, 'Restore recovery copy' ),
				' ', el( 'button', { type: 'button', className: 'button', onClick: discardRecovery }, 'Discard copy' ),
				' ', el( 'button', { type: 'button', className: 'button', onClick: () => downloadRecovery( recovery.payload, config.postId ) }, 'Export copy' ) ) );
	}
	const barTools = el( BarTools, {
		dirty,
		savedLabel: config.modifiedHuman || 'saved',
		statusLabel: config.statusLabel || 'Draft',
		isPublished: !! config.isPublished,
		viewUrl: config.viewUrl || '',
		singular: config.singular || '',
		canUndo: controller.canUndo,
		canRedo: controller.canRedo,
		onUndo: () => jump( 'Change undone.', () => controller.undo() ),
		onRedo: () => jump( 'Change redone.', () => controller.redo() ),
		menuOpen,
		onMenuOpen: () => {
			setMenuOpen( true );
			setOpenGap( null );
		},
		onMenuClose: () => setMenuOpen( false ),
	} );

	return el( 'main', { className: 'herd-editor', 'aria-label': 'Herd block editor' },
		barTarget && createPortal( barTools, barTarget ),
		lockFailure && el( Notice, { status: 'error' },
			`The editing lock is no longer safe to save (${ lockFailure }). Your changes were kept in this browser. `,
			el( 'a', { href: window.location.href }, 'Reload' ), ' · ',
			document.querySelector( '#post-lock-dialog .wp-tab-last' )?.href && el( 'a', { href: document.querySelector( '#post-lock-dialog .wp-tab-last' ).href }, 'Take over' ),
			document.querySelector( '#post-lock-dialog .wp-tab-last' )?.href && ' · ',
			el( 'button', { type: 'button', className: 'button-link', onClick: restoreRecovery }, 'Restore' ), ' · ',
			el( 'button', { type: 'button', className: 'button-link', onClick: () => downloadRecovery( recoveryPayload(), config.postId ) }, 'Export' ) ),

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
			// control, so keep its menu with the document rather than over it —
			// unless the document is short enough that above is where the room
			// runs out, in which case InsertPoint drops it back down.
			preferAbove: true,
		} ) ) ),

		el( 'button', {
			type: 'button',
			className: 'herd-inserter__tail',
			onClick: () => {
				setOpenGap( named.length );
				setMenuOpen( false );
			},
		}, '+ Add block' ) );
}
