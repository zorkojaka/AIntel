import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  test('renders label and input', () => {
    render(<Input label="Ime" id="ime" />);
    expect(screen.getByLabelText(/ime/i)).toBeInTheDocument();
  });
});
