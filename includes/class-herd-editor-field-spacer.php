<?php
/**
 * The Spacer field: a sized gap that holds nothing.
 *
 * Herd flows fields left to right and wraps when the next one will not fit in
 * the row. That is the right default and it leaves dead space wherever the
 * arithmetic says so — two 66% fields cannot pair up, so the first row keeps 34%
 * of nothing. A Spacer is how a field group takes charge of that: it consumes
 * horizontal space so the fields around it land where they were meant to, and it
 * is the difference between "this select happens to be followed by whatever came
 * next in the array" and "this select owns its line".
 *
 * Modelled on ACF's Message, Tab and Accordion, which already solve "renders in
 * the admin, holds no value". Like them it is `category = 'layout'`, which is
 * what `herd_editor_is_layout_field()` reads and therefore what keeps a spacer
 * out of every count and summary Herd derives.
 *
 * IT HOLDS NO DATA, EVER. `render_field()` prints no input, so nothing is
 * serialized, nothing reaches `$_POST['acf']`, and no postmeta row is written —
 * the same mechanism Message relies on. `update_value()` and `load_value()`
 * below are belt and braces against a site calling `update_field()` on one by
 * hand.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'acf_field' ) || class_exists( 'Herd_Editor_Field_Spacer' ) ) {
	return;
}

/**
 * A field that occupies a row's width and nothing else.
 */
class Herd_Editor_Field_Spacer extends acf_field {

	/**
	 * Never expose a spacer through the REST API.
	 *
	 * ACF reads this property when it builds a post type's field schema. A spacer
	 * has no value to expose, and a null property in a schema is a field a
	 * consumer has to learn to skip.
	 *
	 * @var bool
	 */
	public $show_in_rest = false;

	/**
	 * Declare the field type.
	 *
	 * @return void
	 */
	public function initialize() {
		$this->name        = 'spacer';
		$this->label       = __( 'Spacer', 'herd-editor' );
		$this->category    = 'layout';
		$this->description = __( 'Occupies space in a row so the fields around it land where you want them. Holds no data and renders nothing on the front end.', 'herd-editor' );
		// ACF ships a preview for each of its own types; there is none for this.
		$this->preview_image = '';
		$this->doc_url       = '';
		/*
		 * `required` off is the setting that matters: a spacer can never be
		 * required, so it can never block a save. `bindings` off because there is
		 * no value to bind to.
		 */
		$this->supports = array(
			'required' => false,
			'bindings' => false,
		);
		$this->defaults = array(
			'herd_spacer_style' => 'blank',
		);
	}

	/**
	 * Render the field.
	 *
	 * Deliberately empty, and that is the whole design. No input means nothing to
	 * serialize, which means no postmeta row, which means a spacer is invisible to
	 * `get_fields()`, to a block's `data` attribute, and to REST without any of
	 * them having to be taught about it.
	 *
	 * The gap itself is drawn by the wrapper, which `acf_render_field_wrap()`
	 * emits regardless, sized by the width setting from
	 * includes/herd-editor-width.php.
	 *
	 * @param array $field The field array.
	 * @return void
	 */
	public function render_field( $field ) {}

	/**
	 * Draw the Style control under the Presentation tab.
	 *
	 * Width is not rendered here: it is ACF's own wrapper setting, already on this
	 * tab, and includes/herd-editor-width.php turns it into a segmented control
	 * for every field type at once. A spacer's width is the point of the field,
	 * but it is not a setting the field owns.
	 *
	 * Label is not rendered here either, and it is not rendered on the form at
	 * all: `herd_editor_spacer_silence()` drops it on the way to the screen. A
	 * spacer never says anything. What ACF's Field Label input becomes for this
	 * type is a name for whoever is building the field group — it is what the
	 * field group editor's list of fields shows, so three spacers in one group
	 * can be told apart — and it goes no further than that screen.
	 *
	 * @param array $field The field array.
	 * @return void
	 */
	public function render_field_presentation_settings( $field ) {
		acf_render_field_setting(
			$field,
			array(
				'label'        => __( 'Style', 'herd-editor' ),
				'instructions' => __( 'A blank spacer is invisible and only takes up space. A line draws a hairline across it.', 'herd-editor' ),
				'name'         => 'herd_spacer_style',
				'type'         => 'button_group',
				'choices'      => array(
					'blank' => __( 'Blank', 'herd-editor' ),
					'line'  => __( 'Line', 'herd-editor' ),
				),
				'default_value' => 'blank',
				'allow_null'    => 0,
			)
		);
	}

	/**
	 * Strip the settings a field that holds nothing has no business carrying.
	 *
	 * Line for line what ACF's own Message, Tab and Accordion do, and for the same
	 * reasons — this is the layout-field contract, not an invention:
	 *
	 * `name` is the important one. A nameless field cannot key `get_fields()`,
	 * cannot appear in a block's `data` attribute, and cannot collide with a real
	 * field, which is most of Part 4's job done by ACF before Herd asks. It also
	 * keeps the value out of ACF's per-name cache, which is the "caching issue"
	 * ACF's own comment refers to.
	 *
	 * `required` is cleared here as well as answered in `validate_value()` below,
	 * because ACF's client-side validation reads the field array and would put a
	 * red ring around a gap.
	 *
	 * `value` is false rather than null for the reason ACF gives: null reads as
	 * "not loaded yet" and sends it round the loading path again.
	 *
	 * @param array $field The field array as loaded.
	 * @return array The field, stripped.
	 */
	public function load_field( $field ) {
		$field['name']         = '';
		$field['instructions'] = '';
		$field['required']     = 0;
		$field['value']        = false;
		return $field;
	}

	/**
	 * Never load a value.
	 *
	 * @param mixed $value   The value found in the database.
	 * @param mixed $post_id The post id the value belongs to.
	 * @param array $field   The field array.
	 * @return null
	 */
	public function load_value( $value, $post_id, $field ) {
		return null;
	}

	/**
	 * Never save a value.
	 *
	 * Returning null makes `acf_update_value()` delete rather than write, so a
	 * field group that had a real field where a spacer now sits cleans up the row
	 * it left behind instead of stranding it in postmeta forever.
	 *
	 * @param mixed $value   The value about to be saved.
	 * @param mixed $post_id The post id the value belongs to.
	 * @param array $field   The field array.
	 * @return null
	 */
	public function update_value( $value, $post_id, $field ) {
		return null;
	}

	/**
	 * Never fail validation.
	 *
	 * A spacer renders no input, so ACF has nothing to validate and this never
	 * fires in normal use. It is here for the field group that ticks Required on
	 * a spacer through an import or a hand-written array: the save must not be
	 * blocked by a field the editor cannot see, let alone fill in.
	 *
	 * @param bool|string $valid Whether the value is valid.
	 * @param mixed       $value The value.
	 * @param array       $field The field array.
	 * @param string      $input The input element's name.
	 * @return true
	 */
	public function validate_value( $valid, $value, $field, $input ) {
		return true;
	}

	/**
	 * Keep a spacer out of the REST schema.
	 *
	 * @param array $field The field array.
	 * @return array An empty schema.
	 */
	public function get_rest_schema( $field ) {
		return array();
	}
}
