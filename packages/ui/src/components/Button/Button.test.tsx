import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  test('renders primary button', () => {
    render(<Button>klikni</Button>);
    expect(screen.getByRole('button', { name: /klikni/i })).toHaveClass('aintel-button--primary');
  });
});
