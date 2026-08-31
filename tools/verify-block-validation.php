<?php
/**
 * Acceptance check for the pre-publish ACF sweep, herd_editor_validate_document_acf().
 *
 * Builds a throwaway field group and block, serialises blocks the way the
 * editor does, asserts what the sweep reports about each, and deletes the
 * fixture. It touches nothing that was already on the site.
 *
 * Written as a tool rather than as a unit test because every claim here is a
 * claim about ACF's behaviour rather than about this plugin's code: that block
 * attributes store a repeater flattened to a row count, that ACF's validators
 * want the nested rows a form would post, that acf_validate_value() answers only
 * a bool and leaves its message in a store, and that a hidden field is a
 * disabled field whose value reads as nothing. Those are the claims an ACF
 * upgrade can quietly break, and each one of them, broken, stops the site being
 * published with an error naming no field.
 *
 *   wp eval-file tools/verify-block-validation.php
 *
 * @package herd-editor
 */

if ( ! function_exists( 'acf_get_field_groups' ) ) {
	WP_CLI::error( 'ACF Pro is not active.' );
}
if ( ! function_exists( 'herd_editor_validate_document_acf' ) ) {
	WP_CLI::error( 'Herd Editor is not active.' );
}

// Never let the fixture reach a theme's acf-json directory.
acf_update_setting( 'json', false );

const HERD_BV_GROUP = 'group_herd_blockvalidation_check';
const HERD_BV_BLOCK = 'herd-blockvalidation-check';

$pass = 0;
$fail = array();

/**
 * Assert one criterion.
 *
 * @param string $label What is being checked.
 * @param bool   $ok    Whether it holds.
 * @param string $note  Detail, printed either way.
 */
$check = function ( $label, $ok, $note = '' ) use ( &$pass, &$fail ) {
	if ( $ok ) {
		++$pass;
	} else {
		$fail[] = $label;
	}
	WP_CLI::line( sprintf( '  %-4s %-62s %s', $ok ? 'ok' : 'FAIL', $label, $note ) );
};

/** Remove every trace of a previous run, orphaned fields included. */
$teardown = function () {
	global $wpdb;
	$group = acf_get_field_group( HERD_BV_GROUP );
	if ( $group ) {
		acf_delete_field_group( $group['ID'] );
	}
	// acf_update_field() resolves a string parent as a FIELD key, so a fixture
	// that passed a group key would have left its fields at parent 0.
	foreach ( $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'acf-field' AND post_name LIKE 'field\\_hbv\\_%'" ) as $stale ) {
		wp_delete_post( $stale, true );
	}
	foreach ( array( 'fields', 'field-groups', 'values' ) as $store ) {
		$cache = acf_get_store( $store );
		if ( $cache ) {
			$cache->reset();
		}
	}
};

$teardown();

/* ---------------------------------------------------------------------------
 * Fixture
 *
 * The shape that broke: a Portraits-style repeater with a minimum, a required
 * field behind a toggle nobody turned on, and a gallery whose only rule reads a
 * style control that the same toggle hides.
 * ------------------------------------------------------------------------ */

$group_id = acf_update_field_group(
	array(
		'key'      => HERD_BV_GROUP,
		'title'    => 'Herd block validation check (throwaway)',
		'location' => array( array( array( 'param' => 'block', 'operator' => '==', 'value' => 'acf/' . HERD_BV_BLOCK ) ) ),
		'active'   => true,
	)
)['ID'];

