<?php
/**
 * Registration and lifecycle for the Spacer field type.
 *
 * The field itself is class-herd-editor-field-spacer.php. This is everything
 * around it: registration, where the Style setting is really stored, and the
 * one ACF layout a spacer cannot survive. This file is deliberately a
 * compatibility shim: it loads independently of the Herd screen and never
 * rewrites host field groups during activation or deactivation.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * The wrapper class every spacer carries.
 *
 * It is a marker, and it is the reason a spacer can be recovered after the
 * plugin has been deactivated and the field group re-saved. See
 * `herd_editor_activate()` for what it recovers from.
 */
const HERD_EDITOR_SPACER_CLASS = 'herd-spacer';

/** The wrapper class a Line spacer carries in addition. */
const HERD_EDITOR_SPACER_LINE_CLASS = 'herd-spacer--line';

/**
 * Register the field type.
 *
 * `acf/include_field_types` fires inside ACF's own `init` at priority 5, before
 * any field group is queried and long before anything renders. Field types are
 * resolved lazily through `acf_get_field_type()`, so this is early enough for a
 * field group however it is stored — `acf-json`, `acf_add_local_field_group()`,
 * or the database. The database is the one that would show "Unknown" if this
 * were late, because it is the only one that cannot be re-registered by a theme.
 *
 * @return void
 */
function herd_editor_register_spacer() {
	require_once HERD_EDITOR_DIR . 'includes/class-herd-editor-field-spacer.php';
	if ( class_exists( 'Herd_Editor_Field_Spacer' ) ) {
		acf_register_field_type( 'Herd_Editor_Field_Spacer' );
	}
}
add_action( 'acf/include_field_types', 'herd_editor_register_spacer' );

/* -------------------------------------------------------------------------
 * Style, and where it is really kept
 * ---------------------------------------------------------------------- */

/**
 * Wrapper classes for a style.
 *
 * @param string $style 'blank' or 'line'.
 * @return string[] Class names.
 */
function herd_editor_spacer_classes( $style ) {
	$classes = array( HERD_EDITOR_SPACER_CLASS );
	if ( 'line' === $style ) {
		$classes[] = HERD_EDITOR_SPACER_LINE_CLASS;
	}
	return $classes;
}

/**
 * Mirror the Style setting into the field's wrapper class on save.
 *
 * The setting lives where a setting should — `herd_spacer_style`, drawn by the
 * field type under Presentation. The mirror exists because ACF's field group
 * editor only posts the settings its *rendered inputs* produce, and
 * `acf_update_field()` writes what was posted without merging what was stored.
 * With Herd deactivated, `spacer` resolves to nothing, so none of the field
 * type's own settings render, so none of them post, so re-saving that field
 * group drops them.
 *
 * ACF's generic Presentation view renders the wrapper class input for every
 * field type, known or not. A class token therefore round-trips a re-save that
 * a setting key cannot — the same argument that makes `wrapper['width']` the
 * only acceptable home for widths.
 *
 * @param array $field The field array about to be written.
 * @return array The field, carrying its marker classes.
 */
function herd_editor_spacer_update_field( $field ) {
	$style   = isset( $field['herd_spacer_style'] ) && 'line' === $field['herd_spacer_style'] ? 'line' : 'blank';
	$classes = isset( $field['wrapper']['class'] ) ? preg_split( '/\s+/', (string) $field['wrapper']['class'], -1, PREG_SPLIT_NO_EMPTY ) : array();

	// Rebuilt rather than appended to, so switching Line back to Blank actually
	// removes the token instead of leaving both on the wrapper.
	$classes = array_values( array_diff( $classes, array( HERD_EDITOR_SPACER_CLASS, HERD_EDITOR_SPACER_LINE_CLASS ) ) );
	$classes = array_merge( $classes, herd_editor_spacer_classes( $style ) );

	$field['wrapper']['class'] = implode( ' ', array_unique( $classes ) );
	$field['herd_spacer_style'] = $style;

	return $field;
}
add_filter( 'acf/update_field/type=spacer', 'herd_editor_spacer_update_field' );

