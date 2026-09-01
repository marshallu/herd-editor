/** Pure preference helpers, intentionally independent of storage and React. */
export const RECENT_LIMIT = 5;
export function orderedEligible( names, catalog, counts ) {
	return ( names || [] ).filter( ( name, index, all ) => all.indexOf( name ) === index && catalog[ name ] && catalog[ name ].registered && catalog[ name ].inserter !== false && catalog[ name ].templateAllowed !== false && ( catalog[ name ].multiple !== false || !( counts[ name ] > 0 ) ) );
}
export function promoteRecent( names, name ) {
	return [ name, ...( names || [] ).filter( ( candidate ) => candidate !== name ) ].slice( 0, RECENT_LIMIT );
}
