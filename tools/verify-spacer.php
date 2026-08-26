<?php
/**
 * Acceptance check for per-field widths and the Spacer field.
 *
 * Builds a throwaway field group, a throwaway block and a draft page, asserts
 * everything about them that can be asserted from PHP, and deletes all three.
 * It touches nothing that was already on the site.
 *
 * Written as a tool rather than as a one-off because most of what it checks is
 * a claim about ACF's behaviour rather than about this plugin's code -- that no
 * postmeta row is written, that a required field still validates, that a field
 * group survives an export and import, that deactivating does not lose anything.
 * Those are the claims an ACF upgrade can quietly break.
 *
 * The three criteria it cannot answer are layout ones: that three 33% fields
 * hold one row at 90/100/110% zoom, that spacers vanish below the mobile
 * breakpoint, and that a conditional toggle re-flows live. The first is a
 * browser measurement; the other two are covered by tests/rows.test.js and by
 * src/css/_acf-spacer.scss.
 *
 *   wp eval-file tools/verify-spacer.php
 *
 * @package herd-editor
 */

if ( ! function_exists( 'acf_get_field_groups' ) ) {
	WP_CLI::error( 'ACF Pro is not active.' );
}
if ( ! acf_get_field_type( 'spacer' ) ) {
	WP_CLI::error( 'The spacer field type is not registered. Is Herd Editor active?' );
}

// Never let the fixture reach a theme's acf-json directory.
acf_update_setting( 'json', false );

const HERD_FIXTURE_GROUP = 'group_herd_spacer_check';
const HERD_FIXTURE_SLUG  = 'herd-spacer-check';
const HERD_FIXTURE_BLOCK = 'herd-spacer-check';

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
	WP_CLI::line( sprintf( '  %-4s %-58s %s', $ok ? 'ok' : 'FAIL', $label, $note ) );
};

/** Remove every trace of a previous run, orphaned fields included. */
$teardown = function () {
	global $wpdb;
	$group = acf_get_field_group( HERD_FIXTURE_GROUP );
	if ( $group ) {
		acf_delete_field_group( $group['ID'] );
	}
	// acf_update_field() resolves a string parent as a FIELD key, so a fixture
	// that passed a group key would have left its fields at parent 0.
	foreach ( $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'acf-field' AND post_name LIKE 'field\\_hsc\\_%'" ) as $stale ) {
		wp_delete_post( $stale, true );
	}
	$page = get_page_by_path( HERD_FIXTURE_SLUG, OBJECT, 'page' );
	if ( $page ) {
		wp_delete_post( $page->ID, true );
	}
	foreach ( array( 'fields', 'field-groups' ) as $store ) {
		$cache = acf_get_store( $store );
		if ( $cache ) {
			$cache->reset();
		}
	}
};

$teardown();

/* ---------------------------------------------------------------------------
 * Fixture
 * ------------------------------------------------------------------------ */

$group_id = acf_update_field_group(
	array(
		'key'      => HERD_FIXTURE_GROUP,
		'title'    => 'Herd spacer check (throwaway)',
		'location' => array(
			array( array( 'param' => 'post_type', 'operator' => '==', 'value' => 'page' ) ),
			array( array( 'param' => 'block', 'operator' => '==', 'value' => 'acf/' . HERD_FIXTURE_BLOCK ) ),
		),
		'active'   => true,
	)
)['ID'];

