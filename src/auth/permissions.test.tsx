import { render, screen } from '@testing-library/react';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { me as meFixture } from '../api/testing/fixtures';
import { can } from './permissions';
import { RequirePermission } from './RequirePermission';

function store(value: Me | null): PrincipalStore {
  return { get: () => value, subscribe: () => () => {}, load: async () => {}, clear: () => {} };
}

describe('can', () => {
  it('is true only for a held permission', () => {
    expect(can(['self.alerts', 'data.read'], 'self.alerts')).toBe(true);
    expect(can(['data.read'], 'self.alerts')).toBe(false);
    expect(can([], 'self.alerts')).toBe(false);
  });
});

describe('RequirePermission', () => {
  const renderWith = (perms: string[] | null) => {
    const value = perms === null ? null : meFixture({ permissions: perms });
    render(
      <PrincipalStoreContext.Provider value={store(value)}>
        <RequirePermission permission="self.alerts" fallback={<span>denied</span>}>
          <button type="button">Acknowledge</button>
        </RequirePermission>
      </PrincipalStoreContext.Provider>,
    );
  };

  it('renders children for a permitted principal', () => {
    renderWith(['self.alerts']);
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  });

  it('renders the fallback for a refused principal', () => {
    renderWith(['data.read']);
    expect(screen.getByText('denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });

  it('renders the fallback for an anonymous visitor', () => {
    renderWith(null);
    expect(screen.getByText('denied')).toBeInTheDocument();
  });
});
