<?php
/**
 * Width as a layout control.
 *
 * Herd lays a block form out in rows, and until now a field's place in a row was
 * inferred from its type: compact controls took half a row, everything else took
 * the whole one. That is a good default and a bad ceiling. A select that governs
 * the six fields below it should be able to own its line, and the field group is
 * the only place that knows it does.
 *
 * The setting is not Herd's. ACF has stored a per-field wrapper width since 5.0
 * (field -> Presentation -> Wrapper Attributes -> Width), and that is the source
 * of truth here, untouched. A parallel `herd_width` meta key would make the
 * layout a hostage: deactivate the plugin and every width is gone. Written where
 * ACF writes it, the widths survive export and import, `acf-json` sync, Clone
 * fields, ACF upgrades, and uninstalling Herd entirely — after which they are
 * still editable through stock ACF, which is the point.
 *
 * What Herd changes is the control, not the storage. ACF renders width as a
 * freeform number input, which is how a field group ends up holding a 47% and a
 * 53%. This file replaces that input with a segmented control over a fixed set of
 * presets, inside the field group editor only.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * The widths a field can be given, as whole percentages.
 *
 * Chosen so that every one of them divides a twelve column grid exactly: 12, 9,
 * 8, 6, 4 and 3 columns. That is what makes three 33% fields fill a row at any
 * container width and any zoom level, and it is why the set is not arbitrary. A
 * site adding to it should pick numbers that divide twelve too, or accept that
 * the stylesheet has no rule for them and the field falls back to full width.
 *
 * @return int[] Percentages, widest first.
 */
function herd_editor_width_presets() {
	/**
	 * Filter the widths offered in the field group editor.
	 *
	 * @param int[] $presets Whole percentages, widest first.
	 */
	$presets = (array) apply_filters( 'herd_editor_width_presets', array( 100, 75, 66, 50, 33, 25 ) );

	$presets = array_values( array_unique( array_filter( array_map( 'intval', $presets ), function ( $width ) {
		return $width > 0 && $width <= 100;
	} ) ) );
	rsort( $presets );

	// A set without 100 has no way to say "own the line", and `herd_editor_snap_width()`
	// relies on 100 being the value that maps to ACF's empty.
	if ( ! in_array( 100, $presets, true ) ) {
		array_unshift( $presets, 100 );
	}

	return $presets;
}

/**
 * The segmented control's choices.
 *
 * 100% is keyed on the empty string rather than on 100, because empty is what
 * ACF already stores for a full width field and what 47 of this site's 69 sized
 * fields would otherwise churn to on their next save. Same state, one spelling.
 *
 * @return array<string,string> Value to label.
 */
function herd_editor_width_choices() {
	$choices = array();
	foreach ( herd_editor_width_presets() as $width ) {
		$key = 100 === $width ? '' : (string) $width;
		/* translators: %d: width as a whole percentage. */
		$choices[ $key ] = sprintf( __( '%d%%', 'herd-editor' ), $width );
	}
	return $choices;
}

/**
 * Snap a stored width onto the preset set.
 *
 * Host field groups predate this control and hold whatever someone typed. Six of
 * this site's own sized fields do: a 30, a 34, a 47, a 48, a 49 and a 70. None of
 * them is a mistake — they are what a freeform input produces — so they are moved
 * to the nearest preset rather than discarded. A tie goes to the wider preset,
 * because a field that is slightly too narrow truncates its contents and a field
 * that is slightly too wide only steals dead space.
 *
 * This is the normal path on any site that has ever used ACF's own width input,
 * not an edge case.
 *
 * @param mixed $value The stored `wrapper['width']`.
 * @return string The snapped value: a preset, or '' meaning full width.
 */
function herd_editor_snap_width( $value ) {
	// ACF stores an unset width as '' and `acf_numval()` reads '' and 0 alike as
	// no width at all.
	if ( ! is_numeric( $value ) ) {
		return '';
	}
	$width = (float) $value;
	if ( $width <= 0 || $width >= 100 ) {
		return '';
	}

	$best = 100;
	foreach ( herd_editor_width_presets() as $preset ) {
		if ( abs( $preset - $width ) < abs( $best - $width ) ) {
			$best = $preset;
		}
	}

	return 100 === $best ? '' : (string) $best;
}

/**
 * Replace ACF's width input with a segmented control.
 *
 * Implemented as a filter over ACF's own settings render rather than by hiding
 * the number input with CSS and shadowing it with a second control. A hidden but
 * live input still posts, and the first field group somebody imports carrying a
 * `width: 40` would have two controls disagreeing about what the field is.
 * Swapping the type leaves exactly one input, under exactly the name ACF gave it
 * — `acf_fields[N][wrapper][width]` — so nothing downstream of the POST knows
 * this happened.
 *
 * ACF has no hook of its own here: the width input is rendered inline by the
 * `acf-field-group/field` view, after the `acf/render_field_*_settings` actions,
 * and `acf_get_view()` is not filterable. But the view builds it through
 * `acf_render_field_wrap()`, so `acf/prepare_field` reaches it like any other
 * field. The variation matches on `_name`, which is still `width` at that point;
 * `name` has already been rewritten to the full input path.
 *
 * @param array $field The width setting's own field array.
 * @return array The field, as a button group.
 */
