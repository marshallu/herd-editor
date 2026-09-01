<?php
/**
 * Settings > Herd Editor.
 *
 * Everything on this screen is a filter Herd already published. Filters are the
 * right mechanism for a theme and the wrong one for a site admin, so each one
 * gets a control -- and the two stay in one order of precedence:
 *
 *   THE STORED SETTING IS THE DEFAULT PASSED INTO THE FILTER.
 *
 * So a theme's `add_filter()` always wins over anything saved here, and a site
 * with nobody to write PHP still gets to answer the same questions. Which of
 * the two decided is never ambiguous, and a theme that supplies a value can say
 * so on the screen rather than being silently overridden by it.
 *
 * A site that never opens this screen behaves exactly as the plugin's own
 * defaults describe: every value below is unset until somebody sets it, and
 * unset means "the plugin decides", not a snapshot of what it decided once.
 *
 * ON MULTISITE THIS IS A NETWORK SETTING, and there is no per-site screen.
 * Everything here describes the editor rather than the content -- which blocks
 * exist, how they group, what the theme's admin CSS is called -- and all of that
 * comes from the theme and the plugins, which a network shares. Storing it per
 * site would mean maintaining one copy of the block grouping for every site on
 * the network and having them drift, so the screen moves to Network Admin and
 * the value moves to a site option.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/** The one option row this plugin adds. Removed by uninstall.php. */
const HERD_EDITOR_SETTINGS_OPTION = 'herd-editor-settings-site';

/** The settings screen's slug. */
const HERD_EDITOR_SETTINGS_PAGE = 'herd-editor-settings';

/**
 * Whether these settings belong to the network rather than to one site.
 *
 * @return bool
 */
function herd_editor_settings_is_network() {
	return is_multisite();
}

/** The capability that reaches the screen, wherever it lives. */
function herd_editor_settings_capability() {
	return herd_editor_settings_is_network() ? 'manage_network_options' : 'manage_options';
}

/**
 * Every stored setting, with the shape the rest of the plugin expects.
 *
 * @return array<string,mixed>
 */
function herd_editor_settings( $fresh = false ) {
	static $cache = null;
	if ( null !== $cache && ! $fresh ) {
		return $cache;
	}
	$stored = herd_editor_settings_is_network()
		? get_site_option( HERD_EDITOR_SETTINGS_OPTION )
		: get_option( HERD_EDITOR_SETTINGS_OPTION );
	$cache = is_array( $stored ) ? $stored : array();
	return $cache;
}

/**
 * One stored setting.
 *
 * @param string $key     Setting name.
 * @param mixed  $default Value when the site has never set it.
 * @return mixed
 */
function herd_editor_setting( $key, $default = null ) {
	$settings = herd_editor_settings();
	return array_key_exists( $key, $settings ) ? $settings[ $key ] : $default;
}

/* -------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------- */

/**
 * Add the screen: Network Admin > Settings on multisite, Settings otherwise.
 *
 * Only one of the two is ever registered, so there is no per-site screen on a
 * network and therefore no way to save a value that the network would ignore.
 */
function herd_editor_settings_menu() {
	if ( herd_editor_settings_is_network() ) {
		add_submenu_page(
			'settings.php',
			__( 'Herd Editor', 'herd-editor' ),
			__( 'Herd Editor', 'herd-editor' ),
			herd_editor_settings_capability(),
			HERD_EDITOR_SETTINGS_PAGE,
			'herd_editor_settings_render'
		);
		return;
	}
	add_options_page(
		__( 'Herd Editor', 'herd-editor' ),
		__( 'Herd Editor', 'herd-editor' ),
		herd_editor_settings_capability(),
		HERD_EDITOR_SETTINGS_PAGE,
		'herd_editor_settings_render'
	);
}
add_action( herd_editor_settings_is_network() ? 'network_admin_menu' : 'admin_menu', 'herd_editor_settings_menu' );

