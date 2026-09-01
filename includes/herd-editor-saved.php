<?php
/**
 * What a save has to say for itself.
 *
 * Core packs the answer to a save into a `message` query arg and unpacks it in
 * wp-admin/edit-form-advanced.php -- a file Herd does not load. This is where it
 * is turned back into a sentence instead, and where the arg is carried through
 * the redirects that rebuild Herd's URL.
 *
 * There are two ways a save gets here now. A Herd save is an AJAX request that
 * never leaves the page, and herd_editor_ajax_save_post() works the number out
 * with herd_editor_save_message() and passes it to herd_editor_saved_notice()
 * directly. A save made anywhere else -- Classic, a restored revision, a Herd
 * screen whose bundle never ran -- still posts to post.php and comes back on a
 * redirect, and that one arrives as `?message=`. Both end up in the same
 * sentence, which is the point of keeping the message table here.
 *
 * @package herd-editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * The message codes that come with somewhere to go and look.
 *
 * The same five core links. A save that changed what a visitor sees is worth
 * offering to go and check; a custom field written or a revision restored has
 * nothing new to show, and a link on every notice teaches an editor to ignore
 * the one that matters.
 */
const HERD_EDITOR_LINKED_MESSAGES = array( 1, 6, 8, 9, 10 );

/**
 * Herd's URL for a post, keeping whatever core said about the save.
 *
 * `message` is how WordPress names what just happened -- published, drafted,
 * scheduled -- and `revision` is what message 5 needs in order to say which
 * revision was restored. The post-save redirect into Herd rebuilds the URL from
 * scratch rather than amending core's, so without this the answer is dropped and
 * the screen arrives with nothing to report.
 *
 * Opening the editor needs none of this: Herd renders in place on post.php and
 * post-new.php now, so whatever core put in the URL is still in $_GET when
 * herd_editor_saved_notice() reads it.
 *
 * @param array $args    Query args to take the answer from.
 * @param int   $post_id Post being edited.
 * @return string
 */
function herd_editor_carry_message( $args, $post_id ) {
	$carry = array();
	foreach ( array( 'message', 'revision' ) as $key ) {
		// Zero is what absint() gives back for anything that was never a number,
		// and it is not a message or a revision either, so it is not worth carrying.
		$value = isset( $args[ $key ] ) ? absint( $args[ $key ] ) : 0;
		if ( $value ) {
			$carry[ $key ] = $value;
		}
	}
	$url = herd_editor_url( $post_id );
	return $carry ? add_query_arg( $carry, $url ) : $url;
}

/**
 * The same, read off a URL core has already built.
 *
 * @param string $location URL core is about to redirect to.
 * @param int    $post_id  Post being edited.
 * @return string
 */
function herd_editor_carry_message_from( $location, $post_id ) {
	$query = wp_parse_url( $location, PHP_URL_QUERY );
	$args  = array();
	if ( $query ) {
		wp_parse_str( $query, $args );
	}
	return herd_editor_carry_message( $args, $post_id );
}

/**
 * Where a visitor would read this post, or nothing.
 *
 * A draft has no such address. `get_permalink()` hands back the URL the post
 * will have once published, which 404s until it is, so a caller told there is
 * nowhere to send anyone can offer a preview instead of a broken promise.
 *
 * Private is its own case: not public, but perfectly readable by whoever is
 * allowed to read it, which on this screen is usually whoever wrote it.
 *
 * @param WP_Post|null $post Post being edited.
 * @return string Permalink, or an empty string.
 */
function herd_editor_view_url( $post ) {
	if ( ! $post ) {
		return '';
	}
	$status = get_post_status_object( get_post_status( $post ) );
	if ( ! $status ) {
		return '';
	}
	if ( ! $status->public && ! ( $status->private && current_user_can( 'read_post', $post->ID ) ) ) {
		return '';
	}
	return (string) get_permalink( $post );
}