$fields = array(
	// AC 1 and 2: a select on its own line, then the same select at 50% with a
	// 50% spacer after it. Both must put the next field on the row below.
	array( 'key' => 'field_hsc_style', 'label' => 'Style', 'name' => 'hsc_style', 'type' => 'select',
		'choices' => array( 'minimal' => 'Minimal', 'icon' => 'Icon' ), 'wrapper' => array( 'width' => 50 ) ),
	array( 'key' => 'field_hsc_gap', 'label' => '', 'name' => 'hsc_gap', 'type' => 'spacer',
		'herd_spacer_style' => 'line', 'wrapper' => array( 'width' => 50 ) ),

	// AC 5: three 33% fields.
	array( 'key' => 'field_hsc_a', 'label' => 'A', 'name' => 'hsc_a', 'type' => 'text', 'wrapper' => array( 'width' => 33 ) ),
	array( 'key' => 'field_hsc_b', 'label' => 'B', 'name' => 'hsc_b', 'type' => 'text', 'wrapper' => array( 'width' => 33 ) ),
	array( 'key' => 'field_hsc_c', 'label' => 'C', 'name' => 'hsc_c', 'type' => 'text', 'wrapper' => array( 'width' => 33 ) ),

	// AC 4: a required field two positions after a spacer.
	array( 'key' => 'field_hsc_gap2', 'label' => '', 'name' => 'hsc_gap2', 'type' => 'spacer', 'wrapper' => array( 'width' => 25 ) ),
	array( 'key' => 'field_hsc_filler', 'label' => 'Filler', 'name' => 'hsc_filler', 'type' => 'text', 'wrapper' => array( 'width' => 25 ) ),
	array( 'key' => 'field_hsc_req', 'label' => 'Required', 'name' => 'hsc_req', 'type' => 'text', 'required' => 1, 'wrapper' => array( 'width' => 50 ) ),

	// A freeform width from before the segmented control existed.
	array( 'key' => 'field_hsc_legacy', 'label' => 'Legacy', 'name' => 'hsc_legacy', 'type' => 'text', 'wrapper' => array( 'width' => 47 ) ),

	// AC 6: a spacer in a table-layout repeater.
	array( 'key' => 'field_hsc_rows', 'label' => 'Rows', 'name' => 'hsc_rows', 'type' => 'repeater', 'layout' => 'table' ),
);

$order = 0;
foreach ( $fields as $field ) {
	// The parent must be the group's post ID. A string parent is looked up as a
	// field key, which silently orphans every field at parent 0.
	$field['parent']     = $group_id;
	$field['menu_order'] = $order++;
	acf_update_field( $field );
}

$subs = array(
	array( 'key' => 'field_hsc_row_title', 'label' => 'Title', 'name' => 'row_title', 'type' => 'text', 'wrapper' => array( 'width' => 50 ) ),
	array( 'key' => 'field_hsc_row_gap', 'label' => '', 'name' => 'row_gap', 'type' => 'spacer', 'wrapper' => array( 'width' => 50 ) ),
	array( 'key' => 'field_hsc_row_link', 'label' => 'Link', 'name' => 'row_link', 'type' => 'text', 'wrapper' => array( 'width' => 100 ) ),
);
foreach ( $subs as $i => $sub ) {
	$sub['parent']     = 'field_hsc_rows';
	$sub['menu_order'] = $i;
	acf_update_field( $sub );
}

$page_id = wp_insert_post( array(
	'post_type'   => 'page',
	'post_status' => 'draft',
	'post_title'  => 'Herd spacer check',
	'post_name'   => HERD_FIXTURE_SLUG,
) );

