/** Pure outline derivation from the parsed document; it does not touch forms. */

import { adapterFor } from '../adapters.js';
import { bodyFor, isHidden, titleFor } from './blocks.js';
import { blockSummary } from './summary.js';

export function outlineRows( blocks, blockTypes = {}, ancestors = [], result = [] ) {
	for ( const block of blocks || [] ) {
		if ( !block.name ) continue;
		const metadata = blockTypes[ block.name ] || {};
		const adapter = adapterFor( block, metadata );
		result.push( { clientId: block.clientId, title: titleFor( block, blockTypes ), summary: blockSummary( block, adapter.id, bodyFor( block ) ), hidden: isHidden( block ), ancestors: ancestors.map( ( item ) => item.clientId ) } );
		outlineRows( block.innerBlocks, blockTypes, [ ...ancestors, block ], result );
	}
	return result;
}
