<?php

namespace App\Exceptions;

class InsufficientStockException extends DomainRuleException
{
    public function __construct(string $message, array $errors = [])
    {
        parent::__construct($message, $errors, 422);
    }
}
