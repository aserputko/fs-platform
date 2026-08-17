import { DomainValidationError } from '../../common/errors/domain-validation.error';
import { NewUser, User, type UserProps, normalizeEmail } from './user.model';

const props: UserProps = {
  id: 'user-1',
  email: 'ada@example.com',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
  displayName: 'Ada Lovelace',
  role: 'USER',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});

describe('NewUser.create', () => {
  const validProps = { email: 'Ada@Example.com', passwordHash: props.passwordHash };

  it('normalizes the email', () => {
    expect(NewUser.create(validProps).email).toBe('ada@example.com');
  });

  it('trims the display name and drops blank ones', () => {
    expect(NewUser.create({ ...validProps, displayName: '  Ada  ' }).displayName).toBe('Ada');
    expect(NewUser.create({ ...validProps, displayName: '   ' }).displayName).toBeUndefined();
  });

  it.each(['not-an-email', '', 'a@b', `${'a'.repeat(250)}@example.com`])(
    'rejects the invalid email %p',
    (email) => {
      expect(() => NewUser.create({ ...validProps, email })).toThrow(DomainValidationError);
    },
  );

  it('rejects a display name over 120 characters', () => {
    expect(() => NewUser.create({ ...validProps, displayName: 'x'.repeat(121) })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects a password that was not hashed', () => {
    expect(() => NewUser.create({ ...validProps, passwordHash: 'plaintext' })).toThrow(
      DomainValidationError,
    );
  });
});

describe('User', () => {
  it('builds an entity from persisted props', () => {
    const user = User.fromProps(props);

    expect(user.id).toBe('user-1');
    expect(user.passwordHash).toBe(props.passwordHash);
    expect(user.isAdmin).toBe(false);
    expect(user.canAuthenticate()).toBe(true);
  });

  it('recognises admins', () => {
    expect(User.fromProps({ ...props, role: 'ADMIN' }).isAdmin).toBe(true);
  });

  it('cannot authenticate when deactivated', () => {
    expect(User.fromProps({ ...props, isActive: false }).canAuthenticate()).toBe(false);
  });
});
