import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders the blocks, opens object refs, and never inserts HTML', async () => {
    const onRef = vi.fn();
    const { container } = render(
      <Markdown
        source={[
          '# Title',
          'See [the finding](finding:01J) and [docs](https://x.test).',
          '[bad](javascript:alert(1)) <script>alert(1)</script>',
          '- a',
          '- b',
        ].join('\n')}
        onRef={onRef}
      />,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Title');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'the finding' }));
    expect(onRef).toHaveBeenCalledWith('finding:01J');
  });

  it('keeps an object-ref link as text without a handler', () => {
    render(<Markdown source="See [it](finding:01J)." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('it')).toBeInTheDocument();
  });
});
