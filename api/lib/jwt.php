<?php
/** Minimal, dependency-free HS256 JSON Web Tokens (encode + verify). */

class JwtExpired extends Exception {}
class JwtInvalid extends Exception {}

function b64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function b64url_decode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_encode(array $payload, $secret) {
    $header = b64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body   = b64url_encode(json_encode($payload));
    $sig    = b64url_encode(hash_hmac('sha256', "$header.$body", $secret, true));
    return "$header.$body.$sig";
}

function jwt_decode($token, $secret) {
    $parts = explode('.', (string) $token);
    if (count($parts) !== 3) throw new JwtInvalid('Malformed token');
    [$header, $body, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', "$header.$body", $secret, true));
    if (!hash_equals($expected, $sig)) throw new JwtInvalid('Bad signature');
    $payload = json_decode(b64url_decode($body), true);
    if (!is_array($payload)) throw new JwtInvalid('Bad payload');
    if (isset($payload['exp']) && time() >= (int) $payload['exp']) throw new JwtExpired('Expired');
    return $payload;
}
