import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const php = readFileSync( new URL( '../herd-editor.php', import.meta.url ), 'utf8' );
const app = readFileSync( new URL( '../src/ui/App.js', import.meta.url ), 'utf8' );

test( 'the mixed ACF data normalizer ignores writes outside Herd', () => {
	const start = php.indexOf( 'function herd_editor_normalize_saved_blocks' );
	const end = php.indexOf( "add_filter( 'content_save_pre'", start );
	const body = php.slice( start, end );

	assert.match( body, /empty\( \$_POST\['herd-editor'\] \)/ );
	assert.ok( body.indexOf( "$_POST['herd-editor']" ) < body.indexOf( 'preg_replace_callback' ) );
} );

test( 'core autosaves identify themselves as Herd writes', () => {
	const start = app.indexOf( 'const onBefore = ( event, postData ) =>' );
	const end = app.indexOf( 'const onAfter =', start );
	assert.match( app.slice( start, end ), /postData\['herd-editor'\]\s*=\s*1/ );
} );
