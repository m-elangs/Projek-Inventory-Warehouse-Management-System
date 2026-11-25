<?php

namespace App\Exceptions;

use RuntimeException;

class DomainRuleException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly array $errors = [],
        public readonly int $httpStatus = 422
    ) {
        parent::__construct($message);
    }
}