/**
 * Recover the Style setting from the wrapper class when the setting is gone.
 *
 * The other half of the mirror above, and the reason it is worth having: a field
 * group re-saved while Herd was deactivated comes back with its classes intact
 * and `herd_spacer_style` missing entirely. Without this the spacer silently
 * reverts to Blank; with it, Line survives a round trip through a site that had
 * never heard of the field type.
 *
 * @param array $field The field array as loaded.
 * @return array The field, with a style.
 */
function herd_editor_spacer_load_field( $field ) {
	if ( isset( $field['herd_spacer_style'] ) && in_array( $field['herd_spacer_style'], array( 'blank', 'line' ), true ) ) {
		return $field;
	}
	$class = isset( $field['wrapper']['class'] ) ? (string) $field['wrapper']['class'] : '';
	$field['herd_spacer_style'] = false !== strpos( $class, HERD_EDITOR_SPACER_LINE_CLASS ) ? 'line' : 'blank';
	return $field;
}
add_filter( 'acf/load_field/type=spacer', 'herd_editor_spacer_load_field' );

/**
 * A spacer never renders text.
 *
 * The label is dropped on the way to the screen, not on the way to the database.
 * A field group holding three spacers needs to tell them apart, and the field
 * group editor's list of fields is drawn from `$field['label']` — blanking it in
 * `load_field()` would leave an author staring at three unnamed rows. So the
 * label survives as the spacer's name for whoever is building the field group,
 * and never reaches a form.
 *
 * `acf_render_field_wrap()` runs `acf_prepare_field()` before it emits anything,
 * and `acf_render_field_label()` prints no element at all for an empty label —
 * not an empty one — so this leaves nothing behind to hide.
 *
 * @param array $field The field array.
 * @return array The field, with nothing left to say.
 */
function herd_editor_spacer_silence( $field ) {
	$field['label']        = '';
	$field['instructions'] = '';
	return $field;
}
add_filter( 'acf/prepare_field/type=spacer', 'herd_editor_spacer_silence' );

/**
 * Publish the spacer's state onto its rendered wrapper.
 *
 * Two attributes, both read by src/css/_acf-spacer.scss and neither by anything
 * else:
 *
 * `data-herd-spacer` carries the style, so the stylesheet does not have to trust
 * a class an editor can retype in the wrapper class input.
 *
 * `aria-hidden` is the accessibility half of "renders as nothing visible", and it
 * is unconditional because `herd_editor_spacer_silence()` above means there is
 * never anything in a spacer for a screen reader to reach. A spacer is a gap,
 * and arriving at one would leave a screen reader user working out what an empty
 * unnamed field wants from them.
 *
 * `acf/field_wrapper_attributes` has no type variation of its own, so the check
 * is explicit.
 *
 * @param array $wrapper The wrapper attributes.
 * @param array $field   The field array.
 * @return array The wrapper attributes.
 */
function herd_editor_spacer_wrapper( $wrapper, $field ) {
	if ( empty( $field['type'] ) || 'spacer' !== $field['type'] ) {
		return $wrapper;
	}
	$wrapper['data-herd-spacer'] = isset( $field['herd_spacer_style'] ) && 'line' === $field['herd_spacer_style'] ? 'line' : 'blank';
	$wrapper['aria-hidden']      = 'true';
	return $wrapper;
}
add_filter( 'acf/field_wrapper_attributes', 'herd_editor_spacer_wrapper', 10, 2 );

/* -------------------------------------------------------------------------
 * The one layout a spacer cannot survive
 * ---------------------------------------------------------------------- */

/**
 * Does this field hold a spacer directly?
 *
 * @param array $field A repeater or flexible-content field array.
 * @return bool
 */
function herd_editor_has_spacer( $field ) {
	foreach ( (array) ( isset( $field['sub_fields'] ) ? $field['sub_fields'] : array() ) as $sub ) {
		if ( isset( $sub['type'] ) && 'spacer' === $sub['type'] ) {
			return true;
		}
	}
	return false;
}

