import { createBlock } from './document.js';

export const ADAPTERS = {
	'acf': { id: 'acf', editable: true, structural: true },
	'core/paragraph': { id: 'paragraph', editable: true },
	'core/heading': { id: 'heading', editable: true },
	'core/html': { id: 'html', editable: true },
	'core/shortcode': { id: 'shortcode', editable: true },
	'fallback': { id: 'fallback', editable: false },
};

export function adapterFor( block, metadata = {} ) {
	if ( block?.name?.startsWith( 'acf/' ) && metadata.registered && ! metadata.readOnly ) return ADAPTERS.acf;
	if ( block?.innerBlocks?.length ) return ADAPTERS.fallback;
	return ADAPTERS[ block?.name ] || ADAPTERS.fallback;
}

export function createAcfBlock( name ) {
	return createBlock( name, { name, data: {} } );
}

export function canAddBlock( name, metadata = {}, counts = {} ) {
	return metadata.registered === true && metadata.allowed !== false && metadata.inserter !== false && metadata.readOnly !== true
		&& !( metadata.parent || [] ).length && !( metadata.ancestor || [] ).length
		&& name.startsWith( 'acf/' ) && ( metadata.multiple !== false || ! counts[ name ] );
}

/** Core stores per-block locks in attributes and template locks on the post type. */
export function blockMutationPolicy( block, templateLock = false ) {
	const lock = block?.attributes?.lock || {};
	const templateLocked = [ 'all', 'insert', 'contentOnly' ].includes( templateLock );
	return { move: !templateLocked && lock.move !== false, remove: !templateLocked && lock.remove !== false, insert: !templateLocked };
}

export function wrapperInfo( body, tagName ) {
	const pattern = new RegExp( `^(\\s*<${ tagName }\\b[^>]*>)([\\s\\S]*)(<\\/${ tagName }>\\s*)$`, 'i' );
	const match = String( body ).match( pattern );
	return match ? { before: match[ 1 ], content: match[ 2 ], after: match[ 3 ] } : { before: `<${ tagName }>`, content: String( body ), after: `</${ tagName }>` };
}

export function replaceWrapperContent( body, tagName, content ) {
	const wrapper = wrapperInfo( body, tagName );
	return wrapper.before + content + wrapper.after;
}

export function changeHeadingLevel( body, level ) {
	const safeLevel = Math.max( 1, Math.min( 6, Number( level ) || 2 ) );
	const source = String( body );
	if ( /^\s*<h[1-6]\b/i.test( source ) ) return source.replace( /^(\s*)<h[1-6](\b)/i, `$1<h${ safeLevel }$2` ).replace( /<\/h[1-6]>(\s*)$/i, `</h${ safeLevel }>$1` );
	return `<h${ safeLevel }>${ source }</h${ safeLevel }>`;
}