/**
 * Register the option with the Settings API.
 *
 * Single site only. `options.php` reads and writes `get_option()`, and on a
 * network this value is a site option -- so registering it there would give the
 * Settings API a target it cannot reach, and a save that silently wrote to the
 * wrong place. The network screen posts to itself instead; see
 * herd_editor_settings_save_network().
 */
function herd_editor_settings_register() {
	if ( herd_editor_settings_is_network() ) {
		return;
	}
	register_setting(
		'herd-editor-settings',
		HERD_EDITOR_SETTINGS_OPTION,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'herd_editor_settings_sanitize',
			/* Which blocks an editor may insert is not a thing the REST API should change. */
			'show_in_rest'      => false,
			'default'           => array(),
		)
	);
}
add_action( 'admin_init', 'herd_editor_settings_register' );

/**
 * Save the network settings.
 *
 * The Settings API's save path is `options.php`, which is single-site only, so
 * this is the one place Herd does its own nonce check and write.
 *
 * @return void
 */
function herd_editor_settings_save_network() {
	if ( ! herd_editor_settings_is_network() ) {
		return;
	}
	if ( ! isset( $_POST['herd_editor_settings_submit'] ) ) {
		return;
	}
	check_admin_referer( 'herd-editor-settings' );
	if ( ! current_user_can( herd_editor_settings_capability() ) ) {
		wp_die( esc_html__( 'You are not allowed to change these settings.', 'herd-editor' ), 403 );
	}

	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- herd_editor_settings_sanitize() is the sanitiser.
	$posted = isset( $_POST[ HERD_EDITOR_SETTINGS_OPTION ] ) ? wp_unslash( $_POST[ HERD_EDITOR_SETTINGS_OPTION ] ) : array();
	update_site_option( HERD_EDITOR_SETTINGS_OPTION, herd_editor_settings_sanitize( $posted ) );
	herd_editor_settings( true );

	wp_safe_redirect(
		add_query_arg(
			array( 'page' => HERD_EDITOR_SETTINGS_PAGE, 'updated' => '1' ),
			network_admin_url( 'settings.php' )
		)
	);
	exit;
}
add_action( 'network_admin_menu', 'herd_editor_settings_save_network', 20 );

/**
 * Sanitise the whole option.
 *
 * Every key is dropped rather than defaulted when it holds nothing, so "unset"
 * stays distinguishable from "set to the same thing the plugin would have
 * chosen". That difference is the whole contract at the top of this file: an
 * unset value follows the plugin as it changes, a set one does not.
 *
 * @param mixed $value Posted value.
 * @return array<string,mixed>
 */
