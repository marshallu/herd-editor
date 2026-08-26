<?php
/**
 * Which ACF fields are layout, not content.
 *
 * A layout field renders in the admin and holds nothing: ACF's own Message, Tab
 * and Accordion, and Herd's Spacer. They are all `category = 'layout'`, which is
 * the property this reads, so the set extends itself when ACF adds to it and
 * when a site registers its own.
 *
 * This exists because Herd counts fields in several places — a block's summary
 * line, a repeater row's summary, a group's badge, the empty-field flag — and a
 * layout field is not one of the things any of them means. Six inline checks for
 * `!== 'spacer'` would drift apart across releases and would each have missed
 * Message, which has been miscounted the whole time.
 *
 * The JS side of the same question is `isLayoutField()` in
 * src/ui/acf/layout-fields.js, which asks it of a rendered DOM node rather than
 * of a field array.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Field types that hold no value, in case ACF cannot be asked.
 *
 * `acf_get_field_type()` is the answer whenever the type is registered, and it
 * is right about types this list has never heard of. This is the fallback for
 * the one case where it is not available: a field array reaching a consumer
 * after Herd has been deactivated, when `spacer` resolves to nothing.
 *
 * @return string[]
 */
function herd_editor_layout_field_types() {
	/**
	 * Filter the field types treated as layout when ACF cannot be asked.
	 *
	 * @param string[] $types Field type names.
	 */
	return (array) apply_filters(
		'herd_editor_layout_field_types',
		array( 'spacer', 'message', 'tab', 'accordion' )
	);
}

/**
 * Is this field layout rather than content?
 *
 * @param array|string $field A field array, or a field type name.
 * @return bool True when the field holds no value and should not be counted.
 */
function herd_editor_is_layout_field( $field ) {
	$type = is_array( $field ) ? ( isset( $field['type'] ) ? $field['type'] : '' ) : $field;
	if ( ! is_string( $type ) || '' === $type ) {
		return false;
	}

	// ACF's own answer first: it covers every registered type, including ones a
	// site added, and it is the only answer that stays correct as ACF changes.
	if ( function_exists( 'acf_get_field_type' ) ) {
		$object = acf_get_field_type( $type );
		if ( $object && isset( $object->category ) ) {
			return 'layout' === $object->category;
		}
	}

	return in_array( $type, herd_editor_layout_field_types(), true );
}