$fields = array(
	array( 'key' => 'field_hbv_heading', 'label' => 'Heading', 'name' => 'hbv_heading', 'type' => 'text', 'required' => 1 ),
	array( 'key' => 'field_hbv_rows', 'label' => 'Rows', 'name' => 'hbv_rows', 'type' => 'repeater', 'min' => 3, 'max' => 3 ),
	array( 'key' => 'field_hbv_toggle', 'label' => 'Include gallery', 'name' => 'hbv_toggle', 'type' => 'true_false', 'default_value' => 0 ),
	array( 'key' => 'field_hbv_caption', 'label' => 'Caption', 'name' => 'hbv_caption', 'type' => 'text', 'required' => 1,
		'conditional_logic' => array( array( array( 'field' => 'field_hbv_toggle', 'operator' => '==', 'value' => '1' ) ) ) ),
	array( 'key' => 'field_hbv_style', 'label' => 'Style', 'name' => 'hbv_style', 'type' => 'button_group', 'default_value' => 'grid',
		'choices' => array( 'grid' => 'Grid', 'slider' => 'Slider' ),
		'conditional_logic' => array( array( array( 'field' => 'field_hbv_toggle', 'operator' => '==', 'value' => '1' ) ) ) ),
	array( 'key' => 'field_hbv_photos', 'label' => 'Photos', 'name' => 'hbv_photos', 'type' => 'repeater', 'min' => 4,
		'conditional_logic' => array( array( array( 'field' => 'field_hbv_style', 'operator' => '==', 'value' => 'grid' ) ) ) ),
);
$order = 0;
foreach ( $fields as $field ) {
	// The parent must be the group's post ID. A string parent is looked up as a
	// field key, which silently orphans every field at parent 0.
	$field['parent']     = $group_id;
	$field['menu_order'] = $order++;
	acf_update_field( $field );
}
acf_update_field( array( 'key' => 'field_hbv_row_title', 'label' => 'Title', 'name' => 'row_title', 'type' => 'text', 'required' => 1, 'parent' => 'field_hbv_rows', 'menu_order' => 0 ) );
acf_update_field( array( 'key' => 'field_hbv_photo', 'label' => 'Photo', 'name' => 'photo', 'type' => 'text', 'parent' => 'field_hbv_photos', 'menu_order' => 0 ) );

/**
 * Serialise one fixture block the way the editor stores it: field values keyed
 * by name, each with its `_name` => key reference, repeaters flattened to a
 * row count plus `name_0_sub` values.
 *
 * @param array $data Block attribute data.
 * @return string Serialised block markup.
 */
$markup = function ( $data ) {
	return serialize_blocks( array( array(
		'blockName'    => 'acf/' . HERD_BV_BLOCK,
		'attrs'        => array( 'name' => 'acf/' . HERD_BV_BLOCK, 'data' => $data, 'mode' => 'edit' ),
		'innerBlocks'  => array(),
		'innerHTML'    => '',
		'innerContent' => array(),
	) ) );
};

/** Three filled rows, in the flattened shape block attributes actually hold. */
$three_rows = array(
	'hbv_rows' => 3, '_hbv_rows' => 'field_hbv_rows',
	'hbv_rows_0_row_title' => 'One', '_hbv_rows_0_row_title' => 'field_hbv_row_title',
	'hbv_rows_1_row_title' => 'Two', '_hbv_rows_1_row_title' => 'field_hbv_row_title',
	'hbv_rows_2_row_title' => 'Three', '_hbv_rows_2_row_title' => 'field_hbv_row_title',
);
$filled = array_merge(
	array( 'hbv_heading' => 'Hear from Our Herd', '_hbv_heading' => 'field_hbv_heading' ),
	$three_rows,
	array( 'hbv_toggle' => '0', '_hbv_toggle' => 'field_hbv_toggle' )
);

/** Every message the sweep reports for one set of block data. */
$messages = function ( $data ) use ( $markup ) {
	return wp_list_pluck( herd_editor_validate_document_acf( $markup( $data ), array( 'client-1' ) ), 'message' );
};