/**
 * What the command bar calls this post's state.
 *
 * `auto-draft` has no human label -- get_post_status_object() hands back the
 * slug -- and it is not a state anybody chose. A post that has never been saved
 * is a draft, which is what core's own publish box calls it.
 *
 * Every other status answers for itself, so Scheduled, Pending Review and
 * Private all reach the bar under their own names rather than collapsing into
 * one muted "not published".
 *
 * @param WP_Post $post Post being edited.
 * @return string
 */
function herd_editor_status_label( $post ) {
	$status = get_post_status_object( 'auto-draft' === $post->post_status ? 'draft' : $post->post_status );
	return $status ? $status->label : $post->post_status;
}

/**
 * A post type's singular name, mid-sentence.
 *
 * "View Page" is title case in the middle of a sentence, which the style guide
 * does not use anywhere. `strtolower()` alone would do it, but it works a byte
 * at a time and would mangle the first letter of a singular name in any locale
 * that does not spell it in ASCII.
 *
 * @param WP_Post $post Post being edited.
 * @return string
 */
function herd_editor_singular_lower( $post ) {
	$type = get_post_type_object( $post->post_type );
	$name = $type ? $type->labels->singular_name : __( 'Post', 'herd-editor' );
	return function_exists( 'mb_strtolower' ) ? mb_strtolower( $name, 'UTF-8' ) : strtolower( $name );
}

/**
 * Core's post-updated messages, rebuilt around a post type's own name.
 *
 * Core writes these out longhand twice, once for posts and once for pages, and
 * keeps them in edit-form-advanced.php where only the native editor can reach
 * them. Building them from the post type's singular name instead says the right
 * thing for a page, a post and a program page alike, without a third copy.
 *
 * The result is passed through `post_updated_messages` because a post type that
 * has taken the trouble to name its own states deserves to be heard on this
 * screen too.
 *
 * @param WP_Post $post Post being edited.
 * @return array<string,array<int,string>> Message table, keyed by post type.
 */
function herd_editor_message_table( $post ) {
	$type = get_post_type_object( $post->post_type );
	$name = $type ? $type->labels->singular_name : __( 'Post', 'herd-editor' );

	$scheduled = sprintf(
		/* translators: 1: date, 2: time. */
		__( '%1$s at %2$s', 'herd-editor' ),
		/* translators: date format for a scheduled post, see https://www.php.net/manual/datetime.format.php */
		date_i18n( _x( 'M j, Y', 'publish box date format', 'herd-editor' ), strtotime( $post->post_date ) ),
		/* translators: time format for a scheduled post, see https://www.php.net/manual/datetime.format.php */
		date_i18n( _x( 'H:i', 'publish box time format', 'herd-editor' ), strtotime( $post->post_date ) )
	);

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$revision = isset( $_GET['revision'] ) ? absint( $_GET['revision'] ) : 0;

	$messages = array(
		0  => '',
		/* translators: %s: post type singular name, e.g. Page. */
		1  => sprintf( __( '%s updated.', 'herd-editor' ), $name ),
		2  => __( 'Custom field updated.', 'herd-editor' ),
		3  => __( 'Custom field deleted.', 'herd-editor' ),
		/* translators: %s: post type singular name, e.g. Page. */
		4  => sprintf( __( '%s updated.', 'herd-editor' ), $name ),
		5  => $revision
			/* translators: 1: post type singular name, e.g. Page. 2: date and time of the revision. */
			? sprintf( __( '%1$s restored to revision from %2$s.', 'herd-editor' ), $name, wp_post_revision_title( $revision, false ) )
			: '',
		/* translators: %s: post type singular name, e.g. Page. */
		6  => sprintf( __( '%s published.', 'herd-editor' ), $name ),
		/* translators: %s: post type singular name, e.g. Page. */
		7  => sprintf( __( '%s saved.', 'herd-editor' ), $name ),
		/* translators: %s: post type singular name, e.g. Page. */
		8  => sprintf( __( '%s submitted.', 'herd-editor' ), $name ),
		9  => sprintf(
			/* translators: 1: post type singular name, e.g. Page. 2: scheduled date. */
			__( '%1$s scheduled for: %2$s.', 'herd-editor' ),
			$name,
			'<strong>' . $scheduled . '</strong>'
		),
		/* translators: %s: post type singular name, e.g. Page. */
		10 => sprintf( __( '%s draft updated.', 'herd-editor' ), $name ),
	);

	/** This filter is documented in wp-admin/edit-form-advanced.php */
	return apply_filters(
		'post_updated_messages', // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's own filter, read so Herd's notice says what post.php would have.
		array(
			'post'           => $messages,
			$post->post_type => $messages,
		)
	);
}