function herd_editor_width_control( $field ) {
	/*
	 * `name=width` fires for every field a site has ever called `width`. The
	 * prefix is what makes this the wrapper setting and not somebody's image
	 * dimensions field: ACF builds it as `{$field['prefix']}[wrapper]`, and only
	 * the field group editor renders a field under that prefix.
	 */
	if ( 'number' !== $field['type'] || ! isset( $field['prefix'] ) || '[wrapper]' !== substr( (string) $field['prefix'], -9 ) ) {
		return $field;
	}

	$stored  = isset( $field['value'] ) ? $field['value'] : '';
	$snapped = herd_editor_snap_width( $stored );

	$field['type'] = 'button_group';
	// `acf_validate_field()` has already run, and it ran against `number` — so the
	// button group's own defaults were never filled in and every one of them has
	// to be stated here.
	$field['choices']       = herd_editor_width_choices();
	$field['default_value'] = '';
	$field['allow_null']    = 0;
	$field['layout']        = 'horizontal';
	$field['return_format'] = 'value';
	$field['value']         = $snapped;
	// The number input carried these; a segmented control labelled "100%" does not
	// need a "width" prefix or a "%" suffix.
	$field['prepend'] = '';
	$field['append']  = '';

	$field['wrapper']['class'] = trim( ( isset( $field['wrapper']['class'] ) ? $field['wrapper']['class'] : '' ) . ' herd-width' );

	/*
	 * A snap is a change to what the field group says, made without asking, so it
	 * is reported where the change is rather than in a log nobody reads.
	 *
	 * Only a real number counts as a snap. An empty width was never a width, 100
	 * and '' are two spellings of the same state, and a non-numeric value is
	 * corruption rather than somebody's considered 47% — "Was abc%" tells an
	 * editor nothing they can act on.
	 */
	if ( is_numeric( $stored ) && (string) $stored !== $snapped && ! ( '' === $snapped && 100 === (int) $stored ) ) {
		$field['instructions'] = sprintf(
			/* translators: 1: the width stored in the field group, 2: the preset it was moved to. */
			__( 'Was %1$s%%, snapped to %2$s. Save the field group to keep this.', 'herd-editor' ),
			esc_html( (string) $stored ),
			'' === $snapped ? __( '100%', 'herd-editor' ) : esc_html( $snapped . '%' )
		);

		/**
		 * Fires when a stored width is moved onto the preset set.
		 *
		 * @param string $stored  The width the field group holds.
		 * @param string $snapped The preset it was moved to, or '' for full width.
		 * @param array  $field   The width setting's field array.
		 */
		do_action( 'herd_editor_width_snapped', (string) $stored, $snapped, $field );
	}

	return $field;
}
add_filter( 'acf/prepare_field/name=width', 'herd_editor_width_control' );

/**
 * Give the segmented control the room ACF's own row does not have.
 *
 * ACF renders the wrapper `class` and `id` settings *before* `width`, each
 * carrying `data-append => wrapper`, and its field group script folds them into
 * the width field's `.acf-input`: the input is wrapped in a `ul.acf-hl`, each
 * appended setting becomes another `li`, and `data-cols` is set to the count.
 * `acf-global.css` then pins every `li` to a third of the row.
 *
 * That third was measured for the sixty pixel number spinner ACF ships. A
 * segmented control over six presets is several times wider and cannot shrink —
 * its labels are `white-space: nowrap` and `flex: 1` floors at min-content — so
 * it overflowed its column and painted over the `class` input beside it. What
 * that looked like was a seventh, empty width, which is the one thing it was
 * not.
 *
 * So the row is given a wrap and the control is given the line. Scoped to
 * `herd-width`, the class `herd_editor_width_control()` puts on the wrapper, so
 * a screen where the swap did not happen is left exactly as ACF ships it.
 *
 * Inline rather than a build entry: this is a dozen lines that exist only to
 * repair the control the function above creates, and they belong beside it
 * rather than in a stylesheet the editor screen never loads.
 *
 * @return void
 */
function herd_editor_width_styles() {
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( ! $screen || 'acf-field-group' !== $screen->post_type || 'post' !== $screen->base ) {
		return;
	}

	$row = '.acf-field-setting-wrapper.herd-width > .acf-input > ul.acf-hl[data-cols]';

	wp_register_style( 'herd-editor-width', false, array(), HERD_EDITOR_VERSION );
	wp_enqueue_style( 'herd-editor-width' );
	wp_add_inline_style(
		'herd-editor-width',
		"{$row} { flex-wrap: wrap; }\n" .
		// ACF's thirds; the widths are what the control cannot live inside.
		"{$row} > li { width: auto; }\n" .
		// The control owns its line; `class` and `id` share the one under it.
		"{$row} > li:first-child { flex: 0 0 100%; padding-bottom: 10px; }\n" .
		"{$row} > li ~ li { flex: 1 1 0; min-width: 0; }\n" .
		// Six presets need about this much and never the whole settings column.
		".acf-field-setting-wrapper.herd-width .acf-button-group { max-width: 520px; }\n"
	);
}
add_action( 'admin_enqueue_scripts', 'herd_editor_width_styles' );