/* ---------------------------------------------------------------------------
 * Widths
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Widths' );

$rendered_width = function ( $key ) {
	ob_start();
	acf_render_field_wrap( acf_get_field( $key ) );
	$html = ob_get_clean();
	return preg_match( '/data-width="(\d+)"/', $html, $m ) ? (int) $m[1] : 0;
};

$check( 'a 50% field renders at 50%', 50 === $rendered_width( 'field_hsc_style' ) );
$check( 'a 33% field renders at 33%', 33 === $rendered_width( 'field_hsc_a' ) );

// The segmented control, and the snap. Rendered the way the field group editor
// renders it, through acf/prepare_field/name=width.
$width_control = function ( $value ) {
	ob_start();
	acf_render_field_wrap(
		array(
			'label' => 'Wrapper Attributes', 'instructions' => '', 'type' => 'number', 'name' => 'width',
			'prefix' => 'acf_fields[0][wrapper]', 'value' => $value, 'prepend' => 'width', 'append' => '%',
			'wrapper' => array( 'data-name' => 'wrapper', 'class' => 'acf-field-setting-wrapper' ),
		),
		'div'
	);
	$html = ob_get_clean();
	$checked = '';
	preg_match_all( '/<input type="radio"[^>]*>/', $html, $radios );
	foreach ( $radios[0] as $tag ) {
		if ( false !== strpos( $tag, 'checked' ) && preg_match( '/value="([^"]*)"/', $tag, $v ) ) {
			$checked = $v[1];
		}
	}
	return array(
		'radios'  => count( $radios[0] ),
		'checked' => $checked,
		'inputs'  => substr_count( $html, 'name="acf_fields[0][wrapper][width]"' ),
		'note'    => preg_match( '/class="description"[^>]*>([^<]*)/', $html, $d ) ? trim( $d[1] ) : '',
	);
};

$presets = herd_editor_width_presets();
$control = $width_control( 50 );
$check( 'width renders as a segmented control, one per preset', count( $presets ) === $control['radios'],
	sprintf( '%d presets, %d buttons', count( $presets ), $control['radios'] ) );
$check( 'the control posts under ACF\'s own input name', $control['inputs'] >= 1 );
$check( 'a stored preset is the selected one', '50' === $control['checked'] );
$check( '100% and empty are the same state', '' === $width_control( '' )['checked'] && '' === $width_control( 100 )['checked'] );

$snapped = $width_control( 47 );
$check( 'a legacy width snaps to the nearest preset', '50' === $snapped['checked'] );
$check( 'and says so rather than snapping silently', '' !== $snapped['note'], $snapped['note'] );
$check( 'a tie snaps to the wider preset', '33' === herd_editor_snap_width( 29 ) );
$check( 'the stored width is not rewritten until the group is saved', 47 === (int) acf_get_field( 'field_hsc_legacy' )['wrapper']['width'] );

/* ---------------------------------------------------------------------------
 * The spacer holds nothing
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'The spacer holds nothing' );

global $wpdb;

// A POST carrying a value for every spacer. A rendered form never produces one,
// which is exactly why it is the case worth proving.
$poison = 'SHOULD-NEVER-BE-STORED';
acf_save_post( $page_id, array(
	'field_hsc_style'  => 'icon',
	'field_hsc_gap'    => $poison,
	'field_hsc_a'      => 'Alpha',
	'field_hsc_b'      => 'Beta',
	'field_hsc_c'      => 'Gamma',
	'field_hsc_gap2'   => $poison,
	'field_hsc_filler' => 'Filler',
	'field_hsc_req'    => 'Present',
	'field_hsc_legacy' => 'Legacy',
	'field_hsc_rows'   => array(
		array( 'field_hsc_row_title' => 'Row one', 'field_hsc_row_gap' => $poison, 'field_hsc_row_link' => '/one' ),
	),
) );

$spacer_rows = (int) $wpdb->get_var( $wpdb->prepare(
	"SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE post_id = %d AND (meta_key LIKE %s OR meta_value = %s)",
	$page_id, '%gap%', $poison ) );
$check( 'AC3  saving writes no postmeta row for a spacer', 0 === $spacer_rows, "found {$spacer_rows}" );

$real_rows = (int) $wpdb->get_var( $wpdb->prepare(
	"SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", $page_id, 'hsc_a' ) );
$check( '     and still writes one for a real field', 1 === $real_rows );

$check( 'AC3  the spacer renders no input at all', ! preg_match( '/<(input|textarea|select)/', (function () {
	ob_start();
	acf_render_field_wrap( acf_get_field( 'field_hsc_gap' ) );
	return ob_get_clean();
} )() ) );

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Validation' );

$valid = function ( $values ) {
	acf_reset_validation_errors();
	acf_validate_values( $values, 'acf' );
	$errors = acf_get_validation_errors();
	acf_reset_validation_errors();
	return empty( $errors );
};

$check( 'AC4  a required field after a spacer validates', $valid( array( 'field_hsc_req' => 'Present' ) ) );
$check( 'AC4  a spacer posted empty does not block the save', $valid( array( 'field_hsc_gap' => '', 'field_hsc_req' => 'Present' ) ) );
$check( '     and an empty required field still fails', ! $valid( array( 'field_hsc_req' => '' ) ) );

// Required can only land on a spacer through an import or a hand-written array.
$forced             = acf_get_field( 'field_hsc_gap' );
$forced['required'] = 1;
acf_update_field( $forced );
$check( 'AC4  a spacer marked required still cannot block a save', $valid( array( 'field_hsc_gap' => '', 'field_hsc_req' => 'Present' ) ) );
$check( '     and ACF is told it is not required', 0 === (int) acf_get_field( 'field_hsc_gap' )['required'] );

/* ---------------------------------------------------------------------------
 * Consumers
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Consumers' );

$values = (array) get_fields( $page_id );
$check( 'get_fields() has no spacer entry', ! array_key_exists( '', $values ) && ! in_array( $poison, $values, true ) );
$check( 'get_fields() has no null entry', 0 === count( array_filter( $values, 'is_null' ) ) );
$check( 'get_field_objects() has no spacer entry', ! array_key_exists( '', (array) get_field_objects( $page_id ) ) );
$check( 'get_field() by the spacer\'s key is null', null === get_field( 'field_hsc_gap', $page_id ) );

$row = get_field( 'hsc_rows', $page_id )[0];
$check( 'AC6  a repeater row has no spacer key', 2 === count( $row ) && ! in_array( $poison, $row, true ),
	implode( ', ', array_keys( $row ) ) );

$spacer_type = acf_get_field_type( 'spacer' );
$check( 'the spacer is out of REST', isset( $spacer_type->show_in_rest ) && false === $spacer_type->show_in_rest );
$check( 'and has no REST schema', array() === acf_get_field_rest_schema( acf_get_field( 'field_hsc_gap' ) ) );
$check( 'the field type is layout, which is what keeps it out of counts',
	herd_editor_is_layout_field( acf_get_field( 'field_hsc_gap' ) ) );

/* ---------------------------------------------------------------------------
 * Repeater layout
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Repeater layout' );

$repeater = acf_get_field( 'field_hsc_rows' );
$check( 'AC6  the field group still says table', 'table' === $repeater['layout'] );
$check( 'AC6  but a table repeater holding a spacer renders as block', 'block' === acf_prepare_field( acf_get_field( 'field_hsc_rows' ) )['layout'] );

$without              = acf_get_field( 'field_hsc_rows' );
$without['sub_fields'] = array_values( array_filter( $without['sub_fields'], function ( $s ) {
	return 'spacer' !== $s['type'];
} ) );
$check( '     a table repeater without one is left alone', 'table' === acf_prepare_field( $without )['layout'] );

/* ---------------------------------------------------------------------------
 * Block render
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Block render' );

acf_register_block_type( array(
	'name'            => HERD_FIXTURE_BLOCK,
	'title'           => 'Herd spacer check',
	'category'        => 'common',
	'render_callback' => function ( $block ) {
		echo '<div class="hsc">';
		// Both of the shapes a host theme reads: the field API, and the raw data
		// a block render callback is handed.
		foreach ( (array) get_fields() as $name => $value ) {
			printf( '<span data-f="%s">%s</span>', esc_attr( $name ), esc_html( is_array( $value ) ? wp_json_encode( $value ) : (string) $value ) );
		}
		foreach ( (array) ( isset( $block['data'] ) ? $block['data'] : array() ) as $name => $value ) {
			if ( '_' === substr( (string) $name, 0, 1 ) ) {
				continue;
			}
			printf( '<b data-d="%s">%s</b>', esc_attr( $name ), esc_html( is_array( $value ) ? wp_json_encode( $value ) : (string) $value ) );
		}
		echo '</div>';
	},
) );

$data = array( 'hsc_style' => 'icon', 'hsc_a' => 'Alpha', 'hsc_req' => 'Present' );
$markup = '<!-- wp:acf/' . HERD_FIXTURE_BLOCK . ' ' . wp_json_encode(
	array( 'name' => 'acf/' . HERD_FIXTURE_BLOCK, 'data' => $data, 'mode' => 'preview' )
) . ' /-->';

$with_spacers = do_blocks( $markup );

// Now take every spacer out of the field group and render exactly the same block.
foreach ( array( 'field_hsc_gap', 'field_hsc_gap2', 'field_hsc_row_gap' ) as $key ) {
	$field = acf_get_field( $key );
	acf_delete_field( $field['ID'] );
}
foreach ( array( 'fields', 'field-groups' ) as $store ) {
	$cache = acf_get_store( $store );
	if ( $cache ) {
		$cache->reset();
	}
}
$without_spacers = do_blocks( $markup );

$check( 'AC8  the public render is byte-identical with and without spacers',
	$with_spacers === $without_spacers,
	$with_spacers === $without_spacers ? strlen( $with_spacers ) . ' bytes' : 'differs' );
if ( $with_spacers !== $without_spacers ) {
	WP_CLI::line( '       with:    ' . trim( wp_strip_all_tags( $with_spacers ) ) );
	WP_CLI::line( '       without: ' . trim( wp_strip_all_tags( $without_spacers ) ) );
}

/* ---------------------------------------------------------------------------
 * Export, import, deactivate, reactivate
 * ------------------------------------------------------------------------ */