function herd_editor_settings_sanitize( $value ) {
	$value = is_array( $value ) ? $value : array();
	$clean = array();

	$post_types = isset( $value['post_types'] ) ? (array) $value['post_types'] : array();
	$post_types = array_values( array_intersect( array_map( 'sanitize_key', $post_types ), array_keys( herd_editor_settings_post_types() ) ) );
	if ( $post_types ) {
		$clean['post_types'] = $post_types;
	}

	$capability = isset( $value['capability'] ) ? sanitize_key( $value['capability'] ) : '';
	if ( '' !== $capability ) {
		$clean['capability'] = $capability;
	}

	$field = isset( $value['visibility_field'] ) ? sanitize_key( $value['visibility_field'] ) : '';
	if ( '' !== $field ) {
		$clean['visibility_field'] = $field;
	}

	$order = herd_editor_settings_lines( isset( $value['group_order'] ) ? $value['group_order'] : '' );
	if ( $order ) {
		$clean['group_order'] = $order;
	}

	/*
	 * A block mapped to a group that is not on the list would be drawn in a
	 * heading of its own after every named one, which reads as a bug rather
	 * than as a choice. Dropped instead, so it falls back to its category.
	 */
	$groups = isset( $value['groups'] ) ? (array) $value['groups'] : array();
	$map    = array();
	foreach ( $groups as $name => $group ) {
		$group = trim( wp_strip_all_tags( (string) $group ) );
		if ( '' === $group || ( $order && ! in_array( $group, $order, true ) ) ) {
			continue;
		}
		$map[ herd_editor_settings_block_name( $name ) ] = $group;
	}
	unset( $map[''] );
	if ( $map ) {
		$clean['groups'] = $map;
	}

	$hidden = isset( $value['hidden'] ) ? (array) $value['hidden'] : array();
	$hidden = array_values( array_filter( array_map( 'herd_editor_settings_block_name', $hidden ) ) );
	if ( $hidden ) {
		$clean['hidden'] = $hidden;
	}

	/*
	 * Suppression is on by default, so only the off state is worth storing --
	 * and it has to be stored, or the checkbox could never be cleared.
	 */
	if ( empty( $value['suppress_theme_styles'] ) ) {
		$clean['suppress_theme_styles'] = false;
	}

	$keep = isset( $value['style_handles_keep'] ) ? (array) $value['style_handles_keep'] : array();
	$keep = array_values( array_filter( array_map( 'sanitize_key', $keep ) ) );
	if ( $keep ) {
		$clean['style_handles_keep'] = $keep;
	}

	$drop = herd_editor_settings_lines( isset( $value['style_handles_drop'] ) ? $value['style_handles_drop'] : '' );
	$drop = array_values( array_filter( array_map( 'sanitize_key', $drop ) ) );
	if ( $drop ) {
		$clean['style_handles_drop'] = $drop;
	}

	return $clean;
}

/**
 * A block name posted from a form field.
 *
 * Names arrive as form keys, where a dot and a space are not safe, so the
 * screen sends `acf|hero` and this puts the slash back. `sanitize_key()` would
 * eat the separator, so the two halves are cleaned separately.
 *
 * @param string $name Posted block name.
 * @return string Namespaced block name, or '' when it is not one.
 */
function herd_editor_settings_block_name( $name ) {
	$parts = explode( '|', (string) $name );
	if ( 2 !== count( $parts ) ) {
		return '';
	}
	$namespace = preg_replace( '/[^a-z0-9-]/', '', strtolower( $parts[0] ) );
	$block     = preg_replace( '/[^a-z0-9-]/', '', strtolower( $parts[1] ) );
	return ( '' !== $namespace && '' !== $block ) ? $namespace . '/' . $block : '';
}

/** The form-safe key for a block name. */
function herd_editor_settings_block_key( $name ) {
	return str_replace( '/', '|', (string) $name );
}

/**
 * A textarea of one value per line, as a list.
 *
 * @param string $text Raw textarea value.
 * @return string[]
 */
function herd_editor_settings_lines( $text ) {
	$lines = preg_split( '/\R/', (string) $text );
	$lines = array_map( function ( $line ) {
		return trim( wp_strip_all_tags( $line ) );
	}, is_array( $lines ) ? $lines : array() );
	return array_values( array_unique( array_filter( $lines, 'strlen' ) ) );
}

/* -------------------------------------------------------------------------
 * What the screen has to offer
 * ---------------------------------------------------------------------- */

/**
 * Post types Herd could be offered for.
 *
 * Anything that supports the editor and is not a core internal, which is the
 * same test the block editor applies before it will open one.
 *
 * @return array<string,string> Name to label.
 */
