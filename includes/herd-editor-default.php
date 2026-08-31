<?php
/**
 * Herd Editor as a default editor.
 *
 * Three things live here, and they are one feature: the site- and user-level
 * choice of which editor opens by default, the redirect that honours it, and
 * the starting document a brand new post arrives with.
 *
 * The choice is presented as a third radio in Classic Editor's own "Default
 * editor for all users" row rather than a control of Herd's own, because it is
 * one decision and an editor is picked once. Classic Editor cannot store a
 * third value -- its validate_option_editor() collapses anything that is not
 * `block` to `classic` -- so Herd keeps its own option and writes a legal
 * classic|block value back into Classic Editor's, which is what the site falls
 * back to if this plugin is ever deactivated.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/** The site-wide choice. Classic Editor's own option is mirrored, never read as truth. */
const HERD_EDITOR_OPTION = 'herd-editor-default';
/** The per-user override, stored with update_user_option() as Classic Editor does. */
const HERD_EDITOR_USER_OPTION = 'herd-editor-settings';
/**
 * Query arg that stands the redirect down for one request, so Herd can offer a
 * way out to the Block editor. Classic Editor's own `classic-editor` arg is
 * honoured for the same reason, which keeps its switch links working.
 */
const HERD_EDITOR_FORGET_ARG = 'herd-editor__forget';

/**
 * The editors a Herd install can default to.
 *
 * Named once so the radios, the sanitiser and the redirect cannot drift apart.
 *
 * @return array<string,string> Value to label.
 */
function herd_editor_editor_choices() {
	return array(
		'classic' => _x( 'Classic editor', 'Editor Name', 'herd-editor' ),
		'block'   => _x( 'Block editor', 'Editor Name', 'herd-editor' ),
		'herd'    => _x( 'Herd editor', 'Editor Name', 'herd-editor' ),
	);
}

/**
 * The site's default editor.
 *
 * Unset until the Writing screen is saved once. Rather than invent a default,
 * read what Classic Editor is already doing, so the first render of the setting
 * shows the site as it actually behaves today.
 *
 * @return string One of herd_editor_editor_choices().
 */
function herd_editor_site_editor() {
	$value = get_option( HERD_EDITOR_OPTION );
	if ( isset( herd_editor_editor_choices()[ $value ] ) ) {
		return $value;
	}
	return 'block' === get_option( 'classic-editor-replace' ) ? 'block' : 'classic';
}

/**
 * Whether users may override the site default.
 *
 * Classic Editor owns this toggle -- it is the second field on Settings >
 * Writing, and Herd deliberately leaves it alone. Without Classic Editor there
 * is nothing to turn it off, so the per-user row is simply offered.
 *
 * @return bool
 */
function herd_editor_allow_users() {
	if ( ! class_exists( 'Classic_Editor' ) ) {
		return true;
	}
	return 'allow' === get_option( 'classic-editor-allow-users' );
}

/**
 * The editor that actually opens, for one user.
 *
 * The `options-writing.php` guard is Classic Editor's, and is here for the same
 * reason: that screen edits the site default, so it must render the site value
 * even for an admin whose personal choice differs.
 *
 * @param int $user_id User to resolve for. 0 means the current user.
 * @return string One of herd_editor_editor_choices().
 */
function herd_editor_resolved_editor( $user_id = 0 ) {
	$editor = herd_editor_site_editor();
	$on_writing_screen = isset( $GLOBALS['pagenow'] ) && 'options-writing.php' === $GLOBALS['pagenow'];

	if ( ! $on_writing_screen && herd_editor_allow_users() ) {
		$user_choice = get_user_option( HERD_EDITOR_USER_OPTION, $user_id );
		if ( isset( herd_editor_editor_choices()[ $user_choice ] ) ) {
			$editor = $user_choice;
		}
	}

	return $editor;
}

/**
 * Reduce Herd's three-way choice to the two Classic Editor can store.
 *
 * `herd` becomes `block`: if this plugin goes away, a site that had chosen Herd
 * lands on the Block editor, which is the nearer of the two.
 *
 * @param string $value A Herd choice.
 * @return string `classic` or `block`.
 */
