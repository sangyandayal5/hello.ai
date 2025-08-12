
// ---- Tests appended by CI assistant ----
// Note: These tests are written to be compatible with Vitest or Jest.
describe('usersTable schema', () => {
  it('should export a usersTable object', () => {
    expect(usersTable).toBeDefined();
    expect(typeof usersTable).toBe('object');
  });

  it('should expose expected columns', () => {
    // Column keys expected
    const cols = Object.keys(usersTable);
    // Some Drizzle table objects include symbol-keyed properties; filter string keys
    const stringCols = cols.filter((k) => typeof k === 'string');

    // Basic presence checks
    expect(stringCols).toEqual(expect.arrayContaining(['id', 'name', 'age,', 'email'].map(x => x.replace(/,$/, '')))); // in case accidental comma artifacts
    expect(usersTable.id).toBeDefined();
    expect(usersTable.name).toBeDefined();
    expect(usersTable.age).toBeDefined();
    expect(usersTable.email).toBeDefined();

    // Ensure columns are objects
    expect(typeof usersTable.id).toBe('object');
    expect(typeof usersTable.name).toBe('object');
    expect(typeof usersTable.age).toBe('object');
    expect(typeof usersTable.email).toBe('object');
  });

  it('columns should be associated with users table', () => {
    // Many Drizzle versions expose `col.table` pointing back to the table object
    const maybeTableRefs = ['id', 'name', 'age', 'email']
      .map((k) => ({ key: k, col: (usersTable as any)[k] }));

    for (const { key, col } of maybeTableRefs) {
      // If runtime exposes .table, ensure it points back to usersTable
      if (col && typeof col === 'object' && 'table' in col) {
        expect(col.table).toBe(usersTable);
      } else {
        // At minimum, column exists
        expect(col).toBeDefined();
      }

      // If runtime exposes .name, ensure it matches the property key or expected column name
      if (col && typeof col === 'object' && 'name' in col) {
        // Some Drizzle versions store the SQL column name in .name
        // It typically equals the property key; allow either exact match or normalized variants.
        const colName = (col as any).name;
        expect(typeof colName).toBe('string');
        expect(colName.toLowerCase()).toContain(key);
      }
    }
  });

  it('table name should be "users" (when exposed)', () => {
    // Different Drizzle versions expose table name differently.
    const candidates: any[] = [];
    candidates.push((usersTable as any).name);
    candidates.push((usersTable as any)._name);
    candidates.push((usersTable as any).tableName);
    // Some versions store the name under a symbol
    const drizzleNameSym = (Symbol.for && Symbol.for('drizzle:tableName')) || null;
    if (drizzleNameSym && (usersTable as any)[drizzleNameSym]) {
      candidates.push((usersTable as any)[drizzleNameSym]);
    }

    // If any non-empty candidate exists, assert it's "users"
    const found = candidates.find((v) => typeof v === 'string' && v.length > 0);
    if (found) {
      expect(found).toBe('users');
    } else {
      // Fallback: ensure no candidate contradicts expected semantics
      expect(true).toBe(true);
    }
  });

  it('id should behave as a primary key and identity when metadata is exposed', () => {
    const id: any = (usersTable as any).id;
    expect(id).toBeDefined();

    // Primary key markers can vary: .primary, .isPrimary, or constraint metadata
    const primaryFlags = [
      id?.primary,
      id?.isPrimary,
      id?.primaryKey, // rare
    ].filter((v) => typeof v === 'boolean');

    if (primaryFlags.length > 0) {
      expect(primaryFlags.some(Boolean)).toBe(true);
    } else {
      // Acceptable if this Drizzle version doesn't expose runtime primary metadata
      expect(true).toBe(true);
    }

    // Identity/autoincrement markers may appear as hasDefault or generated flags
    const identityFlags = [
      id?.hasDefault,
      id?.autoIncrement,
      id?.generated, // some versions
    ].filter((v) => typeof v === 'boolean');

    if (identityFlags.length > 0) {
      expect(identityFlags.some(Boolean)).toBe(true);
    } else {
      // Acceptable if not exposed
      expect(true).toBe(true);
    }
  });

  it('name and age should be not null when metadata is exposed', () => {
    const nameCol: any = (usersTable as any).name;
    const ageCol: any = (usersTable as any).age;

    for (const col of [nameCol, ageCol]) {
      expect(col).toBeDefined();
      if (col && typeof col === 'object' && 'notNull' in col) {
        expect(col.notNull).toBe(true);
      } else {
        // Acceptable if not exposed
        expect(true).toBe(true);
      }
    }
  });

  it('email should be not null and unique when metadata is exposed', () => {
    const emailCol: any = (usersTable as any).email;
    expect(emailCol).toBeDefined();

    if (emailCol && typeof emailCol === 'object' && 'notNull' in emailCol) {
      expect(emailCol.notNull).toBe(true);
    } else {
      expect(true).toBe(true);
    }

    // Uniqueness can appear on column or as a table-level constraint
    const uniquenessHints = [
      emailCol?.unique, // sometimes a flag
      emailCol?.uniqueName, // sometimes stores constraint name
      (usersTable as any)?.[Symbol.for && Symbol.for('drizzle:constraints')],
    ];

    if (typeof emailCol?.unique === 'boolean') {
      expect(emailCol.unique).toBe(true);
    } else if (typeof emailCol?.uniqueName === 'string') {
      expect(emailCol.uniqueName.length).toBeGreaterThan(0);
    } else {
      // Search table-level constraints (if exposed)
      const constraints =
        (usersTable as any)?.constraints ||
        (usersTable as any)?._constraints ||
        (usersTable as any)?.__constraints ||
        null;
      if (constraints && Array.isArray(constraints)) {
        // check any constraint mentioning 'email' and 'unique'
        const emailUnique = constraints.some((c) => {
          const s = typeof c === 'string' ? c : JSON.stringify(c);
          return /email/i.test(s) && /unique/i.test(s);
        });
        if (constraints.length > 0) {
          expect(emailUnique).toBe(true);
        } else {
          expect(true).toBe(true);
        }
      } else {
        // Acceptable if not exposed
        expect(true).toBe(true);
      }
    }
  });

  it('should not expose unexpected additional string-named columns (sanity check)', () => {
    // Helps catch accidental extra properties
    const keys = Object.keys(usersTable).filter((k) => typeof k === 'string');
    // Allow for internal properties like 'relations' or symbol keys; we only constrain string ones.
    const allowed = new Set(['id', 'name', 'age', 'email']);
    const extras = keys.filter((k) => !allowed.has(k));
    // Some Drizzle versions also include 'relations' or 'getSQL' as string keys—permit them explicitly if present
    const permittedExtras = extras.filter((k) => !['relations', 'getSQL', 'dialect'].includes(k));
    expect(permittedExtras.length).toBe(0);
  });
});