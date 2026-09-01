<?php
/**
 * Plugin Name: Herd Editor
 * Description: A dedicated Herd Editor mode for editing existing ACF blocks alongside Classic and Block Editor.
 * Version: 1.0.4
 * Requires at least: 7.1
 * Requires PHP: 7.4
 * Requires Plugins: advanced-custom-fields-pro
 * Text Domain: herd-editor
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

define( 'HERD_EDITOR_VERSION', '1.0.4' );
define( 'HERD_EDITOR_URL', plugin_dir_url( __FILE__ ) );
/** This file's path, for the activation and deactivation hooks in includes/herd-editor-spacer.php. */
define( 'HERD_EDITOR_FILE', __FILE__ );
define( 'HERD_EDITOR_DIR', plugin_dir_path( __FILE__ ) );
/**
 * The oldest ACF Pro this plugin is tested against.
 *
 * `Requires Plugins` above keeps the plugin from activating without ACF Pro at
 * all, but that header cannot express a version. Everything Herd reaches into —
 * the `acf/ajax/fetch-block` form endpoint, the field settings tabs, the
 * `acf/prepare_field` variations — is 6.0 or older, and 6.0 is where ACF settled
 * the field group editor markup this plugin renders into.
 */
define( 'HERD_EDITOR_MIN_ACF', '6.0' );

/** @var string */
global $herd_editor_screen_hook;

/**
 * The spike is intentionally unavailable without ACF Pro. It must never create
 * a second persistence model when the authoritative ACF block implementation is absent.
 */
function herd_editor_has_acf_pro() {
	if ( ! function_exists( 'acf_get_setting' ) || ! acf_get_setting( 'pro' ) ) {
		return false;
	}
	/*
	 * Degrade rather than fatal on an ACF older than Herd was built for. The
	 * editor simply does not offer itself, which is the same thing that happens
	 * without ACF Pro at all, and the site keeps both native editors.
	 */
	return defined( 'ACF_VERSION' ) && version_compare( ACF_VERSION, HERD_EDITOR_MIN_ACF, '>=' );
}

/** A JSON-safe schema map limited to the ACF blocks in this document. */
function herd_editor_search_fields( $content ) {
	if ( ! function_exists( 'acf_get_block_fields' ) ) return array();
	$blocks = array();
	herd_editor_acf_blocks_from_tree( parse_blocks( (string) $content ), $blocks );
	$map = array();
	foreach ( $blocks as $block ) {
		$fields = (array) acf_get_block_fields( array( 'name' => (string) $block['blockName'] ) );
		foreach ( $fields as $field ) {
			if ( empty( $field['key'] ) ) continue;
			$choices = array();
			foreach ( (array) ( $field['choices'] ?? array() ) as $value => $label ) {
				if ( is_scalar( $value ) && is_scalar( $label ) ) $choices[ (string) $value ] = wp_strip_all_tags( (string) $label );
			}
			$map[ (string) $field['key'] ] = array( 'label' => wp_strip_all_tags( (string) ( $field['label'] ?? '' ) ), 'choices' => $choices );
		}
	}
	return $map;
}

/*
 * The site's answers to the questions Herd's filters ask, and the screen that
 * asks them. First of the includes, because every one of those filters takes a
 * stored setting as its default -- so this has to be readable by the time
 * anything asks.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-settings.php';

/*
 * Width as a layout control. Loaded unconditionally and on every admin request,
 * not just Herd's own screen: the control it replaces belongs to the ACF field
 * group editor, which is a screen Herd does not own. Its one filter checks for
 * ACF itself, so this is inert when ACF is absent.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-width.php';

/*
 * Which fields hold no value, and the Spacer field type. Both load on every
 * request rather than on Herd's screen: a field type has to be registered
 * wherever a field group might render — the Block Editor, Classic, the REST
 * API, a front-end `get_field()` call — or the field group holding one reports
 * an unknown type on every surface but this plugin's own.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-layout-fields.php';
require_once HERD_EDITOR_DIR . 'includes/herd-editor-spacer.php';

/*
 * Which editor opens by default, and what a new post opens with. Loaded on
 * every request rather than Herd's own screen: the setting is edited on
 * Settings > Writing and on a user profile, and the redirect that honours it
 * has to be in place before post.php chooses an editor.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-default.php';

/*
 * What a save has to say for itself. Loaded on every admin request rather than
 * Herd's own screen: the redirect it feeds is chosen inside post.php, long
 * before the screen this plugin owns is asked to render anything.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-saved.php';

/**
 * A post type list with the blanks and duplicates taken out.
 *
 * @param mixed $post_types Post type names, from a filter or a stored setting.
 * @return string[]
 */
function herd_editor_post_types( $post_types ) {
	return array_values( array_unique( array_filter( (array) $post_types ) ) );
}

/**
 * The post types Herd is offered for.
 *
 * @return string[]
 */
function herd_editor_allowed_post_types() {
	return herd_editor_post_types( apply_filters( 'herd_editor_post_types', herd_editor_setting( 'post_types', array( 'page', 'post' ) ) ) );
}

/**
 * Determine whether the current user may open Herd Editor for a post.
 *
 * @param WP_Post $post Post being edited.
 * @return bool
 */
function herd_editor_supports_post( $post ) {
	if ( ! $post instanceof WP_Post || ! in_array( $post->post_type, herd_editor_allowed_post_types(), true ) ) {
		return false;
	}
	$user = wp_get_current_user();
	/*
	 * Whoever may edit the post may edit it here. Herd writes the same
	 * post_content through the same edit_post() as the other two editors, so a
	 * capability of its own would be claiming this editor is more dangerous
	 * than the ones it sits beside.
	 *
	 * This used to also require `manage_options`, which was a pilot gate rather
	 * than a policy: on a site whose editors are not administrators it meant
	 * nobody but an admin could open Herd at all. The filter below is how a site
	 * narrows it again -- for a pilot, or for a role that should stay on Classic.
	 */
	$allowed = user_can( $user, 'edit_post', $post->ID );
	/* A site may narrow it again from the settings screen; empty means it has not. */
	$extra = (string) herd_editor_setting( 'capability', '' );
	if ( $allowed && '' !== $extra ) {
		$allowed = user_can( $user, $extra );
	}
	/**
	 * Filter access to Herd Editor.
	 *
	 * @param bool    $allowed Whether access is allowed by default.
	 * @param WP_User $user    Current user.
	 * @param WP_Post $post    Post being edited.
	 */
	return (bool) apply_filters( 'herd_editor_user_can_access', $allowed, $user, $post );
}

/**
 * The Herd screen's URL for one post.
 *
 * @param int $post_id Post to edit.
 * @return string
 */
function herd_editor_url( $post_id ) {
	return add_query_arg( array( 'page' => 'herd-editor', 'post' => absint( $post_id ) ), admin_url( 'admin.php' ) );
}

/**
 * Take over a lock without leaving Herd's editor route.
 *
 * Core's post.php handler always redirects to its native editor. Herd uses the
 * identical nonce action and lock API, but owns this route so a successful
 * takeover returns to the editor the user chose.
 */
