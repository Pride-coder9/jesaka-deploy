<?php
/** JSON output + typed HTTP errors (mirrors the Express error contract). */

function json_out($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** { error: message, ...extra } — matches what the frontend reads. */
function error_out($message, $status = 400, array $extra = []) {
    json_out(array_merge(['error' => $message], $extra), $status);
}

/** Thrown from route/service code; caught by the front controller. */
class HttpError extends Exception {
    public $status;
    public function __construct($status, $message) {
        parent::__construct($message);
        $this->status = $status;
    }
}

function http_error($status, $message) { return new HttpError($status, $message); }

/** Validation failures carry a details[] list of { field, message }. */
class ValidationError extends Exception {
    public $details;
    public function __construct(array $details) {
        $this->details = $details;
        parent::__construct('Validation failed');
    }
}
