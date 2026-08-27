/**
 * Reading ACF's conditional logic out of the rendered form.
 *
 * ACF prints a field's conditional logic as a JSON `data-conditions` attribute on
 * the `.acf-field` wrapper, and gives every wrapper a `data-key`. That is enough
 * to answer the one question Herd's layout needs: does this field *gate* other
 * fields, or is it just another switch?
 *
 * The distinction matters because a toggle that reveals three more fields cannot
 * live in the flat list at the bottom of the form — the reveal would happen
 * somewhere the eye isn't. Being *gated* is not the test. Hero's `short_video`
 * carries conditions but nothing depends on it, so it stays in Display options.
 */

/**
 * ACF nests conditions two deep: an array of OR groups, each an array of AND
 * rules. Older field groups sometimes save a single flat group instead.
 *
 * @param {string} value The raw `data-conditions` attribute.
 * @return {Object[]} Flat list of rules, each with at least a `field` key.
 */
function parseConditions( value ) {
	let parsed;
	try {
		parsed = JSON.parse( value );
	} catch ( error ) {
		return [];
	}
	if ( ! Array.isArray( parsed ) ) return [];
	return parsed.flat( Infinity ).filter( ( rule ) => rule && typeof rule === 'object' );
}

/**
 * The one field this field's visibility hangs on, when there is exactly one.
 *
 * `gatingKeys` answers the question from the controlling end -- does anything
 * depend on me. This answers it from the dependent end, and it is deliberately
 * stricter: it returns a key only when every rule, across every OR group, names
 * the same field. A field revealed by `layout == split` OR `modern == 1` has two
 * controllers and no single toggle it can be said to belong under.
 *
 * The operator is not read. `request_info_link` shows when `hide_request_info`
 * is NOT set, and it belongs under that toggle exactly as much as a field that
 * shows when its toggle IS set -- the reveal is what groups them, not the
 * polarity of the test.
 *
 * @param {HTMLElement} field The `.acf-field` wrapper.
 * @return {string|null} The controlling field key, or null when there is not
 *                       exactly one.
 */
export function controllingKey( field ) {
	const raw = field?.getAttribute?.( 'data-conditions' );
	if ( ! raw ) return null;
	const rules = parseConditions( raw );
	if ( ! rules.length ) return null;

	const first = rules[ 0 ].field ? String( rules[ 0 ].field ) : '';
	if ( ! first ) return null;
	return rules.every( ( rule ) => String( rule.field || '' ) === first ) ? first : null;
}

/**
 * Every field key that some other field's visibility depends on.
 *
 * @param {HTMLElement} form The mounted ACF form.
 * @return {Set<string>} Field keys that gate something.
 */
export function gatingKeys( form ) {
	const keys = new Set();
	if ( ! form ) return keys;
	form.querySelectorAll( '[data-conditions]' ).forEach( ( field ) => {
		parseConditions( field.getAttribute( 'data-conditions' ) ).forEach( ( rule ) => {
			if ( rule.field ) keys.add( String( rule.field ) );
		} );
	} );
	return keys;
}

/**
 * Does this field decide whether other fields are on offer?
 *
 * @param {HTMLElement}  field The `.acf-field` wrapper.
 * @param {Set<string>}  keys  Result of `gatingKeys()`.
 * @return {boolean} True when something else is conditional on this field.
 */
export function isStructural( field, keys ) {
	const key = field?.dataset?.key;
	return Boolean( key && keys && keys.has( key ) );
}
