/**
 * Herd Editor entry point.
 *
 * Mounts the block editor app into the PHP-rendered shell and assembles the
 * settings rail out of WordPress's own meta boxes.
 */

import { createElement, render } from '@wordpress/element';
import { HerdEditorApp } from './ui/App.js';
import { assembleRail } from './rail.js';
import { enhanceBoxes } from './ui/acf/boxes.js';
import { registerPortalNamespaces } from './ui/acf/portals.js';
import { installPostLock } from './post-lock.js';
import './editor.scss';

const config = window.HerdEditor;
const root = document.getElementById( 'herd-editor-root' );

/*
 * The whole boot is wrapped so the finally can lift `herd-editor-booting`. That
 * class hides the shell's no-JS layout while the DOM is rearranged, and it has
 * to come off however this ends: a throw should leave the screen looking like
 * it did before the guard existed, not blank. Nothing here is *caught* -- these
 * failures are real and belong in the console.
 */
try {
	// Must run before ACF initialises any field, or the first dropdown opens unnamespaced.
	registerPortalNamespaces( window.acf );

	assembleRail();
	/*
	 * After the rail: the postboxes have to be on their panels before the surfaces
	 * are scanned. Guarded on its own — assembleRail() catches to keep the publish
	 * box reachable, and dressing a link is not a reason to lose that.
	 */
	try {
		enhanceBoxes( window.acf );
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Herd Editor could not dress the settings fields.', error );
	}
	installPostLock();

	if ( root && config ) {
		render( createElement( HerdEditorApp, { config } ), root );
	}
} finally {
	document.querySelector( '.herd-editor-screen' )?.classList.remove( 'herd-editor-booting' );
}