function herd_editor_handle_post_lock_takeover() {
	if ( ! is_admin() || 'herd-editor' !== ( isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '' ) || empty( $_GET['get-post-lock'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$post    = $post_id ? get_post( $post_id ) : null;
	if ( ! $post || ! herd_editor_supports_post( $post ) ) {
		wp_die( esc_html__( 'You cannot edit this item in Herd Editor.', 'herd-editor' ), 403 );
	}
	check_admin_referer( 'lock-post_' . $post_id );
	wp_set_post_lock( $post_id );
	wp_safe_redirect( herd_editor_url( $post_id ) );
	exit;
}
add_action( 'admin_init', 'herd_editor_handle_post_lock_takeover', 1 );

/** Return a fresh native lock token unless another editor currently owns it. */
function herd_editor_active_post_lock( $post_id ) {
	if ( wp_check_post_lock( $post_id ) ) {
		return '';
	}
	$lock = wp_set_post_lock( $post_id );
	return $lock ? implode( ':', $lock ) : '';
}

/**
 * Reject a stale Herd submission before post.php can write post content or meta.
 *
 * Core's lock check deliberately reports only *other* users. Herd also verifies
 * the submitted token against _edit_lock so an old tab owned by the same user
 * cannot overwrite a newer editing session.
 */
function herd_editor_validate_post_lock_before_save() {
	if ( 'editpost' !== ( isset( $_POST['action'] ) ? sanitize_key( wp_unslash( $_POST['action'] ) ) : '' ) || empty( $_POST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
		return;
	}
	$post_id   = isset( $_POST['post_ID'] ) ? absint( $_POST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	// Not sanitized because it is not used as data: the next six lines require it
	// to be exactly two integers separated by a colon, and hash_equals() compares
	// it to what is stored. A sanitiser could only turn an invalid token into a
	// different invalid token.
	// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$submitted = isset( $_POST['active_post_lock'] ) ? (string) wp_unslash( $_POST['active_post_lock'] ) : '';
	$current   = $post_id ? (string) get_post_meta( $post_id, '_edit_lock', true ) : '';
	$parts     = explode( ':', $submitted );
	// Core's own filter, applied so Herd measures the lock against the same
	// window core does rather than a guess of its own.
	// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
	$window = (int) apply_filters( 'wp_check_post_lock_window', 150 );
	$valid     = 2 === count( $parts )
		&& ctype_digit( $parts[0] )
		&& ctype_digit( $parts[1] )
		&& (int) $parts[1] === get_current_user_id()
		&& (int) $parts[0] > time() - $window
		&& '' !== $current
		&& hash_equals( $current, $submitted );

	if ( ! $valid ) {
		wp_die( esc_html__( 'This post is no longer locked by your editing session. Reload it from the post list before saving.', 'herd-editor' ), 409 );
	}
}
add_action( 'admin_init', 'herd_editor_validate_post_lock_before_save', 1 );

/**
 * The current user's browser-recovery key, minted on first use.
 *
 * The key is deliberately scoped to a user, not a post: IndexedDB is
 * browser-local and this prevents a second WordPress account on the same
 * browser profile from reading a copy left by the first account.
 *
 * It is a per-user constant, so it travels inline in the screen's own config
 * blob rather than over a round trip. Fetching it cost a full admin bootstrap
 * in front of the editor's first paint, and bought nothing: the blob is already
 * inlined into this same authenticated response, so anything able to read one
 * can read the other.
 *
 * @return string 43-character base64url key.
 */
function herd_editor_recovery_key() {
	$user_id = get_current_user_id();
	$key     = (string) get_user_meta( $user_id, '_herd_editor_recovery_key', true );
	if ( ! preg_match( '/^[A-Za-z0-9_-]{43}$/', $key ) ) {
		$key = rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' );
		update_user_meta( $user_id, '_herd_editor_recovery_key', $key );
	}
	return $key;
}

/**
 * Why the browser's exact post-lock token could not save, if it could not.
 *
 * The rules core's own lock check leaves implicit, written out: a token has to
 * be well formed, belong to this user, be recent enough by the same window the
 * server judges by, and still match what is stored. herd_editor_ajax_save_post()
 * asks this before it writes anything, which is the point -- ownership is
 * confirmed in the same request that saves, not in one before it that a
 * takeover could slip in behind.
 *
 * @param int    $post_id Post being edited.
 * @param string $token   The `active_post_lock` value the browser holds.
 * @return string One of missing|malformed|another-user|expired|stale, or '' when the token is good.
 */
function herd_editor_post_lock_reason( $post_id, $token ) {
	$current = (string) get_post_meta( $post_id, '_edit_lock', true );
	$parts   = explode( ':', (string) $token );
	// Core's own filter, applied so Herd measures the lock against the same
	// window core does rather than a guess of its own.
	// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
	$window = (int) apply_filters( 'wp_check_post_lock_window', 150 );
	if ( '' === (string) $token ) { return 'missing'; }
	if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) || ! ctype_digit( $parts[1] ) ) { return 'malformed'; }
	if ( (int) $parts[1] !== get_current_user_id() ) { return 'another-user'; }
	if ( (int) $parts[0] <= time() - $window ) { return 'expired'; }
	if ( '' === $current ) { return 'missing'; }
	if ( ! hash_equals( $current, (string) $token ) ) { return 'stale'; }
	return '';
}

/** Flatten a parsed Gutenberg tree in the same order as the browser document. */
function herd_editor_acf_blocks_from_tree( $blocks, &$result ) {
	foreach ( (array) $blocks as $block ) {
		if ( ! empty( $block['blockName'] ) && 0 === strpos( $block['blockName'], 'acf/' ) ) {
			$result[] = $block;
		}
		herd_editor_acf_blocks_from_tree( isset( $block['innerBlocks'] ) ? $block['innerBlocks'] : array(), $result );
	}
}

/** Compare a stored value against a conditional-logic rule value, ACF's way. */
function herd_editor_condition_equals( $value, $rule_value ) {
	if ( is_array( $value ) ) {
		return in_array( $rule_value, array_map( 'strval', $value ), true );
	}
	return (string) $value === $rule_value;
}

/** The number a `>` or `<` rule compares against: a row/choice count, or the value itself. */
function herd_editor_condition_size( $value ) {
	return is_array( $value ) ? (float) count( $value ) : (float) $value;
}

/** Test one conditional-logic rule against the values stored for $block_id. */
function herd_editor_condition_is_met( $rule, $block_id, $seen = array() ) {
	if ( empty( $rule['field'] ) ) { return true; }
	$field = acf_get_field( $rule['field'] );
	/* A rule pointing at a field that no longer exists is one ACF's form drops
	 * rather than fails. */
	if ( ! $field || '' === (string) $field['name'] ) { return true; }
	/* ACF's form reads null from a disabled control, and hiding a field disables
	 * it, so a rule reading a hidden field sees nothing. That is what collapses a
	 * chain of toggles: turning off the master switch hides the style buttons,
	 * which in turn hide the gallery whose only rule reads them. */
	$value      = herd_editor_field_is_visible( $field, $block_id, $seen ) ? acf_get_value( $block_id, $field ) : null;
	$rule_value = isset( $rule['value'] ) ? (string) $rule['value'] : '';
	/* ACF's browser rules read a control, where "0" is a value and only a blank
	 * control is empty; PHP's own emptiness would hide every unchecked toggle. */
	$has_value = ! ( null === $value || false === $value || '' === $value || ( is_array( $value ) && ! $value ) );
	$contains  = is_array( $value )
		? in_array( $rule_value, array_map( 'strval', $value ), true )
		: ( '' !== $rule_value && false !== strpos( (string) $value, $rule_value ) );

	switch ( isset( $rule['operator'] ) ? $rule['operator'] : '==' ) {
		case '==':
		case '===':
			return herd_editor_condition_equals( $value, $rule_value );
		case '!=':
		case '!==':
			return ! herd_editor_condition_equals( $value, $rule_value );
		case '==empty':
			return ! $has_value;
		case '!=empty':
			return $has_value;
		case '==contains':
			return $contains;
		case '!=contains':
			return ! $contains;
		case '==pattern':
			return '' !== $rule_value && 1 === @preg_match( '/' . str_replace( '/', '\\/', $rule_value ) . '/', (string) $value ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- An unusable pattern must not decide visibility.
		case '>':
			return herd_editor_condition_size( $value ) > (float) $rule_value;
		case '<':
			return herd_editor_condition_size( $value ) < (float) $rule_value;
	}
	/* An operator Herd does not know cannot be allowed to wave a field through:
	 * treat it as shown, and let the field answer for itself. */
	return true;
}

/**
 * Whether a block field's editor would show it, so its rules apply.
 *
 * ACF's form disables the inputs of a conditionally hidden field, so a browser
 * save never validates one. This sweep sees no form, so it has to make the same
 * decision itself — otherwise a required field behind a toggle nobody turned on
 * blocks publishing forever, with no visible field to fix.
 */
function herd_editor_field_is_visible( $field, $block_id, $seen = array() ) {
	if ( empty( $field['conditional_logic'] ) || ! is_array( $field['conditional_logic'] ) ) { return true; }
	/* Rules that point back at each other would recurse forever; the field on the
	 * path already being asked about counts as shown, which ends the walk. */
	if ( isset( $seen[ $field['key'] ] ) ) { return true; }
	$seen[ $field['key'] ] = true;
	foreach ( $field['conditional_logic'] as $group ) { // Groups are ORed together.
		if ( ! is_array( $group ) || ! $group ) { return true; }
		$met = true;
		foreach ( $group as $rule ) { // Rules within a group are ANDed.
			if ( ! herd_editor_condition_is_met( $rule, $block_id, $seen ) ) { $met = false; break; }
		}
		if ( $met ) { return true; }
	}
	return false;
}

/**
 * Does `$name` address a repeater or flexible-content row the form no longer has?
 *
 * The mirror of `addressesRemovedRow()` in src/acf/helpers.js, and it exists for
 * the same reason: an omitted key is normally a value worth keeping, but a key
 * belonging to a row the editor deleted would come back the moment the field
 * grew to that length again. A repeater stores its row count, flexible content
 * the list of layouts in play; an index at or past that length is a dead row.
 *
 * @param string $name      A meta name, without its leading underscore.
 * @param array  $converted Meta the form just submitted.
 * @return bool
 */
function herd_editor_data_addresses_removed_row( $name, $converted ) {
	foreach ( $converted as $field => $value ) {
		if ( ! is_string( $field ) || '_' === substr( $field, 0, 1 ) ) { continue; }
		/* ACF names sub-values `<field>_<index>_<subfield>`, so `facts` owns
		 * `facts_0_number` but not a sibling that merely shares its prefix, like
		 * `facts_footnote`. */
		if ( 0 !== strpos( $name, $field . '_' ) || ! preg_match( '/^(\d+)_/', substr( $name, strlen( $field ) + 1 ), $row ) ) { continue; }
		if ( is_array( $value ) ) {
			$length = count( $value );
		} elseif ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) {
			$length = (int) $value;
		} else {
			// A length that cannot be read decides nothing: losing a value is
			// worse than carrying a stale one.
			continue;
		}
		if ( (int) $row[1] >= $length ) { return true; }
	}
	return false;
}

/**
 * Reduce a block's `data` to the one dialect ACF can read it in.
 *
 * ACF stores block values two ways. A <form> posts them keyed by field key and
 * nested — `field_r => [ 'row-0' => [ field_s => '100' ] ]` — while saved block
 * comments hold them flattened to meta names, `facts => 1, facts_0_number =>
 * '100', _facts_0_number => field_s`. `ACF_Local_Meta::add()` converts the first
 * into the second, and decides which it has been handed by looking at the *first
 * key alone*.
 *
 * Herd hands it both at once. `mergeAcfBlockData()` writes what the form
 * submitted — field keys — over the block's stored data, which after its first
 * save is flat, and keeps whatever the form omitted so a conditionally hidden
 * field is not erased by an edit somewhere else on the same block. The result
 * begins with a field key, so ACF converts the whole thing: it runs
 * `acf_update_values()` over the flat leftovers too, `acf_get_field()` resolves
 * a meta name like `heading` or `facts` to the field of that name, and the
 * stale scalar is written back last and wins. A text field silently reverts to
 * its previous value; a repeater is worse, because its flat key holds a row
 * count, and updating a repeater with a scalar empties it. That is a filled
 * repeater lost on the next Save Draft.
 *
 * So the halves are converted apart and merged as meta, which is a dialect ACF
 * stores verbatim. What the form submitted wins outright for the fields it
 * rendered; the rest — a hidden field, a retired one, a repeater behind a toggle
 * nobody turned on — stays flat and untouched, which is the only shape that
 * survives the round trip.
 *
 * @param array $data A block's `data` attribute.
 * @return array The same values, in meta format.
 */
function herd_editor_normalize_acf_block_data( $data ) {
	if ( ! is_array( $data ) || ! $data || ! function_exists( 'acf_is_field_key' ) || ! function_exists( 'acf_setup_meta' ) ) {
		return $data;
	}

	$request = array();
	$meta    = array();
	foreach ( $data as $key => $value ) {
		if ( acf_is_field_key( $key ) ) {
			$request[ $key ] = $value;
		} else {
			$meta[ $key ] = $value;
		}
	}
	// One dialect on its own is already something ACF reads correctly.
	if ( ! $request || ! $meta ) {
		return $data;
	}

	/* ACF caches loaded values under "{$post_id}:{$field_name}", repeater
	 * sub-values included, and acf_reset_meta() does not clear that store — so
	 * every block gets an id no earlier block has used. */
	static $namespace = 0;
	$scratch   = 'block_herd-editor-normalize-' . ( ++$namespace );
	$converted = acf_setup_meta( $request, $scratch );
	acf_reset_meta( $scratch );
	if ( ! is_array( $converted ) ) {
		return $data;
	}

	$kept = array();
	foreach ( $meta as $key => $value ) {
		$name = is_string( $key ) ? preg_replace( '/^_/', '', $key ) : (string) $key;
		// The form rendered this field and has just spoken for it.
		if ( array_key_exists( $name, $converted ) ) { continue; }
		if ( herd_editor_data_addresses_removed_row( $name, $converted ) ) { continue; }
		$kept[ $key ] = $value;
	}

	// Union rather than array_merge: what the form submitted wins, and neither
	// half's keys are renumbered on the way through.
	return $converted + $kept;
}

/**
 * Normalise every ACF block in content on its way to the database.
 *
 * Runs before `acf_parse_save_blocks()` at 5, so ACF is handed data in a single
 * dialect and its own conversion becomes a no-op rather than a rewrite.
 *
 * @param string $text Post content, slashed.
 * @return string
 */
function herd_editor_normalize_saved_blocks( $text = '' ) {
	/*
	 * This compatibility pass exists for Herd's mixed form/meta representation.
	 * Gutenberg, REST, imports and WP-CLI already hand ACF a dialect it owns, so
	 * do not parse or rewrite their documents. The Herd screen carries this field
	 * on deliberate saves, and src/ui/App.js adds it to core autosaves as well.
	 */
	if ( empty( $_POST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- this only scopes a filter; the owning save path verifies its nonce and capability.
		return $text;
	}
	if ( ! function_exists( 'acf_has_block_type' ) ) {
		return $text;
	}
	$raw      = stripslashes( (string) $text );
	$replaced = preg_replace_callback(
		'/<!--\s+wp:(?P<name>[\S]+)\s+(?P<attrs>{[\S\s]+?})\s+(?P<void>\/)?-->/',
		'herd_editor_normalize_saved_blocks_callback',
		$raw
	);
	/* Content nothing here rewrote goes back untouched rather than through a
	 * slashing round trip, and a pattern that gave up — a backtrack limit on a
	 * very long document — must never be mistaken for an empty post. */
	if ( null === $replaced || $replaced === $raw ) {
		return $text;
	}
	return addslashes( $replaced );
}
add_filter( 'content_save_pre', 'herd_editor_normalize_saved_blocks', 4, 1 );

/**
 * Rewrite one block comment's `data`, leaving everything else exactly as found.
 *
 * @param array $matches The preg matches.
 * @return string
 */
function herd_editor_normalize_saved_blocks_callback( $matches ) {
	$name  = isset( $matches['name'] ) ? $matches['name'] : '';
	$attrs = isset( $matches['attrs'] ) ? json_decode( $matches['attrs'], true ) : null;
	if ( ! $name || ! is_array( $attrs ) || empty( $attrs['data'] ) || ! is_array( $attrs['data'] ) || ! acf_has_block_type( $name ) ) {
		return $matches[0];
	}
	$normalized = herd_editor_normalize_acf_block_data( $attrs['data'] );
	if ( $normalized === $attrs['data'] ) {
		return $matches[0];
	}
	$attrs['data'] = $normalized;
	return '<!-- wp:' . $name . ' ' . acf_serialize_block_attributes( $attrs ) . ' ' . ( isset( $matches['void'] ) ? $matches['void'] : '' ) . '-->';
}

/** Validate all ACF block values, including forms that Herd has not mounted. */
function herd_editor_validate_document_acf( $content, $client_ids = array() ) {
	$blocks = array();
	herd_editor_acf_blocks_from_tree( parse_blocks( (string) $content ), $blocks );
	$errors = array();
	if ( ! function_exists( 'acf_get_block_fields' ) || ! function_exists( 'acf_validate_value' ) || ! function_exists( 'acf_setup_meta' ) ) {
		return $errors;
	}
	foreach ( $blocks as $index => $block ) {
		/* The document under validation has not been through content_save_pre, so
		 * its blocks still carry whatever the browser last wrote — for an edited
		 * block, field keys over the flat data it was loaded with. Handed to ACF
		 * mixed, a filled repeater reads as empty and reports itself required. */
		$data   = isset( $block['attrs']['data'] ) && is_array( $block['attrs']['data'] ) ? herd_editor_normalize_acf_block_data( $block['attrs']['data'] ) : array();
		$fields = (array) acf_get_block_fields( array( 'name' => $block['blockName'], 'data' => $data ) );
		if ( ! $fields ) { continue; }
		/* ACF caches loaded values under "{$post_id}:{$field_name}", repeater
		 * sub-values included, and acf_reset_meta() does not clear that store — so
		 * every block gets an id no earlier block has used. */
		static $namespace = 0;
		$block_id = 'block_herd-editor-validate-' . ( ++$namespace );
		/* Block attributes store repeaters and flexible content flattened
		 * ( "portraits" => 3, "portraits_0_title" => "…" ), but ACF's validators
		 * expect the nested rows a <form> would post. Reading each value back out
		 * of ACF's local meta store rebuilds that shape; reaching into $data
		 * directly hands a repeater its row count instead of its rows, and every
		 * filled repeater fails its own `min`. */
		acf_setup_meta( $data, $block_id );
		foreach ( $fields as $field ) {
			if ( empty( $field['key'] ) || '' === (string) $field['name'] ) { continue; }
			/* Hiding a field hides everything inside it, so this one test also
			 * excuses the sub-fields ACF validates recursively below. */
			if ( ! herd_editor_field_is_visible( $field, $block_id ) ) { continue; }
			acf_reset_validation_errors();
			$valid = acf_validate_value( acf_get_value( $block_id, $field ), $field, '' );
			/* acf_validate_value() only ever returns a bool — the message it built
			 * lives in ACF's error store, which also carries sub-field failures a
			 * repeater reports without failing itself. */
			$reported = acf_get_validation_errors();
			if ( true === $valid && empty( $reported ) ) { continue; }
			$errors[] = array(
				'blockId' => isset( $client_ids[ $index ] ) ? sanitize_key( $client_ids[ $index ] ) : '',
				'field' => $field['key'],
				'message' => ! empty( $reported[0]['message'] ) ? (string) $reported[0]['message'] : __( 'This field is required.', 'herd-editor' ),
			);
		}
		acf_reset_validation_errors();
		acf_reset_meta( $block_id );
	}
	return $errors;
}

/**
 * The number redirect_post() would have chosen, without redirecting.
 *
 * Core decides what a save is called from the status it ended in and which
 * button posted -- wp-admin/includes/post.php:2189-2205 -- and then carries the
 * answer in `?message=`. Herd's save never redirects, so the number has to be
 * worked out on this side and handed back in the response instead.
 *
 * Only core's first branch is reachable from here: `addmeta` and `deletemeta`
 * belong to the Custom Fields box, which posts its own way and never through
 * this endpoint. Anything else falls through to 4, exactly as core's does.
 *
 * @param int $post_id Post that was just saved.
 * @return int A key into herd_editor_message_table().
 */
function herd_editor_save_message( $post_id ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- the endpoint verified the save nonce first.
	if ( ! isset( $_POST['save'] ) && ! isset( $_POST['publish'] ) ) {
		return 4;
	}
	switch ( get_post_status( $post_id ) ) {
		case 'pending':
			return 8;
		case 'future':
			return 9;
		case 'draft':
			return 10;
		default:
			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- as above.
			return isset( $_POST['publish'] ) ? 6 : 1;
	}
}

/**
 * Save the whole screen without navigating away from it.
 *
 * This is wp-admin/post.php's `editpost` case with the redirect taken off the
 * end. That case is only ever check_admin_referer() -> edit_post() ->
 * redirect_post() -> exit (post.php:236-248), and it is edit_post() that does
 * the actual work, so calling it here saves the post in precisely the way the
 * native screen does: the same meta boxes, the same ACF_Form_Post::save_post(),
 * the same revisions, the same content_save_pre normalisation.
 *
 * What it also does is fold in the two questions Herd used to ask first. A
 * publish used to cost three sequential admin bootstraps -- one for the lock
 * and validation preflight, one for the POST to post.php, one for the redirect
 * target it landed on -- and only the last of those saved anything. Asking all
 * three here costs one.
 *
 * The failure shapes are the browser's, not core's: a lost lock and a failed
 * field are both answers, not errors, because src/ui/App.js has somewhere
 * useful to put each of them. Only a request that should never have been made
 * comes back as an error status.
 */
function herd_editor_ajax_save_post() {
	$post_id = isset( $_POST['post_ID'] ) ? absint( $_POST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified immediately below.
	$post    = $post_id ? get_post( $post_id ) : null;
	if ( ! $post || ! herd_editor_supports_post( $post ) ) {
		wp_send_json_error( array( 'message' => __( 'You cannot save this post.', 'herd-editor' ) ), 403 );
	}

	/*
	 * The form's own nonce, under core's own action, so nothing about what the
	 * screen posts had to change to reach this endpoint. check_ajax_referer()
	 * rather than check_admin_referer(): the latter answers a bad nonce with
	 * wp_nonce_ays(), a full HTML "are you sure" page that fetch() cannot read.
	 */
	check_ajax_referer( 'update-post_' . $post_id, '_wpnonce' );

	/*
	 * edit_post() answers every refusal with wp_die(), and an AJAX wp_die is a
	 * bare string -- the browser's response.json() would throw on it and the
	 * save would be reported as a network failure. So every refusal it can
	 * reach is checked here first, where it can be a sentence instead.
	 */
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		wp_send_json_error( array( 'message' => __( 'You are not allowed to edit this item.', 'herd-editor' ) ), 403 );
	}

	// See herd_editor_validate_post_lock_before_save(): the token is validated by
	// shape and compared with hash_equals(), never used as data.
	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$lock = herd_editor_post_lock_reason( $post_id, isset( $_POST['active_post_lock'] ) ? wp_unslash( $_POST['active_post_lock'] ) : '' );
	if ( $lock ) {
		wp_send_json_success( array( 'ok' => false, 'lock' => $lock ) );
	}

	/*
	 * Whether this is a publish transition is the browser's answer to give.
	 * Core names the two submit controls inconsistently -- a published post's
	 * Update button is submit_button( 'Update', ..., 'save', ..., array( 'id'
	 * => 'publish' ) ), so it posts as `save` while carrying id="publish" --
	 * and only the name is posted. By name alone an Update of a live page and a
	 * Save draft are the same request, and the case that most needs validating
	 * would quietly stop being validated. src/save-request.js reads the id.
	 */
	if ( ! empty( $_POST['herd_validate'] ) ) {
		/*
		 * Deliberately raw. This is the serialized Gutenberg document, and it
		 * goes only to parse_blocks() for validation -- nothing here writes it.
		 * The save itself runs through edit_post(), where `content_save_pre` and
		 * core's own kses apply exactly as they do for the other two editors.
		 * Sanitising here would corrupt a document that is then not saved.
		 */
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$content = isset( $_POST['content'] ) ? wp_unslash( $_POST['content'] ) : '';
		// Client ids are matched against the parsed tree, never echoed or stored.
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$ids = isset( $_POST['clientIds'] ) && is_array( $_POST['clientIds'] ) ? wp_unslash( $_POST['clientIds'] ) : array();
		$errors  = herd_editor_validate_document_acf( $content, $ids );
		if ( $errors ) {
			wp_send_json_success( array( 'ok' => false, 'errors' => $errors ) );
		}
	}

	/*
	 * The last of edit_post()'s wp_die()s, and the one a normal editor can
	 * actually reach: _wp_translate_postdata() rejects an impossible publish
	 * date, and refuses a publish to anyone without the capability
	 * (wp-admin/includes/post.php:320-322). Running it here on a copy asks the
	 * same question in a form that can be answered. It reads capabilities and
	 * rewrites dates and does nothing else, so edit_post() running it again a
	 * moment later reaches the same verdict.
	 */
	// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- verified above, and handed to core exactly as edit_post() hands it: slashed, unsanitised, for core to translate.
	$translated = _wp_translate_postdata( true, $_POST );
	if ( is_wp_error( $translated ) ) {
		wp_send_json_success( array( 'ok' => false, 'message' => $translated->get_error_message() ) );
	}

	$saved_id = edit_post();
	if ( is_wp_error( $saved_id ) || ! $saved_id ) {
		wp_send_json_error( array( 'message' => __( 'The save did not complete.', 'herd-editor' ) ), 500 );
	}

	$message = herd_editor_save_message( $saved_id );
	$post    = get_post( $saved_id );

	/*
	 * Deliberately the same vocabulary as the boot blob in
	 * herd_editor_enqueue_assets(), so reconciling on the browser side is
	 * assignment onto the config it already has rather than a translation.
	 */
	wp_send_json_success(
		array(
			'ok'            => true,
			'postId'        => (int) $saved_id,
			'postStatus'    => $post->post_status,
			'statusLabel'   => herd_editor_status_label( $post ),
			'modifiedHuman' => herd_editor_saved_label( $post ),
			'isPublished'   => 'publish' === $post->post_status,
			'viewUrl'       => herd_editor_view_url( $post ),
			'permalink'     => (string) get_permalink( $post ),
			'slug'          => $post->post_name,
			/*
			 * The publish date, in the five parts core's touch_time() prints as
			 * fields. The publish box rebuilds its own date line out of these
			 * rather than being handed a sentence, so what it shows after a save
			 * is formatted by exactly the code that formats it while editing.
			 * Rebuilding from the fields already on screen would not do: they hold
			 * what the page was rendered with, and "Publish immediately" on a
			 * draft left open for an hour is an hour wrong by the time it saves.
			 */
			'dateParts'     => array(
				'aa' => get_post_time( 'Y', false, $post ),
				'mm' => get_post_time( 'm', false, $post ),
				'jj' => get_post_time( 'd', false, $post ),
				'hh' => get_post_time( 'H', false, $post ),
				'mn' => get_post_time( 'i', false, $post ),
			),
			'saveMarker'    => (string) get_post_modified_time( 'U', true, $post ),
			'notice'        => herd_editor_saved_notice( $post, $message ),
			'nonce'         => wp_create_nonce( 'update-post_' . $saved_id ),
			/* The save renewed the lock; hand the new token back so the
			 * watchdog in src/post-lock.js measures against this one. */
			'lock'          => herd_editor_active_post_lock( $saved_id ),
			'editUrl'       => herd_editor_url( $saved_id ),
		)
	);
}
add_action( 'wp_ajax_herd_editor_save_post', 'herd_editor_ajax_save_post' );

/** Render core's lock dialog while keeping every return path in Herd or its list. */
function herd_editor_post_lock_dialog( $post, $list_url ) {
	if ( ! function_exists( '_admin_notice_post_locked' ) ) {
		return;
	}
	ob_start();
	_admin_notice_post_locked();
	$dialog = ob_get_clean();
	if ( ! $dialog ) {
		return;
	}
	$takeover_url = add_query_arg( 'get-post-lock', '1', wp_nonce_url( herd_editor_url( $post->ID ), 'lock-post_' . $post->ID ) );
	$dialog = preg_replace( '/(<a class="button button-primary wp-tab-last" href=")[^"]+/', '$1' . esc_url( $takeover_url ), $dialog, 1 );
	/* Core treats an unfamiliar editor URL as a safe "Go back" destination; Herd's
	 * lost-lock state must instead offer only the post list. */
	$dialog = preg_replace( '/(<p>\s*<a class="button" href=")[^"]+/', '$1' . esc_url( $list_url ), $dialog, 1 );
	echo $dialog; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core generated the markup above.
}

/**
 * A built entry's dependencies and version, from the build manifest.
 *
 * @param string $entry Entry name, matching build/{entry}.asset.php.
 * @return array{dependencies: string[], version: string}
 */
function herd_editor_asset( $entry ) {
	$file = HERD_EDITOR_DIR . 'build/' . $entry . '.asset.php';
	return file_exists( $file ) ? require $file : array( 'dependencies' => array(), 'version' => HERD_EDITOR_VERSION );
}

/**
 * Every block name in a parsed tree, including inner blocks.
 *
 * @param array $blocks Parsed blocks.
 * @param array $names  Collected names, by reference, keyed by name.
 * @return void
 */
function herd_editor_collect_block_names( $blocks, &$names ) {
	foreach ( $blocks as $block ) {
		if ( ! empty( $block['blockName'] ) ) {
			$names[ $block['blockName'] ] = true;
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			herd_editor_collect_block_names( $block['innerBlocks'], $names );
		}
	}
}

/**
 * Block category slug to label, in WordPress's own display order.
 *
 * `get_block_categories()` is the same list the native inserter groups by, and
 * the same one `block_categories_all` lets a theme add to, so asking it keeps
 * the two inserters agreeing about what a block is. A block that declares
 * `"category": "media"` lands under Media here for the same reason it does
 * over there, and a theme that registers a category of its own gets its title
 * without telling Herd about it separately.
 *
 * Memoised: both the grouping and the group order need the answer, and the
 * call runs two filters.
 *
 * @param WP_Post|null $post Post being edited, for the editor context.
 * @return array<string,string> Category slug to title, in display order.
 */
function herd_editor_block_categories( $post = null ) {
	static $cache = null;
	if ( null !== $cache ) {
		return $cache;
	}
	$cache = array();
	if ( ! function_exists( 'get_block_categories' ) || ! class_exists( 'WP_Block_Editor_Context' ) ) {
		return $cache;
	}
	$context = new WP_Block_Editor_Context( $post instanceof WP_Post ? array( 'post' => $post ) : array() );
	foreach ( (array) get_block_categories( $context ) as $category ) {
		if ( empty( $category['slug'] ) ) {
			continue;
		}
		$slug  = (string) $category['slug'];
		$title = isset( $category['title'] ) ? (string) $category['title'] : '';
		$cache[ $slug ] = '' !== $title ? $title : herd_editor_humanize_slug( $slug );
	}
	return $cache;
}

/**
 * "call-to-action" becomes "Call To Action".
 *
 * The last resort, for a block whose category nothing ever registered. A theme
 * that names a category in sixty-five block.json files and never calls
 * `block_categories_all` is the common case, and a humanized slug is a better
 * heading than the slug itself.
 *
 * @param string $slug Category slug.
 * @return string
 */
function herd_editor_humanize_slug( $slug ) {
	return ucwords( trim( str_replace( array( '-', '_' ), ' ', (string) $slug ) ) );
}

/**
 * Display order of the inserter's groups.
 *
 * WordPress's own category order first, then any category a registered block
 * declares that WordPress does not know about -- sorted, so the order is the
 * same on every request -- then the fallback, which is always last.
 *
 * The unregistered labels are worked out here rather than left to the browser
 * on purpose: src/ui/Inserter.js appends groups this list does not name *after*
 * all of it, which would push a real group below "Other".
 *
 * The Inserter drops groups that nothing landed in, so naming a category no
 * block uses costs nothing.
 *
 * @param WP_Post|null $post Post being edited.
 * @return string[]
 */
function herd_editor_block_group_order( $post = null ) {
	$known = herd_editor_block_categories( $post );
	$order = array_values( $known );

	$extra = array();
	if ( class_exists( 'WP_Block_Type_Registry' ) ) {
		foreach ( WP_Block_Type_Registry::get_instance()->get_all_registered() as $type ) {
			$slug = (string) $type->category;
			if ( '' === $slug || isset( $known[ $slug ] ) ) {
				continue;
			}
			$extra[ $slug ] = herd_editor_humanize_slug( $slug );
		}
	}
	ksort( $extra );
	$order   = array_merge( $order, array_values( $extra ) );
	$order[] = __( 'Other', 'herd-editor' );

	/**
	 * Filter the display order of the inserter's groups.
	 *
	 * These are labels, not category slugs -- the same strings
	 * `herd_editor_block_groups()` maps blocks to. A curated set of groups need
	 * not correspond to registered block categories at all.
	 *
	 * @param string[]     $order Group labels, in display order.
	 * @param WP_Post|null $post  Post being edited.
	 */
	$stored = (array) herd_editor_setting( 'group_order', array() );
	if ( $stored ) {
		/* A curated list still gets the fallback, so nothing can vanish from the inserter. */
		$order = array_merge( $stored, array( __( 'Other', 'herd-editor' ) ) );
	}

	return apply_filters( 'herd_editor_block_group_order', array_values( array_unique( $order ) ), $post );
}

/**
 * Block name to inserter group, overriding the block's own category.
 *
 * Empty by default: a block's group is its registered category, resolved to a
 * label through WordPress's block category list. This filter is for a theme
 * whose blocks all declare one category -- the common shape, since a category
 * is usually a vendor namespace -- and which would rather curate a map here
 * than edit sixty-five block.json files.
 *
 * It does not have to be exhaustive. Anything it does not name falls back to
 * the block's category, and then to the fallback group.
 *
 * @param WP_Post|null $post Post being edited.
 * @return array<string,string> Block name to group label.
 */
function herd_editor_block_groups( $post = null ) {
	/**
	 * Filter the block-to-group map.
	 *
	 * @param array<string,string> $groups Block name to group label.
	 * @param WP_Post|null         $post   Post being edited.
	 */
	return (array) apply_filters( 'herd_editor_block_groups', (array) herd_editor_setting( 'groups', array() ), $post );
}

/**
 * Registered blocks Herd keeps out of its inserter.
 *
 * Empty by default, because WordPress already has the general mechanisms: a
 * block that should never be inserted declares
 * `"supports": { "inserter": false }`, which herd_editor_block_metadata()
 * honours alongside this list, and one that only belongs inside another
 * declares `parent` or `ancestor`.
 *
 * This filter is for the remaining case -- a block still valid in the native
 * editors and in older documents, but not a choice for new Herd content.
 *
 * Keeping this policy separate from the grouping map is deliberate: it means an
 * omitted block falls into the fallback group rather than silently disappearing
 * from the inserter.
 *
 * @return string[]
 */
function herd_editor_hidden_inserter_blocks() {
	return (array) apply_filters( 'herd_editor_hidden_inserter_blocks', (array) herd_editor_setting( 'hidden', array() ) );
}

/**
 * The native block editor is the policy authority.  Herd receives the same
 * allowed-type decision rather than treating registration as permission to
 * insert a block.
 *
 * @return true|false|string[]
 */
function herd_editor_allowed_block_types( $post ) {
	if ( ! class_exists( 'WP_Block_Editor_Context' ) || ! function_exists( 'get_block_editor_settings' ) ) {
		return true;
	}
	$settings = get_block_editor_settings( array(), new WP_Block_Editor_Context( array( 'post' => $post ) ) );
	return isset( $settings['allowedBlockTypes'] ) ? $settings['allowedBlockTypes'] : true;
}

/** Return ACF's persistence mode without assuming a particular ACF release. */
function herd_editor_acf_storage_mode( $name ) {
	if ( ! function_exists( 'acf_get_block_type' ) ) {
		return 'unknown';
	}
	$type = acf_get_block_type( $name );
	if ( ! is_array( $type ) ) {
		return 'unknown';
	}
	return ! empty( $type['usePostMeta'] ) ? 'post_meta' : 'comment';
}

/**
 * What the editor needs to know about every block it might meet.
 *
 * Every registered block, plus any name present in the document that is no
 * longer registered -- so a block Herd cannot edit is still described well
 * enough to be preserved and explained rather than silently dropped.
 *
 * @param string       $content Post content, parsed for block names.
 * @param WP_Post|null $post    Post being edited, for the eligibility policy.
 * @return array<string,array>
 */
function herd_editor_block_metadata( $content, $post = null ) {
	$names = array();
	herd_editor_collect_block_names( parse_blocks( $content ), $names );
	$registry = WP_Block_Type_Registry::get_instance();
	$result = array();
	$groups = herd_editor_block_groups( $post );
	$order = herd_editor_block_group_order( $post );
	$fallback = end( $order );
	$labels = herd_editor_block_categories( $post );
	$registered = $registry->get_all_registered();
	$allowed = $post instanceof WP_Post ? herd_editor_allowed_block_types( $post ) : true;
	$hidden_inserter_blocks = herd_editor_hidden_inserter_blocks();
	foreach ( array_keys( $registered ) as $name ) {
		$names[ $name ] = true;
	}
	foreach ( array_keys( $names ) as $name ) {
		$type = $registry->get_registered( $name );
		$storage_mode = 0 === strpos( $name, 'acf/' ) ? herd_editor_acf_storage_mode( $name ) : 'comment';
		$allowed_here = true === $allowed || ( is_array( $allowed ) && in_array( $name, $allowed, true ) );
		/*
		 * A curated map wins, then the block's registered category resolved to
		 * its label, then that category humanized for a theme that named one
		 * without ever registering it, and only then the fallback group.
		 */
		$slug = $type ? (string) $type->category : '';
		if ( isset( $groups[ $name ] ) ) {
			$group = $groups[ $name ];
		} elseif ( isset( $labels[ $slug ] ) ) {
			$group = $labels[ $slug ];
		} elseif ( '' !== $slug ) {
			$group = herd_editor_humanize_slug( $slug );
		} else {
			$group = $fallback;
		}
		/*
		 * A group the order does not name goes to the fallback instead. The
		 * Inserter draws an unnamed group after every named one -- so below
		 * "Other", which reads as a bug rather than as a choice. It happens
		 * wherever a site curates the order: a block the curated map forgot
		 * would otherwise be filed under its own vendor namespace, in a heading
		 * nobody asked for, at the bottom of the list. "Other" is what that
		 * block is.
		 */
		if ( ! in_array( $group, $order, true ) ) {
			$group = $fallback;
		}
		$result[ $name ] = array(
			'title'            => $type ? $type->title : '',
			'icon'             => herd_editor_block_icon( $type ),
			'category'         => $slug,
			'group'            => $group,
			/* block.json's own search terms, already translated through the block's textdomain. */
			'keywords'         => $type ? array_values( array_filter( array_map( 'strval', (array) $type->keywords ) ) ) : array(),
			'description'      => $type ? (string) $type->description : '',
			'registered'       => (bool) $type,
			'multiple'         => ! $type || ! isset( $type->supports['multiple'] ) || false !== $type->supports['multiple'],
			'anchor'           => (bool) $type && isset( $type->supports['anchor'] ) && false !== $type->supports['anchor'],
			'inserter'         => ! in_array( $name, $hidden_inserter_blocks, true ) && ( ! $type || ! isset( $type->supports['inserter'] ) || false !== $type->supports['inserter'] ),
			'allowed'          => $allowed_here,
			'parent'           => $type ? array_values( (array) $type->parent ) : array(),
			'ancestor'         => $type ? array_values( (array) $type->ancestor ) : array(),
			'storageMode'      => $storage_mode,
			'readOnly'         => 0 === strpos( $name, 'acf/' ) && 'comment' !== $storage_mode,
			'provides_context' => $type ? (array) $type->provides_context : array(),
			'uses_context'     => $type ? array_values( (array) $type->uses_context ) : array(),
		);
	}
	return $result;
}

/**
 * Labels for the rail tabs, in display order.
 *
 * The `main` pseudo-tab is deliberately absent: it is a valid assignment target
 * that sends a meta box back to the main column instead of the rail.
 *
 * @return array<string,string>
 */
function herd_editor_rail_tab_labels() {
	return apply_filters(
		'herd_editor_rail_tab_labels',
		array(
			'page'    => __( 'Page', 'herd-editor' ),
			'seo'     => __( 'SEO', 'herd-editor' ),
			'more'    => __( 'More', 'herd-editor' ),
			'history' => __( 'History', 'herd-editor' ),
		)
	);
}

/** Meta box ids WordPress core registers that describe the post itself. */
function herd_editor_page_meta_boxes() {
	return array( 'submitdiv', 'slugdiv', 'pageparentdiv', 'postimagediv', 'authordiv', 'formatdiv', 'categorydiv', 'postexcerpt', 'commentstatusdiv', 'commentsdiv', 'trackbacksdiv', 'postcustom' );
}

/**
 * Choose a rail tab for one meta box.
 *
 * SEO is matched on the heading text as well as the id so a plugin's own naming
 * does not have to be guessed.
 *
 * @param string $id    Meta box id.
 * @param string $title Meta box heading.
 * @return string Tab id.
 */
function herd_editor_default_rail_tab( $id, $title ) {
	if ( 'revisionsdiv' === $id ) {
		return 'history';
	}
	if ( preg_match( '/\bseo\b/i', $id . ' ' . wp_strip_all_tags( (string) $title ) ) ) {
		return 'seo';
	}
	if ( in_array( $id, herd_editor_page_meta_boxes(), true ) || 0 === strpos( $id, 'tagsdiv-' ) ) {
		return 'page';
	}
	return 'more';
}

/**
 * Every meta box registered for this screen, as id => heading.
 *
 * Both targets are read for the same reason both are rendered: core registers
 * against the Herd screen id, ACF and other plugins against the post type.
 *
 * @param string $screen_id Herd screen id.
 * @param string $post_type Post type.
 * @return array<string,string>
 */
function herd_editor_registered_meta_boxes( $screen_id, $post_type ) {
	$boxes = array();
	foreach ( array( $screen_id, $post_type ) as $target ) {
		if ( empty( $GLOBALS['wp_meta_boxes'][ $target ] ) ) {
			continue;
		}
		foreach ( (array) $GLOBALS['wp_meta_boxes'][ $target ] as $priorities ) {
			foreach ( (array) $priorities as $box_group ) {
				foreach ( (array) $box_group as $box ) {
					// Removed boxes are stored as false rather than unset.
					if ( is_array( $box ) && ! empty( $box['id'] ) ) {
						$boxes[ $box['id'] ] = isset( $box['title'] ) ? (string) $box['title'] : '';
					}
				}
			}
		}
	}
	return $boxes;
}

/**
 * Map every registered meta box to a rail tab.
 *
 * @param string  $screen_id Herd screen id.
 * @param WP_Post $post      Post being edited.
 * @return array<string,string> Meta box id => tab id.
 */
function herd_editor_rail_assignments( $screen_id, $post ) {
	$boxes = herd_editor_registered_meta_boxes( $screen_id, $post->post_type );
	$map   = array();
	foreach ( $boxes as $id => $title ) {
		$map[ $id ] = herd_editor_default_rail_tab( $id, $title );
	}
	/**
	 * Filter which rail tab each meta box lands in.
	 *
	 * Valid values are the keys of herd_editor_rail_tab_labels(), plus `main`,
	 * which moves the box out of the rail and into the main column below the
	 * block list -- the escape hatch for field groups too wide for the rail.
	 *
	 * @param array<string,string> $map   Meta box id => tab id.
	 * @param array<string,string> $boxes Meta box id => heading.
	 * @param WP_Post              $post  Post being edited.
	 */
	return (array) apply_filters( 'herd_editor_rail_tabs', $map, $boxes, $post );
}

/**
 * Render one meta box context for both targets.
 *
 * do_meta_boxes() prints its own `{context}-sortables` wrapper, so calling it
 * twice would emit duplicate ids. The wrapper id is rewritten instead; nothing
 * on this screen uses it, because postbox sorting is not loaded here.
 *
 * @param string  $screen_id Herd screen id.
 * @param string  $post_type Post type.
 * @param string  $context   Meta box context.
 * @param WP_Post $post      Post being edited.
 */
function herd_editor_meta_boxes( $screen_id, $post_type, $context, $post ) {
	$index = 0;
	/*
	 * Deduplicated because the two targets are only distinct on the submenu
	 * screen. Rendered in place on post.php/post-new.php, get_current_screen()
	 * already *is* the post type, and every box would otherwise print twice.
	 */
	foreach ( array_unique( array( $screen_id, $post_type ) ) as $target ) {
		++$index;
		ob_start();
		do_meta_boxes( $target, $context, $post );
		$html = ob_get_clean();
		echo str_replace( ' id="' . $context . '-sortables"', ' id="herd-sortables-' . esc_attr( $context . '-' . $index ) . '"', $html ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}

/**
 * Whether the request being rendered is Herd's editor screen.
 *
 * True for both entry points: the hidden submenu page, and the in-place render
 * that claims post.php/post-new.php via `replace_editor`. The inline flag is set
 * before admin-header.php runs, which is where both `admin_enqueue_scripts` and
 * `admin_body_class` fire.
 *
 * @return bool
 */
function herd_editor_is_herd_screen() {
	global $herd_editor_screen_hook, $hook_suffix, $herd_editor_rendering_inline;
	return ! empty( $herd_editor_rendering_inline ) || ( $hook_suffix && $hook_suffix === $herd_editor_screen_hook );
}

/** Register a hidden admin page so WordPress supplies its normal admin chrome. */
function herd_editor_register_screen() {
	global $herd_editor_screen_hook;
	$herd_editor_screen_hook = add_submenu_page( null, __( 'Herd Editor', 'herd-editor' ), __( 'Herd Editor', 'herd-editor' ), 'edit_posts', 'herd-editor', 'herd_editor_render_screen' );
}
add_action( 'admin_menu', 'herd_editor_register_screen' );

/**
 * The post this screen is editing.
 *
 * Memoised because the answer is not simply the row in the database: a post
 * that has never been saved is given the starting document its post type asks
 * for, and both callers -- the render path and the asset enqueue, which build
 * the hidden #content input and window.HerdEditor.postContent -- have to be
 * handed the same one.
 *
 * The `$primed` argument exists because post-new.php has no `post` query arg:
 * core creates the auto-draft and hands the object straight to `replace_editor`,
 * so the in-place render supplies it rather than letting this read the URL.
 * First answer wins, whichever way it arrives.
 *
 * @param WP_Post|null|false $primed Post to memoise, or false to resolve from the URL.
 * @return WP_Post|null
 */
function herd_editor_current_post( $primed = false ) {
	static $current = false;
	if ( false !== $current ) {
		return $current;
	}

	if ( false !== $primed ) {
		$current = herd_editor_prepare_post( $primed );
		return $current;
	}

	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$current = herd_editor_prepare_post( $post_id ? get_post( $post_id ) : null );

	return $current;
}

/**
 * Give a brand new post the document its post type asks for.
 *
 * A new post is a real row: core inserts it with the literal title "Auto Draft"
 * and blanks that on the object before rendering. Herd renders from the object
 * too, so it has to do the same or the title field opens pre-filled with a word
 * nobody typed. Nothing is written; the seed reaches the database on the first
 * save, exactly as core's own `default_content` does.
 *
 * @param WP_Post|null $post Post being edited.
 * @return WP_Post|null
 */
function herd_editor_prepare_post( $post ) {
	if ( $post && 'auto-draft' === $post->post_status ) {
		// Core's own string in core's own domain: this compares against a title
		// WordPress generated, so translating it under Herd's domain would only
		// ever fail to match.
		// phpcs:ignore WordPress.WP.I18n.MissingArgDomain
		if ( __( 'Auto Draft' ) === $post->post_title ) {
			$post->post_title = '';
		}
		if ( '' === trim( (string) $post->post_content ) ) {
			$post->post_content = herd_editor_starter_content( $post );
		}
	}
	return $post;
}

/**
 * Render the Herd screen.
 *
 * Serves both entry points. As the submenu page's callback, admin.php has
 * already emitted the admin header and will emit the footer. Rendered in place
 * from `replace_editor`, neither has happened yet -- so the header is emitted
 * here, after the meta boxes are registered and before any markup, matching
 * core's own ordering in edit-form-advanced.php. The footer is never emitted
 * here: post.php and post-new.php both close with it themselves.
 */
function herd_editor_render_screen() {
	global $post, $herd_editor_rendering_inline;
	$post = herd_editor_current_post();
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		wp_die( esc_html__( 'You cannot edit this item in Herd Editor.', 'herd-editor' ), 403 );
	}
	/* Keep the token that is rendered in form#post in step with Heartbeat. When
	 * somebody else owns it, core's dialog is rendered instead and no save token
	 * is issued until the user explicitly takes over. */
	$herd_active_post_lock = herd_editor_active_post_lock( $post->ID );

	/*
	 * Say plainly that this is not the block editor, before a single meta box is
	 * registered or rendered.
	 *
	 * post.php and post-new.php hand `replace_editor` a screen still marked as the
	 * block editor and only correct it *after* the filter returns -- too late for a
	 * filter that renders. Left alone, do_meta_boxes() drops every box flagged
	 * __back_compat_meta_box (wp-admin/includes/template.php:1353), on the grounds
	 * that the block editor supplies its own: Publish, Page Attributes, Featured
	 * Image and Author would all silently vanish. The submenu screen never had this
	 * problem, being nobody's idea of the block editor.
	 */
	if ( ! empty( $herd_editor_rendering_inline ) ) {
		$herd_screen = get_current_screen();
		if ( $herd_screen ) {
			$herd_screen->is_block_editor( false );
		}
	}

	require_once ABSPATH . 'wp-admin/includes/meta-boxes.php';
	/*
	 * ACF hooks its own add_meta_boxes from `load-post.php` and `load-post-new.php`
	 * (ACF_Form_Post::__construct), so on the submenu page it never registers the
	 * post field groups and Herd has to ask for them by hand. Rendered in place,
	 * those load hooks have already fired and ACF is registered: asking again
	 * would run acf_localize_data( 'postboxes' ) a second time and hand the
	 * browser every field group twice.
	 */
	$acf_post_form = empty( $herd_editor_rendering_inline ) && function_exists( 'acf_get_instance' ) ? acf_get_instance( 'ACF_Form_Post' ) : null;
	if ( $acf_post_form && method_exists( $acf_post_form, 'add_meta_boxes' ) ) {
		$acf_post_form->add_meta_boxes( $post->post_type, $post );
	}
	register_and_do_post_meta_boxes( $post );
	remove_meta_box( 'slugdiv', herd_editor_screen_id( $post ), 'normal' );
	if ( ! empty( $herd_editor_rendering_inline ) ) {
		require_once ABSPATH . 'wp-admin/admin-header.php';
	}
	require HERD_EDITOR_DIR . 'includes/herd-editor-screen.php';
}

/**
 * The screen meta boxes are registered against.
 *
 * On the submenu page this is Herd's own screen id, which is not the post type,
 * so boxes arrive on two different targets and both have to be rendered. Claiming
 * post.php/post-new.php instead, the screen *is* the post type and the two
 * collapse into one.
 *
 * Falls back to the post type rather than trusting `get_current_screen()` to be
 * non-null: reading `->id` off null is a warning that yields null, and a null
 * target sends `do_meta_boxes()` to the current screen anyway -- which is how the
 * same box ends up rendered twice.
 *
 * @param WP_Post $post Post being edited.
 * @return string
 */
function herd_editor_screen_id( $post ) {
	$screen = get_current_screen();
	return $screen && $screen->id ? $screen->id : $post->post_type;
}

/**
 * Is this request the Herd screen, actually able to run?
 *
 * The one answer the body class, both asset enqueues and the theme-style
 * suppressor all need. Kept in one place because they must agree: a screen that
 * marks itself Herd on `<body>` but declines to load Herd's stylesheet is a
 * theme's ACF overrides painting an unstyled page.
 *
 * @return bool
 */
function herd_editor_is_active_screen() {
	return herd_editor_is_herd_screen()
		&& herd_editor_has_acf_pro()
		&& herd_editor_supports_post( herd_editor_current_post() );
}

/**
 * Mark the Herd screen on `<body>`.
 *
 * `.herd-editor-screen` sits on the `div.wrap` this screen renders, which is
 * where every Herd stylesheet scopes itself. A theme's admin CSS has to make
 * the opposite statement -- "not here" -- and a `:not()` on an ancestor it
 * cannot name is not a selector. So the screen says so on the body, and a theme
 * can fence its own ACF overrides behind `body:not(.herd-editor-active)`.
 *
 * herd_editor_suppress_theme_styles() now makes that fence unnecessary, and
 * this class is no longer the mechanism. It stays for two reasons. It is a
 * compatibility affordance for a theme that already fences itself, which keeps
 * working whether or not suppression is on, and it is the only handle for the
 * one thing suppression cannot reach: CSS echoed as an inline `<style>` on
 * `admin_head`, which never enters the style queue and so cannot be dequeued.
 *
 * @param string $classes Space-separated body classes.
 * @return string The classes, with Herd's own appended when this is its screen.
 */
function herd_editor_body_class( $classes ) {
	if ( ! herd_editor_is_active_screen() ) {
		return $classes;
	}
	return trim( $classes . ' herd-editor-active' );
}
add_filter( 'admin_body_class', 'herd_editor_body_class' );

/** Load Herd-only assets on the dedicated mode, never on frontend requests. */
function herd_editor_enqueue_assets() {
	if ( ! herd_editor_is_active_screen() ) {
		return;
	}
	$post = herd_editor_current_post();

	wp_enqueue_media();
	wp_enqueue_script( 'heartbeat' );
	/*
	 * Autosave is initialized against Herd's native #post form and the standard
	 * #post_ID/#content/#excerpt fields rendered by the screen template, so it
	 * behaves exactly as it does under the block and classic editors: an autosave
	 * of a draft the current user owns is a real save. Browser recovery remains
	 * the guarantee if a host disables autosave.
	 *
	 * Core's own autosaveL10n is left alone. Herd used to localize a second copy
	 * asking for a 120s interval, but core's prints after Herd's and wins, so the
	 * value never applied -- and its `post_id` was never read by anything, since
	 * autosave takes the id from #post_ID. Core's 60s is the interval in effect
	 * and the one the block editor uses.
	 */
	wp_enqueue_script( 'autosave' );
	if ( function_exists( 'acf_enqueue_scripts' ) ) {
		acf_enqueue_scripts();
	}

	$asset = herd_editor_asset( 'herd-editor' );
	wp_enqueue_script(
		'herd-editor-screen',
		HERD_EDITOR_URL . 'build/herd-editor.js',
		/* wp-url carries cleanForSlug, which src/rail.js uses to show the same
		 * derived permalink the block editor shows before a post has been saved. */
		array_values( array_unique( array_merge( array( 'acf-input', 'wp-url' ), $asset['dependencies'] ) ) ),
		$asset['version'],
		true
	);

	wp_add_inline_script(
		'herd-editor-screen',
		'if ( window.acf ) { acf.set( "ajaxurl", ' . wp_json_encode( admin_url( 'admin-ajax.php' ) ) . ' ); acf.set( "nonce", ' . wp_json_encode( wp_create_nonce( 'acf_nonce' ) ) . ' ); }',
		'before'
	);
	$post_type_object = get_post_type_object( $post->post_type );
	wp_add_inline_script(
		'herd-editor-screen',
		'window.HerdEditor = ' . wp_json_encode(
			array(
				'postId' => $post->ID,
				'postType' => $post->post_type,
				'templateLock' => $post_type_object ? $post_type_object->template_lock : false,
				'postContent' => $post->post_content,
				'blockEditorUrl' => herd_editor_native_url( $post->ID, 'block' ),
				/*
				 * Empty where nothing can honour it: without the Classic Editor
				 * plugin the URL resolves to Gutenberg, and a "Classic editor"
				 * link that opens the block editor is worse than no link.
				 */
				'classicEditorUrl' => class_exists( 'Classic_Editor' ) ? herd_editor_native_url( $post->ID, 'classic' ) : '',
				'blockTypes' => herd_editor_block_metadata( $post->post_content, $post ),
				'blockGroupOrder' => herd_editor_block_group_order( $post ),
				'modifiedHuman' => herd_editor_saved_label( $post ),
				'statusLabel' => herd_editor_status_label( $post ),
				'isPublished' => 'publish' === $post->post_status,
				/*
				 * A draft has nowhere to send anyone, so View is absent rather than
				 * broken; herd_editor_view_url() is the one place that decides.
				 */
				'viewUrl' => herd_editor_view_url( $post ),
				/*
				 * The base a block anchor is copied against. Unlike viewUrl this is
				 * present for a draft too -- as the ?page_id= form -- because a jump
				 * link is worth copying before the page is public.
				 */
				'permalink' => (string) get_permalink( $post ),
				'singular' => herd_editor_singular_lower( $post ),
				/** Filter how many ACF blocks Expand all mounts before asking for confirmation. */
				'expandWarnAt' => (int) apply_filters( 'herd_editor_expand_warn_at', 8 ),
				'recoveryKey' => herd_editor_recovery_key(),
				/* The window the server judges a lock by, so the browser watchdog
				 * measures against the same number rather than a guess of its own. */
				// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter.
				'lockWindow' => (int) apply_filters( 'wp_check_post_lock_window', 150 ),
				'currentUserId' => get_current_user_id(),
				/* A post.php redirect with a message is a confirmed native save. */
				'successfulSave' => ! empty( $_GET['message'] ), // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				'saveMarker' => (string) get_post_modified_time( 'U', true, $post ),
				'icons' => herd_editor_icon_set(),
				/* The field name that means "hidden", or '' where the site has none. */
				'visibilityField' => herd_editor_visibility_field(),
				'acfFields' => herd_editor_search_fields( $post->post_content ),
				/* Per-block summary wording and choice rules; see src/ui/acf/profiles.js. */
				'profiles' => herd_editor_block_profiles(),
			)
		) . ';',
		'before'
	);
}
add_action( 'admin_enqueue_scripts', 'herd_editor_enqueue_assets' );

/**
 * Herd's stylesheet, enqueued as late as the queue allows.
 *
 * Separate from the script enqueue above, and hooked at 9999, for one reason:
 * print order. A theme's admin CSS is hooked at the default priority, and
 * plugins load before themes, so Herd's sheet was being *queued* first and
 * therefore *printed* first -- which handed every equal-specificity collision to
 * the theme without a single `!important` being involved. Queued last, it prints
 * last, and a tie goes to the screen that drew the markup.
 *
 * herd_editor_suppress_theme_styles() takes care of the rules that are not ties.
 *
 * @return void
 */
function herd_editor_enqueue_screen_style() {
	if ( ! herd_editor_is_active_screen() ) {
		return;
	}
	$asset = herd_editor_asset( 'herd-editor' );
	wp_enqueue_style( 'herd-editor', HERD_EDITOR_URL . 'build/herd-editor.css', array( 'acf-input', 'dashicons' ), $asset['version'] );

	/* The one selector the stylesheet cannot carry: see herd_editor_visibility_style(). */
	$visibility = herd_editor_visibility_style();
	if ( '' !== $visibility ) {
		wp_add_inline_style( 'herd-editor', $visibility );
	}
}
add_action( 'admin_enqueue_scripts', 'herd_editor_enqueue_screen_style', 9999 );

/**
 * A stylesheet URL reduced to a comparable path.
 *
 * Scheme and host go, because a theme URI and a registered `src` routinely
 * disagree about http/https and about www while naming the same file.
 *
 * @param string $src Registered stylesheet src.
 * @return string
 */
function herd_editor_style_path( $src ) {
	$src = (string) $src;
	$src = preg_replace( '#^https?:#i', '', $src );
	return (string) preg_replace( '#^//[^/]+#', '', $src );
}

/**
 * Registered stylesheet handles served out of the active theme.
 *
 * Split out of the suppressor so the settings screen can show an admin the same
 * list the suppressor is about to act on, rather than describing it.
 *
 * @param WP_Styles|null $styles Style queue. Defaults to the global one.
 * @return string[] Handles, in registration order.
 */
function herd_editor_theme_style_handles( $styles = null ) {
	$styles = $styles instanceof WP_Styles ? $styles : wp_styles();
	if ( ! $styles instanceof WP_Styles ) {
		return array();
	}

	/* Both, so a child theme's parent is covered too. */
	$roots = array_filter(
		array_unique(
			array_map(
				'herd_editor_style_path',
				array( trailingslashit( get_stylesheet_directory_uri() ), trailingslashit( get_template_directory_uri() ) )
			)
		)
	);

	$handles = array();
	foreach ( $styles->registered as $handle => $style ) {
		/*
		 * `src === true` is core's `colors` handle, which resolves at print
		 * time from the admin colour scheme rather than carrying a URL. It is
		 * never a theme sheet even when a theme registered the scheme -- and
		 * dropping it would strip the admin menu and admin bar bare.
		 */
		if ( ! is_string( $style->src ) || '' === $style->src ) {
			continue;
		}
		$path = herd_editor_style_path( $style->src );
		foreach ( $roots as $root ) {
			if ( '' !== $root && 0 === strpos( $path, $root ) ) {
				$handles[] = (string) $handle;
				break;
			}
		}
	}
	return $handles;
}

/**
 * Take the active theme's admin CSS off this screen.
 *
 * Herd draws every surface it renders -- the block list, the ACF field host,
 * the meta boxes in the rail. A theme's admin CSS was written for the Classic
 * and Block editors, it carries `!important` to beat ACF Pro's own stylesheet,
 * and on this screen it is not a customization but a repaint.
 *
 * The alternative is to out-bid it, rule by rule, forever, in a fight the
 * plugin cannot win: a theme's overrides can be arbitrarily specific and Herd
 * does not know what they are. Rather than ask every theme to fence itself off
 * -- which is a coordinated edit in every theme, and the thing being ended here
 * -- the screen simply does not load them.
 *
 * @return void
 */
function herd_editor_suppress_theme_styles() {
	if ( ! herd_editor_is_active_screen() ) {
		return;
	}

	/**
	 * Filter whether Herd drops the theme's admin stylesheets on its screen.
	 *
	 * @param bool $suppress Whether to suppress. Default true.
	 */
	if ( ! apply_filters( 'herd_editor_suppress_theme_styles', (bool) herd_editor_setting( 'suppress_theme_styles', true ) ) ) {
		return;
	}

	$styles = wp_styles();
	if ( ! $styles instanceof WP_Styles ) {
		return;
	}

	$handles = herd_editor_theme_style_handles( $styles );
	/* The settings screen's two lists, applied before the filter so code still wins. */
	$handles = array_diff( $handles, (array) herd_editor_setting( 'style_handles_keep', array() ) );
	$handles = array_values( array_unique( array_merge( $handles, (array) herd_editor_setting( 'style_handles_drop', array() ) ) ) );

	/**
	 * Filter the stylesheet handles Herd drops on its screen.
	 *
	 * `array_diff()` to keep one. Append to drop a sheet that is not served
	 * from the theme directory and so cannot be found by URL -- a Vite dev
	 * server or a CDN, most often.
	 *
	 * @param string[]  $handles Handles about to be dropped.
	 * @param WP_Styles $styles  The style queue.
	 */
	$handles = (array) apply_filters( 'herd_editor_suppressed_style_handles', $handles, $styles );

	foreach ( $handles as $handle ) {
		$handle = (string) $handle;
		wp_dequeue_style( $handle );
		/*
		 * Marked done, not deregistered. A handle another sheet depends on has
		 * to keep existing, or WP_Dependencies::all_deps() fails on the missing
		 * dependency and silently drops the dependent sheet as well. Marked
		 * done it simply never prints -- and any wp_add_inline_style() attached
		 * to it goes quiet with it.
		 */
		if ( ! in_array( $handle, $styles->done, true ) ) {
			$styles->done[] = $handle;
		}
	}
}
/*
 * 19, because core's print_admin_styles() is hooked to this at 20 and both
 * `admin_enqueue_scripts` and `admin_print_styles-{$hook_suffix}` have already
 * fired by now. This is the last moment anything can be taken out of the queue.
 */
add_action( 'admin_print_styles', 'herd_editor_suppress_theme_styles', 19 );

/**
 * The SVG vocabulary a block icon may use.
 *
 * `wp_kses()` has no notion of SVG, so the shapes and their geometry have to be
 * spelled out. Presentation attributes are shared by every element because these
 * icon sets hang stroke and fill wherever it suits them.
 *
 * @return array<string,array<string,bool>> Tag name to allowed attributes.
 */
function herd_editor_svg_tags() {
	$common = array_fill_keys(
		array(
			'xmlns', 'viewbox', 'width', 'height', 'class', 'role', 'focusable',
			'aria-hidden', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule',
			'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
			'stroke-opacity', 'opacity', 'transform',
		),
		true
	);
	$shapes = array(
		'svg'      => array(),
		'g'        => array(),
		'title'    => array(),
		'defs'     => array(),
		'symbol'   => array(),
		'use'      => array( 'href' => true, 'xlink:href' => true ),
		'path'     => array( 'd' => true ),
		'circle'   => array( 'cx' => true, 'cy' => true, 'r' => true ),
		'ellipse'  => array( 'cx' => true, 'cy' => true, 'rx' => true, 'ry' => true ),
		'rect'     => array( 'x' => true, 'y' => true, 'rx' => true, 'ry' => true ),
		'line'     => array( 'x1' => true, 'y1' => true, 'x2' => true, 'y2' => true ),
		'polyline' => array( 'points' => true ),
		'polygon'  => array( 'points' => true ),
	);
	$tags = array();
	foreach ( $shapes as $tag => $extra ) {
		$tags[ $tag ] = array_merge( $common, $extra );
	}
	return $tags;
}

/**
 * The icon a block type offers, in a shape the screen can draw.
 *
 * Blocks on this site declare either a dashicon slug or inline SVG in block.json;
 * WordPress allows both, and roughly a third of the theme's blocks take the second
 * route. Anything else — an icon registered from JS, an object naming colours we do
 * not honour, nothing at all — falls back to the default glyph.
 *
 * @param WP_Block_Type|null $type Registered type, when there is one.
 * @return array{dashicon?:string,svg?:string}
 */
function herd_editor_block_icon( $type ) {
	$icon = $type && isset( $type->icon ) ? $type->icon : null;

	/* WordPress also allows `array( 'src' => …, 'foreground' => … )`; we want the src. */
	if ( is_array( $icon ) && isset( $icon['src'] ) ) {
		$icon = $icon['src'];
	}
	if ( ! is_string( $icon ) || '' === trim( $icon ) ) {
		return array( 'dashicon' => 'block-default' );
	}
	$icon = trim( $icon );

	if ( preg_match( '/^[a-z0-9-]+$/', $icon ) ) {
		return array( 'dashicon' => preg_replace( '/^dashicons-/', '', $icon ) );
	}
	if ( 0 === stripos( $icon, '<svg' ) ) {
		$svg = trim( wp_kses( $icon, herd_editor_svg_tags() ) );
		if ( '' !== $svg ) {
			return array( 'svg' => $svg );
		}
	}
	return array( 'dashicon' => 'block-default' );
}

/**
 * Per-block presentation rules the editor cannot infer.
 *
 * Three things about a block cannot be read off ACF's rendered markup: how its
 * summary line should read, which of its controls is better drawn as a glyph
 * than as a label, and which of its choices carries a rule the field group does
 * not record. All three are facts about a site's content model, so a site
 * states them rather than Herd guessing.
 *
 * Empty by default. A block with no profile gets the generic treatment, which
 * is a summary derived from whatever its most identifying fields turn out to
 * be -- good enough that a profile is an improvement, never a requirement.
 *
 * The value crosses `wp_json_encode()` to the browser, so it is data and not
 * callables. src/ui/acf/profiles.js documents the shape.
 *
 * @return array<string,array> Block name to profile.
 */
function herd_editor_block_profiles() {
	/**
	 * Filter the per-block profiles published to the Herd Editor screen.
	 *
	 * @param array $profiles Block name to profile array.
	 */
	return (array) apply_filters( 'herd_editor_block_profiles', array() );
}

/**
 * The ACF field name a theme uses to hide a block on the front end.
 *
 * A theme that offers per-block visibility normally does it by attaching one
 * true/false field to every registered block. There is no convention for what
 * it is called, and nothing in the registry says which field means "hidden",
 * so Herd is told rather than guessing.
 *
 * Empty by default. A site with no such field gets no hidden pill, no dimmed
 * row and no grey switch, which is exactly right: it has no such state.
 *
 * @return string Field name, or '' when the site has none.
 */
function herd_editor_visibility_field() {
	/**
	 * Filter the ACF field name that marks a block hidden.
	 *
	 * @param string $field Field name. Empty means the site has no such field.
	 */
	return (string) apply_filters( 'herd_editor_visibility_field', (string) herd_editor_setting( 'visibility_field', '' ) );
}

/**
 * The two rules that grey a visibility switch, keyed on the site's field name.
 *
 * These cannot be compiled into the stylesheet, because the selector contains a
 * name only the site knows. The declarations are still the stylesheet's -- it
 * defines `--herd-visibility-off` and its hover -- so this contributes a
 * selector and nothing else, and a site that restyles the tokens restyles this
 * with them.
 *
 * @return string CSS, or '' when the site has no visibility field.
 */
function herd_editor_visibility_style() {
	$field = herd_editor_visibility_field();
	if ( '' === $field ) {
		return '';
	}
	$selector = '.herd-editor__field-host .acf-field-true-false[data-name="' . esc_attr( $field ) . '"] input[type="checkbox"]:checked';
	return $selector . '{background:var(--herd-visibility-off);}'
		. $selector . ':hover{background:var(--herd-visibility-off-hover);}';
}

/**
 * The named SVG icons an editor can choose from.
 *
 * A theme that keeps a named SVG set commonly points ACF selects at it, which
 * asks an editor to choose a picture by reading its slug. Handing the markup to
 * the browser lets Herd draw the icons instead.
 *
 * Empty by default, and the filter is the only way in: the set belongs to
 * whoever owns the icons, and a theme without one gets no picker rather than a
 * broken control. See src/ui/acf/icons.js, where an empty set leaves every
 * select exactly as ACF rendered it.
 *
 * @return array<string, string> Icon name to inline SVG.
 */
function herd_editor_icon_set() {
	/**
	 * Filter the icon set published to the Herd Editor screen.
	 *
	 * @param array $icons Icon name to inline SVG markup.
	 */
	$icons = (array) apply_filters( 'herd_editor_icons', array() );

	/*
	 * The editor inserts these with `innerHTML`, so they go through the same
	 * allowlist as a registered block's icon rather than being trusted for
	 * coming from the theme. A filter is a supported way in, and the set is
	 * only as safe as whatever last wrote to it. Anything that survives
	 * `wp_kses()` as an empty string is dropped rather than drawn as a hole.
	 */
	$safe = array();
	foreach ( $icons as $name => $icon ) {
		if ( ! is_string( $icon ) ) {
			continue;
		}
		$svg = trim( wp_kses( $icon, herd_editor_svg_tags() ) );
		if ( '' !== $svg ) {
			$safe[ $name ] = $svg;
		}
	}

	return $safe;
}

/**
 * Build rich text fields lazily inside Herd.
 *
 * ACF instantiates a TinyMCE per wysiwyg field as the form mounts. A cards block
 * with four rows is four editors before anything has been typed, and it is the
 * single largest cost of opening one. ACF already supports deferring that
 * through the field's own `delay` setting, so Herd asks for it rather than
 * fighting TinyMCE from the outside.
 *
 * Scoped to Herd's own fetch-block requests through the flag that
 * `buildFetchBlockPayload()` adds, so the Block Editor is unaffected.
 *
 * @param array $field The ACF field array.
 * @return array The field, possibly deferred.
 */
function herd_editor_delay_editors( $field ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- ACF verifies its own AJAX nonce; this only reads a routing flag.
	if ( empty( $_POST['herd_editor'] ) || ! wp_doing_ajax() ) {
		return $field;
	}
	$field['delay'] = 1;
	return $field;
}
add_filter( 'acf/prepare_field/type=wysiwyg', 'herd_editor_delay_editors' );

/**
 * Let a field group say which of its groups opens on load.
 *
 * A group in Herd is a fold, and which fold starts open is a judgement about the
 * block that only whoever built the field group can make. Until now it was
 * inferred — open iff it was the only group on the form — so a block with three
 * groups opened none of them and the most important one was a click away, every
 * time.
 *
 * The setting is Herd's alone: nothing in the Block Editor or Classic renders a
 * fold for a group, so there is nothing there for it to change. It lives under
 * Presentation because that is where ACF puts settings that decide how a field
 * looks rather than what it holds.
 */

/**
 * Give the setting a value on every group, saved or not.
 *
 * Every field group that predates this has no such key, and `acf_render_field_setting()`
 * would otherwise fall through to its own default on each render.
 *
 * @param array $field The ACF field array.
 * @return array The field, with the setting present.
 */
function herd_editor_group_defaults( $field ) {
	if ( ! isset( $field['herd_open_by_default'] ) ) {
		$field['herd_open_by_default'] = 0;
	}
	return $field;
}
add_filter( 'acf/validate_field/type=group', 'herd_editor_group_defaults' );

/**
 * Draw the toggle under the Group field's Presentation tab.
 *
 * @param array $field The ACF field array.
 * @return void
 */
function herd_editor_group_setting( $field ) {
	acf_render_field_setting(
		$field,
		array(
			'label'        => __( 'Open by default', 'herd-editor' ),
			'instructions' => __( 'Show this group expanded when the form loads. Herd Editor only; the block editor is unaffected.', 'herd-editor' ),
			'name'         => 'herd_open_by_default',
			'type'         => 'true_false',
			'ui'           => 1,
		)
	);
}
add_action( 'acf/render_field_presentation_settings/type=group', 'herd_editor_group_setting' );

/**
 * Publish the setting to the rendered wrapper for `src/ui/acf/group.js` to read.
 *
 * Unscoped, unlike `herd_editor_delay_editors()` above: `data-herd-open` is inert
 * markup that only Herd's JS looks at, and the gate that filter uses would miss
 * the groups in rail meta boxes, which render with the Herd screen rather than
 * through a fetch-block request.
 *
 * @param array $field The ACF field array.
 * @return array The field, carrying the attribute when the setting is on.
 */
function herd_editor_group_open_attribute( $field ) {
	if ( ! empty( $field['herd_open_by_default'] ) ) {
		$field['data']['herd-open'] = 1;
	}
	return $field;
}
add_filter( 'acf/prepare_field/type=group', 'herd_editor_group_open_attribute' );

/** Add the third choice to Gutenberg's editor menu. */
function herd_editor_enqueue_block_switcher() {
	global $post;
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return;
	}
	$asset = herd_editor_asset( 'index' );
	wp_enqueue_script( 'herd-editor-switcher', HERD_EDITOR_URL . 'build/index.js', $asset['dependencies'], $asset['version'], true );
	$path = isset( $_GET['herd-block-path'] ) ? sanitize_text_field( wp_unslash( $_GET['herd-block-path'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! preg_match( '/^\d+(?:\.\d+)*$/', $path ) ) {
		$path = '';
	}
	wp_add_inline_script( 'herd-editor-switcher', 'window.HerdEditor = ' . wp_json_encode( array( 'herdUrl' => herd_editor_url( $post->ID ), 'blockPath' => $path ) ) . ';', 'before' );
}
add_action( 'enqueue_block_editor_assets', 'herd_editor_enqueue_block_switcher' );

/** Add Herd as a third editor choice in post/page list-table actions. */
function herd_editor_add_list_table_link( $actions, $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return $actions;
	}
	/*
	 * Classic Editor's own two links point at post.php, which Herd's
	 * replace_editor filter would bounce straight back here when Herd is the
	 * default. The stand-down arg is what makes them mean what they say.
	 */
	foreach ( array( 'classic-editor-block', 'classic-editor-classic' ) as $action ) {
		if ( isset( $actions[ $action ] ) ) {
			$actions[ $action ] = preg_replace_callback(
				'/href="([^"]+)"/',
				static function ( $found ) {
					return 'href="' . esc_url( add_query_arg( HERD_EDITOR_FORGET_ARG, '1', html_entity_decode( $found[1] ) ) ) . '"';
				},
				$actions[ $action ]
			);
		}
	}

	$title = _draft_or_post_title( $post->ID );
	$actions['herd-editor'] = sprintf(
		'<a href="%1$s" aria-label="%2$s">%3$s</a>',
		esc_url( herd_editor_url( $post->ID ) ),
		/* translators: %s: post title. */
		esc_attr( sprintf( __( 'Edit &#8220;%s&#8221; in Herd Editor', 'herd-editor' ), $title ) ),
		esc_html__( 'Edit (Herd Editor)', 'herd-editor' )
	);
	return $actions;
}
add_filter( 'post_row_actions', 'herd_editor_add_list_table_link', 20, 2 );
add_filter( 'page_row_actions', 'herd_editor_add_list_table_link', 20, 2 );

/**
 * The way into Herd, and the way back out again.
 *
 * One section in the publish box, pointing at whichever editor you are not in:
 * Herd from the native editors, the Block Editor from Herd. A switch that only
 * goes one way is a trap, and on the Herd screen this box is the Page tab of
 * the rail, which is where someone looks for a setting about the whole post.
 *
 * The Block link is built by herd_editor_native_url(), whose stand-down args
 * are what keep it from being redirected straight back here when Herd is the
 * site's default editor. Unsaved work is already guarded: the editor app holds
 * a beforeunload handler while the document is dirty.
 *
 * @param WP_Post $post Post being edited.
 */
function herd_editor_switch_link( $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return;
	}
	/* Covers both the hidden Herd route and the inline replacement of post.php. */
	$on_herd = herd_editor_is_herd_screen();
	$url     = $on_herd ? herd_editor_native_url( $post->ID, 'block' ) : herd_editor_url( $post->ID );
	$label   = $on_herd ? __( 'Switch to Block Editor', 'herd-editor' ) : __( 'Switch to Herd Editor', 'herd-editor' );

	echo '<div class="misc-pub-section herd-editor-switch"><a href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a></div>';
}
add_action( 'post_submitbox_misc_actions', 'herd_editor_switch_link' );

/**
 * Return a normal post-form save to the Herd route.
 *
 * The URL is rebuilt rather than amended, because core's points at post.php and
 * Herd's screen is somewhere else entirely. What core wrote into it still has to
 * survive the move: `$location` is where WordPress says what just happened, and
 * an editor who is told nothing after pressing Update has no way to know it
 * worked. See herd_editor_carry_message_from().
 */
function herd_editor_keep_editor_mode_after_save( $location ) {
	if ( isset( $_REQUEST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post_id = isset( $_REQUEST['post_ID'] ) ? absint( $_REQUEST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $post_id ) {
			return herd_editor_carry_message_from( $location, $post_id );
		}
	}
	return $location;
}
add_filter( 'redirect_post_location', 'herd_editor_keep_editor_mode_after_save' );
