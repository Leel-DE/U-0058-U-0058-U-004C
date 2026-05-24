import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Nothing" description="Add something" />);
    expect(screen.getByText('Nothing')).toBeInTheDocument();
    expect(screen.getByText('Add something')).toBeInTheDocument();
  });
  it('renders action', () => {
    render(<EmptyState title="X" action={<button>Add</button>} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
