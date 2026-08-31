<?php
/**
 * Acceptance check for herd_editor_normalize_acf_block_data().
 *
 * Builds a throwaway field group and block, hands the normaliser the data shapes
 * the editor actually produces, runs the result through ACF's own save filter,
 * and asserts what reaches the block comment. The fixture is deleted afterwards;
 * nothing already on the site is touched.
 *
 * Written as a tool rather than as a unit test because every claim here is a
 * claim about ACF's behaviour rather than about this plugin's code: that a
 * <form> posts block values keyed by field key while a saved block comment holds
 * them flattened to meta names, that ACF decides which of the two it has been
 * handed from the first key alone, that acf_get_field() resolves a bare meta
 * name to the field of that name, and that updating a repeater with a scalar
 * empties it. Those four together are what silently erased a filled repeater on
 * Save Draft, and each of them, changed, would let it happen again.
 *
 *   wp eval-file tools/verify-block-data.php
 *
 * @package herd-editor
 */

if ( ! function_exists( 'acf_get_field_groups' ) ) {
	WP_CLI::error( 'ACF Pro is not active.' );
}
if ( ! function_exists( 'herd_editor_normalize_acf_block_data' ) ) {
	WP_CLI::error( 'Herd Editor is not active.' );
}

// Never let the fixture reach a theme's acf-json directory.
acf_update_setting( 'json', false );

