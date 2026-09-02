/** Herd Editor application shell: block list, structural editing, command bar. */

import { createElement, createPortal, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { adapterFor, blockMutationPolicy, canAddBlock, createAcfBlock } from '../adapters.js';
import { DocumentController } from '../controller.js';
import { changedAttributeIds, ensureStructuralIds, parseDocument } from '../document.js';
import { BarTools } from './CommandBar.js';
import { BlockRow } from './BlockRow.js';
import { InsertPoint } from './InsertPoint.js';
import { AcfForm, AdvancedPanel, CoreEditor, FallbackPanel } from './panels.js';
import { anchorOf, duplicateAnchors } from './anchors.js';
import { blockCounts, bodyFor, collectBlocks, iconOf, isHidden, titleFor, visibleRows } from './blocks.js';
import { dropSlot, insertPositionForSlot, moveDestinations, moveTargetIndex, topLevelPositions, topLevelSlot } from './order.js';
import { blockSummary } from './summary.js';
import { searchRows } from './search.js';
import { outlineRows } from './outline-data.js';
import { DocumentOutline } from './DocumentOutline.js';
import { MoveDialog } from './MoveDialog.js';
import { PreviewDrawer } from './PreviewDrawer.js';
import { CommandPalette } from './CommandPalette.js';
import { DuplicationDialog } from './DuplicationDialog.js';
import { createCommandRegistry } from './commands.js';
import { Notice } from './primitives.js';
import { FormLifecycle } from './form-lifecycle.js';
import { anyDirty, clearMatchingDomains, dirtyDomainFor, emptyDirtyDomains, markDomain } from './dirty-domains.js';
import { promoteRecent } from './inserter-preferences.js';
import { beginSave, endSave, guardBusyClicks, settleSave, watchRestore } from '../save-progress.js';
import { applySaveResult, buildSaveRequest, classifySaveResult } from '../save-request.js';
import { decryptRecovery, deleteRecovery, downloadRecovery, encryptionKey, nativeFormValues, readRecovery, recoveryRecordId, restoreNativeFormValues, writeRecovery, encryptRecovery } from '../recovery.js';
import { normalizeEditorialResults, validateEditorialDocument } from './editorial-validation.js';
import { duplicationProfile } from '../duplication.js';

const el = createElement;
const CORE_ADAPTERS = [ 'paragraph', 'heading', 'html', 'shortcode' ];
/* How long the button wears the answer before going back to naming its action. */
const SETTLE_MS = 2000;

export function HerdEditorApp( { config } ) {
	/* IDs are saved with ACF blocks, giving the server a stable identity even
	 * when two blocks have identical fields. */
	const controller = useRef( new DocumentController( ensureStructuralIds( parseDocument( config.postContent ) ) ) ).current;
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
	const [ dirtyDomains, setDirtyDomains ] = useState( emptyDirtyDomains );
	const [ nativeVersion, setNativeVersion ] = useState( 0 );
	const [ favorites, setFavorites ] = useState( () => config.favoriteBlockNames || [] );
	const [ recent, setRecent ] = useState( () => {
		try { return JSON.parse( window.localStorage.getItem( 'herd-editor-recent-blocks' ) || '[]' ); } catch { return []; }
	} );
	const [ announcement, setAnnouncement ] = useState( '' );
	const [ openGap, setOpenGap ] = useState( null );
	// The bar's View menu, held here so it and an inserter cannot both be open.
	const [ menuOpen, setMenuOpen ] = useState( false );
	const [ validationErrors, setValidationErrors ] = useState( () => validateEditorialDocument( controller.blocks, config ) );
	// Derived checks can be visible on rows at any time; this records that a save
	// was actually stopped, so the page-level outcome is not noisy while editing.
	const [ validationBlocked, setValidationBlocked ] = useState( false );
	const [ recovery, setRecovery ] = useState( { payload: null, key: null } );
	const [ recoveryDismissed, setRecoveryDismissed ] = useState( false );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ lockFailure, setLockFailure ] = useState( null );
	/* Only the failures that had nowhere to go. Validation renders against the
	 * fields it belongs to and a lost lock has its own banner; either one here
	 * would be the same failure said twice. */
	const [ saveError, setSaveError ] = useState( null );
	const [ search, setSearch ] = useState( '' );
	const [ movingId, setMovingId ] = useState( null );
	const [ preview, setPreview ] = useState( null );
	const [ commandPaletteOpen, setCommandPaletteOpen ] = useState( false );
	const [ duplicationReview, setDuplicationReview ] = useState( null );

	const rowRefs = useRef( new Map() );
	const searchRef = useRef( null );
	const searchOrigin = useRef( null );
	const mountedAcfForms = useRef( new Set() );
	const formLifecycle = useRef( new FormLifecycle( { diagnostic: ( detail ) => window.dispatchEvent( new CustomEvent( 'herd:form-lifecycle', { detail } ) ) } ) ).current;
	/* Held in a ref as well as state so the submit handler can persist a recovery
	 * copy without listing the key as a dependency and re-binding every listener. */
	const recoveryKeyRef = useRef( null );
	const savedTimer = useRef( null );
	/* What Try again should press. The two save controls do different things, and a
	 * retry that guessed at Publish after a failed draft save would publish. */
	const retrySubmitter = useRef( null );
	// What core sent, captured on before-autosave so the response can be trusted against it.
	const autosavingContent = useRef( null );
	const normalRows = useMemo( () => visibleRows( controller.blocks, expandedChildren ), [ generation, expandedChildren ] );
	const duplicateIds = useMemo( () => duplicateAnchors( controller.blocks ), [ generation ] );
	const movingBlock = movingId ? controller.find( movingId ) : null;
	/* A destination previews the block it names, so it needs that block's summary as well as its title. */
	const describeBlock = ( id ) => {
		const block = controller.find( id );
		if ( ! block ) return { title: '', summary: '' };
		return { title: titleFor( block, config.blockTypes ), summary: blockSummary( block, adapterFor( block, config.blockTypes ).id, bodyFor( block ) ) };
	};
	const destinations = useMemo( () => movingId ? moveDestinations( controller.blocks, movingId, describeBlock ) : [], [ generation, movingId ] );
	const rows = useMemo( () => search ? searchRows( controller.blocks, search, config.blockTypes, { acfFields: config.acfFields, validationErrors, duplicateIds } ) : normalRows, [ generation, normalRows, search, validationErrors, duplicateIds ] );
	const outline = useMemo( () => outlineRows( controller.blocks, config.blockTypes ), [ generation ] );
	const dirty = controller.dirty || anyDirty( dirtyDomains );
	useEffect( () => {
		window.dispatchEvent( new CustomEvent( 'herd:dirty-domains', { detail: dirtyDomains } ) );
	}, [ dirtyDomains ] );
	const counts = blockCounts( controller.blocks );
	const named = topLevelPositions( controller.blocks );
	const movingPosition = movingId ? topLevelSlot( controller.blocks, movingId ) + 1 : 0;

	// Editorial results are derived state. Recalculate after structural or field edits;
	// server preflight adds authoritative ACF/site-policy results before publishing.
	useEffect( () => {
		setValidationErrors( ( current ) => [ ...current.filter( ( result ) => result.ruleId === 'acf' || result.ruleId === 'editorial-server' ), ...validateEditorialDocument( controller.blocks, config ) ] );
	}, [ generation ] );

	useEffect( () => {
		const onKeyDown = ( event ) => {
			if ( event.key !== '/' || event.defaultPrevented ) return;
			if ( event.target?.matches?.( 'input, textarea, select, [contenteditable="true"]' ) ) return;
			event.preventDefault();
			searchRef.current?.focus();
		};
		window.addEventListener( 'keydown', onKeyDown );
		return () => window.removeEventListener( 'keydown', onKeyDown );
	}, [] );
	useEffect( () => {
		const onKeyDown = ( event ) => {
			if ( event.defaultPrevented || !( event.metaKey || event.ctrlKey ) || event.key.toLowerCase() !== 'k' ) return;
			event.preventDefault();
			setCommandPaletteOpen( true );
		};
		window.addEventListener( 'keydown', onKeyDown );
		return () => window.removeEventListener( 'keydown', onKeyDown );
	}, [] );

	useEffect( () => {
		if ( !movingId ) return undefined;
		const inactive = [ document.getElementById( 'herd-editor-root' ), document.getElementById( 'herd-rail' ) ].filter( Boolean );
		inactive.forEach( ( node ) => { node.inert = true; node.setAttribute( 'aria-hidden', 'true' ); } );
		return () => inactive.forEach( ( node ) => { node.inert = false; node.removeAttribute( 'aria-hidden' ); } );
	}, [ movingId ] );

	const refresh = () => setGeneration( ( value ) => value + 1 );
	const syncContent = () => {
		const serialized = controller.serialize();
		const content = document.getElementById( 'content' );
		if ( content ) content.value = serialized;
		return serialized;
	};
	const evictForms = ( ids ) => {
		if ( !ids.length ) return;
		setVisitedAcfPanels( ( current ) => new Set( [ ...current ].filter( ( id ) => !ids.includes( id ) ) ) );
	};
	const registerAcfForm = ( id, bridge, previous ) => {
		if ( previous ) mountedAcfForms.current.delete( previous );
		if ( bridge ) mountedAcfForms.current.add( bridge );
		if ( previous ) formLifecycle.unregister( id, previous );
		if ( bridge ) evictForms( formLifecycle.register( id, bridge, { open: openPanels.has( id ), validation: validationErrors.some( ( error ) => error.blockId === id ) } ) );
	};
	const flushAcfForms = () => mountedAcfForms.current.forEach( ( bridge ) => bridge.flush() );
	/*
	 * Every submission gets the treatment, and it gets it on the first
	 * interception rather than the last. What Save draft used to be given at pass
	 * three -- after the preflight had already been and gone -- is what Publish
	 * needs at pass one, in front of two round trips it cannot see the far side of.
	 */
	const markSaving = ( submitter ) => {
		/* Before beginSave(), because a confirmation still counting down would
		 * otherwise fire endSave() partway through this save and take the treatment
		 * off a button that is very much still working. */
		window.clearTimeout( savedTimer.current );
		const intent = beginSave( submitter );
		if ( ! intent ) return;
		retrySubmitter.current = submitter;
		setSaveError( null );
		/* Nothing suspends core's autosave when the form is submitted, and an
		 * autosave landing mid-publish would walk the bar through "Autosaving",
		 * "Saved" and finally "unsaved changes" while the save it is talking over is
		 * still in flight. Two of those three would be untrue. */
		window.wp?.autosave?.server?.suspend?.();
		setSaveState( intent.saveState );
	};
	/*
	 * How a save ends: the answer on the button that asked it, and then, a beat
	 * later, a button again. Two seconds is long enough to be read by somebody whose
	 * eyes were on the document rather than on the bar, and short enough that the
	 * control is naming its action again before anybody wants to press it -- and a
	 * press inside the window starts a new save regardless, because settleSave()
	 * takes the busy state off as it lands.
	 *
	 * endSave() is what dispatches herd:save-ended, so the command bar still comes
	 * to rest in exactly one place rather than on a timer of its own.
	 */
	const settle = ( outcome ) => {
		settleSave( outcome );
		window.clearTimeout( savedTimer.current );
		savedTimer.current = window.setTimeout( () => endSave(), SETTLE_MS );
	};
	/* A failure a sighted user can see. The announcement stays as well: the notice
	 * carries no role of its own, so this is still one announcement per outcome. */
	const failSave = ( message ) => {
		setSaveError( message );
		setAnnouncement( message );
	};
	/* A press rather than form.requestSubmit(): pressing the control is what every
	 * other listener on this form is written against, publish-box.js's date
	 * rejection included, and it is what the user would have done anyway. */
	const retrySave = () => {
		setSaveError( null );
		retrySubmitter.current?.click();
	};
	const recoveryId = recoveryRecordId( config.currentUserId, config.postId );
	const recoveryPayload = () => ( { content: controller.serialize(), fields: nativeFormValues( document.getElementById( 'post' ) ), savedMarker: config.saveMarker, createdAt: Date.now() } );
	const persistRecovery = async () => {
		if ( ! recoveryKeyRef.current || !( controller.dirty || anyDirty( dirtyDomains ) ) ) return;
		try {
			const payload = recoveryPayload();
			const encrypted = await encryptRecovery( payload, recoveryKeyRef.current );
			await writeRecovery( { id: recoveryId, createdAt: payload.createdAt, ...encrypted } );
		} catch ( error ) {
			window.dispatchEvent( new CustomEvent( 'herd:recovery-diagnostic', { detail: { type: 'recovery-write-failed', error: String( error ) } } ) );
		}
	};

	/* Keep core's hidden content field current without serializing the whole
	 * document on every keystroke. Saves still call syncContent synchronously. */
	useEffect( () => {
		const timer = window.setTimeout( syncContent, 250 );
		return () => window.clearTimeout( timer );
	}, [ generation ] );

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
		const timer = window.setTimeout( persistRecovery, 1500 );
		const immediate = () => { flushAcfForms(); syncContent(); persistRecovery(); };
		const onVisibility = () => { if ( document.visibilityState === 'hidden' ) immediate(); };
		window.addEventListener( 'pagehide', immediate );
		document.addEventListener( 'visibilitychange', onVisibility );
		return () => { window.clearTimeout( timer ); window.removeEventListener( 'pagehide', immediate ); document.removeEventListener( 'visibilitychange', onVisibility ); };
	}, [ generation, dirtyDomains, nativeVersion, recovery.key ] );

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
			/* Core builds its autosave body independently of hidden custom fields.
			 * Flush any pending text input into both that body and #content, then mark
			 * it as Herd-originated so server normalization remains scoped. */
			flushAcfForms();
			const content = syncContent();
			if ( postData ) {
				postData.content = content;
				postData['herd-editor'] = 1;
			}
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
				setDirtyDomains( ( current ) => markDomain( current, dirtyDomainFor( event.target ) ) );
				const panel = event.target?.closest?.( '.herd-rail__panel' );
				if ( panel?.dataset.panel ) window.dispatchEvent( new CustomEvent( 'herd:rail-tab-dirty', { detail: { tab: panel.dataset.panel } } ) );
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
			const domainSnapshot = { ...dirtyDomains };
			await persistRecovery();

			const pressed = performance.now();
			const ids = collectBlocks( controller.blocks ).map( ( block ) => block.clientId );
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
				settle( 'failed' );
				failSave( 'The save did not complete. Your changes are still here and have been backed up in this browser.' );
				return;
			}
			report( 'save', pressed );

			if ( ! payload?.success ) {
				settle( 'failed' );
				failSave( payload?.data?.message || 'The save did not complete.' );
				return;
			}

			const result = payload.data || {};
			const resultType = classifySaveResult( result );
			/* A lost lock outranks a failed field. The save cannot happen at all,
			 * so there is nothing useful to say about its contents. */
			if ( resultType === 'lock' ) {
				endSave();
				setLockFailure( result.lock );
				window.dispatchEvent( new CustomEvent( 'herd:lock-lost', { detail: { reason: result.lock } } ) );
				return;
			}
			if ( resultType === 'validation' ) {
				settle( 'failed' );
				setValidationErrors( normalizeEditorialResults( result.errors ) );
				setValidationBlocked( true );
				const first = result.errors[ 0 ];
				if ( first.blockId ) { setOpenPanels( ( current ) => new Set( current ).add( first.blockId ) ); focusId( first.blockId ); }
				setAnnouncement( `Publishing blocked: ${ result.errors.length } ACF validation ${ result.errors.length === 1 ? 'error' : 'errors' } need attention.` );
				return;
			}
			if ( resultType === 'failure' ) {
				/* _wp_translate_postdata() refusing the post data: an impossible
				 * publish date, or a publish by somebody without the capability. */
				settle( 'failed' );
				failSave( result.message || 'The save did not complete.' );
				return;
			}

			setValidationErrors( [] );
			setValidationBlocked( false );
			controller.cleanSource = snapshot;
			setDirtyDomains( ( current ) => clearMatchingDomains( current, domainSnapshot ) );
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
				structuralBaseline: result.structuralBaseline || config.structuralBaseline,
			} );
			const baselineField = document.getElementById( 'herd_structural_baseline' );
			if ( baselineField && result.structuralBaseline ) baselineField.value = result.structuralBaseline;
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
			settle( 'saved' );
			setSaveState( 'saved' );
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
				settle( 'failed' );
				failSave( 'The save did not complete. Your changes are still here.' );
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
			if ( controller.dirty || anyDirty( dirtyDomains ) ) {
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
		}, [ dirtyDomains ] );

	const restoreRecovery = () => {
		if ( ! recovery.payload ) return;
		controller.history = [ parseDocument( recovery.payload.content || '' ) ];
		controller.index = 0;
		controller.cleanSource = config.postContent;
		restoreNativeFormValues( document.getElementById( 'post' ), recovery.payload.fields );
		setDirtyDomains( ( current ) => markDomain( current, 'nativeMeta' ) ); refresh(); setRecovery( ( current ) => ( { ...current, payload: null } ) );
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
		if ( retainAcfForm ) evictForms( formLifecycle.update( id, { open: !openPanels.has( id ) } ) );
	};
	const toggleChildren = toggleIn( setExpandedChildren );

	const focusId = ( id ) => requestAnimationFrame( () => rowRefs.current.get( id )?.focus() );
	const selectOutlineRow = ( row ) => {
		setExpandedChildren( ( current ) => new Set( [ ...current, ...row.ancestors ] ) );
		requestAnimationFrame( () => focusId( row.clientId ) );
	};
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
	const allowed = ( action, block = null ) => {
		const policy = config.structuralPolicy || {};
		if ( policy[ action ] === false ) return false;
		const blockPolicy = policy.blocks?.[ block?.name ];
		return blockPolicy?.[ action ] !== false;
	};
	const moveToSlot = ( block, toSlot ) => {
		if ( ! allowed( 'move', block ) || ! blockMutationPolicy( block, config.templateLock ).move ) return false;
		const index = moveTargetIndex( controller.blocks, block.clientId, toSlot );
		if ( index === null ) return false;
		controller.moveBlock( block.clientId, null, index );
		refresh();
		setAnnouncement( `${ nameOf( block ) } moved to position ${ Math.max( 0, Math.min( toSlot, named.length - 1 ) ) + 1 } of ${ named.length }.` );
		return true;
	};
	const moveFromDialog = ( slot ) => {
		if ( !movingBlock || !moveToSlot( movingBlock, slot ) ) return;
		setMovingId( null );
		focusId( movingBlock.clientId );
	};
	const closeMoveDialog = () => {
		const id = movingId;
		setMovingId( null );
		if ( id ) focusId( id );
	};

	/** Add a new block at a slot among the named top-level blocks. */
	const insertAt = ( slot, name ) => {
		if ( ! allowed( 'insert', { name } ) || ! blockMutationPolicy( null, config.templateLock ).insert || ! canAddBlock( name, config.blockTypes[ name ], counts ) ) return;
		const block = createAcfBlock( name );
		const index = insertPositionForSlot( controller.blocks, slot );
		setOpenGap( null );
		mutate(
			`${ nameOf( block ) } inserted at position ${ slot + 1 } of ${ named.length + 1 }.`,
			() => controller.insertBlock( null, index, block ),
			block.clientId
		);
		setOpenPanels( ( current ) => new Set( current ).add( block.clientId ) );
		setRecent( ( current ) => {
			const next = promoteRecent( current, name );
			try { window.localStorage.setItem( 'herd-editor-recent-blocks', JSON.stringify( next ) ); } catch {}
			return next;
		} );
	};
	const openBlockPreview = ( block, origin = document.activeElement ) => {
		const metadata = config.blockTypes[ block?.name ] || {};
		if ( !block || adapterFor( block, metadata ).id !== 'acf' || !metadata.registered ) return;
		setPreview( { block, postId: config.postId, title: nameOf( block ), key: `${ block.name }-${ JSON.stringify( block.attributes?.data || {} ) }`, context: config.previewContext || {}, origin } );
	};
	const duplicateBlock = ( block, clear = null ) => {
		if ( !block || !allowed( 'duplicate', block ) ) return;
		const before = new Set( collectBlocks( controller.blocks ).map( ( candidate ) => candidate.clientId ) );
		controller.duplicateBlock( block.clientId, null, null, config.duplicationProfiles || {}, clear );
		const clone = collectBlocks( controller.blocks ).find( ( candidate ) => !before.has( candidate.clientId ) );
		refresh(); setDuplicationReview( null ); setAnnouncement( `${ nameOf( block ) } duplicated.` );
		if ( clone ) { setOpenPanels( ( current ) => new Set( current ).add( clone.clientId ) ); focusId( clone.clientId ); }
	};
	const requestDuplicate = ( block ) => {
		if ( !block || !allowed( 'duplicate', block ) ) return;
		const profile = duplicationProfile( config.duplicationProfiles, block );
		if ( profile.policy === 'blocked' ) { setAnnouncement( profile.message || `${ nameOf( block ) } cannot be duplicated.` ); return; }
		if ( profile.policy === 'review' ) { setDuplicationReview( block ); return; }
		duplicateBlock( block );
	};
	const deleteBlock = ( block ) => {
		if ( !block || !allowed( 'remove', block ) || !window.confirm( `Delete ${ nameOf( block ) }? You can undo this action.` ) ) return;
		const slot = topLevelSlot( controller.blocks, block.clientId ); const fallback = named[ slot + 1 ] || named[ slot - 1 ];
		setOpenPanels( ( current ) => { const next = new Set( current ); next.delete( block.clientId ); return next; } );
		mutate( `${ nameOf( block ) } deleted.`, () => controller.removeBlock( block.clientId ), fallback?.clientId );
	};
	const toggleBlockVisibility = ( block ) => {
		const field = config.visibilityField;
		if ( !block || !field || !allowed( 'visibility', block ) ) return;
		controller.replaceAttributes( block.clientId, { data: { ...block.attributes?.data, [ field ]: isHidden( block ) ? 0 : 1 } } );
		refresh(); setAnnouncement( `${ nameOf( block ) } is now ${ isHidden( block ) ? 'visible' : 'hidden' }.` );
	};
	const selectedBlock = focusedId ? controller.find( focusedId ) : null;
	const selectedMetadata = config.blockTypes[ selectedBlock?.name ] || {};
	const commandContext = {
		canInsert: allowed( 'insert' ) && blockMutationPolicy( null, config.templateLock ).insert,
		validationCount: validationErrors.length,
		selected: selectedBlock && {
			canDuplicate: allowed( 'duplicate', selectedBlock ) && duplicationProfile( config.duplicationProfiles, selectedBlock ).policy !== 'blocked',
			canDelete: allowed( 'remove', selectedBlock ), canMove: allowed( 'move', selectedBlock ) && topLevelSlot( controller.blocks, selectedBlock.clientId ) >= 0 && named.length > 1,
			canPreview: adapterFor( selectedBlock, selectedMetadata ).id === 'acf' && selectedMetadata.registered,
			canVisibility: !!config.visibilityField && allowed( 'visibility', selectedBlock ),
		},
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
		structuralPolicy: config.structuralPolicy || {},
		counts,
		groupOrder: config.blockGroupOrder || [],
		favorites,
		recent,
		onToggleFavorite: async ( name ) => {
			const next = favorites.includes( name ) ? favorites.filter( ( item ) => item !== name ) : [ ...favorites, name ];
			setFavorites( next );
			try {
				const body = new URLSearchParams( { action: 'herd_editor_save_favorite_blocks', nonce: config.favoriteBlocksNonce || '', favorites: JSON.stringify( next ) } );
				const response = await fetch( window.ajaxurl, { method: 'POST', credentials: 'same-origin', body } );
				const payload = await response.json();
				if ( payload?.success ) setFavorites( payload.data.favorites || [] );
			} catch {}
		},
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
	const collapseInactiveForms = () => {
		evictForms( formLifecycle.collapseInactive() );
		setAnnouncement( 'Safe inactive forms released.' );
	};
	const commands = createCommandRegistry( {
		find: () => searchRef.current?.focus(), insert: () => setOpenGap( named.length ), expandAll, collapseAll,
		duplicate: () => requestDuplicate( selectedBlock ), remove: () => deleteBlock( selectedBlock ), move: () => setMovingId( selectedBlock?.clientId || null ),
		preview: () => openBlockPreview( selectedBlock ), toggleVisibility: () => toggleBlockVisibility( selectedBlock ),
		nextValidation: () => { const result = validationErrors.find( ( item ) => item.blockId ); if ( result ) { setOpenPanels( ( current ) => new Set( current ).add( result.blockId ) ); focusId( result.blockId ); } },
		history: () => document.getElementById( 'herd-tab-history' )?.click(),
	} );

	const panelFor = ( row, adapter ) => {
		if ( adapter.id === 'acf' ) {
			return el( AcfForm, {
				block: row.block,
				ancestors: row.ancestors,
				config,
				generation: formVersions[ row.block.clientId ] || 0,
				validationErrors: validationErrors.filter( ( error ) => error.blockId === row.block.clientId ),
				getData: () => controller.find( row.block.clientId )?.attributes?.data || {},
				onBridgeMount: ( bridge, previous ) => registerAcfForm( row.block.clientId, bridge, previous ),
				onAttributes: ( attributes ) => {
					controller.replaceAttributes( row.block.clientId, attributes );
					setPreview( ( current ) => current?.block.clientId === row.block.clientId
						? { ...current, block: controller.find( row.block.clientId ), key: `${ row.block.name }-${ JSON.stringify( controller.find( row.block.clientId )?.attributes?.data || {} ) }` }
						: current );
					/* The sweep's verdict was about the values this edit has just
					 * replaced. Left on screen beside a field that now holds an image,
					 * it goes on saying the field is empty. */
					setValidationErrors( ( current ) => current.some( ( error ) => error.blockId === row.block.clientId )
						? current.filter( ( error ) => error.blockId !== row.block.clientId )
						: current );
					refresh();
					evictForms( formLifecycle.update( row.block.clientId, { validation: false } ) );
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
		dirtyDomains: { ...dirtyDomains, block: controller.dirty ? 1 : dirtyDomains.block },
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
		/* The three failures that used to be announced and then shown nowhere: a
		 * dropped connection, a server that said no, and post data core refused. */
		saveError && ! lockFailure && el( Notice, { status: 'error' },
			`${ saveError } `,
			el( 'button', { type: 'button', className: 'button-link', onClick: retrySave }, 'Try again' ), ' · ',
			el( 'button', { type: 'button', className: 'button-link', onClick: () => downloadRecovery( recoveryPayload(), config.postId ) }, 'Export a copy' ) ),
		lockFailure && el( Notice, { status: 'error' },
			`The editing lock is no longer safe to save (${ lockFailure }). Your changes were kept in this browser. `,
			el( 'a', { href: window.location.href }, 'Reload' ), ' · ',
			document.querySelector( '#post-lock-dialog .wp-tab-last' )?.href && el( 'a', { href: document.querySelector( '#post-lock-dialog .wp-tab-last' ).href }, 'Take over' ),
			document.querySelector( '#post-lock-dialog .wp-tab-last' )?.href && ' · ',
			el( 'button', { type: 'button', className: 'button-link', onClick: restoreRecovery }, 'Restore' ), ' · ',
			el( 'button', { type: 'button', className: 'button-link', onClick: () => downloadRecovery( recoveryPayload(), config.postId ) }, 'Export' ) ),
		validationBlocked && validationErrors.length > 0 && el( Notice, { status: 'error' },
			`Not saved: ${ validationErrors.filter( ( result ) => result.severity === 'error' ).length } ${ validationErrors.filter( ( result ) => result.severity === 'error' ).length === 1 ? 'issue needs' : 'issues need' } attention before this can be published. `,
			el( 'button', {
				type: 'button', className: 'button-link', onClick: () => {
					const first = validationErrors.find( ( result ) => result.severity === 'error' ) || validationErrors[ 0 ];
					if ( first?.blockId ) { setOpenPanels( ( current ) => new Set( current ).add( first.blockId ) ); focusId( first.blockId ); }
				},
			}, 'Show first issue' ) ),

		el( 'p', { className: 'screen-reader-text', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, announcement ),

		el( 'div', { className: 'herd-workspace' },
		/* The document column. Wrapped rather than left as loose grid children:
		 * two of them are conditional, so the outline beside it had no fixed row
		 * count to span. One child leaves the grid nothing to count. */
		el( 'div', { className: 'herd-workspace__main' },
		/* Search, count and the expand controls do one job between them, so they
		 * share a card rather than stacking as two unrelated strips. */
		el( 'div', { className: 'herd-toolbar' },
			el( 'label', { className: 'herd-search' },
				el( 'span', { className: 'screen-reader-text' }, 'Search blocks' ),
				// Decorative: the label above already names the field.
				el( 'span', { className: 'herd-search__icon dashicons dashicons-search', 'aria-hidden': 'true' } ),
				el( 'input', {
					ref: searchRef,
					type: 'search',
					value: search,
					placeholder: 'Search blocks',
					onFocus: () => { searchOrigin.current = focusedId || normalRows[ 0 ]?.block.clientId || null; },
					onChange: ( event ) => setSearch( event.target.value ),
					onKeyDown: ( event ) => { if ( event.key === 'Escape' ) { setSearch( '' ); requestAnimationFrame( () => focusId( searchOrigin.current ) ); } },
				} ) ),
			/* Top-level blocks, not matched rows: this counts the document, and a
			 * search that hides half of it has not made the document shorter. */
			el( 'span', { className: 'herd-toolbar__count' }, `${ named.length } ${ named.length === 1 ? 'block' : 'blocks' }` ),
			el( 'span', { className: 'herd-toolbar__acts' },
				el( 'button', { type: 'button', className: 'herd-linkbtn', onClick: collapseAll }, 'Collapse all' ),
				el( 'button', { type: 'button', className: 'herd-linkbtn', onClick: collapseInactiveForms }, 'Collapse inactive forms' ),
				el( 'button', { type: 'button', className: 'herd-linkbtn', onClick: expandAll }, 'Expand all' ) ) ),

		rows.length === 0 && el( Notice, { status: 'info' }, search ? 'No blocks match this search.' : 'This document has no blocks. Add an ACF block to begin.' ),

		el( 'ol', { className: 'herd-list' }, rows.flatMap( ( row, index ) => {
			const { block } = row;
			const metadata = config.blockTypes[ block.name ] || {};
			const adapter = adapterFor( block, metadata );
			const slot = row.ancestors.length ? -1 : topLevelSlot( controller.blocks, block.clientId );
			const policy = blockMutationPolicy( block, config.templateLock );
			const structural = adapter.structural && slot >= 0 && ( ( policy.move && allowed( 'move', block ) ) || ( policy.remove && allowed( 'remove', block ) ) || ( policy.insert && allowed( 'insert', block ) ) );
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
				warning: validationErrors.some( ( result ) => result.blockId === block.clientId && result.severity === 'error' ) ? 'Needs attention' : ( duplicateIds.has( anchor ) ? 'Duplicate anchor' : null ),
				searchMatch: row.matches,
				matchLabel: row.match?.location,
				searchTerm: search,
				isOpen: openPanels.has( block.clientId ),
				keepBodyMounted: retainAcfForm,
				childrenExpanded: expandedChildren.has( block.clientId ),
				hasChildren: block.innerBlocks.length > 0,
				canReorder: structural && policy.move && allowed( 'move', block ) && named.length > 1,
				isLifted: liftedId === block.clientId,
				isDragging: drag?.id === block.clientId,
				dropEdge: drag && drag.overId === block.clientId && drag.id !== block.clientId ? ( drag.after ? 'after' : 'before' ) : null,
				structural,
				duplicateDisabled: ! policy.insert || ! allowed( 'duplicate', block ) || duplicationProfile( config.duplicationProfiles, block ).policy === 'blocked' || metadata.multiple === false && counts[ block.name ] > 0,
				deleteDisabled: ! policy.remove || ! allowed( 'remove', block ),
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
				onDuplicate: () => requestDuplicate( block ),
				onMove: structural && policy.move && allowed( 'move', block ) && named.length > 1 ? () => setMovingId( block.clientId ) : null,
				onPreview: adapter.id === 'acf' && metadata.registered ? ( event ) => openBlockPreview( block, event.currentTarget ) : null,
				onDelete: () => deleteBlock( block ),
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
								if ( ! allowed( 'anchor', block ) ) return;
								controller.replaceAttributes( block.clientId, { anchor: value } );
								refresh();
							},
						} )
						: null,
				]
				: [] ) );

			// Only top-level rows carry an insertion point; an expanded child row
			// sits inside its parent, where there is no slot to insert into.
			return slot >= 0 && allowed( 'insert' ) && blockMutationPolicy( null, config.templateLock ).insert
				? [ el( InsertPoint, insertPointFor( slot, titleAt( slot - 1 ) ) ), blockRow ]
				: [ blockRow ];
		} ).concat( !search && el( InsertPoint, {
			...insertPointFor( named.length, titleAt( named.length - 1 ) ),
			// The final insertion point sits immediately above the persistent tail
			// control, so keep its menu with the document rather than over it —
			// unless the document is short enough that above is where the room
			// runs out, in which case InsertPoint drops it back down.
			preferAbove: true,
		} ) ) ),

		!search && allowed( 'insert' ) && el( 'button', {
			type: 'button',
			className: 'herd-inserter__tail',
			onClick: () => {
				setOpenGap( named.length );
				setMenuOpen( false );
			},
		}, '+ Add block' ) ),

		el( DocumentOutline, { rows: outline, onSelect: selectOutlineRow } ) ),
		/* Portalled for the reason the move dialog is: rendered inside .herd-main,
		 * this drew underneath the sticky rail. */
		preview && createPortal( el( PreviewDrawer, {
			preview,
			nonce: config.previewNonce,
			onClose: () => setPreview( null ),
			onEdit: () => { setOpenPanels( ( current ) => new Set( current ).add( preview.block.clientId ) ); setPreview( null ); },
		} ), document.body ),
		duplicationReview && createPortal( el( DuplicationDialog, { block: duplicationReview, title: nameOf( duplicationReview ), profiles: config.duplicationProfiles, fields: config.acfFields, onDuplicate: ( clear ) => duplicateBlock( duplicationReview, clear ), onClose: () => setDuplicationReview( null ) } ), document.body ),
		commandPaletteOpen && createPortal( el( CommandPalette, { commands, context: commandContext, onClose: () => setCommandPaletteOpen( false ) } ), document.body ),
		movingBlock && createPortal( el( MoveDialog, {
			title: nameOf( movingBlock ),
			summary: blockSummary( movingBlock, adapterFor( movingBlock, config.blockTypes ).id, bodyFor( movingBlock ) ),
			position: movingPosition,
			total: named.length,
			destinations,
			onMove: moveFromDialog,
			onClose: closeMoveDialog,
		} ), document.body ) );
}