/**
 * Force a table-layout repeater holding a spacer into block layout.
 *
 * ACF's `table` layout renders one column per sub-field, with the labels hoisted
 * into a `<thead>`. A spacer there is an empty column under an empty heading, on
 * every row, forever — the field renders as a hole rather than as a gap, which
 * is the opposite of what it is for.
 *
 * Of the two ways out, forcing the layout beats excluding the field: an excluded
 * spacer changes what the row looks like without saying so, and the author who
 * added it has no way to tell it was dropped. This way the repeater looks
 * different, obviously, and `herd_editor_spacer_notices()` says why.
 *
 * Done in `prepare_field`, which decides what is rendered, rather than in
 * `load_field` or `validate_field`, which decide what is stored. The field group
 * keeps saying `table`; only the screen disagrees. Herd's own
 * `normalizeTableRepeaters()` already rewrites every table repeater into block
 * shape, so this is for the Block Editor and Classic, which Herd does not own.
 *
 * @param array $field The repeater field array.
 * @return array The field, in block layout if it holds a spacer.
 */
function herd_editor_spacer_repeater_layout( $field ) {
	if ( isset( $field['layout'] ) && 'table' === $field['layout'] && herd_editor_has_spacer( $field ) ) {
		$field['layout'] = 'block';
	}
	return $field;
}
add_filter( 'acf/prepare_field/type=repeater', 'herd_editor_spacer_repeater_layout' );

/**
 * Walk a field group's fields, including sub-fields and flexible layouts.
 *
 * @param array    $fields   Field arrays.
 * @param callable $callback Receives each field array.
 * @return void
 */
function herd_editor_walk_fields( $fields, $callback ) {
	foreach ( (array) $fields as $field ) {
		if ( ! is_array( $field ) || empty( $field['type'] ) ) {
			continue;
		}
		$callback( $field );
		if ( ! empty( $field['sub_fields'] ) ) {
			herd_editor_walk_fields( $field['sub_fields'], $callback );
		}
		foreach ( (array) ( isset( $field['layouts'] ) ? $field['layouts'] : array() ) as $layout ) {
			if ( ! empty( $layout['sub_fields'] ) ) {
				herd_editor_walk_fields( $layout['sub_fields'], $callback );
			}
		}
	}
}

/**
 * Tell the author when a repeater's layout has been overruled.
 *
 * Surfaced rather than done quietly: the alternative is a repeater that renders
 * differently from how the field group says it is configured, on a site nobody
 * is watching, for a reason nobody can find.
 *
 * @return void
 */
function herd_editor_spacer_notices() {
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( ! $screen || 'acf-field-group' !== $screen->post_type || 'post' !== $screen->base ) {
		return;
	}
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! $post_id ) {
		return;
	}
	$group = acf_get_field_group( $post_id );
	if ( ! $group ) {
		return;
	}

	$overruled = array();
	herd_editor_walk_fields(
		acf_get_fields( $group ),
		function ( $field ) use ( &$overruled ) {
			if ( 'repeater' === $field['type'] && isset( $field['layout'] ) && 'table' === $field['layout'] && herd_editor_has_spacer( $field ) ) {
				$overruled[] = $field['label'] ? $field['label'] : $field['name'];
			}
		}
	);

	if ( ! $overruled ) {
		return;
	}

	printf(
		'<div class="notice notice-warning"><p>%s</p></div>',
		esc_html(
			sprintf(
				/* translators: %s: comma separated list of repeater field labels. */
				_n(
					'%s holds a Spacer and is set to Table layout. Table layout gives every field its own column, so a spacer would render as an empty column under an empty heading. It is being shown as Block layout instead.',
					'%s hold a Spacer and are set to Table layout. Table layout gives every field its own column, so a spacer would render as an empty column under an empty heading. They are being shown as Block layout instead.',
					count( $overruled ),
					'herd-editor'
				),
				implode( ', ', $overruled )
			)
		)
	);
}
add_action( 'admin_notices', 'herd_editor_spacer_notices' );

/* -------------------------------------------------------------------------
 * Optional migration support
 * ---------------------------------------------------------------------- */

/**
 * Every database-backed field on the site, as field arrays.
 *
 * Local field groups — `acf-json` and `acf_add_local_field_group()` — are
 * returned by ACF like any other, and are skipped here on `ID`: a local field
 * has none, and the plugin has no business rewriting a file in somebody's theme
 * or a PHP array in their code. Those live in version control, which is a better
 * backup than anything this could do.
 *
 * @return array[] Field arrays with a real post ID.
 */
