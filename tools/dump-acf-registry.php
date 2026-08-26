<?php
/**
 * Dump the ACF field registry as WordPress actually has it at runtime, per block.
 *
 * The authority for any claim about what fields a block has. `acf-json` files are a
 * serialization of intent, not a statement of what is registered: a field group can
 * outlive its block (six do), and blocks can load fields no JSON file describes.
 *
 *   HERD_OUT=/tmp/acf-registry.json wp eval-file tools/dump-acf-registry.php
 *
 * @package herd-editor
 */
$out = array( 'blocks' => array(), 'orphan_groups' => array() );

$registered = array_keys( WP_Block_Type_Registry::get_instance()->get_all_registered() );
$acf_blocks = array_values( array_filter( $registered, function ( $n ) { return 0 === strpos( $n, 'acf/' ); } ) );
sort( $acf_blocks );

function herd_dump_fields( $fields ) {
	$out = array();
	foreach ( (array) $fields as $f ) {
		$row = array(
			'key'     => $f['key'],
			'name'    => $f['name'],
			'label'   => $f['label'],
			'type'    => $f['type'],
			'default' => isset( $f['default_value'] ) ? $f['default_value'] : null,
			'cond'    => ! empty( $f['conditional_logic'] ) ? $f['conditional_logic'] : 0,
		);
		if ( isset( $f['choices'] ) && is_array( $f['choices'] ) ) {
			$row['choices'] = array_keys( $f['choices'] );
		}
		if ( ! empty( $f['sub_fields'] ) ) {
			$row['sub'] = herd_dump_fields( $f['sub_fields'] );
		}
		if ( ! empty( $f['layouts'] ) ) {
			$row['layouts'] = array();
			foreach ( $f['layouts'] as $lay ) {
				$row['layouts'][ $lay['name'] ] = herd_dump_fields( isset( $lay['sub_fields'] ) ? $lay['sub_fields'] : array() );
			}
		}
		$out[] = $row;
	}
	return $out;
}

foreach ( $acf_blocks as $block ) {
	$groups = acf_get_field_groups( array( 'block' => $block ) );
	$entry  = array( 'groups' => array(), 'fields' => array() );
	foreach ( $groups as $g ) {
		$entry['groups'][] = array( 'key' => $g['key'], 'title' => $g['title'] );
		$entry['fields']   = array_merge( $entry['fields'], herd_dump_fields( acf_get_fields( $g ) ) );
	}
	$out['blocks'][ $block ] = $entry;
}

// Field groups located to a block that is not registered.
foreach ( acf_get_field_groups() as $g ) {
	foreach ( (array) $g['location'] as $rules ) {
		foreach ( (array) $rules as $rule ) {
			if ( 'block' === ( $rule['param'] ?? '' ) && '==' === ( $rule['operator'] ?? '' ) ) {
				if ( ! in_array( $rule['value'], $acf_blocks, true ) ) {
					$out['orphan_groups'][] = array( 'group' => $g['title'], 'key' => $g['key'], 'block' => $rule['value'] );
				}
			}
		}
	}
}

file_put_contents( getenv( 'HERD_OUT' ), wp_json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
WP_CLI::success( sprintf( '%d registered acf/* blocks, %d orphan group locations', count( $acf_blocks ), count( $out['orphan_groups'] ) ) );