function herd_editor_mirror_value( $value ) {
	return 'classic' === $value ? 'classic' : 'block';
}

/**
 * Sanitise the site option, and mirror it into Classic Editor's.
 *
 * The fallback is the stored value rather than a constant, so a malformed POST
 * leaves the site as it was instead of quietly changing editors.
 *
 * @param mixed $value Posted value.
 * @return string One of herd_editor_editor_choices().
 */
function herd_editor_sanitize_editor( $value ) {
	$value = is_string( $value ) && isset( herd_editor_editor_choices()[ $value ] ) ? $value : herd_editor_site_editor();
	update_option( 'classic-editor-replace', herd_editor_mirror_value( $value ) );
	return $value;
}

/**
 * Register the setting and take over Classic Editor's field.
 *
 * Priority 11: Classic Editor registers its fields on `admin_init` at 10, and
 * this replaces one of them.
 */
function herd_editor_register_settings() {
	global $wp_settings_fields;
	$claims = isset( $wp_settings_fields['writing']['default']['classic-editor-1'] );

	/*
	 * Classic Editor is here but its field is not: a super admin has taken the
	 * per-site choice away network-wide, and Classic_Editor::get_settings()
	 * reports hide-settings-ui. Herd has no standing to reopen that decision.
	 */
	if ( ! $claims && class_exists( 'Classic_Editor' ) ) {
		return;
	}

	register_setting(
		'writing',
		HERD_EDITOR_OPTION,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'herd_editor_sanitize_editor',
			/* Which editor opens is not a thing the REST API should be able to change. */
			'show_in_rest'      => false,
		)
	);

	$allowed = array( 'writing' => array( HERD_EDITOR_OPTION ) );
	if ( function_exists( 'add_allowed_options' ) ) {
		add_allowed_options( $allowed );
	} else {
		add_option_whitelist( $allowed );
	}

	/*
	 * Re-registering under Classic Editor's own id rather than removing it and
	 * adding a new one: assigning to an existing array key keeps its position,
	 * so the row stays above "Allow users to switch editors" instead of jumping
	 * below it. add_settings_field() is the whole of that write -- see
	 * wp-admin/includes/template.php.
	 */
	add_settings_field(
		$claims ? 'classic-editor-1' : 'herd-editor-1',
		__( 'Default editor for all users', 'herd-editor' ),
		'herd_editor_render_editor_field',
		'writing'
	);
}
add_action( 'admin_init', 'herd_editor_register_settings', 11 );

/**
 * Keep options.php away from Classic Editor's option.
 *
 * Herd's field no longer prints a `classic-editor-replace` input, and the save
 * loop in wp-admin/options.php writes `null` for every allowed option missing
 * from the POST. Classic Editor's sanitiser turns null into `classic`, so
 * leaving it allowed would flip the site to Classic on every Writing save.
 * herd_editor_sanitize_editor() writes it instead.
 *
 * @param array<string,string[]> $options Allowed options by group.
 * @return array<string,string[]>
 */
function herd_editor_release_classic_option( $options ) {
	$writing = isset( $options['writing'] ) ? (array) $options['writing'] : array();
	/*
	 * Only when Herd's own field is the one on the screen. If registration bowed
	 * out above, Classic Editor is still printing its own input and must keep
	 * saving it.
	 */
	if ( ! in_array( HERD_EDITOR_OPTION, $writing, true ) ) {
		return $options;
	}
	$options['writing'] = array_values( array_diff( $writing, array( 'classic-editor-replace' ) ) );
	return $options;
}
add_filter( 'allowed_options', 'herd_editor_release_classic_option' );

/**
 * The three radios, on Settings > Writing and on a user profile alike.
 *
 * `.classic-editor-options` is Classic Editor's wrapper class, kept so its
 * `#classic-editor-options` deep link still highlights this row.
 *
 * @param array $args Settings API args. `user_id` selects whose value to show.
 */
