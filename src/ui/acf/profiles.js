/**
 * Per-block presentation rules, supplied by the site.
 *
 * Everything else in `src/ui/acf/` reads the shape of ACF's rendered markup, so
 * it works on any block a site registers. Three things cannot be inferred from
 * shape:
 *
 *   - the summary line's wording and ordering
 *   - which control renders as a glyph rather than its label
 *   - which choice carries a rule the field group does not record
 *
 * None of those are Herd's to know, so none of them are written here. They
 * arrive from the server as `window.HerdEditor.profiles` -- see the
 * `herd_editor_block_profiles` filter -- and a block with no profile keeps the
 * fully generic treatment.
 *
 * The format is data rather than code, because it crosses `wp_json_encode()`.
 * `summary` is a list of parts, each of which is one of:
 *
 *   'heading'                       the field's value, as authored
 *   { field, labels }               the value mapped through a lookup
 *   { template, requires }          a string with {field} interpolation
 *   { oneOf: [ part, ... ] }        the first part that produces anything
 *
 * Any part may carry `when: { field: value, ... }`, and is skipped unless every
 * named field currently holds that value. That is what makes `oneOf` a
 * first-match-wins list rather than merely a coalesce.
 *
 * In a template, `{name}` is the field's value and `{name:one|many}` is a noun
 * agreeing with the number in `name`. `requires` names fields that must hold
 * something before the part is used at all, so an empty repeater contributes no
 * fragment rather than "0 cards".
 */

/** The profiles the server published, or none. */
function profiles() {
	const map = typeof window === 'undefined' ? null : window.HerdEditor?.profiles;
	return map && typeof map === 'object' ? map : {};
}

export function profileFor( blockName ) {
	const profile = profiles()[ blockName ];
	return profile && typeof profile === 'object' ? profile : null;
}

/** A field's value as a plain string, whatever ACF stored it as. */
function valueOf( data, field ) {
	const value = data?.[ field ];
	if ( value === null || value === undefined || typeof value === 'object' ) return '';
	return String( value );
}

/** Whether every field named in `when` currently holds the value it names. */
function matches( data, when ) {
	if ( ! when || typeof when !== 'object' ) return true;
	return Object.entries( when ).every( ( [ field, expected ] ) => valueOf( data, field ) === String( expected ) );
}

/** `{cards} {cards:card|cards}` against the block's data. */
function interpolate( template, data ) {
	return String( template ).replace( /\{([^{}:]+)(?::([^{}]*))?\}/g, ( whole, field, forms ) => {
		const value = valueOf( data, field );
		if ( forms === undefined ) return value;
		const [ one = '', many = '' ] = forms.split( '|' );
		return Number( value ) === 1 ? one : many;
	} );
}

/**
 * One summary part.
 *
 * Returns '' for anything that did not apply, which the caller drops -- a part
 * that produces nothing is an absence, not an empty fragment.
 */
function renderPart( part, data ) {
	if ( typeof part === 'string' ) return valueOf( data, part );
	if ( ! part || typeof part !== 'object' ) return '';
	if ( ! matches( data, part.when ) ) return '';

	if ( Array.isArray( part.oneOf ) ) {
		for ( const candidate of part.oneOf ) {
			const rendered = renderPart( candidate, data );
			if ( rendered ) return rendered;
		}
		return '';
	}

	// A required field that is empty, or a literal zero, drops the whole part.
	const required = part.requires === undefined ? [] : [].concat( part.requires );
	if ( required.some( ( field ) => {
		const value = valueOf( data, field );
		return value === '' || Number( value ) === 0;
	} ) ) return '';

	if ( part.template !== undefined ) return interpolate( part.template, data );

	if ( part.value !== undefined ) return String( part.value );

	if ( part.field !== undefined ) {
		const value = valueOf( data, part.field );
		if ( part.labels && typeof part.labels === 'object' ) {
			return value in part.labels ? String( part.labels[ value ] ) : '';
		}
		return value;
	}

	return '';
}

/**
 * A block's summary fragments, or an empty list when it has no profile.
 *
 * @param {string} blockName Registered block name.
 * @param {Object} data      Raw block `data` attributes.
 * @return {string[]}
 */
export function profileSummary( blockName, data ) {
	const summary = profileFor( blockName )?.summary;
	if ( ! Array.isArray( summary ) ) return [];
	const source = data && typeof data === 'object' ? data : {};
	return summary.map( ( part ) => renderPart( part, source ) ).filter( Boolean );
}
