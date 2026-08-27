/**
 * Grouping the fields a toggle reveals, under the toggle that reveals them.
 *
 * Conditional logic is the most useful thing a dense field group does and the
 * least visible. Turn on Display Custom Primary Navigation in More Info and
 * three fields appear below it; nothing on screen says they arrived because of
 * that toggle rather than having been there all along, and turning it back off
 * makes three rows vanish from the middle of a list. The reveal reads as the
 * panel rearranging itself.
 *
 * So a run of revealed fields is wrapped in one container with a green rule down
 * its left edge, indented past the toggle above it. The container is drawn only
 * when something in it is on screen, so an empty rule never survives the fields
 * it belonged to.
 *
 * WHY CONSECUTIVE RUNS. Field groups put a gating field directly above what it
 * gates -- ../layout.js:9 states this as the rule Herd's layout is built on, and
 * More Info is authored that way. So the grouping is a scan for adjacent fields
 * sharing one controller, not a walk of the dependency graph. A field group that
 * separates a toggle from what it gates gets no container and renders exactly as
 * it does today, which is the right floor for a guess this cheap.
 *
 * MOVING NODES. Wrapping reparents an initialised `.acf-field`, which ../boxes.js
 * warns against. The warning is about `normalizeTableRepeaters`, which *rebuilds*
 * nodes -- a new element carries none of what ACF hung on the old one. This
 * inserts a wrapper and appends the existing nodes into it, so every node keeps
 * its identity, its listeners and its jQuery data. ACF finds fields by descendant
 * search, so a div between a field and its container is invisible to
 * serialization and to conditional logic, which is the same fact ../layout.js
 * relies on for the Display options list.
 */

import { controllingKey } from './conditions.js';
import { isReachable } from './values.js';

/** Marks a container Herd built, so a second pass does not wrap the wrapper. */
const DEP_CLASS = 'herd-dep';
/** How deep to follow a chain of reveals. More Info's deepest is 2. */
const MAX_DEPTH = 4;

/**
 * Wrap the runs of gated fields directly inside one container.
 *
 * `parentKey` is what stops the recursion eating itself. Every field inside a
 * container built for key K is, by construction, controlled by K -- so a second
 * pass over that container would find one long run of K and wrap it again, and
 * again, until the depth guard stopped it. Four nested rules around one set of
 * fields, which is what this looked like before the parameter existed.
 *
 * A field already grouped under K is therefore left alone, and only a field
 * controlled by something *else* -- a reveal inside a reveal -- opens a group.
 *
 * @param {HTMLElement} container   A `.acf-fields`-shaped element, or a `.herd-dep`.
 * @param {number}      depth       Recursion guard.
 * @param {string|null} parentKey   The key the container was built for, if any.
 * @return {HTMLElement[]} The containers this created.
 */
function wrapRuns( container, depth, parentKey = null ) {
	if ( depth > MAX_DEPTH ) return [];

	const children = Array.from( container.children );
	const built = [];
	let run = [];
	let key = null;

	const flush = () => {
		/*
		 * A run of one is still a run. `alternate_apply_now_url` is the only field
		 * its toggle reveals, and it needs the rule as much as a run of three --
		 * the point is the relationship, not the length.
		 */
		if ( ! run.length || ! key ) {
			run = [];
			key = null;
			return;
		}
		const dep = document.createElement( 'div' );
		dep.className = DEP_CLASS;
		dep.dataset.herdDep = key;

		/*
		 * Where the group goes is decided by where its *controller* ended up, not
		 * by where its fields were authored. ACF's DOM is flat -- Alternate Apply
		 * Now URL is a sibling of Display Take the Next Step, not a child of it --
		 * but the relationship is not: the toggle that reveals it was itself
		 * revealed a moment ago and is now inside a group of its own. Nesting the
		 * new group there is what makes the two rules read as one chain rather
		 * than as two unrelated stripes.
		 *
		 * A controller that is in no group -- the first toggle in a section -- puts
		 * its group in the field flow, where the fields already are.
		 */
		const controller = container.querySelector( `[data-key="${ key }"]` );
		const host = controller?.closest( `.${ DEP_CLASS }` );
		if ( host && host !== container && container.contains( host ) ) {
			host.appendChild( dep );
		} else {
			container.insertBefore( dep, run[ 0 ] );
		}

		run.forEach( ( field ) => dep.appendChild( field ) );
		built.push( dep );
		run = [];
		key = null;
	};

	children.forEach( ( node ) => {
		if ( ! node.classList?.contains( 'acf-field' ) ) {
			flush();
			return;
		}
		const owner = controllingKey( node );
		// Ungrouped, or already sitting in the group it belongs to.
		if ( ! owner || owner === parentKey ) {
			flush();
			return;
		}
		if ( owner !== key ) flush();
		key = owner;
		run.push( node );
	} );
	flush();

	/*
	 * Then the same pass inside each container just built: a field gated on a
	 * toggle which is itself gated nests one level deeper. Done after rather than
	 * during, so the outer run is settled before its contents are re-read.
	 */
	const nested = built.flatMap( ( dep ) => wrapRuns( dep, depth + 1, dep.dataset.herdDep ) );

	return built.concat( nested );
}