function herd_editor_render_editor_field( $args = array() ) {
	$user_id = isset( $args['user_id'] ) ? (int) $args['user_id'] : 0;
	$current = herd_editor_resolved_editor( $user_id );
	?>
	<div class="classic-editor-options herd-editor-options">
		<?php foreach ( herd_editor_editor_choices() as $value => $label ) : ?>
			<p>
				<input type="radio" name="<?php echo esc_attr( HERD_EDITOR_OPTION ); ?>" id="herd-editor-<?php echo esc_attr( $value ); ?>" value="<?php echo esc_attr( $value ); ?>"<?php checked( $current, $value ); ?> />
				<label for="herd-editor-<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></label>
			</p>
		<?php endforeach; ?>
	</div>
	<?php
}

/**
 * Hand the per-user row over from Classic Editor.
 *
 * Classic_Editor::init_actions() runs on `plugins_loaded` at the default
 * priority, so 11 is late enough to unhook whatever it added -- including the
 * case where it added nothing, because "Allow users to switch editors" is off.
 */
function herd_editor_claim_user_settings() {
	if ( class_exists( 'Classic_Editor' ) ) {
		remove_action( 'profile_personal_options', array( 'Classic_Editor', 'user_settings' ) );
		remove_action( 'edit_user_profile', array( 'Classic_Editor', 'user_settings' ) );
		remove_action( 'personal_options_update', array( 'Classic_Editor', 'save_user_settings' ) );
		remove_action( 'edit_user_profile_update', array( 'Classic_Editor', 'save_user_settings' ) );
	}

	if ( ! herd_editor_allow_users() ) {
		return;
	}

	/*
	 * `personal_options` fires inside the Personal Options table, for one's own
	 * profile and for somebody else's alike, so the row can simply be a row.
	 * Classic Editor uses the hook after that table closes and then moves the
	 * row back with jQuery -- and its anchor, tr.user-rich-editing-wrap, is only
	 * printed for a user who has already turned the visual editor off, so for
	 * most people that move silently does nothing.
	 */
	add_action( 'personal_options', 'herd_editor_user_settings' );
	add_action( 'personal_options_update', 'herd_editor_save_user_settings' );
	add_action( 'edit_user_profile_update', 'herd_editor_save_user_settings' );
}
add_action( 'plugins_loaded', 'herd_editor_claim_user_settings', 11 );

/**
 * The Default Editor row on a profile.
 *
 * A bare <tr>: `personal_options` fires between the rows of the Personal
 * Options table, so there is nothing to build and nothing to move afterwards.
 *
 * @param WP_User|null $user User being edited, or null on one's own profile.
 */
function herd_editor_user_settings( $user = null ) {
	global $user_can_edit;
	if ( ! $user_can_edit ) {
		return;
	}
	$user_id = $user instanceof WP_User ? (int) $user->ID : 0;
	?>
	<tr class="herd-editor-user-options">
		<th scope="row"><?php esc_html_e( 'Default Editor', 'herd-editor' ); ?></th>
		<td>
			<?php wp_nonce_field( 'herd-editor-user-settings', 'herd-editor-user-settings' ); ?>
			<?php herd_editor_render_editor_field( array( 'user_id' => $user_id ) ); ?>
		</td>
	</tr>
	<?php
}

/**
 * Save one user's editor choice, and mirror it into Classic Editor's user option.
 *
 * @param int $user_id User being saved.
 */
function herd_editor_save_user_settings( $user_id ) {
	if ( ! isset( $_POST['herd-editor-user-settings'], $_POST[ HERD_EDITOR_OPTION ] ) ) {
		return;
	}
	if ( ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['herd-editor-user-settings'] ) ), 'herd-editor-user-settings' ) ) {
		return;
	}

	$user_id = (int) $user_id;
	if ( get_current_user_id() !== $user_id && ! current_user_can( 'edit_user', $user_id ) ) {
		return;
	}

	$value = sanitize_key( wp_unslash( $_POST[ HERD_EDITOR_OPTION ] ) );
	if ( ! isset( herd_editor_editor_choices()[ $value ] ) ) {
		return;
	}

	update_user_option( $user_id, HERD_EDITOR_USER_OPTION, $value );
	update_user_option( $user_id, 'classic-editor-settings', herd_editor_mirror_value( $value ) );
}