const HERD_BD_GROUP = 'group_herd_blockdata_check';
const HERD_BD_BLOCK = 'herd-blockdata-check';

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
	$group = acf_get_field_group( HERD_BD_GROUP );
	if ( $group ) {
		acf_delete_field_group( $group['ID'] );
	}
	// acf_update_field() resolves a string parent as a FIELD key, so a fixture
	// that passed a group key would have left its fields at parent 0.
	foreach ( $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'acf-field' AND post_name LIKE 'field\\_hbd\\_%'" ) as $stale ) {
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

/* -- Fixture -------------------------------------------------------------- */

/*
 * Real fields rather than a local field group: the bug turns on acf_get_field()
 * resolving a bare meta name like `facts` to the field of that name, which is a
 * lookup against the field posts.
 */
$group_id = acf_update_field_group(
	array(
		'key'      => HERD_BD_GROUP,
		'title'    => 'Herd block data check (throwaway)',
		'location' => array( array( array( 'param' => 'block', 'operator' => '==', 'value' => 'acf/' . HERD_BD_BLOCK ) ) ),
		'active'   => true,
	)
)['ID'];

$order = 0;
foreach ( array(
	array( 'key' => 'field_hbd_heading', 'label' => 'Heading', 'name' => 'hbd_heading', 'type' => 'text' ),
	array( 'key' => 'field_hbd_note', 'label' => 'Note', 'name' => 'hbd_note', 'type' => 'text' ),
	// Required with a minimum, so the sweep has something to report if the rows
	// go missing on the way in.
	array( 'key' => 'field_hbd_facts', 'label' => 'Facts', 'name' => 'hbd_facts', 'type' => 'repeater', 'required' => 1, 'min' => 1 ),
) as $field ) {
	// The parent must be the group's post ID. A string parent is looked up as a
	// field key, which silently orphans every field at parent 0.
	$field['parent']     = $group_id;
	$field['menu_order'] = $order++;
	acf_update_field( $field );
}
acf_update_field( array( 'key' => 'field_hbd_number', 'label' => 'Number', 'name' => 'number', 'type' => 'text', 'parent' => 'field_hbd_facts', 'menu_order' => 0 ) );

acf_register_block_type(
	array(
		'name'            => HERD_BD_BLOCK,
		'title'           => 'Herd block data check',
		'render_callback' => '__return_empty_string',
	)
);

/**
 * Put data through both save filters in the order content_save_pre runs them,
 * and return the meta the block comment ends up carrying.
 *
 * @param array $data A block's `data` attribute.
 * @return array
 */
$save = function ( $data ) {
	$attrs   = array( 'name' => 'acf/' . HERD_BD_BLOCK, 'data' => $data, 'mode' => 'preview' );
	$comment = '<!-- wp:acf/' . HERD_BD_BLOCK . ' ' . wp_json_encode( $attrs ) . ' /-->';
	$saved   = acf_parse_save_blocks( herd_editor_normalize_saved_blocks( addslashes( $comment ) ) );
	$blocks  = parse_blocks( stripslashes( stripslashes( $saved ) ) );
	return isset( $blocks[0]['attrs']['data'] ) ? $blocks[0]['attrs']['data'] : array();
};

/** The visible half of a block's meta, which is all any of these claims are about. */
$values = function ( $meta ) {
	$out = array();
	foreach ( $meta as $key => $value ) {
		if ( '_' !== substr( (string) $key, 0, 1 ) ) {
			$out[ $key ] = $value;
		}
	}
	return $out;
};

/* -- A block saved once, then edited again -------------------------------- */

/*
 * What the editor holds after a second edit: the form's own field keys, written
 * over the flat data the block was loaded with, with everything the form did not
 * render left in place. `note` stands for a field behind conditional logic —
 * ACF disables a hidden field, so the form never posts one.
 */
$second_edit = array(
	'field_hbd_heading' => 'New heading',
	'field_hbd_facts'   => array(
		'row-0' => array( 'field_hbd_number' => '100' ),
		'row-1' => array( 'field_hbd_number' => '200' ),
	),
	'hbd_heading'               => 'Old heading',
	'_hbd_heading'              => 'field_hbd_heading',
	'hbd_facts'                 => '1',
	'_hbd_facts'                => 'field_hbd_facts',
	'hbd_facts_0_number'        => 'Old number',
	'_hbd_facts_0_number'       => 'field_hbd_number',
	'hbd_note'                  => 'Hidden but kept',
	'_hbd_note'                 => 'field_hbd_note',
);

$saved = $values( $save( $second_edit ) );

$check( 'a re-edited repeater keeps its rows', 2 === (int) ( isset( $saved['hbd_facts'] ) ? $saved['hbd_facts'] : 0 ),
	'hbd_facts = ' . var_export( isset( $saved['hbd_facts'] ) ? $saved['hbd_facts'] : null, true ) );
$check( 'every row of it is stored',
	array( '100', '200' ) === array( isset( $saved['hbd_facts_0_number'] ) ? $saved['hbd_facts_0_number'] : null, isset( $saved['hbd_facts_1_number'] ) ? $saved['hbd_facts_1_number'] : null ) );
$check( 'an edited text field does not revert to its stored value',
	isset( $saved['hbd_heading'] ) && 'New heading' === $saved['hbd_heading'], var_export( isset( $saved['hbd_heading'] ) ? $saved['hbd_heading'] : null, true ) );
$check( 'a field the form never rendered survives the save',
	isset( $saved['hbd_note'] ) && 'Hidden but kept' === $saved['hbd_note'] );
$check( 'its field key is carried with it, as ACF stores meta',
	isset( $saved['_hbd_note'] ) || isset( $save( $second_edit )['_hbd_note'] ) );

/* -- Rows the editor deleted must not come back --------------------------- */

$saved = $values(
	$save(
		array(
			'field_hbd_facts' => array( 'row-0' => array( 'field_hbd_number' => '100' ) ),
			'hbd_facts'               => '2',
			'_hbd_facts'              => 'field_hbd_facts',
			'hbd_facts_0_number'      => '100',
			'hbd_facts_1_number'      => 'Deleted',
		)
	)
);
$check( 'a deleted row is not resurrected', ! isset( $saved['hbd_facts_1_number'] ) && 1 === (int) $saved['hbd_facts'] );

/* -- A repeater the form did not render ----------------------------------- */

/*
 * A repeater behind a toggle nobody turned on is not in the submission at all.
 * Its stored rows have to come through untouched: a scalar row count handed to
 * ACF's repeater as a value is what empties one.
 */
$saved = $values(
	$save(
		array(
			'field_hbd_heading' => 'New heading',
			'hbd_facts'                 => '2',
			'_hbd_facts'                => 'field_hbd_facts',
			'hbd_facts_0_number'        => '100',
			'_hbd_facts_0_number'       => 'field_hbd_number',
			'hbd_facts_1_number'        => '200',
			'_hbd_facts_1_number'       => 'field_hbd_number',
		)
	)
);
$check( 'an unrendered repeater keeps its rows', 2 === (int) $saved['hbd_facts'] && '200' === $saved['hbd_facts_1_number'] );

/* -- The shapes that were already correct stay correct --------------------- */

$saved = $values(
	$save(
		array(
			'field_hbd_heading' => 'Fresh',
			'field_hbd_facts'   => array( 'row-0' => array( 'field_hbd_number' => '7' ) ),
		)
	)
);
$check( 'a new block still converts the way ACF converts it',
	'Fresh' === $saved['hbd_heading'] && 1 === (int) $saved['hbd_facts'] && '7' === $saved['hbd_facts_0_number'] );

$flat = array( 'hbd_heading' => 'Untouched', '_hbd_heading' => 'field_hbd_heading', 'hbd_facts' => 1, '_hbd_facts' => 'field_hbd_facts', 'hbd_facts_0_number' => '9', '_hbd_facts_0_number' => 'field_hbd_number' );
$check( 'a block nobody edited is passed through unchanged', $flat === herd_editor_normalize_acf_block_data( $flat ) );

$request = array( 'field_hbd_heading' => 'Fresh' );
$check( 'a submission with nothing stored beside it is left to ACF', $request === herd_editor_normalize_acf_block_data( $request ) );

/* -- The filter is a no-op on everything else ----------------------------- */

$prose = addslashes( "<!-- wp:paragraph -->\n<p>Nothing to do here.</p>\n<!-- /wp:paragraph -->" );
$check( 'content with no ACF block comes back byte for byte', $prose === herd_editor_normalize_saved_blocks( $prose ) );

$core = addslashes( '<!-- wp:heading {"level":3} --><h3>Kept</h3><!-- /wp:heading -->' );
$check( 'a core block carrying attributes is not rewritten', $core === herd_editor_normalize_saved_blocks( $core ) );

/* -- The pre-publish sweep reads the same data ----------------------------- */

/*
 * The document the sweep validates has not been through content_save_pre, so it
 * still carries whatever the browser last wrote. Mixed, a filled repeater reads
 * as empty and reports itself required.
 */
$document = '<!-- wp:acf/' . HERD_BD_BLOCK . ' ' . wp_json_encode(
	array(
		'name' => 'acf/' . HERD_BD_BLOCK,
		'data' => array(
			'field_hbd_facts' => array( 'row-0' => array( 'field_hbd_number' => '100' ) ),
			'hbd_facts'               => '1',
			'_hbd_facts'              => 'field_hbd_facts',
			'hbd_facts_0_number'      => 'Old number',
			'_hbd_facts_0_number'     => 'field_hbd_number',
		),
		'mode' => 'preview',
	)
) . ' /-->';

$errors = herd_editor_validate_document_acf( $document, array( 'client-1' ) );
$check( 'a filled repeater does not report itself required', array() === $errors,
	implode( '; ', wp_list_pluck( $errors, 'message' ) ) );

/* ------------------------------------------------------------------------ */

$teardown();

WP_CLI::line( '' );
if ( $fail ) {
	WP_CLI::error( sprintf( '%d passed, %d failed: %s', $pass, count( $fail ), implode( '; ', $fail ) ) );
}
WP_CLI::success( sprintf( '%d checks passed. Field group removed.', $pass ) );
