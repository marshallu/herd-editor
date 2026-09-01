import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock } from '../src/document.js';
import { validateEditorialDocument } from '../src/ui/editorial-validation.js';

test( 'required sections report a page-wide error when absent or hidden', () => {
	const block = createBlock( 'acf/hero', { data: { hidden: 1 } } );
	const results = validateEditorialDocument( [ block ], { visibilityField: 'hidden', editorialRules: { requiredSections: [ { block: 'acf/hero', visible: true }, 'acf/contact' ] } } );
	assert.deepEqual( results.map( ( result ) => result.ruleId ), [ 'required-section', 'required-section' ] );
	assert.ok( results.every( ( result ) => result.severity === 'error' && !result.blockId ) );
} );

test( 'relative configured internal links are flagged before publishing', () => {
	const block = createBlock( 'acf/card', { data: { link: 'not a url' } } );
	const results = validateEditorialDocument( [ block ], { siteUrl: 'https://example.test/', editorialRules: { internalLinkFields: [ 'link' ] } } );
	assert.equal( results[ 0 ].ruleId, 'invalid-internal-link' );
	assert.equal( results[ 0 ].blockId, block.clientId );
} );