function herd_editor_stored_fields() {
	if ( ! function_exists( 'acf_get_field_groups' ) ) {
		return array();
	}
	/*
	 * ACF caches loaded fields and field groups for the length of the request.
	 * Deactivation and activation are normally separate requests and never see a
	 * stale one, but they can be called back to back — by WP-CLI, or by a test —
	 * and a converter reading its own pre-conversion cache silently does nothing.
	 */
	foreach ( array( 'fields', 'field-groups' ) as $store ) {
		$cache = acf_get_store( $store );
		if ( $cache ) {
			$cache->reset();
		}
	}
	$found = array();
	foreach ( acf_get_field_groups() as $group ) {
		herd_editor_walk_fields(
			acf_get_fields( $group ),
			function ( $field ) use ( &$found ) {
				if ( ! empty( $field['ID'] ) ) {
					$found[] = $field;
				}
			}
		);
	}
	return $found;
}

/**
 * Turn every stored spacer into an empty Message field.
 *
 * WHY THIS WRITES TO THE HOST SITE ON DEACTIVATE, which is not a thing a plugin
 * should do lightly:
 *
 * Left alone, a spacer in a deactivated site is a field of an unregistered type.
 * ACF renders that harmlessly — a stray label over an empty box, no notice, no
 * error, and nothing saved. The damage is one step further on. ACF's Field Type
 * select has no option for a type it does not know, so no option is marked
 * selected, so the browser posts the first one — `text`. `acf_update_field()`
 * writes what was posted without merging what was stored. One Update on an
 * unrelated field in that group silently turns every spacer into a live Text
 * field with a name, which then writes postmeta and shows up in `get_fields()`.
 *
 * Message is the right landing place: ACF ships it, it is `category = 'layout'`,
 * it holds no value, it is out of REST, and an empty one renders as nothing.
 * The site is left with a field group that still works and still looks roughly
 * right, rather than with a trap.
 *
 * The marker class rides along, so `herd_editor_activate()` can find these
 * again. Reactivating restores the layout unchanged.
 *
 * @return void
 */
function herd_editor_convert_spacers_to_messages() {
	if ( ! function_exists( 'acf_update_field' ) ) {
		return;
	}
	foreach ( herd_editor_stored_fields() as $field ) {
		if ( 'spacer' !== $field['type'] ) {
			continue;
		}
		// `update_field` has already put the marker classes on; keep them and let
		// them carry the style across.
		$field             = herd_editor_spacer_update_field( $field );
		$field['type']     = 'message';
		$field['message']  = '';
		$field['esc_html'] = 0;
		unset( $field['herd_spacer_style'] );
		acf_update_field( $field );
	}
}

/**
 * Turn Herd's markers back into spacers.
 *
 * Recovers from both ways a spacer can be left behind:
 *
 *   - `message`, which is what `herd_editor_deactivate()` converted it to
 *   - `text`, which is what ACF's Field Type select turns it into if somebody
 *     re-saved the field group while Herd was off — including on a field group
 *     stored in `acf-json`, which deactivation could not reach
 *
 * The marker class is what makes the second case recoverable at all: ACF's
 * generic Presentation view renders the wrapper class input for every field
 * type, so `herd-spacer` survives a re-save that drops everything else.
 *
 * A field that has since been given a real value is not touched. Converting one
 * back would orphan whatever is in postmeta, and a Text field somebody has
 * typed into is not a spacer any more whatever its classes say.
 *
 * @return void
 */
function herd_editor_restore_converted_spacers() {
	if ( ! function_exists( 'acf_update_field' ) ) {
		return;
	}
	foreach ( herd_editor_stored_fields() as $field ) {
		if ( 'message' !== $field['type'] && 'text' !== $field['type'] ) {
			continue;
		}
		$class = isset( $field['wrapper']['class'] ) ? (string) $field['wrapper']['class'] : '';
		if ( ! preg_match( '/(^|\s)' . preg_quote( HERD_EDITOR_SPACER_CLASS, '/' ) . '(\s|$)/', $class ) ) {
			continue;
		}
		// Anything the field picked up while it was not a spacer is not carried
		// over: a message body, a default value, a maxlength.
		unset( $field['message'], $field['esc_html'], $field['new_lines'], $field['default_value'], $field['maxlength'], $field['placeholder'], $field['prepend'], $field['append'] );
		$field['type']              = 'spacer';
		$field['herd_spacer_style'] = false !== strpos( $class, HERD_EDITOR_SPACER_LINE_CLASS ) ? 'line' : 'blank';
		acf_update_field( $field );
	}
}
