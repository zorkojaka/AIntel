import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  test('renders title and body', () => {
    render(<Card title="Glava">vsebina</Card>);
    expect(screen.getByText(/Glava/)).toBeInTheDocument();
    expect(screen.getByText(/vsebina/)).toBeInTheDocument();
  });
});