/**
 * Whether this request should open in Herd rather than the native editors.
 *
 * Every reason to say no is a silent one. Someone who cannot use Herd -- the
 * wrong post type, or without the capability -- simply gets the editor they
 * would have got before, with no notice and no error.
 *
 * @param WP_Post $post Post being edited.
 * @return bool
 */
function herd_editor_is_default_for( $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return false;
	}
	return 'herd' === herd_editor_resolved_editor();
}

/**
 * Render Herd in place of the native editors on post.php and post-new.php.
 *
 * Core fires `replace_editor` before it has emitted anything -- post.php:194
 * and post-new.php:70, the latter after the auto-draft exists -- which is
 * exactly where the block and classic editors take over, so Herd takes over
 * there too. It used to redirect to its own submenu page instead, which cost a
 * second full admin bootstrap on every open: the click sat on a 302 with an
 * empty body while WordPress booted twice. Rendering here costs one.
 *
 * Claiming the request means answering `true`, which stands core's own editor
 * down. Both call sites close with admin-footer.php themselves, so the screen
 * emits the header and the body and nothing else.
 *
 * The submenu page stays registered: admin.php?page=herd-editor&post=N is still
 * a valid way in, and is still where a save lands.
 *
 * @param bool    $replace Whether the editor has already been replaced.
 * @param WP_Post $post    Post being edited.
 * @return bool
 */