/**
 * What to tell the editor about the save they just made, if anything.
 *
 * The text and the link are kept apart rather than concatenated the way core
 * does it. Core's strings carry their own anchor, which cannot be given a
 * target, and Herd's opens in a new tab -- leaving the post being edited where
 * the editor left it, which is the whole point of offering the link at all.
 * Anything a `post_updated_messages` filter baked in is therefore stripped, so
 * a notice never ends up with two links to the same page.
 *
 * The number is an argument rather than something read from `$_GET` here,
 * because a Herd save no longer travels through a redirect to acquire one: the
 * save endpoint works it out with herd_editor_save_message() and hands the
 * finished notice back in its response. `$_GET['message']` is still the answer
 * for every save that did navigate -- one made in Classic, a revision restored
 * -- so passing nothing keeps the original behaviour.
 *
 * @param WP_Post|null $post   Post being edited.
 * @param int|null     $number The message code, or null to read `?message=`.
 * @return array{text:string,label:string,url:string}|null
 */
function herd_editor_saved_notice( $post, $number = null ) {
	if ( null === $number ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$number = isset( $_GET['message'] ) ? absint( $_GET['message'] ) : 0;
	}
	$number = absint( $number );
	if ( ! $post || ! $number ) {
		return null;
	}

	$table = herd_editor_message_table( $post );
	$text  = '';
	if ( isset( $table[ $post->post_type ][ $number ] ) ) {
		$text = $table[ $post->post_type ][ $number ];
	} elseif ( isset( $table['post'][ $number ] ) ) {
		$text = $table['post'][ $number ];
	}

	$text = trim( wp_kses( (string) $text, array( 'strong' => array(), 'em' => array() ) ) );
	if ( '' === $text ) {
		return null;
	}

	$name  = herd_editor_singular_lower( $post );
	$label = '';
	$url   = '';

	if ( in_array( $number, HERD_EDITOR_LINKED_MESSAGES, true ) ) {
		$url = herd_editor_view_url( $post );
		if ( $url ) {
			/* translators: %s: post type singular name, e.g. page. */
			$label = sprintf( __( 'View %s', 'herd-editor' ), $name );
		} else {
			$url = (string) get_preview_post_link( $post );
			/* translators: %s: post type singular name, e.g. page. */
			$label = $url ? sprintf( __( 'Preview %s', 'herd-editor' ), $name ) : '';
		}
	}

	return array(
		'text'  => $text,
		'label' => $label,
		'url'   => $url,
	);
}

/**
 * How the command bar reports the last save.
 *
 * This is the tail of a sentence the status label begins -- "Published, saved
 * seven months ago" -- so it is lower case and never stands on its own.
 *
 * `human_time_diff()` measures in minutes at its finest, so the moment after a
 * save -- the one moment the label is read most closely -- it says "saved 1 min
 * ago" about something that happened two seconds ago. Under a minute the honest
 * answer is that it just happened.
 *
 * An auto-draft is the other end of the same problem: its modified time is when
 * core created the row, which is not a save anybody made, and a post nobody has
 * saved has certainly never been published.
 *
 * @param WP_Post $post Post being edited.
 * @return string
 */
function herd_editor_saved_label( $post ) {
	if ( 'auto-draft' === $post->post_status ) {
		return __( 'never published', 'herd-editor' );
	}
	$modified = (int) get_post_modified_time( 'U', true, $post );
	if ( time() - $modified < MINUTE_IN_SECONDS ) {
		return __( 'saved just now', 'herd-editor' );
	}
	return sprintf(
		/* translators: %s: human readable time difference. */
		__( 'saved %s ago', 'herd-editor' ),
		human_time_diff( $modified )
	);
}
