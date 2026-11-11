<?php
/**
 * Lightweight request validator — the PHP counterpart to the original zod
 * schemas. Returns a cleaned/typed associative array, or throws a
 * ValidationError whose details[] matches { field, message } exactly so the
 * frontend renders the same messages.
 *
 * Rule keys per field:
 *   type      string|int|number|bool|enum|email|date
 *   required  bool                (ignored when $partial = true)
 *   nullable  bool                (an explicit null is allowed through)
 *   trim      bool                (strings)
 *   min,max   number              (numeric bound, or string length for strings)
 *   values    array               (enum members)
 *   regex     string              (custom pattern) + regex_msg
 *   default   mixed               (applied when absent and not partial)
 *   positive  bool                (number > 0)
 *   message   string              (override the "required" message)
 */
function validate($input, array $rules, $partial = false) {
    if (!is_array($input)) $input = [];
    $out = [];
    $errors = [];

    foreach ($rules as $field => $r) {
        $present = array_key_exists($field, $input);
        $val = $present ? $input[$field] : null;

        // Absent or explicit null
        if (!$present || $val === null || (is_string($val) && ($r['trim'] ?? false) && trim($val) === '' && ($r['type'] ?? '') !== 'string')) {
            if (!$partial && !empty($r['required'])) {
                $errors[] = ['field' => $field, 'message' => $r['message'] ?? "$field is required"];
            } elseif (!$partial && array_key_exists('default', $r)) {
                $out[$field] = $r['default'];
            } elseif ($present && $val === null && !empty($r['nullable'])) {
                $out[$field] = null;
            }
            continue;
        }

        $type = $r['type'] ?? 'string';

        switch ($type) {
            case 'string':
                $s = is_scalar($val) ? (string) $val : '';
                if ($r['trim'] ?? false) $s = trim($s);
                if ($s === '' && empty($r['required']) && !$partial && !array_key_exists('default', $r)) {
                    // optional empty string -> skip (treated as not provided)
                    if (!empty($r['nullable'])) $out[$field] = null;
                    break;
                }
                if (isset($r['min']) && mb_strlen($s) < $r['min']) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? "Must be at least {$r['min']} characters"];
                    break;
                }
                if (isset($r['max']) && mb_strlen($s) > $r['max']) {
                    $errors[] = ['field' => $field, 'message' => "Must be at most {$r['max']} characters"];
                    break;
                }
                if (isset($r['regex']) && !preg_match($r['regex'], $s)) {
                    $errors[] = ['field' => $field, 'message' => $r['regex_msg'] ?? 'Invalid format'];
                    break;
                }
                $out[$field] = $s;
                break;

            case 'int':
            case 'number':
                if (!is_numeric($val)) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? 'Must be a number'];
                    break;
                }
                $n = $type === 'int' ? (int) $val : (float) $val;
                if (!empty($r['positive']) && $n <= 0) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? 'Must be greater than 0'];
                    break;
                }
                if (isset($r['min']) && $n < $r['min']) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? "Must be at least {$r['min']}"];
                    break;
                }
                if (isset($r['max']) && $n > $r['max']) {
                    $errors[] = ['field' => $field, 'message' => "Must be at most {$r['max']}"];
                    break;
                }
                $out[$field] = $n;
                break;

            case 'bool':
                $out[$field] = filter_var($val, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($out[$field] === null) $out[$field] = (bool) $val;
                break;

            case 'enum':
                if (!in_array($val, $r['values'], true) && !in_array((string) $val, $r['values'], true)) {
                    $allowed = implode(', ', $r['values']);
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? "Must be one of: $allowed"];
                    break;
                }
                $out[$field] = (string) $val;
                break;

            case 'email':
                $s = trim((string) $val);
                if ($s === '') { if (!empty($r['nullable'])) $out[$field] = null; break; }
                if (!filter_var($s, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? 'Invalid email'];
                    break;
                }
                $out[$field] = $s;
                break;

            case 'date':
                $s = trim((string) $val);
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
                    $errors[] = ['field' => $field, 'message' => $r['message'] ?? 'Date must be YYYY-MM-DD'];
                    break;
                }
                $out[$field] = $s;
                break;
        }
    }

    if ($errors) throw new ValidationError($errors);
    return $out;
}