function herd_editor_settings_post_types() {
	$types = array();
	foreach ( get_post_types( array( 'show_ui' => true ), 'objects' ) as $type ) {
		if ( ! post_type_supports( $type->name, 'editor' ) ) {
			continue;
		}
		if ( in_array( $type->name, array( 'attachment', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation' ), true ) ) {
			continue;
		}
		$types[ $type->name ] = $type->labels->singular_name ? $type->labels->singular_name : $type->name;
	}
	return $types;
}

/**
 * The ACF blocks this site has registered, as name => title.
 *
 * @return array<string,string>
 */
function herd_editor_settings_blocks() {
	$blocks = array();
	if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
		return $blocks;
	}
	foreach ( WP_Block_Type_Registry::get_instance()->get_all_registered() as $name => $type ) {
		if ( 0 !== strpos( $name, 'acf/' ) ) {
			continue;
		}
		$blocks[ $name ] = $type->title ? $type->title : $name;
	}
	asort( $blocks );
	return $blocks;
}

/**
 * True/false field names this site's blocks carry, as candidates for "hidden".
 *
 * A visibility field is normally attached to every block at once, so a name
 * that shows up on many blocks is the likely one. Offered as suggestions only:
 * the control is a free text input, because a site may well name it something
 * no heuristic would rank first.
 *
 * @return string[] Field names, most widely attached first.
 */
function herd_editor_settings_visibility_candidates() {
	if ( ! function_exists( 'acf_get_field_groups' ) || ! function_exists( 'acf_get_fields' ) ) {
		return array();
	}
	$counts = array();
	foreach ( acf_get_field_groups() as $group ) {
		foreach ( (array) acf_get_fields( $group ) as $field ) {
			if ( empty( $field['name'] ) || ! isset( $field['type'] ) || 'true_false' !== $field['type'] ) {
				continue;
			}
			$name            = (string) $field['name'];
			$counts[ $name ] = isset( $counts[ $name ] ) ? $counts[ $name ] + 1 : 1;
		}
	}
	arsort( $counts );
	return array_slice( array_keys( $counts ), 0, 20 );
}

/**
 * Whether a filter is overriding a stored setting, and what it chose.
 *
 * The screen says so rather than showing a control whose value is not what the
 * site is doing. That is the one thing a settings page layered over filters can
 * get badly wrong.
 *
 * @param mixed $stored   What this screen has saved.
 * @param mixed $resolved What the plugin actually resolved to.
 * @return bool
 */
function herd_editor_settings_overridden( $stored, $resolved ) {
	return wp_json_encode( $stored ) !== wp_json_encode( $resolved );
}

/** The "a filter is deciding this" line. */
function herd_editor_settings_override_note( $stored, $resolved, $shown = '' ) {
	if ( ! herd_editor_settings_overridden( $stored, $resolved ) ) {
		return;
	}
	printf(
		'<p class="description herd-editor-settings__override"><strong>%s</strong> %s</p>',
		esc_html__( 'Set in code.', 'herd-editor' ),
		esc_html(
			'' !== $shown
				/* translators: %s: the value a filter resolved to. */
				? sprintf( __( 'A filter in your theme or a plugin is deciding this, and it currently resolves to: %s', 'herd-editor' ), $shown )
				: __( 'A filter in your theme or a plugin is deciding this, so the control above has no effect.', 'herd-editor' )
		)
	);
}

/* -------------------------------------------------------------------------
 * The screen
 * ---------------------------------------------------------------------- */

/** Render Settings > Herd Editor. */
function herd_editor_settings_render() {
	if ( ! current_user_can( herd_editor_settings_capability() ) ) {
		return;
	}

	$network    = herd_editor_settings_is_network();
	$name       = HERD_EDITOR_SETTINGS_OPTION;
	$post_types = herd_editor_settings_post_types();
	$blocks     = herd_editor_settings_blocks();
	$order      = herd_editor_block_group_order();
	$groups     = herd_editor_block_groups();
	$hidden     = herd_editor_hidden_inserter_blocks();
	$candidates = herd_editor_settings_visibility_candidates();
	$detected   = herd_editor_theme_style_handles();
	$styles     = wp_styles();
	?>
	<div class="wrap herd-editor-settings">
		<h1><?php esc_html_e( 'Herd Editor', 'herd-editor' ); ?></h1>

		<?php if ( $network ) : ?>
			<?php // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read only, to show the notice after our own redirect. ?>
			<?php if ( ! empty( $_GET['updated'] ) ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Settings saved.', 'herd-editor' ); ?></p></div>
			<?php endif; ?>
			<p class="description" style="max-width:52em">
				<strong><?php esc_html_e( 'These settings are for the whole network.', 'herd-editor' ); ?></strong>
				<?php esc_html_e( 'Everything here describes the editor rather than any one site’s content — which blocks exist, how they group, what the theme’s admin CSS is called — and the network shares all of it. There is no per-site version of this screen.', 'herd-editor' ); ?>
			</p>
		<?php endif; ?>

		<?php if ( ! herd_editor_has_acf_pro() ) : ?>
			<div class="notice notice-warning"><p><?php
				printf(
					/* translators: %s: minimum ACF Pro version. */
					esc_html__( 'Herd Editor needs ACF Pro %s or newer. Until it is active, these settings are stored but nothing reads them.', 'herd-editor' ),
					esc_html( HERD_EDITOR_MIN_ACF )
				);
			?></p></div>
		<?php endif; ?>

		<p class="description" style="max-width:52em">
			<?php esc_html_e( 'Every setting here is also a filter. A filter set in your theme or a plugin always wins — where one is, the setting below says so and stops applying.', 'herd-editor' ); ?>
			<?php
			/*
			 * The default-editor choice is deliberately NOT here. It is a
			 * per-site decision -- it lives beside Classic Editor's own row on
			 * Settings > Writing, and a site can allow users to override it --
			 * whereas everything on this screen is about the editor itself.
			 */
			if ( ! $network ) {
				printf(
					' <a href="%s">%s</a>',
					esc_url( admin_url( 'options-writing.php' ) ),
					esc_html__( 'Which editor opens by default is on Settings → Writing.', 'herd-editor' )
				);
			} else {
				esc_html_e( 'Which editor opens by default stays a per-site choice, on each site’s Settings → Writing.', 'herd-editor' );
			}
			?>
		</p>

		<form method="post" action="<?php echo esc_url( $network ? add_query_arg( 'page', HERD_EDITOR_SETTINGS_PAGE, network_admin_url( 'settings.php' ) ) : admin_url( 'options.php' ) ); ?>">
			<?php
			if ( $network ) {
				wp_nonce_field( 'herd-editor-settings' );
				echo '<input type="hidden" name="herd_editor_settings_submit" value="1" />';
			} else {
				settings_fields( 'herd-editor-settings' );
			}
			?>

			<h2 class="title"><?php esc_html_e( 'Where Herd is offered', 'herd-editor' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Post types', 'herd-editor' ); ?></th>
					<td>
						<fieldset>
							<?php
							$chosen = (array) herd_editor_setting( 'post_types', array( 'page', 'post' ) );
							foreach ( $post_types as $type => $label ) :
								?>
								<label style="display:block;margin-bottom:4px">
									<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[post_types][]" value="<?php echo esc_attr( $type ); ?>" <?php checked( in_array( $type, $chosen, true ) ); ?> />
									<?php echo esc_html( $label ); ?> <code><?php echo esc_html( $type ); ?></code>
								</label>
							<?php endforeach; ?>
						</fieldset>
						<?php herd_editor_settings_override_note( $chosen, herd_editor_allowed_post_types(), implode( ', ', herd_editor_allowed_post_types() ) ); ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="herd-capability"><?php esc_html_e( 'Who may use it', 'herd-editor' ); ?></label></th>
					<td>
						<input type="text" class="regular-text" id="herd-capability" name="<?php echo esc_attr( $name ); ?>[capability]" value="<?php echo esc_attr( (string) herd_editor_setting( 'capability', '' ) ); ?>" placeholder="edit_post" />
						<p class="description">
							<?php esc_html_e( 'An extra capability a user must have, on top of being able to edit the post. Leave empty — the default — and anyone who can edit a post can edit it in Herd, which is how the other two editors behave. Set it to something like manage_options to run a limited pilot.', 'herd-editor' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<h2 class="title"><?php esc_html_e( 'The inserter', 'herd-editor' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="herd-group-order"><?php esc_html_e( 'Groups', 'herd-editor' ); ?></label></th>
					<td>
						<textarea id="herd-group-order" name="<?php echo esc_attr( $name ); ?>[group_order]" rows="7" class="large-text code"><?php echo esc_textarea( implode( "\n", (array) herd_editor_setting( 'group_order', array() ) ) ); ?></textarea>
						<p class="description">
							<?php esc_html_e( 'One heading per line, in the order they should appear. Leave empty and Herd groups blocks by the category each one registers, which is what the block editor’s own inserter does.', 'herd-editor' ); ?>
						</p>
						<?php
						herd_editor_settings_override_note(
							(array) herd_editor_setting( 'group_order', array() ),
							herd_editor_setting( 'group_order', array() ) === $order ? (array) herd_editor_setting( 'group_order', array() ) : $order,
							implode( ', ', $order )
						);
						?>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Blocks', 'herd-editor' ); ?></th>
					<td>
						<?php if ( ! $blocks ) : ?>
							<p class="description"><?php esc_html_e( 'No ACF blocks are registered on this site yet.', 'herd-editor' ); ?></p>
						<?php else : ?>
							<table class="widefat striped" style="max-width:64em">
								<thead>
									<tr>
										<th scope="col"><?php esc_html_e( 'Block', 'herd-editor' ); ?></th>
										<th scope="col"><?php esc_html_e( 'Group', 'herd-editor' ); ?></th>
										<th scope="col" style="width:10em"><?php esc_html_e( 'In the inserter', 'herd-editor' ); ?></th>
									</tr>
								</thead>
								<tbody>
								<?php foreach ( $blocks as $block => $title ) :
									$key   = herd_editor_settings_block_key( $block );
									$saved = (array) herd_editor_setting( 'groups', array() );
									?>
									<tr>
										<th scope="row" style="font-weight:400">
											<?php echo esc_html( $title ); ?><br />
											<code style="font-size:11px"><?php echo esc_html( $block ); ?></code>
										</th>
										<td>
											<select name="<?php echo esc_attr( $name ); ?>[groups][<?php echo esc_attr( $key ); ?>]">
												<option value=""><?php
													/* translators: %s: the group a block's own category resolves to. */
													printf( esc_html__( 'From its category — %s', 'herd-editor' ), esc_html( isset( $groups[ $block ] ) ? $groups[ $block ] : herd_editor_settings_category_group( $block ) ) );
												?></option>
												<?php foreach ( (array) herd_editor_setting( 'group_order', $order ) as $label ) : ?>
													<option value="<?php echo esc_attr( $label ); ?>" <?php selected( isset( $saved[ $block ] ) ? $saved[ $block ] : '', $label ); ?>><?php echo esc_html( $label ); ?></option>
												<?php endforeach; ?>
											</select>
										</td>
										<td>
											<label>
												<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[hidden][]" value="<?php echo esc_attr( $key ); ?>" <?php checked( in_array( $block, $hidden, true ) ); ?> />
												<?php esc_html_e( 'Hide', 'herd-editor' ); ?>
											</label>
										</td>
									</tr>
								<?php endforeach; ?>
								</tbody>
							</table>
							<p class="description">
								<?php esc_html_e( 'Hiding a block keeps it out of the inserter for new content. Blocks already on a page keep working and stay editable.', 'herd-editor' ); ?>
							</p>
						<?php endif; ?>
					</td>
				</tr>
			</table>

			<h2 class="title"><?php esc_html_e( 'Hidden blocks', 'herd-editor' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="herd-visibility-field"><?php esc_html_e( 'Visibility field', 'herd-editor' ); ?></label></th>
					<td>
						<input type="text" class="regular-text" id="herd-visibility-field" name="<?php echo esc_attr( $name ); ?>[visibility_field]" value="<?php echo esc_attr( (string) herd_editor_setting( 'visibility_field', '' ) ); ?>" list="herd-visibility-candidates" />
						<datalist id="herd-visibility-candidates">
							<?php foreach ( $candidates as $candidate ) : ?>
								<option value="<?php echo esc_attr( $candidate ); ?>"></option>
							<?php endforeach; ?>
						</datalist>
						<p class="description">
							<?php esc_html_e( 'If your theme gives every block a true/false field that hides it on the front end, name it here and Herd will dim that block’s row and mark it hidden. Leave empty if your theme has no such field.', 'herd-editor' ); ?>
						</p>
						<?php herd_editor_settings_override_note( (string) herd_editor_setting( 'visibility_field', '' ), herd_editor_visibility_field(), herd_editor_visibility_field() ); ?>
					</td>
				</tr>
			</table>

			<h2 class="title"><?php esc_html_e( 'Theme styles', 'herd-editor' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'On the Herd screen', 'herd-editor' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[suppress_theme_styles]" value="1" <?php checked( (bool) herd_editor_setting( 'suppress_theme_styles', true ) ); ?> />
							<?php esc_html_e( 'Do not load the theme’s admin stylesheets', 'herd-editor' ); ?>
						</label>
						<p class="description" style="max-width:52em">
							<?php esc_html_e( 'A theme’s admin CSS is written for the Classic and Block editors, and usually uses !important to override ACF. Herd draws every surface on its own screen, so those rules repaint it rather than customise it. Turn this off only if your theme already excludes itself from the Herd screen.', 'herd-editor' ); ?>
						</p>

						<?php if ( $detected ) : ?>
							<p style="margin-top:1em"><strong><?php esc_html_e( 'Found in your theme:', 'herd-editor' ); ?></strong></p>
							<fieldset>
								<?php
								$keep = (array) herd_editor_setting( 'style_handles_keep', array() );
								foreach ( $detected as $handle ) :
									$src = isset( $styles->registered[ $handle ] ) ? (string) $styles->registered[ $handle ]->src : '';
									?>
									<label style="display:block;margin-bottom:4px">
										<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[style_handles_keep][]" value="<?php echo esc_attr( $handle ); ?>" <?php checked( in_array( $handle, $keep, true ) ); ?> />
										<?php esc_html_e( 'Keep', 'herd-editor' ); ?>
										<code><?php echo esc_html( $handle ); ?></code>
										<?php if ( $src ) : ?>
											<span class="description" style="display:block;margin-left:2em"><?php echo esc_html( $src ); ?></span>
										<?php endif; ?>
									</label>
								<?php endforeach; ?>
							</fieldset>
						<?php else : ?>
							<p class="description" style="margin-top:1em"><?php esc_html_e( 'No stylesheets served from your theme directory are loaded on this screen.', 'herd-editor' ); ?></p>
						<?php endif; ?>

						<p style="margin-top:1em"><label for="herd-style-drop"><strong><?php esc_html_e( 'Also drop these handles', 'herd-editor' ); ?></strong></label></p>
						<textarea id="herd-style-drop" name="<?php echo esc_attr( $name ); ?>[style_handles_drop]" rows="3" class="large-text code"><?php echo esc_textarea( implode( "\n", (array) herd_editor_setting( 'style_handles_drop', array() ) ) ); ?></textarea>
						<p class="description" style="max-width:52em">
							<?php esc_html_e( 'One handle per line, for a stylesheet that is not served from the theme directory and so cannot be found above — a Vite dev server or a CDN, most often.', 'herd-editor' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/**
 * The group a block would land in from its own category, for the screen's
 * "leave this alone" option.
 *
 * @param string $block Block name.
 * @return string
 */
function herd_editor_settings_category_group( $block ) {
	$type = class_exists( 'WP_Block_Type_Registry' ) ? WP_Block_Type_Registry::get_instance()->get_registered( $block ) : null;
	$slug = $type ? (string) $type->category : '';
	if ( '' === $slug ) {
		return __( 'Other', 'herd-editor' );
	}
	$labels = herd_editor_block_categories();
	return isset( $labels[ $slug ] ) ? $labels[ $slug ] : herd_editor_humanize_slug( $slug );
}
