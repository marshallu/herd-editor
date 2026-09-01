/** Independent dirty counters make in-flight save reconciliation deterministic. */
export const DIRTY_DOMAINS = [ 'block', 'core', 'acfMeta', 'nativeMeta' ];
export function emptyDirtyDomains() { return { block: 0, core: 0, acfMeta: 0, nativeMeta: 0 }; }
export function dirtyDomainFor( target ) {
	if ( target?.closest?.( '#herd-editor-root' ) ) return 'block';
	if ( target?.closest?.( '.acf-postbox, [data-key][class*="acf"]' ) ) return 'acfMeta';
	if ( target?.matches?.( '#title, #post_name, #post_status, #excerpt' ) || target?.closest?.( '#titlediv, #post-status-info' ) ) return 'core';
	return 'nativeMeta';
}
export function markDomain( domains, domain ) { return { ...domains, [ domain ]: ( domains[ domain ] || 0 ) + 1 }; }
export function anyDirty( domains ) { return DIRTY_DOMAINS.some( ( domain ) => domains[ domain ] > 0 ); }
export function clearMatchingDomains( domains, snapshot ) {
	return Object.fromEntries( DIRTY_DOMAINS.map( ( domain ) => [ domain, domains[ domain ] === snapshot[ domain ] ? 0 : domains[ domain ] ] ) );
}