WP_CLI::line( '' );
WP_CLI::line( 'Round trips' );

// Rebuild the spacers the block test removed.
foreach ( array(
	array( 'key' => 'field_hsc_gap', 'label' => '', 'name' => 'hsc_gap', 'type' => 'spacer', 'herd_spacer_style' => 'line',
		'parent' => $group_id, 'menu_order' => 1, 'wrapper' => array( 'width' => 50 ) ),
	array( 'key' => 'field_hsc_gap2', 'label' => '', 'name' => 'hsc_gap2', 'type' => 'spacer',
		'parent' => $group_id, 'menu_order' => 5, 'wrapper' => array( 'width' => 25 ) ),
	array( 'key' => 'field_hsc_row_gap', 'label' => '', 'name' => 'row_gap', 'type' => 'spacer',
		'parent' => 'field_hsc_rows', 'menu_order' => 1, 'wrapper' => array( 'width' => 50 ) ),
) as $field ) {
	acf_update_field( $field );
}

/** Everything about a field group worth comparing across a round trip. */
$snapshot = function () {
	$out  = array();
	$walk = function ( $fields, $prefix = '' ) use ( &$walk, &$out ) {
		foreach ( $fields as $f ) {
			$out[ $prefix . $f['key'] ] = array(
				'type'  => $f['type'],
				'label' => $f['label'],
				'width' => isset( $f['wrapper']['width'] ) ? (string) $f['wrapper']['width'] : '',
				'class' => isset( $f['wrapper']['class'] ) ? trim( $f['wrapper']['class'] ) : '',
				'style' => isset( $f['herd_spacer_style'] ) ? $f['herd_spacer_style'] : '-',
			);
			if ( ! empty( $f['sub_fields'] ) ) {
				$walk( $f['sub_fields'], $f['key'] . '/' );
			}
		}
	};
	foreach ( array( 'fields', 'field-groups' ) as $store ) {
		$cache = acf_get_store( $store );
		if ( $cache ) {
			$cache->reset();
		}
	}
	$walk( acf_get_fields( acf_get_field_group( HERD_FIXTURE_GROUP ) ) );
	return $out;
};