/**
 * Hide a container that has nothing on screen in it.
 *
 * Read rather than inferred from the controlling toggle: ACF decides what is
 * visible, and asking the fields themselves is right whatever the operator was
 * -- `request_info_link` shows when its toggle is OFF.
 *
 * @param {HTMLElement} root Anything holding `.herd-dep` containers.
 */
function syncEmpty( root ) {
	/*
	 * Innermost first. `querySelectorAll` gives document order, which is outermost
	 * first, and an outer container asks whether its nested ones are empty -- so
	 * asked in that order it would read a verdict that had not been reached yet,
	 * and a group holding nothing but an emptied group would stay on screen.
	 */
	Array.from( root.querySelectorAll( `.${ DEP_CLASS }` ) ).reverse().forEach( ( dep ) => {
		const fields = Array.from( dep.querySelectorAll( ':scope > .acf-field' ) );
		const nested = Array.from( dep.querySelectorAll( `:scope > .${ DEP_CLASS }` ) );
		const live =
			fields.some( isReachable ) || nested.some( ( child ) => ! child.classList.contains( 'is-empty' ) );
		dep.classList.toggle( 'is-empty', ! live );
	} );
}

/**
 * Group the revealed fields under every container in a root.
 *
 * @param {HTMLElement} root  Anything holding `.acf-fields`-shaped containers.
 * @param {Object}      [acf] ACF's global input API, for the conditional-logic actions.
 * @return {Function} Disposer for the listeners this attached.
 */
export function decorateDeps( root, acf ) {
	if ( ! root ) return () => {};

	const containers = Array.from( root.querySelectorAll( '.acf-accordion-content > .acf-fields' ) );
	if ( ! containers.length ) return () => {};

	let wrapped = 0;
	containers.forEach( ( container ) => {
		// A repeater row ACF clones from is not a set of fields on offer.
		if ( container.closest( '.acf-clone' ) ) return;
		// Already grouped; a second pass must not wrap the wrappers.
		if ( container.querySelector( `:scope > .${ DEP_CLASS }` ) ) return;
		wrapped += wrapRuns( container, 1, null ).length;
	} );

	syncEmpty( root );
	if ( ! wrapped ) return () => {};

	const stops = [];
	const refresh = () => syncEmpty( root );

	root.addEventListener( 'change', refresh );
	stops.push( () => root.removeEventListener( 'change', refresh ) );

	if ( typeof acf?.addAction === 'function' ) {
		[ 'show_field', 'hide_field' ].forEach( ( action ) => {
			acf.addAction( action, refresh );
			stops.push( () => acf.removeAction?.( action, refresh ) );
		} );
	}

	return () => stops.forEach( ( stop ) => stop && stop() );
}

/**
 * Unwrap every container, putting the fields back where ACF left them.
 *
 * Innermost first, so a nested container is emptied into its parent before the
 * parent is emptied into the field flow.
 *
 * @param {HTMLElement} root Anything holding `.herd-dep` containers.
 */
export function resetDeps( root ) {
	if ( ! root ) return;
	const deps = Array.from( root.querySelectorAll( `.${ DEP_CLASS }` ) ).reverse();
	deps.forEach( ( dep ) => {
		const parent = dep.parentNode;
		if ( ! parent ) return;
		while ( dep.firstChild ) parent.insertBefore( dep.firstChild, dep );
		dep.remove();
	} );
}
