/** Herd Editor application shell: block list, structural editing, command bar. */

import { createElement, createPortal, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { adapterFor, blockMutationPolicy, canAddBlock, createAcfBlock } from '../adapters.js';
import { DocumentController } from '../controller.js';
import { changedAttributeIds, parseDocument } from '../document.js';
import { BarTools } from './CommandBar.js';
import { BlockRow } from './BlockRow.js';
import { InsertPoint } from './InsertPoint.js';
import { AcfForm, AdvancedPanel, CoreEditor, FallbackPanel } from './panels.js';
import { anchorOf, duplicateAnchors } from './anchors.js';
import { blockCounts, bodyFor, collectBlocks, iconOf, isHidden, titleFor, visibleRows } from './blocks.js';
import { dropSlot, insertPositionForSlot, moveTargetIndex, topLevelPositions, topLevelSlot } from './order.js';
import { blockSummary } from './summary.js';
import { Notice } from './primitives.js';
import { beginSave, endSave, guardBusyClicks, watchRestore } from '../save-progress.js';
import { applySaveResult, buildSaveRequest } from '../save-request.js';
import { decryptRecovery, deleteRecovery, downloadRecovery, encryptionKey, nativeFormValues, readRecovery, recoveryRecordId, restoreNativeFormValues, writeRecovery, encryptRecovery } from '../recovery.js';

const el = createElement;
const CORE_ADAPTERS = [ 'paragraph', 'heading', 'html', 'shortcode' ];

export function HerdEditorApp( { config } ) {
	const controller = useRef( new DocumentController( parseDocument( config.postContent ) ) ).current;
	const [ generation, setGeneration ] = useState( 0 );
	const [ formVersions, setFormVersions ] = useState( () => ( {} ) );
	const [ openPanels, setOpenPanels ] = useState( () => new Set() );
	// ACF forms arrive through an AJAX request and initialise third-party controls.
	// Once an author has paid that cost, keep the live form in the document while
	// its block is collapsed so reopening it is immediate. This is deliberately
	// separate from openPanels: openPanels is presentation state; visited panels
	// own the retained ACF instances and are still flushed before saving.
	const [ visitedAcfPanels, setVisitedAcfPanels ] = useState( () => new Set() );
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
	const [ recovery, setRecovery ] = useState( { payload: null, key: null } );
	const [ recoveryDismissed, setRecoveryDismissed ] = useState( false );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ lockFailure, setLockFailure ] = useState( null );

	const rowRefs = useRef( new Map() );
	const mountedAcfForms = useRef( new Set() );
	/* Held in a ref as well as state so the submit handler can persist a recovery
	 * copy without listing the key as a dependency and re-binding every listener. */
	const recoveryKeyRef = useRef( null );
	const savedTimer = useRef( null );
	// What core sent, captured on before-autosave so the response can be trusted against it.
	const autosavingContent = useRef( null );
	const rows = useMemo( () => visibleRows( controller.blocks, expandedChildren ), [ generation, expandedChildren ] );
	const dirty = controller.dirty || nativeDirty;
	const counts = blockCounts( controller.blocks );
	const named = topLevelPositions( controller.blocks );
	/* Whole-document, because a clash is only visible from outside the two blocks
	 * that have it: neither one can tell it is the second. */
	const duplicateIds = useMemo( () => duplicateAnchors( controller.blocks ), [ generation ] );

	const refresh = () => setGeneration( ( value ) => value + 1 );
	const syncContent = () => {
		const content = document.getElementById( 'content' );
		if ( content ) content.value = controller.serialize();
	};
	const registerAcfForm = ( bridge, previous ) => {
		if ( previous ) mountedAcfForms.current.delete( previous );
		if ( bridge ) mountedAcfForms.current.add( bridge );
	};
	const flushAcfForms = () => mountedAcfForms.current.forEach( ( bridge ) => bridge.flush() );
	/*
	 * Every submission gets the treatment, and it gets it on the first
	 * interception rather than the last. What Save draft used to be given at pass
	 * three -- after the preflight had already been and gone -- is what Publish
	 * needs at pass one, in front of two round trips it cannot see the far side of.
	 */
	const markSaving = ( submitter ) => {
		const intent = beginSave( submitter );
		if ( ! intent ) return;
		/* Nothing suspends core's autosave when the form is submitted, and an
		 * autosave landing mid-publish would walk the bar through "Autosaving",
		 * "Saved" and finally "unsaved changes" while the save it is talking over is
		 * still in flight. Two of those three would be untrue. */
		window.wp?.autosave?.server?.suspend?.();
		setSaveState( intent.saveState );
	};
	const recoveryId = recoveryRecordId( config.currentUserId, config.postId );
	const recoveryPayload = () => ( { content: controller.serialize(), fields: nativeFormValues( document.getElementById( 'post' ) ), savedMarker: config.saveMarker, createdAt: Date.now() } );
	const persistRecovery = async () => {
		if ( ! recoveryKeyRef.current || !( controller.dirty || nativeDirty ) ) return;
		try {
			const payload = recoveryPayload();
			const encrypted = await encryptRecovery( payload, recoveryKeyRef.current );
			await writeRecovery( { id: recoveryId, createdAt: payload.createdAt, ...encrypted } );
		} catch ( error ) {
			window.dispatchEvent( new CustomEvent( 'herd:recovery-diagnostic', { detail: { type: 'recovery-write-failed', error: String( error ) } } ) );
		}
	};

	useEffect( syncContent, [ generation ] );

	/* The document never leaves this browser: only ciphertext is committed to
	 * IndexedDB. The key arrives inline in config, so nothing here touches the
	 * network -- and nothing here gates a paint. The editor renders from
	 * config.postContent on the first frame and this resolves behind it, exactly
	 * as core's local-autosave monitor does. */
	useEffect( () => {
		let alive = true;
		(async () => {
			try {
				if ( ! config.recoveryKey ) throw new Error( 'No recovery key was supplied.' );
				const key = await encryptionKey( config.recoveryKey );
				recoveryKeyRef.current = key;
				if ( ! alive ) return;
				setRecovery( ( current ) => ( { ...current, key } ) );
				/* A confirmed native save supersedes any copy this browser held. */
				if ( config.successfulSave ) {
					await deleteRecovery( recoveryId );
					return;
				}
				const record = await readRecovery( recoveryId );
				const payload = record ? await decryptRecovery( record, key ) : null;
				if ( ! alive || ! payload ) return;
				if ( Number( payload.createdAt ) > Number( config.saveMarker || 0 ) * 1000 ) {
					setRecovery( ( current ) => ( { ...current, payload } ) );
				}
			} catch ( error ) {
				window.dispatchEvent( new CustomEvent( 'herd:recovery-diagnostic', { detail: { type: 'recovery-read-failed', error: String( error ) } } ) );
			}
		})();
		return () => { alive = false; };
	}, [] );

	useEffect( () => {
		if ( ! recovery.key ) return undefined;
		const timer = window.setTimeout( persistRecovery, 600 );
		const immediate = () => { persistRecovery(); };
		const onVisibility = () => { if ( document.visibilityState === 'hidden' ) immediate(); };
		window.addEventListener( 'pagehide', immediate );
		document.addEventListener( 'visibilitychange', onVisibility );
		return () => { window.clearTimeout( timer ); window.removeEventListener( 'pagehide', immediate ); document.removeEventListener( 'visibilitychange', onVisibility ); };
	}, [ generation, nativeDirty, nativeVersion, recovery.key ] );

	/*
	 * Say that an autosave happened.
	 *
	 * Core autosaves quietly -- it fires these two jQuery events and nothing else
	 * -- so without this the bar goes on reading "unsaved changes" while the
	 * server already has the document. The block editor answers the same question
	 * with PostSavedState: it names an autosave rather than lumping it in with a
	 * deliberate save, and it holds "Saved" open for a second afterwards, because
	 * an autosave that resolves quickly would otherwise flash past unread.
	 *
	 * after-autosave fires on every response, success or not (autosave.js:671
	 * sits above the data.success check), so success is tested here rather than
	 * assumed. An autosave of a draft is a real save of title and content, and
	 * marking the document clean against exactly what was sent is what stops the
	 * bar claiming unsaved changes for work that is on the server. It says nothing
	 * about the meta boxes: ACF ignores a post without its own nonce, so those
	 * edits are still unsaved and nativeDirty still speaks for them.
	 */
	useEffect( () => {
		const $ = window.jQuery;
		if ( ! $ ) return undefined;
		const doc = $( document );
		const onBefore = ( event, postData ) => {
			autosavingContent.current = postData?.content ?? null;
			window.clearTimeout( savedTimer.current );
			setSaveState( 'autosaving' );
		};
		const onAfter = ( event, data ) => {
			const sent = autosavingContent.current;
			autosavingContent.current = null;
			if ( ! data?.success ) {
				setSaveState( 'idle' );
				return;
			}
			if ( sent !== null ) {
				controller.cleanSource = sent;
				refresh();
			}
			setSaveState( 'saved' );
			savedTimer.current = window.setTimeout( () => setSaveState( 'idle' ), 1000 );
		};
		doc.on( 'before-autosave.herd-savestate', onBefore );
		doc.on( 'after-autosave.herd-savestate', onAfter );
		return () => {
			doc.off( '.herd-savestate' );
			window.clearTimeout( savedTimer.current );
		};
	}, [] );

	/*
	 * The three things about a save in flight that App does not own the events
	 * for: a second press while it is running, a page handed back by the browser
	 * still wearing one, and a rejection raised outside React -- publish-box.js
	 * refusing an impossible date. All of them tear down through one event, so
	 * there is a single place the bar comes back to rest.
	 */
	useEffect( () => {
		const ended = () => {
			setSaveState( 'idle' );
			/* Balances the suspend in markSaving() -- but not when the lock is what
			 * ended the save. post-lock.js suspends autosave deliberately at that
			 * point, so that a browser which no longer owns the post cannot go on
			 * writing revisions to it, and resuming here would undo it. */
			if ( ! document.getElementById( 'post' )?.classList.contains( 'herd-lock-lost' ) ) {
				window.wp?.autosave?.server?.resume?.();
			}
		};
		window.addEventListener( 'herd:save-ended', ended );
		const stopGuard = guardBusyClicks();
		const stopRestore = watchRestore();
		return () => {
			window.removeEventListener( 'herd:save-ended', ended );
			stopGuard();
			stopRestore();
		};
	}, [] );

	useEffect( () => {
		const form = document.getElementById( 'post' );
		const changed = ( event ) => {
			if ( event.target?.id !== 'content' && ! event.target?.closest?.( '#herd-editor-root' ) ) {
				setNativeDirty( true );
				setNativeVersion( ( value ) => value + 1 );
			}
		};
		/*
		 * Where the wait goes, so the next person to ask does not have to guess.
		 *
		 * Nothing here changes what is saved. A publish used to cost three
		 * sequential admin bootstraps -- the lock and validation preflight, the
		 * post to post.php, then the full render of the screen it redirected to --
		 * and only the last of those was ever the point. It is one now. Same shape
		 * as post-lock.js's diagnostics: an event, for anything that wants to listen.
		 */
		const report = ( step, started ) => window.dispatchEvent( new CustomEvent( 'herd:save-timing', { detail: { step, ms: Math.round( performance.now() - started ) } } ) );

		/*
		 * A save, without leaving the page it was made on.
		 *
		 * The lock check, the ACF validation and the write are one request now
		 * (herd_editor_ajax_save_post), so this reads the three answers off one
		 * reply rather than racing two round trips in front of a third. The
		 * branches they land in are the same ones they always had.
		 */
		const save = async ( submitter ) => {
			/* The document the sweep and the recovery record are about to read is
			 * this one, so the open panel's values have to be in it first. An edit
			 * that reached the DOM without an event the bridge heard would
			 * otherwise be saved as the value it replaced. */
			flushAcfForms();
			syncContent();
			/*
			 * The baseline for "clean", captured now rather than when the reply
			 * lands. What is being saved is this, and an edit made while the
			 * request is in flight has not been saved and must still read as
			 * dirty afterwards. Comparing against a fresh serialize() on success
			 * would quietly call that edit saved and lose it.
			 */
			const snapshot = controller.serialize();
			await persistRecovery();

			const pressed = performance.now();
			const ids = collectBlocks( controller.blocks ).filter( ( block ) => block.name?.startsWith( 'acf/' ) ).map( ( block ) => block.clientId );
			let payload;
			try {
				/* No Content-Type header: FormData has to set its own, boundary
				 * and all, and naming one here produces a body nothing can parse. */
				const response = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', body: buildSaveRequest( form, submitter, ids ) } );
				payload = await response.json();
			} catch ( error ) {
				/*
				 * A dropped connection, or a body that is not JSON -- which is what
				 * an unanticipated wp_die() on the far side looks like from here.
				 * The document stays dirty and the recovery record stays written;
				 * this is exactly the case it exists for.
				 */
				report( 'save', pressed );
				endSave();
				setAnnouncement( 'The save did not complete. Your changes are still here and have been backed up in this browser.' );
				return;
			}
			report( 'save', pressed );

			if ( ! payload?.success ) {
				endSave();
				setAnnouncement( payload?.data?.message || 'The save did not complete.' );
				return;
			}

			const result = payload.data || {};
			/* A lost lock outranks a failed field. The save cannot happen at all,
			 * so there is nothing useful to say about its contents. */
			if ( result.lock ) {
				endSave();
				setLockFailure( result.lock );
				window.dispatchEvent( new CustomEvent( 'herd:lock-lost', { detail: { reason: result.lock } } ) );
				return;
			}
			if ( result.errors?.length ) {
				endSave();
				setValidationErrors( result.errors );
				const first = result.errors[ 0 ];
				if ( first.blockId ) { setOpenPanels( ( current ) => new Set( current ).add( first.blockId ) ); focusId( first.blockId ); }
				setAnnouncement( `Publishing blocked: ${ result.errors.length } ACF validation ${ result.errors.length === 1 ? 'error' : 'errors' } need attention.` );
				return;
			}
			if ( ! result.ok ) {
				/* _wp_translate_postdata() refusing the post data: an impossible
				 * publish date, or a publish by somebody without the capability. */
				endSave();
				setAnnouncement( result.message || 'The save did not complete.' );
				return;
			}

			setValidationErrors( [] );
			controller.cleanSource = snapshot;
			setNativeDirty( false );
			applySaveResult( result );
			/*
			 * The boot blob is what the command bar and the recovery comparison
			 * read, and it was written for a screen that would be thrown away
			 * before any of it went stale. It does not get thrown away now.
			 */
			Object.assign( config, {
				postId: result.postId,
				saveMarker: result.saveMarker,
				statusLabel: result.statusLabel,
				modifiedHuman: result.modifiedHuman,
				isPublished: result.isPublished,
				viewUrl: result.viewUrl,
				permalink: result.permalink,
			} );
			/* What config.successfulSave used to do on the way back in. The record
			 * is deleted only on a save the server has confirmed -- doing it in a
			 * finally, or before the reply, would throw away the copy that exists
			 * precisely because a save can fail. */
			try {
				await deleteRecovery( recoveryRecordId( config.currentUserId, result.postId ) );
			} catch ( error ) {
				// A backup that outlives its save is harmless; it is compared by date.
			}
			/* The publish box, the saved notice and the lock watchdog are all
			 * wired outside this component. Importing them would drag them into
			 * the bundle graph and cost them the plain-node tests they are written
			 * to have, so they hear about a save the same way they hear about a
			 * lost lock. */
			window.dispatchEvent( new CustomEvent( 'herd:saved', { detail: result } ) );
			endSave();
			setSaveState( 'saved' );
			window.clearTimeout( savedTimer.current );
			savedTimer.current = window.setTimeout( () => setSaveState( 'idle' ), 1000 );
			refresh();
		};

		const submit = ( event ) => {
			// A prior native listener (invalid date, lost lock) has rejected this
			// submission. It must not start another save or a saving treatment.
			if ( event.defaultPrevented ) return;
			/*
			 * Always. There is no pass that reaches the browser's own submission
			 * any more -- the form is posted by fetch and the page stays where it
			 * is, which is the whole point of this.
			 */
			event.preventDefault();
			/* A second press while one is running is the thing this is for, and it
			 * is any second press: Save draft while a publish is in flight would
			 * otherwise start a whole parallel save of its own. */
			if ( document.querySelector( '[data-herd-busy]' ) ) return;
			/* Before the request, not after it. An indicator that appeared once the
			 * reply had landed would be on screen only for the part that was never
			 * slow -- and markSaving() has to run before buildSaveRequest(), because
			 * the hidden marker it leaves behind is what carries the pressed
			 * button's name into a FormData that would not otherwise have it. */
			markSaving( event.submitter );
			/*
			 * Nothing above returns a promise anybody waits on, so a rejection
			 * that escaped save() would be silent -- and the visible half of that
			 * is a button left reading "Publishing…" with no save behind it and no
			 * second press possible, because guardBusyClicks() swallows those. The
			 * treatment has to come off whatever happened.
			 */
			save( event.submitter ).catch( ( error ) => {
				endSave();
				setAnnouncement( 'The save did not complete. Your changes are still here.' );
				window.dispatchEvent( new CustomEvent( 'herd:recovery-diagnostic', { detail: { type: 'save-failed', error: String( error ) } } ) );
			} );
		};
		const click = () => syncContent();
		/*
		 * No exemption for a save in progress any more. A save used to be a
		 * navigation this guard had to be told to let through; now it never
		 * leaves the page, and the only thing left that unloads a dirty document
		 * is somebody going somewhere -- Preview, Trash, the editor switcher, the
		 * back arrow -- which is precisely what should be asked about.
		 */
		const unload = ( event ) => {
			if ( controller.dirty || nativeDirty ) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		form?.addEventListener( 'input', changed );
		form?.addEventListener( 'change', changed );
		form?.addEventListener( 'submit', submit );
		form?.addEventListener( 'click', click, true );
		const onLost = ( event ) => { endSave(); setLockFailure( event.detail?.reason || 'heartbeat' ); persistRecovery(); };
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
		}, [ nativeDirty ] );

	const restoreRecovery = () => {
		if ( ! recovery.payload ) return;
		controller.history = [ parseDocument( recovery.payload.content || '' ) ];
		controller.index = 0;
		controller.cleanSource = config.postContent;
		restoreNativeFormValues( document.getElementById( 'post' ), recovery.payload.fields );
		setNativeDirty( true ); refresh(); setRecovery( ( current ) => ( { ...current, payload: null } ) );
	};
	const discardRecovery = async () => { await deleteRecovery( recoveryId ); setRecovery( ( current ) => ( { ...current, payload: null } ) ); };

	const toggleIn = ( setter ) => ( id ) => setter( ( current ) => {
		const next = new Set( current );
		if ( next.has( id ) ) next.delete( id ); else next.add( id );
		return next;
	} );
	const togglePanel = ( id, retainAcfForm = false ) => {
		/* A block can only be collapsed after it has been opened, so marking every
		 * toggle as visited avoids coordinating two state updaters merely to learn
		 * which direction this press took. */
		if ( retainAcfForm ) setVisitedAcfPanels( ( current ) => current.has( id ) ? current : new Set( current ).add( id ) );
		toggleIn( setOpenPanels )( id );
	};
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
		setVisitedAcfPanels( ( current ) => new Set( [ ...current, ...all.filter( ( block ) => adapterFor( block, config.blockTypes[ block.name ] || {} ).id === 'acf' ).map( ( block ) => block.clientId ) ] ) );
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
				getData: () => controller.find( row.block.clientId )?.attributes?.data || {},
				onBridgeMount: registerAcfForm,
				onAttributes: ( attributes ) => {
					controller.replaceAttributes( row.block.clientId, attributes );
					/* The sweep's verdict was about the values this edit has just
					 * replaced. Left on screen beside a field that now holds an image,
					 * it goes on saying the field is empty. */
					setValidationErrors( ( current ) => current.some( ( error ) => error.blockId === row.block.clientId )
						? current.filter( ( error ) => error.blockId !== row.block.clientId )
						: current );
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
		saveState,
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
		/* Offered, never imposed: the server version below is fully editable while
		 * this stands, and restoring is always an explicit click. */
		recovery.payload && ! recoveryDismissed && el( Notice, { status: 'warning' },
			`The backup of this ${ config.singular || 'document' } in your browser is different from the version below. `,
			el( 'span', { className: 'herd-recovery-actions' },
				el( 'button', { type: 'button', className: 'button button-primary', onClick: restoreRecovery }, 'Restore the backup' ),
				el( 'button', { type: 'button', className: 'button', onClick: discardRecovery }, 'Discard' ),
				el( 'button', { type: 'button', className: 'button', onClick: () => downloadRecovery( recovery.payload, config.postId ) }, 'Export' ),
				el( 'button', { type: 'button', className: 'button-link', onClick: () => setRecoveryDismissed( true ) }, 'Dismiss' ) ) ),
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
			const anchor = anchorOf( block );
			const retainAcfForm = adapter.id === 'acf' && visitedAcfPanels.has( block.clientId );
			const renderPanel = openPanels.has( block.clientId ) || retainAcfForm;

			const blockRow = el( BlockRow, {
				key: block.clientId,
				block,
				depth: row.ancestors.length,
				title,
				summary: blockSummary( block, adapter.id, bodyFor( block ) ),
				icon: iconOf( metadata ),
				badge: adapter.editable ? null : ( metadata.readOnly ? 'Open in Block Editor' : ( metadata.registered ? 'Read only' : 'Unsupported' ) ),
				hidden: isHidden( block ),
				warning: duplicateIds.has( anchor ) ? 'Duplicate anchor' : null,
				isOpen: openPanels.has( block.clientId ),
				keepBodyMounted: retainAcfForm,
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
				onToggle: () => togglePanel( block.clientId, adapter.id === 'acf' ),
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
			}, ...( renderPanel
				? [
					panelFor( row, adapter ),
					// Read-only blocks are handed to the Block Editor whole, and a block
					// type that does not support an anchor would never render one.
					openPanels.has( block.clientId ) && adapter.editable && metadata.anchor
						? el( AdvancedPanel, {
							key: 'advanced',
							block,
							permalink: config.permalink || config.viewUrl || '',
							isDuplicate: duplicateIds.has( anchor ),
							onAnchor: ( value ) => {
								controller.replaceAttributes( block.clientId, { anchor: value } );
								refresh();
							},
						} )
						: null,
				]
				: [] ) );

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