$before = $snapshot();

// AC 10: exactly what Tools > Export and Tools > Import do.
$group           = acf_get_field_group( HERD_FIXTURE_GROUP );
$group['fields'] = acf_get_fields( $group );
$encoded         = wp_json_encode( acf_prepare_field_group_for_export( $group ) );
acf_delete_field_group( $group['ID'] );
acf_import_field_group( json_decode( $encoded, true ) );

$imported = $snapshot();
$check( 'AC10 export and re-import keeps every field key', array_keys( $before ) === array_keys( $imported ) );
$check( 'AC10 and every width, style and spacer with them', $before === $imported );
if ( $before !== $imported ) {
	foreach ( $before as $key => $was ) {
		if ( ! isset( $imported[ $key ] ) || $imported[ $key ] !== $was ) {
			WP_CLI::line( '       ' . $key . ' was ' . wp_json_encode( $was ) . ' now ' . wp_json_encode( isset( $imported[ $key ] ) ? $imported[ $key ] : null ) );
		}
	}
}

// AC 11. Both hooks are called directly; WordPress would run them in separate
// requests, and herd_editor_stored_fields() resets ACF's caches so that back to
// back still behaves the way two requests would.
herd_editor_deactivate();
$deactivated = $snapshot();

$types = array_unique( array_column( array_intersect_key( $deactivated, $before ), 'type' ) );
$check( 'AC11 deactivating leaves no field of an unknown type',
	! in_array( 'spacer', array_column( $deactivated, 'type' ), true ) );