function herd_editor_replace_editor( $replace, $post ) {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if ( $replace || isset( $_GET['classic-editor'] ) || isset( $_GET[ HERD_EDITOR_FORGET_ARG ] ) ) {
		return $replace;
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended

	if ( ! herd_editor_is_default_for( $post ) ) {
		return $replace;
	}

	/*
	 * Core has printed nothing at either call site, but a plugin emitting a
	 * notice during admin_init would have. Falling through to the native editor
	 * is a better failure than a warning above a half-rendered screen.
	 */
	if ( headers_sent() ) {
		return $replace;
	}

	/*
	 * `replace_editor` is asked two different questions. post.php:194 and
	 * post-new.php:70 ask it to actually replace the editor. WP_Screen::get()
	 * asks it as a plain predicate -- "will something replace the editor?" --
	 * only to decide `is_block_editor`, and it asks from inside
	 * set_current_screen(), which admin.php runs on every admin request.
	 *
	 * Both want the same answer, but only one wants a rendered page. The old
	 * redirect could not tell them apart and did not need to: it exited either
	 * way. Rendering has to, or the screen is emitted from inside
	 * set_current_screen() -- before the screen it needs even exists -- and then
	 * again at the real call site.
	 *
	 * The screen itself is what separates them. WP_Screen::get() is asking
	 * *because* there is no current screen yet; by post.php:194 admin.php has
	 * built one. Answer the predicate honestly in both cases; render in one.
	 */
	static $rendered = false;
	if ( $rendered || ! get_current_screen() ) {
		return true;
	}
	$rendered = true;

	/*
	 * Whatever core put in the URL is already in $_GET on this same request --
	 * revision.php sends a restore back through post.php carrying `message` and
	 * `revision` -- so the screen reads it directly. Nothing to carry.
	 */
	$GLOBALS['herd_editor_rendering_inline'] = true;
	herd_editor_current_post( $post );
	herd_editor_render_screen();
	return true;
}
add_filter( 'replace_editor', 'herd_editor_replace_editor', 10, 2 );

/**
 * A link into one of the native editors that will actually get there.
 *
 * Two args, both load-bearing. Herd's own stands the redirect down, or the
 * link comes straight back here. Classic Editor's `classic-editor__forget` is
 * needed because Classic_Editor::is_classic() consults its remembered per-post
 * choice first and never reaches the `classic-editor` arg without it -- so
 * without the forget, a "Classic editor" link on a post with blocks opens
 * Gutenberg.
 *
 * @param int    $post_id Post to edit.
 * @param string $editor  `block` or `classic`.
 * @return string
 */
function herd_editor_native_url( $post_id, $editor ) {
	$args = array(
		HERD_EDITOR_FORGET_ARG   => '1',
		'classic-editor__forget' => '1',
	);
	if ( 'classic' === $editor ) {
		$args['classic-editor'] = '';
	}
	return add_query_arg( $args, get_edit_post_link( $post_id, 'raw' ) );
}

/**
 * The document a post opens with when it has none.
 *
 * WordPress already has an answer to this question -- the post type's block
 * template, which is where the theme puts the hero every page begins with. It
 * is a Gutenberg-only mechanism, which is exactly why a page created in Herd
 * arrived empty. Reading the same template rather than naming a block here
 * keeps the two editors agreeing about what a new page is.
 *
 * @param WP_Post $post Post being opened.
 * @return string Serialized block markup, or an empty string.
 */
function herd_editor_starter_content( $post ) {
	$type     = get_post_type_object( $post->post_type );

	$template = $type && ! empty( $type->template ) ? $type->template : array();

	/**
	 * Filter the block template a new post opens with in Herd Editor.
	 *
	 * @param array   $template Core's block template array.
	 * @param WP_Post $post     Post being opened.
	 */
	$template = (array) apply_filters( 'herd_editor_starter_template', $template, $post );

	return herd_editor_serialize_template( $template );
}

/**
 * Serialize a core block template to block markup.
 *
 * The comment shape matches the one src/document.js generates, so a seeded
 * block and an inserted one are indistinguishable once saved. The template's
 * Template lock attributes are kept verbatim. Herd reads and honours them when
 * deciding whether a row may be moved, duplicated, or removed.
 *
 * @param array $template Core block template: a list of [ name, attrs, inner ].
 * @return string
 */
function herd_editor_serialize_template( $template ) {
	$blocks = array();

	foreach ( (array) $template as $entry ) {
		if ( ! is_array( $entry ) || empty( $entry[0] ) || ! is_string( $entry[0] ) ) {
			continue;
		}

		$name       = $entry[0];
		$attributes = isset( $entry[1] ) && is_array( $entry[1] ) ? $entry[1] : array();
		$inner      = isset( $entry[2] ) && is_array( $entry[2] ) ? $entry[2] : array();
		if ( 0 === strpos( $name, 'acf/' ) ) {
			$data       = isset( $attributes['data'] ) && is_array( $attributes['data'] ) ? $attributes['data'] : array();
			$attributes['name'] = $name;
			$attributes['data'] = herd_editor_block_data_with_keys( $name, $data );
			if ( ! isset( $attributes['mode'] ) ) {
				$attributes['mode'] = 'edit';
			}
		}

		$json    = $attributes ? ' ' . wp_json_encode( $attributes, JSON_UNESCAPED_SLASHES ) : '';
		$short   = 0 === strpos( $name, 'core/' ) ? substr( $name, 5 ) : $name;
		$content = herd_editor_serialize_template( $inner );

		$blocks[] = $content
			? '<!-- wp:' . $short . $json . ' -->' . $content . '<!-- /wp:' . $short . ' -->'
			: '<!-- wp:' . $short . $json . ' /-->';
	}

	return implode( "\n\n", $blocks );
}

/**
 * Attach ACF's field key references to a block's data.
 *
 * ACF resolves a block's values by field name, but writes `_name => field_key`
 * beside each one; a block saved without them differs from every block the
 * Block editor produces. The theme has its own version of this, in a file that
 * is not always loaded, so this asks ACF directly.
 *
 * @param string $name Block name, e.g. `acf/hero`.
 * @param array  $data Field name to value.
 * @return array
 */
function herd_editor_block_data_with_keys( $name, $data ) {
	if ( ! $data || ! function_exists( 'acf_get_block_fields' ) ) {
		return $data;
	}

	$keys = array();
	foreach ( (array) acf_get_block_fields( array( 'name' => $name ) ) as $field ) {
		if ( ! empty( $field['name'] ) && ! empty( $field['key'] ) ) {
			$keys[ $field['name'] ] = $field['key'];
		}
	}

	$result = array();
	foreach ( $data as $field_name => $value ) {
		$result[ $field_name ] = $value;
		if ( isset( $keys[ $field_name ] ) ) {
			$result[ '_' . $field_name ] = $keys[ $field_name ];
		}
	}

	return $result;
}