/* ---------------------------------------------------------------------------
 * A filled repeater
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Flattened repeaters' );

$reported = $messages( $filled );
$check( 'a block whose every field is filled reports nothing', array() === $reported, implode( '; ', $reported ) );

// The bug this tool exists for: reading $data['hbv_rows'] hands the validator
// the row count 3 rather than three rows, and the minimum can never be met.
$check( 'a three-row repeater satisfies a minimum of three',
	! in_array( 'Minimum rows not reached (3 rows)', $reported, true ) );

$two_rows = $filled;
unset( $two_rows['hbv_rows_2_row_title'], $two_rows['_hbv_rows_2_row_title'] );
$two_rows['hbv_rows'] = 2;
$check( 'a two-row repeater still fails its minimum',
	array( 'Minimum rows not reached (3 rows)' ) === $messages( $two_rows ) );

$empty_row          = $filled;
$empty_row['hbv_rows_1_row_title'] = '';
$check( 'a required sub-field left empty in a row is reported',
	array( 'Title value is required' ) === $messages( $empty_row ) );

/* ---------------------------------------------------------------------------
 * Messages
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Messages' );

// acf_validate_value() returns only a bool; its message goes to a store. Read
// the bool alone and every failure reads "This field is required", whatever the
// real reason, against a field the editor cannot even point at.
$no_heading = $filled;
$no_heading['hbv_heading'] = '';
$check( 'a required field reports ACF\'s own wording, not a generic message',
	array( 'Heading value is required' ) === $messages( $no_heading ) );

$errors = herd_editor_validate_document_acf( $markup( $no_heading ), array( 'client-1' ) );
$check( 'an error names the block and the field it belongs to',
	isset( $errors[0] ) && 'client-1' === $errors[0]['blockId'] && 'field_hbv_heading' === $errors[0]['field'] );

/* ---------------------------------------------------------------------------
 * Conditional logic
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Conditional logic' );

// ACF's form disables a hidden field's inputs, so a browser save never sends
// them and never validates them. This sweep sees no form and has to decide the
// same way, or a toggle nobody turned on blocks publishing with no field to fix.
$check( 'a required field behind an off toggle is not required',
	array() === $messages( $filled ) );

$on = $filled;
$on['hbv_toggle']  = '1';
$on['hbv_caption'] = '';
$on['_hbv_caption'] = 'field_hbv_caption';
// Turning the toggle on also reveals the style control and, through it, the
// gallery -- so the caption is one of two things now asked for, not the only one.
$check( 'and is required once the toggle is on',
	in_array( 'Caption value is required', $messages( $on ), true ) );

// The chain: the gallery reads the style control, which the same toggle hides.
// A hidden control reads as nothing, so the gallery is hidden too -- otherwise
// its default value keeps the gallery on screen and its minimum unmeetable.
$check( 'a field whose rule reads a hidden field is hidden with it',
	! in_array( 'Minimum rows not reached (4 rows)', $messages( $filled ), true ) );

$on_grid = $filled;
$on_grid['hbv_toggle'] = '1';
$on_grid['hbv_caption'] = 'Caption';
$on_grid['_hbv_caption'] = 'field_hbv_caption';
$check( 'and is shown again, minimum and all, once the chain is satisfied',
	in_array( 'Minimum rows not reached (4 rows)', $messages( $on_grid ), true ) );

$on_slider              = $on_grid;
$on_slider['hbv_style'] = 'slider';
$on_slider['_hbv_style'] = 'field_hbv_style';
$check( 'a rule that no longer matches hides the field again',
	array() === $messages( $on_slider ) );

/* ---------------------------------------------------------------------------
 * Isolation
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Isolation' );

// ACF caches loaded values per post_id and field name, and acf_reset_meta()
// does not clear that store. Two blocks sharing a namespace would read each
// other's values, and the second one's report would describe the first.
$two_blocks = $markup( $filled ) . $markup( $no_heading );
$reported   = wp_list_pluck( herd_editor_validate_document_acf( $two_blocks, array( 'client-1', 'client-2' ) ), 'blockId' );
$check( 'a filled block does not inherit a later block\'s values',
	array( 'client-2' ) === $reported, implode( '; ', $reported ) );

$check( 'the sweep leaves no validation errors behind for the save that follows',
	false === acf_get_validation_errors() );

/* ------------------------------------------------------------------------ */

$teardown();

WP_CLI::line( '' );
if ( $fail ) {
	WP_CLI::error( sprintf( '%d passed, %d failed: %s', $pass, count( $fail ), implode( '; ', $fail ) ) );
}
WP_CLI::success( sprintf( '%d checks passed. Field group removed.', $pass ) );