$check( 'AC11 every spacer became an ACF Message field',
	3 === count( array_filter( $deactivated, function ( $f ) {
		return 'message' === $f['type'] && false !== strpos( $f['class'], 'herd-spacer' );
	} ) ) );

$gap = acf_get_field( 'field_hsc_gap' );
ob_start();
acf_render_field_wrap( $gap );
$deactivated_html = ob_get_clean();
$check( 'AC11 and renders with no input on the host site', ! preg_match( '/<(input|textarea|select)/', $deactivated_html ) );
$check( 'AC11 and does not report an unknown field type',
	false === strpos( acf_get_field_type_label( $gap['type'] ), 'Unknown' ) );
$check( 'AC11 widths and labels are untouched by the conversion',
	wp_list_pluck( $deactivated, 'width' ) === wp_list_pluck( $before, 'width' ) );
$check( 'AC11 no postmeta appears while deactivated',
	0 === (int) $wpdb->get_var( $wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key LIKE %s", $page_id, '%gap%' ) ) );

// The corruption path: ACF's Field Type select has no option for a type it does
// not know, so a field group re-saved while Herd is off posts back the first one.
$corrupt         = acf_get_field( 'field_hsc_gap2' );
$corrupt['type'] = 'text';
$corrupt['name'] = 'hsc_gap2';
acf_update_field( $corrupt );

herd_editor_activate();
$reactivated = $snapshot();

$check( 'AC11 reactivating restores the layout unchanged', $reactivated === $before );
if ( $reactivated !== $before ) {
	foreach ( $before as $key => $was ) {
		if ( ! isset( $reactivated[ $key ] ) || $reactivated[ $key ] !== $was ) {
			WP_CLI::line( '       ' . $key . ' was ' . wp_json_encode( $was ) . ' now ' . wp_json_encode( isset( $reactivated[ $key ] ) ? $reactivated[ $key ] : null ) );
		}
	}
}
$check( 'AC11 including one corrupted to text by a re-save',
	isset( $reactivated['field_hsc_gap2'] ) && 'spacer' === $reactivated['field_hsc_gap2']['type'] );
$check( 'AC11 and a Line spacer keeps its style across the round trip',
	isset( $reactivated['field_hsc_gap'] ) && 'line' === $reactivated['field_hsc_gap']['style'] );

/* ------------------------------------------------------------------------ */

$teardown();

WP_CLI::line( '' );
if ( $fail ) {
	WP_CLI::error( sprintf( '%d passed, %d failed: %s', $pass, count( $fail ), implode( '; ', $fail ) ) );
}
WP_CLI::success( sprintf( '%d checks passed. Field group, block and page removed.', $pass ) );
