import { DomainValidationError } from '../../common/errors/domain-validation.error';
import {
  DESCRIPTION_MAX_LENGTH,
  NewProject,
  Project,
  ProjectPatch,
  TITLE_MAX_LENGTH,
  assertValidDescription,
  assertValidTitle,
  normalizeTitle,
} from './project.model';

describe('project domain', () => {
  describe('assertValidTitle', () => {
    it('trims surrounding whitespace', () => {
      expect(assertValidTitle('  Apollo  ')).toBe('Apollo');
    });

    it('rejects an empty or whitespace-only title', () => {
      expect(() => assertValidTitle('   ')).toThrow(DomainValidationError);
    });

    it('accepts a title at the length limit', () => {
      const title = 'a'.repeat(TITLE_MAX_LENGTH);

      expect(assertValidTitle(title)).toBe(title);
    });

    it('rejects a title over the length limit', () => {
      expect(() => assertValidTitle('a'.repeat(TITLE_MAX_LENGTH + 1))).toThrow(
        DomainValidationError,
      );
    });
  });

  describe('assertValidDescription', () => {
    it('passes undefined through', () => {
      expect(assertValidDescription(undefined)).toBeUndefined();
    });

    it('treats a blank description as absent', () => {
      expect(assertValidDescription('   ')).toBeUndefined();
    });

    it('accepts a description at the length limit', () => {
      const description = 'a'.repeat(DESCRIPTION_MAX_LENGTH);

      expect(assertValidDescription(description)).toBe(description);
    });

    it('rejects a description over the length limit', () => {
      expect(() => assertValidDescription('a'.repeat(DESCRIPTION_MAX_LENGTH + 1))).toThrow(
        DomainValidationError,
      );
    });
  });

  describe('normalizeTitle', () => {
    it('only trims, preserving inner spacing and case', () => {
      expect(normalizeTitle('  Apollo  Program ')).toBe('Apollo  Program');
    });
  });

  describe('NewProject.create', () => {
    it('normalizes every field', () => {
      const project = NewProject.create({
        userId: 'user-1',
        title: '  Apollo ',
        description: '  Moon landing ',
      });

      expect(project).toEqual({
        userId: 'user-1',
        title: 'Apollo',
        description: 'Moon landing',
      });
    });

    it('rejects a project with no owner', () => {
      expect(() => NewProject.create({ userId: '  ', title: 'Apollo' })).toThrow(
        DomainValidationError,
      );
    });
  });

  describe('ProjectPatch.create', () => {
    it('rejects an empty patch', () => {
      expect(() => ProjectPatch.create({})).toThrow(DomainValidationError);
    });

    it('leaves an omitted field undefined so the column is untouched', () => {
      const patch = ProjectPatch.create({ title: 'Renamed' });

      expect(patch.title).toBe('Renamed');
      expect(patch.description).toBeUndefined();
    });

    it('maps an explicit null to a cleared description', () => {
      const patch = ProjectPatch.create({ description: null });

      expect(patch.title).toBeUndefined();
      expect(patch.description).toBeNull();
    });

    it('maps a blank description to a cleared description', () => {
      expect(ProjectPatch.create({ description: '   ' }).description).toBeNull();
    });

    it('validates the title it is given', () => {
      expect(() => ProjectPatch.create({ title: '' })).toThrow(DomainValidationError);
    });
  });

  describe('Project.isOwnedBy', () => {
    const project = Project.fromProps({
      id: 'project-1',
      userId: 'user-1',
      title: 'Apollo',
      description: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    it('recognizes the owner', () => {
      expect(project.isOwnedBy('user-1')).toBe(true);
    });

    it('rejects everyone else', () => {
      expect(project.isOwnedBy('user-2')).toBe(false);
    });
  });
});
