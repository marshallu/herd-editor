<?php

/**
 * Return an ACF setting.
 *
 * @param string $name    Setting name.
 * @param mixed  $default Default value.
 * @return mixed
 */
function acf_get_setting( $name, $default = null ) {}

/**
 * Validate one ACF field value.
 *
 * @param mixed  $value Field value.
 * @param array<string, mixed> $field Field definition.
 * @param string $input Input name.
 * @return bool
 */
function acf_validate_value( $value, $field, $input ) {}

/**
 * Return a registered ACF field type.
 *
 * @param string $name Field type name.
 * @return object|false
 */
function acf_get_field_type( $name ) {}
