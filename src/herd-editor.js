/**
 * Herd Editor entry point.
 *
 * Mounts the block editor app into the PHP-rendered shell and assembles the
 * settings rail out of WordPress's own meta boxes.
 */

import { createElement, render } from '@wordpress/element';
import { HerdEditorApp } from './ui/App.js';
import { assembleRail } from './rail.js';
import { registerPortalNamespaces } from './ui/acf/portals.js';
import './editor.scss';

const config = window.HerdEditor;
const root = document.getElementById( 'herd-editor-root' );

// Must run before ACF initialises any field, or the first dropdown opens unnamespaced.
registerPortalNamespaces( window.acf );

assembleRail();

if ( root && config ) {
	render( createElement( HerdEditorApp, { config } ), root );
}
